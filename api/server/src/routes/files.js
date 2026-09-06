const express = require('express');
const pool = require('../db');
const { downloadFile } = require('../storage/telegram');

const router = express.Router();

router.get('/:fileId/download', async (req, res) => {
  const { fileId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, original_name, mime_type, storage_provider, telegram_file_id, expires_at, purged_at
       FROM files WHERE id = $1`,
      [fileId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    const file = result.rows[0];

    if (file.purged_at) {
      return res.status(410).json({ error: 'File has been purged due to retention policy' });
    }

    if (new Date(file.expires_at) < new Date()) {
      return res.status(410).json({ error: 'File has expired' });
    }

    if (file.storage_provider !== 'TELEGRAM' || !file.telegram_file_id) {
      return res.status(500).json({ error: 'File storage record is invalid' });
    }

    const buffer = await downloadFile(file.telegram_file_id);

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

module.exports = router;
