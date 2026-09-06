const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const pool = require('../db');
const { uploadFile: uploadToTelegram, deleteMessage } = require('../storage/telegram');

const router = express.Router();

const MAX_SIZE_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }

    cb(null, true);
  },
});

async function getPageCount(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
    });

    return pdfDoc.getPageCount();
  }

  return 1;
}

router.post('/', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File exceeds 4 MB limit',
        });
      }

      if (err.message === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(400).json({
          error: 'Only PDF, JPG, and PNG files are allowed',
        });
      }

      console.error(err);
      return res.status(400).json({
        error: 'Upload failed',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file provided',
      });
    }

    const { shopCode } = req.body;

    if (!shopCode) {
      return res.status(400).json({
        error: 'shopCode is required',
      });
    }

    let telegramMessageId = null;

    try {
      const shopResult = await pool.query(
        'SELECT id FROM shops WHERE shop_code = $1',
        [shopCode.toUpperCase()]
      );

      if (shopResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Shop not found',
        });
      }

      const shopId = shopResult.rows[0].id;

      let pageCount;

      try {
        pageCount = await getPageCount(
          req.file.buffer,
          req.file.mimetype
        );
      } catch (pdfErr) {
        console.error(pdfErr);

        return res.status(400).json({
          error: 'Could not read PDF file — it may be corrupted or password-protected',
        });
      }

      const telegramFile = await uploadToTelegram({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        caption: `1-Hub Print | ${shopCode.toUpperCase()} | ${req.file.originalname}`,
      });

      telegramMessageId = telegramFile.messageId;

      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      );

      const insertResult = await pool.query(
        `INSERT INTO files (
          shop_id,
          original_name,
          storage_path,
          size_bytes,
          mime_type,
          page_count,
          expires_at,
          storage_provider,
          telegram_chat_id,
          telegram_message_id,
          telegram_file_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
        RETURNING
          id,
          original_name,
          size_bytes,
          mime_type,
          page_count,
          expires_at`,
        [
          shopId,
          req.file.originalname,
          null,
          req.file.size,
          req.file.mimetype,
          pageCount,
          expiresAt,
          'TELEGRAM',
          telegramFile.chatId,
          telegramFile.messageId,
          telegramFile.fileId,
        ]
      );

      const file = insertResult.rows[0];

      return res.status(201).json({
        id: file.id,
        originalName: file.original_name,
        sizeBytes: file.size_bytes,
        mimeType: file.mime_type,
        pageCount: file.page_count,
        expiresAt: file.expires_at,
        storageProvider: 'TELEGRAM',
      });
    } catch (err) {
      console.error(err);

      if (telegramMessageId) {
        await deleteMessage(telegramMessageId);
      }

      return res.status(500).json({
        error: 'Upload failed',
      });
    }
  });
});

module.exports = router;
