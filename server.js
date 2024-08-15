const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const jalaali = require('jalaali-js'); // برای تاریخ شمسی
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
  const today = new Date(); // تاریخ امروز میلادی
  const days = [];

  for (let i = 0; i < 6; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + i); // محاسبه روزهای آینده
    const jDate = jalaali.toJalaali(futureDate); // تبدیل به تاریخ شمسی

    days.push({
      day: daysOfWeek[futureDate.getDay()], // روز هفته به زبان فارسی
      date: `${jDate.jy}/${jDate.jm}/${jDate.jd}` // تاریخ شمسی
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
    bot.sendMessage(chatId, "لطفاً شماره تلفن خود را وارد کنید (11 رقمی).");
  } else if (state === states.ASKING_PHONE) {
    if (!isValidPhoneNumber(text)) {
      bot.sendMessage(chatId, "شماره تلفن معتبر نمی‌باشد. لطفاً شماره تلفن 11 رقمی صحیح وارد کنید.");
      return;
    }
    userData[reservationId].phone = text;
    userStates[chatId].state = states.ASKING_DAY;
    bot.sendMessage(chatId, "لطفاً روز مورد نظر را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getDaysButtons()
      }
    });
  } else if (state === states.ASKING_DAY) {
    const selectedDay = daysOfWeekWithDates.find(day => day.date === text);
    if (!selectedDay) {
      bot.sendMessage(chatId, "تاریخ معتبر نمی‌باشد. لطفاً یکی از تاریخ‌های پیشنهادی را انتخاب کنید.");
      return;
    }
    userData[reservationId].day = selectedDay;
    userStates[chatId].state = states.ASKING_START_TIME;
    bot.sendMessage(chatId, "لطفاً زمان شروع را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimeButtons()
      }
    });
  } else if (state === states.ASKING_START_TIME) {
    if (!availableTimes.includes(text)) {
      bot.sendMessage(chatId, "زمان شروع معتبر نمی‌باشد. لطفاً یکی از زمان‌های پیشنهادی را انتخاب کنید.");
      return;
    }
    userData[reservationId].startTime = text;
    userStates[chatId].state = states.ASKING_END_TIME;
    bot.sendMessage(chatId, "لطفاً زمان پایان را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimeButtons()
      }
    });
  } else if (state === states.ASKING_END_TIME) {
    if (!availableTimes.includes(text)) {
      bot.sendMessage(chatId, "زمان پایان معتبر نمی‌باشد. لطفاً یکی از زمان‌های پیشنهادی را انتخاب کنید.");
      return;
    }
    const startTime = userData[reservationId].startTime;
    const endTime = text;

    if (availableTimes.indexOf(endTime) <= availableTimes.indexOf(startTime)) {
      bot.sendMessage(chatId, "زمان پایان باید بعد از زمان شروع باشد.");
      return;
    }

    userData[reservationId].endTime = endTime;

    // محاسبه هزینه
    const durationInMinutes = (availableTimes.indexOf(endTime) - availableTimes.indexOf(startTime)) * 30;
    const totalCost = (durationInMinutes / 60) * hourlyRate;
    userData[reservationId].totalCost = totalCost;

    bot.sendMessage(chatId, `رزرو شما با موفقیت ثبت شد! \n\nروز: ${userData[reservationId].day.day} ${userData[reservationId].day.date}\nزمان: ${startTime} تا ${endTime}\nهزینه کل: ${totalCost} تومان\n\nلطفاً مبلغ بیعانه (${depositAmount} تومان) را به شماره کارت زیر واریز نمایید و تصویر فیش واریزی را ارسال کنید:\n\nشماره کارت: ${depositCardNumber}\nبه نام: ${cardHolderName}`);

    userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
  } else if (state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
    if (msg.photo) {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      bot.getFileLink(fileId).then(link => {
        bot.sendMessage(adminChatId, `رزرو جدید:\n\nنام: ${userData[reservationId].name}\nشماره تماس: ${userData[reservationId].phone}\nروز: ${userData[reservationId].day.day} ${userData[reservationId].day.date}\nزمان: ${userData[reservationId].startTime} تا ${userData[reservationId].endTime}\nهزینه کل: ${userData[reservationId].totalCost} تومان\n\nتصویر فیش واریزی: ${link}`);
        bot.sendMessage(chatId, "تصویر فیش واریزی با موفقیت ارسال شد. لطفاً منتظر تأیید باشید.");
      });
    } else {
      bot.sendMessage(chatId, "لطفاً تصویر فیش واریزی را ارسال کنید.");
    }
  }
});

// پردازش دستورات دکمه‌های منو
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data === 'restart') {
    resetUser(chatId);
  } else if (data === 'settings') {
    showAdminSettingsMenu(chatId);
  } else if (data === 'back_to_main') {
    showMainMenu(chatId);
  } else if (data === 'update_cost') {
    showUpdateCostMenu(chatId);
  } else if (data === 'update_hours') {
    showUpdateHoursMenu(chatId);
  }
});

const getDaysButtons = () => {
  return daysOfWeekWithDates.map(day => [{ text: `${day.day} ${day.date}`, callback_data: day.date }]);
};

const getTimeButtons = () => {
  return availableTimes.map(time => [{ text: time, callback_data: time }]);
};

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Telegram bot is running');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
