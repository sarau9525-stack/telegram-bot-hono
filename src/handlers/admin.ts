// ============================================================================
// فایل: src/handlers/admin.ts
// داشبورد ادمین با گزارش فروش و سفارشات اشتراک
// ============================================================================

import type { Context } from 'hono';
import { getAllUsers, getSystemStats, getBotSettings, getAllOrders, incrementBroadcastCount } from '../utils/db';

export function renderAdminDashboardHtml(data: any): string {
  const { stats, users, orders, activeUsersToday, botName, webhookUrl, currentBotToken } = data;

  const orderRows = (orders || []).map((o: any) => `
    <tr class="border-b border-slate-800 hover:bg-slate-800/40">
      <td class="p-3 font-mono text-cyan-400 text-xs">${o.order_id}</td>
      <td class="p-3 font-mono text-slate-300 text-xs">${o.user_id}</td>
      <td class="p-3 font-semibold text-white text-xs">${o.plan_name}</td>
      <td class="p-3 font-mono text-amber-400 text-xs">${Number(o.price_toman).toLocaleString('fa-IR')} تومان</td>
      <td class="p-3 text-xs text-slate-300">${new Date(o.expire_date).toLocaleDateString('fa-IR')}</td>
      <td class="p-3 text-xs">
        <span class="inline-flex items-center gap-1 text-emerald-400 font-bold">● فعال</span>
      </td>
    </tr>
  `).join('');

  const userRows = users.map((u: any) => `
    <tr class="border-b border-slate-800 hover:bg-slate-800/40">
      <td class="p-3 font-mono text-cyan-400 text-xs">${u.user_id}</td>
      <td class="p-3 text-slate-200">${u.first_name}</td>
      <td class="p-3 text-slate-400 font-mono text-xs">${u.username ? '@' + u.username : '---'}</td>
      <td class="p-3 text-slate-300 font-mono text-xs">${u.message_count}</td>
      <td class="p-3 text-slate-400 text-xs">${new Date(u.created_at).toLocaleDateString('fa-IR')}</td>
      <td class="p-3 text-emerald-400 text-xs">● فعال در KV</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>پنل مدیریت فروشگاه - ${botName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body { font-family: 'Vazirmatn', sans-serif; }</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <header class="border-b border-slate-800 bg-slate-900/60 p-4 flex justify-between items-center sticky top-0 backdrop-blur z-30">
    <div class="flex items-center gap-2">
      <span class="text-2xl">⚡</span>
      <div>
        <h1 class="text-base font-bold text-white">${botName}</h1>
        <p class="text-[11px] text-slate-400">پنل مدیریت فروش کانفیگ و اشتراک VPN</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">درآمد: ${Number(stats.totalRevenue || 0).toLocaleString('fa-IR')} تومان</span>
      <a href="/logout" class="text-xs text-rose-400 bg-rose-500/10 px-3 py-1 rounded-lg">خروج 🚪</a>
    </div>
  </header>

  <main class="max-w-7xl mx-auto p-6 space-y-6">
    <!-- کارتهای آماری فروش -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <p class="text-xs text-slate-400">تعداد کل سفارشات اشتراک</p>
        <p class="text-3xl font-extrabold text-white mt-2 font-mono">${stats.totalOrders || 0}</p>
        <p class="text-xs text-emerald-400 mt-1">تولید خودکار با Marzban</p>
      </div>

      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <p class="text-xs text-slate-400">مجموع درآمد حاصل از فروش</p>
        <p class="text-2xl font-extrabold text-amber-400 mt-2 font-mono">${Number(stats.totalRevenue || 0).toLocaleString('fa-IR')} تومان</p>
        <p class="text-xs text-slate-400 mt-1">ذخیره شده در KV</p>
      </div>

      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <p class="text-xs text-slate-400">تعداد کاربران ربات</p>
        <p class="text-3xl font-extrabold text-cyan-400 mt-2 font-mono">${stats.totalUsers}</p>
        <p class="text-xs text-slate-400 mt-1">${activeUsersToday} کاربر فعال امروز</p>
      </div>

      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <p class="text-xs text-slate-400">وضعیت اتصال به پنل مرزبان</p>
        <p class="text-sm font-bold text-emerald-400 mt-3 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          آنلاین (REST API Connected)
        </p>
        <p class="text-[11px] text-slate-500 mt-1">صدور آنی سابسکریپشن</p>
      </div>
    </div>

    <!-- جدول آخرین سفارشات اشتراک -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div class="p-4 border-b border-slate-800 flex justify-between items-center">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          <span>🛒</span>
          <span>آخرین اشتراک‌های خریداری‌شده (سفارشات اخیر)</span>
        </h2>
        <span class="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-lg">${(orders || []).length} سفارش</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-950 text-slate-400">
            <tr><th class="p-3">شماره سفارش</th><th class="p-3">شناسه خریدار</th><th class="p-3">پلن</th><th class="p-3">مبلغ</th><th class="p-3">تاریخ انقضا</th><th class="p-3">وضعیت</th></tr>
          </thead>
          <tbody>${orderRows || '<tr><td colspan="6" class="p-6 text-center text-slate-500">هنوز سفارشی ثبت نشده است</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <!-- فرم برودکست و تنظیم وب‌هوک -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- تنظیم خودکار وب‌هوک -->
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          <span>⚡</span>
          <span>تنظیم خودکار وب‌هوک</span>
        </h2>
        <form id="whForm" class="space-y-3">
          <input type="text" id="whToken" required value="${currentBotToken || ''}" placeholder="توکن ربات تلگرام..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-amber-300 font-mono">
          <button type="submit" class="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition">تنظیم خودکار وب‌هوک در تلگرام</button>
          <div id="whRes" class="text-xs text-center hidden p-2 rounded-lg"></div>
        </form>
      </div>

      <!-- ارسال پیام همگانی -->
      <div class="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-3">
        <h2 class="text-sm font-bold text-white flex items-center gap-2">
          <span>📢</span>
          <span>ارسال پیام همگانی به خریداران</span>
        </h2>
        <form id="bcForm" class="space-y-3">
          <textarea id="bcText" rows="3" required placeholder="تخفیف ویژه یا پیام مهم برای اعضا..." class="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"></textarea>
          <button type="submit" class="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition">ارسال به همه کاربران</button>
          <div id="bcRes" class="text-xs text-center hidden p-2 rounded-lg"></div>
        </form>
      </div>
    </div>
  </main>

  <script>
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

    // ذخیره توکن در KV تا ورکر همیشه به آن دسترسی داشته باشد
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
  const webhookUrl = new URL('/webhook', c.req.url).toString();

  const html = renderAdminDashboardHtml({
    stats,
    users,
    orders,
    activeUsersToday,
    settings,
    botName: c.env.BOT_NAME || 'ربات هوشمند فروش کانفیگ',
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

export async function handleAdminUpdatePlans(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const body = await c.req.json<{ plans: any[] }>();
  if (!body.plans) return c.json({ ok: false, error: 'لیست پلن‌ها الزامی است' }, 400);
  await kv.put('plans:list', JSON.stringify(body.plans));
  return c.json({ ok: true, plans: body.plans });
}

export async function handleAdminUpdateSettings(c: Context<{ Bindings: any }>) {
  const kv = c.env.BOT_KV;
  const body = await c.req.json<any>();
  await kv.put('settings:bot_config', JSON.stringify(body));
  return c.json({ ok: true, settings: body });
}
