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
      // ارسال زمان‌های پایان، فیلتر شده برای نمایش فقط گزینه‌های معتبر
      sendTimeButtons(chatId, false, index);
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

      // محاسبه هزینه
      const totalMinutes = (endIndex - startIndex) * 30; // تعداد دقایق کل
      let totalCost = 0;

      // هزینه برای ساعت اول
      if (totalMinutes <= 60) {
        totalCost = hourlyRate; // هزینه ثابت برای 60 دقیقه اول
      } else {
        // هزینه برای ساعت‌های بعدی
        const additionalMinutes = totalMinutes - 60;
        const additionalHalfHours = Math.ceil(additionalMinutes / 30); // تعداد نیم‌ساعت‌های اضافی
        totalCost = hourlyRate + (additionalHalfHours * halfHourlyRate);
      }

      const user = userData[reservationId];
      bot.sendMessage(chatId, `رزرو شما با اطلاعات زیر تایید شد:\n\nنام: ${user.name}\nشماره تلفن: ${user.phone}\nروز: ${user.day}\nزمان: ${user.startTime} تا ${user.endTime}\nهزینه کل: ${totalCost.toLocaleString()} تومان`);

      // پاک کردن داده‌های کاربر
      delete userData[reservationId];
      delete userStates[chatId];
   
