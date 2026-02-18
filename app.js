import {
  loadState,
  saveState,
  resetState,
  exportBackup,
  importBackupFile
} from "./storage.js";
import {
  parseKdpCsv,
  detectDuplicateImport,
  getUnknownTitles,
  applyTitleMappings,
  summarizeImport,
  aggregateSalesRows,
  normalizeBookTitle
} from "./csvImport.js";
import { renderCharts } from "./charts.js";

const $ = (selector) => document.querySelector(selector);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

let state = loadState();

const el = {
  lifetimeRevenue: $("#lifetimeRevenue"),
  currentMonthRevenue: $("#currentMonthRevenue"),
  totalProfit: $("#totalProfit"),
  portfolioRoi: $("#portfolioRoi"),
  bestBook: $("#bestBook"),
  bestNiche: $("#bestNiche"),
  booksTableBody: $("#booksTableBody"),
  roiTableBody: $("#roiTableBody"),
  insightsList: $("#insightsList"),
  portfolioQuickStats: $("#portfolioQuickStats"),
  importStatus: $("#importStatus"),
  toast: $("#toast"),
  bookModal: $("#bookModal"),
  bookModalTitle: $("#bookModalTitle"),
  bookForm: $("#bookForm"),
  matchModal: $("#matchModal"),
  matchForm: $("#matchForm"),
  matchFields: $("#matchFields"),
  firstRunNotice: $("#firstRunNotice")
};

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function nowMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function persist() {
  saveState(state);
}

function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.style.background = isError ? "#8b1f1f" : "#0f2a4f";
  el.toast.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.toast.classList.remove("visible"), 3200);
}

function getBookMap() {
  return new Map(state.books.map((b) => [b.id, b]));
}

function getRevenueByBook() {
  const result = new Map();
  state.sales.forEach((s) => {
    result.set(s.bookId, (result.get(s.bookId) || 0) + s.royalty);
  });
  return result;
}

function getCostsByBook() {
  const result = new Map();
  state.books.forEach((b) => {
    result.set(b.id, Number(b.designCost || 0) + Number(b.marketingCost || 0));
  });
  return result;
}

function computeAnalytics() {
  const booksById = getBookMap();
  const revenueByBook = getRevenueByBook();
  const costsByBook = getCostsByBook();

  const lifetimeRevenue = Array.from(revenueByBook.values()).reduce((sum, v) => sum + v, 0);
  const totalInvestment = Array.from(costsByBook.values()).reduce((sum, v) => sum + v, 0);
  const totalProfit = lifetimeRevenue - totalInvestment;
  const portfolioRoi = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
  const currentMonth = nowMonthKey();
  const currentMonthRevenue = state.sales
    .filter((s) => s.month === currentMonth)
    .reduce((sum, s) => sum + s.royalty, 0);

  let bestBook = "-";
  let bestBookRevenue = -1;
  revenueByBook.forEach((rev, id) => {
    if (rev > bestBookRevenue) {
      bestBookRevenue = rev;
      bestBook = booksById.get(id)?.title || "-";
    }
  });

  const nicheRevenueMap = new Map();
  revenueByBook.forEach((rev, id) => {
    const niche = booksById.get(id)?.niche || "Uncategorized";
    nicheRevenueMap.set(niche, (nicheRevenueMap.get(niche) || 0) + rev);
  });

  const sortedNiches = Array.from(nicheRevenueMap.entries()).sort((a, b) => b[1] - a[1]);
  const bestNiche = sortedNiches.length ? sortedNiches[0][0] : "-";

  const monthMap = new Map();
  state.sales.forEach((s) => monthMap.set(s.month, (monthMap.get(s.month) || 0) + s.royalty));
  const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const bookRevenueSorted = Array.from(revenueByBook.entries())
    .map(([bookId, rev]) => ({ label: booksById.get(bookId)?.title || "Unknown", rev }))
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 15);

  const nicheRevenueSorted = Array.from(nicheRevenueMap.entries())
    .map(([label, rev]) => ({ label, rev }))
    .sort((a, b) => b.rev - a.rev);

  return {
    lifetimeRevenue,
    currentMonthRevenue,
    totalProfit,
    portfolioRoi,
    bestBook,
    bestNiche,
    totalInvestment,
    revenueByBook,
    costsByBook,
    monthLabels: sortedMonths.map(([m]) => monthLabel(m)),
    monthRevenue: sortedMonths.map(([, rev]) => rev),
    monthSeriesRaw: sortedMonths,
    bookLabels: bookRevenueSorted.map((d) => d.label),
    bookRevenue: bookRevenueSorted.map((d) => d.rev),
    nicheLabels: nicheRevenueSorted.map((d) => d.label),
    nicheRevenue: nicheRevenueSorted.map((d) => d.rev)
  };
}

function updateSummary(analytics) {
  el.lifetimeRevenue.textContent = money(analytics.lifetimeRevenue);
  el.currentMonthRevenue.textContent = money(analytics.currentMonthRevenue);
  el.totalProfit.textContent = money(analytics.totalProfit);
  el.portfolioRoi.textContent = `${analytics.portfolioRoi.toFixed(1)}%`;
  el.bestBook.textContent = analytics.bestBook;
  el.bestNiche.textContent = analytics.bestNiche;
}

function renderPortfolioStats() {
  const byNiche = state.books.reduce((acc, book) => {
    acc[book.niche] = (acc[book.niche] || 0) + 1;
    return acc;
  }, {});

  const nicheItems = Object.entries(byNiche)
    .sort((a, b) => b[1] - a[1])
    .map(([n, count]) => `<span class="pill">${n}: ${count}</span>`)
    .join("");

  el.portfolioQuickStats.innerHTML = `<span class="pill">Total books: ${state.books.length}</span>${nicheItems}`;
}

function renderBooksTable() {
  if (!state.books.length) {
    el.booksTableBody.innerHTML = `<tr><td colspan="7">No books yet. Add your first title to start tracking.</td></tr>`;
    return;
  }

  el.booksTableBody.innerHTML = state.books
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((book) => `
      <tr>
        <td><strong>${book.title}</strong>${book.series ? `<br /><small>${book.series}</small>` : ""}</td>
        <td>${book.niche}</td>
        <td>${book.format}</td>
        <td>${book.publishDate || "-"}</td>
        <td>${money(book.designCost || 0)}</td>
        <td>${money(book.marketingCost || 0)}</td>
        <td>
          <div class="actions-cell">
            <button class="ghost-btn" data-action="edit" data-id="${book.id}">Edit</button>
            <button class="ghost-btn" data-action="delete" data-id="${book.id}">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join("");
}

function renderRoiTable(analytics) {
  if (!state.books.length) {
    el.roiTableBody.innerHTML = `<tr><td colspan="6">Book ROI will appear here.</td></tr>`;
    return;
  }

  const rows = state.books.map((book) => {
    const investment = analytics.costsByBook.get(book.id) || 0;
    const revenue = analytics.revenueByBook.get(book.id) || 0;
    const profit = revenue - investment;
    const roi = investment > 0 ? (profit / investment) * 100 : (revenue > 0 ? 999 : 0);

    let status = "Not Profitable";
    let statusClass = "roi-bad";
    if (profit > 0) {
      status = "Profitable";
      statusClass = "roi-good";
    } else if (revenue > 0) {
      status = "Close";
      statusClass = "roi-warn";
    }

    return { book, investment, revenue, profit, roi, status, statusClass };
  });

  rows.sort((a, b) => b.profit - a.profit);

  el.roiTableBody.innerHTML = rows
    .map((r) => `
      <tr>
        <td>${r.book.title}</td>
        <td>${money(r.investment)}</td>
        <td>${money(r.revenue)}</td>
        <td>${money(r.profit)}</td>
        <td>${Number.isFinite(r.roi) ? `${r.roi.toFixed(1)}%` : "-"}</td>
        <td class="${r.statusClass}">${r.status}</td>
      </tr>
    `)
    .join("");
}

function buildInsights(analytics) {
  const insights = [];
  const totalRev = analytics.lifetimeRevenue;
  const booksById = getBookMap();

  if (totalRev > 0) {
    const bookShares = Array.from(analytics.revenueByBook.entries())
      .map(([bookId, rev]) => ({ book: booksById.get(bookId), share: rev / totalRev, rev }))
      .sort((a, b) => b.rev - a.rev);

    const topBook = bookShares[0];
    if (topBook && topBook.share > 0.4) {
      insights.push(`"${topBook.book?.title}" drives ${(topBook.share * 100).toFixed(1)}% of revenue. Focus upcoming books in this direction.`);
    }
  }

  const recent3 = Array.from(new Set(state.sales.map((s) => s.month))).sort().slice(-3);
  if (recent3.length === 3) {
    const salesByBookMonth = new Map();
    state.sales.forEach((s) => salesByBookMonth.set(`${s.bookId}:${s.month}`, (salesByBookMonth.get(`${s.bookId}:${s.month}`) || 0) + s.royalty));

    state.books.forEach((book) => {
      const total3 = recent3.reduce((sum, month) => sum + (salesByBookMonth.get(`${book.id}:${month}`) || 0), 0);
      if (total3 === 0) {
        insights.push(`"${book.title}" has zero sales over the last 3 months. Update listing, keywords, and cover.`);
      }
    });
  }

  if (analytics.nicheRevenue.length >= 2) {
    const top = analytics.nicheRevenue[0];
    const next = analytics.nicheRevenue[1] || 0;
    if (top >= next * 2 && top > 0) {
      insights.push(`Niche leader "${analytics.nicheLabels[0]}" is outperforming others by 2x+. Prioritize this niche for next launches.`);
    }
  }

  if (analytics.monthSeriesRaw.length >= 3) {
    const last3 = analytics.monthSeriesRaw.slice(-3).map(([, rev]) => rev);
    const isGrowing = last3[2] > last3[1] && last3[1] > last3[0];
    if (isGrowing) {
      insights.push("Portfolio revenue is rising for 3 consecutive months. You have momentum; increase publishing cadence.");
    }
  }

  if (!insights.length) {
    insights.push("Import another month of KDP data to unlock stronger trend-based recommendations.");
  }

  el.insightsList.innerHTML = insights.map((item) => `<li>${item}</li>`).join("");
}

function render() {
  renderBooksTable();
  renderPortfolioStats();
  const analytics = computeAnalytics();
  updateSummary(analytics);
  renderRoiTable(analytics);
  buildInsights(analytics);
  renderCharts(analytics);
}

function openBookModal(book) {
  el.bookModalTitle.textContent = book ? "Edit Book" : "Add Book";
  $("#bookId").value = book?.id || "";
  $("#title").value = book?.title || "";
  $("#series").value = book?.series || "";
  $("#niche").value = book?.niche || "";
  $("#format").value = book?.format || "Paperback";
  $("#publishDate").value = book?.publishDate || "";
  $("#designCost").value = Number(book?.designCost || 0) || "";
  $("#marketingCost").value = Number(book?.marketingCost || 0) || "";
  el.bookModal.showModal();
}

function upsertBookFromForm() {
  const id = $("#bookId").value || uid();
  const book = {
    id,
    title: $("#title").value.trim(),
    series: $("#series").value.trim(),
    niche: $("#niche").value.trim(),
    format: $("#format").value,
    publishDate: $("#publishDate").value,
    designCost: Number($("#designCost").value || 0),
    marketingCost: Number($("#marketingCost").value || 0)
  };

  if (!book.title || !book.niche || !book.publishDate) {
    throw new Error("Please complete all required book fields.");
  }

  const index = state.books.findIndex((b) => b.id === id);
  if (index >= 0) state.books[index] = book;
  else state.books.push(book);

  persist();
  render();
}

function deleteBook(bookId) {
  if (!confirm("Delete this book? Associated sales data will also be removed.")) return;
  state.books = state.books.filter((b) => b.id !== bookId);
  state.sales = state.sales.filter((s) => s.bookId !== bookId);
  persist();
  render();
  toast("Book deleted.");
}

function mergeAggregatedSales(aggregatedRows, importHash) {
  const key = (s) => `${s.bookId}::${s.month}`;
  const salesMap = new Map(state.sales.map((s) => [key(s), s]));

  aggregatedRows.forEach((row) => {
    const k = `${row.bookId}::${row.month}`;
    const existing = salesMap.get(k);
    if (existing) {
      existing.units += row.units;
      existing.royalty += row.royalty;
      existing.sourceImports = Array.from(new Set([...(existing.sourceImports || []), importHash]));
    } else {
      state.sales.push({
        id: uid(),
        bookId: row.bookId,
        month: row.month,
        units: row.units,
        royalty: row.royalty,
        sourceImports: [importHash]
      });
    }
  });
}

function promptMatchAndCreateBooks(unknownTitles) {
  const existingOptions = state.books
    .map((b) => `<option value="${b.id}">${b.title}</option>`)
    .join("");

  el.matchFields.innerHTML = `
    <label>Default niche for new books <input id="newBookNiche" value="Uncategorized" required /></label>
    <label>Default format for new books
      <select id="newBookFormat">
        <option value="Paperback">Paperback</option>
        <option value="eBook">eBook</option>
        <option value="Hardcover">Hardcover</option>
      </select>
    </label>
    ${unknownTitles
      .map((u, idx) => `
      <fieldset>
        <legend>${u.sourceTitle}</legend>
        <label>
          Action
          <select data-key="${u.titleKey}" class="title-action" data-index="${idx}">
            <option value="create">Create new book</option>
            ${state.books.length ? `<option value="map">Map to existing book</option>` : ""}
          </select>
        </label>
        <label class="map-select" data-index="${idx}" hidden>
          Existing book
          <select class="map-book" data-key="${u.titleKey}">
            ${existingOptions}
          </select>
        </label>
      </fieldset>
    `)
      .join("")}
  `;

  el.matchFields.querySelectorAll(".title-action").forEach((select) => {
    select.addEventListener("change", (evt) => {
      const idx = evt.target.dataset.index;
      const wrap = el.matchFields.querySelector(`.map-select[data-index='${idx}']`);
      if (wrap) wrap.hidden = evt.target.value !== "map";
    });
  });

  return new Promise((resolve, reject) => {
    const onSubmit = (evt) => {
      evt.preventDefault();
      const mappings = {};
      const niche = el.matchFields.querySelector("#newBookNiche").value.trim() || "Uncategorized";
      const format = el.matchFields.querySelector("#newBookFormat").value || "Paperback";

      unknownTitles.forEach((u, idx) => {
        const action = el.matchFields.querySelector(`.title-action[data-index='${idx}']`)?.value;
        if (action === "map") {
          const mappedBookId = el.matchFields.querySelector(`.map-book[data-key='${u.titleKey}']`)?.value;
          const mappedBook = state.books.find((b) => b.id === mappedBookId);
          if (mappedBook) mappings[u.titleKey] = mappedBook.title;
        } else {
          const title = u.sourceTitle.trim();
          if (!state.books.some((b) => normalizeBookTitle(b.title) === normalizeBookTitle(title))) {
            state.books.push({
              id: uid(),
              title,
              series: "",
              niche,
              format,
              publishDate: new Date().toISOString().slice(0, 10),
              designCost: 0,
              marketingCost: 0
            });
          }
          mappings[u.titleKey] = title;
        }
      });

      cleanup();
      el.matchModal.close();
      resolve(mappings);
    };

    const onCancel = () => {
      cleanup();
      el.matchModal.close();
      reject(new Error("Import cancelled. Unmatched titles were not mapped."));
    };

    function cleanup() {
      el.matchForm.removeEventListener("submit", onSubmit);
      $("#cancelMatchBtn").removeEventListener("click", onCancel);
    }

    el.matchForm.addEventListener("submit", onSubmit);
    $("#cancelMatchBtn").addEventListener("click", onCancel);
    el.matchModal.showModal();
  });
}

async function importCsvFile(file) {
  try {
    const parsed = await parseKdpCsv(file);

    if (detectDuplicateImport(state, parsed.importHash)) {
      throw new Error("This report appears to be already imported. Duplicate import prevented.");
    }

    let rows = parsed.rows;
    const unknown = getUnknownTitles(rows, state.books);

    if (unknown.length) {
      const mappings = await promptMatchAndCreateBooks(unknown);
      rows = applyTitleMappings(rows, mappings);
    }

    const aggregated = aggregateSalesRows(rows, state.books);
    if (!aggregated.length) {
      throw new Error("No rows matched your portfolio books. Import aborted.");
    }

    mergeAggregatedSales(aggregated, parsed.importHash);

    const summary = summarizeImport(rows);
    state.imports.push({
      id: uid(),
      importHash: parsed.importHash,
      fileName: parsed.fileName,
      importedAt: new Date().toISOString(),
      latestMonth: summary.latestMonth,
      affectedBooks: summary.affectedBooks,
      rowsCount: summary.rowsCount
    });

    persist();
    render();

    const readableMonth = summary.latestMonth ? monthLabel(summary.latestMonth) : "Unknown period";
    const message = `${readableMonth} imported - ${summary.affectedBooks} books updated`;
    el.importStatus.textContent = message;
    toast(message);
  } catch (err) {
    el.importStatus.textContent = err.message;
    toast(err.message, true);
  }
}

function wireEvents() {
  $("#addBookBtn").addEventListener("click", () => openBookModal());
  $("#cancelBookBtn").addEventListener("click", () => el.bookModal.close());

  el.bookForm.addEventListener("submit", (evt) => {
    evt.preventDefault();
    try {
      upsertBookFromForm();
      el.bookModal.close();
      toast("Book saved.");
    } catch (err) {
      toast(err.message, true);
    }
  });

  el.booksTableBody.addEventListener("click", (evt) => {
    const btn = evt.target.closest("button[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "edit") {
      const book = state.books.find((b) => b.id === id);
      if (book) openBookModal(book);
    }
    if (action === "delete") deleteBook(id);
  });

  const csvInput = $("#csvInput");
  $("#browseCsvBtn").addEventListener("click", (evt) => {
    evt.preventDefault();
    csvInput.click();
  });
  csvInput.addEventListener("change", (evt) => {
    const [file] = evt.target.files || [];
    if (file) importCsvFile(file);
    csvInput.value = "";
  });

  const dropzone = $("#dropzone");
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (evt) => {
      evt.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (evt) => {
      evt.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (evt) => {
    const [file] = evt.dataTransfer.files || [];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!(lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
      toast("Only CSV or Excel (.xlsx/.xls) files are supported for report import.", true);
      return;
    }
    importCsvFile(file);
  });

  $("#exportBackupBtn").addEventListener("click", () => {
    exportBackup(state);
    toast("Backup exported.");
  });

  $("#importBackupInput").addEventListener("change", async (evt) => {
    const [file] = evt.target.files || [];
    if (!file) return;

    try {
      state = await importBackupFile(file);
      persist();
      render();
      toast("Backup restored successfully.");
    } catch (err) {
      toast(`Backup import failed: ${err.message}`, true);
    }

    evt.target.value = "";
  });

  $("#resetDataBtn").addEventListener("click", () => {
    if (!confirm("Delete all books, imports, and analytics data?")) return;
    resetState();
    state = loadState();
    render();
    toast("All local data reset.");
  });

  $("#dismissNoticeBtn").addEventListener("click", () => {
    state.settings.firstRunNoticeDismissed = true;
    persist();
    el.firstRunNotice.hidden = true;
  });
}

function renderFirstRunNotice() {
  el.firstRunNotice.hidden = Boolean(state.settings.firstRunNoticeDismissed);
}

function init() {
  wireEvents();
  renderFirstRunNotice();
  render();
}

init();
