const express = require('express');
const bodyParser = require('body-parser');
const moment = require('moment');
require('moment/locale/fa');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// تنظیمات اولیه
const token = '7249407729:AAFndN29H5rXdzTcz2Bab8RKsFLm39cDkeE';
const bot = new TelegramBot(token, { polling: true });
const app = express();
app.use(bodyParser.json());

app.post('/' + token, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// پیاده‌سازی ول هوک
const webhookUrl = 'https://juniper-bitter-freon.glitch.me/' + token;
bot.setWebHook(webhookUrl);

// وضعیت ربات و ذخیره‌سازی اطلاعات
let userData = {};

// پیام خوش‌آمدگویی و پرسش نام
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "خوش آمدید! لطفا نام خود را وارد کنید:");
    userData[chatId] = { step: 'name' };
});

// دریافت نام و پرسش شماره تلفن
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (userData[chatId]) {
        if (userData[chatId].step === 'name') {
            userData[chatId].name = text;
            userData[chatId].step = 'phone';
            bot.sendMessage(chatId, "لطفا شماره تلفن خود را وارد کنید:");
        } else if (userData[chatId].step === 'phone') {
            userData[chatId].phone = text;
            userData[chatId].step = 'payment';
            bot.sendMessage(chatId, "لطفا اطلاعات پرداخت خود را وارد کنید:");
        } else if (userData[chatId].step === 'payment') {
            userData[chatId].payment = text;

            // نمایش روزها و تاریخ شمسی به صورت ردیفی
            const daysOfWeek = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
            const dateInfo = daysOfWeek.map((day, index) => {
                const date = moment().day(index + 1).locale('fa').format('YYYY/MM/DD');
                return `${day}: ${date}`;
            }).join('\n');

            bot.sendMessage(chatId, `نام: ${userData[chatId].name}\nشماره تلفن: ${userData[chatId].phone}\nاطلاعات پرداخت: ${userData[chatId].payment}\n\nروزها و تاریخ‌های شمسی:\n${dateInfo}`);
            delete userData[chatId];
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
