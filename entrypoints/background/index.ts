import {
  EMPTY_BROWSER_STATE,
  SUSPENDED_ROUTE,
  type BrowserState,
  type BrowserStateMessage,
  type SavedGroupRecord,
  type SuspendedTabRecord,
  UI_PORT_NAME
} from "../../src/lib/browser-state";
import { buildBrowserState } from "../../src/lib/normalize-browser-state";
import { savedGroupsItem, suspendedTabsItem } from "../../src/lib/storage";

export default defineBackground({
  type: "module",
  main() {
    let browserStateCache: BrowserState = EMPTY_BROWSER_STATE;
    const connectedPorts = new Set<chrome.runtime.Port>();
    let refreshScheduled = false;

    browser.runtime.onInstalled.addListener(() => {
      void configureSidePanel();
      void refreshBrowserState();
    });

    browser.runtime.onStartup.addListener(() => {
      void configureSidePanel();
      void refreshBrowserState();
    });

    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== UI_PORT_NAME) {
        return;
      }

      connectedPorts.add(port);
      port.postMessage({
        type: "BROWSER_STATE_UPDATED",
        payload: browserStateCache
      } satisfies BrowserStateMessage);

      port.onDisconnect.addListener(() => {
        connectedPorts.delete(port);
      });
    });

    browser.runtime.onMessage.addListener((message: BrowserStateMessage, _sender, sendResponse) => {
      if (message?.type === "GET_BROWSER_STATE") {
        sendResponse(browserStateCache);
        return;
      }

      if (message?.type === "GET_SAVED_GROUPS") {
        getSavedGroups()
          .then((savedGroups) => sendResponse(savedGroups))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "REFRESH_BROWSER_STATE") {
        refreshBrowserState()
          .then(() => sendResponse({ ok: true }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "SUSPEND_TAB") {
        suspendTab(message.tabId)
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "SUSPEND_GROUP") {
        suspendGroup(message.groupId)
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "SUSPEND_ALL") {
        suspendAllTabs()
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "RESTORE_GROUP") {
        restoreGroup(message.groupId)
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "RESTORE_ALL") {
        restoreAllTabs()
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "RESTORE_TAB") {
        restoreTab(message.tabId)
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "SAVE_GROUP") {
        saveGroup(message.groupId)
          .then((savedGroup) => sendResponse({ ok: true, savedGroup }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "OPEN_SAVED_GROUP") {
        openSavedGroup(message.savedGroupId)
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }

      if (message?.type === "DELETE_SAVED_GROUP") {
        deleteSavedGroup(message.savedGroupId)
          .then((result) => sendResponse({ ok: result }))
          .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }
    });

    browser.tabs.onCreated.addListener(scheduleRefresh);
    browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
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
    browser.tabs.onRemoved.addListener(scheduleRefresh);
    browser.tabs.onMoved.addListener(scheduleRefresh);
    browser.tabs.onAttached.addListener(scheduleRefresh);
    browser.tabs.onDetached.addListener(scheduleRefresh);
    browser.tabs.onActivated.addListener(scheduleRefresh);

    browser.windows.onCreated.addListener(scheduleRefresh);
    browser.windows.onRemoved.addListener(scheduleRefresh);
    browser.windows.onFocusChanged.addListener(scheduleRefresh);

    browser.tabGroups.onCreated.addListener(scheduleRefresh);
    browser.tabGroups.onUpdated.addListener(scheduleRefresh);
    browser.tabGroups.onRemoved.addListener(scheduleRefresh);

    void configureSidePanel();
    void refreshBrowserState();

    async function configureSidePanel() {
      if (!browser.sidePanel?.setPanelBehavior) {
        return;
      }

      try {
        await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      } catch (error) {
        console.error("Failed to configure side panel:", error);
      }
    }

    function scheduleRefresh() {
      if (refreshScheduled) {
        return;
      }

      refreshScheduled = true;

      queueMicrotask(() => {
        refreshScheduled = false;
        void refreshBrowserState();
      });
    }

    async function refreshBrowserState() {
      try {
        const [windows, groups] = await Promise.all([
          browser.windows.getAll({ populate: true }),
          browser.tabGroups.query({})
        ]);

        const suspendedTabStore = await getSuspendedTabStore();
        browserStateCache = buildBrowserState(windows, groups, suspendedTabStore);
        broadcastBrowserState();
      } catch (error) {
        console.error("Failed to refresh browser state:", error);
      }
    }

    function broadcastBrowserState() {
      const message: BrowserStateMessage = {
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

    async function suspendTab(tabId: number, options?: { refreshAfter?: boolean }) {
      const tab = await browser.tabs.get(tabId);

      if (!canSuspendTab(tab)) {
        return false;
      }

      const record: SuspendedTabRecord = {
        tabId: tab.id!,
        originalUrl: tab.url || "",
        originalTitle: tab.title || "Suspended Tab",
        originalFavIconUrl: tab.favIconUrl || "",
        windowId: tab.windowId,
        groupId: tab.groupId ?? -1,
        index: tab.index,
        capturedAt: Date.now()
      };

      await saveSuspendedTabRecord(record);

      const params = new URLSearchParams({
        tabId: String(record.tabId),
        url: record.originalUrl,
        title: record.originalTitle,
        favicon: record.originalFavIconUrl,
        capturedAt: String(record.capturedAt)
      });

      const suspendedUrl = browser.runtime.getURL(`/${SUSPENDED_ROUTE}?${params.toString()}`);
      await browser.tabs.update(tabId, { url: suspendedUrl });
      if (options?.refreshAfter !== false) {
        await refreshBrowserState();
      }
      return true;
    }

    async function suspendGroup(groupId: number) {
      const tabsInGroup = await browser.tabs.query({ groupId });
      const suspendableTabs = tabsInGroup.filter(canSuspendTab);

      if (suspendableTabs.length === 0) {
        return false;
      }

      for (const tab of suspendableTabs) {
        await suspendTab(tab.id!, { refreshAfter: false });
      }

      await refreshBrowserState();
      return true;
    }

    async function suspendAllTabs() {
      const allTabs = await browser.tabs.query({});
      const suspendableTabs = allTabs.filter(canSuspendTab);

      if (suspendableTabs.length === 0) {
        return false;
      }

      for (const tab of suspendableTabs) {
        await suspendTab(tab.id!, { refreshAfter: false });
      }

      await refreshBrowserState();
      return true;
    }

    async function restoreTab(tabId: number, options?: { refreshAfter?: boolean }) {
      const tab = await browser.tabs.get(tabId);
      const fallbackUrl = getOriginalUrlFromSuspendedPage(tab.url);
      const storedRecord = await getSuspendedTabRecord(tabId);
      const originalUrl = storedRecord?.originalUrl || fallbackUrl;

      if (!originalUrl) {
        return false;
      }

      await browser.tabs.update(tabId, { url: originalUrl });
      await deleteSuspendedTabRecord(tabId);
      if (options?.refreshAfter !== false) {
        await refreshBrowserState();
      }
      return true;
    }

    async function restoreGroup(groupId: number) {
      const tabsInGroup = await browser.tabs.query({ groupId });
      const suspendedTabs = tabsInGroup.filter((tab) => isSuspendedPage(tab.url));

      if (suspendedTabs.length === 0) {
        return false;
      }

      for (const tab of suspendedTabs) {
        await restoreTab(tab.id!, { refreshAfter: false });
      }

      await refreshBrowserState();
      return true;
    }

    async function restoreAllTabs() {
      const allTabs = await browser.tabs.query({});
      const suspendedTabs = allTabs.filter((tab) => isSuspendedPage(tab.url));

      if (suspendedTabs.length === 0) {
        return false;
      }

      for (const tab of suspendedTabs) {
        await restoreTab(tab.id!, { refreshAfter: false });
      }

      await refreshBrowserState();
      return true;
    }

    async function saveGroup(groupId: number) {
      const [group, tabsInGroup, suspendedTabStore] = await Promise.all([
        browser.tabGroups.get(groupId),
        browser.tabs.query({ groupId }),
        getSuspendedTabStore()
      ]);

      const savedTabs = tabsInGroup
        .map((tab) => buildSavedGroupTab(tab, suspendedTabStore[String(tab.id ?? "")]))
        .filter((tab): tab is NonNullable<typeof tab> => tab !== null);

      if (savedTabs.length === 0) {
        throw new Error("This group has no savable tabs.");
      }

      const savedGroup: SavedGroupRecord = {
        id: crypto.randomUUID(),
        title: group.title || "Untitled group",
        color: group.color || "grey",
        tabCount: savedTabs.length,
        savedAt: Date.now(),
        tabs: savedTabs
      };

      const savedGroups = await getSavedGroups();
      const duplicateSavedGroups = savedGroups.filter((savedGroupRecord) => savedGroupRecord.title === savedGroup.title);
      const existingSavedGroup = duplicateSavedGroups[0];
      const nextSavedGroup = existingSavedGroup
        ? {
            ...savedGroup,
            id: existingSavedGroup.id
          }
        : savedGroup;

      const nextSavedGroups = [
        nextSavedGroup,
        ...savedGroups.filter((savedGroupRecord) => savedGroupRecord.title !== savedGroup.title)
      ];

      await savedGroupsItem.setValue(nextSavedGroups.slice(0, 50));

      return nextSavedGroup;
    }

    async function openSavedGroup(savedGroupId: string) {
      const savedGroups = await getSavedGroups();
      const savedGroup = savedGroups.find((group) => group.id === savedGroupId);

      if (!savedGroup || savedGroup.tabs.length === 0) {
        return false;
      }

      const currentWindow = await browser.windows.getCurrent();
      const createdTabs: chrome.tabs.Tab[] = [];

      for (const [index, savedTab] of savedGroup.tabs.entries()) {
        const createdTab = await browser.tabs.create({
          windowId: currentWindow.id,
          url: savedTab.url,
          pinned: savedTab.pinned,
          active: index === 0
        });

        createdTabs.push(createdTab);
      }

      const tabIds = createdTabs
        .map((tab) => tab.id)
        .filter((tabId): tabId is number => typeof tabId === "number");

      if (tabIds.length > 0) {
        const groupTabIds = [tabIds[0], ...tabIds.slice(1)] as [number, ...number[]];
        const restoredGroupId = await browser.tabs.group({ tabIds: groupTabIds });
        await browser.tabGroups.update(restoredGroupId, {
          title: savedGroup.title,
          color: savedGroup.color as `${chrome.tabGroups.Color}`
        });
      }

      await refreshBrowserState();
      return true;
    }

    async function deleteSavedGroup(savedGroupId: string) {
      const savedGroups = await getSavedGroups();
      const nextSavedGroups = savedGroups.filter((group) => group.id !== savedGroupId);

      if (nextSavedGroups.length === savedGroups.length) {
        return false;
      }

      await savedGroupsItem.setValue(nextSavedGroups);
      return true;
    }

    function canSuspendTab(tab: chrome.tabs.Tab) {
      if (!tab.id || !tab.url) {
        return false;
      }

      if (isInternalPage(tab.url)) {
        return false;
      }

      if (isSuspendedPage(tab.url)) {
        return false;
      }

      return true;
    }

    function isInternalPage(url: string) {
      return (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("edge://") ||
        url.startsWith("about:")
      );
    }

    function isSuspendedPage(url?: string) {
      if (!url) {
        return false;
      }

      return url.startsWith(browser.runtime.getURL(`/${SUSPENDED_ROUTE}`));
    }

    function getOriginalUrlFromSuspendedPage(url?: string) {
      try {
        return url ? new URL(url).searchParams.get("url") || "" : "";
      } catch (_error) {
        return "";
      }
    }

    async function getSuspendedTabStore() {
      return suspendedTabsItem.getValue();
    }

    async function getSavedGroups() {
      return savedGroupsItem.getValue();
    }

    async function getSuspendedTabRecord(tabId: number) {
      const store = await getSuspendedTabStore();
      return store[String(tabId)] || null;
    }

    async function saveSuspendedTabRecord(record: SuspendedTabRecord) {
      const store = await getSuspendedTabStore();
      store[String(record.tabId)] = record;
      await suspendedTabsItem.setValue(store);
    }

    async function deleteSuspendedTabRecord(tabId: number) {
      const store = await getSuspendedTabStore();
      delete store[String(tabId)];
      await suspendedTabsItem.setValue(store);
    }

    function buildSavedGroupTab(tab: chrome.tabs.Tab, suspendedRecord?: SuspendedTabRecord) {
      const sourceUrl = isSuspendedPage(tab.url) ? suspendedRecord?.originalUrl || "" : tab.url || "";
      if (!sourceUrl || isInternalPage(sourceUrl)) {
        return null;
      }

      return {
        title: isSuspendedPage(tab.url) ? suspendedRecord?.originalTitle || tab.title || "Untitled tab" : tab.title || "Untitled tab",
        url: sourceUrl,
        favIconUrl: isSuspendedPage(tab.url) ? suspendedRecord?.originalFavIconUrl || "" : tab.favIconUrl || "",
        pinned: Boolean(tab.pinned)
      };
    }
  }
});
