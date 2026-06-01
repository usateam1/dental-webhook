# 🦷 Dental Webhook Server — Инструкция по деплою

Бесплатный сервер для сбора и модерации отзывов. Деплоится на **Render.com** за ~5 минут.

---

## 📋 Что умеет сервер

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/pending` | POST | Принять новый отзыв с сайта |
| `/approved` | GET | Вернуть список одобренных отзывов |
| `/admin?key=XXX` | GET | Панель модерации в браузере |
| `/approve/:id?key=XXX` | POST | Одобрить отзыв |
| `/reject/:id?key=XXX` | POST | Отклонить отзыв |
| `/tg-webhook` | POST | Получать нажатия кнопок из Telegram |

---

## 🚀 Деплой на Render.com (бесплатно)

### Шаг 1 — Загрузить код на GitHub

1. Откройте [github.com](https://github.com) → **New repository**
2. Назовите репозиторий: `dental-webhook`
3. Создайте репозиторий → нажмите **uploading an existing file**
4. Перетащите файлы `server.js` и `package.json`
5. Нажмите **Commit changes**

### Шаг 2 — Задеплоить на Render

1. Откройте [render.com](https://render.com) → Sign Up (бесплатно, через GitHub)
2. Нажмите **New → Web Service**
3. Выберите ваш репозиторий `dental-webhook`
4. Настройки:
   - **Name:** `dental-webhook`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Нажмите **Create Web Service**
6. Подождите ~2 минуты — вы получите URL вида `https://dental-webhook.onrender.com`

### Шаг 3 — Установить переменные окружения

В Render → ваш сервис → **Environment** → добавьте:

| Переменная | Значение | Обязательна? |
|-----------|----------|-------------|
| `ADMIN_KEY` | придумайте пароль (напр. `MyDental2024`) | ✅ |
| `TG_TOKEN` | токен вашего Telegram-бота | ❌ (без него — только /admin панель) |
| `TG_CHATID` | ваш Telegram chat ID | ❌ |

---

## 🤖 Как создать Telegram-бота (опционально)

1. Напишите [@BotFather](https://t.me/BotFather) → `/newbot`
2. Придумайте имя и username — получите **токен** (`TG_TOKEN`)
3. Узнайте ваш **chat ID**: напишите [@userinfobot](https://t.me/userinfobot)
4. Добавьте оба значения в переменные Render (см. выше)

### Настроить Webhook для кнопок в Telegram:

После деплоя выполните в браузере (замените YOUR_TOKEN и YOUR_SERVER_URL):

```
https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://YOUR_SERVER_URL/tg-webhook
```

---

## 🖥️ Панель модерации

После деплоя откройте в браузере:
```
https://dental-webhook.onrender.com/admin?key=ВАШ_ADMIN_KEY
```

Здесь вы видите все отзывы и можете одобрять/отклонять нажатием кнопки.

---

## 🔗 Подключить к сайту

В файле `index.html` найдите строку:
```js
const WEBHOOK_URL = 'https://dental-webhook.onrender.com';
```
Замените URL на ваш реальный URL с Render.

---

## ⚠️ Важно

- **Бесплатный план Render** "засыпает" после 15 минут простоя (~30 сек на первый запрос).
- Данные хранятся в `/tmp` — **сбрасываются при рестарте сервера** (~раз в 2 недели).
- Для постоянного хранения: подключите **Render Disk** ($7/мес) или используйте бесплатный **Railway.app** с PostgreSQL.
