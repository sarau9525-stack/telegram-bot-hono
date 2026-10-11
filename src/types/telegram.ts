export interface UserData {
  user_id: number;
  chat_id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface UserRecord extends UserData {
  message_count: number;
  created_at: number;
  last_active: number;
}

export interface VPNPlan {
  id: string;
  title: string;
  trafficGb: number;
  days: number;
  priceToman: number;
  formattedPrice?: string;
  isActive?: boolean;
}

export interface PaymentDetails {
  cardNumber: string;
  cardHolder: string;
  shabaNumber: string;
  bankName: string;
}

export interface SubscriptionOrder {
  order_id: string;
  user_id: number;
  user_name: string;
  username?: string;
  plan_id: string;
  plan_name: string;
  trafficGb?: number;
  price_toman: number;
  config_url: string;
  expire_date: number;
  created_at: number;
  status: 'active' | 'expired' | 'pending';
}

export interface BotSettings {
  is_enabled: boolean;
  bot_name?: string;
  welcome_message: string;
  help_message?: string;
  maintenance_message: string;
  support_username: string;
  updated_at: number;
}

export interface BotStats {
  totalUsers: number;
  totalMessages: number;
  broadcastsSent: number;
  lastUpdated: number;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardMarkup {
  keyboard: { text: string }[][];
  resize_keyboard?: boolean;
}

export interface SendMessageOptions {
  chat_id: number | string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup;
}

export interface TelegramUpdate {
  update_id: number;
  message?: any;
  callback_query?: any;
}
