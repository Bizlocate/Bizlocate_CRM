import { createClient } from "@supabase/supabase-js";

// Server-only: uses the service_role key, which bypasses RLS entirely.
// Never import this file from a client component.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
