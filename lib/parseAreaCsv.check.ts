// Self-check for parseAreaCsv. Run with:
//   node --experimental-strip-types lib/parseAreaCsv.check.ts
import assert from "node:assert";
import { parseAreaCsv } from "./parseAreaCsv.ts";
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
const existingAreas: Area[] = [{ id: "a1", name: "SETAPAK" }];
const existingSubAreas: SubArea[] = [{ id: "s1", areaId: "a1", name: "Desa Melawati" }];
const reupload = parseAreaCsv("Area,Sub-Area\nSETAPAK,Desa Melawati\n,New One", existingAreas, existingSubAreas);
assert.equal(reupload.rejected.length, 1);
assert.equal(reupload.rejected[0].reason, "duplicate");
assert.equal(reupload.approvedAreas.length, 1);
assert.equal(reupload.approvedAreas[0].isNew, false);
assert.deepEqual(reupload.approvedAreas[0].subAreaNames, ["New One"]);

console.log("parseAreaCsv: all checks passed");
