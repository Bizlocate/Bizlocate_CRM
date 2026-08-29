# Customer Business Profile — Design

Date: 2026-08-30

## Purpose

Customers currently carry only name, email, phone, stage, and assigned salesperson. This adds a "Business Profile" of 13 additional fields to each customer, most of them dropdowns sourced from admin-managed lookup lists (following the existing Area/Sub-Area and Business Tag admin patterns), so that lead-qualification data can be captured consistently and salespeople can see context (including a leader/admin-authored remark) when working a lead.

## Fields

| # | Field | Type | Source |
|---|-------|------|--------|
| 1 | Source | dropdown | new admin list `lead_sources` |
| 2 | Area | dropdown | existing `areas` (admin-managed) |
| 3 | Subarea | dropdown, filtered by Area | existing `sub_areas` (admin-managed) |
| 4 | Property Type | dropdown | new admin list `property_types` |
| 5 | Purpose | dropdown | new admin list `purposes` (seeded: Rent, Buy, Buy/Rent) |
| 6 | Business Industry / Category / Type | 3 cascading dropdowns | existing `business_tag_industries/categories/types` (admin-managed) |
| 7 | Race | dropdown | new admin list `races` |
| 8 | Language | dropdown | new admin list `languages` |
| 9 | Business Name | text input | — |
| 10 | Firsttime / Branch | dropdown | new admin list `firsttime_branch_types` (seeded: First Time, Branch) |
| 11 | Target Race | dropdown | new admin list `target_races` (independent list from Race — different meaning: customer's own race vs. the race of the customer's target clientele) |
| 12 | Target Type | dropdown | new admin list `target_types` (standalone, not shared with Property Type or Business Type) |
| 13 | Remark | text input | — leader/admin note for the assigned salesperson |

All 13 fields are optional (nullable) — they can be filled in gradually and don't block customer creation.

## Data Model

New flat lookup tables, each `(id uuid pk, name text not null unique)`, following the shape of `areas`:

- `lead_sources`
- `property_types`
- `purposes`
- `languages`
- `firsttime_branch_types`
- `races`
- `target_races`
- `target_types`

`customers` table gains 15 nullable columns:

```
source_id              uuid references lead_sources (id) on delete set null
area_id                uuid references areas (id) on delete set null
sub_area_id            uuid references sub_areas (id) on delete set null
property_type_id       uuid references property_types (id) on delete set null
purpose_id             uuid references purposes (id) on delete set null
business_industry_id   uuid references business_tag_industries (id) on delete set null
business_category_id   uuid references business_tag_categories (id) on delete set null
business_type_id       uuid references business_tag_types (id) on delete set null
race_id                uuid references races (id) on delete set null
language_id            uuid references languages (id) on delete set null
business_name          text
firsttime_branch_id    uuid references firsttime_branch_types (id) on delete set null
target_race_id         uuid references target_races (id) on delete set null
target_type_id         uuid references target_types (id) on delete set null
remark                 text
```

`on delete set null` so deleting a lookup value from admin never breaks an existing customer row.

Note on Business Industry/Category/Type: all three levels are stored as separate columns (not just the deepest selected id) because a user may know only the industry or only the industry+category without a specific type yet — storing all three levels keeps partial selections representable, matching how `sub_area_id` is stored alongside `area_id` rather than area being derived by joining through sub-area.

## Admin UI

One new tab in `AdminTabs`: **Profile Lists**, page `app/(dashboard)/admin/profile-lists/page.tsx`.

- Left-side picker with 8 entries: Source, Property Type, Purpose, Language, Firsttime/Branch, Race, Target Race, Target Type.
- Right side renders a new generic `LookupListEditor` component (add / inline rename / delete-with-confirm) reused for all 8 lists — same interaction pattern as the flat "Type" level in the existing Business Tag admin page, but as its own standalone component so it isn't duplicated 8 times.
- Existing Area/Sub-Area and Business Tag admin pages are unchanged.

Store (`lib/store.tsx`) gains 8 new state arrays and `add/update/delete` functions per list (24 functions total), each following the exact shape of `addArea`/`updateArea`/`deleteArea`.

## Customer Form & Detail Page

**New Customer form** (`app/(dashboard)/customers/page.tsx`, `NewCustomerForm`): a new "Business Profile" fieldset below the existing Name/Email/Phone/Assigned To fields, containing all 13 new fields. Cascading behavior:

- Area → Subarea: choosing an Area filters the Subarea options; changing Area clears the selected Subarea.
- Business Industry → Category → Type: same cascade, three levels; changing a higher level clears the lower selections.
- All other fields are independent flat selects.

**Customer detail page** (`[id]/page.tsx`): a new "Business Profile" card showing all 13 fields. Each field is click-to-edit inline (same interaction already used for the Stage select), saving on change/blur.

## Permissions

- The 12 non-Remark profile fields: editable by ADMIN, MANAGER, and the SALESPERSON the customer is assigned to (they're the one gathering this information in the field). Enforced client-side (hide edit controls for other roles) and does not need a new RLS restriction since the existing `customers_update` policy already allows the assignee to update their own row.
- Remark: editable by ADMIN and MANAGER only. SALESPERSON sees it as read-only text, no input control rendered. Enforced both client-side (no input for SALESPERSON) and server-side, because the existing `customers_update` RLS policy would otherwise let the assignee write to any column including `remark`.
- `canCreate` (ADMIN/MANAGER) continues to gate the whole New Customer form, unchanged from today.

## Store Changes

- `addCustomer` input type extends to accept all 13 optional profile fields.
- `updateCustomerProfile(customerId, patch)`: single function for detail-page edits of the 12 non-Remark fields.
- `updateCustomerRemark(customerId, remark)`: separate function, calling code only exposed to ADMIN/MANAGER in the UI.

## Migration (`supabase/schema.sql`)

Appended as a new migration block, following the existing style of the Area/Sub-Area and Business Tag migration comments already in the file:

1. `create table` for the 8 new lookup tables + RLS (`select` open to any authenticated user; `insert/update/delete` admin-only) — identical policy shape to `areas`/`business_tag_industries`.
2. `alter table customers add column` for the 15 new columns.
3. Seed rows: `purposes` (Rent, Buy, Buy/Rent), `firsttime_branch_types` (First Time, Branch). The other 6 new lists start empty — admin populates via the Profile Lists page.
4. New trigger function `protect_customer_remark_column`, mirroring `protect_customer_assignment`: raises an exception if a non-admin/non-manager changes `remark` on update. Attached as `before update on customers`.

## Testing

No automated test suite exists in this repo for UI flows; verification is manual via the `run` skill after implementation:

1. Create a customer with the full Business Profile filled in (as ADMIN/MANAGER); confirm all fields save and display correctly on the detail page.
2. As the assigned SALESPERSON, edit a non-Remark field on the detail page; confirm it saves.
3. As the assigned SALESPERSON, confirm Remark renders as read-only text (no input, no save control).
4. As ADMIN, edit Remark; confirm it saves.
5. Change Area on the create form; confirm Subarea options update and previous Subarea selection clears. Same for Business Industry → Category → Type.
6. In Admin → Profile Lists, add/rename/delete an item from each of the 8 lists; confirm it reflects in the customer form dropdowns.
7. Delete a lookup value that's in use by an existing customer; confirm the customer's field goes to unset rather than erroring (`on delete set null`).
