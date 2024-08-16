const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config(); // بارگذاری متغیرهای محیطی

const token = process.env.TELEGRAM_TOKEN; // استفاده از توکن از فایل .env
const bot = new TelegramBot(token);

// URL وب‌هوک
const webhookUrl = 'https://glitch.com/~juniper-bitter-freon/path'; // آدرس وب‌هوک خود را به این شکل تنظیم کنید

// تنظیم وب‌هوک
bot.setWebHook(webhookUrl)
  .then(() => {
    console.log('Webhook set successfully');
  })
  .catch(error => {
    console.error('Error setting webhook:', error);
  });

const app = express();
app.use(express.json()); // استفاده از express.json به جای body-parser

// مسیر وب‌هوک
app.post('/path', (req, res) => {
  const update = req.body;
  bot.processUpdate(update); // پردازش به‌روزرسانی‌های دریافتی از وب‌هوک
  res.sendStatus(200);
});

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
  const reservationId = userStates[chatId]?.reservationId;

  if (data === 'settings') {
    showAdminSettingsMenu(chatId);
  } else if (data === 'restart') {
    resetUser(chatId);
  } else if (data === 'update_cost') {
    showUpdateCostMenu(chatId);
  } else if (data === 'update_hours') {
    showUpdateHoursMenu(chatId);
  } else if (data.startsWith('day_')) {
    const dayIndex = parseInt(data.replace('day_', ''), 10);
    const day = daysOfWeek[dayIndex];
    userData[reservationId].day = day;
    userStates[chatId].state = states.ASKING_START_TIME;
    bot.sendMessage(chatId, "لطفاً زمان شروع رزرو را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimeButtons()
      }
    });
  } else if (data.startsWith('time_')) {
    const time = data.replace('time_', '');
    if (!userData[reservationId].startTime) {
      userData[reservationId].startTime = time;
      bot.sendMessage(chatId, "لطفاً زمان پایان رزرو را انتخاب کنید:", {
        reply_markup: {
          inline_keyboard: getTimeButtons()
        }
      });
    } else {
      userData[reservationId].endTime = time;
      userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
      const startTime = userData[reservationId].startTime;
      const endTime = userData[reservationId].endTime;
      const durationInHours = (new Date(`1970-01-01T${endTime}:00Z`) - new Date(`1970-01-01T${startTime}:00Z`)) / (1000 * 60 * 60);
      const totalAmount = hourlyRate * Math.ceil(durationInHours);
      bot.sendMessage(chatId, `مبلغ کل برای رزرو شما ${totalAmount} تومان می‌باشد. لطفاً بیعانه ${depositAmount} تومان را به شماره کارت ${depositCardNumber} به نام ${cardHolderName} واریز کنید.\n\nبرای تأیید و پرداخت نهایی، فیش واریز خود را ارسال کنید.`);
      pendingPayments[reservationId] = { chatId, totalAmount };
    }
  }

  bot.answerCallbackQuery(callbackQuery.id);
});

// پردازش فیش‌های واریز
bot.on('document', (msg) => {
  const chatId = msg.chat.id;
  const documentId = msg.document.file_id;
  const reservationId = Object.keys(pendingPayments).find(id => pendingPayments[id].chatId === chatId);

  if (reservationId) {
    bot.sendDocument(adminChatId, documentId, {}, { caption: `فیش واریز برای رزرو ${reservationId}` });
    bot.sendMessage(chatId, "فیش واریز شما به مدیر ارسال شد. منتظر تأیید پرداخت باشید.");
    delete pendingPayments[reservationId];
    userStates[chatId].state = states.CONFIRMED;
    notifyAdmin(reservationId);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running.');
});
