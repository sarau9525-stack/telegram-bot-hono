// ============================================================================
// فایل: src/handlers/bot.ts
// منطق ربات تلگرام با پشتیبانی از دو حالت: فروش کانفیگ VPN و فروشگاه کالا با عکس
// ============================================================================

import type { TelegramUpdate, SendMessageOptions, InlineKeyboardMarkup, ReplyKeyboardMarkup } from '../types/telegram';
import { 
  saveUser, 
  getBotSettings, 
  saveSubscriptionOrder, 
  getUserOrders, 
  getBotMode, 
  getShopProducts, 
  getPlans, 
  getPaymentConfig 
} from '../utils/db';
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

export async function sendMessage(token: string, options: SendMessageOptions): Promise<any> {
  if (!token) return { ok: false, error: 'Token is missing' };
  try {
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
    const data: any = await res.json();
    if (!data.ok && typeof data.description === 'string' && data.description.includes("can't parse entities")) {
      const plainText = options.text.replace(/<[^>]*>/g, '');
      const retryRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: options.chat_id,
          text: plainText,
          reply_markup: options.reply_markup,
        }),
      });
      return await retryRes.json();
    }
    return data;
  } catch (err: any) {
    console.error('Fetch error sending telegram message:', err);
    return { ok: false, error: err?.message };
  }
}

export async function sendPhoto(token: string, options: {
  chat_id: number | string;
  photo: string;
  caption?: string;
  parse_mode?: string;
  reply_markup?: any;
}): Promise<any> {
  if (!token) return { ok: false, error: 'Token missing' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: options.chat_id,
        photo: options.photo,
        caption: options.caption,
        parse_mode: options.parse_mode ?? 'HTML',
        reply_markup: options.reply_markup,
      }),
    });
    const data: any = await res.json();
    if (!data.ok) {
      // در صورت خطای لود عکس، به صورت متن معمولی ارسال شود
      return await sendMessage(token, {
        chat_id: options.chat_id,
        text: (options.caption || '') + '\n\n🖼️ لینک عکس: ' + options.photo,
        reply_markup: options.reply_markup,
      });
    }
    return data;
  } catch (err: any) {
    console.error('Fetch error sending telegram photo:', err);
    return await sendMessage(token, {
      chat_id: options.chat_id,
      text: options.caption || '',
      reply_markup: options.reply_markup,
    });
  }
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

// کیبوردهای ربات کانفیگ VPN
export const VPN_MAIN_INLINE_KEYBOARD: InlineKeyboardMarkup = {
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

export const VPN_MAIN_REPLY_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '🛒 خرید اشتراک' }, { text: '📊 حساب کاربری' }],
    [{ text: 'ℹ️ درباره ما' }, { text: '📞 پشتیبانی' }]
  ],
  resize_keyboard: true,
};

// کیبوردهای ربات فروشگاه محصولات (با عکس)
export const SHOP_MAIN_INLINE_KEYBOARD: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '🛍️ مشاهده و خرید محصولات', callback_data: 'action_shop_products' }
    ],
    [
      { text: '📦 پیگیری سفارشات من', callback_data: 'action_shop_orders' },
      { text: '📞 پشتیبانی فروشگاه', callback_data: 'action_support' }
    ]
  ]
};

export const SHOP_MAIN_REPLY_KEYBOARD: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '🛍️ مشاهده محصولات' }, { text: '📦 سفارشات من' }],
    [{ text: '📞 پشتیبانی فروشگاه' }, { text: 'ℹ️ راهنمای خرید' }]
  ],
  resize_keyboard: true,
};

export async function handleBotUpdate(update: TelegramUpdate, env: BotBindings): Promise<void> {
  const kv = env.BOT_KV;
  let token = env.TELEGRAM_BOT_TOKEN;

  if (!token && kv) {
    token = (await kv.get('settings:telegram_bot_token')) || '';
  }

  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing! Set it via wrangler secret or in the /admin panel.');
    return;
  }

  const botName = env.BOT_NAME || 'ربات هوشمند فروشگاهی و کانفیگ';
  const botMode = await getBotMode(kv);
  const payment = await getPaymentConfig(kv);
  const dynamicPlans = await getPlans(kv);
  const products = await getShopProducts(kv);
  const settings = await getBotSettings(kv);

  // ۱. پردازش پیام‌های متنی
  if (update.message) {
    const { from, chat, text } = update.message;
    if (!from) return;

    try {
      await saveUser(kv, {
        user_id: from.id,
        chat_id: chat.id,
        first_name: from.first_name,
        last_name: from.last_name,
        username: from.username,
      });
    } catch {}

    if (!settings.is_enabled) {
      await sendMessage(token, { chat_id: chat.id, text: settings.maintenance_message });
      return;
    }

    const clean = text?.trim() || '';

    // دستور /start
    if (clean === '/start') {
      if (botMode === 'shop') {
        const shopWelcome = 
          `سلام <b>${from.first_name}</b> عزیز! 👋\n\n` +
          `به <b>${botName}</b> خوش آمدید 🛍️\n\n` +
          `در این فروشگاه می‌توانید انواع محصولات و اشتراک‌ها را به همراه <b>عکس، توضیحات و قیمت روز</b> مشاهده و به آسانی سفارش دهید.\n\n` +
          `جهت دیدن ویترین محصولات، روی دکمه زیر کلیک کنید:`;

        await sendMessage(token, {
          chat_id: chat.id,
          text: shopWelcome,
          reply_markup: SHOP_MAIN_INLINE_KEYBOARD,
        });
        return;
      } else {
        const welcome = 
          `سلام <b>${from.first_name}</b> عزیز! 👋\n\n` +
          `به سامانه هوشمند خرید اشتراک اختصاصی <b>${botName}</b> خوش آمدید.\n` +
          `🚀 <b>ویژگی‌های سرویس:</b>\n` +
          `• پروتکل‌های مدرن VLESS / Trojan / Reality با پینگ پایین\n` +
          `• تحویل ۱۰۰٪ آنی و خودکار بلافاصله پس از پرداخت\n\n` +
          `برای مشاهده تعرفه‌ها، روی دکمه <b>«🛒 خرید اشتراک»</b> کلیک کنید:`;

        await sendMessage(token, {
          chat_id: chat.id,
          text: welcome,
          reply_markup: VPN_MAIN_INLINE_KEYBOARD,
        });
        return;
      }
    }

    // پیام متنی مشاهده محصولات فروشگاه
    if (clean === '🛍️ مشاهده محصولات' || clean === '/products') {
      await sendShopCatalog(token, chat.id, products);
      return;
    }

    // پیام متنی خرید اشتراک VPN
    if (clean === '🛒 خرید اشتراک') {
      const activePlans = dynamicPlans.filter(p => p.isActive !== false);
      const planButtons = activePlans.map(p => ([
        { text: `${p.title} - ${Number(p.priceToman).toLocaleString('fa-IR')} تومان`, callback_data: `select_plan_${p.id}` }
      ]));
      planButtons.push([{ text: '🔙 بازگشت به خانه', callback_data: 'action_back_home' }]);

      await sendMessage(token, {
        chat_id: chat.id,
        text: '⚡ <b>لطفاً پلن مورد نظر خود را انتخاب کنید:</b>',
        reply_markup: { inline_keyboard: planButtons },
      });
      return;
    }

    // پیام متنی حساب کاربری / سرویس‌های من
    if (clean === '📊 حساب کاربری' || clean === '📊 سرویس‌های من' || clean === '📦 سفارشات من') {
      const orders = await getUserOrders(kv, from.id);
      if (orders.length === 0) {
        await sendMessage(token, {
          chat_id: chat.id,
          text: '⚠️ شما تاکنون هیچ سفارشی ثبت نکرده‌اید.',
          reply_markup: botMode === 'shop' ? SHOP_MAIN_INLINE_KEYBOARD : VPN_MAIN_INLINE_KEYBOARD,
        });
        return;
      }

      const report = orders.map((o, idx) => 
        `🔹 <b>سفارش #${idx + 1}:</b> ${o.plan_name}\n` +
        `💰 مبلغ: <b>${Number(o.price_toman).toLocaleString('fa-IR')} تومان</b>\n` +
        `📅 ثبت: ${new Date(o.created_at).toLocaleDateString('fa-IR')}\n` +
        `🔗 کد/لینک: <code>${o.config_url}</code>`
      ).join('\n\n');

      await sendMessage(token, {
        chat_id: chat.id,
        text: `📊 <b>سفارشات ثبت‌شده شما:</b>\n\n${report}`,
        reply_markup: botMode === 'shop' ? SHOP_MAIN_INLINE_KEYBOARD : VPN_MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // پشتیبانی
    if (clean === '📞 پشتیبانی' || clean === '📞 پشتیبانی فروشگاه') {
      await sendMessage(token, {
        chat_id: chat.id,
        text: `📞 <b>پشتیبانی:</b>\n\nجهت پیگیری یا ارتباط با مدیریت:\n@${settings.support_username || 'AlirezaKarimi_dev'}`,
        reply_markup: botMode === 'shop' ? SHOP_MAIN_INLINE_KEYBOARD : VPN_MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // پیش‌فرض
    await sendMessage(token, {
      chat_id: chat.id,
      text: 'لطفاً از دکمه‌های زیر جهت کار با ربات استفاده فرمایید:',
      reply_markup: botMode === 'shop' ? SHOP_MAIN_INLINE_KEYBOARD : VPN_MAIN_INLINE_KEYBOARD,
    });
  }

  // ۲. پردازش کلیک روی دکمه‌های شیشه‌ای (Callback Query)
  if (update.callback_query) {
    const cb = update.callback_query;
    const action = cb.data || '';
    const from = cb.from;
    const chatId = cb.message?.chat.id;
    if (!chatId) return;

    await answerCallback(token, cb.id);

    // بازگشت به خانه
    if (action === 'action_back_home') {
      await sendMessage(token, {
        chat_id: chatId,
        text: '🏠 به منوی اصلی بازگشتید:',
        reply_markup: botMode === 'shop' ? SHOP_MAIN_INLINE_KEYBOARD : VPN_MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // نمایش محصولات فروشگاه
    if (action === 'action_shop_products') {
      await sendShopCatalog(token, chatId, products);
      return;
    }

    // انتخاب محصول فروشگاه و صدور فاکتور
    if (action.startsWith('select_shop_')) {
      const prodId = action.replace('select_shop_', '');
      const prod = products.find(p => p.id === prodId) || products[0];

      const invoiceText = 
        `🧾 <b>فاکتور خرید محصول:</b>\n\n` +
        `🛍️ <b>نام محصول:</b> ${prod.title}\n` +
        `📂 <b>دسته‌بندی:</b> ${prod.category}\n` +
        `💰 <b>مبلغ قابل پرداخت:</b> <b>${Number(prod.price_toman).toLocaleString('fa-IR')} تومان</b>\n\n` +
        `💳 <b>اطلاعات پرداخت کارت‌به‌کارت:</b>\n` +
        `بانک: <b>${payment.bankName}</b>\n` +
        `شماره کارت: <code>${payment.cardNumber}</code>\n` +
        `صاحب حساب: <b>${payment.cardHolder}</b>\n\n` +
        `پس از کارت‌به‌کارت، روی دکمه <b>«✅ تایید پرداخت و ثبت نهایی»</b> کلیک کنید:`;

      await sendMessage(token, {
        chat_id: chatId,
        text: invoiceText,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ تایید پرداخت و ثبت نهایی سفارش', callback_data: `pay_shop_confirm_${prod.id}` }],
            [{ text: '🔙 بازگشت به محصولات', callback_data: 'action_shop_products' }]
          ]
        }
      });
      return;
    }

    // تایید پرداخت محصول فروشگاه
    if (action.startsWith('pay_shop_confirm_')) {
      const prodId = action.replace('pay_shop_confirm_', '');
      const prod = products.find(p => p.id === prodId) || products[0];
      const trackingCode = 'TRK-' + Math.floor(100000 + Math.random() * 900000);

      await saveSubscriptionOrder(kv, {
        order_id: `ord_${Date.now()}`,
        user_id: from.id,
        user_name: `${from.first_name} ${from.last_name || ''}`.trim(),
        username: from.username,
        plan_id: prod.id,
        plan_name: prod.title,
        price_toman: prod.price_toman,
        config_url: `کد رهگیری: ${trackingCode}`,
        expire_date: Date.now() + 365 * 24 * 60 * 60 * 1000,
        created_at: Date.now(),
        order_type: 'shop',
        product_image: prod.image_url,
        status: 'active',
      });

      const successMsg = 
        `🎉 <b>سفارش شما با موفقیت ثبت گردید!</b>\n\n` +
        `🛍️ <b>محصول:</b> ${prod.title}\n` +
        `🔢 <b>کد رهگیری اختصاصی:</b> <code>${trackingCode}</code>\n` +
        `💰 <b>مبلغ پرداخت‌شده:</b> ${Number(prod.price_toman).toLocaleString('fa-IR')} تومان\n\n` +
        `اطلاعات سفارش برای واحد پشتیبانی و ارسال فاکتور صادر شد. با تشکر از خرید شما!`;

      await sendMessage(token, {
        chat_id: chatId,
        text: successMsg,
        reply_markup: SHOP_MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // نمایش پلن‌های کانفیگ VPN
    if (action === 'action_buy') {
      const activePlans = dynamicPlans.filter(p => p.isActive !== false);
      const planButtons = activePlans.map(p => ([
        { text: `${p.title} - ${Number(p.priceToman).toLocaleString('fa-IR')} تومان`, callback_data: `select_plan_${p.id}` }
      ]));
      planButtons.push([{ text: '🔙 بازگشت به خانه', callback_data: 'action_back_home' }]);

      await sendMessage(token, {
        chat_id: chatId,
        text: '⚡ <b>لیست تعرفه‌ها و پلن‌های قابل سفارش:</b>',
        reply_markup: { inline_keyboard: planButtons },
      });
      return;
    }

    // انتخاب پلن کانفیگ VPN و صدور فاکتور
    if (action.startsWith('select_plan_')) {
      const planId = action.replace('select_plan_', '');
      const plan = dynamicPlans.find(p => p.id === planId) || dynamicPlans[0];

      const invoiceText = 
        `🧾 <b>فاکتور پرداخت سفارش اشتراک</b>\n\n` +
        `📦 <b>پلن:</b> ${plan.title}\n` +
        `⏳ <b>مدت اعتبار:</b> ${plan.days} روز | ترافیک: ${plan.trafficGb} گیگابایت\n` +
        `💰 <b>مبلغ قابل پرداخت:</b> <b>${Number(plan.priceToman).toLocaleString('fa-IR')} تومان</b>\n\n` +
        `💳 <b>اطلاعات پرداخت کارت‌به‌کارت:</b>\n` +
        `بانک: <b>${payment.bankName}</b>\n` +
        `شماره کارت: <code>${payment.cardNumber}</code>\n` +
        `صاحب حساب: <b>${payment.cardHolder}</b>\n\n` +
        `پس از پرداخت، روی دکمه زیر بزنید تا کانفیگ بلافاصله ساخته شود:`;

      await sendMessage(token, {
        chat_id: chatId,
        text: invoiceText,
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ تایید پرداخت و تحویل آنی کانفیگ', callback_data: `pay_confirm_${plan.id}` }],
            [{ text: '🔙 بازگشت به لیست پلن‌ها', callback_data: 'action_buy' }]
          ]
        }
      });
      return;
    }

    // ساخت خودکار کانفیگ Marzban
    if (action.startsWith('pay_confirm_')) {
      const planId = action.replace('pay_confirm_', '');
      const plan = dynamicPlans.find(p => p.id === planId) || dynamicPlans[0];

      await sendMessage(token, {
        chat_id: chatId,
        text: '⏳ در حال ساخت کانفیگ اختصاصی شما در سرور... لطفاً چند لحظه شکیبا باشید.',
      });

      const cleanUsername = `tg_${from.id}_${Math.floor(Math.random() * 9000 + 1000)}`;
      const account = await createMarzbanUser({
        panelUrl: env.MARZBAN_URL || 'https://sub.myvpnserver.net',
        apiToken: env.MARZBAN_TOKEN,
      }, {
        username: cleanUsername,
        trafficLimitGb: plan.trafficGb,
        days: plan.days,
        note: `خرید توسط @${from.username || from.id}`,
      });

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
        order_type: 'vpn',
        status: 'active',
      });

      const qrCode = generateQrCodeUrl(account.subscription_url);

      const deliveryMessage = 
        `🎉 <b>پرداخت شما تایید شد و اشتراک با موفقیت فعال گردید!</b>\n\n` +
        `📦 <b>مشخصات سرویس:</b>\n` +
        `• پلن: <b>${plan.title}</b>\n` +
        `• ترافیک: <b>${plan.trafficGb} GB</b>\n` +
        `• نام کاربری: <code>${account.username}</code>\n` +
        `• انقضا: <b>${new Date(expireDate).toLocaleDateString('fa-IR')}</b>\n\n` +
        `🔗 <b>لینک سابسکریپشن اختصاصی شما:</b>\n` +
        `<code>${account.subscription_url}</code>\n\n` +
        `📱 <b>راهنما:</b> لینک بالا را کپی و در v2rayNG یا Streisand وارد کنید.\n\n` +
        `🖼 <b>بارکد اتصال (QR Code):</b>\n${qrCode}`;

      await sendMessage(token, {
        chat_id: chatId,
        text: deliveryMessage,
        reply_markup: VPN_MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // راهنما
    if (action === 'action_help') {
      await sendMessage(token, {
        chat_id: chatId,
        text: settings.help_message || '📖 راهنمای اتصال: لینک سابسکریپشن را در برنامه v2rayNG کپی کنید.',
        reply_markup: VPN_MAIN_INLINE_KEYBOARD,
      });
      return;
    }

    // پشتیبانی
    if (action === 'action_support') {
      await sendMessage(token, {
        chat_id: chatId,
        text: `📞 <b>پشتیبانی فنی:</b>\n\n@${settings.support_username || 'AlirezaKarimi_dev'}`,
        reply_markup: botMode === 'shop' ? SHOP_MAIN_INLINE_KEYBOARD : VPN_MAIN_INLINE_KEYBOARD,
      });
      return;
    }
  }
}

// تابع کمکی ارسال کاتالوگ فروشگاه همراه با عکس هر محصول
async function sendShopCatalog(token: string, chatId: number | string, products: any[]) {
  const activeProducts = products.filter(p => p.in_stock !== false);
  if (activeProducts.length === 0) {
    await sendMessage(token, {
      chat_id: chatId,
      text: '🛍️ در حال حاضر محصولی در فروشگاه ثبت نشده است.',
      reply_markup: SHOP_MAIN_INLINE_KEYBOARD,
    });
    return;
  }

  await sendMessage(token, {
    chat_id: chatId,
    text: '🛍️ <b>محصولات ویژه فروشگاه:</b>\nلطفاً برای سفارش هر محصول روی دکمه خرید آن کلیک کنید:',
  });

  for (const prod of activeProducts) {
    const caption = 
      `🏷️ <b>${prod.title}</b>\n` +
      `📂 دسته‌بندی: <b>${prod.category}</b>\n` +
      `💰 قیمت: <b>${Number(prod.price_toman).toLocaleString('fa-IR')} تومان</b>\n\n` +
      `📝 <b>توضیحات:</b>\n${prod.description || 'تحویل آنی و مطمئن'}`;

    const buttons = [
      [{ text: `💳 خرید این محصول (${Number(prod.price_toman).toLocaleString('fa-IR')} تومان)`, callback_data: `select_shop_${prod.id}` }]
    ];

    if (prod.image_url) {
      await sendPhoto(token, {
        chat_id: chatId,
        photo: prod.image_url,
        caption,
        reply_markup: { inline_keyboard: buttons },
      });
    } else {
      await sendMessage(token, {
        chat_id: chatId,
        text: caption,
        reply_markup: { inline_keyboard: buttons },
      });
    }
  }
}
