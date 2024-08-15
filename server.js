const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
const token = '7249407729:AAFndN29H5rXdzTcz2Bab8RKsFLm39cDkeE'; // توکن ربات تلگرام خود را جایگزین کنید
const bot = new TelegramBot(token, { polling: true });

// ذخیره‌سازی وضعیت کاربر و داده‌ها
const userStates = {}; // برای ذخیره وضعیت کاربر
const userData = {}; // برای ذخیره داده‌های کاربر

const states = {
  ASKING_DAY: 'ASKING_DAY',
  ASKING_START_TIME: 'ASKING_START_TIME',
  ASKING_END_TIME: 'ASKING_END_TIME',
  WAITING_FOR_PAYMENT_CONFIRMATION: 'WAITING_FOR_PAYMENT_CONFIRMATION',
  ADJUSTING_TIME: 'ADJUSTING_TIME', // حالت جدید برای اصلاح زمان
};

// تنظیمات اولیه
const daysOfWeek = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const availableTimes = ['۱۴:۰۰', '۱۴:۳۰', '۱۵:۰۰', '۱۵:۳۰', '۱۶:۰۰', '۱۶:۳۰', '۱۷:۰۰', '۱۷:۳۰', '۱۸:۰۰', '۱۸:۳۰', '۱۹:۰۰', '۱۹:۳۰', '۲۰:۰۰', '۲۰:۳۰', '۲۱:۰۰'];
const hourlyRate = 500000;
const halfHourlyRate = 250000;
const depositAmount = 500000;
const depositCardNumber = '6219861045590980';
const cardHolderName = 'میلاد پاویز';

// ارسال منوی اصلی به کاربر
const sendMainMenu = (chatId) => {
  const mainMenuKeyboard = [
    [{ text: 'شروع مجدد', callback_data: 'restart' }],
    [{ text: 'تنظیمات', callback_data: 'settings' }],
    [{ text: 'اصلاح زمان', callback_data: 'adjust_time' }],
    [{ text: 'تاس', callback_data: 'dice' }]
  ];

  bot.sendMessage(chatId, 'لطفاً یکی از گزینه‌ها را انتخاب کنید:', {
    reply_markup: {
      inline_keyboard: mainMenuKeyboard
    }
  });
};

// ارسال منوی اصلاح زمان
const sendTimeAdjustmentMenu = (chatId) => {
  const adjustmentMenu = [
    [{ text: 'تغییر زمان شروع', callback_data: 'change_start_time' }],
    [{ text: 'تغییر زمان پایان', callback_data: 'change_end_time' }],
    [{ text: 'بازگشت به منوی اصلی', callback_data: 'main_menu' }]
  ];

  bot.sendMessage(chatId, 'لطفاً گزینه‌ای برای اصلاح زمان انتخاب کنید:', {
    reply_markup: {
      inline_keyboard: adjustmentMenu
    }
  });
};

// ارسال دکمه‌های زمان
const sendTimeButtons = (chatId, isStartTime = true, selectedIndex = -1) => {
  const timeButtons = availableTimes.map((time, index) => ({
    text: time,
    callback_data: `${isStartTime ? 'start_' : 'end_'}${index}`
  }));

  bot.sendMessage(chatId, `لطفاً زمان ${isStartTime ? 'شروع' : 'پایان'} را انتخاب کنید:`, {
    reply_markup: {
      inline_keyboard: [timeButtons]
    }
  });
};

// واکنش به پیام‌های جدید
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sendMainMenu(chatId);
});

bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const [type, index] = data.split('_');

  const stateInfo = userStates[chatId];
  if (!stateInfo) return;

  const { state, reservationId } = stateInfo;

  if (type === 'restart') {
    resetUser(chatId);
    return;
  }

  if (type === 'settings') {
    showAdminSettingsMenu(chatId);
    return;
  }

  if (type === 'adjust_time') {
    sendTimeAdjustmentMenu(chatId);
    return;
  }

  if (type === 'change_start_time' || type === 'change_end_time') {
    if (type === 'change_start_time') {
      userStates[chatId].state = states.ASKING_START_TIME;
    } else {
      userStates[chatId].state = states.ASKING_END_TIME;
    }
    sendTimeButtons(chatId, type === 'change_start_time');
    return;
  }

  if (type === 'main_menu') {
    sendMainMenu(chatId);
    return;
  }

  if (type === 'dice') {
    // ارسال پیام با ایموجی تاس
    bot.sendMessage(chatId, '🎲 تاس شما: ' + Math.floor(Math.random() * 6 + 1));
    return;
  }

  if (state === states.ASKING_DAY) {
    if (isNaN(index) || index < 0 || index >= daysOfWeek.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای روز انجام دهید.");
      return;
    }
    userData[reservationId].day = daysOfWeek[index];
    userStates[chatId].state = states.ASKING_START_TIME;
    sendTimeButtons(chatId, true);
  } else if (state === states.ASKING_START_TIME) {
    if (isNaN(index) || index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان شروع انجام دهید.");
      return;
    }
    userData[reservationId] = { ...userData[reservationId], startTime: availableTimes[index] };
    userStates[chatId].state = states.ASKING_END_TIME;
    sendTimeButtons(chatId, false, index);
  } else if (state === states.ASKING_END_TIME) {
    if (isNaN(index) || index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان پایان انجام دهید.");
      return;
    }
    const startTimeIndex = availableTimes.indexOf(userData[reservationId].startTime);
    if (index <= startTimeIndex) {
      bot.sendMessage(chatId, "زمان پایان باید بعد از زمان شروع باشد. لطفاً مجدداً انتخاب کنید.");
      return;
    }
    userData[reservationId] = { ...userData[reservationId], endTime: availableTimes[index] };

    // محاسبه هزینه
    const startIndex = availableTimes.indexOf(userData[reservationId].startTime);
    const endIndex = availableTimes.indexOf(userData[reservationId].endTime);
    const totalMinutes = (endIndex - startIndex) * 30;

    let totalAmount = 0;
    if (totalMinutes <= 60) {
      totalAmount = hourlyRate;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      totalAmount = (hours * hourlyRate) + (minutes > 0 ? halfHourlyRate : 0);
    }

    bot.sendMessage(chatId, `هزینه کل رزرو شما: ${totalAmount} تومان.\n\nمبلغ بیعانه: ${depositAmount} تومان\n\nلطفاً مبلغ بیعانه ${depositAmount} تومان را به شماره کارت زیر واریز کنید:\n\n${depositCardNumber}\nبه نام ${cardHolderName}\n\nپس از واریز، فیش واریز را ارسال کنید.`);
    userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
  } else if (state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
    if (callbackQuery.message.photo) {
      const fileId = callbackQuery.message.photo[0].file_id;
      bot.getFileLink(fileId).then(fileLink => {
        bot.sendMessage('@intage', `فیش واریز جدید از کاربر ${chatId}: ${fileLink}`);
        bot.sendMessage(chatId, 'فیش واریز شما دریافت شد. در حال بررسی آن هستیم.');
        // بعد از بررسی فیش توسط مدیر، زمان کاربر تأیید خواهد شد.
      }).catch(error => {
        bot.sendMessage(chatId, 'خطا در ارسال فیش واریز. لطفاً دوباره امتحان کنید.');
      });
    } else {
      bot.sendMessage(chatId, 'لطفاً فیش واریز را ارسال کنید.');
    }
  }
});

// تابع برای راه‌اندازی سرور
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
