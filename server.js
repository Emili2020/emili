const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);
const app = express();

app.use(express.json());

// پردازش درخواست‌های webhook
app.post('/webhook', (req, res) => {
  const update = req.body;
  bot.processUpdate(update);
  res.sendStatus(200);
});

// تنظیم webhook
bot.setWebHook(`https://juniper-bitter-freon.glitch.me`);

app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running...');
})

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
  const today = new PersianDate();
  const days = [];
  
  for (let i = 0; i < 6; i++) {
    const dayDate = today.clone().add(i, 'days');
    days.push({
      day: daysOfWeek[dayDate.day() % 7],
      date: dayDate.format('YYYY/MM/DD')
    });
  }

  return days;
};

const daysOfWeekWithDates = getDaysWithDates();

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
    bot.sendMessage(chatId, "لطفاً تاریخ را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getDayButtons()
      }
    });
  } else if (state === states.ASKING_DAY) {
    const selectedDay = daysOfWeekWithDates.find(day => day.day === text);
    if (!selectedDay) {
      bot.sendMessage(chatId, "تاریخ معتبر نمی‌باشد. لطفاً یکی از تاریخ‌های معتبر را انتخاب کنید.");
      return;
    }
    userData[reservationId].day = text;
    userStates[chatId].state = states.ASKING_START_TIME;
    bot.sendMessage(chatId, "لطفاً زمان شروع را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimeButtons()
      }
    });
  } else if (state === states.ASKING_START_TIME) {
    const startTime = text;
    if (!availableTimes.includes(startTime)) {
      bot.sendMessage(chatId, "زمان شروع معتبر نمی‌باشد. لطفاً یکی از زمان‌های معتبر را انتخاب کنید.");
      return;
    }
    userData[reservationId].startTime = startTime;
    userStates[chatId].state = states.ASKING_END_TIME;
    bot.sendMessage(chatId, "لطفاً زمان پایان را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: getTimeButtons()
      }
    });
  } else if (state === states.ASKING_END_TIME) {
    const endTime = text;
    if (!availableTimes.includes(endTime) || availableTimes.indexOf(endTime) <= availableTimes.indexOf(userData[reservationId].startTime)) {
      bot.sendMessage(chatId, "زمان پایان معتبر نمی‌باشد. لطفاً یکی از زمان‌های معتبر را انتخاب کنید.");
      return;
    }
    userData[reservationId].endTime = endTime;
    userStates[chatId].state = states.WAITING_FOR_PAYMENT_CONFIRMATION;
    bot.sendMessage(chatId, `رزرو شما به صورت زیر ثبت شده است:\n\nنام: ${userData[reservationId].name}\nشماره تلفن: ${userData[reservationId].phone}\nتاریخ: ${userData[reservationId].day}\nزمان: ${userData[reservationId].startTime} تا ${userData[reservationId].endTime}\n\nمبلغ قابل پرداخت: ${hourlyRate} تومان\n\nلطفاً فیش واریز را به شماره کارت ${depositCardNumber} به نام ${cardHolderName} ارسال کنید و پس از واریز، پیام تأیید پرداخت را ارسال کنید.`);
    bot.sendMessage(chatId, "برای تأیید پرداخت، لطفاً فیش واریز را ارسال کنید.");
  } else if (state === states.WAITING_FOR_PAYMENT_CONFIRMATION) {
    bot.sendMessage(chatId, "پرداخت شما با موفقیت ثبت شد. رزرو شما تکمیل شد.");
    delete userStates[chatId];
    delete userData[reservationId];
    showMainMenu(chatId);
  }
});

// پردازش پیام‌های درون خطی (برای تنظیمات و تغییرات)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const callbackData = query.data;

  if (callbackData === 'restart') {
    resetUser(chatId);
  } else if (callbackData === 'settings') {
    showAdminSettingsMenu(chatId);
  } else if (callbackData === 'back_to_main') {
    showMainMenu(chatId);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running...');
});
