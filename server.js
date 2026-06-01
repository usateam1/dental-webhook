const express = require('express');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Env ── */
const TG_TOKEN  = process.env.TG_TOKEN  || '';   // Bot token
const TG_CHATID = process.env.TG_CHATID || '';   // Your personal chat ID
const ADMIN_KEY = process.env.ADMIN_KEY || 'secret123'; // Секрет для /admin

/* ── CORS ── */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

/* ── Storage (JSON files in /tmp — сбрасывается при рестарте) ──
   Для постоянного хранения подключите Render Disk или Railway Volume */
const PENDING_FILE  = '/tmp/pending.json';
const APPROVED_FILE = '/tmp/approved.json';

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ═══════════════════════════
   POST /pending  — новый отзыв
═══════════════════════════ */
app.post('/pending', (req, res) => {
  const { id, name, txt, svc, stars, ts } = req.body;
  if (!id || !name || !txt || !stars) return res.status(400).json({ error: 'bad fields' });

  const review = { id, name, txt: txt.slice(0, 1000), svc: (svc||'').slice(0,80), stars: +stars, ts: +ts || Date.now(), status: 'pending' };

  const list = readJSON(PENDING_FILE);
  if (list.find(r => r.id === id)) return res.json({ ok: true }); // дедупликация
  list.unshift(review);
  writeJSON(PENDING_FILE, list);

  // Уведомление в Telegram
  if (TG_TOKEN && TG_CHATID) {
    sendTelegram(review);
  } else {
    console.log('[NEW REVIEW]', review);
  }

  res.json({ ok: true });
});

/* ═══════════════════════════
   GET /approved  — одобренные
═══════════════════════════ */
app.get('/approved', (req, res) => {
  res.json(readJSON(APPROVED_FILE));
});

/* ═══════════════════════════
   GET /pending  — pending (только для admin)
═══════════════════════════ */
app.get('/pending', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });
  res.json(readJSON(PENDING_FILE));
});

/* ═══════════════════════════
   POST /approve/:id  — одобрить (через Telegram callback или вручную)
═══════════════════════════ */
app.post('/approve/:id', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });

  const pending  = readJSON(PENDING_FILE);
  const approved = readJSON(APPROVED_FILE);

  const idx = pending.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  const [review] = pending.splice(idx, 1);
  review.status = 'approved';
  approved.unshift(review);

  writeJSON(PENDING_FILE,  pending);
  writeJSON(APPROVED_FILE, approved);

  res.json({ ok: true, review });
});

/* ═══════════════════════════
   POST /reject/:id  — отклонить
═══════════════════════════ */
app.post('/reject/:id', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'forbidden' });

  const pending = readJSON(PENDING_FILE);
  const idx = pending.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  pending.splice(idx, 1);
  writeJSON(PENDING_FILE, pending);

  res.json({ ok: true });
});

/* ═══════════════════════════
   GET /admin  — простая HTML-панель модерации
═══════════════════════════ */
app.get('/admin', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.send(`
      <html><body style="font-family:sans-serif;padding:2rem">
        <h2>🔒 Введите ключ доступа</h2>
        <form>
          <input name="key" type="password" placeholder="ADMIN_KEY" style="padding:8px;font-size:1rem">
          <button type="submit" style="padding:8px 16px;margin-left:8px">Войти</button>
        </form>
      </body></html>`);
  }

  const key      = req.query.key;
  const pending  = readJSON(PENDING_FILE);
  const approved = readJSON(APPROVED_FILE);

  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  const rows = (list, type) => list.map(r => `
    <div style="background:#f9fafb;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #e5e7eb">
      <b>${r.name}</b> &nbsp; <span style="color:#f6c90e">${stars(r.stars)}</span>
      ${r.svc ? `<span style="color:#2979ff;font-size:.85rem"> · ${r.svc}</span>` : ''}
      <p style="color:#374151;margin:.5rem 0">"${r.txt}"</p>
      <small style="color:#9ca3af">${new Date(r.ts).toLocaleString('ru')}</small>
      ${type === 'pending' ? `
        <br><br>
        <form method="post" action="/approve/${r.id}?key=${key}" style="display:inline">
          <button style="background:#10b981;color:#fff;border:none;padding:7px 18px;border-radius:8px;cursor:pointer">✅ Одобрить</button>
        </form>
        <form method="post" action="/reject/${r.id}?key=${key}" style="display:inline;margin-left:8px">
          <button style="background:#ef4444;color:#fff;border:none;padding:7px 18px;border-radius:8px;cursor:pointer">❌ Отклонить</button>
        </form>` : `<br><small style="color:#10b981">✓ Одобрен</small>`}
    </div>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Модерация отзывов</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:2rem}
h1{color:#0b2056}h2{color:#2979ff;border-bottom:2px solid #e5e7eb;padding-bottom:.4rem}</style>
</head><body>
<h1>🦷 Minbaev Dental — Модерация отзывов</h1>
<h2>⏳ Ожидают одобрения (${pending.length})</h2>
${pending.length ? rows(pending,'pending') : '<p style="color:#9ca3af">Нет новых отзывов</p>'}
<h2>✅ Одобренные (${approved.length})</h2>
${approved.length ? rows(approved,'approved') : '<p style="color:#9ca3af">Пока нет одобренных</p>'}
</body></html>`);
});

/* ═══════════════════════════
   Telegram callback (inline keyboard)
═══════════════════════════ */
app.post('/tg-webhook', (req, res) => {
  const body = req.body;
  if (body.callback_query) {
    const cb  = body.callback_query;
    const [action, id] = cb.data.split(':');
    const key = ADMIN_KEY;

    if (action === 'approve') {
      const pending  = readJSON(PENDING_FILE);
      const approved = readJSON(APPROVED_FILE);
      const idx = pending.findIndex(r => r.id === id);
      if (idx !== -1) {
        const [review] = pending.splice(idx, 1);
        review.status = 'approved';
        approved.unshift(review);
        writeJSON(PENDING_FILE,  pending);
        writeJSON(APPROVED_FILE, approved);
        tgAnswerCallback(cb.id, '✅ Одобрен и опубликован!');
        tgEditMessage(cb.message.chat.id, cb.message.message_id, cb.message.text + '\n\n✅ ОДОБРЕН');
      }
    } else if (action === 'reject') {
      const pending = readJSON(PENDING_FILE);
      const idx = pending.findIndex(r => r.id === id);
      if (idx !== -1) {
        pending.splice(idx, 1);
        writeJSON(PENDING_FILE, pending);
        tgAnswerCallback(cb.id, '❌ Отклонён');
        tgEditMessage(cb.message.chat.id, cb.message.message_id, cb.message.text + '\n\n❌ ОТКЛОНЁН');
      }
    }
  }
  res.sendStatus(200);
});

/* ── Healthcheck ── */
app.get('/', (req, res) => res.json({ status: 'ok', pending: readJSON(PENDING_FILE).length, approved: readJSON(APPROVED_FILE).length }));

/* ═══════════════════════════
   Telegram helpers
═══════════════════════════ */
function tgPost(method, body) {
  const data = JSON.stringify(body);
  const opts = {
    hostname: 'api.telegram.org',
    path: `/bot${TG_TOKEN}/${method}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  };
  const req = https.request(opts);
  req.write(data); req.end();
}

function sendTelegram(r) {
  const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
  const text  = `🦷 *Новый отзыв на модерации*\n\n👤 ${r.name}\n${stars}${r.svc ? `\n💊 ${r.svc}` : ''}\n\n"${r.txt}"`;

  tgPost('sendMessage', {
    chat_id: TG_CHATID,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Одобрить', callback_data: `approve:${r.id}` },
        { text: '❌ Отклонить', callback_data: `reject:${r.id}` }
      ]]
    }
  });
}

function tgAnswerCallback(callbackId, text) {
  tgPost('answerCallbackQuery', { callback_query_id: callbackId, text });
}

function tgEditMessage(chatId, messageId, text) {
  tgPost('editMessageText', { chat_id: chatId, message_id: messageId, text });
}

app.listen(PORT, () => console.log(`Dental webhook running on :${PORT}`));
