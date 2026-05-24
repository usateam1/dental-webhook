// ═══════════════════════════════════════════════════════
//  Minbaev Dental Clinic — Telegram Webhook Server
// ═══════════════════════════════════════════════════════

const http = require('http');
const fs   = require('fs');

const TG_TOKEN = '8348564496:AAE-lfMiKRRPImPPG7bMIWxiPZo9sAvjmC4';
const TG_CHAT  = '8571455593';

// ── Файлы-хранилища ──
function load(file)       { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch(e){ return []; } }
function save(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ── Telegram helpers ──
async function tg(method, body) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// ── CORS заголовки (всегда, для любого ответа) ──
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, code = 200) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end',  () => resolve(body));
  });
}

// ── HTTP сервер ──
http.createServer(async (req, res) => {

  // Preflight CORS
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(200); res.end(); return; }

  // GET / — health check
  if (req.method === 'GET' && req.url === '/') {
    cors(res); res.writeHead(200); res.end('Minbaev Dental Webhook ✅'); return;
  }

  // GET /approved — список одобренных отзывов для сайта
  if (req.method === 'GET' && req.url === '/approved') {
    return json(res, load('./approved.json'));
  }

  // POST /pending — новый отзыв от пациента, сохранить + уведомить в Telegram
  if (req.method === 'POST' && req.url === '/pending') {
    try {
      const review = JSON.parse(await readBody(req));

      // Сохранить
      const pending = load('./pending.json');
      pending.push(review);
      save('./pending.json', pending);

      // Уведомление в Telegram с кнопками
      const stars = '★'.repeat(review.stars) + '☆'.repeat(5 - review.stars);
      const text  =
        `⭐ *НОВЫЙ ОТЗЫВ — на модерации*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👤 ${review.name}   ${stars}\n` +
        `💊 Услуга: ${review.svc || 'не указана'}\n\n` +
        `📝 _"${review.txt}"_\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🆔 ID: \`${review.id}\`\n` +
        `⏰ ${new Date().toLocaleString('ru-RU')}`;

      await tg('sendMessage', {
        chat_id: TG_CHAT,
        text,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Одобрить', callback_data: `approve_${review.id}` },
            { text: '❌ Отклонить', callback_data: `reject_${review.id}` }
          ]]
        }
      });

      return json(res, { ok: true });
    } catch(e) {
      console.error(e);
      return json(res, { ok: false }, 500);
    }
  }

  // POST /webhook — Telegram нажал кнопку
  if (req.method === 'POST' && req.url === '/webhook') {
    try {
      const update = JSON.parse(await readBody(req));

      if (update.callback_query) {
        const cb      = update.callback_query;
        const data    = cb.data;
        const msgId   = cb.message.message_id;
        const chatId  = cb.message.chat.id;
        const origTxt = cb.message.text;

        if (data.startsWith('approve_')) {
          const id      = data.replace('approve_', '');
          const pending = load('./pending.json');
          const review  = pending.find(r => r.id === id);

          if (review) {
            const approved = load('./approved.json');
            approved.push({ ...review, status: 'approved', approvedAt: Date.now() });
            save('./approved.json', approved);
            await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '✅ Опубликовано!' });
            await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: origTxt + '\n\n✅ *ОДОБРЕНО* — опубликовано на сайте', parse_mode: 'Markdown' });
          } else {
            await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '⚠️ Не найден' });
          }

        } else if (data.startsWith('reject_')) {
          await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '❌ Отклонено' });
          await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: origTxt + '\n\n❌ *ОТКЛОНЕНО*', parse_mode: 'Markdown' });
        }
      }

      cors(res); res.writeHead(200); res.end('ok');
    } catch(e) {
      console.error(e);
      cors(res); res.writeHead(500); res.end('error');
    }
    return;
  }

  cors(res); res.writeHead(404); res.end('not found');

}).listen(process.env.PORT || 3000, () => console.log('✅ Webhook сервер запущен'));
