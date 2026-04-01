import type { BrowserState, GroupRecord, TabRecord, WindowRecord } from "./browser-state";

export function buildBrowserState(
  windows: chrome.windows.Window[],
  groups: chrome.tabGroups.TabGroup[]
): BrowserState {
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const normalizedWindows = windows
    .map((windowRecord) => normalizeWindow(windowRecord, groupById))
    .sort((left, right) => left.id - right.id);

  return {
    updatedAt: Date.now(),
    windows: normalizedWindows
  };
}

function normalizeWindow(
  windowRecord: chrome.windows.Window,
  groupById: Map<number, chrome.tabGroups.TabGroup>
): WindowRecord {
  const tabs = [...(windowRecord.tabs || [])].sort((left, right) => left.index - right.index);
  const groupedTabs = new Map<number, TabRecord[]>();
  const ungroupedTabs: TabRecord[] = [];

  tabs.forEach((tab) => {
    const normalizedTab = normalizeTab(tab);

    if (tab.groupId != null && tab.groupId >= 0) {
      if (!groupedTabs.has(tab.groupId)) {
        groupedTabs.set(tab.groupId, []);
      }

      groupedTabs.get(tab.groupId)?.push(normalizedTab);
      return;
    }

    ungroupedTabs.push(normalizedTab);
  });

  const groups = [...groupedTabs.entries()]
    .map(([groupId, memberTabs]) => normalizeGroup(groupById.get(groupId), windowRecord.id!, memberTabs))
    .sort((left, right) => left.sortIndex - right.sortIndex);

  return {
    id: windowRecord.id!,
    focused: Boolean(windowRecord.focused),
    state: windowRecord.state,
    type: windowRecord.type,
    groupCount: groups.length,
    tabCount: tabs.length,
    groups,
    ungroupedTabs
  };
}

function normalizeGroup(
  group: chrome.tabGroups.TabGroup | undefined,
  windowId: number,
  tabs: TabRecord[]
): GroupRecord {
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

function normalizeTab(tab: chrome.tabs.Tab): TabRecord {
  return {
    id: tab.id!,
    windowId: tab.windowId,
    index: tab.index,
    groupId: tab.groupId ?? -1,
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
