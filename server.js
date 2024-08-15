const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-jalaali'); // برای استفاده از تاریخ شمسی

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
let hourlyRate = 500000;
let halfHourlyRate = 250000;

// مبلغ بیعانه
const depositAmount = 500000;

// شماره کارت برای واریز بیعانه
const depositCardNumber = '6219861045590980';
const cardHolderName = 'میلاد پاویز';

// آیدی تلگرام مدیر برای دریافت فیش واریز
const adminChatId = '@intage'; // جایگزین با آیدی عددی تلگرام شما

// ذخیره‌سازی اطلاعات کاربر
const userData = {};
const userStates = {};
const adminStates = {};

// وضعیت‌های مختلف
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
    [{ text: "تنظیمات", callback_data: 'settings' }]
  ];
  bot.sendMessage(chatId, "لطفاً یکی از گزینه‌های زیر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: mainMenu
    }
  });
};

// نمایش منوی تنظیمات برای مدیر
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

// نمایش منوی تغییر هزینه‌ها
const showUpdateCostMenu = (chatId) => {
  bot.sendMessage(chatId, "لطفاً هزینه جدید به ازای هر ساعت را وارد کنید.");
  adminStates[chatId] = { state: states.UPDATE_COST };
};

// نمایش منوی تغییر ساعات کاری
const showUpdateHoursMenu = (chatId) => {
  bot.sendMessage(chatId, "لطفاً ساعات کاری جدید را به صورت زیر وارد کنید (مثال: 14:00-21:00).");
  adminStates[chatId] = { state: states.UPDATE_HOURS };
};

// پردازش پیام‌های متنی
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
      // TODO: Update working hours logic if necessary
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
      bot.sendMessage(chatId, "لطفاً فیش واریز را ارسال کنید.");
    }
  }
});

// ارسال دکمه‌های روز
const sendDayButtons = (chatId) => {
  const dayButtons = daysOfWeek.map((day, index) => {
    const today = moment().format('jYYYY/jMM/jDD');
    return {
      text: `${day} (${today})`,
      callback_data: `day_${index}`
    };
  });

  bot.sendMessage(chatId, "لطفاً روز مورد نظر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: [
        ...dayButtons.slice(0, 3).map(btn => [btn]), // نمایش در دو ستون
        ...dayButtons.slice(3, 6).map(btn => [btn]), // نمایش در دو ستون
        [{ text: "شروع مجدد", callback_data: 'restart' }]
      ]
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

  bot.sendMessage(chatId, `لطفاً زمان ${isStartTime ? 'شروع' : 'پایان'} را انتخاب کنید:`, {
    reply_markup: {
      inline_keyboard: [
        ...filteredTimeButtons.slice(0, 5).map(btn => [btn]), // نمایش در چند ردیف
        [{ text: "شروع مجدد", callback_data: 'restart' }]
      ]
    }
  });
};

// پردازش انتخاب‌های کاربر
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const stateInfo = userStates[chatId];

  if (data === 'restart') {
    resetUser(chatId);
    return;
  }

  if (!stateInfo) return;

  const { state, reservationId } = stateInfo;

  if (state === states.ASKING_DAY) {
    const dayIndex = parseInt(data.split('_')[1], 10);
    const selectedDay = daysOfWeek[dayIndex];
    userData[reservationId].day = selectedDay;
    userStates[chatId].state = states.ASKING_START_TIME;
    sendTimeButtons(chatId, true);
  } else if (state === states.ASKING_START_TIME) {
    const startTimeIndex = parseInt(data.split('_')[1], 10);
    const startTime = availableTimes[startTimeIndex];
    userData[reservationId].startTime = startTime;
    userStates[chatId].state = states.ASKING_END_TIME;
    sendTimeButtons(chatId, false, startTimeIndex);
  } else if (state === states.ASKING_END_TIME) {
    const endTimeIndex = parseInt(data.split('_')[1], 10);
    const endTime = availableTimes[endTimeIndex];
    const startTime = userData[reservationId].startTime;

    if (availableTimes.indexOf(endTime) <= availableTimes.indexOf(startTime)) {
      bot.sendMessage(chatId, "زمان پایان باید بعد از زمان شروع باشد. لطفاً زمان پایان را دوباره انتخاب کنید.");
      return;
    }

    userData[reservationId].endTime = endTime;
    userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;

    bot.sendMessage(chatId, `رزرو شما با موفقیت ثبت شد.\n\nنام: ${userData[reservationId].name}\nشماره تلفن: ${userData[reservationId].phone}\nروز: ${userData[reservationId].day}\nزمان شروع: ${startTime}\nزمان پایان: ${endTime}\n\nمبلغ قابل پرداخت: ${calculateTotalCost(startTime, endTime)} تومان\n\nلطفاً فیش واریز را ارسال کنید.`);
  }
});

// محاسبه مبلغ کل
const calculateTotalCost = (startTime, endTime) => {
  const startIndex = availableTimes.indexOf(startTime);
  const endIndex = availableTimes.indexOf(endTime);
  const duration = endIndex - startIndex;
  return (duration * halfHourlyRate);
};

// پردازش پیام‌های فیش واریز
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const stateInfo = userStates[chatId];

  if (stateInfo && stateInfo.state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
    bot.forwardMessage(adminChatId, chatId, msg.message_id);
    bot.sendMessage(chatId, "فیش واریز دریافت شد. لطفاً صبور باشید تا وضعیت پرداخت بررسی شود.");
  }
});

// پردازش منوی تنظیمات برای مدیر
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (chatId === adminChatId) {
    if (data === 'settings') {
      showAdminSettingsMenu(chatId);
    } else if (data === 'update_cost') {
      showUpdateCostMenu(chatId);
    } else if (data === 'update_hours') {
      showUpdateHoursMenu(chatId);
    } else if (data === 'back_to_main') {
      showMainMenu(chatId);
    }
  }
});

// راه‌اندازی وب‌سرور
app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
});
