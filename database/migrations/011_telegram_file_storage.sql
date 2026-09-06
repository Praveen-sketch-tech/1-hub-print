ALTER TABLE files
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'TELEGRAM',
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_file_id TEXT;

ALTER TABLE files
  ALTER COLUMN storage_path DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_telegram_message
  ON files(telegram_chat_id, telegram_message_id);

CREATE INDEX IF NOT EXISTS idx_files_storage_provider
  ON files(storage_provider);
