import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nsmuupxqgriyhzyljttm.supabase.co';
const supabaseAnonKey = 'sb_publishable_KoD1XQEQU2ZgCuWywwXDSg_cYL8RF6D';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});