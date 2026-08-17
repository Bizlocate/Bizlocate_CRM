import type { Area, CsvPreview, SubArea } from "./types";

// Parses "Area,Sub-Area" CSV where a blank Area cell carries forward the
// last non-blank area (matches Area/Setapak.csv's layout). Pure function —
// no DB access, no writes; the caller decides what to do with the result.
export function parseAreaCsv(csvText: string, existingAreas: Area[], existingSubAreas: SubArea[]): CsvPreview {
  const lines = csvText.split(/\r?\n/);
  const approvedAreas: CsvPreview["approvedAreas"] = [];
  const areaByKey = new Map<string, CsvPreview["approvedAreas"][number]>();
  const rejected: CsvPreview["rejected"] = [];
  const rows: CsvPreview["rows"] = [];
  const seenInFile = new Set<string>();
  let currentArea = "";

  lines.forEach((line, idx) => {
    if (idx === 0 || !line.trim()) return; // header / blank line
    const rowNum = idx + 1;
    const [rawArea, rawSub] = line.split(",");
    const areaCell = (rawArea ?? "").trim();
    const subCell = (rawSub ?? "").trim();
    if (areaCell) currentArea = areaCell;

    function reject(area: string, reason: string) {
      rejected.push({ row: rowNum, area, subArea: subCell, reason });
      rows.push({ row: rowNum, area, subArea: subCell, approved: false, reason });
    }

    if (!currentArea) {
      reject(areaCell, "missing area");
      return;
    }
    if (!subCell) {
      reject(currentArea, "empty sub-area");
      return;
    }
    const key = `${currentArea.toLowerCase()}||${subCell.toLowerCase()}`;
    const alreadyInDb = existingSubAreas.some(
      (s) => s.name.toLowerCase() === subCell.toLowerCase() && existingAreas.find((a) => a.id === s.areaId)?.name.toLowerCase() === currentArea.toLowerCase()
    );
    if (alreadyInDb || seenInFile.has(key)) {
      reject(currentArea, "duplicate");
      return;
    }
    seenInFile.add(key);

    const areaKey = currentArea.toLowerCase();
    let entry = areaByKey.get(areaKey);
    if (!entry) {
      entry = { name: currentArea, isNew: !existingAreas.some((a) => a.name.toLowerCase() === areaKey), subAreaNames: [] };
      areaByKey.set(areaKey, entry);
      approvedAreas.push(entry);
    }
    entry.subAreaNames.push(subCell);
    rows.push({ row: rowNum, area: currentArea, subArea: subCell, approved: true });
  });

  const approvedCount = approvedAreas.reduce((sum, a) => sum + a.subAreaNames.length, 0);
  return { approvedAreas, rejected, rows, approvedCount, rejectedCount: rejected.length };
}
