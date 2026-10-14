# Leader permission rework — phase roadmap

Spec: `docs/superpowers/specs/2026-10-13-leader-open-customers-team-slots-design.md`

Each phase ships and works on its own. Phases 1, 2 and 3a have detailed task plans (1 and 2 are done and deployed). The rest each get their own detailed plan, written right before that phase starts, because their exact code depends on what the previous phase leaves behind (and on the live DB state the user confirms). Each phase that touches the DB ends with "user runs SQL" — do not move on until confirmed. Phase 3 is split (3a–3d) because switching 17 files and the RLS in one deploy is too risky; 3a and 3b change nothing visible, 3c is the real cutover.

| Phase | Ships | Needs user SQL |
|---|---|---|
| **1** `2026-10-13-phase1-blast-salesperson-access.md` | Blast-list salespeople can read/update their blast customers (no log/tasks) | yes (RLS block) |
| **2** `2026-10-13-phase2-created-by-team.md` Created-by-team | `customers.created_by_team_id` (all existing = SK Team) written on create; managers can read `teams`; Created-by column + filter in the customer list; dashboard New-leads counted by creating team with an Area column; all areas in dashboard area filters. Old slot columns untouched. | yes |
| **3a** `2026-10-14-phase3a-assignments-mirror.md` | `customer_assignments` table (customer, team, seat 1-3, user, pool, stage) kept in sync with the old slot columns by DB triggers (also follows a user who changes team); app loads it read-only. **No behavior change.** | yes |
| **3b** `2026-10-14-phase3b-readers.md` | `Customer.assignments` (list of seats), derived on the client from the old flat fields so it can never lag; every *reader* of `assignedToUserId*/pool*/stage*` moves onto it: customer list, detail page, dashboard metrics, nav badges, agent log, inactive listings, auto-assign eligibility (+ Netlify sweep). The unused 3a client read of `customer_assignments` is removed (3c re-adds it as the real source). No behavior change; writers and RLS untouched. | no |
| **3c** `2026-10-14-phase3c-cutover.md` | Read path loads `customer_assignments`; writers move to it (create, reassign/clear, pool toggle, stage log, removal approve, auto second-assign sweep incl. the Netlify function, blast claim → team's first empty seat); detail page reassign rows per team (admin picks the team); events matched by user not slot number (the event-table `team_id` columns were dropped from scope — `user_id` already identifies the seat). One SQL cutover block: mirror removed, seat guard + policies, leaders see all customers, only own team's seats and own team members' logs, change log shared across leaders, ADMIN unscoped, seats follow a user who changes team. App and SQL go live together (runbook in the plan). | yes (big) |
| **3d** `2026-10-15-phase3d-leader-features.md` | Duplicate phone → open / assign to my team's member / create anyway (leader: own team; admin: anyone); admin new-customer assignee options no longer by area; auto second-assign draws from the CREATING team with a per-team rotation pointer (`teams.last_auto_assigned_user_id`); `Area.teamIds` and the area↔team UI removed. (Leader assignee options by own team and the seat-follows-user trigger already shipped in 3c.) | tiny (one `alter table`) |
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
