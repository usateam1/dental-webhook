// ═══════════════════════════════════════════════════════
//  Minbaev Dental Clinic — Telegram Webhook Server
//  Одобряет/отклоняет отзывы кнопками прямо в Telegram
// ═══════════════════════════════════════════════════════

const http = require('http');

const TG_TOKEN = '8348564496:AAE-lfMiKRRPImPPG7bMIWxiPZo9sAvjmC4';
const TG_CHAT  = '8571455593';

// Хранилище одобренных отзывов (в памяти + файл)
const fs = require('fs');
const DB_FILE = './approved.json';

function loadApproved() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return []; }
}
function saveApproved(list) {
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 2));
}
function loadPending() {
  try { return JSON.parse(fs.readFileSync('./pending.json', 'utf8')); }
  catch(e) { return []; }
}

// Ответ на callback_query из Telegram
async function answerCallback(callbackQueryId, text) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text })
  });
}

// Редактировать сообщение (убрать кнопки после решения)
async function editMessage(chatId, messageId, text) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown'
    })
  });
}

// HTTP сервер
const server = http.createServer(async (req, res) => {
  // CORS — чтобы сайт мог читать одобренные отзывы
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // GET /approved — сайт запрашивает список одобренных отзывов
  if (req.method === 'GET' && req.url === '/approved') {
    const list = loadApproved();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  // POST /pending — сайт сохраняет новый отзыв на модерацию
  if (req.method === 'POST' && req.url === '/pending') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const review = JSON.parse(body);
        // Сохранить в pending.json
        let pending = loadPending();
        pending.push(review);
        fs.writeFileSync('./pending.json', JSON.stringify(pending, null, 2));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500); res.end('error');
      }
    });
    return;
  }

  // POST /webhook — Telegram присылает нажатие кнопки
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);

        if (update.callback_query) {
          const cb       = update.callback_query;
          const data     = cb.data;           // "approve_r1234" или "reject_r1234"
          const msgId    = cb.message.message_id;
          const chatId   = cb.message.chat.id;
          const origText = cb.message.text;

          if (data.startsWith('approve_')) {
            const reviewId = data.replace('approve_', '');
            // Найти отзыв в pending
            const pending = loadPending();
            const review  = pending.find(r => r.id === reviewId);

            if (review) {
              // Добавить в approved
              const approved = loadApproved();
              approved.push({ ...review, status: 'approved', approvedAt: Date.now() });
              saveApproved(approved);

              await answerCallback(cb.id, '✅ Отзыв одобрен и опубликован!');
              await editMessage(chatId, msgId,
                `${origText}\n\n✅ *ОДОБРЕНО* — опубликовано на сайте`
              );
            } else {
              await answerCallback(cb.id, '⚠️ Отзыв не найден');
            }

          } else if (data.startsWith('reject_')) {
            const reviewId = data.replace('reject_', '');
            await answerCallback(cb.id, '❌ Отзыв отклонён');
            await editMessage(chatId, msgId,
              `${origText}\n\n❌ *ОТКЛОНЕНО*`
            );
          }
        }

        res.writeHead(200); res.end('ok');
      } catch(e) {
        console.error(e);
        res.writeHead(500); res.end('error');
      }
    });
    return;
  }

  // Health check
  if (req.url === '/') {
    res.writeHead(200); res.end('Minbaev Dental Webhook — работает ✅');
    return;
  }

  res.writeHead(404); res.end('not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));
