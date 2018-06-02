// import save from "./save_data";
// import TabManager from "./data";
import TabManager from "./TabManager";
const tabManager = new TabManager([]);

declare const browser: any; // the browser object

console.log("hi");

// the properties we use from the tab object
// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/tabs/Tab
interface TabObject {
    id: number;
    index: number;
    title: string;
    url: string;
    favIconUrl: string;
    openerTabId?: number;
}

browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
    console.log("active tab: ", tabId);
});

browser.tabs.onCreated.addListener((tab: TabObject) => {
    // console.log("created: ", tab.url);
    tabManager.createTab(
        tab.id,
        tab.openerTabId ? tab.openerTabId : null,
        tab.index
    );
});

browser.tabs.onRemoved.addListener((tabId: number) => {
    tabManager.closeTab(tabId);
});

// notify when we visit a new url
browser.tabs.onUpdated.addListener(
    (tabId: number, changeInfo: { status: string }, tab: TabObject) => {
        // we cant use the onUpdated filter method, because compatibility is bad
        // so filter here
        // console.log(tabId, changeInfo);
        if (changeInfo.status === "complete") {
            // we completed loading a page
            // console.log("updated: " + tabId + " ", tab.url, tab.openerTabId);
            tabManager.navigateTo(tabId, {
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl
            });
        }
    }
);
