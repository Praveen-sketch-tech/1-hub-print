require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const token = process.env.TG_TOKEN;
const chatId = process.env.TG_CHAT_ID;

console.log('--- Loaded values ---');
console.log('TG_TOKEN present:', !!token);
console.log('TG_TOKEN length:', token ? token.length : 0);
console.log('TG_TOKEN preview:', token ? `${token.slice(0, 8)}...${token.slice(-4)}` : 'MISSING');
console.log('TG_CHAT_ID:', chatId || 'MISSING');
console.log('');

async function main() {
  if (!token) {
    console.log('TG_TOKEN missing from .env — nothing to test.');
    return;
  }

  console.log('--- Testing token with getMe ---');
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meData = await meRes.json();
  console.log('Status:', meRes.status);
  console.log('Response:', JSON.stringify(meData, null, 2));

  if (!meData.ok) {
    console.log('');
    console.log('TOKEN IS INVALID. This confirms the problem is the bot token itself.');
    return;
  }

  console.log('');
  console.log('Token is valid, bot username:', meData.result.username);

  if (!chatId) {
    console.log('TG_CHAT_ID missing — cannot test chat access.');
    return;
  }

  console.log('');
  console.log('--- Testing chat access with getChat ---');
  const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`);
  const chatData = await chatRes.json();
  console.log('Status:', chatRes.status);
  console.log('Response:', JSON.stringify(chatData, null, 2));

  if (!chatData.ok) {
    console.log('');
    console.log('Bot cannot access this chat_id. Bot needs to be added to the chat/group, or you need to message it first (for a private chat).');
  } else {
    console.log('');
    console.log('Bot can access this chat. Everything should work.');
  }
}

main().catch((err) => console.error('Script error:', err));
