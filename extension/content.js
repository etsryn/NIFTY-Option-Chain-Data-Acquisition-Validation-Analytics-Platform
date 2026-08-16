let running = false;
let heartbeatRunning = false;
let heartbeatController = null;


// ============================================================
// TIMING / LIFECYCLE STATE
// ============================================================

const INTERVAL = 5000; // 5 seconds — NSE internal refresh
const AUTO_START_DELAY = 5000;
const REFRESH_REQUEST_TIMEOUT = 5000;
const MAX_REFRESH_COMMUNICATION_FAILURES = 3;

let nsePageRefreshTimer = null;
let autoStartTimer = null;
let nseRefreshInFlight = false;
let refreshCommunicationFailures = 0;
let stopRequested = false;

async function setRuntimeState(updates) {

    try {

        await chrome.storage.local.set(
            updates
        );

    } catch (error) {

        if (
            !isExtensionContextInvalidated(
                error
            )
        ) {

            console.debug(
                "Runtime state update failed:",
                error
            );
        }
    }
}


// ============================================================
// PAGE / EXTENSION SAFETY HELPERS
// ============================================================

function isNSEOptionChainPage() {

    return (
        window.location.hostname ===
        "www.nseindia.com"
        &&
        window.location.pathname
            .includes("option-chain")
        &&
        window.location.hash ===
        "#nifty-feed"
    );
}


function isExtensionContextInvalidated(error) {

    const message =
        String(
            error?.message ||
            error ||
            ""
        ).toLowerCase();


    return (
        message.includes(
            "extension context invalidated"
        ) ||
        message.includes(
            "could not establish connection"
        ) &&
        message.includes(
            "receiving end does not exist"
        )
    );
}


function safeRuntimeNotify(message) {

    try {

        chrome.runtime.sendMessage(
            message,
            () => {
                // Access lastError so Chrome does not emit an
                // unhandled runtime-messaging warning.
                void chrome.runtime.lastError;
            }
        );

    } catch (error) {

        if (
            !isExtensionContextInvalidated(error)
        ) {

            console.debug(
                "Runtime notification failed:",
                error
            );
        }
    }
}


function requestRuntimeMessage(
    message,
    timeoutMs = REFRESH_REQUEST_TIMEOUT
) {

    return new Promise(resolve => {

        let settled = false;

        const timeoutId =
            setTimeout(
                () => {

                    if (settled) {
                        return;
                    }

                    settled = true;

                    resolve({
                        ok: false,
                        error:
                            "Extension message timed out."
                    });

                },
                timeoutMs
            );


        try {

            chrome.runtime.sendMessage(
                message,
                response => {

                    if (settled) {
                        return;
                    }

                    settled = true;

                    clearTimeout(
                        timeoutId
                    );


                    if (
                        chrome.runtime.lastError
                    ) {

                        resolve({
                            ok: false,
                            error:
                                chrome.runtime.lastError.message ||
                                "Extension runtime messaging failed."
                        });

                        return;
                    }


                    resolve({
                        ok: true,
                        response
                    });
                }
            );

        } catch (error) {

            if (settled) {
                return;
            }

            settled = true;

            clearTimeout(
                timeoutId
            );


            resolve({
                ok: false,
                error:
                    String(
                        error?.message ||
                        error
                    )
            });
        }
    });
}


function stopNSERefreshTimer(
    reason = "unknown"
) {

    if (
        nsePageRefreshTimer !== null
    ) {

        clearInterval(
            nsePageRefreshTimer
        );

        nsePageRefreshTimer = null;
    }


    nseRefreshInFlight = false;
    refreshCommunicationFailures = 0;


    console.log(
        `🛑 NSE internal refresh timer stopped (${reason}).`
    );
}


// ============================================================
// NSE INTERNAL REFRESH
// ============================================================

async function refreshNSEOptionChain() {

    if (!running) {
        return;
    }


    if (!isNSEOptionChainPage()) {

        stopNSERefreshTimer(
            "left NSE option-chain page"
        );

        return;
    }


    if (nseRefreshInFlight) {

        console.debug(
            "⏳ NSE refresh request already in flight; skipping tick."
        );

        return;
    }


    nseRefreshInFlight = true;


    console.log(
        "🔄 Requesting NSE internal refresh..."
    );


    try {

        const result =
            await requestRuntimeMessage({
                action:
                    "CLICK_NSE_REFRESH"
            });


        if (!running) {
            return;
        }


        if (!result.ok) {

            refreshCommunicationFailures++;


            console.warn(
                "⚠️ NSE refresh request failed:",
                result.error
            );


            if (
                isExtensionContextInvalidated({
                    message:
                        result.error
                })
            ) {

                stopNSERefreshTimer(
                    "extension context invalidated"
                );

                return;
            }


            if (
                refreshCommunicationFailures >=
                MAX_REFRESH_COMMUNICATION_FAILURES
            ) {

                stopNSERefreshTimer(
                    "extension messaging unavailable"
                );
            }

            return;
        }


        refreshCommunicationFailures = 0;


        if (
            result.response?.success
        ) {

            console.log(
                "✅ NSE internal refresh clicked."
            );

        } else {

            console.warn(
                "⚠️ NSE internal refresh failed:",
                result.response?.error ||
                "Unknown error"
            );
        }

    } finally {

        nseRefreshInFlight = false;
    }
}


function startNSERefreshTimer() {

    if (!running) {
        return;
    }


    if (!isNSEOptionChainPage()) {
        return;
    }


    if (
        nsePageRefreshTimer !== null
    ) {
        return;
    }


    refreshCommunicationFailures = 0;


    // Refresh immediately once startup has been verified.
    void refreshNSEOptionChain();


    nsePageRefreshTimer =
        setInterval(
            () => {

                void refreshNSEOptionChain();

            },
            INTERVAL
        );


    console.log(
        `🔄 NSE refresh timer STARTED: every ${INTERVAL / 1000}s`
    );
}


// ============================================================
// PAGE LIFECYCLE SAFETY
// ============================================================

window.addEventListener(
    "pagehide",
    () => {

        stopNSERefreshTimer(
            "pagehide"
        );


        if (
            heartbeatController !== null
        ) {

            try {

                heartbeatController.abort();

            } catch (error) {

                console.debug(
                    "Heartbeat abort during pagehide failed:",
                    error
                );
            }
        }


        running = false;
        heartbeatRunning = false;
    }
);


window.addEventListener(
    "beforeunload",
    () => {

        stopNSERefreshTimer(
            "beforeunload"
        );
    }
);


// ============================================================
// BACKEND
// ============================================================

const BACKEND_URL =
    "http://127.0.0.1:5000";


// ============================================================
// SCHEMA PROTECTION STATE
// ============================================================

let approvedFingerprint = null;
let schemaState = "UNKNOWN";


// ============================================================
// LOAD APPROVED SCHEMA FINGERPRINT
// ============================================================
//
// The approved fingerprint survives page reloads,
// extension reloads, and browser restarts.
//
// We NEVER silently replace an existing approved fingerprint.
// ============================================================

async function loadApprovedFingerprint() {

    try {

        const stored =
            await chrome.storage.local.get(
                [
                    "nse_schema_fingerprint",
                    "nse_schema_version"
                ]
            );


        if (
            stored.nse_schema_fingerprint &&
            stored.nse_schema_version ===
            NSE_SCHEMA_VERSION
        ) {

            approvedFingerprint =
                stored.nse_schema_fingerprint;

            schemaState =
                "APPROVED";


            console.log(
                "🔐 Loaded approved NSE schema:",
                approvedFingerprint
            );


            return;
        }


        approvedFingerprint =
            null;

        schemaState =
            "UNINITIALIZED";


        console.log(
            "🔐 No approved NSE schema stored yet."
        );

    } catch (error) {

        approvedFingerprint =
            null;

        schemaState =
            "STORAGE_ERROR";


        console.error(
            "🚨 Failed to load approved NSE schema:",
            error
        );


        throw new Error(
            "Could not load NSE schema approval."
        );
    }
}


// ============================================================
// STORE FIRST APPROVED SCHEMA
// ============================================================
//
// This is only allowed when there is NO existing approved
// fingerprint.
//
// Once stored, future schemas must match it.
// ============================================================

async function storeApprovedFingerprint(
    fingerprint
) {

    if (
        !fingerprint
    ) {

        throw new Error(
            "Cannot store an empty NSE schema fingerprint."
        );
    }


    // Never overwrite an existing approval.

    if (
        approvedFingerprint !== null
    ) {

        if (
            approvedFingerprint ===
            fingerprint
        ) {

            return;
        }


        throw new Error(
            "Attempted to overwrite an existing " +
            "NSE schema approval."
        );
    }


    await chrome.storage.local.set({

        nse_schema_fingerprint:
            fingerprint,

        nse_schema_version:
            NSE_SCHEMA_VERSION

    });


    approvedFingerprint =
        fingerprint;

    schemaState =
        "APPROVED";


    console.log(
        "✅ First NSE schema fingerprint stored:",
        fingerprint
    );
}


// ============================================================
// EXTRACT ACTUAL NIFTY 50 SPOT
// ============================================================

function extractNiftySpot() {

    const bodyText =
        document.body.innerText
            .replace(/\u00A0/g, " ")
            .replace(/\s+/g, " ")
            .trim();


    // Current NSE format:
    //
    // Underlying Index : NIFTY 24,395.85 As on ...
    //

    const match =
        bodyText.match(
            /Underlying\s+Index\s*:\s*NIFTY\s+([\d,]+\.\d{2})/i
        );


    if (!match) {

        throw new Error(
            "NIFTY 50 spot price not found."
        );
    }


    const spot =
        parseFloat(
            match[1]
                .replace(
                    /,/g,
                    ""
                )
        );


    if (
        !Number.isFinite(spot) ||
        spot <= 0
    ) {

        throw new Error(
            "Invalid NIFTY 50 spot price."
        );
    }


    console.log(
        "NIFTY spot found:",
        spot
    );


    return spot;
}


// ============================================================
// FIND OPTION-CHAIN TABLE
// ============================================================
//
// We do NOT blindly select the first table containing OI,
// VOLUME, LTP and STRIKE.
//
// We first inspect its semantic header structure.
// ============================================================

function findOptionChainTable() {

    const tables =
        Array.from(
            document.querySelectorAll(
                "table"
            )
        );


    if (
        tables.length === 0
    ) {

        throw new Error(
            "No tables found on NSE page."
        );
    }
    const candidates = [];


    for (
        const table
        of tables
    ) {

        const headerInfo =
            findSemanticHeaderRow(
                table
            );


        if (!headerInfo) {

            continue;
        }


        const canonicalColumns =
            buildCanonicalColumns(
                headerInfo.values
            );


        if (!canonicalColumns) {

            continue;
        }


        const expected =
            EXPECTED_SCHEMA.columns;


        let score = 0;


        for (
            let i = 0;
            i <
            Math.min(
                canonicalColumns.length,
                expected.length
            );
            i++
        ) {

            if (
                canonicalColumns[i]
                ===
                expected[i]
            ) {

                score++;
            }
        }


        candidates.push({

            table:
                table,

            score:
                score

        });
    }


    if (
        candidates.length === 0
    ) {

        throw new Error(
            "Option-chain table could not be identified."
        );
    }


    candidates.sort(
        (
            a,
            b
        ) =>
            b.score - a.score
    );


    const best =
        candidates[0];


    if (
        best.score !==
        EXPECTED_SCHEMA.total_columns
    ) {

        throw new Error(
            "Option-chain table detected, " +
            "but its semantic structure does not match."
        );
    }


    return best.table;
}


// ============================================================
// EXTRACT + VALIDATE OPTION CHAIN
// ============================================================
//
// VERY IMPORTANT:
//
// Nothing is sent to Python until:
//
//     1. Table identified
//     2. Headers normalized
//     3. Semantic order validated
//     4. Data shape validated
//     5. Strike structure validated
//     6. Fingerprint validated
//
// ============================================================

async function extractOptionChain() {

    console.log(
        "🔎 Inspecting NSE option-chain schema..."
    );


    const table =
        findOptionChainTable();


    const rows =
        Array.from(
            table.querySelectorAll(
                "tbody tr"
            )
        );


    const extractedRows = [];


    for (
        const row
        of rows
    ) {

        const cells =
            Array.from(
                row.querySelectorAll(
                    "td"
                )
            );


        if (
            cells.length === 0
        ) {

            continue;
        }


        let values =
            cells.map(
                cell =>
                    cell.innerText
                        .replace(
                            /\n/g,
                            " "
                        )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim()
            );


        // Current NSE DOM:
        //
        // 23 DOM cells
        //     ↓
        // remove first + last wrapper cells
        //     ↓
        // 21 useful fields

        if (
            values.length === 23
        ) {

            values =
                values.slice(
                    1,
                    -1
                );
        }


        if (
            values.length !== 21
        ) {

            console.warn(
                "Skipping row with",
                values.length,
                "columns."
            );

            continue;
        }


        extractedRows.push({

            raw:
                values

        });
    }


    if (
        extractedRows.length === 0
    ) {

        throw new Error(
            "No valid option-chain rows found."
        );
    }


    // ========================================================
    // VALIDATE OBSERVED NSE SCHEMA
    // ========================================================

    const validation =
        await validateOptionChainSchema(
            table,
            extractedRows.map(
                item =>
                    item.raw
            )
        );


    console.log(
        "🔐 NSE schema validation:",
        validation
    );


    // --------------------------------------------------------
    // Schema itself is invalid
    // --------------------------------------------------------

    if (
        !validation.valid
    ) {

        schemaState =
            "INVALID";


        throw new Error(
            "NSE schema validation failed: " +
            validation.reason
        );
    }


    // ========================================================
    // FIRST-EVER APPROVAL
    // ========================================================
    //
    // Only possible when there is no stored fingerprint.
    //
    // This establishes the CURRENT KNOWN-GOOD NSE schema as
    // the permanent baseline.
    // ========================================================

    if (
        approvedFingerprint === null
    ) {

        await storeApprovedFingerprint(
            validation.fingerprint
        );
    }


    // ========================================================
    // PERMANENT FINGERPRINT CHECK
    // ========================================================

    if (
        validation.fingerprint
        !==
        approvedFingerprint
    ) {

        schemaState =
            "BLOCKED";


        console.error(
            "🚨 NSE SCHEMA CHANGED",
            {
                approved:
                    approvedFingerprint,

                observed:
                    validation.fingerprint
            }
        );


        throw new Error(
            "NSE schema fingerprint changed."
        );
    }


    schemaState =
        "VERIFIED";


    console.log(
        "✅ NSE schema verified:",
        validation.fingerprint
    );


    return {

        rows: extractedRows,

        schema_fingerprint:
            validation.fingerprint,

        schema_version:
            NSE_SCHEMA_VERSION,

        schema_columns:
            validation.details.semantic_headers

    };

}


// ============================================================
// SEND VERIFIED SNAPSHOT TO PYTHON
// ============================================================

async function sendToBackend() {

    if (!running) {
        return false;
    }


    try {

        // ----------------------------------------------------
        // Extract and validate BEFORE transmission
        // ----------------------------------------------------

        const data =
            await extractOptionChain();


        if (!running) {
            return false;
        }


        console.log(
            `Extracted ${data.rows.length} ` +
            "verified option rows"
        );


        // ----------------------------------------------------
        // Extract NIFTY spot
        // ----------------------------------------------------

        let niftySpot = null;


        try {

            niftySpot =
                extractNiftySpot();


            console.log(
                `NIFTY Spot: ${niftySpot}`
            );

        } catch (spotError) {

            console.warn(
                "NIFTY spot extraction failed:",
                spotError
            );

            // The option-chain schema itself is already
            // verified, so the snapshot may continue.
        }


        // ----------------------------------------------------
        // Build payload
        // ----------------------------------------------------

        data.nifty_spot =
            niftySpot;


        console.log(
            "Verified schema fingerprint:",
            data.schema_fingerprint
        );


        if (!running) {
            return false;
        }


        console.log(
            "Sending verified data to Python backend..."
        );


        // ----------------------------------------------------
        // POST /update
        // ----------------------------------------------------

        let response;


        try {

            response =
                await fetch(
                    `${BACKEND_URL}/update`,
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        cache:
                            "no-store",

                        body:
                            JSON.stringify(
                                data
                            )
                    }
                );

        } catch (networkError) {

            // A connection-level failure is the strongest
            // indication that terminate.bat / Python has gone.
            console.error(
                "🚨 Python backend connection lost:",
                networkError
            );


            safeRuntimeNotify({
                action:
                    "FEED_ERROR",

                reason:
                    String(
                        networkError?.message ||
                        "Python backend connection lost."
                    )
            });


            stopFeed(
                "Python backend connection lost"
            );


            return false;
        }


        // ----------------------------------------------------
        // Parse JSON safely.
        // ----------------------------------------------------

        let result = null;

        try {

            result =
                await response.json();

        } catch (jsonError) {

            console.error(
                "Python backend returned invalid JSON:",
                jsonError
            );


            await setRuntimeState({

                running:
                    true,

                backendState:
                    "CONNECTED",

                excelState:
                    "STALE",

                schemaState:
                    schemaState,

                nse_schema_state:
                    schemaState,

                fingerprintActive:
                    true,

                nse_schema_fingerprint:
                    data.schema_fingerprint

            });


            safeRuntimeNotify({
                action:
                    "FEED_ERROR",

                reason:
                    "Python backend returned invalid JSON."
            });


            return false;
        }


        console.log(
            "Python response:",
            result
        );


        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        if (
            response.ok &&
            result.status ===
            "success"
        ) {

            await setRuntimeState({

                running:
                    true,

                backendState:
                    "CONNECTED",

                excelState:
                    "UPDATING",

                schemaState:
                    "VERIFIED",

                nse_schema_state:
                    "VERIFIED",

                fingerprintActive:
                    true,

                nse_schema_fingerprint:
                    data.schema_fingerprint,

                lastUpdate:
                    Date.now(),

                rows:
                    result.rows_written

            });


            safeRuntimeNotify({

                action:
                    "FEED_SUCCESS",

                rows:
                    result.rows_written,

                nifty_spot:
                    result.nifty_spot,

                last_feed:
                    result.last_feed

            });


            return true;
        }


        // ----------------------------------------------------
        // APPLICATION / SERVER ERROR
        // ----------------------------------------------------

        await setRuntimeState({

            running:
                true,

            backendState:
                "CONNECTED",

            excelState:
                "STALE",

            schemaState:
                schemaState,

            nse_schema_state:
                schemaState,

            fingerprintActive:
                true,

            nse_schema_fingerprint:
                data.schema_fingerprint

        });


        safeRuntimeNotify({

            action:
                "FEED_ERROR",

            reason:
                result?.message ||
                `Backend HTTP ${response.status}`

        });


        // IMPORTANT:
        // Do not automatically kill the feed merely because the
        // application rejected one snapshot. The heartbeat is the
        // authority for determining whether Python is actually alive.
        return false;


    } catch (
    error
    ) {

        console.error(
            "NSE → Excel failed:",
            error
        );


        if (
            isExtensionContextInvalidated(error)
        ) {

            stopNSERefreshTimer(
                "extension context invalidated"
            );


            void setRuntimeState({

                running:
                    false,

                backendState:
                    "DISCONNECTED",

                excelState:
                    "STOPPED",

                schemaState:
                    "UNMOUNTED",

                nse_schema_state:
                    "UNMOUNTED",

                fingerprintActive:
                    false

            });


            return false;
        }


        // ----------------------------------------------------
        // Identify schema failures separately
        // ----------------------------------------------------

        const message =
            String(
                error?.message ||
                ""
            );


        const isSchemaError =
            message
                .toLowerCase()
                .includes("schema");


        if (
            isSchemaError
        ) {

            schemaState =
                "BLOCKED";


            safeRuntimeNotify({

                action:
                    "SCHEMA_BLOCKED",

                reason:
                    message

            });


            // A schema violation is a hard safety stop.
            stopFeed(
                "schema validation failure"
            );


            return false;
        }


        safeRuntimeNotify({

            action:
                "FEED_ERROR",

            reason:
                message

        });


        return false;
    }
}

// ============================================================
// PYTHON-CONTROLLED HEARTBEAT
// ============================================================
//
// NO setInterval().
//
// Python controls the 3-second cadence through:
//
//     GET /heartbeat
//
// ============================================================

async function waitForNextTick() {

    if (
        !running ||
        heartbeatRunning
    ) {

        return;
    }


    heartbeatRunning =
        true;


    try {

        while (running) {

            heartbeatController =
                new AbortController();


            console.log(
                "Waiting for Python heartbeat..."
            );


            let response;


            try {

                response =
                    await fetch(
                        `${BACKEND_URL}/heartbeat`,
                        {
                            method:
                                "GET",

                            cache:
                                "no-store",

                            signal:
                                heartbeatController
                                    .signal
                        }
                    );

            } catch (networkError) {

                // ------------------------------------------------
                // This is the key shutdown path for terminate.bat.
                // If Flask/Python is killed, the heartbeat connection
                // fails and the entire browser-side feed is stopped.
                // ------------------------------------------------

                if (
                    networkError?.name ===
                    "AbortError"
                ) {

                    console.log(
                        "Heartbeat request aborted."
                    );

                    return;
                }


                console.error(
                    "🚨 Heartbeat connection failed — stopping feed:",
                    networkError
                );


                safeRuntimeNotify({

                    action:
                        "FEED_ERROR",

                    reason:
                        String(
                            networkError?.message ||
                            "Python heartbeat connection failed."
                        )

                });


                stopFeed(
                    "Python heartbeat connection lost"
                );


                return;
            }


            if (!response.ok) {

                console.error(
                    "🚨 Heartbeat HTTP failure — stopping feed:",
                    response.status
                );


                safeRuntimeNotify({

                    action:
                        "FEED_ERROR",

                    reason:
                        `Heartbeat HTTP ${response.status}`

                });


                stopFeed(
                    `Heartbeat HTTP ${response.status}`
                );


                return;
            }


            let result;


            try {

                result =
                    await response.json();

            } catch (jsonError) {

                console.error(
                    "🚨 Invalid heartbeat JSON — stopping feed:",
                    jsonError
                );


                safeRuntimeNotify({

                    action:
                        "FEED_ERROR",

                    reason:
                        "Invalid Python heartbeat response."

                });


                stopFeed(
                    "invalid heartbeat response"
                );


                return;
            }


            console.log(
                "Python heartbeat:",
                result
            );


            // ========================================================
            // MARKET SESSION CLOSED
            // ========================================================
            //
            // The backend explicitly tells us that the NSE session
            // is closed.
            //
            // This is different from a generic backend failure.
            //
            // Sequence:
            //
            //     backend → market_closed
            //          ↓
            //     notify background.js
            //          ↓
            //     background.js closes ONLY #nifty-feed
            //          ↓
            //     stop local feed lifecycle
            //
            // Normal NSE tabs are untouched.
            // Streamlit and Excel are untouched.
            // ========================================================

            if (
                result &&
                (
                    result.status ===
                    "market_closed"
                    ||
                    result.market_state ===
                    "CLOSED"
                )
            ) {

                console.log(
                    "🔴 NSE MARKET CLOSED → shutting down feed."
                );


                safeRuntimeNotify({

                    action:
                        "MARKET_CLOSED",

                    marketState:
                        "CLOSED",

                    reason:
                        result.message ||
                        "NSE market session closed."

                });


                // Stop heartbeat + NSE refresh locally.
                //
                // The background service worker will close ONLY the
                // dedicated #nifty-feed tab.

                stopFeed(
                    "NSE market session closed",
                    true
                );


                return;
            }


            // ========================================================
            // NORMAL HEARTBEAT
            // ========================================================

            if (!running) {
                return;
            }


            // --------------------------------------------------------
            // Python tick arrived.
            // A new snapshot is now captured and validated.
            // --------------------------------------------------------

            await sendToBackend();


            if (!running) {
                return;
            }
        }


    } catch (error) {

        if (
            error?.name ===
            "AbortError"
        ) {

            console.log(
                "Heartbeat request aborted."
            );

            return;
        }


        if (
            isExtensionContextInvalidated(error)
        ) {

            console.log(
                "🛑 Extension context invalidated — stopping NSE refresh timer."
            );


            stopNSERefreshTimer(
                "extension context invalidated"
            );


            return;
        }


        console.error(
            "Heartbeat failed — stopping feed:",
            error
        );


        safeRuntimeNotify({

            action:
                "FEED_ERROR",

            reason:
                String(
                    error?.message ||
                    "Heartbeat failed."
                )

        });


        stopFeed(
            "heartbeat failure"
        );


        return;

    } finally {

        heartbeatController =
            null;


        heartbeatRunning =
            false;
    }
}


// ============================================================
// START LIVE FEED
// ============================================================

async function startFeed() {

    if (running) {

        // If a START request arrives while already running,
        // do not create a second heartbeat or refresh timer.

        startNSERefreshTimer();

        return;
    }


    if (!isNSEOptionChainPage()) {

        console.log(
            "⏸️ Feed not started: this is a normal NSE view tab."
        );

        return;
    }


    // A manual STOP prevents the delayed automatic-start timer
    // from immediately bringing the feed back to life.

    stopRequested = false;
    running = true;


    try {

        // ----------------------------------------------------
        // Load the permanent schema approval.
        // ----------------------------------------------------

        await loadApprovedFingerprint();


        if (!running) {

            return;
        }


        console.log(
            "NSE → Excel live feed STARTED"
        );


        safeRuntimeNotify({

            action:
                "FEED_STARTED"

        });


        // ----------------------------------------------------
        // IMPORTANT:
        //
        // Start the Python-controlled heartbeat FIRST.
        //
        // The heartbeat is now the authority for determining
        // whether the market is:
        //
        //     OPEN
        //     PRE_OPEN
        //     CLOSED
        //     SPECIAL
        //
        // We must NOT send the first /update snapshot before
        // this check.
        // ----------------------------------------------------

        if (!heartbeatRunning) {

            void waitForNextTick();

        }


        // ----------------------------------------------------
        // Give the heartbeat loop a moment to perform its first
        // market-state check.
        //
        // This prevents startup from immediately trying to
        // extract/send a snapshot while the heartbeat is still
        // determining whether the market is open.
        // ----------------------------------------------------

        await new Promise(
            resolve => {

                setTimeout(
                    resolve,
                    100
                );

            }
        );


        if (!running) {

            return;
        }


        // ----------------------------------------------------
        // The heartbeat loop itself will call sendToBackend()
        // when Python reports a normal market tick.
        //
        // Therefore we DO NOT call sendToBackend() here.
        //
        // This prevents:
        //
        //     CLOSED market
        //          ↓
        //     POST /update
        //          ↓
        //     connection failure
        //
        // and instead gives us:
        //
        //     CLOSED market
        //          ↓
        //     /heartbeat
        //          ↓
        //     MARKET_CLOSED
        //          ↓
        //     close #nifty-feed
        //
        // ----------------------------------------------------


        // ----------------------------------------------------
        // Start NSE internal refresh ONLY after the feed has
        // successfully entered its live lifecycle.
        //
        // If the heartbeat immediately reports MARKET_CLOSED,
        // stopFeed() will set running = false and this timer
        // will therefore NOT be started.
        // ----------------------------------------------------

        if (
            running &&
            heartbeatRunning
        ) {

            startNSERefreshTimer();

        }


    } catch (
        error
    ) {

        console.error(
            "Feed startup failed:",
            error
        );


        if (
            isExtensionContextInvalidated(error)
        ) {

            stopNSERefreshTimer(
                "extension context invalidated"
            );


            running = false;
            heartbeatRunning = false;


            return;
        }


        stopFeed(
            "feed startup failure"
        );


        safeRuntimeNotify({

            action:
                "SCHEMA_BLOCKED",

            reason:
                String(
                    error?.message ||
                    "Feed startup failed."
                )

        });

    }

}


// ============================================================
// STOP LIVE FEED
// ============================================================

function stopFeed(
    reason = "manual stop",
    cancelAutoStart = false
) {

    // --------------------------------------------------------
    // IMPORTANT:
    // Never return merely because running is false.
    // The NSE timer or a delayed callback may still exist.
    // --------------------------------------------------------

    running = false;


    if (cancelAutoStart) {

        stopRequested = true;


        if (
            autoStartTimer !== null
        ) {

            clearTimeout(
                autoStartTimer
            );

            autoStartTimer = null;
        }
    }


    // --------------------------------------------------------
    // Stop NSE internal refresh first.
    // --------------------------------------------------------

    stopNSERefreshTimer(
        reason
    );


    // --------------------------------------------------------
    // Cancel current Python heartbeat.
    // --------------------------------------------------------

    if (
        heartbeatController !== null
    ) {

        try {

            heartbeatController.abort();

        } catch (error) {

            console.debug(
                "Heartbeat abort failed:",
                error
            );
        }

        heartbeatController =
            null;
    }


    heartbeatRunning = false;


    void setRuntimeState({

        running:
            false,

        backendState:
            "DISCONNECTED",

        excelState:
            "STOPPED",

        schemaState:
            "UNMOUNTED",

        nse_schema_state:
            "UNMOUNTED",

        fingerprintActive:
            false
    });


    console.log(
        `🛑 NSE → Excel live feed STOPPED (${reason})`
    );


    // --------------------------------------------------------
    // Persist stopped state safely.
    // --------------------------------------------------------

    try {

        chrome.storage.local.set({
            running: false
        });

    } catch (error) {

        if (
            !isExtensionContextInvalidated(error)
        ) {

            console.debug(
                "Could not persist stopped state:",
                error
            );
        }
    }
}


// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        // ----------------------------------------------------
        // START
        // ----------------------------------------------------

        if (
            message.action ===
            "START"
        ) {

            stopRequested = false;


            if (
                autoStartTimer !== null
            ) {

                clearTimeout(
                    autoStartTimer
                );

                autoStartTimer = null;
            }


            void startFeed();


            sendResponse({
                status:
                    "started"
            });


            return true;
        }


        // ----------------------------------------------------
        // STOP
        // ----------------------------------------------------

        if (
            message.action ===
            "STOP"
        ) {

            stopFeed(
                "manual stop",
                true
            );


            sendResponse({
                status:
                    "stopped"
            });


            return true;
        }


        // ----------------------------------------------------
        // STATUS
        // ----------------------------------------------------

        if (
            message.action ===
            "STATUS"
        ) {

            sendResponse({

                running:
                    running,

                heartbeatRunning:
                    heartbeatRunning,

                nseRefreshRunning:
                    nsePageRefreshTimer !== null,

                backendState:
                    running
                        ? "CONNECTED"
                        : "DISCONNECTED",

                excelState:
                    running
                        ? "UPDATING"
                        : "STOPPED",

                schemaFingerprint:
                    approvedFingerprint,

                schemaState:
                    running
                        ? schemaState
                        : "UNMOUNTED",

                fingerprintActive:
                    running,

                nse_schema_fingerprint:
                    running
                        ? approvedFingerprint
                        : null

            });


            return true;
        }
    }
);


// ============================================================
// AUTOMATIC START
// ============================================================

autoStartTimer =
    setTimeout(
        () => {

            autoStartTimer = null;


            if (
                stopRequested
            ) {

                console.log(
                    "Automatic NSE feed start cancelled by STOP."
                );

                return;
            }


            if (
                !isNSEOptionChainPage()
            ) {

                console.log(
                    "Normal NSE tab detected → feed disabled on this tab."
                );

                return;
            }


            console.log(
                "NSE Option Chain detected " +
                "→ starting protected feed."
            );


            void startFeed();

        },
        AUTO_START_DELAY
    );


// chrome.storage.local.remove([
//     "nse_schema_fingerprint",
//     "nse_schema_version"
// ]).then(() => {

//     console.log(
//         "🧹 Old NSE schema fingerprint removed."
//     );

// });
