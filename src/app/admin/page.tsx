"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  RotateCcw,
  AlertCircle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type UserProfile, getDashboardPathForRole } from "@/lib/supabase/auth-utils";
import { useAdmin } from "@/context/AdminContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resetDemoData } = useAdmin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Surface any redirect error codes safely
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "profile_inactive") {
      setErrorMessage("Your administrative profile has been deactivated. Please contact an administrator.");
    } else if (errorParam === "profile_missing") {
      setErrorMessage("No administrative profile was found for this user. Access denied.");
    } else if (errorParam === "forbidden") {
      setErrorMessage("You do not have permission to view that section.");
    }
  }, [searchParams]);

  // Check if session is already active and redirect to appropriate dashboard
  useEffect(() => {
    let isMounted = true;
    async function checkSession() {
      try {
        const supabase = createClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (session?.user && isMounted) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

          const profile = profileData as UserProfile | null;

          if (profile && profile.is_active) {
            const target = getDashboardPathForRole(profile.role);
            if (target) {
              router.push(target);
            }
          }
        }
      } catch {
        // Ignore initialization errors on mount
      }
    }

    checkSession();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail) {
      setErrorMessage("Please enter your administrator email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // Real Supabase Auth sign-in
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (authError || !authData.user) {
        setErrorMessage(
          authError?.message === "Invalid login credentials"
            ? "Invalid email or password. Please verify your credentials."
            : authError?.message || "Authentication failed. Please try again."
        );
        setIsLoading(false);
        return;
      }

      // Validate administrative profile from public.profiles
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authData.user.id)
        .single();

      const profile = profileData as UserProfile | null;

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setErrorMessage("No authorized profile found for this account. Access denied.");
        setIsLoading(false);
        return;
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        setErrorMessage("Your administrative account is deactivated. Please contact the factory administrator.");
        setIsLoading(false);
        return;
      }

      // Store verified display email
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("icespot_auth_email", authData.user.email || normalizedEmail);
        } catch {
          // ignore
        }
      }

      // Resolve destination strictly from the database profile role
      const targetDashboard = getDashboardPathForRole(profile.role);

      if (!targetDashboard) {
        await supabase.auth.signOut();
        setErrorMessage("Your profile does not have an assigned admin dashboard role.");
        setIsLoading(false);
        return;
      }

      router.push(targetDashboard);
      router.refresh();
    } catch {
      setErrorMessage("Unable to connect to authentication server. Please check your connection.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF5F7] via-[#FDF0F3] to-[#FCE8ED] flex flex-col justify-between text-slate-800 antialiased selection:bg-rose-100 selection:text-[#BD1F49]">
      {/* Top Header Bar */}
      <header className="w-full px-6 py-4 sm:px-10 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#BD1F49] uppercase tracking-wider transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>BACK TO PUBLIC WEBSITE</span>
        </Link>

        {/* Prototype Reset Tool */}
        <button
          onClick={resetDemoData}
          type="button"
          title="Reset demo orders, dispatches, and inventory"
          className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 bg-white/70 hover:bg-white rounded-full border border-rose-100 shadow-sm transition-all cursor-pointer"
        >
          <RotateCcw className="w-3 h-3 text-[#E22F62]" />
          <span>Reset Demo</span>
        </button>
      </header>

      {/* Center Login Card Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-4 sm:py-6">
        <div className="w-full max-w-[440px] bg-white rounded-[26px] shadow-[0_20px_50px_rgba(216,49,98,0.08)] border border-rose-100/80 overflow-hidden transition-all duration-300">
          {/* Top Rose Accent Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#FF5E89] via-[#E22F62] to-[#BD1F49]" />

          <div className="px-6 py-7 sm:px-8 sm:py-8">
            {/* Icespot Logo Emblem */}
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-2xl bg-white shadow-md shadow-rose-900/5 border border-rose-100/80 flex items-center justify-center p-2.5">
                <Image
                  src="/assets/icespot-logo-new.png"
                  alt="Icespot Logo"
                  width={68}
                  height={34}
                  priority
                  className="w-full h-auto object-contain"
                />
              </div>
            </div>

            {/* Portal Headline */}
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 text-center tracking-tight">
              Youback Icespot Factory
            </h1>
            <p className="text-[11px] font-extrabold text-[#E22F62] text-center tracking-[0.18em] uppercase mt-1 mb-6">
              STAFF &amp; ADMIN PORTAL
            </p>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-[#BD1F49] text-xs font-medium flex items-center gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#E22F62]" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Sign In Form */}
            <form onSubmit={handleSignIn} className="space-y-4">
              {/* Administrator Email */}
              <div>
                <label
                  htmlFor="adminEmail"
                  className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                >
                  ADMINISTRATOR EMAIL
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="adminEmail"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@icespot.com"
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-[#E22F62] focus:ring-4 focus:ring-[#E22F62]/10 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="adminPassword"
                  className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
                >
                  PASSWORD
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="adminPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-11 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-[#E22F62] focus:ring-4 focus:ring-[#E22F62]/10 transition-all shadow-sm tracking-normal"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full !mt-5 py-3 px-4 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-bold rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-75"
              >
                <span>{isLoading ? "Verifying Credentials..." : "Sign In to Admin Portal"}</span>
              </button>
            </form>

            {/* Disclaimer Security Text */}
            <p className="text-[11px] text-slate-400 text-center leading-relaxed mt-5 pt-4 border-t border-slate-100">
              Authorized factory &amp; branch personnel only. All access attempts and
              administrative modifications are logged securely.
            </p>
          </div>
        </div>
      </main>

      {/* Down End Footer */}
      <footer className="py-4 px-4 text-center text-xs text-slate-400 font-medium">
        &copy; 2026 Youback Icespot Factory &bull; Varavoor, Thrissur, Kerala
      </footer>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FFF5F7]" />}>
      <LoginForm />
    </Suspense>
  );
}
