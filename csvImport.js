function normalizeHeader(header) {
  return String(header || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTitle(title) {
  return String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function toMonthKey(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const isoLike = /^\d{4}-\d{2}(-\d{2})?$/;
  if (isoLike.test(trimmed)) return trimmed.slice(0, 7);

  const monthLike = /^\d{4}\/\d{2}(\/\d{2})?$/;
  if (monthLike.test(trimmed)) return trimmed.replace(/\//g, "-").slice(0, 7);

  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  const monthYear = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYear) {
    const tmp = new Date(`${monthYear[1]} 1, ${monthYear[2]}`);
    if (!Number.isNaN(tmp.getTime())) {
      const yyyy = tmp.getUTCFullYear();
      const mm = String(tmp.getUTCMonth() + 1).padStart(2, "0");
      return `${yyyy}-${mm}`;
    }
  }

  return null;
}

function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }

  result.push(cur);
  return result.map((cell) => cell.trim());
}

function parseNumber(value) {
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function hashImportFromString(source) {
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function detectColumns(headers) {
  const normalized = headers.map(normalizeHeader);

  const find = (candidates) => {
    for (const candidate of candidates) {
      const idx = normalized.findIndex((h) => h.includes(candidate));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  return {
    title: find(["title", "book title", "asin title", "name"]),
    units: find(["net units sold", "units sold", "paid units", "units", "qty", "quantity", "ordered units"]),
    royalty: find(["royalty", "estimated earnings", "earnings", "amount", "revenue"]),
    date: find(["royalty date", "order date", "month", "transaction date", "date"]) 
  };
}

function rowsFromTable(tableRows, fileName) {
  if (!tableRows.length) {
    throw new Error(`No data rows found in ${fileName}.`);
  }

  const headers = tableRows[0].map((h) => String(h || "").trim());
  const cols = detectColumns(headers);

  if (cols.title < 0 || cols.royalty < 0 || cols.date < 0) {
    return [];
  }

  const parsed = [];
  for (let i = 1; i < tableRows.length; i += 1) {
    const row = tableRows[i] || [];
    const title = row[cols.title] || "";
    const month = toMonthKey(row[cols.date]);
    if (!title || !month) continue;

    parsed.push({
      sourceTitle: String(title).trim(),
      titleKey: normalizeTitle(title),
      units: cols.units >= 0 ? parseNumber(row[cols.units]) : 0,
      royalty: parseNumber(row[cols.royalty]),
      month
    });
  }

  return parsed;
}

async function parseCsvReport(file) {
  const raw = await file.text();
  if (!raw.trim()) {
    throw new Error("This CSV file is empty.");
  }

  const lines = raw.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV has no data rows.");
  }

  const tableRows = lines.map(parseCsvLine);
  const parsedRows = rowsFromTable(tableRows, file.name);

  if (!parsedRows.length) {
    throw new Error("Invalid CSV format. Required columns: Title, Royalty/Amount, and Date/Month.");
  }

  return {
    rows: parsedRows,
    importHash: hashImportFromString(lines.slice(0, 2000).join("\n")),
    fileName: file.name
  };
}

async function parseXlsxReport(file) {
  if (typeof XLSX === "undefined") {
    throw new Error("Spreadsheet parser failed to load. Refresh and try again.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });

  let parsedRows = [];
  const preferredSheets = workbook.SheetNames.filter((name) => normalizeHeader(name).includes("combined sales"));
  const sheetsToRead = preferredSheets.length ? preferredSheets : workbook.SheetNames;

  sheetsToRead.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false
    });

    if (!rows.length) return;
    parsedRows = parsedRows.concat(rowsFromTable(rows, `${file.name} / ${sheetName}`));
  });

  if (!parsedRows.length) {
    throw new Error("Invalid spreadsheet format. Could not find rows with Title, Royalty, and Date columns.");
  }

  const hashSeed = JSON.stringify(parsedRows.slice(0, 3000));
  return {
    rows: parsedRows,
    importHash: hashImportFromString(hashSeed),
    fileName: file.name
  };
}

export async function parseKdpCsv(file) {
  const name = String(file?.name || "").toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsxReport(file);
  }

  if (name.endsWith(".csv") || file.type.includes("csv") || !name.includes(".")) {
    return parseCsvReport(file);
  }

  throw new Error("Unsupported file type. Please import a CSV or Excel (.xlsx/.xls) report.");
}

export function detectDuplicateImport(state, importHash) {
  return state.imports.some((entry) => entry.importHash === importHash);
}

export function getUnknownTitles(parsedRows, books) {
  const known = new Set(books.map((b) => normalizeTitle(b.title)));
  const unknownKeys = new Map();

  parsedRows.forEach((r) => {
    if (!known.has(r.titleKey) && !unknownKeys.has(r.titleKey)) {
      unknownKeys.set(r.titleKey, r.sourceTitle);
    }
  });

  return Array.from(unknownKeys, ([titleKey, sourceTitle]) => ({ titleKey, sourceTitle }));
}

export function applyTitleMappings(parsedRows, mappings) {
  const map = new Map(Object.entries(mappings || {}));

  return parsedRows.map((r) => {
    const mapped = map.get(r.titleKey);
    if (mapped && String(mapped).trim()) {
      return {
        ...r,
        titleKey: normalizeTitle(mapped),
        sourceTitle: mapped
      };
    }
    return r;
  });
}

export function summarizeImport(rows) {
  const months = new Set(rows.map((r) => r.month));
  const titles = new Set(rows.map((r) => r.titleKey));
  const latestMonth = Array.from(months).sort().at(-1);

  return {
    latestMonth,
    affectedBooks: titles.size,
    rowsCount: rows.length
  };
}

export function aggregateSalesRows(rows, books) {
  const titleToBook = new Map(books.map((b) => [normalizeTitle(b.title), b.id]));

  const grouped = new Map();
  rows.forEach((row) => {
    const bookId = titleToBook.get(row.titleKey);
    if (!bookId) return;

    const key = `${bookId}::${row.month}`;
    const prev = grouped.get(key) || { bookId, month: row.month, units: 0, royalty: 0 };
    prev.units += row.units;
    prev.royalty += row.royalty;
    grouped.set(key, prev);
  });

  return Array.from(grouped.values());
}

export function normalizeBookTitle(title) {
  return normalizeTitle(title);
}
