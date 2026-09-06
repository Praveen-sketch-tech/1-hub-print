const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

async function getOwnedShop(userId) {
  const result = await pool.query('SELECT id, name, shop_code FROM shops WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.userId);
    if (!shop) return res.status(404).json({ error: 'Shop not found for this account' });

    const result = await pool.query(
      'SELECT status, COUNT(*) AS count FROM jobs WHERE shop_id = $1 GROUP BY status',
      [shop.id]
    );

    const counts = {};
    for (const row of result.rows) counts[row.status] = parseInt(row.count, 10);

    res.json({
      pending: (counts.QUEUED || 0) + (counts.CLAIMED || 0),
      printing: counts.PRINTING || 0,
      completed: counts.COMPLETED || 0,
      failed: (counts.FAILED || 0) + (counts.FAILED_PERMANENT || 0),
      cancelled: counts.CANCELLED || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/jobs', requireAuth, async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.userId);
    if (!shop) return res.status(404).json({ error: 'Shop not found for this account' });

    const { status } = req.query;
    const params = [shop.id];
    let query = `
      SELECT j.id, j.status, j.price, j.copies, j.color_mode, j.paper_size,
             j.page_range, j.duplex, j.retry_count, j.created_at, f.original_name
      FROM jobs j
      JOIN files f ON f.id = j.file_id
      WHERE j.shop_id = $1
    `;
    if (status) {
      params.push(status);
      query += ` AND j.status = $2`;
    }
    query += ' ORDER BY j.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.post('/jobs/:jobId/retry', requireAuth, async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.userId);
    if (!shop) return res.status(404).json({ error: 'Shop not found for this account' });

    const result = await pool.query(
      `UPDATE jobs
       SET status = 'QUEUED', retry_count = retry_count + 1, claimed_by_agent = NULL, claim_expires_at = NULL
       WHERE id = $1 AND shop_id = $2 AND status = 'FAILED'
       RETURNING id, status, retry_count`,
      [req.params.jobId, shop.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Job not found or not in a retryable state' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

router.post('/jobs/:jobId/cancel', requireAuth, async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.userId);
    if (!shop) return res.status(404).json({ error: 'Shop not found for this account' });

    const result = await pool.query(
      `UPDATE jobs SET status = 'CANCELLED'
       WHERE id = $1 AND shop_id = $2 AND status = 'QUEUED'
       RETURNING id, status`,
      [req.params.jobId, shop.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Job not found or cannot be cancelled (already claimed/printing)' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

router.get('/qr', requireAuth, async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.userId);
    if (!shop) return res.status(404).json({ error: 'Shop not found for this account' });

    const customerUrl = `${getBaseUrl()}/p/?shop=${shop.shop_code}`;
    const qrDataUrl = await QRCode.toDataURL(customerUrl, { width: 320, margin: 2 });

    res.json({ shopCode: shop.shop_code, customerUrl, qrDataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ---- Agent pairing code generation (dashboard side) ----
router.post('/agent/pairing-code', requireAuth, async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.userId);
    if (!shop) return res.status(404).json({ error: 'Shop not found for this account' });

    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO agents (shop_id, pairing_code, pairing_code_expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, pairing_code, pairing_code_expires_at`,
      [shop.id, code, expiresAt]
    );

    res.status(201).json({
      agentRowId: result.rows[0].id,
      pairingCode: result.rows[0].pairing_code,
      expiresAt: result.rows[0].pairing_code_expires_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

// ---- List paired agents + their printers + online status ----
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.userId);
    if (!shop) return res.status(404).json({ error: 'Shop not found for this account' });

    const result = await pool.query(
      `SELECT a.id, a.name, a.paired_at, a.last_heartbeat_at,
              (a.last_heartbeat_at > now() - interval '2 minutes') AS online,
              COALESCE(
                json_agg(json_build_object('id', p.id, 'name', p.name, 'isDefault', p.is_default))
                  FILTER (WHERE p.id IS NOT NULL),
                '[]'
              ) AS printers
       FROM agents a
       LEFT JOIN printers p ON p.agent_id = a.id
       WHERE a.shop_id = $1 AND a.token_hash IS NOT NULL
       GROUP BY a.id
       ORDER BY a.paired_at DESC`,
      [shop.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

module.exports = router;
