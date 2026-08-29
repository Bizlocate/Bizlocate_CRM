# WhatsApp Assignment Notify — Design

Date: 2026-08-30

## Purpose

When ADMIN/MANAGER views a customer they've assigned to a salesperson, let them one-click open a WhatsApp chat with that salesperson (not the customer), pre-filled with a template summarizing the lead so the salesperson has the key facts without needing to open the CRM.

## Scope

- No backend/API integration — this uses a plain `wa.me` deep link (`https://wa.me/<phone>?text=<encoded message>`), which opens WhatsApp (app or web) with the chat and message pre-filled. The user still taps Send inside WhatsApp themselves; nothing is sent automatically. No WhatsApp Business API, no new dependency.
- Recipient is the salesperson currently assigned to the customer (`assignedUser.phone`), not the customer's own phone.
- Visible only to ADMIN and MANAGER (the roles that create/assign customers), on the customer detail page, next to the existing "Assigned: {name}" text in the page header.
- Hidden entirely if the assigned user has no phone number on file (`assignedUser.phone` is `null`/empty) — no disabled-button state, just absent.

## Phone Normalization

Existing phone fields (`User.phone`, `Customer.phone`) are free text, Malaysia-local format, no country code (e.g. `"012-345 6789"`). `wa.me` needs digits only with country code, no `+`, no separators.

`normalizeMyPhone(raw: string): string`:
1. Strip every non-digit character.
2. If the result starts with `"60"`, keep as-is.
3. Else if it starts with `"0"`, replace the leading `0` with `60`.
4. Else, prepend `60` (handles a number typed without its leading 0, e.g. `"123456789"` → `"60123456789"`).

This is a pure function — new file `lib/whatsapp.ts`, with a `node:assert` self-check script (`lib/whatsapp.check.ts`), following the existing convention in this repo for pure-logic modules (see `lib/parseBusinessTagCsv.check.ts`).

## Message Template

`buildAssignmentMessage(input: { customerName: string; customerPhone: string; areaName: string; businessTypeName: string; raceName: string; languageName: string }): string`, also in `lib/whatsapp.ts`:

```
New customer assigned to you:
Name: {customerName}
Phone: {customerPhone}
Area: {areaName}
Business Type: {businessTypeName}
Race: {raceName}
Language: {languageName}
```

Any missing lookup value (e.g. Area not set on the customer) is passed in as `"—"` by the caller — `buildAssignmentMessage` itself does no fallback logic, the detail page resolves each lookup name (or `"—"`) before calling it, matching how the page already resolves `stageName`/`userName` today.

`buildWhatsAppLink(phone: string, message: string): string` combines normalization + URL construction: `` `https://wa.me/${normalizeMyPhone(phone)}?text=${encodeURIComponent(message)}` ``.

## UI

In `app/(dashboard)/customers/[id]/page.tsx`, in the header block that currently renders:

```
{customer.email} · {customer.phone} · Assigned: {assignedUser?.name ?? "—"}
```

When `currentUser.role` is `ADMIN` or `MANAGER`, `assignedUser` exists, and `assignedUser.phone` is non-empty, render a small WhatsApp icon/button right after the assignee's name, wrapped in an `<a href={waLink} target="_blank" rel="noopener noreferrer">`. Resolve the four lookup names (Area, Business Type, Race, Language) from the customer's `areaId`/`businessTypeId`/`raceId`/`languageId` against the already-loaded `areas`/`businessTagTypes`/`races`/`languages` store lists, falling back to `"—"` for any unset field — the same pattern the page already uses for `stageName`/`userName`.

## Testing

`lib/whatsapp.check.ts` (run via `node --experimental-strip-types lib/whatsapp.check.ts`) covers `normalizeMyPhone`'s three branches (already-60, leading-0, bare-local-number) and confirms `buildAssignmentMessage`/`buildWhatsAppLink` produce the exact expected string and URL.

Manual, via the `run` skill:
1. As ADMIN, open a customer assigned to a salesperson with a phone number on file. Confirm the WhatsApp button appears next to "Assigned: {name}".
2. Click it — confirm it opens `https://wa.me/60...` with the pre-filled template visible (WhatsApp Web will prompt to open the app or continue in browser; either is fine, that's WhatsApp's own behavior, not something this feature controls).
3. Open a customer assigned to a user with no phone on file — confirm no button renders.
4. Log in as the assigned SALESPERSON (not ADMIN/MANAGER) and view the same customer — confirm no button renders for them.
