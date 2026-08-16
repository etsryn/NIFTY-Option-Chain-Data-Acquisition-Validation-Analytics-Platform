// ============================================================
// ELEMENT REFERENCES
// ============================================================

const lastUpdate =
    document.getElementById(
        "lastUpdate"
    );

const nextUpdate =
    document.getElementById(
        "nextUpdate"
    );

const rows =
    document.getElementById(
        "rows"
    );

const backend =
    document.getElementById(
        "backend"
    );

const excel =
    document.getElementById(
        "excel"
    );

const schema =
    document.getElementById(
        "schema"
    );

const fingerprint =
    document.getElementById(
        "fingerprint"
    );

const feedStatus =
    document.getElementById(
        "feedStatus"
    );

const statusDot =
    document.getElementById(
        "statusDot"
    );

const statusText =
    document.getElementById(
        "statusText"
    );

const footer =
    document.getElementById(
        "footer"
    );


// ============================================================
// TIMING
// ============================================================
//
// This is the Python snapshot / heartbeat interval.
//
// NSE's internal refresh timer is separate.
//
// ============================================================

const INTERVAL = 3000;


// ============================================================
// SAFE ELEMENT HELPER
// ============================================================

function exists(
    element
) {

    return (
        element !== null &&
        element !== undefined
    );
}


// ============================================================
// GET NSE TAB STATUS
// ============================================================
//
// We query the actual content.js running inside the NSE tab.
//
// This is more trustworthy than looking only at persistent
// storage because storage can contain old session information.
//
// ============================================================

async function getNSETabStatus() {

    try {

        const tabs =
            await chrome.tabs.query({});


        const nseTabs =
            tabs.filter(
                tab =>
                    tab.id &&
                    typeof tab.url ===
                        "string" &&
                    tab.url.includes(
                        "nseindia.com/option-chain"
                    )
            );


        if (
            nseTabs.length === 0
        ) {

            return null;
        }


        /*
         * Prefer the active NSE option-chain tab.
         */

        const activeNSETab =
            nseTabs.find(
                tab =>
                    tab.active
            );


        const nseTab =
            activeNSETab ||
            nseTabs[0];


        if (
            !nseTab.id
        ) {

            return null;
        }


        const response =
            await chrome.tabs.sendMessage(
                nseTab.id,
                {
                    action:
                        "STATUS"
                }
            );


        return response || null;


    } catch (error) {

        console.debug(
            "NSE tab status unavailable:",
            error
        );


        return null;
    }
}


// ============================================================
// FORMAT TIME
// ============================================================

function formatTime(
    timestamp
) {

    if (
        timestamp ===
            undefined ||
        timestamp ===
            null ||
        timestamp === ""
    ) {

        return "—";
    }


    const date =
        new Date(
            timestamp
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "—";
    }


    return date.toLocaleTimeString();
}


// ============================================================
// REMOVE ALL STATE CLASSES
// ============================================================

function clearStateClasses(
    element
) {

    if (
        !exists(element)
    ) {

        return;
    }


    element.classList.remove(
        "connected",
        "disconnected",
        "stopped",
        "connecting",
        "schema-approved",
        "schema-unknown",
        "schema-blocked",
        "schema-unmounted",
        "active",
        "inactive"
    );
}


// ============================================================
// RENDER OVERALL FEED STATUS
// ============================================================

function renderFeedStatus(
    state
) {

    if (
        !exists(feedStatus) ||
        !exists(statusDot) ||
        !exists(statusText)
    ) {

        return;
    }


    feedStatus.className =
        "status";

    statusDot.className =
        "dot";


    switch (state) {

        case "LIVE":

            statusText.textContent =
                "LIVE FEED ACTIVE";

            break;


        case "CONNECTING":

            feedStatus.classList.add(
                "connecting"
            );

            statusDot.classList.add(
                "connecting"
            );

            statusText.textContent =
                "CONNECTING";

            break;


        case "DISCONNECTED":

            feedStatus.classList.add(
                "disconnected"
            );

            statusDot.classList.add(
                "disconnected"
            );

            statusText.textContent =
                "BACKEND DISCONNECTED";

            break;


        case "STOPPED":

        default:

            feedStatus.classList.add(
                "stopped"
            );

            statusDot.classList.add(
                "stopped"
            );

            statusText.textContent =
                "FEED STOPPED";

            break;
    }
}


// ============================================================
// RENDER BACKEND
// ============================================================

function renderBackend(
    state
) {

    if (
        !exists(backend)
    ) {

        return;
    }


    clearStateClasses(
        backend
    );


    switch (state) {

        case "CONNECTED":

            backend.textContent =
                "Connected";

            backend.classList.add(
                "connected"
            );

            break;


        case "CONNECTING":

            backend.textContent =
                "Connecting";

            backend.classList.add(
                "connecting"
            );

            break;


        case "DISCONNECTED":

        default:

            backend.textContent =
                "Disconnected";

            backend.classList.add(
                "disconnected"
            );

            break;
    }
}


// ============================================================
// RENDER EXCEL
// ============================================================

function renderExcel(
    state
) {

    if (
        !exists(excel)
    ) {

        return;
    }


    clearStateClasses(
        excel
    );


    switch (state) {

        case "UPDATING":

            excel.textContent =
                "Updating";

            excel.classList.add(
                "connected"
            );

            break;


        case "CONNECTED":

            excel.textContent =
                "Connected";

            excel.classList.add(
                "connected"
            );

            break;


        case "STALE":

            excel.textContent =
                "Stale";

            break;


        case "ERROR":

            excel.textContent =
                "Error";

            excel.classList.add(
                "disconnected"
            );

            break;


        case "STOPPED":

        default:

            excel.textContent =
                "Stopped";

            excel.classList.add(
                "stopped"
            );

            break;
    }
}


// ============================================================
// RENDER SCHEMA
// ============================================================

function renderSchema(
    state
) {

    if (
        !exists(schema)
    ) {

        return;
    }


    clearStateClasses(
        schema
    );


    switch (state) {

        case "VERIFIED":

        case "APPROVED":

            schema.textContent =
                "VERIFIED";

            schema.classList.add(
                "schema-approved"
            );

            break;


        case "LOADING":

        case "CHECKING":

        case "UNKNOWN":

            schema.textContent =
                "Checking";

            schema.classList.add(
                "schema-unknown"
            );

            break;


        case "BLOCKED":

        case "INVALID":

            schema.textContent =
                "BLOCKED";

            schema.classList.add(
                "schema-blocked"
            );

            break;


        case "UNMOUNTED":

        default:

            schema.textContent =
                "Unmounted";

            schema.classList.add(
                "schema-unmounted"
            );

            break;
    }
}


// ============================================================
// RENDER FINGERPRINT
// ============================================================
//
// IMPORTANT:
//
// Persistent fingerprint ≠ active fingerprint.
//
// When the feed is stopped, the approved fingerprint may still
// exist in chrome.storage.local, but it is deliberately NOT
// shown as active runtime state.
//
// ============================================================

function renderFingerprint(
    value,
    active
) {

    if (
        !exists(fingerprint)
    ) {

        return;
    }


    clearStateClasses(
        fingerprint
    );


    if (
        !active ||
        !value
    ) {

        fingerprint.textContent =
            "Not active";

        fingerprint.title =
            "No active NSE schema session.";

        fingerprint.classList.add(
            "inactive"
        );

        return;
    }


    fingerprint.textContent =
        value;

    fingerprint.title =
        value;

    fingerprint.classList.add(
        "active"
    );
}


// ============================================================
// RENDER LAST UPDATE
// ============================================================

function renderLastUpdate(
    timestamp
) {

    if (
        !exists(lastUpdate)
    ) {

        return;
    }


    lastUpdate.textContent =
        formatTime(
            timestamp
        );
}


// ============================================================
// RENDER NEXT UPDATE
// ============================================================

function renderNextUpdate(
    state,
    timestamp
) {

    if (
        !exists(nextUpdate)
    ) {

        return;
    }


    /*
     * --------------------------------------------------------
     * STOPPED
     * --------------------------------------------------------
     */

    if (
        state ===
            "STOPPED"
    ) {

        nextUpdate.textContent =
            "Not scheduled";

        return;
    }


    /*
     * --------------------------------------------------------
     * DISCONNECTED
     * --------------------------------------------------------
     */

    if (
        state ===
            "DISCONNECTED"
    ) {

        nextUpdate.textContent =
            "Waiting for backend";

        return;
    }


    /*
     * --------------------------------------------------------
     * CONNECTING
     * --------------------------------------------------------
     */

    if (
        state ===
            "CONNECTING"
    ) {

        nextUpdate.textContent =
            "Starting…";

        return;
    }


    /*
     * --------------------------------------------------------
     * LIVE
     * --------------------------------------------------------
     */

    if (
        !timestamp
    ) {

        nextUpdate.textContent =
            "Waiting…";

        return;
    }


    const numericTimestamp =
        Number(
            timestamp
        );


    if (
        !Number.isFinite(
            numericTimestamp
        )
    ) {

        nextUpdate.textContent =
            "Waiting…";

        return;
    }


    const elapsed =
        Date.now() -
        numericTimestamp;


    /*
     * If the last update is older than the interval,
     * don't pretend a countdown is still valid.
     */

    if (
        elapsed >=
        INTERVAL
    ) {

        nextUpdate.textContent =
            "Awaiting update";

        return;
    }


    const remaining =
        Math.max(
            0,
            INTERVAL -
            elapsed
        );


    nextUpdate.textContent =
        `${Math.ceil(
            remaining / 1000
        )}s`;
}


// ============================================================
// RENDER FOOTER
// ============================================================

function renderFooter(
    state
) {

    if (
        !exists(footer)
    ) {

        return;
    }


    switch (state) {

        case "LIVE":

            footer.textContent =
                "Python snapshot · 3s · NSE refresh · 5s";

            break;


        case "CONNECTING":

            footer.textContent =
                "Connecting to local backend…";

            break;


        case "DISCONNECTED":

            footer.textContent =
                "Backend unavailable · feed stopped";

            break;


        case "STOPPED":

        default:

            footer.textContent =
                "Feed stopped · restart to resume";

            break;
    }
}


// ============================================================
// DETERMINE RUNTIME STATE
// ============================================================

function determineRuntimeState(
    data,
    nseStatus
) {

    /*
     * --------------------------------------------------------
     * Actual content.js status takes priority.
     * --------------------------------------------------------
     */

    if (
        nseStatus
    ) {

        if (
            nseStatus.running ===
                true
        ) {

            if (
                nseStatus.heartbeatRunning ===
                    true
            ) {

                return "LIVE";
            }


            /*
             * Feed says running but heartbeat isn't active.
             * Treat this as connecting rather than falsely
             * claiming healthy live operation.
             */

            return "CONNECTING";
        }


        return "STOPPED";
    }


    /*
     * --------------------------------------------------------
     * No responsive NSE content script.
     *
     * Do NOT trust persistent running=true by itself.
     * An old value in storage should never create a false
     * LIVE indicator.
     * --------------------------------------------------------
     */

    return "STOPPED";
}


// ============================================================
// UPDATE ACTIVITY
// ============================================================

async function updateActivity() {

    try {

        // ====================================================
        // LOAD RUNTIME STORAGE
        // ====================================================

        const data =
            await chrome.storage.local.get([

                "running",

                "lastUpdate",

                "rows",

                "backend",

                "backendState",

                "excelState",

                "schemaState",

                "nse_schema_state",

                "fingerprintActive",

                "nse_schema_fingerprint",

                "nse_schema_version"

            ]);


        // ====================================================
        // QUERY REAL NSE TAB
        // ====================================================

        const nseStatus =
            await getNSETabStatus();


        // ====================================================
        // DETERMINE REAL RUNTIME STATE
        // ====================================================

        const runtimeState =
            determineRuntimeState(
                data,
                nseStatus
            );


        // ====================================================
        // OVERALL STATUS
        // ====================================================

        renderFeedStatus(
            runtimeState
        );


        renderFooter(
            runtimeState
        );


        // ====================================================
        // LAST UPDATE
        // ====================================================

        renderLastUpdate(
            data.lastUpdate
        );


        // ====================================================
        // NEXT UPDATE
        // ====================================================

        renderNextUpdate(
            runtimeState,
            data.lastUpdate
        );


        // ====================================================
        // ROW COUNT
        // ====================================================

        if (
            data.rows !==
                undefined &&
            data.rows !==
                null
        ) {

            rows.textContent =
                data.rows;

        } else {

            rows.textContent =
                "—";
        }


        // ====================================================
        // BACKEND STATE
        // ====================================================
        //
        // If the actual feed is stopped, backend is shown as
        // disconnected regardless of stale historical values.
        //
        // ====================================================

        let backendState;


        if (
            runtimeState ===
                "LIVE"
        ) {

            backendState =
                "CONNECTED";

        } else if (
            runtimeState ===
                "CONNECTING"
        ) {

            backendState =
                "CONNECTING";

        } else {

            backendState =
                "DISCONNECTED";
        }


        /*
         * A real explicit backend state from content.js can
         * refine the live state, but cannot override a stopped
         * runtime into "Connected".
         */

        if (
            runtimeState ===
                "LIVE" &&
            (
                data.backendState ===
                    "DISCONNECTED" ||
                data.backend ===
                    "Offline"
            )
        ) {

            backendState =
                "DISCONNECTED";
        }


        renderBackend(
            backendState
        );


        // ====================================================
        // EXCEL STATE
        // ====================================================

        let excelState;


        if (
            runtimeState ===
                "LIVE"
        ) {

            excelState =
                data.excelState ||
                "UPDATING";

        } else {

            /*
             * When the feed is not running, Excel is never
             * allowed to display "Updating".
             */

            excelState =
                "STOPPED";
        }


        renderExcel(
            excelState
        );


        // ====================================================
        // SCHEMA STATE
        // ====================================================

        if (
            runtimeState ===
                "LIVE"
        ) {

            const activeSchemaState =
                nseStatus?.schemaState ||
                data.schemaState ||
                data.nse_schema_state ||
                "LOADING";


            renderSchema(
                activeSchemaState
            );

        } else {

            /*
             * Once the system is stopped, schema is a runtime
             * mount state, not a persistent approval display.
             */

            renderSchema(
                "UNMOUNTED"
            );
        }


        // ====================================================
        // FINGERPRINT
        // ====================================================

        if (
            runtimeState ===
                "LIVE"
        ) {

            renderFingerprint(

                nseStatus?.schemaFingerprint ||
                data.nse_schema_fingerprint,

                data.fingerprintActive !==
                    false

            );

        } else {

            /*
             * Persistent fingerprint remains in storage, but
             * is deliberately hidden from the runtime popup.
             */

            renderFingerprint(
                null,
                false
            );
        }


    } catch (error) {

        console.error(
            "Popup activity error:",
            error
        );


        /*
         * Fail closed.
         *
         * A popup error must never create the illusion that
         * the system is still running.
         */

        renderFeedStatus(
            "STOPPED"
        );

        renderFooter(
            "STOPPED"
        );

        renderNextUpdate(
            "STOPPED",
            null
        );

        renderBackend(
            "DISCONNECTED"
        );

        renderExcel(
            "STOPPED"
        );

        renderSchema(
            "UNMOUNTED"
        );

        renderFingerprint(
            null,
            false
        );
    }
}


// ============================================================
// INITIAL LOAD
// ============================================================

void updateActivity();


// ============================================================
// LIVE POPUP REFRESH
// ============================================================
//
// 500 ms keeps the countdown visually smooth while the actual
// Python snapshot interval remains 3 seconds.
//
// ============================================================

setInterval(
    () => {

        void updateActivity();

    },
    500
);  