const UI_PORT_NAME = "tab-group-manager-ui";

let browserStateCache = {
  updatedAt: null,
  windows: []
};

const connectedPorts = new Set();
let refreshScheduled = false;

chrome.runtime.onInstalled.addListener(async () => {
  await configureSidePanel();
  await refreshBrowserState();
});

chrome.runtime.onStartup.addListener(async () => {
  await configureSidePanel();
  await refreshBrowserState();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== UI_PORT_NAME) {
    return;
  }

  connectedPorts.add(port);
  port.postMessage({
    type: "BROWSER_STATE_UPDATED",
    payload: browserStateCache
  });

  port.onDisconnect.addListener(() => {
    connectedPorts.delete(port);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_BROWSER_STATE") {
    sendResponse(browserStateCache);
    return;
  }

  if (message?.type === "REFRESH_BROWSER_STATE") {
    refreshBrowserState()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.tabs.onCreated.addListener(scheduleRefresh);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (
    changeInfo.status === "complete" ||
    "title" in changeInfo ||
    "url" in changeInfo ||
    "groupId" in changeInfo ||
    "pinned" in changeInfo ||
    "favIconUrl" in changeInfo
  ) {
    scheduleRefresh();
  }
});
chrome.tabs.onRemoved.addListener(scheduleRefresh);
chrome.tabs.onMoved.addListener(scheduleRefresh);
chrome.tabs.onAttached.addListener(scheduleRefresh);
chrome.tabs.onDetached.addListener(scheduleRefresh);
chrome.tabs.onActivated.addListener(scheduleRefresh);

chrome.windows.onCreated.addListener(scheduleRefresh);
chrome.windows.onRemoved.addListener(scheduleRefresh);
chrome.windows.onFocusChanged.addListener(scheduleRefresh);

chrome.tabGroups.onCreated.addListener(scheduleRefresh);
chrome.tabGroups.onUpdated.addListener(scheduleRefresh);
chrome.tabGroups.onRemoved.addListener(scheduleRefresh);

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("Failed to configure side panel:", error);
  }
}

function scheduleRefresh() {
  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;

  queueMicrotask(async () => {
    refreshScheduled = false;

    try {
      await refreshBrowserState();
    } catch (error) {
      console.error("Failed to refresh browser state:", error);
    }
  });
}

async function refreshBrowserState() {
  const [windows, groups] = await Promise.all([
    chrome.windows.getAll({ populate: true }),
    chrome.tabGroups.query({})
  ]);

  const groupById = new Map(groups.map((group) => [group.id, group]));

  const normalizedWindows = windows
    .map((windowRecord) => normalizeWindow(windowRecord, groupById))
    .sort((left, right) => {
      if (left.focused === right.focused) {
        return left.id - right.id;
      }

      return left.focused ? -1 : 1;
    });

  browserStateCache = {
    updatedAt: Date.now(),
    windows: normalizedWindows
  };

  broadcastBrowserState();
}

function normalizeWindow(windowRecord, groupById) {
  const tabs = [...(windowRecord.tabs || [])].sort((left, right) => left.index - right.index);
  const groupedTabs = new Map();
  const ungroupedTabs = [];

  tabs.forEach((tab) => {
    const normalizedTab = normalizeTab(tab);

    if (tab.groupId != null && tab.groupId >= 0) {
      if (!groupedTabs.has(tab.groupId)) {
        groupedTabs.set(tab.groupId, []);
      }

      groupedTabs.get(tab.groupId).push(normalizedTab);
      return;
    }

    ungroupedTabs.push(normalizedTab);
  });

  const groups = [...groupedTabs.entries()]
    .map(([groupId, memberTabs]) => normalizeGroup(groupById.get(groupId), windowRecord.id, memberTabs))
    .sort((left, right) => left.sortIndex - right.sortIndex);

  return {
    id: windowRecord.id,
    focused: windowRecord.focused,
    state: windowRecord.state,
    type: windowRecord.type,
    groupCount: groups.length,
    tabCount: tabs.length,
    groups,
    ungroupedTabs
  };
}

function normalizeGroup(group, windowId, tabs) {
  const firstTab = tabs[0];

  return {
    id: group?.id ?? firstTab.groupId,
    windowId,
    title: group?.title || "Untitled group",
    color: group?.color || "grey",
    collapsed: Boolean(group?.collapsed),
    tabCount: tabs.length,
    sortIndex: firstTab.index,
    tabs
  };
}

function normalizeTab(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    groupId: tab.groupId,
    title: tab.title || "Untitled tab",
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || "",
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    discarded: Boolean(tab.discarded),
    status: tab.status || "unknown"
  };
}

function broadcastBrowserState() {
  const message = {
    type: "BROWSER_STATE_UPDATED",
    payload: browserStateCache
  };

  connectedPorts.forEach((port) => {
    try {
      port.postMessage(message);
    } catch (error) {
      console.error("Failed to post browser state update:", error);
    }
  });
}
