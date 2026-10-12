/**
 * ============================================================================
 * ربات دوکاره تلگرام (فروش کانفیگ VPN + فروشگاه کالا با عکس) و پنل ادمین وب
 * توسعه‌یافته برای Cloudflare Workers بدون نیاز به هیچ ماژول خارجی (Zero-Dependency)
 * شناسه کاربر / اکانت کلادفلر: 5fad8ececde84125802cb9a8631af227
 * ============================================================================
 */

// حافظه موقت در صورت عدم اتصال دیتابیس KV کلادفلر
const memoryStore = new Map();

// توابع کمکی دسترسی امن به دیتابیس (با فال‌بک خودکار)
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

// پلن‌های پیش‌فرض VPN
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
    description: 'تحویل ۱۰۰٪ آنی با فعال‌سازی قانونی و گارانتی کامل',
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

// اطلاعات پیش‌فرض پرداخت
const DEFAULT_PAYMENT = {
  cardNumber: '6037-9975-1234-5678',
  cardHolder: 'مدیریت سرویس',
  shabaNumber: 'IR120170000000123456789012',
  bankName: 'بانک ملی ایران'
};

// ارسال پیام تلگرام
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

// پاسخ کال‌بک کوئری تلگرام
async function answerCallback(token, callbackQueryId, text = '') {
  if (!token || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch {}
}

// ساخت توکن احراز هویت ادمین
async function makeAdminToken(username, password) {
  const data = new TextEncoder().encode(`${username}:${password}:cloudflare_secret_salt`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// استخراج کوکی از هدر Request
function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const matches = cookieHeader.match(new RegExp('(^|; )' + name + '=([^;]+)'));
  return matches ? decodeURIComponent(matches[2]) : null;
}

// رندر صفحه لاگین ادمین
function renderLoginPage(botName, errorMsg = '') {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود به پنل مدیریت - ${botName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body { font-family: 'Vazirmatn', sans-serif; }</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
    <div class="text-center space-y-2">
      <div class="w-16 h-16 rounded-2xl bg-amber-500 mx-auto flex items-center justify-center text-slate-950 font-bold text-3xl">🔐</div>
      <h1 class="text-xl font-bold text-white pt-2">ورود به پنل مدیریت</h1>
      <p class="text-xs text-slate-400">${botName}</p>
    </div>
    ${errorMsg ? `<div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">⚠️ ${errorMsg}</div>` : ''}
    <form method="POST" action="/login" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">نام کاربری:</label>
        <input type="text" name="username" required value="admin" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">رمز عبور:</label>
        <input type="password" name="password" required placeholder="admin123" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500">
      </div>
      <button type="submit" class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition">ورود به داشبورد</button>
    </form>
    <div class="p-3 bg-slate-950/80 rounded-xl text-center text-[11px] text-slate-500">
      نام کاربری پیش‌فرض: <code class="text-amber-300 font-mono">admin</code> | رمز: <code class="text-amber-300 font-mono">admin123</code>
    </div>
  </div>
</body>
</html>`;
}

// رندر داشبورد ادمین
function renderDashboardPage({ botName, botMode, plans, products, orders, payment, stats }) {
  const orderRows = (orders || []).map(o => `
    <tr class="border-b border-slate-800 hover:bg-slate-800/40">
      <td class="p-3 font-mono text-cyan-400 text-xs">${o.order_id || 'ORD-1'}</td>
      <td class="p-3 font-mono text-slate-300 text-xs">${o.user_id || 'User'}</td>
      <td class="p-3 font-semibold text-white text-xs flex items-center gap-2">
        ${o.order_type === 'shop' ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">فروشگاه</span>' : '<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">کانفیگ</span>'}
        <span>${o.plan_name || 'اشتراک'}</span>
      </td>
      <td class="p-3 font-mono text-amber-400 text-xs">${Number(o.price_toman || 0).toLocaleString('fa-IR')} تومان</td>
      <td class="p-3 text-xs text-slate-300">${new Date(o.created_at || Date.now()).toLocaleDateString('fa-IR')}</td>
      <td class="p-3 text-xs"><span class="text-emerald-400 font-bold">● تایید شده</span></td>
    </tr>
  `).join('');

  const productCards = (products || []).map(p => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 relative group">
      <div class="h-36 w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 relative">
        <img src="${p.image_url}" alt="${p.title}" class="w-full h-full object-cover transition group-hover:scale-105" onerror="this.src='https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80'" />
        <span class="absolute top-2 right-2 bg-slate-950/80 backdrop-blur text-purple-300 text-[10px] px-2 py-0.5 rounded-full border border-purple-500/30">
          ${p.category || 'کالا'}
        </span>
      </div>
      <div>
        <h4 class="font-bold text-sm text-white line-clamp-1">${p.title}</h4>
        <p class="text-xs text-slate-400 line-clamp-2 mt-1">${p.description || ''}</p>
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <span class="text-xs font-mono font-bold text-amber-400">${Number(p.price_toman).toLocaleString('fa-IR')} تومان</span>
        <button onclick="deleteProduct('${p.id}')" class="text-rose-400 hover:text-rose-300 text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 transition cursor-pointer">حذف 🗑️</button>
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

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>پنل مدیریت فروشگاه و ربات - ${botName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body { font-family: 'Vazirmatn', sans-serif; }</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <header class="border-b border-slate-800 bg-slate-900/60 p-4 flex justify-between items-center sticky top-0 backdrop-blur z-30">
    <div class="flex items-center gap-2.5">
      <span class="text-2xl">⚡</span>
      <div>
        <h1 class="text-base font-bold text-white">${botName}</h1>
        <p class="text-[11px] text-slate-400">داشبورد زنده Cloudflare Workers</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">درآمد کل: ${Number(stats.totalRevenue || 0).toLocaleString('fa-IR')} تومان</span>
      <a href="/logout" class="text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/20 transition">خروج 🚪</a>
    </div>
  </header>

  <main class="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
    <!-- جعبه انتخاب نوع ربات (سوئیچ دو نوع ربات) -->
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

    <!-- ناوبری تب‌های پنل -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
      <button onclick="setTab('shop')" id="tabBtn_shop" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-purple-600 text-white cursor-pointer">🛍️ فروشگاه کالا (با عکس)</button>
      <button onclick="setTab('plans')" id="tabBtn_plans" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">⚡ قیمت پلن‌های کانفیگ</button>
      <button onclick="setTab('orders')" id="tabBtn_orders" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">🛒 سفارشات خریداران (${(orders || []).length})</button>
      <button onclick="setTab('settings')" id="tabBtn_settings" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">⚙️ متون و شماره کارت</button>
      <button onclick="setTab('webhook')" id="tabBtn_webhook" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer">📢 وب‌هوک و پیام همگانی</button>
    </div>

    <!-- تب ۱: مدیریت محصولات فروشگاه با عکس -->
    <div id="tabContent_shop" class="space-y-6">
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
            <input type="text" id="new_prod_image" placeholder="https://.../photo.jpg" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white">
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

    <!-- تب ۲: مدیریت پلن‌های VPN -->
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

    <!-- تب ۳: سفارشات خریداران -->
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

    <!-- تب ۴: تنظیمات شماره کارت و متون -->
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
            <label class="block text-slate-400 mb-1">نام ربات:</label>
            <input type="text" id="setting_bot_name" value="${botName || ''}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">آیدی پشتیبانی تلگرام:</label>
            <input type="text" id="setting_support" placeholder="support_admin" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white">
          </div>
        </div>
        <div class="flex justify-end">
          <button onclick="saveSettingsChanges()" class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer">
            ذخیره اطلاعات بانکی و متون ✓
          </button>
        </div>
      </div>
    </div>

    <!-- تب ۵: وب‌هوک و پیام همگانی -->
    <div id="tabContent_webhook" class="hidden space-y-4">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white">📢 ثبت وب‌هوک تلگرام</h3>
        <p class="text-xs text-slate-400 leading-relaxed">
          برای اتصال ربات تلگرام به این ورکر، توکن ربات دریافتی از BotFather را وارد کنید و دکمه ثبت وب‌هوک را بزنید:
        </p>
        <div class="flex flex-col sm:flex-row items-center gap-2">
          <input type="text" id="input_bot_token" placeholder="7123456789:AAH123456789abcdefghijklmnopqrstuv" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono">
          <button onclick="registerWebhook()" class="w-full sm:w-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer whitespace-nowrap">
            ثبت آنی وب‌هوک ⚡
          </button>
        </div>
        <div id="webhook_status" class="hidden p-3 rounded-xl text-xs font-mono"></div>
      </div>

      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white">✉️ ارسال پیام همگانی (Broadcast) به کاربران</h3>
        <textarea id="broadcast_text" rows="3" placeholder="متن پیام جهت ارسال به همه کاربران ربات..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"></textarea>
        <div class="flex justify-end">
          <button onclick="sendBroadcast()" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer">
            ارسال پیام همگانی 🚀
          </button>
        </div>
      </div>
    </div>
  </main>

  <script>
    function setTab(tab) {
      ['shop', 'plans', 'orders', 'settings', 'webhook'].forEach(t => {
        const content = document.getElementById('tabContent_' + t);
        const btn = document.getElementById('tabBtn_' + t);
        if (content) content.classList.add('hidden');
        if (btn) {
          btn.classList.remove('bg-purple-600', 'bg-emerald-500', 'text-white', 'text-slate-950');
          btn.classList.add('bg-slate-900', 'text-slate-300');
        }
      });
      const activeContent = document.getElementById('tabContent_' + tab);
      const activeBtn = document.getElementById('tabBtn_' + tab);
      if (activeContent) activeContent.classList.remove('hidden');
      if (activeBtn) {
        activeBtn.classList.remove('bg-slate-900', 'text-slate-300');
        activeBtn.classList.add(tab === 'shop' ? 'bg-purple-600' : 'bg-emerald-500', tab === 'shop' ? 'text-white' : 'text-slate-950');
      }
    }

    async function switchBotMode(mode) {
      try {
        const res = await fetch('/admin/api/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
        if (res.ok) {
          alert('حالت ربات با موفقیت به ' + (mode === 'shop' ? 'فروشگاه کالا با عکس' : 'کانفیگ VPN') + ' تغییر یافت!');
          location.reload();
        }
      } catch (e) {
        alert('خطا در ذخیره حالت: ' + e.message);
      }
    }

    async function addNewProduct() {
      const title = document.getElementById('new_prod_title').value.trim();
      const price = Number(document.getElementById('new_prod_price').value);
      const category = document.getElementById('new_prod_category').value.trim() || 'کالا';
      const image_url = document.getElementById('new_prod_image').value.trim();
      const description = document.getElementById('new_prod_desc').value.trim();

      if (!title || !price) {
        alert('لطفاً عنوان و قیمت را وارد کنید.');
        return;
      }

      try {
        const res = await fetch('/admin/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title, price_toman: price, category, image_url, description, in_stock: true
          })
        });
        if (res.ok) {
          alert('محصول با موفقیت ذخیره شد!');
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
          location.reload();
        }
      } catch (e) {
        alert('خطا در حذف: ' + e.message);
      }
    }

    async function savePlansChanges() {
      const p0 = Number(document.getElementById('plan_price_0')?.value || 95000);
      const p1 = Number(document.getElementById('plan_price_1')?.value || 175000);
      const p2 = Number(document.getElementById('plan_price_2')?.value || 265000);
      const plans = [
        { id: 'plan_30_30', title: '🥉 پلن برنزی: ۳۰ روزه / ۳۰ گیگ', trafficGb: 30, days: 30, priceToman: p0, isActive: true },
        { id: 'plan_60_60', title: '🥈 پلن نقره‌ای: ۶۰ روزه / ۶۰ گیگ', trafficGb: 60, days: 60, priceToman: p1, isActive: true },
        { id: 'plan_90_100', title: '🥇 پلن طلایی: ۹۰ روزه / ۱۰۰ گیگ (ویژه)', trafficGb: 100, days: 90, priceToman: p2, isActive: true }
      ];
      try {
        const res = await fetch('/admin/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plans })
        });
        if (res.ok) alert('قیمت پلن‌ها با موفقیت ذخیره شد!');
      } catch (e) {
        alert('خطا: ' + e.message);
      }
    }

    async function saveSettingsChanges() {
      const cardNumber = document.getElementById('setting_card_number').value.trim();
      const cardHolder = document.getElementById('setting_card_holder').value.trim();
      const bot_name = document.getElementById('setting_bot_name').value.trim();
      const support = document.getElementById('setting_support').value.trim();

      try {
        const res = await fetch('/admin/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardNumber, cardHolder, bot_name, support_username: support })
        });
        if (res.ok) alert('تنظیمات بانکی و متون ذخیره شد!');
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
          st.innerText = '✅ وب‌هوک با موفقیت ست شد! ربات آماده دریافت پیام است.';
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

// تولید صفحه HTML مینی‌اپ تلگرام (Telegram Mini App) با طراحی بومی و مدرن
function renderMiniAppPage(data) {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>${data.botName} - مینی‌اپ تلگرام</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Vazirmatn', sans-serif; -webkit-tap-highlight-color: transparent; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-3 pb-16 select-none text-right">
  <!-- نوار بالای مینی‌اپ -->
  <div class="space-y-3 mb-4">
    <div class="flex items-center justify-between bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 shadow">
      <div class="flex items-center gap-2.5">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-lg shadow">⚡</div>
        <div>
          <h1 class="font-extrabold text-sm text-white">${data.botName}</h1>
          <span class="text-[10px] text-cyan-400 font-bold" id="user_display">کاربر تلگرام</span>
        </div>
      </div>
      <span class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">🟢 متصل</span>
    </div>

    <!-- تب‌های ناوبری -->
    <div class="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
      <button onclick="switchTab('vpn')" id="tab_btn_vpn" class="flex-1 py-2 rounded-lg bg-cyan-500 text-slate-950 transition text-center shadow">⚡ تعرفه کانفیگ VPN</button>
      <button onclick="switchTab('shop')" id="tab_btn_shop" class="flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition text-center">🛍 محصولات با عکس</button>
    </div>
  </div>

  <!-- لیست پلن‌های VPN -->
  <div id="view_vpn" class="space-y-3">
    ${data.plans.map(p => `
      <div class="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 shadow space-y-3">
        <div class="flex justify-between items-center">
          <span class="font-bold text-white text-xs">${p.title}</span>
          <span class="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">${p.trafficGb} GB</span>
        </div>
        <div class="flex justify-between items-center text-xs">
          <span class="text-slate-400">مدت: ${p.days} روزه</span>
          <span class="text-amber-400 font-bold font-mono text-sm">${Number(p.priceToman).toLocaleString('fa-IR')} تومان</span>
        </div>
        <button onclick="openBuyModal('${p.id}', '${p.title}', ${p.priceToman}, 'vpn')" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-xs shadow flex items-center justify-center gap-1.5 active:scale-98 transition">
          <span>خرید آنی با کارت‌به‌کارت</span>
        </button>
      </div>
    `).join('')}
  </div>

  <!-- لیست محصولات فروشگاه با عکس -->
  <div id="view_shop" class="space-y-3 hidden">
    ${data.products.map(pr => `
      <div class="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden shadow">
        <img src="${pr.image_url}" alt="${pr.title}" class="w-full h-36 object-cover" />
        <div class="p-3.5 space-y-2">
          <div class="flex justify-between items-center">
            <span class="font-bold text-white text-xs">${pr.title}</span>
            <span class="text-[10px] bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20">${pr.category}</span>
          </div>
          <p class="text-slate-400 text-[11px] leading-relaxed">${pr.description}</p>
          <div class="flex justify-between items-center pt-2 border-t border-slate-800">
            <span class="text-slate-400 text-xs">قیمت:</span>
            <span class="text-amber-400 font-bold font-mono text-xs">${Number(pr.price_toman).toLocaleString('fa-IR')} تومان</span>
          </div>
          <button onclick="openBuyModal('${pr.id}', '${pr.title}', ${pr.price_toman}, 'shop')" class="w-full py-2 rounded-xl bg-purple-600 text-white font-bold text-xs shadow transition active:scale-98">
            سفارش آنلاین
          </button>
        </div>
      </div>
    `).join('')}
  </div>

  <!-- مودال خرید کارت‌به‌کارت -->
  <div id="buy_modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 hidden">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4 text-xs text-right">
      <div class="flex justify-between items-center pb-2 border-b border-slate-800">
        <span class="font-bold text-white" id="modal_title">ثبت سفارش</span>
        <button onclick="closeBuyModal()" class="text-slate-400 hover:text-white p-1">✕</button>
      </div>

      <div class="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
        <div class="flex justify-between">
          <span class="text-slate-400">مبلغ:</span>
          <span class="text-amber-400 font-bold font-mono" id="modal_price">۰ تومان</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">شماره کارت:</span>
          <code class="text-cyan-300 font-mono font-bold" id="modal_card">${data.payment.cardNumber}</code>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">به نام:</span>
          <span class="text-white font-bold">${data.payment.cardHolder}</span>
        </div>
      </div>

      <div id="order_result" class="hidden p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-2">
        <span class="text-emerald-400 font-bold block">🎉 سفارش با موفقیت ثبت شد!</span>
        <div class="p-2 bg-slate-950 rounded font-mono text-[10px] text-cyan-300 break-all" id="config_output"></div>
      </div>

      <button id="btn_confirm_pay" onclick="submitOrder()" class="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs shadow cursor-pointer">
        تایید پرداخت و ثبت نهایی
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

    let activeOrderData = null;

    function switchTab(tab) {
      document.getElementById('view_vpn').classList.toggle('hidden', tab !== 'vpn');
      document.getElementById('view_shop').classList.toggle('hidden', tab !== 'shop');
      const btnV = document.getElementById('tab_btn_vpn');
      const btnS = document.getElementById('tab_btn_shop');
      if (tab === 'vpn') {
        btnV.className = 'flex-1 py-2 rounded-lg bg-cyan-500 text-slate-950 transition text-center shadow';
        btnS.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition text-center';
      } else {
        btnS.className = 'flex-1 py-2 rounded-lg bg-purple-600 text-white transition text-center shadow';
        btnV.className = 'flex-1 py-2 rounded-lg text-slate-400 hover:text-white transition text-center';
      }
    }

    function openBuyModal(id, title, price, type) {
      activeOrderData = { id, title, price, type };
      document.getElementById('modal_title').innerText = title;
      document.getElementById('modal_price').innerText = Number(price).toLocaleString('fa-IR') + ' تومان';
      document.getElementById('order_result').classList.add('hidden');
      document.getElementById('btn_confirm_pay').classList.remove('hidden');
      document.getElementById('buy_modal').classList.remove('hidden');
    }

    function closeBuyModal() {
      document.getElementById('buy_modal').classList.add('hidden');
    }

    async function submitOrder() {
      const btn = document.getElementById('btn_confirm_pay');
      btn.innerText = 'در حال ثبت...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/webapp/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_data: activeOrderData,
            user: window.Telegram?.WebApp?.initDataUnsafe?.user || { id: 104859, first_name: 'کاربر مینی‌اپ' }
          })
        });
        const d = await res.json();
        document.getElementById('config_output').innerText = d.config || 'سفارش در پنل ثبت گردید.';
        document.getElementById('order_result').classList.remove('hidden');
        btn.classList.add('hidden');
      } catch (e) {
        alert('خطا در ثبت سفارش');
      }
    }
  </script>
</body>
</html>`;
}

// هندلر اصلی Cloudflare Workers (Fetch Event Handler)
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    const botName = env.BOT_NAME || 'ربات هوشمند فروشگاهی و کانفیگ';
    const adminUser = env.ADMIN_USERNAME || 'admin';
    const adminPass = env.ADMIN_PASSWORD || 'admin123';
    const validAdminToken = await makeAdminToken(adminUser, adminPass);

    // پاسخ ساده به صفحه اصلی ورکر
    if (url.pathname === '/' && method === 'GET') {
      return new Response(JSON.stringify({
        status: 'online',
        service: 'Telegram Dual-Mode Bot (VPN & Products)',
        account_id: 'e20d6f8a2b08061084c05be3769e7729',
        endpoints: {
          admin: '/admin',
          login: '/login',
          webhook: '/webhook',
          webapp: '/webapp'
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

      return new Response(renderMiniAppPage({ botName, plans, products, payment }), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // ثبت سفارش از درون مینی‌اپ
    if (url.pathname === '/api/webapp/order' && method === 'POST') {
      const body = await request.json();
      const ordRaw = await getKv(env, 'meta:orders');
      const ordList = ordRaw ? JSON.parse(ordRaw) : [];
      const orderId = 'MA-' + Math.floor(100000 + Math.random() * 900000);
      const generatedConfig = body.order_data?.type === 'vpn'
        ? `vless://edge-cf-${crypto.randomUUID()}@speed.cloudflare-vpn.net:443?security=reality&sni=speedtest.net#MiniApp-${orderId}`
        : null;

      ordList.unshift({
        order_id: orderId,
        user_id: body.user?.id || 0,
        plan_name: body.order_data?.title || 'سفارش مینی‌اپ',
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

    // روت‌های محافظت‌شده ادمین
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

      // داشبورد اصلی ادمین
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
        const totalRevenue = orders.reduce((sum, o) => sum + (o.price_toman || 0), 0);

        return new Response(renderDashboardPage({
          botName,
          botMode: mode,
          plans,
          products,
          orders,
          payment,
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

      // دریافت و افزودن محصولات
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

      // حذف محصول
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
        await putKv(env, 'plans:list', JSON.stringify(body.plans));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ذخیره شماره کارت و تنظیمات
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

      // ارسال پیام همگانی
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

      // ثبت وب‌هوک تلگرام
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

        // ذخیره کاربر در لیست
        const from = update.message?.from || update.callback_query?.from;
        if (from) {
          const uRaw = await getKv(env, 'meta:user_ids');
          const uList = uRaw ? JSON.parse(uRaw) : [];
          if (!uList.includes(from.id)) {
            uList.push(from.id);
            await putKv(env, 'meta:user_ids', JSON.stringify(uList));
          }
        }

        // پردازش کال‌بک کوئری (کلیک روی دکمه‌های شیشه‌ای)
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
              text: '🛍️ <b>محصولات ویژه فروشگاه:</b>\nبرای خرید هر محصول روی دکمه آن کلیک کنید:'
            });
            for (const pr of prods) {
              const caption = `🏷️ <b>${pr.title}</b>\n📂 دسته‌بندی: <b>${pr.category || 'کالا'}</b>\n💰 قیمت: <b>${Number(pr.price_toman).toLocaleString('fa-IR')} تومان</b>\n\n📝 ${pr.description || ''}`;
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

            // ثبت سفارش
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

            const invoice = `🧾 <b>فاکتور خرید محصول:</b>\n\n` +
              `کالا: <b>${item.title}</b>\n` +
              `مبلغ قابل پرداخت: <b>${Number(item.price_toman).toLocaleString('fa-IR')} تومان</b>\n\n` +
              `💳 <b>اطلاعات واریز کارت‌به‌کارت:</b>\n` +
              `شماره کارت: <code>${payment.cardNumber}</code>\n` +
              `به نام: <b>${payment.cardHolder}</b> (${payment.bankName})\n\n` +
              `پس از پرداخت، تصویر فیش واریزی را برای پشتیبانی ارسال فرمایید.`;

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

            // ثبت سفارش
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

            const invoice = `🧾 <b>پیش‌فاکتور خرید اشتراک VPN:</b>\n\n` +
              `پلن انتخابی: <b>${pl.title}</b>\n` +
              `مبلغ: <b>${Number(pl.priceToman).toLocaleString('fa-IR')} تومان</b>\n\n` +
              `💳 <b>اطلاعات کارت‌به‌کارت:</b>\n` +
              `شماره کارت: <code>${payment.cardNumber}</code>\n` +
              `به نام: <b>${payment.cardHolder}</b> (${payment.bankName})\n\n` +
              `🚀 لینک سابسکریپشن اختصاصی شما بلافاصله پس از تایید فعال خواهد شد.`;

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
              text: '📞 برای ارتباط با واحد پشتیبانی و پیگیری سفارشات با آیدی زیر در تماس باشید:\n@support_admin'
            });
            return new Response('OK');
          }
        }

        // قابلیت ربات حذف فوروارد (Anti-Forward & Anonymous Repost)
        if (update.message?.forward_from || update.message?.forward_from_chat || update.message?.forward_sender_name) {
          const chatId = update.message.chat.id;
          const cleanText = update.message.text || update.message.caption || '';
          await sendTelegram(token, 'sendMessage', {
            chat_id: chatId,
            text: `🛡️ <b>پیام شما بدون تگ و نقل‌قول فوروارد بازنشر شد:</b>\n\n${cleanText}`,
            parse_mode: 'HTML'
          });
          return new Response('OK');
        }

        // پردازش پیام متنی کاربر
        if (update.message?.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text.trim();
          const first_name = update.message.from?.first_name || 'کاربر';
          const webappUrl = `${url.origin}/webapp`;

          if (text === '/start') {
            if (mode === 'shop') {
              const shopMsg = `سلام <b>${first_name}</b> عزیز! 👋\n\n` +
                `به فروشگاه <b>${botName}</b> خوش آمدید 🛍️\n\n` +
                `در این ربات می‌توانید انواع محصولات و اکانت‌ها را به همراه <b>عکس، قیمت و مشخصات</b> مشاهده و سفارش دهید.\n\n` +
                `جهت دیدن ویترین یا مینی‌اپ، گزینه‌های زیر را لمس نمایید:`;
              await sendTelegram(token, 'sendMessage', {
                chat_id: chatId,
                text: shopMsg,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📱 باز کردن مینی اپ فروشگاه', web_app: { url: webappUrl } }],
                    [{ text: '🛍️ مشاهده و خرید محصولات (با عکس)', callback_data: 'action_shop_products' }],
                    [{ text: '📞 پشتیبانی آنلاین', callback_data: 'action_support' }]
                  ]
                }
              });
            } else {
              const vpnMsg = `سلام <b>${first_name}</b> عزیز! 👋\n\n` +
                `به ربات خرید اشتراک پرسرعت <b>${botName}</b> خوش آمدید ⚡\n\n` +
                `• پروتکل‌های ضد فیلتر و پرسرعت VLESS / Reality\n` +
                `• تحویل آنی و پشتیبانی ۲۴ ساعته\n\n` +
                `برای ورود به مینی‌اپ یا مشاهده تعرفه‌ها کلیک کنید:`;
              await sendTelegram(token, 'sendMessage', {
                chat_id: chatId,
                text: vpnMsg,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📱 باز کردن مینی اپ کانفیگ (Mini App)', web_app: { url: webappUrl } }],
                    [{ text: '🛒 خرید اشتراک پرسرعت', callback_data: 'action_buy' }],
                    [{ text: '📞 پشتیبانی', callback_data: 'action_support' }]
                  ]
                }
              });
            }
            return new Response('OK');
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
