export interface User {
  id: string;
  auth_id: string;
  email: string;
  phone_number?: string;
  username: string;
  avatar_url?: string;
  home_network_id?: string;
  downloads_remaining: number;
  total_downloads: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface WiFiNetwork {
  id: string;
  owner_id: string;
  ssid: string;
  bssid?: string;
  password_encrypted: string;
  network_type: 'home' | 'public' | 'enterprise';
  latitude: number;
  longitude: number;
  signal_strength: number;
  frequency_band: '2.4GHz' | '5GHz' | 'dual';
  security_protocol: 'WPA2' | 'WPA3' | 'WEP' | 'open';
  max_concurrent_users: number;
  current_users: number;
  session_timeout_minutes: number;
  is_active: boolean;
  description?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  last_used?: string;
}

export interface WiFiConnection {
  id: string;
  user_id: string;
  network_id: string;
  device_id: string;
  connection_start: string;
  connection_end?: string;
  duration_seconds?: number;
  data_used_mb?: number;
  signal_strength: number;
  ip_address?: string;
  connection_status: 'active' | 'completed' | 'failed' | 'timeout';
  user_latitude: number;
  user_longitude: number;
  created_at: string;
}

export interface UserDevice {
  id: string;
  user_id: string;
  device_name: string;
  device_type: 'iOS' | 'Android' | 'web';
  device_id_hash: string;
  os_version: string;
  app_version: string;
  is_active: boolean;
  last_used?: string;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  subscription_type: 'free' | 'premium' | 'lifetime';
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
  amount_paid?: number;
  currency: string;
  purchase_date: string;
  expiration_date?: string;
  payment_method?: string;
  stripe_transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transaction_type: 'initial_download' | 'premium_upgrade' | 'refund';
  stripe_payment_intent_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface NetworkAccessLog {
  id: string;
  network_id: string;
  user_id: string;
  access_type: 'successful' | 'failed_auth' | 'timeout' | 'disconnected' | 'limit_exceeded';
  latitude: number;
  longitude: number;
  timestamp: string;
  error_message?: string;
}

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
}

export interface OfflineWiFiData {
  networks: WiFiNetwork[];
  lastSync: string;
  lastLocation: LocationCoordinates;
}

export interface PendingNetwork {
  ssid: string;
  bssid?: string;
  password: string;
  networkType: 'home' | 'public' | 'enterprise';
  latitude: number;
  longitude: number;
  accuracy: number;
  description?: string;
  tags?: string[];
  createdAt: string;
}

export interface WifiDiagnostics {
  isWifiEnabled?: boolean;
  ssid?: string | null;
  ip?: string | null;
  connected?: boolean;
  error?: string | null;
}

export interface InternetTestResult {
  reachable: boolean;
  latencyMs?: number | null;
  error?: string | null;
}
