import { Hono } from 'hono';
import { handleBotUpdate } from './handlers/bot';
import { 
  handleAdminDashboard, 
  handleAdminBroadcast, 
  handleSetWebhook,
  handleAdminSetMode,
  handleAdminGetProducts,
  handleAdminSaveProduct,
  handleAdminDeleteProduct,
  handleAdminUpdatePlans,
  handleAdminUpdateSettings
} from './handlers/admin';
import { authMiddleware, handleLoginPage, handleLoginSubmit, handleLogout } from './handlers/auth';
import type { TelegramUpdate } from './types/telegram';

export type Bindings = {
  BOT_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  BOT_NAME?: string;
  MARZBAN_URL?: string;
  MARZBAN_TOKEN?: string;
  CARD_NUMBER?: string;
  CARD_HOLDER?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  c.header('X-Response-Time', `${Date.now() - start}ms`);
});

app.get('/', (c) => {
  return c.json({
    status: 'online',
    service: 'Telegram Dual-Mode Bot (VPN & Products) with Hono & Cloudflare Workers',
    endpoints: {
      webhook: 'POST /webhook',
      admin: 'GET /admin',
      login: 'GET /login',
    }
  });
});

app.post('/webhook', async (c) => {
  const secret = c.env.WEBHOOK_SECRET;
  if (secret && c.req.header('X-Telegram-Bot-Api-Secret-Token') !== secret) {
    return c.text('Unauthorized', 401);
  }

  try {
    const update = await c.req.json<TelegramUpdate>();
    c.executionCtx.waitUntil(
      handleBotUpdate(update, c.env).catch((err) => {
        console.error('Error in handleBotUpdate execution:', err);
      })
    );
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message }, 500);
  }
});

app.get('/login', (c) => handleLoginPage(c));
app.post('/login', (c) => handleLoginSubmit(c));
app.get('/logout', (c) => handleLogout(c));

app.use('/admin', authMiddleware);
app.use('/admin/*', authMiddleware);

app.get('/admin', (c) => handleAdminDashboard(c));
app.post('/admin/set-webhook', (c) => handleSetWebhook(c));
app.post('/admin/api/broadcast', (c) => handleAdminBroadcast(c));
app.post('/admin/api/mode', (c) => handleAdminSetMode(c));
app.get('/admin/api/products', (c) => handleAdminGetProducts(c));
app.post('/admin/api/products', (c) => handleAdminSaveProduct(c));
app.delete('/admin/api/products/:id', (c) => handleAdminDeleteProduct(c));
app.post('/admin/api/plans', (c) => handleAdminUpdatePlans(c));
app.post('/admin/api/settings', (c) => handleAdminUpdateSettings(c));

export default app;
