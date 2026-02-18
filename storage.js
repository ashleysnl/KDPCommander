const STORAGE_KEY = "kdp-command-center-v1";

const defaultState = {
  books: [],
  sales: [],
  imports: [],
  settings: {
    firstRunNoticeDismissed: false
  }
};

function safeClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return safeClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...safeClone(defaultState),
      ...parsed,
      settings: {
        ...safeClone(defaultState.settings),
        ...(parsed.settings || {})
      }
    };
  } catch {
    return safeClone(defaultState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportBackup(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kdp-command-center-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importBackupFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || !Array.isArray(parsed.books) || !Array.isArray(parsed.sales) || !Array.isArray(parsed.imports)) {
    throw new Error("Invalid backup format.");
  }

  return {
    ...safeClone(defaultState),
    ...parsed,
    settings: {
      ...safeClone(defaultState.settings),
      ...(parsed.settings || {})
    }
  };
}
