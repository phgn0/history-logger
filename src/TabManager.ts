import {
    getTabInfo,
    saveTabInfo,
    deleteTabInfo,
    updateTabInfo
} from "./data/tabs_data";
import {
    getVisit,
    saveVisit,
    updateVisit,
    Visit,
    EndCause,
    CreationCause
} from "./data/visit_data";

interface WebsiteInfo {
    title: string;
    url: string;
    favIconUrl: string;
}

interface TabImportData {
    tabId: number;
    createdBy: number | null;
    page: WebsiteInfo;
    index: number;
}

declare const browser: any; // the browser object

export default class TabManager {
    constructor(existingTabs: TabImportData[]) {
        // browser was closed, but we saved the state last time
        // no saved state
        // add current tabs with unknown relationships (parent, creation time)
        // this.processOpenTabs(existingTabs).then(unknownTabs => {
        //     this.processUnknownTab;
        // });
    }

    // private async processOpenTabs(
    //     tabs: TabImportData[] // in index order
    // ): Promise<TabImportData[]> {}

    // private async processUnknownTab(tab: TabImportData) {
    //     try {
    //         const visitId = await saveVisit({
    //             creation: {
    //                 cause: CreationCause.import,
    //                 parentId: null,
    //                 replacedParent: null,
    //                 time: Date.now()
    //             },
    //             children: [],
    //             page: tab.page
    //         });

    //         await saveTabInfo({
    //             tabId: tab.tabId,
    //             currentVisit: visitId,
    //             createdByVisit: null,
    //             tabPosition: tab.index
    //         });
    //     } catch (err) {
    //         console.error("error saving unknown visit", err);
    //     }
    // }

    /**
     * Save a navigation action in a tab.
     *
     * @private
     * @param {number} tabId The id of the tab in which we are navigating.
     * @param {WebsiteInfo} website The website we're navigating to.
     * @memberof TabManager
     */
    private async saveNavigation(tabId: number, website: WebsiteInfo) {
        try {
            // info about the current tab
            const tabInfo = await getTabInfo(tabId);

            // this is the first navigation in this tab if we have no prior visit
            const isNewTab = !tabInfo.currentVisit;

            let parentVisit: number | null;
            if (isNewTab) {
                // the visit that created the tab (if there is one), created also
                // this navigation
                // (otherwise a visit would not have created a tab)
                parentVisit = tabInfo.createdByVisit;
            } else {
                // tab existed before -> the last visit in this tab is the
                // navigations parent
                parentVisit = tabInfo.currentVisit;
            }

            let creationCause: CreationCause;
            if (parentVisit) {
                // we have a parent -> we navigated here by link / address bar
                creationCause = CreationCause.navigation;
            } else {
                // no parent -> manual navigation (manual new tab)
                creationCause = CreationCause.manual;
            }

            // save new info in database
            const visitId = await saveVisit({
                creation: {
                    cause: creationCause,
                    parentId: parentVisit, // null if no parent
                    replacedParent: parentVisit ? !isNewTab : null,
                    time: Date.now()
                },
                children: [],
                page: website
            });

            // link the new visit to the current tab
            await saveTabInfo({
                tabId: tabId,
                currentVisit: visitId,
                createdByVisit: tabInfo.createdByVisit, // hasn't changed
                tabPosition: tabInfo.tabPosition // hasn't changed
            });

            // update the parent visit (if there is one)
            if (parentVisit) {
                await updateVisit(parentVisit, visit => {
                    // add new visit as child
                    visit.children.push(visitId);

                    if (!isNewTab) {
                        // the new visits ends the parent
                        visit.end = {
                            cause: EndCause.navigation,
                            time: Date.now()
                        };
                    }
                    return visit;
                });
            }
        } catch (err) {
            console.error("error saving navigation", err);
        }
    }

    async createTab(
        tabId: number,
        createdByTab: number | null,
        tabPosition: number
    ): Promise<void> {
        // we do not have a website yet, just save basic tab info
        try {
            let parentVisit;
            if (createdByTab) {
                // the parent tab must have a view to create another tab
                parentVisit = (await getTabInfo(createdByTab)) || null;
                parentVisit = parentVisit ? parentVisit.currentVisit : null;
            } else {
                parentVisit = null;
            }
            console.log(parentVisit);

            saveTabInfo({
                tabId,
                currentVisit: null,
                createdByVisit: parentVisit,
                tabPosition
            });
        } catch (err) {
            console.error("create tab err", err);
        }
    }

    async closeTab(tabId: number): Promise<void> {
        // close a tab manually (user closes tab)
        try {
            const tabInfo = await getTabInfo(tabId);
            const currentVisitId = tabInfo.currentVisit;

            if (!tabInfo) {
                // tab does not exisit in our records
                throw new Error("tab record does not exist");
            }

            // delete our tab record, we dont need it anymore
            await deleteTabInfo(tabId);

            if (currentVisitId) {
                // we have to close the visit in the tab

                // mark visit as closed in db
                await updateVisit(currentVisitId, (visit: Visit) => {
                    // update the visit record
                    visit.end = {
                        cause: EndCause.manual,
                        time: Date.now()
                    };
                    return visit;
                });
            }
        } catch (err) {
            console.error("close tab error", err);
        }
    }

    async moveTab(tabId: number, newIndex: number) {
        await updateTabInfo(tabId, tabInfo => {
            tabInfo.tabPosition = newIndex;
            return tabInfo;
        });
    }

    selectTab(tabId) {}

    navigateTo(tabId: number, website: WebsiteInfo) {
        return this.saveNavigation(tabId, website);
    }
}
