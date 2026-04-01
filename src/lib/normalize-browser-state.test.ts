import { describe, expect, it } from "vitest";

import type { SuspendedTabRecord } from "./browser-state";
import { buildBrowserState } from "./normalize-browser-state";

describe("buildBrowserState", () => {
  it("keeps windows sorted by stable id instead of focus state", () => {
    const windows = [
      {
        id: 9,
        focused: true,
        state: "normal",
        type: "normal",
        tabs: [
          { id: 91, windowId: 9, index: 0, groupId: -1, title: "Focused Window Tab", url: "https://focused.test", status: "complete" }
        ]
      },
      {
        id: 3,
        focused: false,
        state: "normal",
        type: "normal",
        tabs: [
          { id: 31, windowId: 3, index: 0, groupId: -1, title: "Earlier Window Tab", url: "https://earlier.test", status: "complete" }
        ]
      }
    ] as chrome.windows.Window[];

    const state = buildBrowserState(windows, []);

    expect(state.windows.map((windowRecord) => windowRecord.id)).toEqual([3, 9]);
    expect(state.windows[1].focused).toBe(true);
  });

  it("preserves original title and url for suspended tabs", () => {
    const windows = [
      {
        id: 5,
        focused: false,
        state: "normal",
        type: "normal",
        tabs: [
          {
            id: 51,
            windowId: 5,
            index: 0,
            groupId: -1,
            title: "chrome-extension placeholder",
            url: "chrome-extension://abc123/suspended.html?tabId=51",
            favIconUrl: "",
            status: "complete"
          }
        ]
      }
    ] as chrome.windows.Window[];

    const suspendedTabStore: Record<string, SuspendedTabRecord> = {
      "51": {
        tabId: 51,
        originalUrl: "https://mail.example.com/inbox",
        originalTitle: "Inbox - Mail",
        originalFavIconUrl: "https://mail.example.com/favicon.ico",
        windowId: 5,
        groupId: -1,
        index: 0,
        capturedAt: 123456
      }
    };

    const state = buildBrowserState(windows, [], suspendedTabStore);
    const tab = state.windows[0].ungroupedTabs[0];

    expect(tab.suspended).toBe(true);
    expect(tab.title).toBe("Inbox - Mail");
    expect(tab.url).toBe("https://mail.example.com/inbox");
    expect(tab.favIconUrl).toBe("https://mail.example.com/favicon.ico");
  });

  it("sorts groups by the index of their first tab", () => {
    const windows = [
      {
        id: 1,
        focused: false,
        state: "normal",
        type: "normal",
        tabs: [
          { id: 11, windowId: 1, index: 2, groupId: 200, title: "Later Group Tab", url: "https://later.test", status: "complete" },
          { id: 12, windowId: 1, index: 0, groupId: 100, title: "Earlier Group Tab", url: "https://earlier.test", status: "complete" }
        ]
      }
    ] as chrome.windows.Window[];

    const groups = [
      { id: 100, title: "First", color: "blue", collapsed: false },
      { id: 200, title: "Second", color: "green", collapsed: false }
    ] as chrome.tabGroups.TabGroup[];

    const state = buildBrowserState(windows, groups);

    expect(state.windows[0].groups.map((group) => group.id)).toEqual([100, 200]);
  });
});
