# Customer Profile Edit Confirmation (Update/Cancel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the customer detail page's Business Profile fields, Remark, and header Name/Phone from immediate-commit-on-change to a staged draft with one shared Update/Cancel button pair. Move the Change History card to the bottom of the page.

**Architecture:** UI-only change, one file (`app/(dashboard)/customers/[id]/page.tsx`). No store or schema changes — the existing `updateCustomerProfile`/`updateCustomerRemark`/`updateCustomerIdentity` functions are called exactly as before, just once on Update instead of once per field-change. The 14 dropdown fields + Business Name collapse into one draft object (`profileDraft`) instead of 14 separate `useState` calls; Remark/Name/Phone keep their existing individual drafts (`remarkDraft`/`nameDraft`/`phoneDraft`), just drop their `onBlur`-commits.

**Tech Stack:** Next.js App Router, React client component, TypeScript, existing `useStore()` context. No test framework in this repo — verify via `npm run build` (type-check) plus manual click-through in the browser preview.

## Global Constraints

- **In scope:** Business Profile card's 14 dropdown fields + Business Name + Remark, and header Name/Phone — all share ONE Update/Cancel button pair.
- **Out of scope, must not change:** Pipeline Stage dropdown (still commits immediately — being redesigned separately later), Pool Active/Potential toggle (still commits immediately), Admin's Assigned 1/2/3 reassignment (already its own select-then-Confirm flow), Change History's visibility rule (`canEditIdentity` = ADMIN/MANAGER only — unchanged, only its position on the page moves).
- Passing the whole `profileDraft` object to `updateCustomerProfile` on Update — even fields that didn't change — is safe and intentional: that function's internal diff-and-log logic already skips any field whose resolved display value didn't change (`oldDisplay === newDisplay → continue`), so no spurious Change History rows are produced. Do not hand-write a "compute only the changed subset" helper — it would duplicate logic that already exists in the store.
- Match existing code style exactly: inline `style={{...}}` objects, `.field-input`/`.btn`/`.card` classes, no new dependencies.

---

### Task 1: Draft-state Update/Cancel + move Change History to the bottom

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: existing `useStore()` fields/functions already destructured in this file (`updateCustomerProfile`, `updateCustomerRemark`, `updateCustomerIdentity`, `changeLog`, all the lookup arrays) — no new store exports needed.
- Produces: nothing consumed elsewhere — this task is self-contained to this one file.

- [ ] **Step 1: Add the `ProfileDraft` type and `draftFromCustomer` helper**

At the top of the file, right after the imports, add:

```tsx
interface ProfileDraft {
  sourceId: string | null;
  areaId: string | null;
  subAreaId: string | null;
  propertyTypeId: string | null;
  purposeId: string | null;
  businessIndustryId: string | null;
  businessCategoryId: string | null;
  businessTypeId: string | null;
  raceId: string | null;
  languageId: string | null;
  businessName: string;
  firsttimeBranchId: string | null;
  targetRaceId: string | null;
  targetTypeId: string | null;
  budgetId: string | null;
}

function draftFromCustomer(c: { sourceId: string | null; areaId: string | null; subAreaId: string | null; propertyTypeId: string | null; purposeId: string | null; businessIndustryId: string | null; businessCategoryId: string | null; businessTypeId: string | null; raceId: string | null; languageId: string | null; businessName: string; firsttimeBranchId: string | null; targetRaceId: string | null; targetTypeId: string | null; budgetId: string | null } | undefined): ProfileDraft {
  return {
    sourceId: c?.sourceId ?? null,
    areaId: c?.areaId ?? null,
    subAreaId: c?.subAreaId ?? null,
    propertyTypeId: c?.propertyTypeId ?? null,
    purposeId: c?.purposeId ?? null,
    businessIndustryId: c?.businessIndustryId ?? null,
    businessCategoryId: c?.businessCategoryId ?? null,
    businessTypeId: c?.businessTypeId ?? null,
    raceId: c?.raceId ?? null,
    languageId: c?.languageId ?? null,
    businessName: c?.businessName ?? "",
    firsttimeBranchId: c?.firsttimeBranchId ?? null,
    targetRaceId: c?.targetRaceId ?? null,
    targetTypeId: c?.targetTypeId ?? null,
    budgetId: c?.budgetId ?? null,
  };
}
```

(The inline parameter type mirrors the relevant subset of `Customer` from `@/lib/types` structurally — no import needed since TypeScript structural typing accepts a `Customer` value here directly.)

- [ ] **Step 2: Replace `businessNameDraft` with `profileDraft`**

Replace this line (currently `app/(dashboard)/customers/[id]/page.tsx:61`):

```tsx
  const [businessNameDraft, setBusinessNameDraft] = useState(customer?.businessName ?? "");
```

with:

```tsx
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(draftFromCustomer(customer));
```

- [ ] **Step 3: Update the reset `useEffect`**

Replace (currently lines 66-71):

```tsx
  useEffect(() => {
    setBusinessNameDraft(customer?.businessName ?? "");
    setRemarkDraft(customer?.remark ?? "");
    setNameDraft(customer?.name ?? "");
    setPhoneDraft(customer?.phone ?? "");
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

with:

```tsx
  useEffect(() => {
    setProfileDraft(draftFromCustomer(customer));
    setRemarkDraft(customer?.remark ?? "");
    setNameDraft(customer?.name ?? "");
    setPhoneDraft(customer?.phone ?? "");
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Recompute cascading options from `profileDraft`, add dirty checks and handlers**

Replace (currently lines 114-116):

```tsx
  const filteredSubAreas = subAreas.filter((s) => s.areaId === customer.areaId);
  const filteredCategories = businessTagCategories.filter((c) => c.industryId === customer.businessIndustryId);
  const filteredTypes = businessTagTypes.filter((t) => t.categoryId === customer.businessCategoryId);
```

with:

```tsx
  const filteredSubAreas = subAreas.filter((s) => s.areaId === profileDraft.areaId);
  const filteredCategories = businessTagCategories.filter((c) => c.industryId === profileDraft.businessIndustryId);
  const filteredTypes = businessTagTypes.filter((t) => t.categoryId === profileDraft.businessCategoryId);
  const savedProfileDraft = draftFromCustomer(customer);
  const profileDirty = (Object.keys(profileDraft) as (keyof ProfileDraft)[]).some((k) => profileDraft[k] !== savedProfileDraft[k]);
  const remarkDirty = remarkDraft !== (customer.remark ?? "");
  const nameDirty = nameDraft.trim() !== customer.name;
  const phoneDirty = phoneDraft.trim() !== customer.phone;
  const isDirty = profileDirty || remarkDirty || nameDirty || phoneDirty;

  function handleUpdate() {
    if (profileDirty) updateCustomerProfile(customer.id, profileDraft);
    if (remarkDirty) updateCustomerRemark(customer.id, remarkDraft);
    const identityPatch: { name?: string; phone?: string } = {};
    if (nameDirty && nameDraft.trim()) identityPatch.name = nameDraft.trim();
    if (phoneDirty) identityPatch.phone = phoneDraft.trim();
    if (Object.keys(identityPatch).length > 0) updateCustomerIdentity(customer.id, identityPatch);
  }

  function handleCancel() {
    setProfileDraft(draftFromCustomer(customer));
    setRemarkDraft(customer.remark ?? "");
    setNameDraft(customer.name ?? "");
    setPhoneDraft(customer.phone ?? "");
  }
```

(`profileDirty` is `false` when nothing in `profileDraft` differs from the saved customer — including the case where a user picks a value then picks it back, since it's compared to the saved value, not the previous draft. This matches the "only real changes trigger the bar" requirement.)

- [ ] **Step 5: Wire the header Name input to draft-only (drop the `onBlur` commit)**

Replace (currently lines 215-226):

```tsx
          {canEditIdentity ? (
            <input
              className="field-input"
              style={{ fontSize: 22, fontWeight: 700, padding: "2px 8px", width: "auto", minWidth: 220 }}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                if (nameDraft.trim() && nameDraft !== customer.name) {
                  updateCustomerIdentity(customer.id, { name: nameDraft.trim() });
                }
              }}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.name}</div>
          )}
```

with:

```tsx
          {canEditIdentity ? (
            <input
              className="field-input"
              style={{ fontSize: 22, fontWeight: 700, padding: "2px 8px", width: "auto", minWidth: 220 }}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700 }}>{customer.name}</div>
          )}
```

- [ ] **Step 6: Wire the header Phone input to draft-only (drop the `onBlur` commit)**

Replace (currently lines 232-243):

```tsx
              {canEditIdentity ? (
                <input
                  className="field-input"
                  style={{ width: 130, display: "inline-block", padding: "2px 6px", fontSize: 13.5 }}
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  onBlur={() => {
                    if (phoneDraft.trim() !== customer.phone) {
                      updateCustomerIdentity(customer.id, { phone: phoneDraft.trim() });
                    }
                  }}
                />
              ) : (
                customer.phone
              )}
```

with:

```tsx
              {canEditIdentity ? (
                <input
                  className="field-input"
                  style={{ width: 130, display: "inline-block", padding: "2px 6px", fontSize: 13.5 }}
                  value={phoneDraft}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                />
              ) : (
                customer.phone
              )}
```

- [ ] **Step 7: Wire every Business Profile dropdown + Business Name to `profileDraft`**

Replace the entire Business Profile fields grid (currently lines 374-406):

```tsx
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {profileSelect("Source", customer.sourceId, leadSources, (v) => updateCustomerProfile(customer.id, { sourceId: v || null }))}
          {profileSelect("Area", customer.areaId, areas, (v) => updateCustomerProfile(customer.id, { areaId: v || null, subAreaId: null }))}
          {profileSelect("Subarea", customer.subAreaId, filteredSubAreas, (v) => updateCustomerProfile(customer.id, { subAreaId: v || null }), !customer.areaId)}
          {profileSelect("Property Type", customer.propertyTypeId, propertyTypes, (v) => updateCustomerProfile(customer.id, { propertyTypeId: v || null }))}
          {profileSelect("Purpose", customer.purposeId, purposes, (v) => updateCustomerProfile(customer.id, { purposeId: v || null }))}
          {profileSelect("Business Industry", customer.businessIndustryId, businessTagIndustries, (v) => updateCustomerProfile(customer.id, { businessIndustryId: v || null, businessCategoryId: null, businessTypeId: null }))}
          {profileSelect("Business Category", customer.businessCategoryId, filteredCategories, (v) => updateCustomerProfile(customer.id, { businessCategoryId: v || null, businessTypeId: null }), !customer.businessIndustryId)}
          {profileSelect("Business Type", customer.businessTypeId, filteredTypes, (v) => updateCustomerProfile(customer.id, { businessTypeId: v || null }), !customer.businessCategoryId)}
          {profileSelect("Race", customer.raceId, races, (v) => updateCustomerProfile(customer.id, { raceId: v || null }))}
          {profileSelect("Language", customer.languageId, languages, (v) => updateCustomerProfile(customer.id, { languageId: v || null }))}
          <div>
            <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Business Name</div>
            {canEditProfile ? (
              <input
                className="field-input"
                value={businessNameDraft}
                onChange={(e) => setBusinessNameDraft(e.target.value)}
                onBlur={() => {
                  if (businessNameDraft !== customer.businessName) {
                    updateCustomerProfile(customer.id, { businessName: businessNameDraft });
                  }
                }}
              />
            ) : (
              <div style={{ fontSize: 13.5 }}>{customer.businessName || "—"}</div>
            )}
          </div>
          {profileSelect("Firsttime / Branch", customer.firsttimeBranchId, firsttimeBranchTypes, (v) => updateCustomerProfile(customer.id, { firsttimeBranchId: v || null }))}
          {profileSelect("Target Race", customer.targetRaceId, targetRaces, (v) => updateCustomerProfile(customer.id, { targetRaceId: v || null }))}
          {profileSelect("Target Type", customer.targetTypeId, targetTypes, (v) => updateCustomerProfile(customer.id, { targetTypeId: v || null }))}
          {profileSelect("Budget", customer.budgetId, budgets, (v) => updateCustomerProfile(customer.id, { budgetId: v || null }))}
        </div>
```

with:

```tsx
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {profileSelect("Source", profileDraft.sourceId, leadSources, (v) => setProfileDraft((d) => ({ ...d, sourceId: v || null })))}
          {profileSelect("Area", profileDraft.areaId, areas, (v) => setProfileDraft((d) => ({ ...d, areaId: v || null, subAreaId: null })))}
          {profileSelect("Subarea", profileDraft.subAreaId, filteredSubAreas, (v) => setProfileDraft((d) => ({ ...d, subAreaId: v || null })), !profileDraft.areaId)}
          {profileSelect("Property Type", profileDraft.propertyTypeId, propertyTypes, (v) => setProfileDraft((d) => ({ ...d, propertyTypeId: v || null })))}
          {profileSelect("Purpose", profileDraft.purposeId, purposes, (v) => setProfileDraft((d) => ({ ...d, purposeId: v || null })))}
          {profileSelect("Business Industry", profileDraft.businessIndustryId, businessTagIndustries, (v) => setProfileDraft((d) => ({ ...d, businessIndustryId: v || null, businessCategoryId: null, businessTypeId: null })))}
          {profileSelect("Business Category", profileDraft.businessCategoryId, filteredCategories, (v) => setProfileDraft((d) => ({ ...d, businessCategoryId: v || null, businessTypeId: null })), !profileDraft.businessIndustryId)}
          {profileSelect("Business Type", profileDraft.businessTypeId, filteredTypes, (v) => setProfileDraft((d) => ({ ...d, businessTypeId: v || null })), !profileDraft.businessCategoryId)}
          {profileSelect("Race", profileDraft.raceId, races, (v) => setProfileDraft((d) => ({ ...d, raceId: v || null })))}
          {profileSelect("Language", profileDraft.languageId, languages, (v) => setProfileDraft((d) => ({ ...d, languageId: v || null })))}
          <div>
            <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Business Name</div>
            {canEditProfile ? (
              <input
                className="field-input"
                value={profileDraft.businessName}
                onChange={(e) => setProfileDraft((d) => ({ ...d, businessName: e.target.value }))}
              />
            ) : (
              <div style={{ fontSize: 13.5 }}>{customer.businessName || "—"}</div>
            )}
          </div>
          {profileSelect("Firsttime / Branch", profileDraft.firsttimeBranchId, firsttimeBranchTypes, (v) => setProfileDraft((d) => ({ ...d, firsttimeBranchId: v || null })))}
          {profileSelect("Target Race", profileDraft.targetRaceId, targetRaces, (v) => setProfileDraft((d) => ({ ...d, targetRaceId: v || null })))}
          {profileSelect("Target Type", profileDraft.targetTypeId, targetTypes, (v) => setProfileDraft((d) => ({ ...d, targetTypeId: v || null })))}
          {profileSelect("Budget", profileDraft.budgetId, budgets, (v) => setProfileDraft((d) => ({ ...d, budgetId: v || null })))}
        </div>
```

- [ ] **Step 8: Wire Remark to draft-only, add the Update/Cancel bar**

Replace (currently lines 407-425):

```tsx
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Remark</div>
          {canEditRemark ? (
            <input
              className="field-input"
              value={remarkDraft}
              onChange={(e) => setRemarkDraft(e.target.value)}
              onBlur={() => {
                if (remarkDraft !== customer.remark) {
                  updateCustomerRemark(customer.id, remarkDraft);
                }
              }}
              placeholder="Note for the assigned salesperson"
            />
          ) : (
            <div style={{ fontSize: 13.5 }}>{customer.remark || "—"}</div>
          )}
        </div>
      </div>
```

with:

```tsx
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: "#9aa0ab", marginBottom: 4 }}>Remark</div>
          {canEditRemark ? (
            <input
              className="field-input"
              value={remarkDraft}
              onChange={(e) => setRemarkDraft(e.target.value)}
              placeholder="Note for the assigned salesperson"
            />
          ) : (
            <div style={{ fontSize: 13.5 }}>{customer.remark || "—"}</div>
          )}
        </div>
        {isDirty && (
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button className="btn btn-primary" type="button" onClick={handleUpdate}>Update</button>
            <button className="btn btn-outline" type="button" onClick={handleCancel}>Cancel</button>
          </div>
        )}
      </div>
```

(Note the trailing `</div>` closes the Business Profile card itself — the Update/Cancel bar goes inside it, right after the Remark block, still inside that closing tag.)

- [ ] **Step 9: Move the Change History card to the bottom of the page**

The Change History card currently sits directly after the Business Profile card and before the Activity Log / Tasks grid (currently lines 427-450):

```tsx
      {canEditIdentity && (
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Change History</div>
          {(() => {
            const entries = changeLog.filter((l) => l.customerId === customer.id);
            if (entries.length === 0) {
              return <div style={{ fontSize: 13.5, color: "#9aa0ab" }}>No changes logged yet.</div>;
            }
            return entries.map((l) => (
              <div key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef0f2", fontSize: 13 }}>
                <span style={{ color: "#9aa0ab" }}>{l.time}</span>
                {" · "}
                <span style={{ fontWeight: 600 }}>{l.changedByName}</span>
                {" · "}
                <span>{PROFILE_FIELD_LABELS[l.fieldKey] ?? l.fieldKey}</span>
                {": "}
                <span style={{ color: "#6b7280" }}>{l.oldValue || "—"}</span>
                {" → "}
                <span>{l.newValue || "—"}</span>
              </div>
            ));
          })()}
        </div>
      )}
```

Delete this whole block from its current position, then paste the identical block (verbatim, no changes to its contents) right after the Activity Log / Tasks grid's closing `</div>` and right before the component's final `</div>` — i.e., the very last thing rendered in the page, after both the "Activity Log" column and the "Tasks" column. The grid's closing structure looks like:

```tsx
        </div>
      </div>
    </div>
  );
}
```

(three closing `</div>` in a row: Tasks column → the two-column grid → nothing more, then the component return). Insert the Change History block between the two-column grid's closing `</div>` (6-space indent) and the outermost page `<div>`'s closing `</div>` (4-space indent) — i.e. right where the grid ends and before the page wrapper closes — so the result reads:

```tsx
        </div>
      </div>

      {canEditIdentity && (
        <div className="card" style={{ marginTop: 20, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Change History</div>
          {(() => {
            const entries = changeLog.filter((l) => l.customerId === customer.id);
            if (entries.length === 0) {
              return <div style={{ fontSize: 13.5, color: "#9aa0ab" }}>No changes logged yet.</div>;
            }
            return entries.map((l) => (
              <div key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid #eef0f2", fontSize: 13 }}>
                <span style={{ color: "#9aa0ab" }}>{l.time}</span>
                {" · "}
                <span style={{ fontWeight: 600 }}>{l.changedByName}</span>
                {" · "}
                <span>{PROFILE_FIELD_LABELS[l.fieldKey] ?? l.fieldKey}</span>
                {": "}
                <span style={{ color: "#6b7280" }}>{l.oldValue || "—"}</span>
                {" → "}
                <span>{l.newValue || "—"}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Type-check**

Run:

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. If `businessNameDraft`/`setBusinessNameDraft` still appear anywhere (they shouldn't — Step 2 replaced the declaration and Step 7 replaced its only usage), the build will fail with "cannot find name" — that's a signal a reference was missed.

- [ ] **Step 11: Manual verification**

Using the browser preview (`npm run dev`):
1. As a SALESPERSON assigned to a customer: change 2-3 Business Profile dropdowns (e.g. Source, then Area — confirm Subarea's options update live to the new Area's subareas without saving). Confirm no Update/Cancel bar shows until you actually pick different values, and confirm it appears once you do.
2. Reload the page without clicking Update — confirm the dropdowns are back to their last-saved values (nothing was written to the DB).
3. Make the same edits again, click **Update** — confirm the bar disappears, the values persist after a reload, and (as ADMIN, in a separate tab/session) the Change History card at the bottom of the page shows one row per changed field.
4. Make an edit, click **Cancel** — confirm every field reverts immediately and the bar disappears without any DB write (reload to confirm).
5. As ADMIN/MANAGER: edit Name, Phone, and Remark together with a couple of Business Profile fields, click Update once — confirm all of them save (three separate store calls fire, but from one click) and each produces its own Change History row.
6. Confirm **Stage** and the **Pool Active/Potential** toggle still commit immediately, unaffected — no Update/Cancel involved for either.
7. Confirm the **Change History** card now renders at the very bottom of the page, after the Activity Log / Tasks section, for ADMIN/MANAGER; still invisible to SALESPERSON.

- [ ] **Step 12: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Customer profile: stage Business Profile/Remark/Name/Phone edits behind Update/Cancel, move Change History to page bottom

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
