// Self-check for parseBusinessTagCsv. Run with:
//   node --experimental-strip-types lib/parseBusinessTagCsv.check.ts
import assert from "node:assert";
import { parseBusinessTagCsv, removeBusinessTagCsvRow } from "./parseBusinessTagCsv.ts";
import type { BusinessTagCategory, BusinessTagIndustry, BusinessTagType } from "./types.ts";

// Blank Industries/Categories cells carry forward; category carry-forward
// resets when the industry changes.
const csv = [
  "Industries,Categories,Types",
  "Food & Beverage,Food & Beverage- Restaurant,Restaurant- Fast Food",
  ",,Restaurant- Chinese Food",
  ",,Restaurant- Fast Food", // duplicate within file -> reject
  "Beauty,Beauty- Hair Salon,Hair Salon- Salon",
  ",,", // empty type -> reject
  "UNKNOWN,,UNKNOWN", // blank category, none established yet -> reject
].join("\n");

const result = parseBusinessTagCsv(csv, [], [], []);
assert.equal(result.approvedIndustries.length, 2, "Food & Beverage and Beauty approved");
const fnb = result.approvedIndustries.find((i) => i.name === "Food & Beverage")!;
assert.equal(fnb.isNew, true);
assert.equal(fnb.categories.length, 1);
assert.deepEqual(fnb.categories[0].typeNames, ["Restaurant- Fast Food", "Restaurant- Chinese Food"]);
const beauty = result.approvedIndustries.find((i) => i.name === "Beauty")!;
assert.deepEqual(beauty.categories[0].typeNames, ["Hair Salon- Salon"]);
assert.equal(result.rejected.length, 3, "expected 3 rejected rows");
assert.equal(result.rejected.filter((r) => r.reason === "duplicate").length, 1);
assert.equal(result.rejected.filter((r) => r.reason === "empty type").length, 1);
assert.equal(result.rejected.filter((r) => r.reason === "missing category").length, 1);
assert.equal(result.approvedCount, 3);
assert.equal(result.rows.length, 6, "one row entry per data line, in file order");

// Row with blank industry and nothing established yet -> "missing industry".
const noIndustry = parseBusinessTagCsv("Industries,Categories,Types\n,Cat,Type", [], [], []);
assert.equal(noIndustry.rejected[0].reason, "missing industry");
assert.equal(noIndustry.approvedIndustries.length, 0);

// Already-in-DB triples are rejected as duplicates, existing industry/category reused (isNew: false).
const existingIndustries: BusinessTagIndustry[] = [{ id: "i1", name: "Beauty" }];
const existingCategories: BusinessTagCategory[] = [{ id: "c1", industryId: "i1", name: "Beauty- Hair Salon" }];
const existingTypes: BusinessTagType[] = [{ id: "t1", categoryId: "c1", name: "Hair Salon- Salon" }];
const reupload = parseBusinessTagCsv(
  "Industries,Categories,Types\nBeauty,Beauty- Hair Salon,Hair Salon- Salon\n,,Hair Salon- Barber",
  existingIndustries,
  existingCategories,
  existingTypes
);
assert.equal(reupload.rejected.length, 1);
assert.equal(reupload.rejected[0].reason, "duplicate");
assert.equal(reupload.approvedIndustries.length, 1);
assert.equal(reupload.approvedIndustries[0].isNew, false);
assert.equal(reupload.approvedIndustries[0].categories[0].isNew, false);
assert.deepEqual(reupload.approvedIndustries[0].categories[0].typeNames, ["Hair Salon- Barber"]);

// Deleting one approved row from the preview drops it from that category's
// typeNames and keeps everything else intact.
const withoutRow3 = removeBusinessTagCsvRow(result, 3); // row 3 = ",,Restaurant- Chinese Food"
assert.equal(withoutRow3.rows.length, 5);
assert.equal(withoutRow3.rows.some((r) => r.row === 3), false);
assert.deepEqual(
  withoutRow3.approvedIndustries.find((i) => i.name === "Food & Beverage")!.categories[0].typeNames,
  ["Restaurant- Fast Food"]
);
assert.equal(withoutRow3.approvedCount, 2);

// Deleting the last approved row for an industry removes that industry entirely.
const onlyBeauty = parseBusinessTagCsv("Industries,Categories,Types\nBeauty,Beauty- Hair Salon,Hair Salon- Salon", [], [], []);
const emptied = removeBusinessTagCsvRow(onlyBeauty, 2);
assert.equal(emptied.approvedIndustries.length, 0);
assert.equal(emptied.approvedCount, 0);

console.log("parseBusinessTagCsv: all checks passed");
