import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPTY_BROWSER_STATE,
  type BrowserState,
  type GroupRecord,
  type SavedGroupRecord,
  type TabRecord,
  type WindowRecord,
  UI_PORT_NAME
} from "../../src/lib/browser-state";
import { formatUrl } from "../../src/lib/format-url";
import { BrandMark } from "./BrandMark";

const FALLBACK_FAVICON = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export function App() {
  const [browserState, setBrowserState] = useState<BrowserState>(EMPTY_BROWSER_STATE);
  const [savedGroups, setSavedGroups] = useState<SavedGroupRecord[]>([]);
  const [statusText, setStatusText] = useState("Loading browser state...");
  const [refreshing, setRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<"live" | "saved">("live");
  const [pendingGlobalAction, setPendingGlobalAction] = useState<"suspend" | "restore" | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(false);

  const refreshSavedGroups = useCallback(async () => {
    try {
      const nextSavedGroups = (await browser.runtime.sendMessage({ type: "GET_SAVED_GROUPS" })) as SavedGroupRecord[];
      if (isMountedRef.current) {
        setSavedGroups(nextSavedGroups);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setStatusText(`Saved groups failed to load: ${(error as Error).message}`);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let port: chrome.runtime.Port | null = null;
    isMountedRef.current = true;

    const applyBrowserState = (state: BrowserState) => {
      if (!active) {
        return;
      }

      setBrowserState(state);
      if (state.updatedAt) {
        setStatusText(`Updated ${new Date(state.updatedAt).toLocaleTimeString()}`);
      } else {
        setStatusText("Waiting for browser state...");
      }
    };

    const connect = () => {
      if (!active) {
        return;
      }

      port = browser.runtime.connect({ name: UI_PORT_NAME });

      const handleMessage = (message: unknown) => {
        const nextMessage = message as { type?: string; payload?: BrowserState };

        if (nextMessage?.type === "BROWSER_STATE_UPDATED" && nextMessage.payload) {
          applyBrowserState(nextMessage.payload);
        }
      };

      const handleDisconnect = () => {
        if (!active) {
          return;
        }

        setStatusText("Background connection lost. Reconnecting...");
        reconnectTimeoutRef.current = window.setTimeout(connect, 500);
      };

      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(handleDisconnect);
    };

    connect();

    void browser.runtime.sendMessage({ type: "GET_BROWSER_STATE" }).then((state) => {
      applyBrowserState(state as BrowserState);
    });
    void refreshSavedGroups();

    return () => {
      active = false;
      isMountedRef.current = false;

      if (reconnectTimeoutRef.current != null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      port?.disconnect();
    };
  }, [refreshSavedGroups]);

  const summary = browserState.windows.reduce(
    (accumulator, currentWindow) => {
      accumulator.windows += 1;
      accumulator.groups += currentWindow.groups.length;
      accumulator.tabs += currentWindow.tabCount;
      return accumulator;
    },
    { windows: 0, groups: 0, tabs: 0 }
  );
  const suspendableTabCount = browserState.windows.reduce(
    (count, windowRecord) =>
      count +
      windowRecord.ungroupedTabs.filter((tabRecord) => !tabRecord.suspended).length +
      windowRecord.groups.reduce(
        (groupCount, groupRecord) => groupCount + groupRecord.tabs.filter((tabRecord) => !tabRecord.suspended).length,
        0
      ),
    0
  );
  const restorableTabCount = browserState.windows.reduce(
    (count, windowRecord) =>
      count +
      windowRecord.ungroupedTabs.filter((tabRecord) => tabRecord.suspended).length +
      windowRecord.groups.reduce(
        (groupCount, groupRecord) => groupCount + groupRecord.tabs.filter((tabRecord) => tabRecord.suspended).length,
        0
      ),
    0
  );

  async function handleRefresh() {
    setRefreshing(true);
    setStatusText("Refreshing browser state...");

    try {
      await browser.runtime.sendMessage({ type: "REFRESH_BROWSER_STATE" });
    } catch (error) {
      setStatusText(`Refresh failed: ${(error as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (pendingGlobalAction === "suspend" && suspendableTabCount === 0) {
      setPendingGlobalAction(null);
    }

    if (pendingGlobalAction === "restore" && restorableTabCount === 0) {
      setPendingGlobalAction(null);
    }
  }, [pendingGlobalAction, restorableTabCount, suspendableTabCount]);

  async function handleSuspendAll() {
    setPendingGlobalAction("suspend");

    try {
      await browser.runtime.sendMessage({ type: "SUSPEND_ALL" });
    } finally {
      setPendingGlobalAction((current) => (current === "suspend" ? null : current));
    }
  }

  async function handleRestoreAll() {
    setPendingGlobalAction("restore");

    try {
      await browser.runtime.sendMessage({ type: "RESTORE_ALL" });
    } finally {
      setPendingGlobalAction((current) => (current === "restore" ? null : current));
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <BrandMark />
          <div>
            <p className="eyebrow">Tab Group Manager</p>
            <h1>Browser Overview</h1>
          </div>
        </div>
        <div className="app-header-actions">
          <button
            className="header-action"
            type="button"
            onClick={handleRestoreAll}
            disabled={pendingGlobalAction !== null || restorableTabCount === 0}
            data-pending={pendingGlobalAction === "restore" ? "true" : "false"}
          >
            {pendingGlobalAction === "restore" ? "Restoring..." : "Restore All"}
          </button>
          <button
            className="header-action"
            type="button"
            onClick={handleSuspendAll}
            disabled={pendingGlobalAction !== null || suspendableTabCount === 0}
            data-pending={pendingGlobalAction === "suspend" ? "true" : "false"}
          >
            {pendingGlobalAction === "suspend" ? "Suspending..." : "Suspend All"}
          </button>
          <button className="refresh-button" type="button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="summary-grid">
        <SummaryCard label="Windows" value={summary.windows} />
        <SummaryCard label="Groups" value={summary.groups} />
        <SummaryCard label="Tabs" value={summary.tabs} />
      </section>

      <section className="status-row">
        <span>{statusText}</span>
      </section>

      <section className="view-switcher" aria-label="Panel view">
        <button className="view-switcher-button" data-active={activeView === "live"} type="button" onClick={() => setActiveView("live")}>
          Live
        </button>
        <button className="view-switcher-button" data-active={activeView === "saved"} type="button" onClick={() => setActiveView("saved")}>
          Saved
        </button>
      </section>

      {activeView === "live" ? (
        <section className="window-list" aria-live="polite">
          {browserState.windows.length === 0 ? (
            <div className="empty-state">No browser windows found.</div>
          ) : (
            browserState.windows.map((windowRecord, index) => (
              <WindowCard
                key={windowRecord.id}
                index={index}
                windowRecord={windowRecord}
                savedGroups={savedGroups}
                onSavedGroupsChanged={refreshSavedGroups}
              />
            ))
          )}
        </section>
      ) : (
        <SavedGroupsView savedGroups={savedGroups} onSavedGroupsChanged={refreshSavedGroups} />
      )}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="summary-card">
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function WindowCard({
  index,
  windowRecord,
  savedGroups,
  onSavedGroupsChanged
}: {
  index: number;
  windowRecord: WindowRecord;
  savedGroups: SavedGroupRecord[];
  onSavedGroupsChanged: () => Promise<void>;
}) {
  return (
    <article className="window-card">
      <header className="window-header">
        <div>
          <h2 className="window-title">Window {index + 1}</h2>
          <p className="window-meta">
            {windowRecord.groupCount} groups • {windowRecord.tabCount} tabs
          </p>
        </div>
        <span className="window-badge">{windowRecord.focused ? "Active" : windowRecord.state || "Window"}</span>
      </header>

      <div className="group-list">
        {windowRecord.groups.map((groupRecord) => (
          <GroupCard
            key={groupRecord.id}
            groupRecord={groupRecord}
            savedGroups={savedGroups}
            onSavedGroupsChanged={onSavedGroupsChanged}
          />
        ))}
      </div>

      {windowRecord.ungroupedTabs.length > 0 ? (
        <div className="ungrouped-block">
          <h3>Ungrouped Tabs</h3>
          <div className="tab-list">
            {windowRecord.ungroupedTabs.map((tabRecord) => (
              <TabRow key={tabRecord.id} tabRecord={tabRecord} />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function GroupCard({
  groupRecord,
  savedGroups,
  onSavedGroupsChanged
}: {
  groupRecord: GroupRecord;
  savedGroups: SavedGroupRecord[];
  onSavedGroupsChanged: () => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"suspend" | "restore" | "save" | null>(null);
  const suspendableCount = groupRecord.tabs.filter((tabRecord) => !tabRecord.suspended).length;
  const restorableCount = groupRecord.tabs.filter((tabRecord) => tabRecord.suspended).length;
  const matchingSavedGroup = savedGroups.find((savedGroup) => savedGroup.title === groupRecord.title);
  const shouldHideSaveGroup = matchingSavedGroup ? doGroupTabsMatch(groupRecord, matchingSavedGroup) : false;
  const saveGroupLabel = matchingSavedGroup ? "Update Group" : "Save Group";

  useEffect(() => {
    if (pendingAction === "suspend" && suspendableCount === 0) {
      setPendingAction(null);
    }

    if (pendingAction === "restore" && restorableCount === 0) {
      setPendingAction(null);
    }
  }, [pendingAction, restorableCount, suspendableCount]);

  async function handleSuspendGroup() {
    setPendingAction("suspend");

    try {
      await browser.runtime.sendMessage({
        type: "SUSPEND_GROUP",
        groupId: groupRecord.id
      });
    } finally {
      setPendingAction((current) => (current === "suspend" ? null : current));
    }
  }

  async function handleRestoreGroup() {
    setPendingAction("restore");

    try {
      await browser.runtime.sendMessage({
        type: "RESTORE_GROUP",
        groupId: groupRecord.id
      });
    } finally {
      setPendingAction((current) => (current === "restore" ? null : current));
    }
  }

  async function handleSaveGroup() {
    setPendingAction("save");

    try {
      await browser.runtime.sendMessage({
        type: "SAVE_GROUP",
        groupId: groupRecord.id
      });
      await onSavedGroupsChanged();
    } finally {
      setPendingAction((current) => (current === "save" ? null : current));
    }
  }

  return (
    <section className="group-card">
      <header className="group-header">
        <div className="group-title-row">
          <span className={`group-color ${groupRecord.color}`} />
          <div>
            <h3 className="group-title">{groupRecord.title}</h3>
            <p className="group-meta">
              {groupRecord.tabCount} tabs{groupRecord.collapsed ? " • collapsed" : ""}
            </p>
          </div>
        </div>
        <div className="group-actions">
          {shouldHideSaveGroup ? null : (
            <button
              className="group-action"
              type="button"
              onClick={handleSaveGroup}
              disabled={pendingAction !== null}
              data-pending={pendingAction === "save" ? "true" : "false"}
            >
              {pendingAction === "save" ? `${saveGroupLabel === "Update Group" ? "Updating..." : "Saving..."}` : saveGroupLabel}
            </button>
          )}
          <button
            className="group-action"
            type="button"
            onClick={handleRestoreGroup}
            disabled={pendingAction !== null || restorableCount === 0}
            data-pending={pendingAction === "restore" ? "true" : "false"}
          >
            {pendingAction === "restore" ? "Restoring..." : "Restore Group"}
          </button>
          <button
            className="group-action"
            type="button"
            onClick={handleSuspendGroup}
            disabled={pendingAction !== null || suspendableCount === 0}
            data-pending={pendingAction === "suspend" ? "true" : "false"}
          >
            {pendingAction === "suspend" ? "Suspending..." : "Suspend Group"}
          </button>
        </div>
      </header>

      <div className="tab-list">
        {groupRecord.tabs.map((tabRecord) => (
          <TabRow key={tabRecord.id} tabRecord={tabRecord} />
        ))}
      </div>
    </section>
  );
}

function TabRow({ tabRecord }: { tabRecord: TabRecord }) {
  const flags = buildFlags(tabRecord);
  const [pending, setPending] = useState(false);
  const faviconUrl = getRenderableFaviconUrl(tabRecord.favIconUrl);

  async function handleAction() {
    setPending(true);

    try {
      await browser.runtime.sendMessage({
        type: tabRecord.suspended ? "RESTORE_TAB" : "SUSPEND_TAB",
        tabId: tabRecord.id
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="tab-row">
      <img
        className="tab-favicon"
        alt=""
        src={faviconUrl}
      />
      <div className="tab-copy">
        <p className="tab-title">{tabRecord.title}</p>
        <p className="tab-url">{formatUrl(tabRecord.url)}</p>
      </div>
      <div className="tab-controls">
        <div className="tab-flags">
          {flags.map((flag) => (
            <span className="flag" key={flag}>
              {flag}
            </span>
          ))}
        </div>
        <button className="tab-action" type="button" onClick={handleAction} disabled={pending} data-pending={pending ? "true" : "false"}>
          {pending ? (tabRecord.suspended ? "Restoring..." : "Suspending...") : tabRecord.suspended ? "Restore" : "Suspend"}
        </button>
      </div>
    </article>
  );
}

function buildFlags(tabRecord: TabRecord) {
  const flags: string[] = [];

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

  if (tabRecord.suspended) {
    flags.push("Suspended");
  }

  return flags;
}

function SavedGroupsView({
  savedGroups,
  onSavedGroupsChanged
}: {
  savedGroups: SavedGroupRecord[];
  onSavedGroupsChanged: () => Promise<void>;
}) {
  return (
    <section className="saved-groups-list" aria-live="polite">
      {savedGroups.length === 0 ? (
        <div className="empty-state">No saved groups yet. Save a live group to reopen it later.</div>
      ) : (
        savedGroups.map((savedGroup) => (
          <SavedGroupCard key={savedGroup.id} savedGroup={savedGroup} onSavedGroupsChanged={onSavedGroupsChanged} />
        ))
      )}
    </section>
  );
}

function SavedGroupCard({
  savedGroup,
  onSavedGroupsChanged
}: {
  savedGroup: SavedGroupRecord;
  onSavedGroupsChanged: () => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"open" | "delete" | null>(null);

  async function handleOpenGroup() {
    setPendingAction("open");

    try {
      await browser.runtime.sendMessage({
        type: "OPEN_SAVED_GROUP",
        savedGroupId: savedGroup.id
      });
    } finally {
      setPendingAction((current) => (current === "open" ? null : current));
    }
  }

  async function handleDeleteGroup() {
    setPendingAction("delete");

    try {
      await browser.runtime.sendMessage({
        type: "DELETE_SAVED_GROUP",
        savedGroupId: savedGroup.id
      });
      await onSavedGroupsChanged();
    } finally {
      setPendingAction((current) => (current === "delete" ? null : current));
    }
  }

  return (
    <article className="saved-group-card">
      <header className="saved-group-header">
        <div className="group-title-row">
          <span className={`group-color ${savedGroup.color}`} />
          <div>
            <h3 className="group-title">{savedGroup.title}</h3>
            <p className="group-meta">
              {savedGroup.tabCount} tabs • saved {new Date(savedGroup.savedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="group-actions">
          <button
            className="group-action"
            type="button"
            onClick={handleOpenGroup}
            disabled={pendingAction !== null}
            data-pending={pendingAction === "open" ? "true" : "false"}
          >
            {pendingAction === "open" ? "Opening..." : "Open Group"}
          </button>
          <button
            className="group-action"
            type="button"
            onClick={handleDeleteGroup}
            disabled={pendingAction !== null}
            data-pending={pendingAction === "delete" ? "true" : "false"}
          >
            {pendingAction === "delete" ? "Deleting..." : "Delete"}
          </button>
        </div>
      </header>

      <div className="tab-list">
        {savedGroup.tabs.map((savedTab, index) => (
          <article className="tab-row" key={`${savedGroup.id}-${index}`}>
            <img className="tab-favicon" alt="" src={getRenderableFaviconUrl(savedTab.favIconUrl)} />
            <div className="tab-copy">
              <p className="tab-title">{savedTab.title}</p>
              <p className="tab-url">{formatUrl(savedTab.url)}</p>
            </div>
            <div className="tab-controls">
              <div className="tab-flags">
                {savedTab.pinned ? <span className="flag">Pinned</span> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </article>
  );
}

function getRenderableFaviconUrl(favIconUrl: string) {
  if (!favIconUrl) {
    return FALLBACK_FAVICON;
  }

  if (
    favIconUrl.startsWith("chrome-extension://") ||
    favIconUrl.startsWith("chrome://") ||
    favIconUrl.startsWith("edge://") ||
    favIconUrl.startsWith("about:")
  ) {
    return FALLBACK_FAVICON;
  }

  return favIconUrl;
}

function doGroupTabsMatch(groupRecord: GroupRecord, savedGroup: SavedGroupRecord) {
  const liveTabs = groupRecord.tabs
    .map((tabRecord) => ({
      url: tabRecord.url,
      pinned: tabRecord.pinned
    }))
    .filter((tabRecord) => tabRecord.url);

  if (liveTabs.length !== savedGroup.tabs.length) {
    return false;
  }

  return liveTabs.every((liveTab, index) => {
    const savedTab = savedGroup.tabs[index];
    return savedTab && savedTab.url === liveTab.url && savedTab.pinned === liveTab.pinned;
  });
}
