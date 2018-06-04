import { getDatabase } from "./indexedDB";
import { UpgradeDB, ObjectStore } from "idb";

export interface TabInfo {
    tabId: number; // changes with browser restart
    createdByVisit: number | null;
    currentVisit: number | null;
    tabPosition: number;
}

export function createTabsStore(db: UpgradeDB): ObjectStore<number, TabInfo> {
    const store = db.createObjectStore("tabs", {
        keyPath: "tabId",
        autoIncrement: false
    });
    store.createIndex("tabPosition", "tabPosition", { unique: true });
    return store;
}

/**
 * Save info about a tab to the database.
 * If there already exists a tab info, it will be overwritten.
 *
 * @export
 * @param {TabInfo} tabInfo The info about the tab to save.
 * @returns {Promise<number>} A Promise that resolves when the data is saved.
 */
export function saveTabInfo(tabInfo: TabInfo): Promise<number> {
    return getDatabase().then(db => {
        const transaction = db.transaction(["tabs"], "readwrite");
        const objectStore = transaction.objectStore("tabs");

        return objectStore.put(tabInfo) as Promise<number>;
    });
}

/**
 * Get info about a tab from the database.
 *
 * @export
 * @param {number} tabId The id of the tab
 * @returns {Promise<TabInfo | null>} A Promise that resolves with the tab info.
 */
export function getTabInfo(tabId: number): Promise<TabInfo> {
    return getDatabase().then(db => {
        const transaction = db.transaction(["tabs"], "readonly");
        const objectStore = transaction.objectStore("tabs");

        return objectStore.get(tabId).then(tabInfo => {
            // return null when there is no tab info
            return Promise.resolve(tabInfo || null);
        });
    });
}

/**
 * Delete info about a tab from the database.
 *
 * @export
 * @param {number} tabId The id of the tab
 * @returns {Promise<void>} A Promise that resolves when the info is deleted.
 */
export function deleteTabInfo(tabId: number): Promise<void> {
    return getDatabase().then(db => {
        const transaction = db.transaction(["tabs"], "readwrite");
        const objectStore = transaction.objectStore("tabs");

        return objectStore.delete(tabId);
    });
}

/**
 * Update a tab record in the database.
 *
 * @export
 * @param {number} tabId The id of the tab to update.
 * @param {(tab: TabInfo) => TabInfo} updateFunction The function to update
 * the tab record.
 * @returns {Promise<number>} A promise that resolves with the tabId when the
 * action was completed.
 */
export function updateTabInfo(
    tabId: number,
    updateFunction: (tab: TabInfo) => TabInfo
): Promise<number> {
    return getTabInfo(tabId).then(oldVisit => {
        const newVisit = updateFunction(oldVisit);
        return saveTabInfo(newVisit);
    });
}

export function getAllTabsInfos(): Promise<TabInfo[]> {
    return getDatabase().then(db => {
        const transaction = db.transaction(["tabs"], "readonly");
        const objectStore = transaction.objectStore("tabs");

        return objectStore.getAll();
    });
}

/**
 * Delete all saved tab data, and save new records.
 *
 * @export
 * @param {TabInfo[]} newRecords The new tab data to save.
 * @returns {Promise<void>}
 */
export async function replaceAllTabInfos(newRecords: TabInfo[]): Promise<void> {
    const db = await getDatabase();
    const transaction = db.transaction(["tabs"], "readwrite");
    const objectStore = transaction.objectStore("tabs");

    // delete old data
    await objectStore.clear();

    // save new
    for (const tabInfo of newRecords) {
        await objectStore.add(tabInfo);
    }
}

/**
 * Get a TabInfo from the databse by specifying the positon of the tab.
 * (tabPosition is unique)
 *
 * @export
 * @param {number} tabIndex The tab index / position of the tab whose info to return.
 * @returns {(Promise<TabInfo | null>)} Returns a promise that resolves with
 * info about the tab specifyed, or null if the query is invalid.
 */
export async function getTabInfoByIndex(
    tabIndex: number
): Promise<TabInfo | null> {
    const db = await getDatabase();
    const transaction = db.transaction(["tabs"], "readonly");
    const objectStore = transaction.objectStore("tabs");

    const index = objectStore.index("tabPosition");

    try {
        const tabInfo = await index.get(tabIndex);
        return tabInfo;
    } catch {
        return null;
    }
}

/**
 * Saves a series of tab movements to the database. All data mutations are
 * contained in a single transaction, so no data corruption happens.
 *
 * @export
 * @param {{ tabId: number; tabPosition: number }[]} tabsToMove An array of
 * objects that describe how to move a tab. The movements will be applied in
 * array order.
 * @param { tabId: number; tabPosition: number } [deleteFirst] An object
 * describing a tab that should be delete from the database first,
 * before applying all other tab movements, or null if no action is desired.
 * The tab will be re-added with its new tabPosition after all other movements
 * are saved.
 * This deletion allows to maintain the uniqueness of the tabPosition field,
 * even if the tabs are rotated in a circle.
 * @returns {Promise<void>} Returns a promise that resolves when the saving is complete,
 * or rejects if an error occured.
 */
export async function saveTabMoveChain(
    tabsToMove: { tabId: number; tabPosition: number }[],
    deleteFirst?: { tabId: number; tabPosition: number }
): Promise<void> {
    const db = await getDatabase();
    const transaction = db.transaction(["tabs"], "readwrite");
    const objectStore = transaction.objectStore("tabs");

    // delete record if desired
    let deletedRecord: TabInfo | undefined;
    if (deleteFirst) {
        // get the TabInfo to readd after we're done
        deletedRecord = await objectStore.get(deleteFirst.tabId);
        await objectStore.delete(deleteFirst.tabId);
    }

    // save tab moves
    // if saving fails because
    for (const move of tabsToMove) {
        // update saved record with new tabPosition
        const tabInfo: TabInfo = await objectStore.get(move.tabId);
        try {
            await objectStore.put({
                ...tabInfo,
                tabPosition: move.tabPosition
            });
        } catch (err) {
            throw new Error("Error saving tab move " + JSON.stringify(move));
        }
    }

    if (deleteFirst) {
        // re-add deleted record with new position
        await objectStore.add({
            ...deletedRecord,
            tabPosition: deleteFirst.tabPosition
        });
    }
}

export async function moveTabsLeft(startIndex: number): Promise<void> {
    const db = await getDatabase();
    const transaction = db.transaction(["tabs"], "readwrite");
    const objectStore = transaction.objectStore("tabs");

    const storeIndex = objectStore.index("tabPosition");

    // index.get() throws if there is no record, we want null
    const getTabOrNull = (index: number) => {
        return storeIndex.get(index).catch(() => {
            return Promise.resolve(null);
        });
    };

    let currentIndex = startIndex;
    let tabInfo: TabInfo = await getTabOrNull(currentIndex);
    while (tabInfo) {
        // move tab 1 position left
        await objectStore.put({ ...tabInfo, tabPosition: currentIndex - 1 });

        currentIndex++;
        tabInfo = await getTabOrNull(currentIndex);
    }
}
