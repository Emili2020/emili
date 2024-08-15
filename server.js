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
  ASKING_DAY: 'ASKING_DAY',
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
    userStates[chatId] = states.ASKING_DAY;
    sendDayButtons(chatId);
  } else if (userStates[chatId] === states.ASKING_DAY) {
    // این بخش برای پردازش انتخاب روز از دکمه‌های Inline است و ممکن است نیازی به پردازش `message` نداشته باشد
  } else if (userStates[chatId] === states.ASKING_TIME) {
    // این بخش برای پردازش انتخاب زمان از دکمه‌های Inline است و ممکن است نیازی به پردازش `message` نداشته باشد
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

const sendTimeButtons = (chatId) => {
  const timeButtons = availableTimes.map((time, index) => ({
    text: time,
    callback_data: `time_${index}`
  }));

  bot.sendMessage(chatId, "لطفاً زمان مورد نظر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: [timeButtons]
    }
  });
};

// پردازش دکمه‌های Inline
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;
  const [type, index] = callbackData.split('_').map(Number);

  if (type === 'day') {
    if (index < 0 || index >= daysOfWeek.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای روز انجام دهید.");
      return;
    }
    userData[chatId].day = daysOfWeek[index];
    userStates[chatId] = states.ASKING_TIME;
    sendTimeButtons(chatId);
  } else if (type === 'time') {
    if (index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان انجام دهید.");
      return;
    }
    userData[chatId].time = availableTimes[index];
    const user = userData[chatId];
    bot.sendMessage(chatId, `رزرو شما با اطلاعات زیر تایید شد:\n\nنام: ${user.name}\nشماره تلفن: ${user.phone}\nروز: ${user.day}\nزمان: ${user.time}`);
    
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

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  console.log(`Received message: ${text} from user: ${chatId}`); // لاگ ورودی‌های پیام

  if (!userStates[chatId]) return;

  if (userStates[chatId] === states.ASKING_NAME) {
    userData[chatId] = { name: text };
    console.log(`User ${chatId} provided name: ${text}`); // لاگ نام کاربر
    userStates[chatId] = states.ASKING_PHONE;
    bot.sendMessage(chatId, "لطفاً شماره تلفن خود را وارد کنید.");
  } else if (userStates[chatId] === states.ASKING_PHONE) {
    userData[chatId].phone = text;
    console.log(`User ${chatId} provided phone: ${text}`); // لاگ شماره تلفن کاربر
    userStates[chatId] = states.ASKING_DAY;
    sendDayButtons(chatId);
  }
});

bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const callbackData = callbackQuery.data;
  const [type, index] = callbackData.split('_').map(Number);

  console.log(`Callback query received: ${callbackData} from user: ${chatId}`); // لاگ داده‌های callback

  if (type === 'day') {
    console.log(`User ${chatId} selected day index: ${index}`); // لاگ انتخاب روز

    if (index < 0 || index >= daysOfWeek.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای روز انجام دهید.");
      return;
    }
    userData[chatId].day = daysOfWeek[index];
    userStates[chatId] = states.ASKING_TIME;
    sendTimeButtons(chatId);
  } else if (type === 'time') {
    console.log(`User ${chatId} selected time index: ${index}`); // لاگ انتخاب زمان

    if (index < 0 || index >= availableTimes.length) {
      bot.sendMessage(chatId, "لطفاً یک انتخاب معتبر برای زمان انجام دهید.");
      return;
    }
    userData[chatId].time = availableTimes[index];
    const user = userData[chatId];
    bot.sendMessage(chatId, `رزرو شما با اطلاعات زیر تایید شد:\n\nنام: ${user.name}\nشماره تلفن: ${user.phone}\nروز: ${user.day}\nزمان: ${user.time}`);
    
    // پاک کردن داده‌های کاربر
    delete userData[chatId];
    delete userStates[chatId];
  }
});

