# WhatsApp Assignment Notify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let ADMIN/MANAGER open a `wa.me` chat with the assigned salesperson, pre-filled with a lead summary template, via a button on the customer detail page.

**Architecture:** One new pure-logic module (`lib/whatsapp.ts`) for phone normalization + message/link building, with a `node:assert` self-check script following this repo's existing convention (`lib/parseBusinessTagCsv.check.ts`). One UI change wiring it into the customer detail page's existing header.

**Tech Stack:** Same as the rest of this repo — no new dependencies (`wa.me` is a plain URL, no SDK).

## Global Constraints

- No new DB schema, no new store state — this reads data already loaded by the customer detail page.
- Button visible only when `currentUser.role` is `ADMIN` or `MANAGER`, `assignedUser` exists, and `assignedUser.phone` is non-empty/non-null. Absent otherwise — no disabled state.
- Phone normalization assumes Malaysia (`+60`): strip non-digits; if it starts `60` keep it; if it starts `0` replace the leading `0` with `60`; otherwise prepend `60`.
- Match existing code style: inline `style={{...}}`, no new UI libraries.
- No automated test framework in this repo. The one new pure-logic file gets a `.check.ts` self-check script (matching `lib/parseBusinessTagCsv.check.ts`'s convention exactly: `node:assert`, run via `node --experimental-strip-types lib/whatsapp.check.ts`). The UI change gets verified via `npx tsc --noEmit` plus manual reasoning/click-through.

---

### Task 1: `lib/whatsapp.ts` — phone normalization + message/link builder

**Files:**
- Create: `lib/whatsapp.ts`
- Create: `lib/whatsapp.check.ts`

**Interfaces:**
- Produces: `normalizeMyPhone(raw: string): string`, `buildAssignmentMessage(input: { customerName: string; customerPhone: string; areaName: string; businessTypeName: string; raceName: string; languageName: string }): string`, `buildWhatsAppLink(phone: string, message: string): string`. Task 2 imports all three from `@/lib/whatsapp`.

- [ ] **Step 1: Write `lib/whatsapp.ts`**

```ts
export function normalizeMyPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return "60" + digits;
}

export function buildAssignmentMessage(input: {
  customerName: string;
  customerPhone: string;
  areaName: string;
  businessTypeName: string;
  raceName: string;
  languageName: string;
}): string {
  return [
    "New customer assigned to you:",
    `Name: ${input.customerName}`,
    `Phone: ${input.customerPhone}`,
    `Area: ${input.areaName}`,
    `Business Type: ${input.businessTypeName}`,
    `Race: ${input.raceName}`,
    `Language: ${input.languageName}`,
  ].join("\n");
}

export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalizeMyPhone(phone)}?text=${encodeURIComponent(message)}`;
}
```

- [ ] **Step 2: Write the self-check script**

Follow `lib/parseBusinessTagCsv.check.ts`'s exact convention (header comment with the run command, `node:assert`, plain assertions, a final success `console.log`):

```ts
// Self-check for lib/whatsapp. Run with:
//   node --experimental-strip-types lib/whatsapp.check.ts
import assert from "node:assert";
import { normalizeMyPhone, buildAssignmentMessage, buildWhatsAppLink } from "./whatsapp.ts";

// Already has the 60 country code -> unchanged.
assert.equal(normalizeMyPhone("60123456789"), "60123456789");
assert.equal(normalizeMyPhone("+60 12-345 6789"), "60123456789");

// Local format with leading 0 -> 0 replaced by 60.
assert.equal(normalizeMyPhone("012-345 6789"), "60123456789");
assert.equal(normalizeMyPhone("0123456789"), "60123456789");

// Bare number with no leading 0 and no country code -> 60 prepended.
assert.equal(normalizeMyPhone("123456789"), "60123456789");

const message = buildAssignmentMessage({
  customerName: "Kedai Runcit Maju Jaya",
  customerPhone: "012-345 6789",
  areaName: "Petaling Jaya",
  businessTypeName: "Restaurant- Fast Food",
  raceName: "Malay",
  languageName: "Malay",
});
assert.equal(
  message,
  [
    "New customer assigned to you:",
    "Name: Kedai Runcit Maju Jaya",
    "Phone: 012-345 6789",
    "Area: Petaling Jaya",
    "Business Type: Restaurant- Fast Food",
    "Race: Malay",
    "Language: Malay",
  ].join("\n")
);

const link = buildWhatsAppLink("012-345 6789", message);
assert.equal(link, `https://wa.me/60123456789?text=${encodeURIComponent(message)}`);
assert.ok(link.startsWith("https://wa.me/60123456789?text="));

console.log("lib/whatsapp: all checks passed");
```

- [ ] **Step 3: Run the self-check**

Run: `node --experimental-strip-types lib/whatsapp.check.ts`
Expected: `lib/whatsapp: all checks passed`, no assertion errors.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/whatsapp.ts lib/whatsapp.check.ts
git commit -m "Add WhatsApp phone normalization and message/link builder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire the WhatsApp button into the customer detail page

**Files:**
- Modify: `app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `normalizeMyPhone`, `buildAssignmentMessage`, `buildWhatsAppLink` (Task 1).

- [ ] **Step 1: Import the new module**

Add to the top of `app/(dashboard)/customers/[id]/page.tsx`:

```ts
import { buildAssignmentMessage, buildWhatsAppLink } from "@/lib/whatsapp";
```

- [ ] **Step 2: Resolve the four lookup names and build the link**

Right after the existing `const assignedUser = users.find((u) => u.id === customer.assignedToUserId);` line, add:

```ts
const canSendWhatsApp = (currentUser.role === "ADMIN" || currentUser.role === "MANAGER") && !!assignedUser?.phone;
const whatsAppLink = canSendWhatsApp
  ? buildWhatsAppLink(
      assignedUser!.phone!,
      buildAssignmentMessage({
        customerName: customer.name,
        customerPhone: customer.phone,
        areaName: areas.find((a) => a.id === customer.areaId)?.name ?? "—",
        businessTypeName: businessTagTypes.find((t) => t.id === customer.businessTypeId)?.name ?? "—",
        raceName: races.find((r) => r.id === customer.raceId)?.name ?? "—",
        languageName: languages.find((l) => l.id === customer.languageId)?.name ?? "—",
      })
    )
  : null;
```

(`areas`, `businessTagTypes`, `races`, `languages` are all already destructured from `useStore()` at the top of this component — no new store imports needed.)

- [ ] **Step 3: Render the button**

Change:

```tsx
<div style={{ fontSize: 13.5, color: "#6b7280", marginTop: 6 }}>
  {customer.email} · {customer.phone} · Assigned: {assignedUser?.name ?? "—"}
</div>
```

to:

```tsx
<div style={{ fontSize: 13.5, color: "#6b7280", marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
  <span>
    {customer.email} · {customer.phone} · Assigned: {assignedUser?.name ?? "—"}
  </span>
  {whatsAppLink && (
    <a
      href={whatsAppLink}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        color: "#1e7a41",
        background: "#e7f6ec",
        padding: "3px 10px",
        borderRadius: 20,
        textDecoration: "none",
      }}
    >
      WhatsApp
    </a>
  )}
</div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

As ADMIN, open a customer assigned to a salesperson with a phone number on file. Confirm the "WhatsApp" badge/link appears next to "Assigned: {name}". Click it — confirm it opens `https://wa.me/60...?text=...` (in a new tab) with the template text visible once WhatsApp Web/App loads.

Open a customer assigned to a user with no phone on file — confirm no WhatsApp link renders.

Log in as the assigned SALESPERSON and view the same customer — confirm no WhatsApp link renders for them (the whole feature is ADMIN/MANAGER-only).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/customers/[id]/page.tsx"
git commit -m "Add WhatsApp assignment notify button to customer detail page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** phone normalization (design's "Phone Normalization" section) → Task 1. Message template (design's exact 6-field format) → Task 1's `buildAssignmentMessage`. UI placement/visibility rules → Task 2.
- **Type consistency:** `buildWhatsAppLink(phone: string, message: string)` and `buildAssignmentMessage(input: {...})` field names match exactly between Task 1's definition and Task 2's call site.
- **No placeholders:** every step contains complete, runnable code.
