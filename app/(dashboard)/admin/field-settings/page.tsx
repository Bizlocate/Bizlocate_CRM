"use client";

import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";
import { MANDATORY_FIELD_KEYS, MANDATORY_FIELD_LABELS } from "@/lib/types";

// Cascade children -> their parent field(s). Checking a child forces its parent(s) required too,
// so a required child can never be blocked behind an optional, unfilled parent dropdown.
const FIELD_PARENTS: Partial<Record<(typeof MANDATORY_FIELD_KEYS)[number], (typeof MANDATORY_FIELD_KEYS)[number][]>> = {
  sub_area: ["area"],
  business_category: ["business_industry"],
  business_type: ["business_industry", "business_category"],
};

export default function AdminFieldSettingsPage() {
  const { fieldRequirements, updateFieldRequirement } = useStore();

  function isRequired(fieldKey: string): boolean {
    return fieldRequirements.find((f) => f.fieldKey === fieldKey)?.required ?? false;
  }

  function handleToggle(fieldKey: (typeof MANDATORY_FIELD_KEYS)[number], checked: boolean) {
    updateFieldRequirement(fieldKey, checked);
    if (checked) {
      for (const parent of FIELD_PARENTS[fieldKey] ?? []) {
        if (!isRequired(parent)) updateFieldRequirement(parent, true);
      }
    }
  }

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Admin — Required Fields</div>
      <div style={{ fontSize: 13.5, color: "#6b7280", marginBottom: 20 }}>
        Fields checked here must be filled in before a new customer can be created. Editing a customer afterward is unaffected.
      </div>
      <div className="card">
        {MANDATORY_FIELD_KEYS.map((fieldKey) => (
          <label
            key={fieldKey}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #eef0f2", fontSize: 13.5, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={isRequired(fieldKey)}
              onChange={(e) => handleToggle(fieldKey, e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontWeight: 500 }}>{MANDATORY_FIELD_LABELS[fieldKey]}</span>
            <span style={{ color: "#9aa0ab" }}>— required at creation</span>
            {FIELD_PARENTS[fieldKey] && <span style={{ color: "#9aa0ab", fontSize: 12 }}>(auto-enables its parent)</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
