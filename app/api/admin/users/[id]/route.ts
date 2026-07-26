import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function genTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const tempPassword = genTempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: tempPassword });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tempPassword });
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
