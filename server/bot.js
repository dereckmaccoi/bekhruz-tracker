import TelegramBot from 'node-telegram-bot-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { computeProjectStatuses, buildStatusMessage } from './lib/notifications.js';
import { query } from './lib/db.js';

// Guard: bot is null when TELEGRAM_BOT_TOKEN is not configured
let bot = null;
let gemini = null;

function getAllowedIds() {
  return (process.env.TELEGRAM_ALLOWED_IDS || '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(Boolean);
}

// ── In-memory session state for /log flow ─────────────────────────────────────
// Shape: { step, projectId, projectName, date, metrics, metricIdx, values, periodId, chatId }
const sessions = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDateShort(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${M[d.getMonth()]}`;
}

function fmtDateLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Detect active period from a list (same logic as client)
function detectActivePeriod(periods, forDate) {
  if (!periods.length) return null;
  const d = forDate || new Date().toISOString().slice(0, 10);
  const child = periods.find(p => p.parent_id &&
    p.start_date.slice(0, 10) <= d && p.end_date.slice(0, 10) >= d);
  if (child) return child;
  const active = periods.find(p =>
    p.start_date.slice(0, 10) <= d && p.end_date.slice(0, 10) >= d);
  if (active) return active;
  const past = periods.filter(p => p.end_date.slice(0, 10) < d);
  return past.length > 0 ? past[past.length - 1] : (periods[0] || null);
}

// ── Start /log flow: ask which project ───────────────────────────────────────
async function startLogFlow(chatId, userId) {
  const { rows: projects } = await query('SELECT * FROM projects ORDER BY sort_order');
  sessions.set(userId, { step: 'project', chatId });
  await bot.sendMessage(chatId, '📊 Which project?', {
    reply_markup: {
      inline_keyboard: projects.map(p => ([
        { text: p.name, callback_data: `log_proj:${p.id}:${encodeURIComponent(p.name)}` },
      ])),
    },
  });
}

// ── Ask which date ────────────────────────────────────────────────────────────
async function askDate(chatId, messageId, userId, projectId, projectName) {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  sessions.set(userId, { step: 'date', chatId, projectId, projectName });
  await bot.editMessageText(
    `📊 *${projectName}*\n\nWhich day?`,
    {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: `Today · ${fmtDateShort(today)}`,      callback_data: `log_date:${today}` },
          { text: `Yesterday · ${fmtDateShort(yesterday)}`, callback_data: `log_date:${yesterday}` },
        ]],
      },
    }
  );
}

// ── Load metrics/targets then start asking metric values ──────────────────────
async function startMetrics(chatId, messageId, userId, date) {
  const sess = sessions.get(userId);
  if (!sess) return;

  const [metricsRes, periodsRes] = await Promise.all([
    query('SELECT * FROM metrics WHERE project_id = $1 ORDER BY sort_order', [sess.projectId]),
    query('SELECT * FROM periods WHERE (project_id = $1 OR project_id IS NULL) ORDER BY start_date', [sess.projectId]),
  ]);

  const metrics = metricsRes.rows;
  const period  = detectActivePeriod(periodsRes.rows, date);

  if (!period) {
    await bot.editMessageText('⚠️ No period found for this project.', { chat_id: chatId, message_id: messageId });
    sessions.delete(userId);
    return;
  }

  const { rows: targets } = await query('SELECT * FROM targets WHERE period_id = $1', [period.id]);

  // Attach daily target to each metric
  const periodDays = period.days ||
    Math.round((new Date(period.end_date) - new Date(period.start_date)) / 86400000) + 1;

  const metricsWithTgt = metrics.map(m => {
    const tgt = targets.find(t => t.metric_id === m.id);
    const wt  = Number(tgt?.weekly_target || 0);
    const dt  = wt > 0 ? Math.round(wt / periodDays) : 0;
    return { ...m, weeklyTarget: wt, dailyTarget: dt };
  });

  sessions.set(userId, { ...sess, step: 'metrics', date, metrics: metricsWithTgt,
    metricIdx: 0, values: {}, periodId: period.id });

  await askMetric(chatId, messageId, userId, true /* edit */);
}

// ── Ask a single metric value ─────────────────────────────────────────────────
async function askMetric(chatId, messageId, userId, edit = false) {
  const sess = sessions.get(userId);
  if (!sess) return;
  const { metrics, metricIdx, projectName, date } = sess;
  const m    = metrics[metricIdx];
  const dtTxt = m.dailyTarget > 0
    ? ` _(${m.is_inverse ? '≤' : '~'}${fmtNum(m.dailyTarget)}/day)_`
    : '';
  const text = `📊 *${projectName}* · ${fmtDateLong(date)}\n\n${metricIdx + 1}/${metrics.length} · *${m.name}*${dtTxt}:\n\n_Type a number, or — to skip_`;

  if (edit) {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }
}

// ── Save collected values to DB ───────────────────────────────────────────────
async function saveSession(chatId, userId) {
  const sess = sessions.get(userId);
  if (!sess) return;
  try {
    const saves = Object.entries(sess.values).map(([metricId, value]) =>
      query(
        `INSERT INTO daily_entries (metric_id, period_id, date, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (metric_id, date) DO UPDATE SET value = $4, updated_at = NOW()`,
        [metricId, sess.periodId, sess.date, value]
      )
    );
    await Promise.all(saves);

    const lines = sess.metrics.map(m => {
      const v = sess.values[m.id];
      return v !== undefined ? `${m.name}: *${fmtNum(v)}* ✓` : `${m.name}: —`;
    }).join('\n');

    await bot.sendMessage(chatId,
      `✅ *Saved!* ${sess.projectName} · ${fmtDateLong(sess.date)}\n\n${lines}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📊 Open Tracker', web_app: { url: process.env.BASE_URL } },
            { text: '📝 Log another', callback_data: 'log_another' },
          ]],
        },
      }
    );
    sessions.delete(userId);
  } catch (e) {
    console.error('saveSession error:', e.message);
    await bot.sendMessage(chatId, `⚠️ Error saving: ${e.message}`);
  }
}

// ── Show confirmation before saving ──────────────────────────────────────────
async function showConfirmation(chatId, userId) {
  const sess = sessions.get(userId);
  if (!sess) return;

  const lines = sess.metrics.map(m => {
    const v = sess.values[m.id];
    return v !== undefined ? `${m.name}: *${fmtNum(v)}*` : `${m.name}: —`;
  }).join('\n');

  await bot.sendMessage(chatId,
    `📋 *${sess.projectName}* · ${fmtDateLong(sess.date)}\n\n${lines}\n\nSave this?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '💾 Save',   callback_data: 'log_confirm_save' },
          { text: '❌ Cancel', callback_data: 'log_confirm_cancel' },
        ]],
      },
    }
  );
}

// ── Voice message → Gemini → confirmation ────────────────────────────────────
async function handleVoice(msg) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  if (!getAllowedIds().includes(userId)) return;
  if (!gemini) {
    await bot.sendMessage(chatId, '⚠️ Voice logging is not configured (GEMINI_API_KEY missing).');
    return;
  }

  const thinking = await bot.sendMessage(chatId, '🎙️ Processing your voice message…');

  try {
    // Load all projects + metrics for Gemini context
    const [{ rows: projects }, { rows: metrics }] = await Promise.all([
      query('SELECT * FROM projects ORDER BY sort_order'),
      query('SELECT * FROM metrics ORDER BY project_id, sort_order'),
    ]);

    const projectContext = projects.map(p => {
      const names = metrics.filter(m => m.project_id === p.id).map(m => m.name).join(', ');
      return `- ${p.name}: ${names}`;
    }).join('\n');

    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Download voice file from Telegram
    const file    = await bot.getFile(msg.voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const resp    = await fetch(fileUrl);
    const buffer  = await resp.arrayBuffer();
    const base64  = Buffer.from(buffer).toString('base64');

    // Ask Gemini to extract project, date, and metric values
    const model  = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a data entry assistant for a performance tracker.

Today is ${today}. Yesterday was ${yesterday}.

Available projects and their metrics:
${projectContext}

Listen to the voice message. The user is logging their daily metrics.
They will say: a project name (or shorthand like "FC" for Full Contact), a date reference ("today", "yesterday", or a specific date), and metric values — either in order or by name.

Return ONLY valid JSON in this exact shape, no explanation, no markdown:
{
  "project": "<exact project name from the list above, or null if unclear>",
  "date": "<YYYY-MM-DD>",
  "values": {
    "<exact metric name>": <number or null>
  }
}

Rules:
- Resolve "today" to ${today}, "yesterday" to ${yesterday}, weekday names to the most recent past occurrence.
- Only include metrics that were clearly mentioned. Set others to null.
- Match project names loosely (e.g. "FC" → "Full Contact", "sales" → "Sales Calls").`;

    const result  = await model.generateContent([
      { inlineData: { mimeType: 'audio/ogg', data: base64 } },
      prompt,
    ]);

    const raw     = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed  = JSON.parse(raw);

    // Resolve project
    const project = projects.find(p =>
      p.name.toLowerCase() === (parsed.project || '').toLowerCase()
    );
    if (!project) {
      await bot.editMessageText(
        `⚠️ Couldn't identify the project from your message ("${parsed.project || '?'}"). Try /log instead.`,
        { chat_id: chatId, message_id: thinking.message_id }
      );
      return;
    }

    const date = parsed.date || today;

    // Resolve active period
    const { rows: periodsRows } = await query(
      'SELECT * FROM periods WHERE (project_id = $1 OR project_id IS NULL) ORDER BY start_date',
      [project.id]
    );
    const period = detectActivePeriod(periodsRows, date);
    if (!period) {
      await bot.editMessageText('⚠️ No active period found for that project/date.', {
        chat_id: chatId, message_id: thinking.message_id,
      });
      return;
    }

    // Map metric names → IDs, filter nulls
    const projectMetrics = metrics.filter(m => m.project_id === project.id);
    const values = {};
    projectMetrics.forEach(m => {
      const v = parsed.values?.[m.name];
      if (v !== null && v !== undefined && !isNaN(Number(v))) {
        values[m.id] = Number(v);
      }
    });

    // Store session for the shared confirm/save flow
    sessions.set(userId, {
      step: 'confirm',
      chatId,
      projectId: project.id,
      projectName: project.name,
      date,
      periodId: period.id,
      metrics: projectMetrics,
      values,
    });

    // Show confirmation — edit the "processing" message in place
    const lines = projectMetrics.map(m => {
      const v = values[m.id];
      return v !== undefined ? `${m.name}: *${fmtNum(v)}*` : `${m.name}: —`;
    }).join('\n');

    await bot.editMessageText(
      `📋 *${project.name}* · ${fmtDateLong(date)}\n\n${lines}\n\nSave this?`,
      {
        chat_id: chatId,
        message_id: thinking.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '💾 Save',   callback_data: 'log_confirm_save' },
            { text: '❌ Cancel', callback_data: 'log_confirm_cancel' },
          ]],
        },
      }
    );
  } catch (e) {
    console.error('handleVoice error:', e.message);
    await bot.editMessageText(`⚠️ Couldn't process audio: ${e.message}`, {
      chat_id: chatId, message_id: thinking.message_id,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

  if (process.env.GEMINI_API_KEY) {
    gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('Gemini voice logging enabled');
  } else {
    console.warn('GEMINI_API_KEY not set — voice logging disabled');
  }

  // /start
  bot.onText(/\/start/, async (msg) => {
    if (!getAllowedIds().includes(msg.from.id)) return;
    await bot.sendMessage(
      msg.chat.id,
      '👋 Welcome to Bekhruz Tracker\n\nUse /status to see current pace\nUse /log to enter today\'s data\nOr send a 🎙️ voice message to log hands-free\n\nOr open the app:',
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

  // /log — start data entry flow
  bot.onText(/\/log/, async (msg) => {
    if (!getAllowedIds().includes(msg.from.id)) return;
    try {
      await startLogFlow(msg.chat.id, msg.from.id);
    } catch (e) {
      console.error('/log error:', e.message);
      await bot.sendMessage(msg.chat.id, '⚠️ Could not start log flow. Try again.');
    }
  });

  // Voice messages — hands-free logging via Gemini
  bot.on('voice', handleVoice);

  // Inline button taps (callback_query)
  bot.on('callback_query', async (cq) => {
    const userId = cq.from.id;
    if (!getAllowedIds().includes(userId)) return;
    const { data, message } = cq;
    const chatId    = message.chat.id;
    const messageId = message.message_id;

    await bot.answerCallbackQuery(cq.id).catch(() => {});

    try {
      if (data.startsWith('log_proj:')) {
        const [, projectId, encodedName] = data.split(':');
        const projectName = decodeURIComponent(encodedName);
        await askDate(chatId, messageId, userId, projectId, projectName);

      } else if (data.startsWith('log_date:')) {
        const date = data.replace('log_date:', '');
        await startMetrics(chatId, messageId, userId, date);

      } else if (data === 'log_confirm_save') {
        await saveSession(chatId, userId);

      } else if (data === 'log_confirm_cancel') {
        sessions.delete(userId);
        await bot.sendMessage(chatId, '❌ Cancelled.');

      } else if (data === 'log_another') {
        await startLogFlow(chatId, userId);
      }
    } catch (e) {
      console.error('callback_query error:', e.message);
      await bot.sendMessage(chatId, '⚠️ Something went wrong. Try /log again.');
      sessions.delete(userId);
    }
  });

  // Free text — handle metric value input during /log flow
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const userId = msg.from.id;
    if (!getAllowedIds().includes(userId)) return;

    const sess = sessions.get(userId);
    if (!sess || sess.step !== 'metrics') return;

    const text = msg.text.trim();

    // Skip with '-' or 'skip'
    let value = null;
    if (text === '-' || text.toLowerCase() === 'skip') {
      value = null;
    } else {
      const num = parseFloat(text.replace(/\s+/g, '').replace(',', '.'));
      if (isNaN(num) || num < 0) {
        await bot.sendMessage(msg.chat.id,
          `⚠️ Please send a number for *${sess.metrics[sess.metricIdx].name}* (or — to skip):`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      value = num;
    }

    // Store value and advance
    const newValues = { ...sess.values };
    if (value !== null) newValues[sess.metrics[sess.metricIdx].id] = value;

    const nextIdx = sess.metricIdx + 1;
    sessions.set(userId, { ...sess, metricIdx: nextIdx, values: newValues });

    if (nextIdx >= sess.metrics.length) {
      await showConfirmation(msg.chat.id, userId);
    } else {
      await askMetric(msg.chat.id, null, userId, false);
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
