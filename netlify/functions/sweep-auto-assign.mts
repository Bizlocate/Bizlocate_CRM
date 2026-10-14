import { createAdminClient } from "../../lib/supabase/admin.ts";
import { mapActivity, mapArea, mapCustomer, mapCustomerAssignment, mapProfile, mapStage } from "../../lib/mappers.ts";
import { computeAutoSecondAssignPlan } from "../../lib/autoSecondAssign.ts";
import { attachSeats, fetchAllSeatRows } from "../../lib/assignments.ts";

export const config = { schedule: "@daily" };

export default async () => {
  const supabase = createAdminClient();

  const [
    { data: profileRows, error: profileError },
    { data: areaRows, error: areaError },
    { data: areaTeamRows, error: areaTeamError },
    { data: stageRows, error: stageError },
    { data: customerRows, error: customerError },
    { data: activityRows, error: activityError },
  ] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("areas").select("*"),
    supabase.from("area_teams").select("*"),
    supabase.from("pipeline_stages").select("*"),
    supabase.from("customers").select("*").order("name"),
    supabase.from("activities").select("*").order("created_at", { ascending: false }),
  ]);

  if (profileError) throw profileError;
  if (areaError) throw areaError;
  if (areaTeamError) throw areaTeamError;
  if (stageError) throw stageError;
  if (customerError) throw customerError;
  if (activityError) throw activityError;
  const { rows: seatRows, error: seatError } = await fetchAllSeatRows(supabase);
  if (seatError) throw seatError;

  const users = (profileRows ?? []).map(mapProfile);

  const teamIdsByArea = new Map<string, string[]>();
  for (const link of (areaTeamRows ?? []) as { area_id: string; team_id: string }[]) {
    const list = teamIdsByArea.get(link.area_id) ?? [];
    list.push(link.team_id);
    teamIdsByArea.set(link.area_id, list);
  }
  const areas = (areaRows ?? []).map((row) => mapArea(row, teamIdsByArea.get(row.id) ?? []));

  const stages = (stageRows ?? []).map(mapStage);
  const customers = attachSeats((customerRows ?? []).map(mapCustomer), seatRows.map((r) => mapCustomerAssignment(r as Parameters<typeof mapCustomerAssignment>[0])));

  const usersById = new Map(users.map((u) => [u.id, u]));
  const activities = (activityRows ?? []).map((row) => mapActivity(row, usersById));

  const actions = computeAutoSecondAssignPlan(customers, areas, users, stages, activities, Date.now());

  for (const action of actions) {
    const winnerTeamId = users.find((u) => u.id === action.winnerId)?.teamId;
    if (!winnerTeamId) {
      console.error(`sweep-auto-assign: winner ${action.winnerId} has no team, skipping customer ${action.customerId}`);
      continue;
    }
    const { error: seatInsertError } = await supabase.from("customer_assignments").insert({
      customer_id: action.customerId,
      team_id: winnerTeamId,
      slot: 2,
      user_id: action.winnerId,
      pool: "ACTIVE",
      stage_id: action.stageId,
    });
    if (seatInsertError) {
      console.error(`sweep-auto-assign: failed to assign customer ${action.customerId}:`, seatInsertError);
      continue;
    }

    const { error: areaUpdateError } = await supabase
      .from("areas")
      .update({ last_auto_assigned_user_id: action.winnerId })
      .eq("id", action.areaId);
    if (areaUpdateError) {
      console.error(`sweep-auto-assign: failed to update area ${action.areaId}:`, areaUpdateError);
    }

    const { error: eventInsertError } = await supabase
      .from("assignment_events")
      .insert({ customer_id: action.customerId, user_id: action.winnerId, slot: 2 });
    if (eventInsertError) {
      console.error(`sweep-auto-assign: failed to insert assignment_events for customer ${action.customerId}:`, eventInsertError);
    }
  }

  console.log(`sweep-auto-assign: ${actions.length} customer(s) assigned`);
};
