import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://eppjicsqckbiyncojkfd.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_DatnKJ2B2Y4ZBAL9BDMxhg_HdiEfkH7";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);