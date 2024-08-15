const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid'); // برای تولید شناسه منحصر به فرد

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
const hourlyRate = 500000;   // هزینه برای هر ساعت
const halfHourlyRate = 250000; // هزینه برای هر نیم‌ساعت

// مبلغ بیعانه
const depositAmount = 500000;

// شماره کارت برای واریز بیعانه
const depositCardNumber = '6219861045590980';
const cardHolderName = 'میلاد پاویز';

// آیدی تلگرام مدیر برای دریافت فیش واریز
const adminChatId = 'YOUR_ADMIN_CHAT_ID'; // جایگزین با آیدی تلگرام شما

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
  ASKING_CARD_NUMBER: 'ASKING_CARD_NUMBER',
  WAITING_FOR_RECEIPT: 'WAITING_FOR_RECEIPT',
  CONFIRMED: 'CONFIRMED'
};

// پردازش /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const reservationId = uuidv4(); // تولید شناسه منحصر به فرد
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
    console.log(`Reservation ${reservationId}: User ${chatId} provided name: ${text}`);
    userStates[chatId].state = states.ASKING_PHONE;
    bot.sendMessage(chatId, "لطفاً شماره تلفن خود را وارد کنید.");
  } else if (state === states.ASKING_PHONE) {
    userData[reservationId].phone = text;
    console.log(`Reservation ${reservationId}: User ${chatId} provided phone: ${text}`);
    userStates[chatId].state = states.ASKING_DAY;
    sendDayButtons(chatId);
  } else if (state === states.ASKING_CARD_NUMBER) {
    // مرحله پایانی - دریافت شماره کارت
    bot.sendMessage(chatId, `<b>شماره کارت برای واریز بیعانه:</b>\n<code>${depositCardNumber}</code>\n<b>به نام:</b> ${cardHolderName}`, { parse_mode: 'HTML' });
    // پاک کردن داده‌های کاربر
    delete userData[reservationId];
    delete userStates[chatId];
  } else if (state === states.WAITING_FOR_RECEIPT) {
    // فوروارد کردن فیش واریز به مدیر
    if (msg.photo) {
      bot.forwardMessage(adminChatId, chatId, msg.message_id);
      bot.sendMessage(chatId, "فیش واریز دریافت شد. لطفاً صبور باشید تا وضعیت پرداخت بررسی شود.");

      // فرض می‌کنیم که وضعیت پرداخت به صورت دستی تایید می‌شود
      // برای آزمایش، به طور دستی وضعیت را تایید کنید
      userStates[chatId].state = states.CONFIRMED;
      bot.sendMessage(chatId, "رزرو شما تایید شد. زمان شما فیکس شده است.");
      // ذخیره‌سازی رزرو نهایی
      console.log(`Reservation ${userData[reservationId].reservationId} confirmed for user ${chatId}`);
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

  console.log(`Sending day buttons to user: ${chatId}`);
  bot.sendMessage(chatId, "لطفاً روز مورد نظر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: [dayButtons]
    }
  });
};

// ارسال دکمه‌های زمان
const sendTimeButtons = (chatId, isStartTime, startTimeIndex = 0) => {
  // انتخاب زمان‌ها برای شروع یا پایان
  const timeButtons = availableTimes.map((time, index) => ({
    text: time,
    callback_data: `${isStartTime ? 'start_' : 'end_'}${index}`
  }));

  // اگر زمان شروع انتخاب شده باشد، فیلتر کردن زمان‌های پایان
  const filteredTimeButtons = isStartTime
    ? timeButtons
    : timeButtons.filter((_, index) => index > startTimeIndex);

  // تقسیم دکمه‌ها به چند ردیف برای نمایش بهتر
  const timeButtonsInRows = [];
  for (let i = 0; i < filteredTimeButtons.length; i += 2) {
    timeButtonsInRows.push(filteredTimeButtons.slice(i, i + 2));
  }

  console.log(`Sending time buttons to user: ${chatId}`);
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

  // تجزیه داده‌های callback_data
  const parts = callbackData.split('_');
  const type = parts[0];
  const index = parseInt(parts[1], 10);

  console.log(`Callback data: ${callbackData}`);
  console.log(`Parsed type: ${type}, index: ${index}`);

  const stateInfo = userStates[chatId];

  if (!stateInfo) return;

  const { reservationId } = stateInfo;

  if (type === 'day') {
    if (isNaN(index) || index < 0 || index >= daysOfWeek.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای روز انجام دهید.");
      return;
    }
    userData[reservationId] = { ...userData[reservationId], day: daysOfWeek[index] };
    console.log(`Reservation ${reservationId}: User ${chatId} selected day: ${daysOfWeek[index]}`);
    userStates[chatId].state = states.ASKING_START_TIME;
    sendTimeButtons(chatId, true); // ارسال دکمه‌های زمان شروع
  } else if (type.startsWith('start')) {
    if (isNaN(index) || index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان شروع انجام دهید.");
      return;
    }
    userData[reservationId] = { ...userData[reservationId], startTime: availableTimes[index] };
    console.log(`Reservation ${reservationId}: User ${chatId} selected start time: ${availableTimes[index]}`);
    userStates[chatId].state = states.ASKING_END_TIME;
    sendTimeButtons(chatId, false, index); // ارسال دکمه‌های زمان پایان
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

    // نمایش مبلغ کل
    bot.sendMessage(chatId, `مبلغ کل: ${totalAmount.toLocaleString()} تومان\n\n` +
      `لطفاً مبلغ بیعانه ${depositAmount.toLocaleString()} تومان به شماره کارت زیر واریز کنید:\n` +
      `<code>${depositCardNumber}</code>\n` +
      `به نام: ${cardHolderName}\n\n` +
      `فیش واریز را ارسال کنید تا رزرو شما تایید شود.`,
      { parse_mode: 'HTML' }
    );

    // تغییر وضعیت به مرحله ارسال فیش واریز
    userStates[chatId].state = states.WAITING_FOR_RECEIPT;
  }
});

// راه‌اندازی سرور Express
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Your bot is listening on port ${port}`);
});
