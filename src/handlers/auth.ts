import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const SESSION_COOKIE_NAME = 'admin_session_token';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

async function generateSessionToken(username: string, passwordHash: string): Promise<string> {
  const data = new TextEncoder().encode(`${username}:${passwordHash}:cloudflare_edge_secret`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function renderLoginPageHtml(errorMessage?: string, botName: string = 'ربات تلگرام'): string {
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
    ${errorMessage ? `<div class="p-3 rounded-xl bg-rose-500/10 text-rose-400 text-xs">⚠️ ${errorMessage}</div>` : ''}
    <form method="POST" action="/login" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">نام کاربری:</label>
        <input type="text" name="username" required placeholder="admin" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1">رمز عبور:</label>
        <input type="password" name="password" required placeholder="••••••••" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500">
      </div>
      <button type="submit" class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition">ورود به داشبورد</button>
    </form>
  </div>
</body>
</html>`;
}

export const authMiddleware: MiddlewareHandler<{ Bindings: any }> = async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const expectedUsername = c.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = c.env.ADMIN_PASSWORD || 'admin123';
  const validToken = await generateSessionToken(expectedUsername, expectedPassword);

  if (!sessionToken || sessionToken !== validToken) {
    if (c.req.path.startsWith('/admin/api') || c.req.path === '/admin/set-webhook') {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }
    return c.redirect('/login');
  }
  await next();
};

export async function handleLoginPage(c: Context<{ Bindings: any }>) {
  return c.html(renderLoginPageHtml(undefined, c.env.BOT_NAME));
}

export async function handleLoginSubmit(c: Context<{ Bindings: any }>) {
  const formData = await c.req.parseBody();
  const username = (formData['username'] as string)?.trim() || '';
  const password = (formData['password'] as string) || '';

  const expectedUsername = c.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = c.env.ADMIN_PASSWORD || 'admin123';

  if (username === expectedUsername && password === expectedPassword) {
    const token = await generateSessionToken(expectedUsername, expectedPassword);
    setCookie(c, SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: SESSION_MAX_AGE,
    });
    return c.redirect('/admin');
  }

  return c.html(renderLoginPageHtml('نام کاربری یا رمز عبور اشتباه است.', c.env.BOT_NAME), 401);
}

export async function handleLogout(c: Context) {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.redirect('/login');
}
