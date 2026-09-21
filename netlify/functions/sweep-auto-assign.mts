import { createAdminClient } from "../../lib/supabase/admin.ts";
import { mapActivity, mapArea, mapCustomer, mapProfile, mapStage } from "../../lib/mappers.ts";
import { computeAutoSecondAssignPlan } from "../../lib/autoSecondAssign.ts";

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

  const users = (profileRows ?? []).map(mapProfile);

  const teamIdsByArea = new Map<string, string[]>();
  for (const link of (areaTeamRows ?? []) as { area_id: string; team_id: string }[]) {
    const list = teamIdsByArea.get(link.area_id) ?? [];
    list.push(link.team_id);
    teamIdsByArea.set(link.area_id, list);
  }
  const areas = (areaRows ?? []).map((row) => mapArea(row, teamIdsByArea.get(row.id) ?? []));

  const stages = (stageRows ?? []).map(mapStage);
  const customers = (customerRows ?? []).map(mapCustomer);

  const usersById = new Map(users.map((u) => [u.id, u]));
  const activities = (activityRows ?? []).map((row) => mapActivity(row, usersById));

  const actions = computeAutoSecondAssignPlan(customers, areas, users, stages, activities, Date.now());

  for (const action of actions) {
    const { error: customerUpdateError } = await supabase
      .from("customers")
      .update({ assigned_to_2: action.winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: action.stageId })
      .eq("id", action.customerId);
    if (customerUpdateError) {
      console.error(`sweep-auto-assign: failed to update customer ${action.customerId}:`, customerUpdateError);
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
