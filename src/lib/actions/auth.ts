"use server";

import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server action to completely terminate the active Supabase session
 * on the server, invalidate auth tokens, and clear auth cookies from HTTP response headers.
 */
export async function signOutAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[signOutAction] Supabase auth signOut error:", error.message);
      return { success: false, error: error.message };
    }

    // Explicitly purge any lingering Supabase auth cookies from the response headers
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    for (const c of allCookies) {
      if (
        c.name.startsWith("sb-") &&
        (c.name.includes("auth-token") || c.name.includes("verifier"))
      ) {
        try {
          cookieStore.delete(c.name);
        } catch {
          cookieStore.set(c.name, "", { maxAge: 0, path: "/" });
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("[signOutAction] Unexpected error during server sign out:", err?.message || err);
    return {
      success: false,
      error: err?.message || "Failed to invalidate server session",
    };
  }
}
