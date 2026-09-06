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

module.exports = router;
