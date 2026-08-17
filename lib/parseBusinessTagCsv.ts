import type { BusinessTagCategory, BusinessTagIndustry, BusinessTagType, CsvBusinessTagPreview } from "./types";

// Parses "Industries,Categories,Types" CSV where a blank Industries cell
// carries forward the last non-blank industry, and a blank Categories cell
// carries forward the last non-blank category *within the current industry*
// (matches Business Tag - Sheet1.csv's layout). Pure function — no DB
// access, no writes; the caller decides what to do with the result.
export function parseBusinessTagCsv(
  csvText: string,
  existingIndustries: BusinessTagIndustry[],
  existingCategories: BusinessTagCategory[],
  existingTypes: BusinessTagType[]
): CsvBusinessTagPreview {
  const lines = csvText.split(/\r?\n/);
  const approvedIndustries: CsvBusinessTagPreview["approvedIndustries"] = [];
  const industryByKey = new Map<string, CsvBusinessTagPreview["approvedIndustries"][number]>();
  const rejected: CsvBusinessTagPreview["rejected"] = [];
  const rows: CsvBusinessTagPreview["rows"] = [];
  const seenInFile = new Set<string>();
  let currentIndustry = "";
  let currentCategory = "";

  lines.forEach((line, idx) => {
    if (idx === 0 || !line.trim()) return; // header / blank line
    const rowNum = idx + 1;
    const [rawIndustry, rawCategory, rawType] = line.split(",");
    const industryCell = (rawIndustry ?? "").trim();
    const categoryCell = (rawCategory ?? "").trim();
    const typeCell = (rawType ?? "").trim();
    if (industryCell) {
      currentIndustry = industryCell;
      currentCategory = ""; // categories don't carry across an industry change
    }
    if (categoryCell) currentCategory = categoryCell;

    function reject(industry: string, category: string, reason: string) {
      rejected.push({ row: rowNum, industry, category, type: typeCell, reason });
      rows.push({ row: rowNum, industry, category, type: typeCell, approved: false, reason });
    }

    if (!currentIndustry) {
      reject(industryCell, categoryCell, "missing industry");
      return;
    }
    if (!currentCategory) {
      reject(currentIndustry, categoryCell, "missing category");
      return;
    }
    if (!typeCell) {
      reject(currentIndustry, currentCategory, "empty type");
      return;
    }
    const key = `${currentIndustry.toLowerCase()}||${currentCategory.toLowerCase()}||${typeCell.toLowerCase()}`;
    const alreadyInDb = existingTypes.some((t) => {
      if (t.name.toLowerCase() !== typeCell.toLowerCase()) return false;
      const cat = existingCategories.find((c) => c.id === t.categoryId);
      if (!cat || cat.name.toLowerCase() !== currentCategory.toLowerCase()) return false;
      const ind = existingIndustries.find((i) => i.id === cat.industryId);
      return !!ind && ind.name.toLowerCase() === currentIndustry.toLowerCase();
    });
    if (alreadyInDb || seenInFile.has(key)) {
      reject(currentIndustry, currentCategory, "duplicate");
      return;
    }
    seenInFile.add(key);

    const industryKey = currentIndustry.toLowerCase();
    let industryEntry = industryByKey.get(industryKey);
    if (!industryEntry) {
      industryEntry = {
        name: currentIndustry,
        isNew: !existingIndustries.some((i) => i.name.toLowerCase() === industryKey),
        categories: [],
      };
      industryByKey.set(industryKey, industryEntry);
      approvedIndustries.push(industryEntry);
    }
    const categoryKey = currentCategory.toLowerCase();
    let categoryEntry = industryEntry.categories.find((c) => c.name.toLowerCase() === categoryKey);
    if (!categoryEntry) {
      categoryEntry = {
        name: currentCategory,
        isNew: !existingCategories.some(
          (c) =>
            c.name.toLowerCase() === categoryKey &&
            existingIndustries.find((i) => i.id === c.industryId)?.name.toLowerCase() === industryKey
        ),
        typeNames: [],
      };
      industryEntry.categories.push(categoryEntry);
    }
    categoryEntry.typeNames.push(typeCell);
    rows.push({ row: rowNum, industry: currentIndustry, category: currentCategory, type: typeCell, approved: true });
  });

  const approvedCount = approvedIndustries.reduce(
    (sum, ind) => sum + ind.categories.reduce((s, c) => s + c.typeNames.length, 0),
    0
  );
  return { approvedIndustries, rejected, rows, approvedCount, rejectedCount: rejected.length };
}

// Drops one row (by row number) from a preview and regroups approvedIndustries
// from what's left, so admin can exclude a row before confirming upload.
export function removeBusinessTagCsvRow(preview: CsvBusinessTagPreview, row: number): CsvBusinessTagPreview {
  const rows = preview.rows.filter((r) => r.row !== row);
  const rejected = preview.rejected.filter((r) => r.row !== row);
  const isNewByIndustry = new Map(preview.approvedIndustries.map((i) => [i.name.toLowerCase(), i.isNew]));
  const isNewByCategory = new Map(
    preview.approvedIndustries.flatMap((i) =>
      i.categories.map((c) => [`${i.name.toLowerCase()}||${c.name.toLowerCase()}`, c.isNew] as const)
    )
  );

  const approvedIndustries: CsvBusinessTagPreview["approvedIndustries"] = [];
  const industryByKey = new Map<string, CsvBusinessTagPreview["approvedIndustries"][number]>();
  for (const r of rows) {
    if (!r.approved) continue;
    const industryKey = r.industry.toLowerCase();
    let industryEntry = industryByKey.get(industryKey);
    if (!industryEntry) {
      industryEntry = { name: r.industry, isNew: isNewByIndustry.get(industryKey) ?? false, categories: [] };
      industryByKey.set(industryKey, industryEntry);
      approvedIndustries.push(industryEntry);
    }
    const categoryKey = r.category.toLowerCase();
    let categoryEntry = industryEntry.categories.find((c) => c.name.toLowerCase() === categoryKey);
    if (!categoryEntry) {
      categoryEntry = {
        name: r.category,
        isNew: isNewByCategory.get(`${industryKey}||${categoryKey}`) ?? false,
        typeNames: [],
      };
      industryEntry.categories.push(categoryEntry);
    }
    categoryEntry.typeNames.push(r.type);
  }

  const approvedCount = approvedIndustries.reduce(
    (sum, ind) => sum + ind.categories.reduce((s, c) => s + c.typeNames.length, 0),
    0
  );
  return { approvedIndustries, rejected, rows, approvedCount, rejectedCount: rejected.length };
}
