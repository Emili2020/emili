const TelegramBot = require('node-telegram-bot-api');
const token = '7249407729:AAFndN29H5rXdzTcz2Bab8RKsFLm39cDkeE'; // توکن ربات خود را وارد کنید
const bot = new TelegramBot(token, { polling: true });

const workDays = ['شنبه', 'یک‌شنبه', 'دو‌شنبه', 'سه‌شنبه', 'چهار‌شنبه', 'پنج‌شنبه'];
const workHours = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];

let userInfo = {};

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userInfo[chatId] = {}; // ذخیره اطلاعات کاربر
    bot.sendMessage(chatId, 'به ربات رزرو تایم استودیو پاویز خوش آمدید. لطفا نام و نام خانوادگی را وارد کنید:');
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (!userInfo[chatId].name) {
        userInfo[chatId].name = msg.text;
        bot.sendMessage(chatId, 'در چه روزی قصد رکورد در استودیو را دارید؟', {
            reply_markup: {
                keyboard: workDays.map(day => [day]),
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
    } else if (!userInfo[chatId].day) {
        userInfo[chatId].day = msg.text;
        bot.sendMessage(chatId, 'در چه ساعتی می‌خواهید ضبط را انجام دهید؟', {
            reply_markup: {
                keyboard: workHours.map(hour => [hour]),
                one_time_keyboard: true,
                resize_keyboard: true
            }
        });
    } else if (!userInfo[chatId].time) {
        userInfo[chatId].time = msg.text;

        // محاسبه مبلغ فاکتور
        const billAmount = 500000;
        userInfo[chatId].bill = billAmount;

        bot.sendMessage(chatId, `مبلغ فاکتور شما: ${billAmount} تومان است. برای ثبت تایم لطفا مبلغ ۵۰۰۰۰۰ تومان به شماره کارت 6219861045590980 واریز کرده و فیش واریز را به ربات ارسال فرمایید.`);
    } else if (!userInfo[chatId].receipt) {
        userInfo[chatId].receipt = msg.photo ? msg.photo : msg.text;

        // ارسال فیش واریزی به ادمین
        bot.sendMessage('@intage', `رزرو جدید:\nنام: ${userInfo[chatId].name}\nروز: ${userInfo[chatId].day}\nساعت: ${userInfo[chatId].time}\nمبلغ: ${userInfo[chatId].bill}\nفیش واریزی:`, {
            caption: msg.caption
        });

        bot.forwardMessage('@intage', chatId, msg.message_id);

        bot.sendMessage(chatId, 'تایم شما با موفقیت ثبت شد.');
    }
});
