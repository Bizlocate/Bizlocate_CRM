// Self-check for parseAreaCsv. Run with:
//   node --experimental-strip-types lib/parseAreaCsv.check.ts
import assert from "node:assert";
import { parseAreaCsv, removeCsvRow } from "./parseAreaCsv.ts";
import type { Area, SubArea } from "./types.ts";

// Blank Area cells carry forward the last non-blank area (Setapak.csv layout).
const csv = [
  "Area,Sub-Area",
  "SETAPAK,Desa Melawati",
  ",Saville Melati",
  ",Repeat", // first time, approved
  ",Repeat", // duplicate within file -> reject
  "OTHER,", // empty sub-area -> reject (OTHER never becomes an approved area)
].join("\n");

const result = parseAreaCsv(csv, [], []);
assert.equal(result.approvedAreas.length, 1, "OTHER has no valid rows, only SETAPAK approved");
const setapak = result.approvedAreas.find((a) => a.name === "SETAPAK")!;
assert.deepEqual(setapak.subAreaNames, ["Desa Melawati", "Saville Melati", "Repeat"]);
assert.equal(setapak.isNew, true);
assert.equal(result.rejected.length, 2, "expected 2 rejected rows");
assert.equal(result.rejected.filter((r) => r.reason === "empty sub-area").length, 1);
assert.equal(result.rejected.filter((r) => r.reason === "duplicate").length, 1);
assert.equal(result.approvedCount, 3);
assert.equal(result.rows.length, 5, "one row entry per data line, in file order");
assert.deepEqual(result.rows.map((r) => r.approved), [true, true, true, false, false]);

// Row 1 blank Area with nothing established yet -> "missing area".
const noHeaderArea = parseAreaCsv("Area,Sub-Area\n,Orphan", [], []);
assert.equal(noHeaderArea.rejected[0].reason, "missing area");
assert.equal(noHeaderArea.approvedAreas.length, 0);

// Already-in-DB pairs are rejected as duplicates, existing area is reused (isNew: false).
const existingAreas: Area[] = [{ id: "a1", name: "SETAPAK", teamId: null, autoAssignEnabled: true }];
const existingSubAreas: SubArea[] = [{ id: "s1", areaId: "a1", name: "Desa Melawati" }];
const reupload = parseAreaCsv("Area,Sub-Area\nSETAPAK,Desa Melawati\n,New One", existingAreas, existingSubAreas);
assert.equal(reupload.rejected.length, 1);
assert.equal(reupload.rejected[0].reason, "duplicate");
assert.equal(reupload.approvedAreas.length, 1);
assert.equal(reupload.approvedAreas[0].isNew, false);
assert.deepEqual(reupload.approvedAreas[0].subAreaNames, ["New One"]);

// Deleting one approved row from the preview drops it from that area's
// subAreaNames and keeps everything else (isNew, other rows) intact.
const withoutRow3 = removeCsvRow(result, 3); // row 3 = ",Saville Melati"
assert.equal(withoutRow3.rows.length, 4);
assert.equal(withoutRow3.rows.some((r) => r.row === 3), false);
assert.deepEqual(withoutRow3.approvedAreas[0].subAreaNames, ["Desa Melawati", "Repeat"]);
assert.equal(withoutRow3.approvedCount, 2);

// Deleting the last approved row for an area removes that area entirely.
const onlySetapak = parseAreaCsv("Area,Sub-Area\nSETAPAK,Desa Melawati", [], []);
const emptied = removeCsvRow(onlySetapak, 2);
assert.equal(emptied.approvedAreas.length, 0);
assert.equal(emptied.approvedCount, 0);

console.log("parseAreaCsv: all checks passed");
