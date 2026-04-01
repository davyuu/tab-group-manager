export type BrowserState = {
  updatedAt: number | null;
  windows: WindowRecord[];
};

export type SuspendedTabRecord = {
  tabId: number;
  originalUrl: string;
  originalTitle: string;
  originalFavIconUrl: string;
  windowId: number;
  groupId: number;
  index: number;
  capturedAt: number;
};

export type WindowRecord = {
  id: number;
  focused: boolean;
  state?: string;
  type?: string;
  groupCount: number;
  tabCount: number;
  groups: GroupRecord[];
  ungroupedTabs: TabRecord[];
};

export type GroupRecord = {
  id: number;
  windowId: number;
  title: string;
  color: string;
  collapsed: boolean;
  tabCount: number;
  sortIndex: number;
  tabs: TabRecord[];
};

export type TabRecord = {
  id: number;
  windowId: number;
  index: number;
  groupId: number;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  suspended: boolean;
  status: string;
};

export const EMPTY_BROWSER_STATE: BrowserState = {
  updatedAt: null,
  windows: []
};

export type BrowserStateMessage =
  | {
      type: "BROWSER_STATE_UPDATED";
      payload: BrowserState;
    }
  | {
      type: "GET_BROWSER_STATE";
    }
  | {
      type: "REFRESH_BROWSER_STATE";
    }
  | {
      type: "SUSPEND_TAB";
      tabId: number;
    }
  | {
      type: "SUSPEND_GROUP";
      groupId: number;
    }
  | {
      type: "RESTORE_GROUP";
      groupId: number;
    }
  | {
      type: "RESTORE_TAB";
      tabId: number;
    };

export const UI_PORT_NAME = "tab-group-manager-ui";
export const SUSPENDED_ROUTE = "suspended.html";
export const SUSPENDED_STORAGE_KEY = "suspendedTabsById";
