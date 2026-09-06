const express = require('express');
const pool = require('../db');
const { deleteMessage } = require('../storage/telegram');

const router = express.Router();
const MAX_RETRIES = 3;

function requireCronSecret(req, res, next) {
  const header = req.headers.authorization;
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || header !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ---- Recover jobs stuck in CLAIMED/PRINTING because the agent crashed ----
router.get('/cron/recover-stale-jobs', requireCronSecret, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE jobs
       SET status = CASE WHEN retry_count >= $1 THEN 'FAILED_PERMANENT' ELSE 'QUEUED' END,
           retry_count = retry_count + 1,
           claimed_by_agent = NULL,
           claim_expires_at = NULL
       WHERE status IN ('CLAIMED', 'PRINTING') AND claim_expires_at < now()
       RETURNING id, status`,
      [MAX_RETRIES]
    );
    res.json({ recovered: result.rows.length, jobs: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Recovery job failed' });
  }
});

// ---- Purge expired files from Telegram (job history rows are kept) ----
router.get('/cron/cleanup-expired-files', requireCronSecret, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, telegram_message_id FROM files
       WHERE expires_at < now() AND purged_at IS NULL
         AND storage_provider = 'TELEGRAM' AND telegram_message_id IS NOT NULL`
    );

    let purgedCount = 0;
    for (const file of result.rows) {
      await deleteMessage(file.telegram_message_id);
      await pool.query('UPDATE files SET purged_at = now(), telegram_file_id = NULL WHERE id = $1', [file.id]);
      purgedCount += 1;
    }

    res.json({ purged: purgedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cleanup job failed' });
  }
});

module.exports = router;
