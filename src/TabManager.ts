import {
    getTabInfo,
    saveTabInfo,
    deleteTabInfo,
    updateTabInfo,
    getAllTabsInfos,
    TabInfo,
    replaceAllTabInfos,
    getTabInfoByIndex,
    saveTabMoveChain
} from "./data/tabs_data";
import {
    getVisit,
    saveVisit,
    updateVisit,
    Visit,
    EndCause,
    CreationCause
} from "./data/visit_data";

export interface WebsiteInfo {
    title: string;
    url: string;
    favIconUrl: string;
}

export interface TabImportData {
    tabId: number;
    createdBy: number | null;
    page: WebsiteInfo;
    index: number;
}

export default class TabManager {
    constructor(
        existingTabs: TabImportData[],
        public queryRealTabIndex: (number) => Promise<number>
    ) {
        // browser was closed, but we saved the state last time
        // no saved state
        // add current tabs with unknown relationships (parent, creation time)

        const existingTabsMap = existingTabs.reduce((map, tabData) => {
            map.set(tabData.index, tabData);
            return map;
        }, new Map<number, TabImportData>());

        this.processOpenTabs(existingTabsMap).then(unknownTabs => {
            console.log("unkn", unknownTabs);
            for (const tab of unknownTabs) {
                this.processUnknownTab(tab);
            }
        });
    }

    private async processOpenTabs(
        realTabs: Map<number, TabImportData> // map because it has easy el. remove
    ): Promise<TabImportData[]> {
        console.log("realtabs", realTabs);
        // our saved tab data
        const oldTabRecords = await getAllTabsInfos();
        console.log("oldrec", oldTabRecords);

        // save tab records that are outdated / invalid
        const invalidTabRecords: TabInfo[] = [];

        // tab records to write to new db
        // (entire db needs to be replaced: every entry invalid or has new tabId)
        const newTabRecords: TabInfo[] = [];

        // we will delete matched tabs from the realTabs array
        // so only unknown tabs will be left at the end

        const markInvalidRecord = i => {
            console.log("invalid", i);
            // remember that this record is invalid -> maybe use in other way
            invalidTabRecords.push(oldTabRecords[i]);
        };

        const saveTabMatch = (i, realTab: TabImportData) => {
            console.log("valid", i);
            // update the record with the new tabId
            newTabRecords.push({
                ...oldTabRecords[i],
                tabId: realTab.tabId
            });

            // forget this realTab, because we have found a match
            realTabs.delete(realTab.index); // key is the tab index
        };

        // check for each tab if we have info about it:
        // loop the saved data, check against real tabs
        //      -> real tab lookup with in-memory map cheap, lookup of saved data
        //      would need an extra db request with tabPosition index
        for (let i = 0; i < oldTabRecords.length; i++) {
            const tabRecord = oldTabRecords[i];
            // check if this record matches a current tab

            // the real tab at the specified position / index
            const tabCandidate = realTabs.get(tabRecord.tabPosition);
            if (!tabCandidate) {
                // no tab at this positon exists anymore
                // -> the tab record is outdated or invalid
                markInvalidRecord(i);
                continue;
            }

            // test if the candidate matches the records
            // (test if the page is the same)
            if (!tabRecord.currentVisit) {
                // our record shows an empty tab

                if (!tabCandidate.page) {
                    // real tab also empty
                    saveTabMatch(i, tabCandidate);
                }
            } else {
                // get tab record page
                const recordVisit = await getVisit(tabRecord.currentVisit);

                if (recordVisit.page.url === tabCandidate.page.url) {
                    // same tab index, same url -> propably same tab
                    saveTabMatch(i, tabCandidate);
                } else {
                    // different url -> unknown tab and invalid tab record
                    markInvalidRecord(i);
                }
            }
        }

        console.log("new tabr", newTabRecords);
        // save the updated tabRecords to the db, removing old data
        // (every single tab record is has been modified or deleted)
        await replaceAllTabInfos(newTabRecords);

        // realTabs contains now only the unknown tabs
        // convert map to array
        return Array.from(realTabs, ([index, tabData]) => tabData);
    }

    private async processUnknownTab(tab: TabImportData) {
        try {
            // save tab visit
            const visitId = await saveVisit({
                creation: {
                    cause: CreationCause.import,
                    parentId: null,
                    replacedParent: null,
                    time: Date.now()
                },
                children: [],
                page: tab.page
            });

            // save tab info now
            await saveTabInfo({
                tabId: tab.tabId,
                currentVisit: visitId,
                createdByVisit: null,
                tabPosition: tab.index
            });
        } catch (err) {
            console.error("error saving unknown visit", err);
        }
    }

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

            saveTabInfo({
                tabId,
                currentVisit: null,
                createdByVisit: parentVisit,
                tabPosition
            });

            // check if there was a tab at this positon (that is now moved away)

            if (true) {
                // move this tab to its real position
            }
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

    /**
     * Get info about the tabs that were affected and as a result also moved,
     * after we moved a tab to a new position / index.
     * After such a move, our internal data on the tabs position is invalid,
     * and can be corrected by using the calculations done by this method.
     * As such, this method assumes the internal tab data has not yet been modified
     * since the initial tab move has taken place.
     *
     * @param {number} newPosition The position / index a tab was moved to.
     * Which tab was moved there is not needed to get the affected tabs.
     * @param {number} [stopTabId] If provided, this parameter stops the
     * recursive calculation of affected tabs after a tab with this id was found.
     * This can be used to prevent endless execution when a few tabs have been
     * shifted in a circle.
     * @returns {Promise<{ tabId: number; tabPosition: number }[]>} Returns a promise
     * that resolves with an array of tabs that are affected by the tab move.
     * This is expressed by objects referencing a tab by its tabId, and the
     * index this specific tab is moved to. The array is in reverse
     * order, the tab moved "last" (result of all other tab moves) is in the first
     * position. This way the moves can be saved to the database
     * in array order, while maintaining the uniqueness of the tabPosition field.
     * @memberof TabManager
     */
    async getMovedTabs(
        newPosition: number,
        stopTabId?: number
    ): Promise<{ tabId: number; tabPosition: number }[]> {
        try {
            // check if there was a tab at this position
            // using our tab records (that have not been updated with the tab moves)
            const otherTab = await getTabInfoByIndex(newPosition);

            if (otherTab) {
                if (stopTabId && otherTab.tabId === stopTabId) {
                    // we got all affected tabs -> stop recursion
                    return [];
                }
                // "otherTab" is affected by our last tab move

                // check where this tab really is after the move event
                const newIndex = await this.queryRealTabIndex(otherTab.tabId);

                // check if this move in turn also moved other tabs, and return
                // info about these moves
                // (continues recursively)
                const moves = await this.getMovedTabs(newIndex, stopTabId);

                // add our move (of "otherTab") at the end
                // -> can apply moves in array order, tabPositon remains unique
                moves.push({
                    tabId: otherTab.tabId,
                    tabPosition: newIndex
                });
                return moves;
            } else {
                // we're fine, no other tabs are affected by our move
                // (reached right side of tab bar)
                return [];
            }
        } catch (err) {
            console.error("tab move error", err);
            return [];
        }
    }

    /**
     * Saves a manual move of a tab in the tab bar.
     * This also calculates and saves all other affected and as a result moved
     * tabs, because the browser.tabs interface only gives info about the tab
     * that was moved.
     *
     * @param {number} tabId The id of the tab that was moved.
     * @param {number} newIndex The new position / index the tab was moved to.
     * @returns Resolves when the saving is complete.
     * @memberof TabManager
     */
    async moveTabManual(tabId: number, newIndex: number) {
        // a manual tab move always shifts tabs around in a circle

        // get tabs also affected by our move
        // stop recursive calcualtion of affected tabs when we reach "tabId"
        // (the first moved tab), because else we would be looping again
        const moves = await this.getMovedTabs(newIndex, tabId);

        // "moves" is in reverse causation order, each move is the result of
        // the move after it.
        // so moves can be saved in array order, the tabPosition field remains unique.
        // we just have to remove the first tab from our records before we start
        // saving the new positons, and re-add it with its new pos. afterwards
        await saveTabMoveChain(moves, {
            tabId: tabId,
            tabPosition: newIndex
        });
    }

    selectTab(tabId) {}

    navigateTo(tabId: number, website: WebsiteInfo) {
        return this.saveNavigation(tabId, website);
    }
}
