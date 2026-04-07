import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";

import "./style.scss";

function SuspendedApp() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title") || "Suspended Tab";
  const originalUrl = params.get("url") || "";
  const capturedAt = Number(params.get("capturedAt"));
  const [restoring, setRestoring] = useState(false);
  const restoringRef = useRef(false);

  useEffect(() => {
    document.title = title;
  }, [title]);

  const handleRestore = useCallback(async () => {
    if (restoringRef.current) {
      return;
    }

    const currentTab = await browser.tabs.getCurrent();
    if (!currentTab?.id) {
      return;
    }

    restoringRef.current = true;
    setRestoring(true);

    try {
      await browser.runtime.sendMessage({
        type: "RESTORE_TAB",
        tabId: currentTab.id
      });
    } catch (error) {
      restoringRef.current = false;
      setRestoring(false);
      console.error(error);
    }
  }, []);

  useEffect(() => {
    if (!wasLoadedByManualRefresh()) {
      return;
    }

    void handleRestore();
  }, [handleRestore]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void handleRestore();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleRestore]);

  const capturedAtLabel =
    Number.isFinite(capturedAt) && capturedAt > 0
      ? `Suspended ${new Date(capturedAt).toLocaleString()}`
      : "Suspended recently";

  return (
    <main
      className="suspended-shell"
      role="button"
      tabIndex={0}
      aria-label="Restore original page"
      onClick={() => void handleRestore()}
    >
      <p className="eyebrow">Tab Group Manager</p>
      <h1>{title}</h1>
      <p className="page-url">{originalUrl}</p>
      <p className="captured-at">{capturedAtLabel}</p>
      <p className="restore-hint">Refresh this tab or click anywhere on this page to load the original page.</p>
      <button
        id="restoreButton"
        className="restore-button"
        type="button"
        disabled={restoring}
        onClick={(event) => {
          event.stopPropagation();
          void handleRestore();
        }}
      >
        {restoring ? "Restoring..." : "Load Original Page"}
      </button>
    </main>
  );
}

function wasLoadedByManualRefresh() {
  const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

  if (navigationEntry) {
    return navigationEntry.type === "reload";
  }

  return performance.navigation.type === performance.navigation.TYPE_RELOAD;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SuspendedApp />
  </React.StrictMode>
);
