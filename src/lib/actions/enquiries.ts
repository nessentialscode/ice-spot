"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface EnquirySubmissionInput {
  name: string;
  phone: string;
  email?: string;
  flavourInterest?: string;
  enquiryType: "general" | "franchise" | "bulk_order" | "wholesale" | "feedback";
  message: string;
}

export interface EnquirySubmissionResult {
  success: boolean;
  message: string;
  enquiryId?: string;
  error?: string;
}

/**
 * Server action to submit a customer or franchise enquiry.
 * Persists the enquiry to the public.enquiries table in Supabase.
 */
/**
 * ARCHITECTURAL AUDIT & RUNTIME NOTICE:
 * Runtime: Next.js 15 Server Actions run on serverless functions (e.g. Vercel, AWS Lambda)
 * or isolated Node.js container replicas.
 * State Sharing: In-memory state (enquiryRateLimitMap) is LOCAL to the individual Node.js
 * process / warm lambda container. It does NOT share state across concurrent serverless instances,
 * edge nodes, or multi-replica Kubernetes pods.
 *
 * Distributed Protection Roadmap:
 * To achieve distributed rate limiting across all serverless replicas without exposing
 * customer enquiry PII to unauthenticated clients:
 * 1. Recommended: Integrate an external distributed key-value store (e.g., Upstash Redis with
 *    @upstash/ratelimit) configured via environment variables UPSTASH_REDIS_REST_URL and
 *    UPSTASH_REDIS_REST_TOKEN.
 * 2. Database Alternative: Implement a dedicated PostgreSQL rate_limits table with a SECURITY DEFINER
 *    RPC `public.rpc_check_enquiry_rate_limit(p_phone text, p_limit int, p_window_seconds int)`
 *    that allows anon callers to increment atomic counters without granting SELECT access to enquiries.
 *
 * Current In-Memory Guard:
 * Max 5 submissions per 60 seconds per normalized phone number within the warm instance.
 * Includes periodic pruning to prevent heap leaks in long-running container environments.
 */
const enquiryRateLimitMap = new Map<string, { count: number; expiresAt: number }>();
let lastPruneTime = Date.now();

function pruneExpiredRateLimits(now: number) {
  if (now - lastPruneTime < 60_000 && enquiryRateLimitMap.size < 500) return;
  lastPruneTime = now;
  for (const [key, value] of enquiryRateLimitMap.entries()) {
    if (value.expiresAt <= now) {
      enquiryRateLimitMap.delete(key);
    }
  }
}

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  pruneExpiredRateLimits(now);

  const entry = enquiryRateLimitMap.get(identifier);
  if (!entry || entry.expiresAt < now) {
    enquiryRateLimitMap.set(identifier, { count: 1, expiresAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 5) {
    return true;
  }
  entry.count += 1;
  return false;
}

export async function submitEnquiryAction(
  data: EnquirySubmissionInput & { honeypot?: string }
): Promise<EnquirySubmissionResult> {
  try {
    // 1. Bot Honeypot Guard: If honeypot field is filled, silently discard spam
    if (data.honeypot && data.honeypot.trim()) {
      return { success: false, message: "Spam submission detected.", error: "BOT_DETECTED" };
    }

    // 2. Validate required fields & length limits
    const trimmedName = data.name?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return { success: false, message: "Please provide your full name (at least 2 characters).", error: "INVALID_NAME" };
    }
    if (trimmedName.length > 100) {
      return { success: false, message: "Name cannot exceed 100 characters.", error: "INVALID_NAME_LENGTH" };
    }

    const trimmedPhone = data.phone?.trim();
    if (!trimmedPhone) {
      return { success: false, message: "Please provide a valid phone number.", error: "MISSING_PHONE" };
    }
    // Phone must contain at least 7 digits and not exceed 25 characters
    const digitsOnly = trimmedPhone.replace(/\D/g, "");
    if (digitsOnly.length < 7 || trimmedPhone.length > 25) {
      return { success: false, message: "Please enter a valid phone number with country/area code.", error: "INVALID_PHONE" };
    }

    if (data.email) {
      const trimmedEmail = data.email.trim();
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (trimmedEmail.length > 120 || !EMAIL_REGEX.test(trimmedEmail)) {
        return { success: false, message: "Please provide a valid email address.", error: "INVALID_EMAIL" };
      }
    }

    const trimmedMessage = data.message?.trim();
    if (!trimmedMessage) {
      return { success: false, message: "Please enter your message.", error: "MISSING_MESSAGE" };
    }
    if (trimmedMessage.length > 2000) {
      return { success: false, message: "Message cannot exceed 2000 characters.", error: "MESSAGE_TOO_LONG" };
    }

    // 3. Abuse Control / Rate Limiting
    if (isRateLimited(digitsOnly)) {
      return {
        success: false,
        message: "Too many submissions from this contact number. Please wait a minute before submitting again.",
        error: "RATE_LIMITED",
      };
    }

    // 4. Initialize Supabase server client
    const supabase = await createServerSupabaseClient();

    // 5. Insert record into public.enquiries (pure INSERT; does not require SELECT/RETURNING privileges for anon)
    const { error } = await supabase
      .from("enquiries")
      .insert({
        name: trimmedName,
        phone: trimmedPhone,
        email: data.email?.trim() || null,
        flavour_interest: data.flavourInterest?.trim() || null,
        enquiry_type: data.enquiryType,
        message: trimmedMessage,
        status: "new",
      });

    if (error) {
      console.error("[EnquiryAction] Database insertion error:", error.message);
      return {
        success: false,
        message: "Failed to persist enquiry to database. Please connect via direct WhatsApp chat.",
        error: error.code || "DB_ERROR",
      };
    }

    return {
      success: true,
      message: "Enquiry submitted successfully.",
    };
  } catch (err: any) {
    console.error("[EnquiryAction] Error submitting enquiry:", err.message);
    return {
      success: false,
      message: "Unable to process enquiry at this time. Please connect via direct WhatsApp chat.",
      error: "SERVER_ERROR",
    };
  }
}
