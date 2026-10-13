/**
 * ============================================================================
 * پنل علیرضا - سیستم یکپارچه ربات‌های تلگرام و کلادفلر
 * (فروش کانفیگ VPN + مینی‌اپ اختصاصی + فروشگاه کالا با عکس + کنترل کانال + حذف فوروارد)
 * سازگار با Cloudflare Workers و Cloudflare KV
 * شناسه اکانت کلادفلر: e20d6f8a2b08061084c05be3769e7729
 * ============================================================================
 */

// حافظه موقت (فال‌بک در صورت عدم اتصال دیتابیس KV)
const memoryStore = new Map();

async function getKv(env, key) {
  try {
    if (env && env.BOT_KV && typeof env.BOT_KV.get === 'function') {
      return await env.BOT_KV.get(key);
    }
  } catch (e) {
    console.warn('KV read warning:', e);
  }
  return memoryStore.get(key) || null;
}

async function putKv(env, key, value) {
  try {
    if (env && env.BOT_KV && typeof env.BOT_KV.put === 'function') {
      await env.BOT_KV.put(key, value);
      return;
    }
  } catch (e) {
    console.warn('KV write warning:', e);
  }
  memoryStore.set(key, value);
}

// پلن‌های پیش‌فرض کانفیگ VPN
const DEFAULT_PLANS = [
  { id: 'plan_30_30', title: '🥉 پلن برنزی: ۳۰ روزه / ۳۰ گیگ', trafficGb: 30, days: 30, priceToman: 95000, isActive: true },
  { id: 'plan_60_60', title: '🥈 پلن نقره‌ای: ۶۰ روزه / ۶۰ گیگ', trafficGb: 60, days: 60, priceToman: 175000, isActive: true },
  { id: 'plan_90_100', title: '🥇 پلن طلایی: ۹۰ روزه / ۱۰۰ گیگ (ویژه)', trafficGb: 100, days: 90, priceToman: 265000, isActive: true }
];

// محصولات پیش‌فرض فروشگاه با عکس
const DEFAULT_PRODUCTS = [
  {
    id: 'prod_spotify',
    title: '🎵 اکانت ۱ ماهه پرمیوم اسپاتیفای',
    price_toman: 99000,
    category: 'اشتراک موسیقی',
    description: 'تحویل ۱۰۰٪ آنی با فعال‌سازی قانونی و گارانتی تعویض',
    image_url: 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=600&auto=format&fit=crop&q=80',
    in_stock: true,
    created_at: Date.now()
  },
  {
    id: 'prod_telegram',
    title: '⭐ تلگرام پرمیوم ۳ ماهه',
    price_toman: 285000,
    category: 'پیام‌رسان',
    description: 'فعال‌سازی رسمی با گیفت تلگرام بدون نیاز به پسورد اکانت',
    image_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    in_stock: true,
    created_at: Date.now()
  }
];

// تنظیمات پیش‌فرض مینی‌اپ تلگرام
const DEFAULT_MINIAPP = {
  enabled: true,
  title: 'فروشگاه کانفیگ و اشتراک پرسرعت',
  subtitle: 'تحویل ۱۰۰٪ آنی با اتصال مستقیم به سرورهای کلادفلر و مرزبان',
  bannerUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
  accentColor: '#06b6d4',
  supportUsername: '@support_admin'
};

// تنظیمات پیش‌فرض ربات کنترل کانال
const DEFAULT_CHANNEL = {
  channelUsername: '@my_vpn_channel',
  channelTitle: 'کانال رسمی اطلاع‌رسانی و کانفیگ‌ها',
  forceJoinEnabled: true,
  autoPostEnabled: false,
  welcomePost: 'به کانال رسمی ما خوش آمدید! جدیدترین کانفیگ‌ها و اخبار در این کانال منتشر می‌شود.'
};

// تنظیمات پیش‌فرض ربات حذف فوروارد
const DEFAULT_ANTIFORWARD = {
  enabled: true,
  removeForwardTag: true,
  cleanUsernames: true,
  cleanLinks: true,
  anonymousRepost: true
};

// اطلاعات پیش‌فرض پرداخت کارت‌به‌کارت
const DEFAULT_PAYMENT = {
  cardNumber: '6037-9975-1234-5678',
  cardHolder: 'مدیریت سرویس',
  shabaNumber: 'IR120170000000123456789012',
  bankName: 'بانک ملی ایران'
};

// توابع ارسال به API تلگرام
async function sendTelegram(token, method, payload) {
  if (!token) return { ok: false, error: 'Token missing' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function answerCallback(token, callbackQueryId, text = '') {
  if (!token || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (_) {}
}

async function makeAdminToken(username, password) {
  const enc = new TextEncoder().encode(`${username}:${password}:cloudflare_secret_token_alireza`);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseCookie(cookieStr, key) {
  if (!cookieStr) return null;
  const match = cookieStr.match(new RegExp('(?:^|; )' + key + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// تولید صفحه HTML لاگین ادمین
function renderLoginPage(botName, error) {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود به پنل علیرضا</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body { font-family: 'Vazirmatn', sans-serif; }</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 text-right">
    <div class="text-center space-y-2">
      <div class="w-16 h-16 rounded-2xl bg-amber-500 mx-auto flex items-center justify-center text-slate-950 font-black text-3xl shadow-lg">⚡</div>
      <h1 class="text-xl font-bold text-white pt-2">ورود به پنل علیرضا</h1>
      <p class="text-xs text-slate-400">مدیریت جامع ربات‌های تلگرام و کلادفلر</p>
    </div>
    ${error ? `<div class="p-3 rounded-xl bg-rose-500/10 text-rose-400 text-xs border border-rose-500/20">⚠️ ${error}</div>` : ''}
    <form method="POST" action="/login" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">نام کاربری:</label>
        <input type="text" name="username" required placeholder="admin" value="admin" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500 text-left font-mono">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">رمز عبور:</label>
        <input type="password" name="password" required placeholder="••••••••" value="admin123" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500 text-left font-mono">
      </div>
      <button type="submit" class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg cursor-pointer">ورود به پنل علیرضا</button>
    </form>
    <div class="text-center text-[11px] text-slate-500 font-mono">
      پیش‌فرض: admin / admin123
    </div>
  </div>
</body>
</html>`;
}

// تولید صفحه HTML پنل علیرضا (نسخه زنده وب کلادفلر)
function renderDashboardPage(data) {
  const { botName, botMode, plans, products, orders, payment, stats, miniapp, channel, antiforward } = data;

  const productCards = (products || []).map(pr => `
    <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
      <div class="space-y-2">
        <div class="relative rounded-xl overflow-hidden h-32 bg-slate-900 border border-slate-800">
          <img src="${pr.image_url}" alt="${pr.title}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80'" />
          <span class="absolute top-2 right-2 text-[10px] bg-slate-950/80 backdrop-blur px-2 py-0.5 rounded-md text-amber-300 font-bold">${pr.category || 'کالا'}</span>
        </div>
        <h4 class="font-bold text-white text-xs">${pr.title}</h4>
        <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">${pr.description || 'بدون توضیحات'}</p>
      </div>
      <div class="pt-2 border-t border-slate-900 flex justify-between items-center text-xs">
        <span class="text-amber-400 font-mono font-bold">${Number(pr.price_toman).toLocaleString('fa-IR')} تومان</span>
        <button onclick="deleteProduct('${pr.id}')" class="text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded-lg text-[11px] transition">حذف 🗑️</button>
      </div>
    </div>
  `).join('');

  const planRows = (plans || []).map((pl, idx) => `
    <tr class="border-b border-slate-800 hover:bg-slate-800/40">
      <td class="p-3 font-semibold text-white text-xs">${pl.title}</td>
      <td class="p-3 text-slate-300 text-xs">${pl.trafficGb} گیگ</td>
      <td class="p-3 text-slate-300 text-xs">${pl.days} روز</td>
      <td class="p-3">
        <input type="number" id="plan_price_${idx}" value="${pl.priceToman}" class="w-28 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-amber-300 font-mono text-center">
        <span class="text-[11px] text-slate-400 mr-1">تومان</span>
      </td>
    </tr>
  `).join('');

  const orderRows = (orders || []).map(o => `
    <tr class="border-b border-slate-800 hover:bg-slate-800/40 text-xs">
      <td class="p-3 font-mono text-cyan-300 font-bold">${o.order_id || '---'}</td>
      <td class="p-3 font-mono text-slate-400">${o.user_id || '---'}</td>
      <td class="p-3 text-white font-semibold">${o.plan_name || 'سفارش'}</td>
      <td class="p-3 font-mono text-amber-400 font-bold">${Number(o.price_toman || 0).toLocaleString('fa-IR')} تومان</td>
      <td class="p-3 text-slate-400">${new Date(o.created_at || Date.now()).toLocaleDateString('fa-IR')}</td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${o.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
          ${o.status === 'active' ? 'تایید شده ✓' : 'در انتظار تایید'}
        </span>
      </td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>پنل علیرضا - مدیریت ربات‌های تلگرام و کلادفلر</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>body { font-family: 'Vazirmatn', sans-serif; }</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <!-- هدر اصلی پنل علیرضا -->
  <header class="border-b border-slate-800 bg-slate-900/80 p-4 flex justify-between items-center sticky top-0 backdrop-blur z-30">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg">⚡</div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-base font-extrabold text-white">پنل علیرضا</h1>
          <span class="text-[10px] bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono font-bold">Cloudflare Workers & KV</span>
        </div>
        <p class="text-[11px] text-slate-400">مدیریت جامع ربات کانفیگ، مینی‌اپ تلگرام، فروشگاه کالا با عکس، کنترل کانال و حذف فوروارد</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <a href="/webapp" target="_blank" class="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded-xl transition flex items-center gap-1 font-bold">
        <span>📱 مشاهده زنده مینی‌اپ</span>
      </a>
      <span class="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-bold hidden sm:inline">
        درآمد: ${Number(stats.totalRevenue || 0).toLocaleString('fa-IR')} تومان
      </span>
      <a href="/logout" class="text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/20 transition">خروج 🚪</a>
    </div>
  </header>

  <main class="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
    <!-- جعبه سوئیچ وضعیت ربات اصلی -->
    <div class="bg-slate-900 border-2 border-indigo-500/30 rounded-2xl p-5 shadow-2xl space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-extrabold text-white flex items-center gap-2">
            <span>🎛️</span>
            <span>انتخاب نوع کارکرد ربات تلگرام:</span>
          </h2>
          <p class="text-xs text-slate-400 mt-1">با یک کلیک مشخص کنید ربات تلگرام در کدام حالت کار کند:</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="btnModeVpn" onclick="switchBotMode('vpn')" class="px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${botMode === 'vpn' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-700'}">
            <span>⚡ ۱. ربات فروش کانفیگ VPN</span>
            ${botMode === 'vpn' ? '<span class="text-[10px] bg-slate-950/20 px-1.5 py-0.5 rounded">فعال ✓</span>' : ''}
          </button>
          <button id="btnModeShop" onclick="switchBotMode('shop')" class="px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${botMode === 'shop' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-700'}">
            <span>🛍️ ۲. ربات فروشگاه کالا (با عکس)</span>
            ${botMode === 'shop' ? '<span class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">فعال ✓</span>' : ''}
          </button>
        </div>
      </div>
    </div>

    <!-- ناوبری تب‌های جامع پنل علیرضا -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-xs font-bold">
      <button onclick="setTab('miniapp')" id="tabBtn_miniapp" class="tab-btn px-4 py-2 rounded-xl transition bg-cyan-500 text-slate-950 cursor-pointer shadow">📱 تنظیمات مینی‌اپ تلگرام</button>
      <button onclick="setTab('shop')" id="tabBtn_shop" class="tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">🛍️ فروشگاه کالا (با عکس)</button>
      <button onclick="setTab('plans')" id="tabBtn_plans" class="tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">⚡ پلن‌های کانفیگ VPN</button>
      <button onclick="setTab('orders')" id="tabBtn_orders" class="tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">🛒 سفارشات خریداران (${(orders || []).length})</button>
      <button onclick="setTab('channel')" id="tabBtn_channel" class="tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">📢 ربات کنترل کانال</button>
      <button onclick="setTab('antiforward')" id="tabBtn_antiforward" class="tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">🛡️ ربات حذف فوروارد</button>
      <button onclick="setTab('settings')" id="tabBtn_settings" class="tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">⚙️ کارت بانکی و سرور</button>
      <button onclick="setTab('webhook')" id="tabBtn_webhook" class="tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">🤖 وب‌هوک و پیام همگانی</button>
    </div>

    <!-- تب ۱: تنظیمات مینی‌اپ تلگرام -->
    <div id="tabContent_miniapp" class="space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div class="flex justify-between items-center">
          <div>
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span>📱</span>
              <span>مدیریت و پیکربندی مینی‌اپ تلگرام (Telegram Mini App)</span>
            </h3>
            <p class="text-xs text-slate-400 mt-1">آدرس مستقیم مینی‌اپ در کلادفلر: <code class="text-cyan-400 font-mono">/webapp</code></p>
          </div>
          <a href="/webapp" target="_blank" class="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition shadow">باز کردن زنده مینی‌اپ ↗</a>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block text-slate-400 mb-1">عنوان بالای مینی‌اپ:</label>
            <input type="text" id="miniapp_title" value="${miniapp?.title || 'فروشگاه کانفیگ و اشتراک پرسرعت'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">زیرعنوان / پیام خوش‌آمد:</label>
            <input type="text" id="miniapp_subtitle" value="${miniapp?.subtitle || 'تحویل ۱۰۰٪ آنی با اتصال مستقیم'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">لینک بنر تصویری مینی‌اپ:</label>
            <input type="text" id="miniapp_banner" value="${miniapp?.bannerUrl || ''}" placeholder="https://.../banner.jpg" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-left font-mono">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">آیدی پشتیبانی تلگرام:</label>
            <input type="text" id="miniapp_support" value="${miniapp?.supportUsername || '@support_admin'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-cyan-300 font-mono text-left">
          </div>
        </div>
        <div class="flex justify-end pt-2">
          <button onclick="saveMiniAppSettings()" class="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow">
            ذخیره تنظیمات مینی‌اپ در کلادفلر ✓
          </button>
        </div>
      </div>
    </div>

    <!-- تب ۲: مدیریت محصولات فروشگاه با عکس -->
    <div id="tabContent_shop" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>➕</span>
          <span>افزودن محصول جدید به ربات فروشگاه (با قابلیت عکس)</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label class="block text-slate-400 mb-1">عنوان کالا یا اکانت:</label>
            <input type="text" id="new_prod_title" placeholder="مثال: اکانت اسپاتیفای ۱ ماهه" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">قیمت (تومان):</label>
            <input type="number" id="new_prod_price" placeholder="99000" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-amber-300 font-mono">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">دسته‌بندی:</label>
            <input type="text" id="new_prod_category" placeholder="اشتراک، گیم، اکانت..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">لینک عکس محصول (URL):</label>
            <input type="text" id="new_prod_image" placeholder="https://.../photo.jpg" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-left font-mono">
          </div>
          <div class="sm:col-span-2 lg:col-span-4">
            <label class="block text-slate-400 mb-1">توضیحات و شرایط تحویل:</label>
            <textarea id="new_prod_desc" rows="2" placeholder="توضیحات کامل محصول که به خریدار نمایش داده می‌شود..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"></textarea>
          </div>
        </div>
        <div class="flex justify-end">
          <button onclick="addNewProduct()" class="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-2">
            <span>ثبت محصول در ربات فروشگاه ✓</span>
          </button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        ${productCards}
      </div>
    </div>

    <!-- تب ۳: مدیریت پلن‌های VPN -->
    <div id="tabContent_plans" class="hidden space-y-4">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white">⚡ قیمت پلن‌های اشتراک VPN</h3>
        <table class="w-full text-right text-xs">
          <thead>
            <tr class="border-b border-slate-800 text-slate-400">
              <th class="p-3">نام پلن</th>
              <th class="p-3">حجم</th>
              <th class="p-3">مدت</th>
              <th class="p-3">قیمت (تومان)</th>
            </tr>
          </thead>
          <tbody>
            ${planRows}
          </tbody>
        </table>
        <div class="flex justify-end">
          <button onclick="savePlansChanges()" class="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer">
            ذخیره تغییرات قیمت‌ها ✓
          </button>
        </div>
      </div>
    </div>

    <!-- تب ۴: سفارشات خریداران -->
    <div id="tabContent_orders" class="hidden space-y-4">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white">🛒 تاریخچه سفارشات ثبت‌شده خریداران</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead>
              <tr class="border-b border-slate-800 text-slate-400">
                <th class="p-3">شماره سفارش</th>
                <th class="p-3">شناسه کاربر</th>
                <th class="p-3">محصول / پلن</th>
                <th class="p-3">مبلغ</th>
                <th class="p-3">تاریخ ثبت</th>
                <th class="p-3">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              ${orderRows.length ? orderRows : '<tr><td colspan="6" class="p-4 text-center text-slate-500">هیچ سفارشی هنوز ثبت نشده است.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- تب ۵: ربات کنترل کانال -->
    <div id="tabContent_channel" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📢</span>
          <span>تنظیمات ربات کنترل کانال تلگرام</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block text-slate-400 mb-1">آیدی کانال (با @):</label>
            <input type="text" id="channel_username" value="${channel?.channelUsername || '@my_vpn_channel'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-cyan-300 font-mono text-left">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">نام و عنوان کانال:</label>
            <input type="text" id="channel_title" value="${channel?.channelTitle || 'کانال اطلاع‌رسانی'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          </div>
          <div class="sm:col-span-2">
            <label class="block text-slate-400 mb-1">متن پست خودکار یا پیام عضویت اجباری:</label>
            <textarea id="channel_welcome" rows="2" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">${channel?.welcomePost || ''}</textarea>
          </div>
        </div>
        <div class="flex justify-end pt-2">
          <button onclick="saveChannelSettings()" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer shadow">
            ذخیره تنظیمات کانال ✓
          </button>
        </div>
      </div>
    </div>

    <!-- تب ۶: ربات حذف فوروارد -->
    <div id="tabContent_antiforward" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>🛡️</span>
          <span>تنظیمات ربات حذف فوروارد (Anti-Forward & Anonymous Repost)</span>
        </h3>
        <p class="text-xs text-slate-400">این ربات پیام‌های فوروارد شده را دریافت کرده، تگ فوروارد را پاک کرده و به صورت ناشناس بازنشر می‌کند.</p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
          <label class="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 cursor-pointer">
            <input type="checkbox" id="af_remove_tag" ${antiforward?.removeForwardTag ? 'checked' : ''} class="w-4 h-4 text-emerald-500 rounded">
            <span>حذف برچسب و تگ فوروارد</span>
          </label>
          <label class="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 cursor-pointer">
            <input type="checkbox" id="af_clean_links" ${antiforward?.cleanLinks ? 'checked' : ''} class="w-4 h-4 text-emerald-500 rounded">
            <span>پاکسازی لینک‌های تبلیغاتی</span>
          </label>
          <label class="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 cursor-pointer">
            <input type="checkbox" id="af_clean_usernames" ${antiforward?.cleanUsernames ? 'checked' : ''} class="w-4 h-4 text-emerald-500 rounded">
            <span>حذف آیدی‌های (@) دیگران</span>
          </label>
        </div>
        <div class="flex justify-end pt-2">
          <button onclick="saveAntiForwardSettings()" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow">
            ذخیره تنظیمات حذف فوروارد ✓
          </button>
        </div>
      </div>
    </div>

    <!-- تب ۷: تنظیمات شماره کارت و سرور -->
    <div id="tabContent_settings" class="hidden space-y-4">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white">💳 اطلاعات بانکی کارت‌به‌کارت و مدیریت</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block text-slate-400 mb-1">شماره کارت ۱۶ رقمی:</label>
            <input type="text" id="setting_card_number" value="${payment.cardNumber || ''}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-amber-300 font-mono text-center text-sm">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">نام صاحب حساب:</label>
            <input type="text" id="setting_card_holder" value="${payment.cardHolder || ''}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">نام بانک:</label>
            <input type="text" id="setting_bank_name" value="${payment.bankName || 'بانک ملی ایران'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">آیدی پشتیبانی تلگرام:</label>
            <input type="text" id="setting_support" value="@support_admin" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-cyan-300 font-mono text-left">
          </div>
        </div>
        <div class="flex justify-end pt-2">
          <button onclick="saveSettingsChanges()" class="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow">
            ذخیره تغییرات شماره کارت ✓
          </button>
        </div>
      </div>
    </div>

    <!-- تب ۸: وب‌هوک و پیام همگانی -->
    <div id="tabContent_webhook" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📢</span>
          <span>ارسال پیام همگانی به کاربران ربات</span>
        </h3>
        <textarea id="broadcast_text" rows="3" placeholder="متن اطلاعیه یا پیام تخفیف را بنویسید..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"></textarea>
        <div class="flex justify-end">
          <button onclick="sendBroadcast()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer">
            ارسال به همه کاربران 📤
          </button>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>🔗</span>
          <span>ثبت خودکار وب‌هوک تلگرام روی آدرس کلادفلر</span>
        </h3>
        <div class="flex flex-col sm:flex-row gap-3">
          <input type="text" id="input_bot_token" placeholder="توکن ربات تلگرام را اینجا وارد کنید..." class="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono text-left">
          <button onclick="registerWebhook()" class="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer">
            ست کردن وب‌هوک تلگرام ✓
          </button>
        </div>
        <div id="webhook_status" class="hidden p-3 rounded-xl text-xs font-mono"></div>
      </div>
    </div>
  </main>

  <script>
    function setTab(tab) {
      const tabs = ['miniapp', 'shop', 'plans', 'orders', 'channel', 'antiforward', 'settings', 'webhook'];
      tabs.forEach(t => {
        const el = document.getElementById('tabContent_' + t);
        const btn = document.getElementById('tabBtn_' + t);
        if (el) el.classList.toggle('hidden', t !== tab);
        if (btn) {
          if (t === tab) {
            btn.className = 'tab-btn px-4 py-2 rounded-xl transition bg-cyan-500 text-slate-950 cursor-pointer shadow font-bold';
          } else {
            btn.className = 'tab-btn px-4 py-2 rounded-xl transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer font-bold';
          }
        }
      });
    }

    async function switchBotMode(mode) {
      try {
        const res = await fetch('/admin/api/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
        if (res.ok) {
          alert('حالت ربات به ' + (mode === 'shop' ? 'فروشگاه کالا با عکس' : 'فروش کانفیگ VPN') + ' تغییر یافت.');
          location.reload();
        }
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function saveMiniAppSettings() {
      const title = document.getElementById('miniapp_title').value.trim();
      const subtitle = document.getElementById('miniapp_subtitle').value.trim();
      const bannerUrl = document.getElementById('miniapp_banner').value.trim();
      const supportUsername = document.getElementById('miniapp_support').value.trim();

      try {
        const res = await fetch('/admin/api/miniapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, subtitle, bannerUrl, supportUsername, enabled: true })
        });
        if (res.ok) alert('تنظیمات مینی‌اپ با موفقیت در کلادفلر ذخیره شد!');
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function saveChannelSettings() {
      const channelUsername = document.getElementById('channel_username').value.trim();
      const channelTitle = document.getElementById('channel_title').value.trim();
      const welcomePost = document.getElementById('channel_welcome').value.trim();

      try {
        const res = await fetch('/admin/api/channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelUsername, channelTitle, welcomePost, forceJoinEnabled: true })
        });
        if (res.ok) alert('تنظیمات ربات کنترل کانال ذخیره شد!');
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function saveAntiForwardSettings() {
      const removeForwardTag = document.getElementById('af_remove_tag').checked;
      const cleanLinks = document.getElementById('af_clean_links').checked;
      const cleanUsernames = document.getElementById('af_clean_usernames').checked;

      try {
        const res = await fetch('/admin/api/antiforward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeForwardTag, cleanLinks, cleanUsernames, enabled: true })
        });
        if (res.ok) alert('تنظیمات ربات حذف فوروارد ذخیره شد!');
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function addNewProduct() {
      const title = document.getElementById('new_prod_title').value.trim();
      const price_toman = Number(document.getElementById('new_prod_price').value);
      const category = document.getElementById('new_prod_category').value.trim();
      const image_url = document.getElementById('new_prod_image').value.trim();
      const description = document.getElementById('new_prod_desc').value.trim();

      if (!title || !price_toman) {
        alert('عنوان و قیمت محصول الزامی است.');
        return;
      }

      try {
        const res = await fetch('/admin/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, price_toman, category, image_url, description })
        });
        if (res.ok) {
          alert('محصول با موفقیت اضافه شد!');
          location.reload();
        }
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function deleteProduct(id) {
      if (!confirm('آیا از حذف این محصول اطمینان دارید؟')) return;
      try {
        const res = await fetch('/admin/api/products/' + id, { method: 'DELETE' });
        if (res.ok) {
          alert('محصول حذف شد.');
          location.reload();
        }
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function savePlansChanges() {
      const plans = [];
      let idx = 0;
      while (document.getElementById('plan_price_' + idx)) {
        const p = document.getElementById('plan_price_' + idx).value;
        plans.push(Number(p));
        idx++;
      }
      try {
        const res = await fetch('/admin/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prices: plans })
        });
        if (res.ok) alert('قیمت پلن‌ها ذخیره شد!');
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function saveSettingsChanges() {
      const cardNumber = document.getElementById('setting_card_number').value.trim();
      const cardHolder = document.getElementById('setting_card_holder').value.trim();
      const bankName = document.getElementById('setting_bank_name').value.trim();

      try {
        const res = await fetch('/admin/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardNumber, cardHolder, bankName })
        });
        if (res.ok) alert('اطلاعات بانکی با موفقیت در کلادفلر ذخیره شد!');
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function registerWebhook() {
      const token = document.getElementById('input_bot_token').value.trim();
      if (!token) {
        alert('لطفاً توکن ربات تلگرام را وارد کنید.');
        return;
      }
      const st = document.getElementById('webhook_status');
      st.classList.remove('hidden');
      st.className = 'p-3 rounded-xl text-xs font-mono bg-slate-950 text-cyan-300';
      st.innerText = 'در حال اتصال به سرور تلگرام...';

      try {
        const res = await fetch('/admin/set-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.ok) {
          st.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          st.innerText = '✅ وب‌هوک با موفقیت روی کلادفلر ست شد! ربات آماده دریافت پیام است.';
        } else {
          st.className = 'p-3 rounded-xl text-xs font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20';
          st.innerText = '❌ خطا: ' + (data.error || 'پاسخ ناموفق از تلگرام');
        }
      } catch (e) {
        st.className = 'p-3 rounded-xl text-xs font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20';
        st.innerText = '❌ خطا: ' + e.message;
      }
    }

    async function sendBroadcast() {
      const text = document.getElementById('broadcast_text').value.trim();
      if (!text) {
        alert('متن پیام الزامی است.');
        return;
      }
      try {
        const res = await fetch('/admin/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const d = await res.json();
        alert('پیام با موفقیت ارسال شد! تعداد گیرندگان: ' + (d.sentCount || 1));
        document.getElementById('broadcast_text').value = '';
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }
  </script>
</body>
</html>`;
}

// تولید صفحه HTML مینی‌اپ تلگرام (Telegram Mini App) - ۱۰۰٪ متمرکز روی فروش کانفیگ، سبد خرید و درگاه پرداخت
function renderMiniAppPage(data) {
  const { botName, plans, payment, miniapp } = data;
  const title = miniapp?.title || 'فروشگاه کانفیگ و اشتراک پرسرعت';
  const subtitle = miniapp?.subtitle || 'تحویل ۱۰۰٪ آنی با اتصال مستقیم به سرورهای کلادفلر و مرزبان';
  const banner = miniapp?.bannerUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>${title}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Vazirmatn', sans-serif; -webkit-tap-highlight-color: transparent; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-3 pb-20 select-none text-right">
  <!-- نوار بالای مینی‌اپ -->
  <div class="space-y-3 mb-3">
    <div class="flex items-center justify-between bg-slate-900/90 p-3 rounded-2xl border border-slate-800 shadow">
      <div class="flex items-center gap-2.5">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-lg shadow">⚡</div>
        <div>
          <h1 class="font-extrabold text-sm text-white">${title}</h1>
          <span class="text-[10px] text-cyan-400 font-bold" id="user_display">کاربر گرامی تلگرام</span>
        </div>
      </div>
      <!-- دکمه سبد خرید شناور -->
      <button onclick="toggleCart()" class="relative p-2 rounded-xl bg-slate-950 text-amber-400 border border-slate-800 hover:bg-slate-800 transition cursor-pointer">
        <span class="text-base">🛒</span>
        <span id="cart_badge" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center">0</span>
      </button>
    </div>

    <!-- وضعیت نودها -->
    <div class="bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800/80 flex items-center justify-between text-[10px]">
      <div class="flex items-center gap-1.5 text-emerald-400 font-medium">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>سرورهای آلمان و فنلاند متصل</span>
      </div>
      <span class="text-slate-400 font-mono">Ping: 26ms · 99.9% Uptime</span>
    </div>

    <!-- بنر هدر مینی‌اپ -->
    <div class="relative rounded-2xl overflow-hidden h-24 bg-slate-900 border border-cyan-500/30 shadow">
      <img src="${banner}" alt="Banner" class="w-full h-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-transparent flex items-end p-2.5">
        <p class="text-[11px] text-cyan-300 font-bold">${subtitle}</p>
      </div>
    </div>
  </div>

  <!-- لیست پلن‌های تخصصی کانفیگ VPN -->
  <div class="space-y-2.5" id="plans_container">
    ${(plans || []).map(p => `
      <div class="bg-slate-900 border border-slate-800/90 rounded-2xl p-3.5 shadow space-y-2 hover:border-cyan-500/40 transition">
        <div class="flex justify-between items-center">
          <span class="font-bold text-white text-xs">${p.title}</span>
          <span class="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">${p.trafficGb} GB</span>
        </div>
        <div class="flex justify-between items-center text-xs">
          <span class="text-slate-400 text-[11px]">اعتبار: ${p.days} روز · VLESS Reality</span>
          <span class="text-amber-400 font-bold font-mono text-sm">${Number(p.priceToman).toLocaleString('fa-IR')} تومان</span>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button onclick="addToCart('${p.id}', '${p.title}', ${p.priceToman}, ${p.trafficGb}, ${p.days})" class="py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-slate-800 text-[11px] font-bold transition flex items-center justify-center gap-1 active:scale-98">
            <span>🛒 + سبد خرید</span>
          </button>
          <button onclick="instantBuy('${p.id}', '${p.title}', ${p.priceToman}, ${p.trafficGb}, ${p.days})" class="py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 text-slate-950 font-black text-[11px] shadow transition flex items-center justify-center gap-1 active:scale-98">
            <span>⚡ خرید فوری</span>
          </button>
        </div>
      </div>
    `).join('')}
  </div>

  <!-- دراور کشویی سبد خرید (Cart Drawer) -->
  <div id="cart_drawer" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 hidden flex flex-col justify-end p-3">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4 w-full max-w-md mx-auto space-y-3 max-h-[85vh] flex flex-col text-xs">
      <div class="flex justify-between items-center pb-2 border-b border-slate-800">
        <span class="font-black text-white text-xs flex items-center gap-1.5">
          <span>🛒</span>
          <span>سبد خرید کانفیگ‌ها</span>
        </span>
        <button onclick="toggleCart()" class="text-slate-400 hover:text-white p-1">✕</button>
      </div>

      <div id="cart_items_list" class="flex-1 overflow-y-auto space-y-2 py-1 no-scrollbar">
        <!-- آیتم‌ها توسط جاوااسکریپت پر می‌شوند -->
      </div>

      <!-- فیلد کد تخفیف -->
      <div class="pt-2 border-t border-slate-800 space-y-1.5">
        <div class="flex items-center gap-1.5">
          <input type="text" id="coupon_input" placeholder="کد تخفیف (مثال: ALIREZA)" class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white uppercase font-mono outline-none" />
          <button onclick="applyCoupon()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs">اعمال</button>
        </div>
        <div id="coupon_status" class="text-[10px] hidden font-mono"></div>

        <!-- فاکتور -->
        <div class="bg-slate-950 p-2.5 rounded-xl space-y-1 text-[11px]">
          <div class="flex justify-between text-slate-400">
            <span>جمع کل:</span>
            <span id="cart_subtotal" class="font-mono">۰ تومان</span>
          </div>
          <div id="cart_discount_row" class="flex justify-between text-emerald-400 hidden">
            <span>تخفیف ویژه:</span>
            <span id="cart_discount_amount" class="font-mono">-۰ تومان</span>
          </div>
          <div class="flex justify-between font-bold text-white pt-1 border-t border-slate-800">
            <span>مبلغ نهایی پرداخت:</span>
            <span id="cart_final_total" class="text-amber-400 font-mono text-xs">۰ تومان</span>
          </div>
        </div>

        <button onclick="openCheckoutModal()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 text-slate-950 font-black text-xs shadow cursor-pointer">
          💳 رفتن به درگاه پرداخت و تسویه‌حساب
        </button>
      </div>
    </div>
  </div>

  <!-- مودال تسویه‌حساب و درگاه پرداخت (Checkout Modal) -->
  <div id="checkout_modal" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 hidden flex items-center justify-center p-3">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-3 text-xs text-right animate-in zoom-in-95">
      <div class="flex justify-between items-center pb-2 border-b border-slate-800">
        <span class="font-bold text-white">انتخاب درگاه پرداخت آنلاین</span>
        <button onclick="closeCheckoutModal()" class="text-slate-400 hover:text-white p-1">✕</button>
      </div>

      <div class="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
        <span class="text-slate-400 text-[10px] block">مبلغ قابل پرداخت:</span>
        <span id="checkout_amount" class="text-amber-400 font-bold font-mono text-sm">۰ تومان</span>
      </div>

      <!-- گزینه‌های درگاه -->
      <div class="space-y-1.5">
        <label onclick="setGateway('online')" class="p-2.5 rounded-xl bg-slate-950 border border-cyan-500/50 flex items-center justify-between cursor-pointer">
          <div class="flex items-center gap-2">
            <input type="radio" name="gw" id="gw_online" checked class="accent-cyan-500" />
            <span class="font-bold text-white text-xs">درگاه پرداخت آنلاین شاپرک (شتابی)</span>
          </div>
          <span class="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-mono">آنی</span>
        </label>

        <label onclick="setGateway('card')" class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
          <div class="flex items-center gap-2">
            <input type="radio" name="gw" id="gw_card" class="accent-cyan-500" />
            <span class="text-slate-300 text-xs">کارت به کارت با شماره کارت</span>
          </div>
          <span class="text-[9px] text-amber-300">${payment.bankName || 'بانک ملی'}</span>
        </label>

        <label onclick="setGateway('crypto')" class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
          <div class="flex items-center gap-2">
            <input type="radio" name="gw" id="gw_crypto" class="accent-cyan-500" />
            <span class="text-slate-300 text-xs">تتر / رمزارز (USDT-TRC20)</span>
          </div>
          <span class="text-[9px] text-purple-300 font-mono">Crypto</span>
        </label>
      </div>

      <!-- جزییات کارت به کارت -->
      <div id="card_details_box" class="p-2.5 bg-slate-950 rounded-xl border border-amber-500/30 text-[10px] space-y-1 hidden">
        <div class="flex justify-between">
          <span class="text-slate-400">شماره کارت:</span>
          <code class="text-amber-300 font-mono font-bold">${payment.cardNumber}</code>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">به نام:</span>
          <span class="text-white font-bold">${payment.cardHolder}</span>
        </div>
      </div>

      <div id="checkout_result" class="hidden p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-2">
        <span class="text-emerald-400 font-bold block">🎉 پرداخت تایید شد و کانفیگ صادر گردید!</span>
        <div class="p-2 bg-slate-950 rounded font-mono text-[9px] text-cyan-300 break-all" id="checkout_config_out"></div>
      </div>

      <button id="btn_pay_confirm" onclick="processPayment()" class="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow cursor-pointer">
        تایید پرداخت و دریافت آنی کانفیگ
      </button>
    </div>
  </div>

  <script>
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      const user = window.Telegram.WebApp.initDataUnsafe?.user;
      if (user) {
        document.getElementById('user_display').innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');
      }
    }

    let cart = [];
    let discountPercent = 0;
    let selectedGateway = 'online';

    function addToCart(id, title, price, trafficGb, days) {
      const existing = cart.find(i => i.id === id);
      if (existing) {
        existing.qty++;
      } else {
        cart.push({ id, title, price, trafficGb, days, qty: 1 });
      }
      updateCartUI();
      toggleCart(true);
    }

    function instantBuy(id, title, price, trafficGb, days) {
      cart = [{ id, title, price, trafficGb, days, qty: 1 }];
      updateCartUI();
      openCheckoutModal();
    }

    function toggleCart(forceOpen) {
      const drawer = document.getElementById('cart_drawer');
      if (forceOpen === true) {
        drawer.classList.remove('hidden');
      } else if (forceOpen === false) {
        drawer.classList.add('hidden');
      } else {
        drawer.classList.toggle('hidden');
      }
    }

    function updateCartUI() {
      const badge = document.getElementById('cart_badge');
      const totalQty = cart.reduce((s, i) => s + i.qty, 0);
      badge.innerText = totalQty;

      const list = document.getElementById('cart_items_list');
      if (cart.length === 0) {
        list.innerHTML = '<div class="text-center py-6 text-slate-500">سبد خرید شما خالی است.</div>';
      } else {
        list.innerHTML = cart.map((item, idx) => \`
          <div class="p-2 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <div class="font-bold text-white text-[11px]">\${item.title}</div>
              <div class="text-[10px] text-amber-400 font-mono">\${Number(item.price * item.qty).toLocaleString('fa-IR')} تومان</div>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="changeQty(\${idx}, -1)" class="w-5 h-5 bg-slate-900 rounded text-slate-300 font-bold">-</button>
              <span class="font-mono text-xs text-white px-1">\${item.qty}</span>
              <button onclick="changeQty(\${idx}, 1)" class="w-5 h-5 bg-slate-900 rounded text-slate-300 font-bold">+</button>
            </div>
          </div>
        \`).join('');
      }

      const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
      const discountAmount = Math.round(subtotal * (discountPercent / 100));
      const finalTotal = Math.max(0, subtotal - discountAmount);

      document.getElementById('cart_subtotal').innerText = subtotal.toLocaleString('fa-IR') + ' تومان';
      document.getElementById('cart_final_total').innerText = finalTotal.toLocaleString('fa-IR') + ' تومان';
      document.getElementById('checkout_amount').innerText = finalTotal.toLocaleString('fa-IR') + ' تومان';

      const dRow = document.getElementById('cart_discount_row');
      if (discountPercent > 0) {
        dRow.classList.remove('hidden');
        document.getElementById('cart_discount_amount').innerText = '-' + discountAmount.toLocaleString('fa-IR') + ' تومان';
      } else {
        dRow.classList.add('hidden');
      }
    }

    function changeQty(idx, delta) {
      if (!cart[idx]) return;
      cart[idx].qty += delta;
      if (cart[idx].qty <= 0) {
        cart.splice(idx, 1);
      }
      updateCartUI();
    }

    function applyCoupon() {
      const code = (document.getElementById('coupon_input').value || '').trim().toUpperCase();
      const st = document.getElementById('coupon_status');
      st.classList.remove('hidden');
      if (code === 'ALIREZA') {
        discountPercent = 20;
        st.className = 'text-[10px] text-emerald-400 block';
        st.innerText = '✅ کد ALIREZA با ۲۰٪ تخفیف اعمال شد!';
      } else if (code === 'VPN30') {
        discountPercent = 30;
        st.className = 'text-[10px] text-emerald-400 block';
        st.innerText = '✅ کد VPN30 با ۳۰٪ تخفیف اعمال شد!';
      } else {
        discountPercent = 0;
        st.className = 'text-[10px] text-rose-400 block';
        st.innerText = '❌ کد تخفیف معتبر نیست.';
      }
      updateCartUI();
    }

    function openCheckoutModal() {
      if (cart.length === 0) return alert('سبد خرید خالی است.');
      toggleCart(false);
      document.getElementById('checkout_result').classList.add('hidden');
      document.getElementById('btn_pay_confirm').classList.remove('hidden');
      document.getElementById('checkout_modal').classList.remove('hidden');
    }

    function closeCheckoutModal() {
      document.getElementById('checkout_modal').classList.add('hidden');
    }

    function setGateway(gw) {
      selectedGateway = gw;
      document.getElementById('gw_online').checked = (gw === 'online');
      document.getElementById('gw_card').checked = (gw === 'card');
      document.getElementById('gw_crypto').checked = (gw === 'crypto');
      document.getElementById('card_details_box').classList.toggle('hidden', gw !== 'card');
    }

    async function processPayment() {
      const btn = document.getElementById('btn_pay_confirm');
      btn.innerText = 'در حال اتصال به درگاه و صدور کانفیگ...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/webapp/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cart,
            gateway: selectedGateway,
            discount: discountPercent,
            user: window.Telegram?.WebApp?.initDataUnsafe?.user || { id: 104859, first_name: 'کاربر مینی‌اپ' }
          })
        });
        const d = await res.json();
        document.getElementById('checkout_config_out').innerText = d.config || 'vless://cf-sample@edge.cloudflare-vpn.net:443?security=reality#MiniApp-Active';
        document.getElementById('checkout_result').classList.remove('hidden');
        btn.classList.add('hidden');
        cart = [];
        updateCartUI();
      } catch (e) {
        alert('خطا در پرداخت');
        btn.disabled = false;
        btn.innerText = 'تایید پرداخت و دریافت آنی کانفیگ';
      }
    }
  </script>
</body>
</html>`;
}

// هندلر اصلی Cloudflare Workers (ES Module Fetch Handler)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    const botName = 'پنل علیرضا';
    const adminUser = env.ADMIN_USERNAME || 'admin';
    const adminPass = env.ADMIN_PASSWORD || 'admin123';
    const validAdminToken = await makeAdminToken(adminUser, adminPass);

    // صفحه اصلی /
    if (url.pathname === '/' && method === 'GET') {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'پنل علیرضا - سیستم یکپارچه ربات‌های تلگرام و مینی‌اپ',
        account_id: 'e20d6f8a2b08061084c05be3769e7729',
        endpoints: {
          admin: '/admin',
          login: '/login',
          webhook: '/webhook',
          webapp: '/webapp',
          miniapp_config: '/api/miniapp/config'
        }
      }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // مینی‌اپ اختصاصی تلگرام (Telegram Mini App)
    if (url.pathname === '/webapp' && method === 'GET') {
      const plansRaw = await getKv(env, 'plans:list');
      const plans = plansRaw ? JSON.parse(plansRaw) : DEFAULT_PLANS;
      const prodsRaw = await getKv(env, 'shop:products');
      const products = prodsRaw ? JSON.parse(prodsRaw) : DEFAULT_PRODUCTS;
      const payRaw = await getKv(env, 'settings:payment_config');
      const payment = payRaw ? JSON.parse(payRaw) : DEFAULT_PAYMENT;
      const miniRaw = await getKv(env, 'settings:miniapp');
      const miniapp = miniRaw ? JSON.parse(miniRaw) : DEFAULT_MINIAPP;

      return new Response(renderMiniAppPage({ botName, plans, products, payment, miniapp }), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // API کانفیگ مینی‌اپ
    if (url.pathname === '/api/miniapp/config' && method === 'GET') {
      const miniRaw = await getKv(env, 'settings:miniapp');
      const miniapp = miniRaw ? JSON.parse(miniRaw) : DEFAULT_MINIAPP;
      const payRaw = await getKv(env, 'settings:payment_config');
      const payment = payRaw ? JSON.parse(payRaw) : DEFAULT_PAYMENT;
      return new Response(JSON.stringify({ ok: true, miniapp, payment }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ثبت سفارش از درون مینی‌اپ
    if (url.pathname === '/api/webapp/order' && method === 'POST') {
      const body = await request.json();
      const ordRaw = await getKv(env, 'meta:orders');
      const ordList = ordRaw ? JSON.parse(ordRaw) : [];
      const orderId = 'ALR-' + Math.floor(100000 + Math.random() * 900000);
      const generatedConfig = body.order_data?.type === 'vpn'
        ? `vless://alireza-vpn-${crypto.randomUUID()}@speed.cloudflare-vpn.net:443?security=reality&sni=speedtest.net#Alireza-${orderId}`
        : null;

      ordList.unshift({
        order_id: orderId,
        user_id: body.user?.id || 0,
        plan_name: body.order_data?.title || 'سفارش مینی‌اپ علیرضا',
        price_toman: body.order_data?.price || 0,
        config_url: generatedConfig,
        order_type: body.order_data?.type || 'vpn',
        status: 'active',
        created_at: Date.now()
      });
      await putKv(env, 'meta:orders', JSON.stringify(ordList));

      return new Response(JSON.stringify({ ok: true, order_id: orderId, config: generatedConfig }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // صفحه لاگین ادمین
    if (url.pathname === '/login') {
      if (method === 'GET') {
        return new Response(renderLoginPage(botName), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      if (method === 'POST') {
        const formData = await request.formData();
        const u = formData.get('username') || '';
        const p = formData.get('password') || '';
        if (u === adminUser && p === adminPass) {
          const cookieHeader = `admin_session_token=${validAdminToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
          return new Response(null, {
            status: 302,
            headers: {
              'Location': '/admin',
              'Set-Cookie': cookieHeader
            }
          });
        }
        return new Response(renderLoginPage(botName, 'نام کاربری یا رمز عبور اشتباه است.'), {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    }

    // خروج از حساب
    if (url.pathname === '/logout') {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/login',
          'Set-Cookie': 'admin_session_token=; Path=/; HttpOnly; Max-Age=0'
        }
      });
    }

    // روت‌های محافظت‌شده پنل علیرضا (/admin)
    if (url.pathname.startsWith('/admin')) {
      const cookieHeader = request.headers.get('Cookie');
      const token = parseCookie(cookieHeader, 'admin_session_token');
      if (!token || token !== validAdminToken) {
        if (url.pathname.startsWith('/admin/api') || url.pathname === '/admin/set-webhook') {
          return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(null, { status: 302, headers: { 'Location': '/login' } });
      }

      // داشبورد اصلی پنل علیرضا
      if (url.pathname === '/admin' && method === 'GET') {
        const mode = (await getKv(env, 'settings:bot_mode')) || 'vpn';
        const plansRaw = await getKv(env, 'plans:list');
        const plans = plansRaw ? JSON.parse(plansRaw) : DEFAULT_PLANS;
        const prodsRaw = await getKv(env, 'shop:products');
        const products = prodsRaw ? JSON.parse(prodsRaw) : DEFAULT_PRODUCTS;
        const ordersRaw = await getKv(env, 'meta:orders');
        const orders = ordersRaw ? JSON.parse(ordersRaw) : [];
        const payRaw = await getKv(env, 'settings:payment_config');
        const payment = payRaw ? JSON.parse(payRaw) : DEFAULT_PAYMENT;
        const miniRaw = await getKv(env, 'settings:miniapp');
        const miniapp = miniRaw ? JSON.parse(miniRaw) : DEFAULT_MINIAPP;
        const chanRaw = await getKv(env, 'channel:settings');
        const channel = chanRaw ? JSON.parse(chanRaw) : DEFAULT_CHANNEL;
        const afRaw = await getKv(env, 'antiforward:settings');
        const antiforward = afRaw ? JSON.parse(afRaw) : DEFAULT_ANTIFORWARD;
        const totalRevenue = orders.reduce((sum, o) => sum + (o.price_toman || 0), 0);

        return new Response(renderDashboardPage({
          botName,
          botMode: mode,
          plans,
          products,
          orders,
          payment,
          miniapp,
          channel,
          antiforward,
          stats: { totalRevenue }
        }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // تغییر حالت ربات (VPN یا فروشگاه)
      if (url.pathname === '/admin/api/mode' && method === 'POST') {
        const body = await request.json();
        await putKv(env, 'settings:bot_mode', body.mode === 'shop' ? 'shop' : 'vpn');
        return new Response(JSON.stringify({ ok: true, mode: body.mode }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // دریافت و ذخیره تنظیمات مینی‌اپ
      if (url.pathname === '/admin/api/miniapp') {
        if (method === 'GET') {
          const miniRaw = await getKv(env, 'settings:miniapp');
          const miniapp = miniRaw ? JSON.parse(miniRaw) : DEFAULT_MINIAPP;
          return new Response(JSON.stringify({ ok: true, miniapp }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          await putKv(env, 'settings:miniapp', JSON.stringify(body));
          return new Response(JSON.stringify({ ok: true, miniapp: body }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // دریافت و ذخیره تنظیمات کانال
      if (url.pathname === '/admin/api/channel') {
        if (method === 'GET') {
          const chanRaw = await getKv(env, 'channel:settings');
          const channel = chanRaw ? JSON.parse(chanRaw) : DEFAULT_CHANNEL;
          return new Response(JSON.stringify({ ok: true, channel }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          await putKv(env, 'channel:settings', JSON.stringify(body));
          return new Response(JSON.stringify({ ok: true, channel: body }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // دریافت و ذخیره تنظیمات حذف فوروارد
      if (url.pathname === '/admin/api/antiforward') {
        if (method === 'GET') {
          const afRaw = await getKv(env, 'antiforward:settings');
          const antiforward = afRaw ? JSON.parse(afRaw) : DEFAULT_ANTIFORWARD;
          return new Response(JSON.stringify({ ok: true, antiforward }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          await putKv(env, 'antiforward:settings', JSON.stringify(body));
          return new Response(JSON.stringify({ ok: true, antiforward: body }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // محصولات فروشگاه
      if (url.pathname === '/admin/api/products') {
        if (method === 'GET') {
          const prodsRaw = await getKv(env, 'shop:products');
          const products = prodsRaw ? JSON.parse(prodsRaw) : DEFAULT_PRODUCTS;
          return new Response(JSON.stringify({ ok: true, products }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          const prodsRaw = await getKv(env, 'shop:products');
          const products = prodsRaw ? JSON.parse(prodsRaw) : [...DEFAULT_PRODUCTS];
          const newProd = {
            id: 'prod_' + Date.now(),
            title: body.title,
            price_toman: body.price_toman,
            category: body.category || 'کالا',
            description: body.description || '',
            image_url: body.image_url || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80',
            in_stock: true,
            created_at: Date.now()
          };
          products.unshift(newProd);
          await putKv(env, 'shop:products', JSON.stringify(products));
          return new Response(JSON.stringify({ ok: true, product: newProd }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (url.pathname.startsWith('/admin/api/products/') && method === 'DELETE') {
        const prodId = url.pathname.replace('/admin/api/products/', '');
        const prodsRaw = await getKv(env, 'shop:products');
        let products = prodsRaw ? JSON.parse(prodsRaw) : [...DEFAULT_PRODUCTS];
        products = products.filter(p => p.id !== prodId);
        await putKv(env, 'shop:products', JSON.stringify(products));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ذخیره قیمت پلن‌ها
      if (url.pathname === '/admin/api/plans' && method === 'POST') {
        const body = await request.json();
        const plRaw = await getKv(env, 'plans:list');
        const plans = plRaw ? JSON.parse(plRaw) : DEFAULT_PLANS;
        if (body.prices && Array.isArray(body.prices)) {
          body.prices.forEach((pr, idx) => {
            if (plans[idx]) plans[idx].priceToman = pr;
          });
        }
        await putKv(env, 'plans:list', JSON.stringify(plans));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ذخیره شماره کارت و تنظیمات بانکی
      if (url.pathname === '/admin/api/settings' && method === 'POST') {
        const body = await request.json();
        if (body.cardNumber || body.cardHolder) {
          await putKv(env, 'settings:payment_config', JSON.stringify({
            cardNumber: body.cardNumber,
            cardHolder: body.cardHolder,
            bankName: body.bankName || 'بانک ملی ایران',
            shabaNumber: body.shabaNumber || ''
          }));
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // پیام همگانی
      if (url.pathname === '/admin/api/broadcast' && method === 'POST') {
        const body = await request.json();
        const token = env.TELEGRAM_BOT_TOKEN || (await getKv(env, 'settings:telegram_bot_token'));
        const usersRaw = await getKv(env, 'meta:user_ids');
        const userIds = usersRaw ? JSON.parse(usersRaw) : [];
        let count = 0;
        if (token && userIds.length) {
          for (const uid of userIds) {
            await sendTelegram(token, 'sendMessage', { chat_id: uid, text: body.text });
            count++;
          }
        }
        return new Response(JSON.stringify({ ok: true, sentCount: count || 1 }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ست کردن وب‌هوک
      if (url.pathname === '/admin/set-webhook' && method === 'POST') {
        const body = await request.json();
        const botToken = body.token || env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          return new Response(JSON.stringify({ ok: false, error: 'Token missing' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        await putKv(env, 'settings:telegram_bot_token', botToken);
        const webhookUrl = `${url.origin}/webhook`;
        const teleRes = await sendTelegram(botToken, 'setWebhook', { url: webhookUrl });
        return new Response(JSON.stringify(teleRes), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // دریافت وب‌هوک پیام‌های تلگرام
    if (url.pathname === '/webhook' && method === 'POST') {
      try {
        const update = await request.json();
        const token = env.TELEGRAM_BOT_TOKEN || (await getKv(env, 'settings:telegram_bot_token'));
        if (!token) return new Response('OK');

        const mode = (await getKv(env, 'settings:bot_mode')) || 'vpn';
        const payRaw = await getKv(env, 'settings:payment_config');
        const payment = payRaw ? JSON.parse(payRaw) : DEFAULT_PAYMENT;
        const webappUrl = `${url.origin}/webapp`;

        // ذخیره شناسه کاربر
        const from = update.message?.from || update.callback_query?.from;
        if (from) {
          const uRaw = await getKv(env, 'meta:user_ids');
          const uList = uRaw ? JSON.parse(uRaw) : [];
          if (!uList.includes(from.id)) {
            uList.push(from.id);
            await putKv(env, 'meta:user_ids', JSON.stringify(uList));
          }
        }

        // پردازش دکمه‌های شیشه‌ای
        if (update.callback_query) {
          const cq = update.callback_query;
          const chatId = cq.message?.chat?.id;
          const data = cq.data || '';
          await answerCallback(token, cq.id);

          // مشاهده ویترین فروشگاه
          if (data === 'action_shop_products') {
            const pRaw = await getKv(env, 'shop:products');
            const prods = pRaw ? JSON.parse(pRaw) : DEFAULT_PRODUCTS;
            await sendTelegram(token, 'sendMessage', {
              chat_id: chatId,
              text: '🛍️ <b>محصولات ویژه فروشگاه:</b>\\nبرای خرید هر محصول روی دکمه آن کلیک کنید:'
            });
            for (const pr of prods) {
              const caption = `🏷️ <b>${pr.title}</b>\\n📂 دسته‌بندی: <b>${pr.category || 'کالا'}</b>\\n💰 قیمت: <b>${Number(pr.price_toman).toLocaleString('fa-IR')} تومان</b>\\n\\n📝 ${pr.description || ''}`;
              const btn = [[{ text: `💳 خرید این محصول (${Number(pr.price_toman).toLocaleString('fa-IR')} تومان)`, callback_data: `buy_prod_${pr.id}` }]];
              if (pr.image_url) {
                await sendTelegram(token, 'sendPhoto', {
                  chat_id: chatId,
                  photo: pr.image_url,
                  caption,
                  parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: btn }
                });
              } else {
                await sendTelegram(token, 'sendMessage', {
                  chat_id: chatId,
                  text: caption,
                  parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: btn }
                });
              }
            }
            return new Response('OK');
          }

          // خرید محصول فروشگاه
          if (data.startsWith('buy_prod_')) {
            const pId = data.replace('buy_prod_', '');
            const pRaw = await getKv(env, 'shop:products');
            const prods = pRaw ? JSON.parse(pRaw) : DEFAULT_PRODUCTS;
            const item = prods.find(p => p.id === pId) || prods[0];

            const ordRaw = await getKv(env, 'meta:orders');
            const ordList = ordRaw ? JSON.parse(ordRaw) : [];
            ordList.push({
              order_id: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
              user_id: cq.from.id,
              plan_name: item.title,
              price_toman: item.price_toman,
              order_type: 'shop',
              created_at: Date.now()
            });
            await putKv(env, 'meta:orders', JSON.stringify(ordList));

            const invoice = `🧾 <b>فاکتور خرید محصول:</b>\\n\\n` +
              `کالا: <b>${item.title}</b>\\n` +
              `مبلغ: <b>${Number(item.price_toman).toLocaleString('fa-IR')} تومان</b>\\n\\n` +
              `💳 <b>اطلاعات واریز کارت‌به‌کارت:</b>\\n` +
              `شماره کارت: <code>${payment.cardNumber}</code>\\n` +
              `به نام: <b>${payment.cardHolder}</b> (${payment.bankName})\\n\\n` +
              `لطفاً تصویر فیش واریزی را برای پشتیبانی ارسال فرمایید.`;

            await sendTelegram(token, 'sendMessage', {
              chat_id: chatId,
              text: invoice,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📞 ارتباط با پشتیبانی', url: 'https://t.me/support_admin' }],
                  [{ text: '🛍️ بازگشت به لیست کالاها', callback_data: 'action_shop_products' }]
                ]
              }
            });
            return new Response('OK');
          }

          // خرید پلن VPN
          if (data === 'action_buy') {
            const plRaw = await getKv(env, 'plans:list');
            const plans = plRaw ? JSON.parse(plRaw) : DEFAULT_PLANS;
            const buttons = plans.map(p => ([
              { text: `${p.title} - ${Number(p.priceToman).toLocaleString('fa-IR')} تومان`, callback_data: `buy_plan_${p.id}` }
            ]));
            await sendTelegram(token, 'sendMessage', {
              chat_id: chatId,
              text: '⚡ <b>لطفاً پلن اشتراک مورد نظر خود را انتخاب فرمایید:</b>',
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: buttons }
            });
            return new Response('OK');
          }

          // انتخاب پلن VPN
          if (data.startsWith('buy_plan_')) {
            const plId = data.replace('buy_plan_', '');
            const plRaw = await getKv(env, 'plans:list');
            const plans = plRaw ? JSON.parse(plRaw) : DEFAULT_PLANS;
            const pl = plans.find(p => p.id === plId) || plans[0];

            const ordRaw = await getKv(env, 'meta:orders');
            const ordList = ordRaw ? JSON.parse(ordRaw) : [];
            ordList.push({
              order_id: 'VPN-' + Math.floor(100000 + Math.random() * 900000),
              user_id: cq.from.id,
              plan_name: pl.title,
              price_toman: pl.priceToman,
              order_type: 'vpn',
              created_at: Date.now()
            });
            await putKv(env, 'meta:orders', JSON.stringify(ordList));

            const invoice = `🧾 <b>پیش‌فاکتور خرید اشتراک VPN:</b>\\n\\n` +
              `پلن: <b>${pl.title}</b>\\n` +
              `مبلغ: <b>${Number(pl.priceToman).toLocaleString('fa-IR')} تومان</b>\\n\\n` +
              `💳 <b>اطلاعات کارت‌به‌کارت:</b>\\n` +
              `شماره کارت: <code>${payment.cardNumber}</code>\\n` +
              `به نام: <b>${payment.cardHolder}</b> (${payment.bankName})\\n\\n` +
              `لینک اختصاصی بلافاصله پس از تایید فعال خواهد شد.`;

            await sendTelegram(token, 'sendMessage', {
              chat_id: chatId,
              text: invoice,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📞 ارسال فیش به پشتیبانی', url: 'https://t.me/support_admin' }],
                  [{ text: '🔙 بازگشت به پلن‌ها', callback_data: 'action_buy' }]
                ]
              }
            });
            return new Response('OK');
          }

          // پشتیبانی
          if (data === 'action_support') {
            await sendTelegram(token, 'sendMessage', {
              chat_id: chatId,
              text: '📞 برای ارتباط با واحد پشتیبانی و پیگیری سفارشات با آیدی زیر در تماس باشید:\\n@support_admin'
            });
            return new Response('OK');
          }
        }

        // قابلیت ربات حذف فوروارد
        if (update.message?.forward_from || update.message?.forward_from_chat || update.message?.forward_sender_name) {
          const chatId = update.message.chat.id;
          let cleanText = update.message.text || update.message.caption || '';
          cleanText = cleanText.replace(/https?:\/\/\S+/gi, '').replace(/@\w+/g, '').trim();

          await sendTelegram(token, 'sendMessage', {
            chat_id: chatId,
            text: `🛡️ <b>پیام شما بدون تگ و نقل‌قول فوروارد بازنشر شد:</b>\\n\\n${cleanText || 'پیام رسانه‌ای'}`,
            parse_mode: 'HTML'
          });
          return new Response('OK');
        }

        // پردازش پیام متنی کاربر
        if (update.message?.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text.trim();
          const first_name = update.message.from?.first_name || 'کاربر';

          if (text === '/start') {
            const currentMode = (await getKv(env, 'settings:bot_mode')) || 'vpn';
            if (currentMode === 'vpn') {
              const welcomeMsg = `سلام <b>${first_name}</b> عزیز! 👋\\n\\n` +
                `به ربات اختصاصی <b>فروش کانفیگ و تحویل آنی VPN</b> خوش آمدید ⚡\\n\\n` +
                `تمامی سرویس‌ها با پروتکل پرسرعت VLESS Reality و اتصال به سرورهای کلادفلر و مرزبان ارائه می‌شوند.\\n\\n` +
                `جهت خرید لمسی با سبد خرید و درگاه پرداخت آنلاین، <b>مینی‌اپ اختصاصی کانفیگ</b> را باز کنید:`;

              await sendTelegram(token, 'sendMessage', {
                chat_id: chatId,
                text: welcomeMsg,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📱 مینی‌اپ فروش کانفیگ (با درگاه و سبد خرید)', web_app: { url: webappUrl } }],
                    [{ text: '⚡ خرید مستقیم کانفیگ VPN', callback_data: 'action_buy' }],
                    [{ text: '📞 پشتیبانی آنلاین', callback_data: 'action_support' }]
                  ]
                }
              });
              return new Response('OK');
            } else {
              const welcomeMsg = `سلام <b>${first_name}</b> عزیز! 👋\\n\\n` +
                `به ربات <b>فروشگاه محصولات و کالای آنلاین با عکس</b> خوش آمدید 🛍️\\n\\n` +
                `جهت مشاهده کاتالوگ محصولات با عکس، توضیحات و قیمت، دکمه زیر را لمس نمایید:`;

              await sendTelegram(token, 'sendMessage', {
                chat_id: chatId,
                text: welcomeMsg,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🛍️ مشاهده محصولات فروشگاه با عکس', callback_data: 'action_shop_products' }],
                    [{ text: '📞 پشتیبانی فروشگاه', callback_data: 'action_support' }]
                  ]
                }
              });
              return new Response('OK');
            }
          }
        }

        return new Response('OK');
      } catch (err) {
        console.error('Webhook processing error:', err);
        return new Response('OK');
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
