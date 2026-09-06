const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

const CLAIM_DURATION_MINUTES = 5;
const MAX_RETRIES = 3;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requireAgentAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  const tokenHash = hashToken(token);

  try {
    const result = await pool.query('SELECT id, shop_id, name FROM agents WHERE token_hash = $1', [tokenHash]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid agent token' });
    }
    req.agent = result.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Agent authentication failed' });
  }
}

// ---- Register (pair) an agent using a pairing code from the shop dashboard ----
router.post('/register', async (req, res) => {
  const { pairingCode, agentName } = req.body;
  if (!pairingCode) {
    return res.status(400).json({ error: 'pairingCode is required' });
  }

  try {
    const agentResult = await pool.query(
      `SELECT id, shop_id FROM agents
       WHERE pairing_code = $1 AND pairing_code_expires_at > now() AND token_hash IS NULL`,
      [pairingCode.toUpperCase()]
    );

    if (agentResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired pairing code' });
    }

    const agent = agentResult.rows[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await pool.query(
      `UPDATE agents
       SET token_hash = $1, paired_at = now(), last_heartbeat_at = now(),
           pairing_code = NULL, pairing_code_expires_at = NULL,
           name = COALESCE($2, name)
       WHERE id = $3`,
      [tokenHash, agentName || null, agent.id]
    );

    res.status(201).json({
      agentId: agent.id,
      agentToken: rawToken,
      message: 'Save this token securely — it will not be shown again.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register agent' });
  }
});

// ---- Heartbeat ----
router.post('/heartbeat', requireAgentAuth, async (req, res) => {
  try {
    await pool.query('UPDATE agents SET last_heartbeat_at = now() WHERE id = $1', [req.agent.id]);
    res.json({ ok: true, serverTime: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

// ---- Sync printer list ----
router.post('/printers', requireAgentAuth, async (req, res) => {
  const { printers } = req.body;
  if (!Array.isArray(printers)) {
    return res.status(400).json({ error: 'printers must be an array' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM printers WHERE agent_id = $1', [req.agent.id]);
    for (const p of printers) {
      if (!p.name) continue;
      await client.query(
        'INSERT INTO printers (agent_id, name, is_default) VALUES ($1, $2, $3)',
        [req.agent.id, p.name, !!p.isDefault]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: printers.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to sync printers' });
  } finally {
    client.release();
  }
});

// ---- Claim next job (atomic — FOR UPDATE SKIP LOCKED prevents double-claim) ----
router.get('/jobs/next', requireAgentAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH next_job AS (
         SELECT id FROM jobs
         WHERE shop_id = $1 AND status = 'QUEUED'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE jobs
       SET status = 'CLAIMED', claimed_by_agent = $2,
           claim_expires_at = now() + interval '${CLAIM_DURATION_MINUTES} minutes'
       WHERE id = (SELECT id FROM next_job)
       RETURNING id, file_id, copies, color_mode, paper_size, page_range, duplex, price`,
      [req.agent.shop_id, req.agent.id]
    );

    if (result.rows.length === 0) {
      return res.status(204).send();
    }

    const job = result.rows[0];
    res.json({
      jobId: job.id,
      fileId: job.file_id,
      downloadUrl: `/api/files/${job.file_id}/download`,
      copies: job.copies,
      colorMode: job.color_mode,
      paperSize: job.paper_size,
      pageRange: job.page_range,
      duplex: job.duplex,
      price: job.price,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch next job' });
  }
});

// ---- Mark job as actively printing ----
router.post('/jobs/:jobId/printing', requireAgentAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE jobs SET status = 'PRINTING'
       WHERE id = $1 AND claimed_by_agent = $2 AND status = 'CLAIMED'
       RETURNING id, status`,
      [req.params.jobId, req.agent.id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Job not found or not claimed by this agent' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// ---- Mark job complete ----
router.post('/jobs/:jobId/complete', requireAgentAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE jobs SET status = 'COMPLETED'
       WHERE id = $1 AND claimed_by_agent = $2 AND status IN ('CLAIMED', 'PRINTING')
       RETURNING id, status`,
      [req.params.jobId, req.agent.id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Job not found or not owned by this agent' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

// ---- Mark job failed (auto FAILED_PERMANENT after MAX_RETRIES) ----
router.post('/jobs/:jobId/fail', requireAgentAuth, async (req, res) => {
  const { reason } = req.body;
  try {
    const jobResult = await pool.query(
      `SELECT retry_count FROM jobs WHERE id = $1 AND claimed_by_agent = $2 AND status IN ('CLAIMED', 'PRINTING')`,
      [req.params.jobId, req.agent.id]
    );
    if (jobResult.rows.length === 0) {
      return res.status(400).json({ error: 'Job not found or not owned by this agent' });
    }

    const currentRetries = jobResult.rows[0].retry_count;
    const nextStatus = currentRetries >= MAX_RETRIES ? 'FAILED_PERMANENT' : 'FAILED';

    const result = await pool.query('UPDATE jobs SET status = $1 WHERE id = $2 RETURNING id, status', [
      nextStatus,
      req.params.jobId,
    ]);

    console.error(`Job ${req.params.jobId} failed: ${reason || 'no reason given'}`);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark job as failed' });
  }
});

module.exports = router;
