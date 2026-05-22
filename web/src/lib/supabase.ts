import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  ?? ''
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseUrl !== 'https://your-project.supabase.co' &&
  supabaseAnon && supabaseAnon !== 'your-anon-key-here'
)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnon)
  : null
