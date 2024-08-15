const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid'); // برای تولید شناسه منحصر به فرد

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();

// زمان‌های قابل رزرو از 14:00 تا 21:00
const availableTimes = [
  "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00"
];

// روزهای هفته بدون جمعه
const daysOfWeek = [
  "شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه"
];

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
  ASKING_END_TIME: 'ASKING_END_TIME'
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
const sendTimeButtons = (chatId, isStartTime) => {
  const timeButtons = availableTimes.map((time, index) => ({
    text: time,
    callback_data: `${isStartTime ? 'start_' : 'end_'}${index}`
  }));

  // تقسیم دکمه‌ها به چند ردیف برای نمایش بهتر
  const timeButtonsInRows = [];
  for (let i = 0; i < timeButtons.length; i += 2) {
    timeButtonsInRows.push(timeButtons.slice(i, i + 2));
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
    userData[reservationId].day = daysOfWeek[index];
    console.log(`Reservation ${reservationId}: User ${chatId} selected day: ${daysOfWeek[index]}`);
    userStates[chatId].state = states.ASKING_START_TIME;
    sendTimeButtons(chatId, true);
  } else if (type === 'start' || type === 'end') {
    if (isNaN(index) || index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان انجام دهید.");
      return;
    }

    const selectedTime = availableTimes[index];

    if (type === 'start') {
      userData[reservationId].startTime = selectedTime;
      console.log(`Reservation ${reservationId}: User ${chatId} selected start time: ${selectedTime}`);
      userStates[chatId].state = states.ASKING_END_TIME;
      sendTimeButtons(chatId, false);
    } else if (type === 'end') {
      if (!userData[reservationId].startTime) {
        bot.sendMessage(chatId, "لطفاً ابتدا زمان شروع را انتخاب کنید.");
        return;
      }
      userData[reservationId].endTime = selectedTime;
      console.log(`Reservation ${reservationId}: User ${chatId} selected end time: ${selectedTime}`);

      // بررسی اعتبار بازه زمانی
      const startIndex = availableTimes.indexOf(userData[reservationId].startTime);
      const endIndex = availableTimes.indexOf(selectedTime);

      if (endIndex <= startIndex) {
        bot.sendMessage(chatId, "زمان پایان باید بعد از زمان شروع باشد. لطفاً زمان پایان را دوباره انتخاب کنید.");
        return;
      }

      const user = userData[reservationId];
      bot.sendMessage(chatId, `رزرو شما با اطلاعات زیر تایید شد:\n\nنام: ${user.name}\nشماره تلفن: ${user.phone}\nروز: ${user.day}\nزمان: ${user.startTime} تا ${user.endTime}`);

      // پاک کردن داده‌های کاربر
      delete userData[reservationId];
      delete userStates[chatId];
    }
  }
});

// سرویس نگهداری Glitch برای بیدار نگه داشتن برنامه
app.get("/", (request, response) => {
  response.sendStatus(200);
});

const listener = app.listen(process.env.PORT, () => {
  console.log("Your bot is listening on port " + listener.address().port);
});
