const express = require('express');
const { randomBytes } = require('crypto');
const { z } = require('zod');
const pool = require('../db');

const router = express.Router();

function parsePageRange(pageRangeStr, totalPages) {
  if (!pageRangeStr || pageRangeStr.trim() === '') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set();
  const parts = pageRangeStr.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        throw new Error(`Invalid page range segment: "${part}"`);
      }
      if (end > totalPages) {
        throw new Error(`Page range "${part}" exceeds document's ${totalPages} pages`);
      }
      for (let p = start; p <= end; p++) pages.add(p);
    } else {
      const page = parseInt(part, 10);
      if (!Number.isInteger(page) || page < 1) {
        throw new Error(`Invalid page number: "${part}"`);
      }
      if (page > totalPages) {
        throw new Error(`Page ${page} exceeds document's ${totalPages} pages`);
      }
      pages.add(page);
    }
  }

  if (pages.size === 0) {
    throw new Error('Page range resolved to zero pages');
  }

  return Array.from(pages);
}

const createJobSchema = z.object({
  fileId: z.string().uuid(),
  shopCode: z.string().min(1),
  copies: z.number().int().min(1).default(1),
  colorMode: z.enum(['BW', 'COLOR']),
  paperSize: z.enum(['A4', 'A3']),
  pageRange: z.string().optional(),
  duplex: z.boolean().default(false),
});

router.post('/', async (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const { fileId, shopCode, copies, colorMode, paperSize, pageRange, duplex } = parsed.data;

  try {
    const shopResult = await pool.query('SELECT id FROM shops WHERE shop_code = $1', [
      shopCode.toUpperCase(),
    ]);
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    const shopId = shopResult.rows[0].id;

    const fileResult = await pool.query(
      'SELECT id, page_count, expires_at, shop_id FROM files WHERE id = $1',
      [fileId]
    );
    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    const file = fileResult.rows[0];

    if (file.shop_id !== shopId) {
      return res.status(400).json({ error: 'File does not belong to this shop' });
    }
    if (new Date(file.expires_at) < new Date()) {
      return res.status(410).json({ error: 'File has expired, please upload again' });
    }

    let pagesToPrint;
    try {
      pagesToPrint = parsePageRange(pageRange, file.page_count);
    } catch (rangeErr) {
      return res.status(400).json({ error: rangeErr.message });
    }

    const pricingResult = await pool.query(
      `SELECT price_per_page FROM shop_pricing
       WHERE shop_id = $1 AND paper_size = $2 AND color_mode = $3 AND duplex = $4`,
      [shopId, paperSize, colorMode, duplex]
    );
    if (pricingResult.rows.length === 0) {
      return res.status(400).json({ error: 'Pricing not configured for this combination at this shop' });
    }
    const pricePerPage = parseFloat(pricingResult.rows[0].price_per_page);
    const price = (pagesToPrint.length * copies * pricePerPage).toFixed(2);
    const customerToken = randomBytes(16).toString('hex');

    const jobResult = await pool.query(
      `INSERT INTO jobs (file_id, shop_id, customer_token, copies, color_mode, paper_size, page_range, duplex, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, status, price, created_at`,
      [fileId, shopId, customerToken, copies, colorMode, paperSize, pageRange || null, duplex, price]
    );
    const job = jobResult.rows[0];

    res.status(201).json({
      jobId: job.id,
      customerToken,
      trackingUrl: `/job/${job.id}/${customerToken}`,
      status: job.status,
      price: job.price,
      pagesToPrint: pagesToPrint.length,
      createdAt: job.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

router.get('/:jobId/:customerToken', async (req, res) => {
  const { jobId, customerToken } = req.params;
  try {
    const result = await pool.query(
      `SELECT j.id, j.status, j.price, j.copies, j.color_mode, j.paper_size, j.page_range, j.duplex,
              j.created_at, j.updated_at, f.original_name
       FROM jobs j
       JOIN files f ON f.id = j.file_id
       WHERE j.id = $1 AND j.customer_token = $2`,
      [jobId, customerToken]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

module.exports = router;
