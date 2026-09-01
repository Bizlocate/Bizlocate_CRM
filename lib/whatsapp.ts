export function normalizeMyPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return "60" + digits;
}

export function buildAssignmentMessage(input: {
  customerName: string;
  customerPhone: string;
  sourceName: string;
  areaName: string;
  subAreaName: string;
  businessTypeName: string;
  raceName: string;
  languageName: string;
  budgetMin: number | null;
}): string {
  return [
    "New customer assigned to you:",
    `Name: ${input.customerName}`,
    `Phone: ${input.customerPhone}`,
    `Source: ${input.sourceName}`,
    `Area: ${input.areaName}`,
    `Subarea: ${input.subAreaName}`,
    `Business Type: ${input.businessTypeName}`,
    `Race: ${input.raceName}`,
    `Language: ${input.languageName}`,
    `Budget: ${input.budgetMin !== null ? `RM${input.budgetMin}` : "—"}`,
  ].join("\n");
}

export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalizeMyPhone(phone)}?text=${encodeURIComponent(message)}`;
}
