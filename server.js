const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// توکن ربات تلگرام خود را وارد کنید
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "به ربات خوش آمدید! لطفا تاریخ و ساعت مورد نظر خود را وارد کنید.");
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userMessage = msg.text;

    // اینجا می‌توانید منطق پردازش پیام کاربر را اضافه کنید
    bot.sendMessage(chatId, `وقت شما برای ${userMessage} رزرو شد!`);
});

// سرویس نگهداری Glitch برای بیدار نگه داشتن برنامه
app.get("/", (request, response) => {
  response.sendStatus(200);
});

const listener = app.listen(process.env.PORT, () => {
  console.log("Your bot is listening on port " + listener.address().port);
});
