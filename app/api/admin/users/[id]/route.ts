import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function genTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { password } = await request.json().catch(() => ({ password: undefined }));
  if (password && password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
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

  const finalPassword = password || genTempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: finalPassword });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tempPassword: password ? undefined : finalPassword });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, email, phone, ic, role, teamId, activePoolLimit, inactivePoolLimit, active } = await request.json();
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !role) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
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
  const { data: existing } = await admin.from("profiles").select("email").eq("id", id).single();
  if (existing && existing.email !== email.trim()) {
    const { error: emailError } = await admin.auth.admin.updateUserById(id, { email: email.trim() });
    if (emailError) {
      return NextResponse.json({ error: emailError.message }, { status: 400 });
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      ic: (ic || "").trim() || null,
      role,
      team_id: teamId || null,
      active_pool_limit: activePoolLimit ?? null,
      inactive_pool_limit: inactivePoolLimit ?? null,
      status: active ? "ACTIVE" : "INACTIVE",
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  if (id === auth.user.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
