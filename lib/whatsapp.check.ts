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
  sourceName: "Facebook Ads",
  areaName: "Petaling Jaya",
  subAreaName: "Damansara",
  businessTypeName: "Restaurant- Fast Food",
  raceName: "Malay",
  languageName: "Malay",
  budgetName: "RM50k-100k",
});
assert.equal(
  message,
  [
    "New customer assigned to you:",
    "Name: Kedai Runcit Maju Jaya",
    "Phone: 012-345 6789",
    "Source: Facebook Ads",
    "Area: Petaling Jaya",
    "Subarea: Damansara",
    "Business Type: Restaurant- Fast Food",
    "Race: Malay",
    "Language: Malay",
    "Budget: RM50k-100k",
  ].join("\n")
);

const link = buildWhatsAppLink("012-345 6789", message);
assert.equal(link, `https://wa.me/60123456789?text=${encodeURIComponent(message)}`);
assert.ok(link.startsWith("https://wa.me/60123456789?text="));

console.log("lib/whatsapp: all checks passed");
