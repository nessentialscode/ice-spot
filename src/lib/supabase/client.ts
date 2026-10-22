import { createBrowserClient } from "@supabase/ssr";
import { Database } from "./database.types";

/**
 * Checks whether the required Supabase environment variables are present and non-empty.
 */
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(
    supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes("your-project") &&
      !supabaseKey.includes("your-publishable-key") &&
      !supabaseKey.includes("your-anon-key")
  );
}

/**
 * Creates a browser-side Supabase client using @supabase/ssr.
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or fallback NEXT_PUBLIC_SUPABASE_ANON_KEY).
 * Throws a descriptive configuration error if required environment variables are missing,
 * without exposing sensitive values.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in your environment variables."
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
