import {
  EMPTY_BROWSER_STATE,
  SUSPENDED_ROUTE,
  SUSPENDED_STORAGE_KEY,
  type BrowserState,
  type BrowserStateMessage,
  type SuspendedTabRecord,
  UI_PORT_NAME
} from "../../src/lib/browser-state";
import { buildBrowserState } from "../../src/lib/normalize-browser-state";

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

      if (message?.type === "RESTORE_TAB") {
        restoreTab(message.tabId)
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

    async function suspendTab(tabId: number) {
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
      await refreshBrowserState();
      return true;
    }

    async function restoreTab(tabId: number) {
      const tab = await browser.tabs.get(tabId);
      const fallbackUrl = getOriginalUrlFromSuspendedPage(tab.url);
      const storedRecord = await getSuspendedTabRecord(tabId);
      const originalUrl = storedRecord?.originalUrl || fallbackUrl;

      if (!originalUrl) {
        return false;
      }

      await browser.tabs.update(tabId, { url: originalUrl });
      await deleteSuspendedTabRecord(tabId);
      await refreshBrowserState();
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
      const result = await browser.storage.local.get(SUSPENDED_STORAGE_KEY);
      return (result[SUSPENDED_STORAGE_KEY] || {}) as Record<string, SuspendedTabRecord>;
    }

    async function getSuspendedTabRecord(tabId: number) {
      const store = await getSuspendedTabStore();
      return store[String(tabId)] || null;
    }

    async function saveSuspendedTabRecord(record: SuspendedTabRecord) {
      const store = await getSuspendedTabStore();
      store[String(record.tabId)] = record;
      await browser.storage.local.set({ [SUSPENDED_STORAGE_KEY]: store });
    }

    async function deleteSuspendedTabRecord(tabId: number) {
      const store = await getSuspendedTabStore();
      delete store[String(tabId)];
      await browser.storage.local.set({ [SUSPENDED_STORAGE_KEY]: store });
    }
  }
});
