"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import AdminTabs from "@/components/AdminTabs";
import LookupListEditor from "@/components/LookupListEditor";

const LISTS = [
  "Source",
  "Property Type",
  "Purpose",
  "Language",
  "Firsttime/Branch",
  "Race",
  "Target Race",
  "Target Type",
] as const;

type ListName = (typeof LISTS)[number];

export default function AdminProfileListsPage() {
  const {
    leadSources,
    propertyTypes,
    purposes,
    languages,
    firsttimeBranchTypes,
    races,
    targetRaces,
    targetTypes,
    addLeadSource,
    updateLeadSource,
    deleteLeadSource,
    addPropertyType,
    updatePropertyType,
    deletePropertyType,
    addPurpose,
    updatePurpose,
    deletePurpose,
    addLanguage,
    updateLanguage,
    deleteLanguage,
    addFirsttimeBranchType,
    updateFirsttimeBranchType,
    deleteFirsttimeBranchType,
    addRace,
    updateRace,
    deleteRace,
    addTargetRace,
    updateTargetRace,
    deleteTargetRace,
    addTargetType,
    updateTargetType,
    deleteTargetType,
  } = useStore();

  const [selected, setSelected] = useState<ListName>("Source");

  const config: Record<ListName, { items: { id: string; name: string }[]; onAdd: (name: string) => void; onUpdate: (id: string, name: string) => void; onDelete: (id: string) => void }> = {
    Source: { items: leadSources, onAdd: addLeadSource, onUpdate: updateLeadSource, onDelete: deleteLeadSource },
    "Property Type": { items: propertyTypes, onAdd: addPropertyType, onUpdate: updatePropertyType, onDelete: deletePropertyType },
    Purpose: { items: purposes, onAdd: addPurpose, onUpdate: updatePurpose, onDelete: deletePurpose },
    Language: { items: languages, onAdd: addLanguage, onUpdate: updateLanguage, onDelete: deleteLanguage },
    "Firsttime/Branch": { items: firsttimeBranchTypes, onAdd: addFirsttimeBranchType, onUpdate: updateFirsttimeBranchType, onDelete: deleteFirsttimeBranchType },
    Race: { items: races, onAdd: addRace, onUpdate: updateRace, onDelete: deleteRace },
    "Target Race": { items: targetRaces, onAdd: addTargetRace, onUpdate: updateTargetRace, onDelete: deleteTargetRace },
    "Target Type": { items: targetTypes, onAdd: addTargetType, onUpdate: updateTargetType, onDelete: deleteTargetType },
  };

  const active = config[selected];

  return (
    <div style={{ padding: "28px 32px" }}>
      <AdminTabs />
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Admin — Profile Lists</div>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
        <div className="card" style={{ padding: 8 }}>
          {LISTS.map((name) => (
            <div
              key={name}
              onClick={() => setSelected(name)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
                background: selected === name ? "#eef0ff" : "transparent",
                color: selected === name ? "#4046c9" : "#20222b",
              }}
            >
              {name}
            </div>
          ))}
        </div>
        <LookupListEditor title={selected} items={active.items} onAdd={active.onAdd} onUpdate={active.onUpdate} onDelete={active.onDelete} />
      </div>
    </div>
  );
}
