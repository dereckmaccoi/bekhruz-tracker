import TelegramBot from 'node-telegram-bot-api';
import { computeProjectStatuses, buildStatusMessage } from './lib/notifications.js';

// Guard: bot is null when TELEGRAM_BOT_TOKEN is not configured
let bot = null;

function getAllowedIds() {
  return (process.env.TELEGRAM_ALLOWED_IDS || '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(Boolean);
}

if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

  // /start
  bot.onText(/\/start/, async (msg) => {
    if (!getAllowedIds().includes(msg.from.id)) return;
    await bot.sendMessage(
      msg.chat.id,
      '👋 Welcome to Bekhruz Tracker\n\nUse /status to see current pace, or open the app:',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '📊 Open Tracker', web_app: { url: process.env.BASE_URL } },
          ]],
        },
      }
    );
  });

  // /status
  bot.onText(/\/status/, async (msg) => {
    if (!getAllowedIds().includes(msg.from.id)) return;
    try {
      const statuses = await computeProjectStatuses();
      await bot.sendMessage(msg.chat.id, buildStatusMessage(statuses));
    } catch (e) {
      console.error('/status error:', e.message);
      await bot.sendMessage(msg.chat.id, '⚠️ Could not fetch status. Try again later.');
    }
  });
} else {
  console.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
}

/** Send a message to every user in TELEGRAM_ALLOWED_IDS. */
export async function sendToAll(text, opts = {}) {
  if (!bot) return;
  for (const id of getAllowedIds()) {
    try {
      await bot.sendMessage(id, text, opts);
    } catch (e) {
      console.error(`sendToAll failed for ${id}:`, e.message);
    }
  }
}

/** Called by the Express webhook route to process an incoming update. */
export function handleUpdate(body) {
  if (!bot) return;
  bot.processUpdate(body);
}

/** Register the webhook URL with Telegram. Called once after the server starts. */
export async function setupWebhook() {
  if (!bot) return;
  if (!process.env.BASE_URL || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.warn('setupWebhook: BASE_URL or TELEGRAM_WEBHOOK_SECRET not set — skipping');
    return;
  }
  const url = `${process.env.BASE_URL}/bot/webhook?secret=${process.env.TELEGRAM_WEBHOOK_SECRET}`;
  try {
    await bot.setWebhook(url);
    console.log('Telegram webhook registered:', url);
  } catch (e) {
    console.error('Failed to register webhook:', e.message);
  }
}
