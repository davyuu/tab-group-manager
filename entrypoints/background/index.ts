import { EMPTY_BROWSER_STATE, type BrowserState, type BrowserStateMessage, UI_PORT_NAME } from "../../src/lib/browser-state";
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

        browserStateCache = buildBrowserState(windows, groups);
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
  }
});
