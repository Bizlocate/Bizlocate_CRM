"use client";

import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";
import { MANDATORY_FIELD_KEYS, MANDATORY_FIELD_LABELS } from "@/lib/types";

export default function AdminFieldSettingsPage() {
  const { fieldRequirements, updateFieldRequirement } = useStore();

  function isRequired(fieldKey: string): boolean {
    return fieldRequirements.find((f) => f.fieldKey === fieldKey)?.required ?? false;
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
              onChange={(e) => updateFieldRequirement(fieldKey, e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontWeight: 500 }}>{MANDATORY_FIELD_LABELS[fieldKey]}</span>
            <span style={{ color: "#9aa0ab" }}>— required at creation</span>
          </label>
        ))}
      </div>
    </div>
  );
}
