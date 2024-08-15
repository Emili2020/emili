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
let halfHourlyRate = 250000;

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
  WAITING_FOR_ADMIN_CONFIRMATION: 'WAITING_FOR_ADMIN_CONFIRMATION'
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
  }
});

// پردازش دکمه‌های کیبورد درون‌خطی
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const stateInfo = userStates[chatId];
  const state = stateInfo?.state;
  const reservationId = stateInfo?.reservationId;

  if (data === 'settings') {
    showAdminSettingsMenu(chatId);
  } else if (data === 'update_cost') {
    showUpdateCostMenu(chatId);
  } else if (data === 'update_hours') {
    showUpdateHoursMenu(chatId);
  } else if (data === 'back_to_main') {
    showMainMenu(chatId);
  } else if (data === 'restart') {
    resetUser(chatId);
  } else if (state === states.ASKING_DAY) {
    if (!daysOfWeek.includes(data)) {
      bot.sendMessage(chatId, "روز معتبر نمی‌باشد. لطفاً یکی از روزهای پیشنهادی را انتخاب کنید.");
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
      bot.sendMessage(chatId, "زمان معتبر نمی‌باشد. لطفاً یکی از زمان‌های پیشنهادی را انتخاب کنید.");
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
      bot.sendMessage(chatId, "زمان پایان معتبر نمی‌باشد. لطفاً یکی از زمان‌های پیشنهادی را انتخاب کنید.");
      return;
    }
    userData[reservationId].endTime = data;
    userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
    bot.sendMessage(chatId, `مبلغ کل: ${calculateTotalPrice(userData[reservationId].startTime, userData[reservationId].endTime)} تومان\n\nلطفاً بیعانه ${depositAmount} تومان را به شماره کارت ${depositCardNumber} واریز کنید. پس از واریز، فیش پرداختی خود را ارسال کنید.`, {
      reply_markup: {
        keyboard: [[{ text: "ارسال فیش پرداختی", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });

    // ذخیره‌سازی اطلاعات فیش پرداختی در حالت انتظار
    pendingPayments[reservationId] = {
      chatId: chatId,
      state: states.WAITING_FOR_ADMIN_CONFIRMATION
    };

    // ارسال اطلاعات به مدیر
    notifyAdmin(reservationId);
  }
});

// پردازش عکس‌های ارسالی (فیش پرداختی)
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const photoId = msg.photo[msg.photo.length - 1].file_id;
  const stateInfo = userStates[chatId];
  const reservationId = Object.keys(pendingPayments).find(id => pendingPayments[id].chatId === chatId);

  if (reservationId && stateInfo?.state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
    // ارسال عکس فیش به مدیر
    bot.sendPhoto(adminChatId, photoId, { caption: `فیش پرداختی از کاربر: ${chatId}` });

    // تأیید فیش پرداختی از مدیر
    bot.sendMessage(adminChatId, `آیا فیش پرداختی زیر را تأیید می‌کنید؟\n\n${msg.photo[msg.photo.length - 1].file_id}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "تأیید", callback_data: `confirm_${reservationId}` }],
          [{ text: "رد", callback_data: `reject_${reservationId}` }]
        ]
      }
    });

    bot.sendMessage(chatId, "فیش پرداختی شما به مدیر ارسال شد. لطفاً منتظر تأیید مدیر باشید.");
  }
});

// پردازش تأیید فیش پرداختی
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const reservationId = data.split('_')[1];
  const action = data.split('_')[0];

  if (action === 'confirm' || action === 'reject') {
    if (pendingPayments[reservationId]) {
      const userChatId = pendingPayments[reservationId].chatId;

      if (action === 'confirm') {
        bot.sendMessage(userChatId, "پرداخت شما تأیید شد. تایم شما ثبت شد.");
        bot.sendMessage(adminChatId, "پرداخت تأیید شد و تایم ثبت شد.");
        // ثبت تایم برای کاربر
        // در اینجا می‌توانید تایم را ثبت کنید

      } else {
        bot.sendMessage(userChatId, "پرداخت شما رد شد. لطفاً فیش پرداختی را دوباره ارسال کنید.");
      }

      delete pendingPayments[reservationId];
    }
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// تابعی برای دریافت دکمه‌های روز (افقی)
const getDaysButtons = () => {
  const rowSize = 3; // تعداد دکمه‌ها در هر ردیف
  const rows = [];
  for (let i = 0; i < daysOfWeek.length; i += rowSize) {
    rows.push(daysOfWeek.slice(i, i + rowSize).map(day => ({
      text: day,
      callback_data: day
    })));
  }
  return rows;
};

// تابعی برای دریافت دکمه‌های زمان (عمودی)
const getTimesButtons = () => {
  return availableTimes.map(time => ([
    {
      text: time,
      callback_data: time
    }
  ]));
};

// تابعی برای محاسبه قیمت کل
const calculateTotalPrice = (startTime, endTime) => {
  const start = availableTimes.indexOf(startTime);
  const end = availableTimes.indexOf(endTime);
  if (start === -1 || end === -1 || start >= end) return 0;

  // تبدیل زمان‌ها به دقیقه
  const startMinutes = start * 30;
  const endMinutes = end * 30;

  // محاسبه مدت زمان استفاده به دقیقه
  const durationMinutes = endMinutes - startMinutes;

  // محاسبه هزینه
  let totalPrice = 0;

  if (durationMinutes <= 30) {
    // هزینه برای 30 دقیقه یا کمتر
    totalPrice = hourlyRate;
  } else {
    // هزینه برای ساعت اول
    totalPrice = hourlyRate;

    // هزینه برای نیم‌ساعت‌های بعدی
    const additionalMinutes = durationMinutes - 30;
    const additionalHalfHours = Math.ceil(additionalMinutes / 30);
    totalPrice += additionalHalfHours * halfHourlyRate;
  }

  return totalPrice;
};

app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running...');
});

