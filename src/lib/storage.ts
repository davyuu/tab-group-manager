import { storage } from "wxt/utils/storage";

import type { SavedGroupRecord, SuspendedTabRecord } from "./browser-state";

export const suspendedTabsItem = storage.defineItem<Record<string, SuspendedTabRecord>>("local:suspendedTabsById", {
  fallback: {},
  version: 1
});

export const savedGroupsItem = storage.defineItem<SavedGroupRecord[]>("local:savedGroups", {
  fallback: [],
  version: 1
});
