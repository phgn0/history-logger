// import save from "./save_data";
// import TabManager from "./data";
import TabManager, { TabImportData } from "./TabManager";

declare const browser: any; // the browser object

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

let _tabManager: TabManager;

// get all open tabs
const tabManagerInit = browser.tabs.query({}).then((tabs: TabObject[]) => {
    // convert tab data to our data format
    const tabData: TabImportData[] = tabs.map((tab: TabObject) => {
        return {
            tabId: tab.id,
            createdBy: tab.openerTabId || null,
            index: tab.index,
            page: {
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl
            }
        };
    });

    // initialize tab manager with imported tabs
    _tabManager = new TabManager(tabData, getTabIndex);

    return Promise.resolve(_tabManager);
});

// tab manager need init time, so has to be requested async
function getTabManager(): Promise<TabManager> {
    if (_tabManager) {
        // already initialized
        return Promise.resolve(_tabManager);
    } else {
        // currently initializing
        return tabManagerInit;
    }
}

function getTabIndex(tabId: number): Promise<number> {
    return browser.tabs.get(tabId).then((tab: TabObject) => {
        return Promise.resolve(tab.index);
    });
}

browser.tabs.onCreated.addListener((tab: TabObject) => {
    getTabManager().then(tabManager => {
        tabManager.createTab(
            tab.id,
            tab.openerTabId ? tab.openerTabId : null,
            tab.index
        );
    });
});

browser.tabs.onRemoved.addListener((tabId: number) => {
    getTabManager().then(tabManager => {
        tabManager.closeTab(tabId);
    });
});

browser.tabs.onMoved.addListener(
    (
        tabId: number,
        info: { windowId: number; fromIndex: number; toIndex: number }
    ) => {
        getTabManager().then(tabManager => {
            tabManager.moveTabManual(tabId, info.toIndex);
        });
    }
);

// notify when we visit a new url
browser.webNavigation.onCommitted.addListener(
    async function handleNavigation(details: {
        tabId: number;
        url: string;
        transitionType: string;
    }) {
        if (details.transitionType !== "auto_subframe") {
            const tab: TabObject = await browser.tabs.get(details.tabId);
            const tabManager = await getTabManager();

            tabManager.navigateTo(details.tabId, {
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl
            });
        }
    }
);
