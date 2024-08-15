const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-jalaali');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const app = express();

const availableTimes = [
  "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00"
];

const daysOfWeek = [
  "شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه"
];

const getDaysOfWeekWithDates = () => {
  const days = [];
  const today = moment();

  for (let i = 0; i < 7; i++) {
    const dayDate = today.clone().add(i, 'days');
    if (daysOfWeek.includes(dayDate.format('dddd'))) {
      days.push({
        day: dayDate.format('dddd'),
        date: dayDate.format('jYYYY/jMM/jDD')
      });
    }
  }
  return days;
};

const daysOfWeekWithDates = getDaysOfWeekWithDates();

let hourlyRate = 500000;
let halfHourlyRate = 250000;

const depositAmount = 500000;
const depositCardNumber = '6219861045590980';
const cardHolderName = 'میلاد پاویز';

const adminChatId = '@intage';

const userData = {};
const userStates = {};
const adminStates = {};

const states = {
  NONE: 'NONE',
  ASKING_NAME: 'ASKING_NAME',
  ASKING_PHONE: 'ASKING_PHONE',
  ASKING_DAY: 'ASKING_DAY',
  ASKING_START_TIME: 'ASKING_START_TIME',
  ASKING_END_TIME: 'ASKING_END_TIME',
  WAITING_FOR_PAYMENT_CONFIRMATION: 'WAITING_FOR_PAYMENT_CONFIRMATION',
  CONFIRMED: 'CONFIRMED',
  SETTINGS: 'SETTINGS',
  UPDATE_COST: 'UPDATE_COST',
  UPDATE_HOURS: 'UPDATE_HOURS'
};

const isValidPhoneNumber = (phone) => {
  return /^\d{11}$/.test(phone);
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const reservationId = uuidv4();
  userStates[chatId] = {
    state: states.ASKING_NAME,
    reservationId: reservationId
  };
  bot.sendMessage(chatId, "به ربات خوش آمدید! لطفاً نام خود را وارد کنید.");
});

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

const showMainMenu = (chatId) => {
  const mainMenu = [
    [{ text: "شروع مجدد", callback_data: 'restart' }],
    [{ text: "تنظیمات", callback_data: 'settings' }]
  ];
  bot.sendMessage(chatId, "لطفاً یکی از گزینه‌های زیر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: mainMenu
    }
  });
};

const showAdminSettingsMenu = (chatId) => {
  const settingsMenu = [
    [{ text: "بروزرسانی هزینه‌ها", callback_data: 'update_cost' }],
    [{ text: "بروزرسانی ساعات کاری", callback_data: 'update_hours' }],
    [{ text: "بازگشت به منوی اصلی", callback_data: 'back_to_main' }]
  ];
  bot.sendMessage(chatId, "منوی تنظیمات:", {
    reply_markup: {
      inline_keyboard: settingsMenu
    }
  });
};

const showUpdateCostMenu = (chatId) => {
  bot.sendMessage(chatId, "لطفاً هزینه جدید به ازای هر ساعت را وارد کنید.");
  adminStates[chatId] = { state: states.UPDATE_COST };
};

const showUpdateHoursMenu = (chatId) => {
  bot.sendMessage(chatId, "لطفاً ساعات کاری جدید را به صورت زیر وارد کنید (مثال: 14:00-21:00).");
  adminStates[chatId] = { state: states.UPDATE_HOURS };
};

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const stateInfo = userStates[chatId];
  const adminState = adminStates[chatId];

  if (adminState) {
    if (adminState.state === states.UPDATE_COST) {
      const newHourlyRate = parseInt(text, 10);
      if (isNaN(newHourlyRate) || newHourlyRate <= 0) {
        bot.sendMessage(chatId, "لطفاً هزینه معتبر به ازای هر ساعت را وارد کنید.");
        return;
      }
      hourlyRate = newHourlyRate;
      halfHourlyRate = hourlyRate / 2;
      bot.sendMessage(chatId, `هزینه‌ها با موفقیت بروزرسانی شد.\n\nهزینه جدید به ازای هر ساعت: ${hourlyRate} تومان\nهزینه به ازای هر نیم‌ساعت: ${halfHourlyRate} تومان`);
      delete adminStates[chatId];
      showAdminSettingsMenu(chatId);
    } else if (adminState.state === states.UPDATE_HOURS) {
      bot.sendMessage(chatId, "ساعات کاری جدید ذخیره شد.");
      delete adminStates[chatId];
      showAdminSettingsMenu(chatId);
    }
    return;
  }

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
      bot.sendMessage(chatId, "لطفاً فیش واریز خود را ارسال کنید.");
    }
  }
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const callbackData = query.data;
  const stateInfo = userStates[chatId];

  if (stateInfo && stateInfo.state === states.ASKING_DAY) {
    if (callbackData.startsWith('day_')) {
      const index = parseInt(callbackData.split('_')[1], 10);
      const selectedDay = daysOfWeekWithDates[index];
      userData[stateInfo.reservationId].day = selectedDay;
      userStates[chatId].state = states.ASKING_START_TIME;
      sendTimeButtons(chatId, 'start');
    }
  } else if (stateInfo && stateInfo.state === states.ASKING_START_TIME) {
    if (callbackData.startsWith('start_time_')) {
      const startTime = callbackData.split('_')[2];
      userData[stateInfo.reservationId].startTime = startTime;
      userStates[chatId].state = states.ASKING_END_TIME;
      sendTimeButtons(chatId, 'end');
    }
  } else if (stateInfo && stateInfo.state === states.ASKING_END_TIME) {
    if (callbackData.startsWith('end_time_')) {
      const endTime = callbackData.split('_')[2];
      userData[stateInfo.reservationId].endTime = endTime;
      userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
      bot.sendMessage(chatId, `رزرو شما با موفقیت انجام شد.\n\nجزئیات رزرو:\nنام: ${userData[stateInfo.reservationId].name}\nشماره تلفن: ${userData[stateInfo.reservationId].phone}\nروز: ${userData[stateInfo.reservationId].day.day}\nتاریخ: ${userData[stateInfo.reservationId].day.date}\nساعت شروع: ${userData[stateInfo.reservationId].startTime}\nساعت پایان: ${userData[stateInfo.reservationId].endTime}\n\nلطفاً مبلغ بیعانه ${depositAmount} تومان را به شماره کارت ${depositCardNumber} واریز کنید.\n\nلطفاً فیش واریز را ارسال کنید.`);
    }
  } else if (callbackData === 'settings') {
    showAdminSettingsMenu(chatId);
  } else if (callbackData === 'restart') {
    resetUser(chatId);
  } else if (callbackData === 'back_to_main') {
    showMainMenu(chatId);
  }
});

const sendTimeButtons = (chatId, type) => {
  const timeButtons = availableTimes.map((time) => ({
    text: time,
    callback_data: `${type}_time_${time}`
  }));

  const buttonRows = [];
  for (let i = 0; i < timeButtons.length; i += 4) {
    buttonRows.push(timeButtons.slice(i, i + 4));
  }

  bot.sendMessage(chatId, `لطفاً زمان ${type === 'start' ? 'شروع' : 'پایان'} را انتخاب کنید:`, {
    reply_markup: {
      inline_keyboard: buttonRows
    }
  });
};

bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  if (chatId === adminChatId) {
    showAdminSettingsMenu(chatId);
  } else {
    bot.sendMessage(chatId, "شما مجاز به دسترسی به تنظیمات نیستید.");
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
