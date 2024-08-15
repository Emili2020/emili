const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-jalaali'); // برای تاریخ شمسی
require('dotenv').config(); // بارگذاری متغیرهای محیطی

const token = process.env.TELEGRAM_TOKEN; // استفاده از توکن از فایل .env
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

// محاسبه روزهای هفته با تاریخ شمسی صحیح
const getDaysWithDates = () => {
  const today = moment(); // تاریخ امروز میلادی
  const days = [];
  
  for (let i = 0; i < 6; i++) {
    const dayDate = today.clone().add(i, 'days'); // روزهای آینده
    days.push({
      day: daysOfWeek[dayDate.day()], // روز هفته
      date: dayDate.format('jYYYY/jMM/jDD') // تاریخ شمسی
    });
  }

  return days;
};

const daysOfWeekWithDates = getDaysWithDates();

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
  bot.sendMessage(chatId, "به ربات خوش آمدید! لطفاً نام خود را وارد کنید.");
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
  const dayButtons = daysOfWeekWithDates.map((day, index) => ({
    text: `${day.day} (${day.date})`,
    callback_data: `day_${index}`
  }));

  bot.sendMessage(chatId, "لطفاً روز مورد نظر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: [
        dayButtons.slice(0, 3), // دکمه‌های روز اول
        dayButtons.slice(3) // دکمه‌های روز دوم
      ]
    }
  });
};

// پردازش دکمه‌های روز
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const queryData = query.data;
  const stateInfo = userStates[chatId];
  const reservationId = stateInfo?.reservationId;

  if (queryData.startsWith('day_')) {
    const dayIndex = parseInt(queryData.split('_')[1], 10);
    const selectedDay = daysOfWeekWithDates[dayIndex];
    userData[reservationId].day = selectedDay;

    userStates[chatId].state = states.ASKING_START_TIME;
    bot.sendMessage(chatId, "لطفاً زمان شروع را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimesButtons()
      }
    });
  }
});

// دریافت دکمه‌های زمان
const getTimesButtons = () => {
  return availableTimes.map(time => ({
    text: time,
    callback_data: `time_${time}`
  })).reduce((rows, button, index) => {
    if (index % 4 === 0) rows.push([]);
    rows[rows.length - 1].push(button);
    return rows;
  }, []);
};

// پردازش دکمه‌های زمان
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const queryData = query.data;
  const stateInfo = userStates[chatId];
  const reservationId = stateInfo?.reservationId;

  if (queryData.startsWith('time_')) {
    const selectedTime = queryData.split('_')[1];
    if (stateInfo.state === states.ASKING_START_TIME) {
      userData[reservationId].startTime = selectedTime;
      userStates[chatId].state = states.ASKING_END_TIME;
      bot.sendMessage(chatId, "لطفاً زمان پایان را انتخاب کنید:", {
        reply_markup: {
          inline_keyboard: getTimesButtons()
        }
      });
    } else if (stateInfo.state === states.ASKING_END_TIME) {
      userData[reservationId].endTime = selectedTime;
      userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;

      const startTime = userData[reservationId].startTime;
      const endTime = userData[reservationId].endTime;
      const totalAmount = (availableTimes.indexOf(endTime) - availableTimes.indexOf(startTime) + 1) * halfHourlyRate;

      bot.sendMessage(chatId, `زمان رزرو شما: ${startTime} تا ${endTime}\nمبلغ کل: ${totalAmount} تومان\n\nلطفاً فیش واریز به شماره کارت ${depositCardNumber} به نام ${cardHolderName} را ارسال کنید.`);
    }
  }
});

// پردازش منوی تنظیمات
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const queryData = query.data;

  if (queryData === 'settings') {
    if (chatId === adminChatId) {
      showAdminSettingsMenu(chatId);
    } else {
      bot.sendMessage(chatId, "شما دسترسی به تنظیمات ندارید.");
    }
  } else if (queryData === 'update_cost') {
    if (chatId === adminChatId) {
      showUpdateCostMenu(chatId);
    }
  } else if (queryData === 'update_hours') {
    if (chatId === adminChatId) {
      showUpdateHoursMenu(chatId);
    }
  } else if (queryData === 'back_to_main') {
    if (chatId === adminChatId) {
      showMainMenu(chatId);
    }
  } else if (queryData === 'restart') {
    resetUser(chatId);
  }
});

// پردازش پیام‌های متنی به عنوان فیش واریز
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (userStates[chatId]?.state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
    if (msg.photo) {
      bot.forwardMessage(adminChatId, chatId, msg.message_id);
      bot.sendMessage(chatId, "فیش واریز دریافت شد. لطفاً صبور باشید تا وضعیت پرداخت بررسی شود.");
    } else {
      bot.sendMessage(chatId, "لطفاً فیش واریز را ارسال کنید.");
    }
  }
});
