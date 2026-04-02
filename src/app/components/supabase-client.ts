import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error(
		'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
	);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const API_BASE = `${supabaseUrl}/functions/v1/make-server-0a99cdba`;
