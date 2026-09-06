const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  throw new Error('TG_TOKEN and TG_CHAT_ID environment variables are required');
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

async function uploadFile({ buffer, filename, caption }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid file buffer');
  }

  const message = await bot.sendDocument(
    CHAT_ID,
    buffer,
    { caption: caption || filename },
    {
      filename,
      contentType: getContentType(filename),
    }
  );

  const document = message.document;

  if (!document || !document.file_id) {
    throw new Error('Telegram upload succeeded but file_id is missing');
  }

  return {
    chatId: String(message.chat.id),
    messageId: message.message_id,
    fileId: document.file_id,
    fileUniqueId: document.file_unique_id || null,
  };
}

async function downloadFile(fileId) {
  const fileInfo = await bot.getFile(fileId);
  if (!fileInfo || !fileInfo.file_path) {
    throw new Error('Telegram did not return a file_path for this file_id');
  }

  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Failed to download file from Telegram: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function deleteMessage(messageId) {
  if (!messageId) return;

  try {
    await bot.deleteMessage(CHAT_ID, messageId);
  } catch (err) {
    console.error('Telegram delete failed:', err.message);
  }
}

function getContentType(filename) {
  const lower = String(filename || '').toLowerCase();

  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';

  return 'application/octet-stream';
}

module.exports = {
  uploadFile,
  downloadFile,
  deleteMessage,
};
