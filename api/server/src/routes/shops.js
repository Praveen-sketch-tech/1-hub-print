const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/:shopCode', async (req, res) => {
  const { shopCode } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, name, shop_code FROM shops WHERE shop_code = $1',
      [shopCode.toUpperCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
});

router.get('/:shopCode/pricing', async (req, res) => {
  const { shopCode } = req.params;
  try {
    const shopResult = await pool.query('SELECT id FROM shops WHERE shop_code = $1', [
      shopCode.toUpperCase(),
    ]);
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    const pricingResult = await pool.query(
      'SELECT paper_size, color_mode, duplex, price_per_page FROM shop_pricing WHERE shop_id = $1',
      [shopResult.rows[0].id]
    );
    res.json(
      pricingResult.rows.map((r) => ({
        paperSize: r.paper_size,
        colorMode: r.color_mode,
        duplex: r.duplex,
        pricePerPage: parseFloat(r.price_per_page),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

module.exports = router;
