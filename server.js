const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();

// زمان‌های قابل رزرو از 14:00 تا 21:00 با بازه‌های نیم‌ساعته
const availableTimes = [
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00"
];

// روزهای هفته بدون جمعه
const daysOfWeek = [
  "شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه"
];

// هزینه به ازای هر ساعت و نیم‌ساعت
const hourlyRate = 500000;
const halfHourlyRate = 250000;

// مبلغ بیعانه
const depositAmount = 500000;

// شماره کارت برای واریز بیعانه
const depositCardNumber = '6219861045590980';
const cardHolderName = 'میلاد پاویز';

// آیدی تلگرام مدیر برای دریافت فیش واریز
const adminChatId = '841548105'; // جایگزین با آیدی عددی تلگرام شما

// ذخیره‌سازی اطلاعات کاربر
const userData = {};
const userStates = {};

// وضعیت‌های مختلف
const states = {
  NONE: 'NONE',
  ASKING_NAME: 'ASKING_NAME',
  ASKING_PHONE: 'ASKING_PHONE',
  ASKING_DAY: 'ASKING_DAY',
  ASKING_START_TIME: 'ASKING_START_TIME',
  ASKING_END_TIME: 'ASKING_END_TIME',
  WAITING_FOR_PAYMENT_CONFIRMATION: 'WAITING_FOR_PAYMENT_CONFIRMATION',
  CONFIRMED: 'CONFIRMED'
};

// پردازش /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const reservationId = uuidv4();
  userStates[chatId] = {
    state: states.ASKING_NAME,
    reservationId: reservationId
  };
  bot.sendMessage(chatId, "به ربات خوش آمدید! لطفاً نام خود را وارد کنید.");
});

// پردازش پیام‌های متنی
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const stateInfo = userStates[chatId];

  if (!stateInfo) return;

  const { state, reservationId } = stateInfo;

  if (state === states.ASKING_NAME) {
    userData[reservationId] = { name: text };
    userStates[chatId].state = states.ASKING_PHONE;
    bot.sendMessage(chatId, "لطفاً شماره تلفن خود را وارد کنید.");
  } else if (state === states.ASKING_PHONE) {
    userData[reservationId].phone = text;
    userStates[chatId].state = states.ASKING_DAY;
    sendDayButtons(chatId);
  } else if (state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
    if (msg.photo) {
      bot.forwardMessage(adminChatId, chatId, msg.message_id);
      bot.sendMessage(chatId, "فیش واریز دریافت شد. لطفاً صبور باشید تا وضعیت پرداخت بررسی شود.");
    } else {
      bot.sendMessage(chatId, "لطفاً فیش واریز را ارسال کنید.");
    }
  }
});

// ارسال دکمه‌های روز
const sendDayButtons = (chatId) => {
  const dayButtons = daysOfWeek.map((day, index) => ({
    text: day,
    callback_data: `day_${index}`
  }));

  bot.sendMessage(chatId, "لطفاً روز مورد نظر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: [dayButtons]
    }
  });
};

// ارسال دکمه‌های زمان
const sendTimeButtons = (chatId, isStartTime, startTimeIndex = 0) => {
  const timeButtons = availableTimes.map((time, index) => ({
    text: time,
    callback_data: `${isStartTime ? 'start_' : 'end_'}${index}`
  }));

  const filteredTimeButtons = isStartTime
    ? timeButtons
    : timeButtons.filter((_, index) => index > startTimeIndex);

  const timeButtonsInRows = [];
  for (let i = 0; i < filteredTimeButtons.length; i += 2) {
    timeButtonsInRows.push(filteredTimeButtons.slice(i, i + 2));
  }

  bot.sendMessage(chatId, `لطفاً ${isStartTime ? 'زمان شروع' : 'زمان پایان'} را انتخاب کنید:`, {
    reply_markup: {
      inline_keyboard: timeButtonsInRows
    }
  });
};

// پردازش دکمه‌های Inline
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;

  const parts = callbackData.split('_');
  const type = parts[0];
  const index = parseInt(parts[1], 10);

  const stateInfo = userStates[chatId];

  if (!stateInfo) return;

  const { reservationId } = stateInfo;

  if (type === 'day') {
    if (isNaN(index) || index < 0 || index >= daysOfWeek.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای روز انجام دهید.");
      return;
    }
    userData[reservationId] = { ...userData[reservationId], day: daysOfWeek[index] };
    userStates[chatId].state = states.ASKING_START_TIME;
    sendTimeButtons(chatId, true);
  } else if (type.startsWith('start')) {
    if (isNaN(index) || index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان شروع انجام دهید.");
      return;
    }
    userData[reservationId] = { ...userData[reservationId], startTime: availableTimes[index] };
    userStates[chatId].state = states.ASKING_END_TIME;
    sendTimeButtons(chatId, false, index);
  } else if (type.startsWith('end')) {
    if (isNaN(index) || index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان پایان انجام دهید.");
      return;
    }
    const startTimeIndex = availableTimes.indexOf(userData[reservationId].startTime);
    if (index <= startTimeIndex) {
      bot.sendMessage(chatId, "زمان پایان باید بعد از زمان شروع باشد.");
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
      const halfHours = (totalMinutes % 60) / 30;
      totalAmount = hours * hourlyRate + halfHours * halfHourlyRate;
    }

    bot.sendMessage(chatId, `مبلغ کل: ${totalAmount.toLocaleString()} تومان\n\n` +
      `لطفاً مبلغ بیعانه ${depositAmount.toLocaleString()} تومان به شماره کارت زیر واریز کنید:\n` +
      `<code>${depositCardNumber}</code>\n` +
      `به نام: ${cardHolderName}\n\n` +
      `فیش واریز را ارسال کنید تا رزرو شما تایید شود.`,
      { parse_mode: 'HTML' }
    );

    userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
  }
});

// راه‌اندازی سرور Express
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Your bot is listening on port ${port}`);
});
