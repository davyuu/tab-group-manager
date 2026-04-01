const windowList = document.getElementById("windowList");
const refreshButton = document.getElementById("refreshButton");
const statusText = document.getElementById("statusText");
const windowCount = document.getElementById("windowCount");
const groupCount = document.getElementById("groupCount");
const tabCount = document.getElementById("tabCount");

const windowTemplate = document.getElementById("windowTemplate");
const groupTemplate = document.getElementById("groupTemplate");
const tabTemplate = document.getElementById("tabTemplate");

let backgroundPort = null;

document.addEventListener("DOMContentLoaded", async () => {
  connectToBackground();
  refreshButton.addEventListener("click", handleRefresh);

  const initialState = await chrome.runtime.sendMessage({ type: "GET_BROWSER_STATE" });
  renderBrowserState(initialState);
});

function connectToBackground() {
  backgroundPort = chrome.runtime.connect({ name: "tab-group-manager-ui" });

  backgroundPort.onMessage.addListener((message) => {
    if (message?.type === "BROWSER_STATE_UPDATED") {
      renderBrowserState(message.payload);
    }
  });

  backgroundPort.onDisconnect.addListener(() => {
    statusText.textContent = "Background connection lost. Reconnecting…";
    window.setTimeout(connectToBackground, 500);
  });
}

async function handleRefresh() {
  refreshButton.disabled = true;
  statusText.textContent = "Refreshing browser state…";

  try {
    await chrome.runtime.sendMessage({ type: "REFRESH_BROWSER_STATE" });
  } catch (error) {
    statusText.textContent = `Refresh failed: ${error.message}`;
  } finally {
    refreshButton.disabled = false;
  }
}

function renderBrowserState(state) {
  const safeState = state || { windows: [], updatedAt: null };
  const windows = safeState.windows || [];

  const summary = windows.reduce(
    (accumulator, currentWindow) => {
      accumulator.windows += 1;
      accumulator.groups += currentWindow.groups.length;
      accumulator.tabs += currentWindow.tabCount;
      return accumulator;
    },
    { windows: 0, groups: 0, tabs: 0 }
  );

  windowCount.textContent = String(summary.windows);
  groupCount.textContent = String(summary.groups);
  tabCount.textContent = String(summary.tabs);

  if (safeState.updatedAt) {
    statusText.textContent = `Updated ${new Date(safeState.updatedAt).toLocaleTimeString()}`;
  } else {
    statusText.textContent = "Waiting for browser state…";
  }

  windowList.innerHTML = "";

  if (windows.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "No browser windows found.";
    windowList.appendChild(emptyState);
    return;
  }

  windows.forEach((windowRecord, index) => {
    const windowNode = windowTemplate.content.firstElementChild.cloneNode(true);
    const title = windowNode.querySelector(".window-title");
    const meta = windowNode.querySelector(".window-meta");
    const badge = windowNode.querySelector(".window-badge");
    const groupList = windowNode.querySelector(".group-list");
    const ungroupedBlock = windowNode.querySelector(".ungrouped-block");
    const ungroupedTabList = ungroupedBlock.querySelector(".tab-list");

    title.textContent = `Window ${index + 1}`;
    meta.textContent = `${windowRecord.groupCount} groups • ${windowRecord.tabCount} tabs`;
    badge.textContent = windowRecord.focused ? "Active" : windowRecord.state || "Window";

    windowRecord.groups.forEach((groupRecord) => {
      groupList.appendChild(renderGroup(groupRecord));
    });

    if (windowRecord.ungroupedTabs.length === 0) {
      ungroupedBlock.remove();
    } else {
      windowRecord.ungroupedTabs.forEach((tabRecord) => {
        ungroupedTabList.appendChild(renderTab(tabRecord));
      });
    }

    windowList.appendChild(windowNode);
  });
}

function renderGroup(groupRecord) {
  const groupNode = groupTemplate.content.firstElementChild.cloneNode(true);
  const color = groupNode.querySelector(".group-color");
  const title = groupNode.querySelector(".group-title");
  const meta = groupNode.querySelector(".group-meta");
  const tabListNode = groupNode.querySelector(".tab-list");

  color.classList.add(groupRecord.color);
  title.textContent = groupRecord.title;
  meta.textContent = `${groupRecord.tabCount} tabs${groupRecord.collapsed ? " • collapsed" : ""}`;

  groupRecord.tabs.forEach((tabRecord) => {
    tabListNode.appendChild(renderTab(tabRecord));
  });

  return groupNode;
}

function renderTab(tabRecord) {
  const tabNode = tabTemplate.content.firstElementChild.cloneNode(true);
  const favicon = tabNode.querySelector(".tab-favicon");
  const title = tabNode.querySelector(".tab-title");
  const url = tabNode.querySelector(".tab-url");
  const flags = tabNode.querySelector(".tab-flags");

  favicon.src = tabRecord.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  title.textContent = tabRecord.title;
  url.textContent = formatUrl(tabRecord.url);

  buildFlags(tabRecord).forEach((flagText) => {
    const flag = document.createElement("span");
    flag.className = "flag";
    flag.textContent = flagText;
    flags.appendChild(flag);
  });

  return tabNode;
}

function buildFlags(tabRecord) {
  const flags = [];

  if (tabRecord.active) {
    flags.push("Active");
  }

  if (tabRecord.pinned) {
    flags.push("Pinned");
  }

  if (tabRecord.audible) {
    flags.push("Audio");
  }

  if (tabRecord.discarded) {
    flags.push("Discarded");
  }

  return flags;
}

function formatUrl(rawUrl) {
  if (!rawUrl) {
    return "No URL";
  }

  try {
    const parsed = new URL(rawUrl);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch (_error) {
    return rawUrl;
  }
}
