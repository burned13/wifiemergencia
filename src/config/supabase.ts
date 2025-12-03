import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const fallbackUrl = 'https://invalid.supabase.local';
const fallbackKey = 'invalid-key';

export const supabase = createClient(supabaseUrl || fallbackUrl, supabaseAnonKey || fallbackKey);

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
export const SUPABASE_CONFIGURED = !!(supabaseUrl && supabaseAnonKey);
