import { createBrowserClient } from "@supabase/ssr";
import { Database } from "./database.types";

/**
 * Creates a client-side Supabase client.
 * Returns null if Supabase environment variables have not been configured yet.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("your-project")) {
    return null;
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
