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
    // store.createIndex("tabPosition", "tabPosition", { unique: true });
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
        const transaction = db.transaction(["tabs"]);
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
        const transaction = db.transaction(["tabs"]);
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

// export async function* iterateTabIndex() {
//     // set up db, transaction
//     const db = await getDatabase();
//     const transaction = db.transaction(["tabs"]);
//     const objectStore = transaction.objectStore("tabs");

//     // set up cursor to iterate the records
//     const index = objectStore.index("tabPosition");
//     yield 1;
//     const cursor = index.openCursor();
//     cursor.onsuccess = () => {
//         yield 1;
//     };
// }

// export async function iterateTabIndex() {
//     // set up db, transaction
//     const db = await getDatabase();
//     const transaction = db.transaction(["tabs"]);
//     const objectStore = transaction.objectStore("tabs");

//     // set up cursor to iterate the records
//     const index = objectStore.index("tabPosition");

//     const request = index.openCursor();
//     let lastVal, cursor;
//     request.onsuccess = (event: any) => {
//         cursor = event.target.result;
//         lastVal = cursor.value;
//     };

//     return {
//         async next() {
//             const val = lastVal;
//             cursor.continue();
//         }
//     };
// }
