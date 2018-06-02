import idb, { DB, UpgradeDB, ObjectStore } from "idb";
import { createVisitsStore } from "./visit_data";
import { createTabsStore } from "./tabs_data";

// save db object, wo we don't have to request it each time
let database: DB | null = null;
let databaseRequest: Promise<DB> | null = null;

function setUpDatabase(): Promise<DB> {
    return idb.open("history-graph", 2, (db: UpgradeDB) => {
        // create data stores
        createVisitsStore(db);
        createTabsStore(db);
    });
}

export function getDatabase(): Promise<DB> {
    if (database) {
        // db already initialized
        return Promise.resolve(database);
    } else if (databaseRequest) {
        // we already requested the db
        return databaseRequest;
    } else {
        // first time -> request db

        // save data in module scope
        databaseRequest = setUpDatabase().then(db => {
            database = db;
            databaseRequest = null;
            return db;
        });
        return databaseRequest;
    }
}
