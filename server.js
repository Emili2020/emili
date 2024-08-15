const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

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

// وضعیت‌های مختلف
const states = {
  NONE: 'NONE',
  ASKING_NAME: 'ASKING_NAME',
  ASKING_PHONE: 'ASKING_PHONE',
  ASKING_TIME: 'ASKING_TIME'
};

// ذخیره وضعیت کاربر
const userStates = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userStates[chatId] = states.ASKING_NAME;
  bot.sendMessage(chatId, "به ربات خوش آمدید! لطفاً نام خود را وارد کنید.");
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userStates[chatId]) return;

  if (userStates[chatId] === states.ASKING_NAME) {
    userData[chatId] = { name: text };
    userStates[chatId] = states.ASKING_PHONE;
    bot.sendMessage(chatId, "لطفاً شماره تلفن خود را وارد کنید.");
  } else if (userStates[chatId] === states.ASKING_PHONE) {
    userData[chatId].phone = text;
    userStates[chatId] = states.ASKING_TIME;
    sendDayButtons(chatId);
  } else if (userStates[chatId] === states.ASKING_TIME) {
    handleReservation(chatId, text);
  }
});

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

const handleReservation = (chatId, text) => {
  const [type, ...args] = text.split('_');

  if (type === 'day') {
    const selectedDayIndex = args[0];
    const selectedDay = daysOfWeek[selectedDayIndex];

    const timeButtons = availableTimes.map((time, index) => ({
      text: time,
      callback_data: `time_${selectedDay}_${index}`
    }));

    bot.sendMessage(chatId, `روز انتخاب شده: ${selectedDay}\nلطفاً زمان مورد نظر را انتخاب کنید:`, {
      reply_markup: {
        inline_keyboard: [timeButtons]
      }
    });

  } else if (type === 'time') {
    const [selectedDay, timeIndex] = args;
    const selectedTime = availableTimes[timeIndex];
    const user = userData[chatId];

    bot.sendMessage(chatId, `رزرو شما با اطلاعات زیر تایید شد:\n\nنام: ${user.name}\nشماره تلفن: ${user.phone}\nروز: ${selectedDay}\nزمان: ${selectedTime}`);
    
    // پاک کردن داده‌های کاربر
    delete userData[chatId];
    delete userStates[chatId];
  }
};

// پردازش دکمه‌های Inline
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;
  const [type, ...args] = callbackData.split('_');

  if (type === 'day') {
    const selectedDayIndex = args[0];
    const selectedDay = daysOfWeek[selectedDayIndex];

    const timeButtons = availableTimes.map((time, index) => ({
      text: time,
      callback_data: `time_${selectedDay}_${index}`
    }));

    bot.sendMessage(chatId, `روز انتخاب شده: ${selectedDay}\nلطفاً زمان مورد نظر را انتخاب کنید:`, {
      reply_markup: {
        inline_keyboard: [timeButtons]
      }
    });

  } else if (type === 'time') {
    const [selectedDay, timeIndex] = args;
    const selectedTime = availableTimes[timeIndex];
    const user = userData[chatId];

    bot.sendMessage(chatId, `رزرو شما با اطلاعات زیر تایید شد:\n\nنام: ${user.name}\nشماره تلفن: ${user.phone}\nروز: ${selectedDay}\nزمان: ${selectedTime}`);
    
    // پاک کردن داده‌های کاربر
    delete userData[chatId];
    delete userStates[chatId];
  }
});

// سرویس نگهداری Glitch برای بیدار نگه داشتن برنامه
app.get("/", (request, response) => {
  response.sendStatus(200);
});

const listener = app.listen(process.env.PORT, () => {
  console.log("Your bot is listening on port " + listener.address().port);
});
