import { createAdminClient } from "../../lib/supabase/admin.ts";
import { mapActivity, mapArea, mapCustomer, mapProfile, mapStage } from "../../lib/mappers.ts";
import { computeAutoSecondAssignPlan } from "../../lib/autoSecondAssign.ts";

export const config = { schedule: "@daily" };

export default async () => {
  const supabase = createAdminClient();

  const [
    { data: profileRows },
    { data: areaRows },
    { data: areaTeamRows },
    { data: stageRows },
    { data: customerRows },
    { data: activityRows },
  ] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("areas").select("*"),
    supabase.from("area_teams").select("*"),
    supabase.from("pipeline_stages").select("*"),
    supabase.from("customers").select("*"),
    supabase.from("activities").select("*"),
  ]);

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
    try {
      await supabase
        .from("customers")
        .update({ assigned_to_2: action.winnerId, pool_2: "ACTIVE", pool_2_since: null, stage_2: action.stageId })
        .eq("id", action.customerId);
      await supabase.from("areas").update({ last_auto_assigned_user_id: action.winnerId }).eq("id", action.areaId);
      await supabase.from("assignment_events").insert({ customer_id: action.customerId, user_id: action.winnerId, slot: 2 });
    } catch (err) {
      console.error(`sweep-auto-assign: failed to apply action for customer ${action.customerId}:`, err);
    }
  }

  console.log(`sweep-auto-assign: ${actions.length} customer(s) assigned`);
};
