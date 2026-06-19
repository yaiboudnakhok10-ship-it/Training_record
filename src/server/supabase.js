import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL_INTERNAL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY_INTERNAL

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'YOUR_SUPABASE_URL') {
  console.error('Missing Supabase configuration. Please check your .env file.')
}

export const supabaseInternal = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder-key'
)

export default supabaseInternal
