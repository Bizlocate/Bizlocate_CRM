import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function genTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

export async function POST(request: Request) {
  const { name, email, phone, ic, role, teamId, activePoolLimit, inactivePoolLimit, password } = await request.json();
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !role) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  for (const limit of [activePoolLimit, inactivePoolLimit]) {
    if (limit !== null && limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      return NextResponse.json({ error: "Pool limits must be non-negative whole numbers." }, { status: 400 });
    }
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", auth.user.id)
    .single();
  if (!caller || caller.role !== "ADMIN" || caller.status !== "ACTIVE") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const admin = createAdminClient();
  const finalPassword = password || genTempPassword();
  const { error: createError } = await admin.auth.admin.createUser({
    email: email.trim(),
    password: finalPassword,
    email_confirm: true,
    user_metadata: {
      name: name.trim(),
      phone: phone.trim(),
      ic: (ic || "").trim(),
      role,
      team_id: teamId || "",
      active_pool_limit: activePoolLimit ?? "",
      inactive_pool_limit: inactivePoolLimit ?? "",
    },
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  return NextResponse.json({ tempPassword: password ? undefined : finalPassword });
}
