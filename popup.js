let currentTab = null;
let activeSection = "cookies";
let allItems = [];
let filterText = "";

// ── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  const url = new URL(tab.url);
  document.getElementById("domain").textContent = url.hostname;

  bindUI();
  await loadSection();
});

function bindUI() {
  // Tab switcher
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      activeSection = btn.dataset.tab;
      filterText = "";
      document.getElementById("filterInput").value = "";
      await loadSection();
    });
  });

  // Refresh
  document.getElementById("refreshBtn").addEventListener("click", loadSection);

  // Filter
  document.getElementById("filterInput").addEventListener("input", (e) => {
    filterText = e.target.value.toLowerCase();
    renderTable();
  });

  // Delete all
  document.getElementById("deleteAllBtn").addEventListener("click", async () => {
    const label = activeSection === "cookies" ? "cookies" : "local storage items";
    if (!confirm(`Delete all ${label} for this domain?`)) return;
    if (activeSection === "cookies") {
      await deleteAllCookies();
    } else {
      await execInTab(() => localStorage.clear());
    }
    await loadSection();
  });

  // Modal close / cancel
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Modal save
  document.getElementById("modalSave").addEventListener("click", saveEdit);
}

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadSection() {
  if (activeSection === "cookies") {
    allItems = await loadCookies();
  } else {
    allItems = await loadStorage();
  }
  renderTable();
}

async function loadCookies() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ url: currentTab.url }, (cookies) => {
      resolve(cookies || []);
    });
  });
}

async function loadStorage() {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          items.push({ key, value: localStorage.getItem(key) });
        }
        return items;
      },
    });
    return results[0]?.result || [];
  } catch {
    return [];
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderTable() {
  const thead = document.getElementById("tableHead");
  const tbody = document.getElementById("tableBody");
  const empty = document.getElementById("emptyState");

  // Headers
  if (activeSection === "cookies") {
    thead.innerHTML = `<tr>
      <th class="col-name">Name</th>
      <th class="col-value">Value</th>
      <th class="col-actions"></th>
    </tr>`;
  } else {
    thead.innerHTML = `<tr>
      <th class="col-name">Key</th>
      <th class="col-value">Value</th>
      <th class="col-actions"></th>
    </tr>`;
  }

  const filtered = allItems.filter((item) => {
    const key = activeSection === "cookies" ? item.name : item.key;
    return !filterText || key.toLowerCase().includes(filterText) ||
      (item.value || "").toLowerCase().includes(filterText);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = filtered.map((item) => {
    const key = activeSection === "cookies" ? item.name : item.key;
    const val = item.value || "";
    const safeKey = escHtml(key);
    const safeVal = escHtml(val);
    const idx = allItems.indexOf(item);

    return `<tr>
      <td class="col-name" title="${safeKey}">${safeKey}</td>
      <td class="col-value">
        <span class="val-text" title="${safeVal}">${safeVal || '<span style="color:#444">—</span>'}</span>
      </td>
      <td class="col-actions">
        <button class="btn-icon" title="Edit" data-action="edit" data-idx="${idx}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon btn-delete" title="Delete" data-action="delete" data-idx="${idx}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </td>
    </tr>`;
  }).join("");

  // Delegate events
  tbody.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === "edit") openModal(allItems[idx]);
      if (btn.dataset.action === "delete") deleteItem(allItems[idx]);
    });
  });
}

// ── Edit modal ────────────────────────────────────────────────────────────────

let editingItem = null;

function openModal(item) {
  editingItem = item;
  const isCookie = activeSection === "cookies";

  document.getElementById("modalTitle").textContent = isCookie ? "Edit Cookie" : "Edit Storage Item";
  document.getElementById("editName").value = isCookie ? item.name : item.key;
  document.getElementById("editValue").value = item.value || "";

  const extras = document.getElementById("cookieExtras");
  if (isCookie) {
    extras.style.display = "block";
    document.getElementById("editDomain").value = item.domain || "";
    document.getElementById("editPath").value = item.path || "/";
    document.getElementById("editSecure").checked = item.secure || false;
    document.getElementById("editHttpOnly").checked = item.httpOnly || false;
    document.getElementById("editSession").checked = !item.expirationDate;
  } else {
    extras.style.display = "none";
  }

  document.getElementById("modalOverlay").style.display = "flex";
  document.getElementById("editValue").focus();
}

function closeModal() {
  document.getElementById("modalOverlay").style.display = "none";
  editingItem = null;
}

async function saveEdit() {
  if (!editingItem) return;
  const newValue = document.getElementById("editValue").value;

  if (activeSection === "cookies") {
    const isSession = document.getElementById("editSession").checked;
    const details = {
      url: currentTab.url,
      name: editingItem.name,
      value: newValue,
      domain: editingItem.domain,
      path: editingItem.path || "/",
      secure: document.getElementById("editSecure").checked,
      httpOnly: editingItem.httpOnly,
      sameSite: editingItem.sameSite || "unspecified",
    };
    if (!isSession && editingItem.expirationDate) {
      details.expirationDate = editingItem.expirationDate;
    }
    await chrome.cookies.set(details);
  } else {
    const key = editingItem.key;
    await execInTab((k, v) => localStorage.setItem(k, v), [key, newValue]);
  }

  closeModal();
  await loadSection();
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteItem(item) {
  if (activeSection === "cookies") {
    const url = `http${item.secure ? "s" : ""}://${item.domain.replace(/^\./, "")}${item.path}`;
    await chrome.cookies.remove({ url, name: item.name });
  } else {
    await execInTab((k) => localStorage.removeItem(k), [item.key]);
  }
  await loadSection();
}

async function deleteAllCookies() {
  const cookies = await loadCookies();
  await Promise.all(
    cookies.map((c) => {
      const url = `http${c.secure ? "s" : ""}://${c.domain.replace(/^\./, "")}${c.path}`;
      return chrome.cookies.remove({ url, name: c.name });
    })
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function execInTab(func, args = []) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func,
      args,
    });
  } catch (e) {
    console.error("Script injection failed:", e);
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
