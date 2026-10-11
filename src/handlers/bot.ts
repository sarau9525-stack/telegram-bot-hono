// ============================================================================
// فایل: src/handlers/bot.ts
// منطق ربات تلگرام همراه با فروش خودکار کانفیگ و تحویل آنی
// ============================================================================

import type { TelegramUpdate, SendMessageOptions, InlineKeyboardMarkup, ReplyKeyboardMarkup } from '../types/telegram';
import { saveUser, getBotSettings, saveSubscriptionOrder, getUserOrders } from '../utils/db';
import { createMarzbanUser, generateQrCodeUrl } from '../services/marzban';

export interface BotBindings {
  BOT_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  BOT_NAME?: string;
  MARZBAN_URL?: string;
  MARZBAN_TOKEN?: string;
  CARD_NUMBER?: string;
  CARD_HOLDER?: string;
}

// لیست پلن‌های استاندارد فروش کانفیگ
export const VPN_PLANS = [
  {
    id: 'plan_30_30',
    title: '🥉 پلن پایه: ۳۰ روزه / ۳۰ گیگ',
    trafficGb: 30,
    days: 30,
    priceToman: 95000,
    formattedPrice: '۹۵,۰۰۰ تومان',
  },
  {
    id: 'plan_60_60',
    title: '🥈 پلن نقره‌ای: ۶۰ روزه / ۶۰ گیگ',
    trafficGb: 60,
    days: 60,
    priceToman: 175000,
    formattedPrice: '۱۷۵,۰۰۰ تومان',
  },
  {
    id: 'plan_90_100',
    title: '🥇 پلن طلایی: ۹۰ روزه / ۱۰۰ گیگ (ویژه)',
    trafficGb: 100,
    days: 90,
    priceToman: 265000,
    formattedPrice: '۲۶۵,۰۰۰ تومان',
  },
];

export async function sendMessage(token: string, options: SendMessageOptions): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.chat_id,
      text: options.text,
      parse_mode: options.parse_mode ?? 'HTML',
      reply_markup: options.reply_markup,
    }),
  });
  return res.json();
}

export async function answerCallback(token: string, id: string, text?: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id, text: text || '' }),
    });
  } catch {}
}

// کیبورد شیشه‌ای اصلی
export const MAIN_INLINE_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '🛒 خرید اشتراک پرسرعت', callback_data: 'action_buy' },
      { text: '📊 سرویس‌های من', callback_data: 'action_my_services' },
    ],
    [
      { text: 'ℹ️ راهنمای اتصال', callback_data: 'action_help' },
      { text: '📞 پشتیبانی آنلاین', callback_data: 'action_support' },
    ]
  ]
};

// کیبورد معمولی پایین چت
export const MAIN_REPLY_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [
      { text: '🛒 خرید اشتراک' },
      { text: '📊 حساب کاربری' }
    ],
    [
      { text: 'ℹ️ درباره ما' },
      { text: '📞 پشتیبانی' }
    ]
  ],
  resize_keyboard: true,
};

// تولید کیبورد شیشه‌ای پلن‌های فروش
export function getPlansInlineKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      ...VPN_PLANS.map((plan) => [
        { text: `${plan.title} - ${plan.formattedPrice}`, callback_data: `select_plan_${plan.id}` }
      ]),
      [
        { text: '🔙 بازگشت به منوی اصلی', callback_data: 'action_back_home' }
      ]
    ]
  };
}

export async function handleBotUpdate(update: TelegramUpdate, env: BotBindings): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const kv = env.BOT_KV;
  const botName = env.BOT_NAME || 'ربات خرید اشتراک پرسرعت';
  const cardNumber = env.CARD_NUMBER || '6037-9975-1234-5678';
  const cardHolder = env.CARD_HOLDER || 'به نام مدیریت سرویس';

  const settings = await getBotSettings(kv);

  // ۱. بررسی پیام‌های متنی
  if (update.message) {
    const { from, chat, text } = update.message;
    if (!from) return;

    await saveUser(kv, {
      user_id: from.id,
      chat_id: chat.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username,
    });

    if (!settings.is_enabled) {
      await sendMessage(token, { chat_id: chat.id, text: settings.maintenance_message });
      return;
    }

    const clean = text?.trim() || '';

    // دستور /start
    if (clean === '/start') {
      const welcome = 
        `سلام <b>${from.first_name}</b> عزیز! 👋\n\n` +
        `به سامانه هوشمند خرید اشتراک اختصاصی <b>${botName}</b> خوش آمدید.\n` +
        `🚀 <b>ویژگی‌های سرویس:</b>\n` +
        `• پروتکل‌های مدرن VLESS / Trojan / Reality با دور زدن محدودیت‌ها\n` +
        `• پینگ فوق‌العاده پایین و اتصال پایدار بر روی تمام اپراتورها\n` +
        `• تحویل ۱۰۰٪ آنی و خودکار بلافاصله پس از پرداخت\n\n` +
        `برای مشاهده تعرفه‌ها، روی دکمه <b>«🛒 خرید اشتراک»</b> کلیک کنید:`;

      await sendMessage(token, {
        chat_id: chat.id,
        text: welcome,
        reply_markup: MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // کلیک متنی خرید اشتراک
    if (clean === '🛒 خرید اشتراک') {
      await sendMessage(token, {
        chat_id: chat.id,
        text: '⚡ <b>لطفاً پلن مورد نظر خود را برای خرید اشتراک انتخاب کنید:</b>\n\nتمام پلن‌ها دارای آی‌پی اختصاصی و ترافیک بدون افت سرعت می‌باشند:',
        reply_markup: getPlansInlineKeyboard(),
      });
      return;
    }

    // کلیک متنی حساب کاربری
    if (clean === '📊 حساب کاربری') {
      const orders = await getUserOrders(kv, from.id);
      let orderInfo = 'شما در حال حاضر اشتراک فعالی ندارید.';
      if (orders.length > 0) {
        orderInfo = orders.map((o, idx) => 
          `🔹 <b>اشتراک #${idx + 1}:</b> ${o.plan_name}\n` +
          `📅 تاریخ انقضا: ${new Date(o.expire_date).toLocaleDateString('fa-IR')}\n` +
          `🔗 لینک اتصال: <code>${o.config_url}</code>`
        ).join('\n\n');
      }

      const msg = 
        `📊 <b>مشخصات حساب شما:</b>\n\n` +
        `👤 نام: <b>${from.first_name}</b>\n` +
        `🆔 شناسه کاربری: <code>${from.id}</code>\n\n` +
        `<b>سرویس‌های خریداری‌شده:</b>\n${orderInfo}`;

      await sendMessage(token, { chat_id: chat.id, text: msg, reply_markup: MAIN_INLINE_KEYBOARD });
      return;
    }

    // پاسخ عمومی
    await sendMessage(token, {
      chat_id: chat.id,
      text: 'جهت سفارش یا مدیریت سرویس‌های خود از دکمه‌های زیر استفاده کنید:',
      reply_markup: MAIN_INLINE_KEYBOARD,
    });
  }

  // ۲. بررسی کلیک روی دکمه‌های شیشه‌ای (Callback Query)
  if (update.callback_query) {
    const cb = update.callback_query;
    const action = cb.data || '';
    const from = cb.from;
    const chatId = cb.message?.chat.id;
    if (!chatId) return;

    await answerCallback(token, cb.id);

    // دکمه بازگشت به خانه
    if (action === 'action_back_home') {
      await sendMessage(token, {
        chat_id: chatId,
        text: '🏠 به منوی اصلی بازگشتید. لطفاً گزینه مورد نظر را انتخاب کنید:',
        reply_markup: MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // دکمه لیست پلن‌ها
    if (action === 'action_buy') {
      await sendMessage(token, {
        chat_id: chatId,
        text: '⚡ <b>لیست تعرفه‌ها و پلن‌های قابل سفارش:</b>\n\nلطفاً حجم و زمان دلخواه خود را انتخاب کنید:',
        reply_markup: getPlansInlineKeyboard(),
      });
      return;
    }

    // دکمه سرویس‌های من
    if (action === 'action_my_services') {
      const orders = await getUserOrders(kv, from.id);
      if (orders.length === 0) {
        await sendMessage(token, {
          chat_id: chatId,
          text: '⚠️ شما تاکنون هیچ اشتراکی خریداری نکرده‌اید.\nبرای ثبت اولین سفارش دکمه زیر را لمس کنید:',
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 خرید اشتراک', callback_data: 'action_buy' }]]
          }
        });
        return;
      }

      const report = orders.map((o, idx) => 
        `🔑 <b>اشتراک فعال شماره ${idx + 1}:</b>\n` +
        `📦 نام پلن: <b>${o.plan_name}</b>\n` +
        `📅 تاریخ انقضا: <b>${new Date(o.expire_date).toLocaleDateString('fa-IR')}</b>\n` +
        `🔗 لینک سابسکریپشن شما:\n<code>${o.config_url}</code>`
      ).join('\n\n------------------------\n\n');

      await sendMessage(token, { chat_id: chatId, text: report, reply_markup: MAIN_INLINE_KEYBOARD });
      return;
    }

    // انتخاب یکی از پلن‌ها و صدور فاکتور
    if (action.startsWith('select_plan_')) {
      const planId = action.replace('select_plan_', '');
      const plan = VPN_PLANS.find(p => p.id === planId) || VPN_PLANS[0];

      const invoiceText = 
        `🧾 <b>فاکتور پرداخت سفارش</b>\n\n` +
        `📦 <b>پلن انتخابی:</b> ${plan.title}\n` +
        `⏳ <b>مدت اعتبار:</b> ${plan.days} روز\n` +
        `📊 <b>حجم ترافیک:</b> ${plan.trafficGb} گیگابایت\n` +
        `💰 <b>مبلغ قابل پرداخت:</b> <b>${plan.formattedPrice}</b>\n\n` +
        `💳 <b>اطلاعات پرداخت کارت‌به‌کارت:</b>\n` +
        `شماره کارت: <code>${cardNumber}</code>\n` +
        `صاحب حساب: <b>${cardHolder}</b>\n\n` +
        `پس از پرداخت، روی دکمه <b>«✅ تایید پرداخت و تحویل آنی»</b> بزنید تا کانفیگ اختصاصی شما بلافاصله ساخته شود:`;

      await sendMessage(token, {
        chat_id: chatId,
        text: invoiceText,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ تایید پرداخت و تحویل آنی کانفیگ', callback_data: `pay_confirm_${plan.id}` }
            ],
            [
              { text: '🔙 بازگشت به لیست پلن‌ها', callback_data: 'action_buy' }
            ]
          ]
        }
      });
      return;
    }

    // ۴. تایید پرداخت و ساخت خودکار کانفیگ با Marzban API
    if (action.startsWith('pay_confirm_')) {
      const planId = action.replace('pay_confirm_', '');
      const plan = VPN_PLANS.find(p => p.id === planId) || VPN_PLANS[0];

      // پیام وضعیت به کاربر
      await sendMessage(token, {
        chat_id: chatId,
        text: '⏳ در حال برقراری ارتباط با سرور و ایجاد اکانت اختصاصی شما... لطفاً چند لحظه شکیبا باشید.',
      });

      // ساخت نام کاربری یکتا
      const cleanUsername = `tg_${from.id}_${Math.floor(Math.random() * 9000 + 1000)}`;

      // فراخوانی سرویس پنل مرزبان
      const account = await createMarzbanUser({
        panelUrl: env.MARZBAN_URL || 'https://sub.myvpnserver.net',
        apiToken: env.MARZBAN_TOKEN,
      }, {
        username: cleanUsername,
        trafficLimitGb: plan.trafficGb,
        days: plan.days,
        note: `خرید توسط @${from.username || from.id} برای پلن ${plan.title}`,
      });

      // ۵. ذخیره سفارش در پایگاه داده Cloudflare KV
      const expireDate = Date.now() + plan.days * 24 * 60 * 60 * 1000;
      await saveSubscriptionOrder(kv, {
        order_id: `ord_${Date.now()}`,
        user_id: from.id,
        user_name: `${from.first_name} ${from.last_name || ''}`.trim(),
        username: from.username,
        plan_id: plan.id,
        plan_name: plan.title,
        price_toman: plan.priceToman,
        config_url: account.subscription_url,
        expire_date: expireDate,
        created_at: Date.now(),
        status: 'active',
      });

      const qrCode = generateQrCodeUrl(account.subscription_url);

      const deliveryMessage = 
        `🎉 <b>پرداخت شما تایید شد و اشتراک با موفقیت فعال گردید!</b>\n\n` +
        `📦 <b>مشخصات سرویس:</b>\n` +
        `• پلن: <b>${plan.title}</b>\n` +
        `• ترافیک: <b>${plan.trafficGb} GB</b>\n` +
        `• نام کاربری اکانت: <code>${account.username}</code>\n` +
        `• انقضا: <b>${new Date(expireDate).toLocaleDateString('fa-IR')}</b>\n\n` +
        `🔗 <b>لینک سابسکریپشن اختصاصی شما (کلیک کنید تا کپی شود):</b>\n` +
        `<code>${account.subscription_url}</code>\n\n` +
        `📱 <b>راهنمای اتصال:</b>\n` +
        `۱. لینک بالا را کپی کنید.\n` +
        `۲. در برنامه‌های v2rayNG (اندروید) یا Streisand / V2Box (آیفون) روی علامت <b>+</b> بزنید.\n` +
        `۳. گزینه <b>Import from Clipboard</b> را انتخاب کنید و متصل شوید!\n\n` +
        `🖼 <b>بارکد اتصال (QR Code):</b>\n${qrCode}`;

      await sendMessage(token, {
        chat_id: chatId,
        text: deliveryMessage,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 مشاهده سرویس‌های من', callback_data: 'action_my_services' },
              { text: '🛒 خرید اشتراک دیگر', callback_data: 'action_buy' }
            ]
          ]
        }
      });
      return;
    }

    // راهنما و پشتیبانی
    if (action === 'action_help') {
      await sendMessage(token, {
        chat_id: chatId,
        text: '📖 <b>راهنمای اتصال به اینترنت آزاد:</b>\n\nبرای اتصال به اشتراک‌های خریداری‌شده، از نرم‌افزارهای زیر استفاده کنید:\n• اندروید: <b>v2rayNG</b> یا <b>Happ</b>\n• آیفون (iOS): <b>Streisand</b> یا <b>V2Box</b> یا <b>FoXray</b>\n• ویندوز: <b>v2rayN</b> یا <b>Nekoray</b>\n\nکافیست لینک سابسکریپشن خود را در نرم‌افزار Paste نمایید.',
        reply_markup: MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    if (action === 'action_support') {
      await sendMessage(token, {
        chat_id: chatId,
        text: `📞 <b>پشتیبانی فنی:</b>\n\nدر صورت نیاز به راهنمایی یا بروز هرگونه مشکل با آیدی پشتیبانی در ارتباط باشید:\n@${settings.support_username || 'AlirezaKarimi_dev'}`,
        reply_markup: MAIN_INLINE_KEYBOARD,
      });
      return;
    }
  }
}
