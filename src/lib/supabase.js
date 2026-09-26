import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigError = !supabaseUrl || !supabaseAnonKey
  || supabaseUrl.includes('your-project.supabase.co')
  || supabaseAnonKey === 'your-public-anon-key'
  ? 'Supabase is not configured for this extension build. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the repository-root .env file, then rebuild.'
  : '';

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);
