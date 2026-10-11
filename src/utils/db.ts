// ============================================================================
// فایل: src/utils/db.ts
// ============================================================================

import type { UserData, UserRecord, BotSettings, BotStats, SubscriptionOrder } from '../types/telegram';

export const KV_KEYS = {
  USER_PREFIX: 'user:',
  META_USER_IDS: 'meta:user_ids',
  ORDER_PREFIX: 'order:',
  META_ORDER_IDS: 'meta:order_ids',
  USER_ORDERS_PREFIX: 'user_orders:',
  BOT_SETTINGS: 'settings:config',
  TOTAL_MESSAGES: 'stats:total_messages',
  BROADCASTS_SENT: 'stats:broadcasts_sent',
  TOTAL_REVENUE: 'stats:total_revenue',
} as const;

export async function saveUser(kv: KVNamespace, user: UserData): Promise<UserRecord> {
  const userKey = `${KV_KEYS.USER_PREFIX}${user.user_id}`;
  const existingJson = await kv.get(userKey);
  const existing: Partial<UserRecord> = existingJson ? JSON.parse(existingJson) : {};

  const now = Date.now();
  const record: UserRecord = {
    user_id: user.user_id,
    chat_id: user.chat_id,
    first_name: user.first_name,
    last_name: user.last_name || existing.last_name || '',
    username: user.username || existing.username || '',
    message_count: (existing.message_count || 0) + 1,
    created_at: existing.created_at || now,
    last_active: now,
  };

  await kv.put(userKey, JSON.stringify(record));

  if (!existing.user_id) {
    const listRaw = await kv.get(KV_KEYS.META_USER_IDS);
    const ids: number[] = listRaw ? JSON.parse(listRaw) : [];
    if (!ids.includes(user.user_id)) {
      ids.push(user.user_id);
      await kv.put(KV_KEYS.META_USER_IDS, JSON.stringify(ids));
    }
  }

  const countStr = await kv.get(KV_KEYS.TOTAL_MESSAGES);
  await kv.put(KV_KEYS.TOTAL_MESSAGES, String(parseInt(countStr || '0', 10) + 1));

  return record;
}

export async function getAllUsers(kv: KVNamespace, limit: number = 1000): Promise<UserRecord[]> {
  const idsJson = await kv.get(KV_KEYS.META_USER_IDS);
  if (!idsJson) return [];

  const userIds: number[] = JSON.parse(idsJson);
  const targetIds = userIds.slice(-limit).reverse();

  const promises = targetIds.map(async (id) => {
    try {
      const raw = await kv.get(`${KV_KEYS.USER_PREFIX}${id}`);
      return raw ? (JSON.parse(raw) as UserRecord) : null;
    } catch {
      return null;
    }
  });

  const resolved = await Promise.all(promises);
  return resolved.filter((u): u is UserRecord => u !== null);
}

// ============================================================================
// ذخیره و بازیابی سفارشات فروش اشتراک
// ============================================================================

export async function saveSubscriptionOrder(
  kv: KVNamespace,
  order: SubscriptionOrder
): Promise<void> {
  // ۱. ذخیره جزئیات سفارش
  const orderKey = `${KV_KEYS.ORDER_PREFIX}${order.order_id}`;
  await kv.put(orderKey, JSON.stringify(order));

  // ۲. افزودن به کلید سفارشات کاربر
  const userOrdersKey = `${KV_KEYS.USER_ORDERS_PREFIX}${order.user_id}`;
  const existingOrdersRaw = await kv.get(userOrdersKey);
  const userOrderList: string[] = existingOrdersRaw ? JSON.parse(existingOrdersRaw) : [];
  userOrderList.push(order.order_id);
  await kv.put(userOrdersKey, JSON.stringify(userOrderList));

  // ۳. افزودن به لیست تمام سفارشات سیستم
  const allOrdersRaw = await kv.get(KV_KEYS.META_ORDER_IDS);
  const allOrderList: string[] = allOrdersRaw ? JSON.parse(allOrdersRaw) : [];
  allOrderList.push(order.order_id);
  await kv.put(KV_KEYS.META_ORDER_IDS, JSON.stringify(allOrderList));

  // ۴. افزایش آمار درآمد کل
  const revRaw = await kv.get(KV_KEYS.TOTAL_REVENUE);
  const currentRev = parseInt(revRaw || '0', 10);
  await kv.put(KV_KEYS.TOTAL_REVENUE, String(currentRev + order.price_toman));
}

export async function getUserOrders(
  kv: KVNamespace,
  userId: number
): Promise<SubscriptionOrder[]> {
  const userOrdersKey = `${KV_KEYS.USER_ORDERS_PREFIX}${userId}`;
  const raw = await kv.get(userOrdersKey);
  if (!raw) return [];

  const orderIds: string[] = JSON.parse(raw);
  const orders: SubscriptionOrder[] = [];

  for (const id of orderIds) {
    const oRaw = await kv.get(`${KV_KEYS.ORDER_PREFIX}${id}`);
    if (oRaw) orders.push(JSON.parse(oRaw));
  }

  return orders.reverse();
}

export async function getAllOrders(
  kv: KVNamespace,
  limit: number = 50
): Promise<SubscriptionOrder[]> {
  const raw = await kv.get(KV_KEYS.META_ORDER_IDS);
  if (!raw) return [];

  const orderIds: string[] = JSON.parse(raw);
  const targetIds = orderIds.slice(-limit).reverse();
  const orders: SubscriptionOrder[] = [];

  for (const id of targetIds) {
    const oRaw = await kv.get(`${KV_KEYS.ORDER_PREFIX}${id}`);
    if (oRaw) orders.push(JSON.parse(oRaw));
  }

  return orders;
}

export async function getSystemStats(kv: KVNamespace): Promise<BotStats & { totalRevenue: number; totalOrders: number }> {
  const idsJson = await kv.get(KV_KEYS.META_USER_IDS);
  const ids: number[] = idsJson ? JSON.parse(idsJson) : [];
  const orderIdsJson = await kv.get(KV_KEYS.META_ORDER_IDS);
  const orderIds: string[] = orderIdsJson ? JSON.parse(orderIdsJson) : [];

  const totalMessages = parseInt((await kv.get(KV_KEYS.TOTAL_MESSAGES)) || '0', 10);
  const broadcastsSent = parseInt((await kv.get(KV_KEYS.BROADCASTS_SENT)) || '0', 10);
  const totalRevenue = parseInt((await kv.get(KV_KEYS.TOTAL_REVENUE)) || '0', 10);

  return {
    totalUsers: ids.length,
    totalMessages,
    broadcastsSent,
    totalOrders: orderIds.length,
    totalRevenue,
    lastUpdated: Date.now(),
  };
}

export async function getBotSettings(kv?: KVNamespace): Promise<BotSettings> {
  const defaultSettings: BotSettings = {
    is_enabled: true,
    welcome_message: 'سلام {first_name} عزیز! 👋\nبه ربات خرید اشتراک خوش آمدید.',
    maintenance_message: '⚠️ سیستم موقتاً در حال به‌روزرسانی است.',
    support_username: 'support_admin',
    updated_at: Date.now(),
  };

  if (!kv) return defaultSettings;

  try {
    const raw = await kv.get(KV_KEYS.BOT_SETTINGS);
    if (!raw) return defaultSettings;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read bot settings from KV, using default:', err);
    return defaultSettings;
  }
}

export async function incrementBroadcastCount(kv: KVNamespace, count: number): Promise<void> {
  const current = parseInt((await kv.get(KV_KEYS.BROADCASTS_SENT)) || '0', 10);
  await kv.put(KV_KEYS.BROADCASTS_SENT, String(current + count));
}
