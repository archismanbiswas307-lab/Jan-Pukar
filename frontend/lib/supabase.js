import { createClient } from "@supabase/supabase-js";

const normalizeEnvValue = (value) => {
  if (!value) return undefined;
  const cleaned = value.toString().trim().replace(/^['"]+|['"]+$/g, "");
  return cleaned.replace(/\/+$/, "");
};

const supabaseUrl = normalizeEnvValue(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
);
const supabaseAnonKey = normalizeEnvValue(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase client environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);