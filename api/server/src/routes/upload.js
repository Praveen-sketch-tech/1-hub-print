const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pool = require('../db');

const router = express.Router();

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const uploadDir = path.join(__dirname, '../../../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
});

async function getPageCount(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  }
  return 1;
}

router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds 20 MB limit' });
      }
      if (err.message === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(400).json({ error: 'Only PDF, JPG, and PNG files are allowed' });
      }
      console.error(err);
      return res.status(400).json({ error: 'Upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { shopCode } = req.body;
    if (!shopCode) {
      return res.status(400).json({ error: 'shopCode is required' });
    }

    try {
      const shopResult = await pool.query(
        'SELECT id FROM shops WHERE shop_code = $1',
        [shopCode.toUpperCase()]
      );
      if (shopResult.rows.length === 0) {
        return res.status(404).json({ error: 'Shop not found' });
      }
      const shopId = shopResult.rows[0].id;

      let pageCount;
      try {
        pageCount = await getPageCount(req.file.buffer, req.file.mimetype);
      } catch (pdfErr) {
        console.error(pdfErr);
        return res.status(400).json({
          error: 'Could not read PDF file — it may be corrupted or password-protected',
        });
      }

      const extension =
        req.file.mimetype === 'application/pdf' ? '.pdf'
        : req.file.mimetype === 'image/png' ? '.png'
        : '.jpg';
      const storageFilename = `${randomUUID()}${extension}`;
      fs.writeFileSync(path.join(uploadDir, storageFilename), req.file.buffer);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const insertResult = await pool.query(
        `INSERT INTO files (shop_id, original_name, storage_path, size_bytes, mime_type, page_count, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, original_name, size_bytes, mime_type, page_count`,
        [shopId, req.file.originalname, storageFilename, req.file.size, req.file.mimetype, pageCount, expiresAt]
      );

      const file = insertResult.rows[0];
      res.status(201).json({
        id: file.id,
        originalName: file.original_name,
        sizeBytes: file.size_bytes,
        mimeType: file.mime_type,
        pageCount: file.page_count,
      });
    } catch (dbErr) {
      console.error(dbErr);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

module.exports = router;
