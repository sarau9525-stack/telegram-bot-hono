// ============================================================================
// فایل: src/handlers/admin.ts
// داشبورد ادمین جامع تحت وب برای Cloudflare Workers
// ============================================================================

import type { Context } from 'hono';
import { 
  getAllUsers, 
  getSystemStats, 
  getBotSettings, 
  getAllOrders, 
  incrementBroadcastCount,
  getBotMode,
  setBotMode,
  getShopProducts,
  saveShopProducts,
  getPlans,
  savePlans,
  getPaymentConfig,
  savePaymentConfig
} from '../utils/db';

export function renderAdminDashboardHtml(data: any): string {
  const { 
    stats, 
    users, 
    orders, 
    activeUsersToday, 
    botName, 
    currentBotToken,
    botMode,
    products,
    plans,
    payment,
    settings
  } = data;

  const orderRows = (orders || []).map((o: any) => `
    <tr class="border-b border-slate-800 hover:bg-slate-800/40">
      <td class="p-3 font-mono text-cyan-400 text-xs">${o.order_id}</td>
      <td class="p-3 font-mono text-slate-300 text-xs">${o.user_id}</td>
      <td class="p-3 font-semibold text-white text-xs flex items-center gap-2">
        ${o.order_type === 'shop' ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">فروشگاه</span>' : '<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">کانفیگ</span>'}
        <span>${o.plan_name}</span>
      </td>
      <td class="p-3 font-mono text-amber-400 text-xs">${Number(o.price_toman).toLocaleString('fa-IR')} تومان</td>
      <td class="p-3 text-xs text-slate-300">${new Date(o.created_at || Date.now()).toLocaleDateString('fa-IR')}</td>
      <td class="p-3 text-xs">
        <span class="inline-flex items-center gap-1 text-emerald-400 font-bold">● تایید شده</span>
      </td>
    </tr>
  `).join('');

  const productCards = (products || []).map((p: any) => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-4 space-y-3 relative group">
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
        <button onclick="deleteProduct('${p.id}')" class="text-rose-400 hover:text-rose-300 text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 transition">حذف 🗑️</button>
      </div>
    </div>
  `).join('');

  const planRows = (plans || []).map((pl: any, idx: number) => `
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
        <p class="text-[11px] text-slate-400">داشبورد زنده Cloudflare Workers & KV</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">درآمد کل: ${Number(stats.totalRevenue || 0).toLocaleString('fa-IR')} تومان</span>
      <a href="/logout" class="text-xs text-rose-400 bg-rose-500/10 px-3 py-1 rounded-lg">خروج 🚪</a>
    </div>
  </header>

  <main class="max-w-7xl mx-auto p-6 space-y-6">
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
          <button id="btnModeVpn" onclick="switchBotMode('vpn')" class="px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${botMode === 'vpn' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-700'}">
            <span>⚡ ۱. ربات فروش کانفیگ VPN</span>
            ${botMode === 'vpn' ? '<span class="text-[10px] bg-slate-950/20 px-1.5 py-0.5 rounded">فعال ✓</span>' : ''}
          </button>
          <button id="btnModeShop" onclick="switchBotMode('shop')" class="px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${botMode === 'shop' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-700'}">
            <span>🛍️ ۲. ربات فروشگاه کالا (با عکس)</span>
            ${botMode === 'shop' ? '<span class="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">فعال ✓</span>' : ''}
          </button>
        </div>
      </div>
    </div>

    <!-- ناوبری تب‌های پنل -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
      <button onclick="setTab('shop')" id="tabBtn_shop" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-purple-600 text-white">🛍️ فروشگاه کالا (با عکس)</button>
      <button onclick="setTab('plans')" id="tabBtn_plans" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800">⚡ قیمت و پلن‌های کانفیگ</button>
      <button onclick="setTab('orders')" id="tabBtn_orders" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800">🛒 سفارشات خریداران (${(orders || []).length})</button>
      <button onclick="setTab('settings')" id="tabBtn_settings" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800">⚙️ متون و شماره کارت</button>
      <button onclick="setTab('webhook')" id="tabBtn_webhook" class="tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800">📢 وب‌هوک و پیام همگانی</button>
    </div>

    <!-- تب ۱: مدیریت محصولات فروشگاه با عکس -->
    <div id="tabContent_shop" class="space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>➕</span>
          <span>افزودن محصول جدید به فروشگاه ربات (همراه با عکس)</span>
        </h3>
        <form id="newProductForm" onsubmit="handleCreateProduct(event)" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-slate-400 mb-1">عنوان محصول</label>
            <input type="text" id="prodTitle" required placeholder="مثلاً: اکانت پرمیوم اسپاتیفای..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white">
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">قیمت (تومان)</label>
            <input type="number" id="prodPrice" required placeholder="مثلاً: 120000" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-amber-300 font-mono">
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">دسته‌بندی</label>
            <input type="text" id="prodCategory" placeholder="مثلاً: اشتراک دیجیتال، فیزیکی..." value="کالای دیجیتال" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white">
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs text-slate-400 mb-1">آدرس عکس محصول (Image URL)</label>
            <input type="url" id="prodImageUrl" oninput="updateImagePreview(this.value)" placeholder="https://..." value="https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-cyan-300 font-mono">
          </div>
          <div class="flex items-center gap-3">
            <img id="imagePreviewBox" src="https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80" class="w-12 h-12 rounded-xl object-cover border border-slate-700">
            <span class="text-[11px] text-slate-400">پیش‌نمایش عکس</span>
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs text-slate-400 mb-1">توضیحات محصول</label>
            <textarea id="prodDesc" rows="2" placeholder="توضیحات کامل محصول برای نمایش به کاربر در تلگرام..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"></textarea>
          </div>
          <div class="md:col-span-3">
            <button type="submit" class="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl text-xs transition">
              ➕ ثبت و انتشار محصول در ربات
            </button>
          </div>
        </form>
      </div>

      <div class="space-y-3">
        <h3 class="text-sm font-bold text-white flex items-center justify-between">
          <span>🛍️ محصولات ثبت‌شده در فروشگاه</span>
          <span class="text-xs text-slate-400">${(products || []).length} محصول</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          ${productCards || '<p class="text-xs text-slate-500 p-4">هیچ محصولی هنوز اضافه نشده است.</p>'}
        </div>
      </div>
    </div>

    <!-- تب ۲: پلن‌ها و قیمت‌های کانفیگ -->
    <div id="tabContent_plans" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <span>⚡</span>
            <span>تغییر دستی قیمت پلن‌های کانفیگ</span>
          </h3>
          <button onclick="savePlanPrices()" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition">
            💾 ذخیره تغییرات قیمت
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-950 text-slate-400">
              <tr>
                <th class="p-3">عنوان پلن</th>
                <th class="p-3">حجم ترافیک</th>
                <th class="p-3">مدت زمان</th>
                <th class="p-3">قیمت فروش دستی</th>
              </tr>
            </thead>
            <tbody>
              ${planRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- تب ۳: سفارشات خریداران -->
    <div id="tabContent_orders" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div class="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 class="text-sm font-bold text-white flex items-center gap-2">
            <span>🛒</span>
            <span>آخرین سفارشات ثبت‌شده (کانفیگ و فروشگاه)</span>
          </h2>
          <span class="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-lg">${(orders || []).length} سفارش</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-950 text-slate-400">
              <tr><th class="p-3">شماره سفارش</th><th class="p-3">شناسه خریدار</th><th class="p-3">عنوان آیتم</th><th class="p-3">مبلغ</th><th class="p-3">تاریخ</th><th class="p-3">وضعیت</th></tr>
            </thead>
            <tbody>${orderRows || '<tr><td colspan="6" class="p-6 text-center text-slate-500">هنوز سفارشی ثبت نشده است</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- تب ۴: تنظیمات متون و شماره کارت -->
    <div id="tabContent_settings" class="hidden space-y-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <h3 class="text-sm font-bold text-white">⚙️ تنظیمات اطلاعات بانکی، نام ربات و پیام‌ها</h3>
        <form id="settingsForm" onsubmit="handleSaveSettings(event)" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-slate-400 mb-1">نام ربات</label>
            <input type="text" id="settingBotName" value="${botName}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white">
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">آیدی پشتیبانی تلگرام (بدون @)</label>
            <input type="text" id="settingSupport" value="${settings?.support_username || 'support_admin'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-cyan-300 font-mono">
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">شماره کارت بانکی</label>
            <input type="text" id="settingCardNum" value="${payment?.cardNumber || '6037-9975-1234-5678'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-amber-300 font-mono">
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">نام صاحب حساب</label>
            <input type="text" id="settingCardHolder" value="${payment?.cardHolder || 'مدیریت سرویس'}" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white">
          </div>
          <div class="md:col-span-2">
            <button type="submit" class="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition">
              💾 ذخیره تنظیمات در Cloudflare KV
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- تب ۵: وب‌هوک و پیام همگانی -->
    <div id="tabContent_webhook" class="hidden grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          <span>⚡</span>
          <span>تنظیم خودکار وب‌هوک ربات تلگرام</span>
        </h2>
        <form id="whForm" class="space-y-3">
          <input type="text" id="whToken" required value="${currentBotToken || ''}" placeholder="توکن ربات تلگرام..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-amber-300 font-mono">
          <button type="submit" class="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition">تنظیم خودکار وب‌هوک در تلگرام</button>
          <div id="whRes" class="text-xs text-center hidden p-2 rounded-lg"></div>
        </form>
      </div>

      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📢</span>
          <span>ارسال پیام همگانی به اعضای ربات</span>
        </h2>
        <form id="bcForm" class="space-y-3">
          <textarea id="bcText" rows="3" required placeholder="متن پیام همگانی..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"></textarea>
          <button type="submit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition">ارسال به همه کاربران</button>
          <div id="bcRes" class="text-xs text-center hidden p-2 rounded-lg"></div>
        </form>
      </div>
    </div>
  </main>

  <script>
    const currentPlans = ${JSON.stringify(plans || [])};

    function setTab(tab) {
      ['shop', 'plans', 'orders', 'settings', 'webhook'].forEach(t => {
        const content = document.getElementById('tabContent_' + t);
        const btn = document.getElementById('tabBtn_' + t);
        if (content) content.classList.toggle('hidden', t !== tab);
        if (btn) {
          if (t === tab) {
            btn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-purple-600 text-white';
          } else {
            btn.className = 'tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-300 hover:bg-slate-800';
          }
        }
      });
    }

    function updateImagePreview(url) {
      const img = document.getElementById('imagePreviewBox');
      if (img && url) img.src = url;
    }

    async function switchBotMode(mode) {
      try {
        const res = await fetch('/admin/api/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        });
        const d = await res.json();
        if (d.ok) {
          alert('✅ حالت ربات با موفقیت به ' + (mode === 'shop' ? 'فروشگاه کالا (با عکس)' : 'فروش کانفیگ VPN') + ' تغییر یافت.');
          location.reload();
        }
      } catch (e) {
        alert('خطا در تغییر حالت ربات');
      }
    }

    async function handleCreateProduct(e) {
      e.preventDefault();
      const title = document.getElementById('prodTitle').value;
      const price_toman = Number(document.getElementById('prodPrice').value);
      const category = document.getElementById('prodCategory').value;
      const image_url = document.getElementById('prodImageUrl').value;
      const description = document.getElementById('prodDesc').value;

      try {
        const r = await fetch('/admin/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, price_toman, category, image_url, description })
        });
        const d = await r.json();
        if (d.ok) {
          alert('✅ محصول با موفقیت ثبت شد!');
          location.reload();
        } else {
          alert('خطا: ' + d.error);
        }
      } catch (err) {
        alert('خطا در ارتباط با سرور');
      }
    }

    async function deleteProduct(id) {
      if (!confirm('آیا از حذف این محصول اطمینان دارید؟')) return;
      try {
        const r = await fetch('/admin/api/products/' + id, { method: 'DELETE' });
        const d = await r.json();
        if (d.ok) {
          alert('✅ محصول حذف شد.');
          location.reload();
        }
      } catch (err) {
        alert('خطا در حذف');
      }
    }

    async function savePlanPrices() {
      const updated = currentPlans.map((p, idx) => {
        const input = document.getElementById('plan_price_' + idx);
        return { ...p, priceToman: Number(input?.value || p.priceToman) };
      });
      try {
        const r = await fetch('/admin/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plans: updated })
        });
        const d = await r.json();
        if (d.ok) {
          alert('✅ قیمت‌های کانفیگ با موفقیت در KV ذخیره شد!');
          location.reload();
        }
      } catch (e) {
        alert('خطا در ذخیره قیمت‌ها');
      }
    }

    async function handleSaveSettings(e) {
      e.preventDefault();
      const bot_name = document.getElementById('settingBotName').value;
      const support_username = document.getElementById('settingSupport').value;
      const cardNumber = document.getElementById('settingCardNum').value;
      const cardHolder = document.getElementById('settingCardHolder').value;

      try {
        const r = await fetch('/admin/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bot_name, support_username, cardNumber, cardHolder })
        });
        const d = await r.json();
        if (d.ok) {
          alert('✅ تنظیمات با موفقیت ذخیره شد.');
          location.reload();
        }
      } catch (e) {
        alert('خطا در ذخیره تنظیمات');
      }
    }

    document.getElementById('whForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('whToken').value;
      const resBox = document.getElementById('whRes');
      resBox.className = 'text-xs text-center p-2 rounded-lg bg-slate-800 text-slate-300';
      resBox.innerText = 'در حال ارتباط با تلگرام...';
      resBox.classList.remove('hidden');

      try {
        const r = await fetch('/admin/set-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const d = await r.json();
        if (d.ok) {
          resBox.className = 'text-xs text-center p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          resBox.innerText = '✅ وب‌هوک با موفقیت ست شد!';
        } else {
          resBox.className = 'text-xs text-center p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20';
          resBox.innerText = '❌ خطا: ' + (d.error || d.description);
        }
      } catch (err) {
        resBox.className = 'text-xs text-center p-2 rounded-lg bg-rose-500/10 text-rose-400';
        resBox.innerText = '❌ خطا در شبکه';
      }
    });

    document.getElementById('bcForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('bcText').value;
      const resBox = document.getElementById('bcRes');
      resBox.classList.remove('hidden');
      resBox.innerText = 'در حال ارسال...';
      const r = await fetch('/admin/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const d = await r.json();
      if (d.ok) {
        resBox.className = 'text-xs text-center p-2 rounded-lg bg-emerald-500/10 text-emerald-400';
        resBox.innerText = '✅ ارسال شد به ' + d.sentCount + ' کاربر';
      }
    });
  </script>
</body>
</html>`;
}

export async function handleSetWebhook(c: Context<{ Bindings: any }>) {
  try {
    const body = await c.req.json<{ token?: string }>().catch(() => ({ token: undefined }));
    const botToken = body.token?.trim() || c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return c.json({ ok: false, error: 'توکن الزامی است' }, 400);

    const workerWebhookUrl = new URL('/webhook', c.req.url).toString();
    const telegramApiUrl = new URL(`https://api.telegram.org/bot${botToken}/setWebhook`);
    telegramApiUrl.searchParams.set('url', workerWebhookUrl);
    telegramApiUrl.searchParams.set('drop_pending_updates', 'true');

    const res = await fetch(telegramApiUrl.toString());
    const data: any = await res.json();

    if (data.ok && c.env.BOT_KV) {
      await c.env.BOT_KV.put('settings:telegram_bot_token', botToken);
    }

    return c.json(data);
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
}

export async function handleAdminDashboard(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const stats = await getSystemStats(kv);
  const users = await getAllUsers(kv, 30);
  const orders = await getAllOrders(kv, 20);
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const activeUsersToday = users.filter((u: any) => u.last_active > oneDayAgo).length;
  const settings = await getBotSettings(kv);
  const botMode = await getBotMode(kv);
  const products = await getShopProducts(kv);
  const plans = await getPlans(kv);
  const payment = await getPaymentConfig(kv);
  const webhookUrl = new URL('/webhook', c.req.url).toString();

  const html = renderAdminDashboardHtml({
    stats,
    users,
    orders,
    activeUsersToday,
    settings,
    botMode,
    products,
    plans,
    payment,
    botName: settings.bot_name || c.env.BOT_NAME || 'ربات هوشمند تلگرام',
    webhookUrl,
    currentBotToken: c.env.TELEGRAM_BOT_TOKEN,
  });

  return c.html(html);
}

export async function handleAdminBroadcast(c: Context<{ Bindings: any }>) {
  const body = await c.req.json<{ message: string }>();
  const kv = c.env.BOT_KV;
  const users = await getAllUsers(kv);
  let count = 0;
  for (const u of users) {
    try {
      await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: u.chat_id, text: body.message, parse_mode: 'HTML' })
      });
      count++;
    } catch (e) {}
  }
  await incrementBroadcastCount(kv, count);
  return c.json({ ok: true, sentCount: count });
}

export async function handleAdminSetMode(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const body = await c.req.json<{ mode: 'vpn' | 'shop' }>();
  if (!body.mode || (body.mode !== 'vpn' && body.mode !== 'shop')) {
    return c.json({ ok: false, error: 'نوع نامعتبر است' }, 400);
  }
  await setBotMode(kv, body.mode);
  return c.json({ ok: true, mode: body.mode });
}

export async function handleAdminGetProducts(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const products = await getShopProducts(kv);
  return c.json({ ok: true, products });
}

export async function handleAdminSaveProduct(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const body = await c.req.json<any>();
  if (!body.title || !body.price_toman) {
    return c.json({ ok: false, error: 'عنوان و قیمت الزامی است' }, 400);
  }
  const current = await getShopProducts(kv);
  const newProduct = {
    id: body.id || `prod_${Date.now()}`,
    title: body.title,
    price_toman: Number(body.price_toman),
    category: body.category || 'عمومی',
    description: body.description || '',
    image_url: body.image_url || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80',
    in_stock: body.in_stock !== false,
    created_at: Date.now()
  };
  const updated = [newProduct, ...current];
  await saveShopProducts(kv, updated);
  return c.json({ ok: true, product: newProduct });
}

export async function handleAdminDeleteProduct(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const id = c.req.param('id');
  const current = await getShopProducts(kv);
  const filtered = current.filter((p: any) => p.id !== id);
  await saveShopProducts(kv, filtered);
  return c.json({ ok: true });
}

export async function handleAdminUpdatePlans(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const body = await c.req.json<{ plans: any[] }>();
  if (!body.plans) return c.json({ ok: false, error: 'لیست پلن‌ها الزامی است' }, 400);
  await savePlans(kv, body.plans);
  return c.json({ ok: true, plans: body.plans });
}

export async function handleAdminUpdateSettings(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const body = await c.req.json<any>();
  if (body.bot_name || body.support_username) {
    await kv.put('settings:bot_config', JSON.stringify(body));
  }
  if (body.cardNumber || body.cardHolder) {
    await savePaymentConfig(kv, {
      cardNumber: body.cardNumber,
      cardHolder: body.cardHolder,
      bankName: body.bankName || 'بانک ملی',
      shabaNumber: body.shabaNumber || ''
    });
  }
  return c.json({ ok: true, settings: body });
}
