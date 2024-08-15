const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');
require('moment-jalaali');

const app = express();
app.use(bodyParser.json());

// توکن تلگرام خود را اینجا وارد کنید
const token = '7249407729:AAFndN29H5rXdzTcz2Bab8RKsFLm39cDkeE';

// URL عمومی پروژه Glitch خود را اینجا وارد کنید
const url = 'https://juniper-bitter-freon.glitch.me';

// تنظیم و حذف Webhook
const bot = new TelegramBot(token);
bot.deleteWebHook().then(() => {
  bot.setWebHook(`${url}/bot${token}`);
});

// پردازش درخواست‌های POST از تلگرام
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// پیام خوش‌آمدگویی و دریافت پاسخ‌ها
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "خوش آمدید! لطفاً ساعات کاری خود را وارد کنید.");
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  // بررسی اینکه آیا پیام کاربر یک دستور نبوده است
  if (msg.text && !msg.text.startsWith('/')) {
    // فرض کنید پیام کاربر ساعات کاری است
    const userInput = msg.text.trim().split(',');

    if (userInput.length === 2) {
      const [days, hours] = userInput;

      const startDate = moment();
      const endDate = moment().add(6, 'days');

      let response = 'ساعات کاری شما در روزهای هفته:\n\n';

      for (let i = 0; i < 7; i++) {
        const currentDay = moment(startDate).add(i, 'days');
        const jalaaliDate = currentDay.format('jYYYY/jM/jD'); // تاریخ شمسی

        response += `${days} ${jalaaliDate}: ${hours}\n`;
      }

      bot.sendMessage(chatId, response);
    } else {
      bot.sendMessage(chatId, 'لطفاً فرمت صحیح را وارد کنید: "روزها, ساعت‌ها"');
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
