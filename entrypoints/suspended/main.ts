import "./style.css";

const root = document.getElementById("root") as HTMLDivElement;

const params = new URLSearchParams(window.location.search);
const title = params.get("title") || "Suspended Tab";
const originalUrl = params.get("url") || "";
const capturedAt = Number(params.get("capturedAt"));

document.title = title;

root.innerHTML = `
  <main class="suspended-shell">
    <p class="eyebrow">Tab Group Manager</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="page-url">${escapeHtml(originalUrl)}</p>
    <p class="captured-at">${
      Number.isFinite(capturedAt) && capturedAt > 0
        ? `Suspended ${new Date(capturedAt).toLocaleString()}`
        : "Suspended recently"
    }</p>
    <p class="restore-hint">Refresh this tab to restore the original page, or use the button below.</p>
    <button id="restoreButton" class="restore-button" type="button">Load Original Page</button>
  </main>
`;

document.getElementById("restoreButton")?.addEventListener("click", handleRestore);
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void handleRestore();
  }
});

if (wasLoadedByManualRefresh()) {
  void handleRestore();
}

async function handleRestore() {
  const currentTab = await browser.tabs.getCurrent();

  if (!currentTab?.id) {
    return;
  }

  const button = document.getElementById("restoreButton") as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
    button.textContent = "Restoring...";
  }

  try {
    await browser.runtime.sendMessage({
      type: "RESTORE_TAB",
      tabId: currentTab.id
    });
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = `Restore failed`;
    }
    console.error(error);
  }
}

function wasLoadedByManualRefresh() {
  const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

  if (navigationEntry) {
    return navigationEntry.type === "reload";
  }

  return performance.navigation.type === performance.navigation.TYPE_RELOAD;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
