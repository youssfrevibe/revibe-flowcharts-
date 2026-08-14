"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let _client: SupabaseClient | null = null;

/** Lazily-created browser client used only for Realtime (broadcast + presence). */
export function getBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return _client;
}

export const realtimeAvailable = !!(supabaseUrl && supabaseAnonKey);
