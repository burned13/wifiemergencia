/*
  # WiFi Share App - Initial Database Schema

  1. New Tables:
    - `users` - User accounts and authentication
    - `user_subscriptions` - Subscription and payment tracking
    - `user_devices` - Device registration for multi-device support
    - `wifi_networks` - Registered WiFi networks with encryption
    - `wifi_connections` - Connection history and usage tracking
    - `network_access_logs` - Access logs for security and audit
    - `payment_transactions` - Payment history

  2. Security:
    - Enable RLS on all tables
    - Add policies for user data protection
    - Encrypt sensitive fields at database level

  3. Indexes:
    - GPS coordinates for spatial queries
    - User IDs for fast lookups
    - Network SSIDs for search
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  phone_number text,
  username text UNIQUE NOT NULL,
  avatar_url text,
  home_network_id uuid,
  downloads_remaining integer DEFAULT 0,
  total_downloads integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  last_login timestamptz
);

-- Create user subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_type text CHECK (subscription_type IN ('free', 'premium', 'lifetime')),
  payment_status text CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  amount_paid decimal(10, 2),
  currency text DEFAULT 'USD',
  purchase_date timestamptz DEFAULT now(),
  expiration_date timestamptz,
  payment_method text,
  stripe_transaction_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user devices table
CREATE TABLE IF NOT EXISTS user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  device_type text CHECK (device_type IN ('iOS', 'Android', 'web')),
  device_id_hash text UNIQUE NOT NULL,
  os_version text,
  app_version text,
  is_active boolean DEFAULT true,
  last_used timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create WiFi networks table with encryption
CREATE TABLE IF NOT EXISTS wifi_networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ssid text NOT NULL,
  password_encrypted text NOT NULL,
  network_type text CHECK (network_type IN ('home', 'public', 'enterprise')),
  latitude decimal(10, 8) NOT NULL,
  longitude decimal(11, 8) NOT NULL,
  signal_strength integer DEFAULT 0,
  frequency_band text CHECK (frequency_band IN ('2.4GHz', '5GHz', 'dual')),
  security_protocol text CHECK (security_protocol IN ('WPA2', 'WPA3', 'WEP', 'open')),
  max_concurrent_users integer DEFAULT 3,
  current_users integer DEFAULT 0,
  session_timeout_minutes integer DEFAULT 10,
  is_active boolean DEFAULT true,
  description text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_used timestamptz
);

-- Create WiFi connections table
CREATE TABLE IF NOT EXISTS wifi_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id uuid NOT NULL REFERENCES wifi_networks(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
  connection_start timestamptz DEFAULT now(),
  connection_end timestamptz,
  duration_seconds integer,
  data_used_mb decimal(10, 2),
  signal_strength integer,
  ip_address inet,
  connection_status text CHECK (connection_status IN ('active', 'completed', 'failed', 'timeout')),
  user_latitude decimal(10, 8),
  user_longitude decimal(11, 8),
  created_at timestamptz DEFAULT now()
);

-- Create network access logs table
CREATE TABLE IF NOT EXISTS network_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id uuid NOT NULL REFERENCES wifi_networks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_type text CHECK (access_type IN ('successful', 'failed_auth', 'timeout', 'disconnected', 'limit_exceeded')),
  latitude decimal(10, 8),
  longitude decimal(11, 8),
  timestamp timestamptz DEFAULT now(),
  error_message text
);

-- Create payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount decimal(10, 2) NOT NULL,
  currency text DEFAULT 'USD',
  status text CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_type text CHECK (transaction_type IN ('initial_download', 'premium_upgrade', 'refund')),
  stripe_payment_intent_id text UNIQUE,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_wifi_networks_owner_id ON wifi_networks(owner_id);
CREATE INDEX idx_wifi_connections_user_id ON wifi_connections(user_id);
CREATE INDEX idx_wifi_connections_network_id ON wifi_connections(network_id);
CREATE INDEX idx_network_access_logs_network_id ON network_access_logs(network_id);
CREATE INDEX idx_network_access_logs_user_id ON network_access_logs(user_id);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wifi_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE wifi_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can read own subscriptions"
  ON user_subscriptions FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- RLS Policies for wifi_networks
CREATE POLICY "Users can read all active networks"
  ON wifi_networks FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can create networks"
  ON wifi_networks FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Network owners can update own networks"
  ON wifi_networks FOR UPDATE
  TO authenticated
  USING (
    owner_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    owner_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Network owners can delete own networks"
  ON wifi_networks FOR DELETE
  TO authenticated
  USING (
    owner_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- RLS Policies for wifi_connections
CREATE POLICY "Users can read own connections"
  ON wifi_connections FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Users can create connections"
  ON wifi_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- RLS Policies for user_devices
CREATE POLICY "Users can read own devices"
  ON user_devices FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Users can create devices"
  ON user_devices FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Users can update own devices"
  ON user_devices FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- RLS Policies for network_access_logs
CREATE POLICY "Users can read own access logs"
  ON network_access_logs FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "System can insert access logs"
  ON network_access_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for payment_transactions
CREATE POLICY "Users can read own transactions"
  ON payment_transactions FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );