const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
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
  "شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"
];

const getDaysWithDates = () => {
  const today = new Date();
  const days = [];
  
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() + i);
    const dayName = daysOfWeek[dayDate.getDay()]; // روز هفته
    const dayFormatted = dayDate.toISOString().split('T')[0]; // تاریخ میلادی
    days.push({
      day: dayName,
      date: dayFormatted
    });
  }

  return days;
};

const daysOfWeekWithDates = getDaysWithDates();

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
    bot.sendMessage(chatId, "لطفاً شماره تلفن خود را وارد کنید (11 رقمی).");
  } else if (state === states.ASKING_PHONE) {
    if (!isValidPhoneNumber(text)) {
      bot.sendMessage(chatId, "شماره تلفن معتبر نمی‌باشد. لطفاً شماره تلفن 11 رقمی صحیح وارد کنید.");
      return;
    }
    userData[reservationId].phone = text;
    userStates[chatId].state = states.ASKING_DAY;
    bot.sendMessage(chatId, "لطفاً یکی از روزهای هفته را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getDaysButtons()
      }
    });
  } else if (state === states.ASKING_DAY) {
    userStates[chatId].state = states.ASKING_START_TIME;
    bot.sendMessage(chatId, "لطفاً زمان شروع را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimesButtons()
      }
    });
  }
});

const getDaysButtons = () => {
  return daysOfWeekWithDates.map((dayObj) => [{
    text: `${dayObj.day} (${dayObj.date})`,
    callback_data: `day_${dayObj.date}`
  }]);
};

const getTimesButtons = () => {
  return availableTimes.map((time) => [{
    text: time,
    callback_data: `time_${time}`
  }]);
};

bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const stateInfo = userStates[chatId];

  if (!stateInfo) return;

  const { state, reservationId } = stateInfo;
  const data = callbackQuery.data;

  if (state === states.ASKING_DAY) {
    const selectedDay = data.split('_')[1];
    userData[reservationId].day = selectedDay;
    userStates[chatId].state = states.ASKING_START_TIME;
    bot.sendMessage(chatId, "لطفاً زمان شروع را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimesButtons()
      }
    });
  } else if (state === states.ASKING_START_TIME) {
    const selectedTime = data.split('_')[1];
    userData[reservationId].startTime = selectedTime;
    userStates[chatId].state = states.ASKING_END_TIME;
    bot.sendMessage(chatId, "لطفاً زمان پایان را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimesButtons()
      }
    });
  } else if (state === states.ASKING_END_TIME) {
    const selectedEndTime = data.split('_')[1];
    userData[reservationId].endTime = selectedEndTime;
    const { name, phone, day, startTime, endTime } = userData[reservationId];
    const confirmationMessage = `
      رزرو شما به شرح زیر می‌باشد:
      \nنام: ${name}
      \nتلفن: ${phone}
      \nروز: ${day}
      \nساعت شروع: ${startTime}
      \nساعت پایان: ${endTime}
      \nلطفاً مبلغ ${depositAmount} تومان به شماره کارت ${depositCardNumber} به نام ${cardHolderName} واریز کرده و فیش واریزی را ارسال کنید.
    `;
    bot.sendMessage(chatId, confirmationMessage);
    userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
  }
});

bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const stateInfo = userStates[chatId];

  if (!stateInfo || stateInfo.state !== states.WAITING_FOR_PAYMENT_CONFIRMATION) return;

  const reservationId = stateInfo.reservationId;
  const user = userData[reservationId];

  bot.sendMessage(adminChatId, `
    رزرو جدید:
    \nنام: ${user.name}
    \nتلفن: ${user.phone}
    \nروز: ${user.day}
    \nساعت شروع: ${user.startTime}
    \nساعت پایان: ${user.endTime}
    \nلطفاً پرداخت را بررسی کرده و تایید کنید.
  `);

  bot.sendMessage(chatId, "فیش شما ارسال شد و منتظر تایید می‌باشد.");
  userStates[chatId].state = states.CONFIRMED;
});
