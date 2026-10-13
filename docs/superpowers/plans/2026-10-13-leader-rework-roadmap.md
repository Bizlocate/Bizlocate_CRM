# Leader permission rework — phase roadmap

Spec: `docs/superpowers/specs/2026-10-13-leader-open-customers-team-slots-design.md`

Each phase ships and works on its own. **Only Phase 1 has a detailed task plan today.** Phases 2–4 each get their own detailed plan, written right before that phase starts, because their exact code depends on what the previous phase leaves behind (and on the live DB state the user confirms). Each phase that touches the DB ends with "user runs SQL" — do not move on until confirmed.

| Phase | Ships | Needs user SQL |
|---|---|---|
| **1** `2026-10-13-phase1-blast-salesperson-access.md` | Blast-list salespeople can read/update their blast customers (no log/tasks) | yes (RLS block) |
| **2** `2026-10-13-phase2-created-by-team.md` Created-by-team | `customers.created_by_team_id` (all existing = SK Team) written on create; managers can read `teams`; Created-by column + filter in the customer list; dashboard New-leads counted by creating team with an Area column; all areas in dashboard area filters. Old slot columns untouched. | yes |
| **3** (plan TBD) Cutover | `customer_assignments` table + backfill from current slots (team = user's current team) run right before the cutover deploy; `team_id` on `assignment_events`/`stage_events`/`removal_requests`; app reads/writes `customer_assignments` only; per-team 3 seats; leader sees all customers (RLS), only own team's seats/activity logs; change log shared across leaders; ADMIN unscoped everywhere; duplicate-phone → assign flow; auto second-assign by creating team; area↔team removed from candidate scoping; blast claim approval uses the team's first empty seat; moving a user to another team moves their seats; all dashboard/agent-log/removal/inactive/blast scoping updated | yes (new RLS + triggers) |
| **4** (plan TBD) Cleanup | Drop old slot/pool/stage columns on `customers`, drop `area_teams` + admin/area team UI, remove dead code and fixtures | yes |

## Decisions already made (from the design conversation)

- Each team has its own 3 seats per customer; stage/pool follow each assignee.
- All existing customers → SK Team as creating team; existing assignments → the assignee's current team.
- Leaders: all customers visible; own-team assignees/logs only; shared change log (names only, `profiles` RLS unchanged); can edit any customer; approvals only for own team's seats.
- SALESPERSON: unchanged (own assigned customers; no change-log access) plus Phase 1 blast access.
- ADMIN sees and does everything, unscoped; assigns on behalf of a team by picking the team.
- Dashboard: New leads = customers created by my team, with an Area column (source × area); area filter lists all areas; other sections scoped to own-team assignees.
- Duplicate phone → "open existing / assign to my team / create anyway".
- Blast "Done" only via the remark on the blasting list.
