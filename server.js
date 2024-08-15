const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
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

// هزینه به ازای هر ساعت و نیم‌ساعت
let hourlyRate = 500000;

// مبلغ بیعانه
const depositAmount = 500000;

// شماره کارت برای واریز بیعانه
const depositCardNumber = '6219861045590980';
const cardHolderName = 'میلاد پاویز';

// آیدی تلگرام مدیر برای دریافت فیش واریز
const adminChatId = '841548105'; // جایگزین با chatId مدیر

// ذخیره‌سازی اطلاعات کاربر
const userData = {};
const userStates = {};
const adminStates = {};
const pendingPayments = {}; // برای نگهداری پرداخت‌های در انتظار تأیید مدیر
const bookings = {}; // برای ذخیره‌سازی رزروهای تأیید شده

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
  UPDATE_HOURS: 'UPDATE_HOURS',
  WAITING_FOR_ADMIN_CONFIRMATION: 'WAITING_FOR_ADMIN_CONFIRMATION',
  VIEW_BOOKINGS: 'VIEW_BOOKINGS'
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
  bot.sendMessage(chatId, "به ربات رزرو تایم استودیو پاویز خوش آمدید.");
};

// نمایش منوی اصلی
const showMainMenu = (chatId) => {
  const mainMenu = [
    [{ text: "شروع مجدد", callback_data: 'restart' }],
    [{ text: "تنظیمات", callback_data: 'settings' }],
    [{ text: "نمایش رزروهای موجود", callback_data: 'view_bookings' }]
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

// نمایش رزروهای موجود
const showAvailableBookings = (chatId) => {
  const message = Object.keys(bookings).length === 0
    ? "هیچ رزرو فعالی وجود ندارد."
    : "رزروهای موجود:\n" + Object.values(bookings).map(b => 
      `رزرو: ${b.name}\nروز: ${b.day}\nزمان شروع: ${b.startTime}\nزمان پایان: ${b.endTime}\n\n`
    ).join('');
  bot.sendMessage(chatId, message);
};

// تابعی برای ارسال اطلاعات کاربر به مدیر
const notifyAdmin = (reservationId) => {
  const data = userData[reservationId];
  if (!data) return;

  const message = `
  اطلاعات جدید ثبت‌شده:
  نام: ${data.name}
  شماره تلفن: ${data.phone}
  روز: ${data.day}
  زمان شروع: ${data.startTime}
  زمان پایان: ${data.endTime}
  `;

  bot.sendMessage(adminChatId, message);
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
      bot.sendMessage(chatId, `هزینه‌ها با موفقیت بروزرسانی شد.\n\nهزینه جدید به ازای هر ساعت: ${hourlyRate} تومان`);
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
  }
});

// پردازش دکمه‌های کیبورد درون‌خطی
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const stateInfo = userStates[chatId];
  const adminState = adminStates[chatId];

  if (adminState) {
    if (data === 'update_cost') {
      showUpdateCostMenu(chatId);
    } else if (data === 'update_hours') {
      showUpdateHoursMenu(chatId);
    } else if (data === 'back_to_main') {
      showMainMenu(chatId);
    }
    return;
  }

  if (stateInfo) {
    const { state, reservationId } = stateInfo;

    if (state === states.ASKING_DAY) {
      if (!daysOfWeek.includes(data)) {
        bot.sendMessage(chatId, "لطفاً روز معتبر انتخاب کنید.");
        return;
      }
      userData[reservationId].day = data;
      userStates[chatId].state = states.ASKING_START_TIME;
      bot.sendMessage(chatId, "لطفاً زمان شروع را انتخاب کنید:", {
        reply_markup: {
          inline_keyboard: getTimesButtons()
        }
      });
    } else if (state === states.ASKING_START_TIME) {
      if (!availableTimes.includes(data)) {
        bot.sendMessage(chatId, "زمان شروع معتبر نمی‌باشد. لطفاً یکی از زمان‌های موجود را انتخاب کنید.");
        return;
      }
      userData[reservationId].startTime = data;
      userStates[chatId].state = states.ASKING_END_TIME;
      bot.sendMessage(chatId, "لطفاً زمان پایان را انتخاب کنید:", {
        reply_markup: {
          inline_keyboard: getTimesButtons()
        }
      });
    } else if (state === states.ASKING_END_TIME) {
      if (!availableTimes.includes(data)) {
        bot.sendMessage(chatId, "زمان پایان معتبر نمی‌باشد. لطفاً یکی از زمان‌های موجود را انتخاب کنید.");
        return;
      }
      const startTimeIndex = availableTimes.indexOf(userData[reservationId].startTime);
      const endTimeIndex = availableTimes.indexOf(data);

      if (startTimeIndex >= endTimeIndex) {
        bot.sendMessage(chatId, "زمان پایان باید بعد از زمان شروع باشد.");
        return;
      }

      userData[reservationId].endTime = data;
      userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
      bot.sendMessage(chatId, `لطفاً فیش پرداختی خود را ارسال کنید.\n\nمبلغ قابل پرداخت: ${hourlyRate * (endTimeIndex - startTimeIndex + 1)} تومان\nبیعانه: ${depositAmount} تومان\n\nشماره کارت: ${depositCardNumber}\nنام صاحب کارت: ${cardHolderName}`);
      pendingPayments[reservationId] = { chatId, startTime: userData[reservationId].startTime, endTime: userData[reservationId].endTime, day: userData[reservationId].day };
    } else if (state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
      bot.sendMessage(chatId, "فیش پرداختی شما در حال بررسی است. لطفاً منتظر تأیید مدیر باشید.");
    }
  } else if (data === 'settings') {
    if (chatId.toString() === adminChatId) {
      showAdminSettingsMenu(chatId);
    } else {
      bot.sendMessage(chatId, "این گزینه فقط برای مدیران قابل استفاده است.");
    }
  } else if (data === 'view_bookings') {
    showAvailableBookings(chatId);
  }
});

// پردازش فیش‌های پرداختی
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const photoId = msg.photo[msg.photo.length - 1].file_id;
  const reservationId = Object.keys(pendingPayments).find(id => pendingPayments[id].chatId === chatId);

  if (reservationId) {
    bot.sendMessage(adminChatId, `فیش پرداختی جدید از کاربر:\n\nرزرو: ${userData[reservationId].name}\nروز: ${userData[reservationId].day}\nزمان شروع: ${userData[reservationId].startTime}\nزمان پایان: ${userData[reservationId].endTime}`, {
      reply_markup: {
        inline_keyboard: [[{ text: "تأیید", callback_data: `confirm_${reservationId}` }]]
      }
    });
    bot.sendPhoto(adminChatId, photoId);
    bot.sendMessage(chatId, "فیش پرداختی شما ارسال شد و در حال بررسی است.");
    delete pendingPayments[reservationId];
  }
});

// پردازش تأیید پرداخت توسط مدیر
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('confirm_')) {
    const reservationId = data.replace('confirm_', '');
    const reservation = userData[reservationId];
    
    if (reservation) {
      bookings[reservationId] = reservation;
      bot.sendMessage(reservation.chatId, `رزرو شما با موفقیت تأیید شد!\n\nروز: ${reservation.day}\nزمان شروع: ${reservation.startTime}\nزمان پایان: ${reservation.endTime}`);
      bot.sendMessage(adminChatId, `رزرو ${reservation.name} با موفقیت تأیید شد.`);
      delete userData[reservationId];
    }
  }
});

// دکمه‌های کیبورد روزها
const getDaysButtons = () => {
  return daysOfWeek.map(day => [{ text: day, callback_data: day }]);
};

// دکمه‌های کیبورد زمان‌ها
const getTimesButtons = () => {
  return availableTimes.map(time => [{ text: time, callback_data: time }]);
};

// راه‌اندازی سرور Express
app.get('/', (req, res) => {
  res.send('ربات تلگرام در حال اجراست.');
});

app.listen(3000, () => {
  console.log('سرور در پورت 3000 در حال اجراست.');
});
