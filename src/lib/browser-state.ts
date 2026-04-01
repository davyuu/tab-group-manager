export type BrowserState = {
  updatedAt: number | null;
  windows: WindowRecord[];
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
    };

export const UI_PORT_NAME = "tab-group-manager-ui";
