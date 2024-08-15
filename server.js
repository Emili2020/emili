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
const adminChatId = 'YOUR_ADMIN_CHAT_ID'; // جایگزین با آیدی عددی تلگرام شما

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

// بررسی اعتبار شماره تلفن
const isValidPhoneNumber = (phone) => {
  return /^\d{11}$/.test(phone);
};

// پردازش /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const reservationId = uuidv4();
  userStates[chatId] = {
    state: states.ASKING_NAME,
    reservationId: reservationId
  };
  showMainMenu(chatId);
});

// تابع شروع مجدد
const resetUser = (chatId) => {
  delete userStates[chatId];
  delete userData[Object.keys(userData).find(id => userData[id].chatId === chatId)];
  const reservationId = uuidv4();
  userStates[chatId] = {
    state: states.ASKING_NAME,
    reservationId: reservationId
  };
  bot.sendMessage(chatId, "به ربات خوش آمدید! لطفاً نام خود را وارد کنید.");
};

// نمایش منوی اصلی
const showMainMenu = (chatId) => {
  const mainMenu = [
    [{ text: "شروع مجدد", callback_data: 'restart' }],
    [{ text: "راهنما", callback_data: 'help' }]
  ];
  bot.sendMessage(chatId, "لطفاً یکی از گزینه‌های زیر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: mainMenu
    }
  });
};

// پردازش پیام‌های متنی
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const stateInfo = userStates[chatId];

  if (!stateInfo) return;

  const { state, reservationId } = stateInfo;

  if (text === "شروع مجدد") {
    resetUser(chatId);
    return;
  }

  if (state === states.ASKING_NAME) {
    userData[reservationId] = { name: text, chatId: chatId };
    userStates[chatId].state = states.ASKING_PHONE;
    bot.sendMessage(chatId, "لطفاً شماره تلفن خود را وارد کنید.");
  } else if (state === states.ASKING_PHONE) {
    if (isValidPhoneNumber(text)) {
      userData[reservationId].phone = text;
      userStates[chatId].state = states.ASKING_DAY;
      sendDayButtons(chatId);
    } else {
      bot.sendMessage(chatId, "شماره تلفن باید ۱۱ رقم باشد. لطفاً دوباره شماره تلفن خود را وارد کنید.");
    }
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
      inline_keyboard: [...dayButtons.map(btn => [btn]), [{ text: "شروع مجدد", callback_data: 'restart' }]]
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
      inline_keyboard: [...timeButtonsInRows, [{ text: "شروع مجدد", callback_data: 'restart' }]]
    }
  });
};

// پردازش دکمه‌های Inline
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;

  if (callbackData === 'restart') {
    resetUser(chatId);
    return;
  } else if (callbackData === 'help') {
    bot.sendMessage(chatId, "برای استفاده از ربات، لطفاً مراحل زیر را دنبال کنید:\n1. نام و شماره تلفن خود را وارد کنید.\n2. روز و زمان مورد نظر را انتخاب کنید.\n3. مبلغ بیعانه را به شماره کارت زیر واریز کنید.\n\nبرای شروع مجدد، دکمه 'شروع مجدد' را بزنید.");
    return;
  }

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
    const startTime = availableTimes.indexOf(userData[reservationId].startTime);
    if (index <= startTime) {
      bot.sendMessage(chatId, "زمان پایان باید بعد از زمان شروع باشد. لطفاً مجدداً انتخاب کنید.");
      return;
    }
    userData[reservationId] = { ...userData[reservationId], endTime: availableTimes[index] };

    // محاسبه هزینه
    const startTimeMinutes = availableTimes.indexOf(userData[reservationId].startTime) * 30;
    const endTimeMinutes = availableTimes.indexOf(userData[reservationId].endTime) * 30;
    const totalMinutes = endTimeMinutes - startTimeMinutes;

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
  }
});

// راه‌اندازی سرور
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
