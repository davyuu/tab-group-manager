import { useEffect, useMemo, useState } from "react";

import { EMPTY_BROWSER_STATE, type BrowserState, type GroupRecord, type TabRecord, type WindowRecord, UI_PORT_NAME } from "../../src/lib/browser-state";
import { formatUrl } from "../../src/lib/format-url";

export function App() {
  const [browserState, setBrowserState] = useState<BrowserState>(EMPTY_BROWSER_STATE);
  const [statusText, setStatusText] = useState("Loading browser state...");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let reconnectTimeout: number | undefined;
    let port: chrome.runtime.Port | null = null;

    const connect = () => {
      port = browser.runtime.connect({ name: UI_PORT_NAME });

      port.onMessage.addListener((message: unknown) => {
        const nextMessage = message as { type?: string; payload?: BrowserState };

        if (nextMessage?.type === "BROWSER_STATE_UPDATED" && nextMessage.payload) {
          applyBrowserState(nextMessage.payload);
        }
      });

      port.onDisconnect.addListener(() => {
        setStatusText("Background connection lost. Reconnecting...");
        reconnectTimeout = window.setTimeout(connect, 500);
      });
    };

    const applyBrowserState = (state: BrowserState) => {
      setBrowserState(state);
      if (state.updatedAt) {
        setStatusText(`Updated ${new Date(state.updatedAt).toLocaleTimeString()}`);
      } else {
        setStatusText("Waiting for browser state...");
      }
    };

    connect();

    void browser.runtime.sendMessage({ type: "GET_BROWSER_STATE" }).then((state) => {
      applyBrowserState(state as BrowserState);
    });

    return () => {
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      port?.disconnect();
    };
  }, []);

  const summary = useMemo(() => {
    return browserState.windows.reduce(
      (accumulator, currentWindow) => {
        accumulator.windows += 1;
        accumulator.groups += currentWindow.groups.length;
        accumulator.tabs += currentWindow.tabCount;
        return accumulator;
      },
      { windows: 0, groups: 0, tabs: 0 }
    );
  }, [browserState.windows]);

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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Tab Group Manager</p>
          <h1>Browser Overview</h1>
        </div>
        <button className="refresh-button" type="button" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <section className="summary-grid">
        <SummaryCard label="Windows" value={summary.windows} />
        <SummaryCard label="Groups" value={summary.groups} />
        <SummaryCard label="Tabs" value={summary.tabs} />
      </section>

      <section className="status-row">
        <span>{statusText}</span>
      </section>

      <section className="window-list" aria-live="polite">
        {browserState.windows.length === 0 ? (
          <div className="empty-state">No browser windows found.</div>
        ) : (
          browserState.windows.map((windowRecord, index) => (
            <WindowCard key={windowRecord.id} index={index} windowRecord={windowRecord} />
          ))
        )}
      </section>
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

function WindowCard({ index, windowRecord }: { index: number; windowRecord: WindowRecord }) {
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
          <GroupCard key={groupRecord.id} groupRecord={groupRecord} />
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

function GroupCard({ groupRecord }: { groupRecord: GroupRecord }) {
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
        src={tabRecord.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
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
        <button className="tab-action" type="button" onClick={handleAction} disabled={pending}>
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
