import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tab Group Manager",
    description: "View all browser windows, tab groups, and tabs from a side panel.",
    permissions: ["tabs", "tabGroups", "storage", "sidePanel"],
    action: {
      default_title: "Open Tab Group Manager"
    }
  }
});
