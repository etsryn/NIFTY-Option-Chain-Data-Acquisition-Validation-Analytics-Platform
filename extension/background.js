// ============================================================
// CONFIGURATION
// ============================================================

const NSE_OPTION_CHAIN_URL =
    "https://www.nseindia.com/option-chain#nifty-feed";

const STREAMLIT_URL =
    "http://localhost:8501/";


// ============================================================
// TAB SYNCHRONIZATION LOCK
// ============================================================
//
// IMPORTANT:
//
// ENSURE_TABS can be triggered multiple times very quickly.
//
// Without a lock:
//
//     Request A → sees no Streamlit → creates one
//     Request B → sees no Streamlit → creates another
//
// With this lock:
//
//     Request A → performs synchronization
//     Request B → waits for Request A
//     Request C → waits for Request A
//
// After A finishes, B/C see the already-created tabs and
// simply reuse them.
//
// ============================================================

let tabSyncPromise = null;

// ============================================================
// DEDICATED NSE FEED TAB
// ============================================================
//
// We remember the exact Chrome tab ID used for automation.
//
// This is more reliable than trying to identify the feed tab
// from the URL at shutdown time.
//

let feedTabId = null;

// ============================================================
// LOAD REGISTERED FEED TAB ID
// ============================================================

async function loadFeedTabId() {

    try {

        const stored =
            await chrome.storage.local.get(
                "nifty_feed_tab_id"
            );


        if (
            Number.isInteger(
                stored.nifty_feed_tab_id
            )
        ) {

            feedTabId =
                stored.nifty_feed_tab_id;


            console.log(
                "🎯 Loaded registered NSE feed tab:",
                feedTabId
            );

        }

    } catch (error) {

        console.warn(
            "Could not load registered NSE feed tab:",
            error
        );
    }
}

void loadFeedTabId();

// ============================================================
// RUNTIME / FEED MESSAGES
// ============================================================

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        // ====================================================
        // FEED SUCCESS
        // ====================================================

        if (
            message.action ===
            "FEED_SUCCESS"
        ) {

            chrome.storage.local.set({

                running:
                    true,

                lastUpdate:
                    Date.now(),

                rows:
                    message.rows,

                backend:
                    "Connected",

                backendState:
                    "CONNECTED",

                excelState:
                    "UPDATING"

            });

            return;
        }


        // ====================================================
        // FEED ERROR
        // ====================================================

        if (
            message.action ===
            "FEED_ERROR"
        ) {

            chrome.storage.local.set({

                backend:
                    "Offline",

                backendState:
                    "DISCONNECTED"

            });

            return;
        }


        // ====================================================
        // FEED STARTED
        // ====================================================

        if (
            message.action ===
            "FEED_STARTED"
        ) {

            chrome.storage.local.set({

                running:
                    true,

                backendState:
                    "CONNECTED",

                excelState:
                    "UPDATING"

            });

            return;
        }


        // ====================================================
        // MARKET SESSION CLOSED
        // ====================================================
        //
        // Only the dedicated NSE feed tab is allowed to be
        // closed here.
        //
        // We identify it by its stored Chrome tab ID instead
        // of relying on sender.tab.url / URL fragments.
        //

        if (
            message.action ===
            "MARKET_CLOSED"
        ) {

            // ------------------------------------------------
            // Require a valid originating tab.
            // ------------------------------------------------

            if (
                !sender.tab ||
                !sender.tab.id
            ) {

                sendResponse({

                    success:
                        false,

                    error:
                        "No valid originating tab."

                });

                return true;
            }


            const originatingTabId =
                sender.tab.id;


            // ------------------------------------------------
            // Verify against the dedicated feed tab ID.
            // ------------------------------------------------

            if (
                feedTabId === null ||
                originatingTabId !== feedTabId
            ) {

                console.warn(
                    "⚠️ MARKET_CLOSED received from " +
                    "a tab that is not the registered NSE feed tab.",
                    {
                        originatingTabId:
                            originatingTabId,

                        feedTabId:
                            feedTabId
                    }
                );


                sendResponse({

                    success:
                        false,

                    error:
                        "Message did not originate from the registered NSE feed tab."

                });


                return true;
            }


            // ------------------------------------------------
            // Update runtime state.
            // ------------------------------------------------

            chrome.storage.local.set({

                running:
                    false,

                backend:
                    "Disconnected",

                backendState:
                    "DISCONNECTED",

                excelState:
                    "STOPPED",

                schemaState:
                    "UNMOUNTED",

                nse_schema_state:
                    "UNMOUNTED",

                fingerprintActive:
                    false,

                marketState:
                    "CLOSED",

                marketClosedAt:
                    Date.now(),

                nifty_feed_tab_id:
                    null

            });


            console.log(
                "🔴 NSE market session closed."
            );


            console.log(
                "🗑️ Closing registered NSE feed tab:",
                feedTabId
            );


            // ------------------------------------------------
            // Respond first.
            // ------------------------------------------------

            sendResponse({

                success:
                    true,

                action:
                    "FEED_TAB_CLOSED"

            });


            // ------------------------------------------------
            // Close the exact registered feed tab.
            // ------------------------------------------------

            const tabToClose =
                feedTabId;


            feedTabId =
                null;


            setTimeout(
                () => {

                    chrome.tabs.remove(
                        tabToClose
                    ).then(
                        () => {

                            console.log(
                                "✅ NSE feed tab closed:",
                                tabToClose
                            );

                        }
                    ).catch(
                        error => {

                            console.warn(
                                "Could not close NSE feed tab:",
                                error
                            );

                        }
                    );

                },
                100
            );


            return true;
        }

        // ====================================================
        // ENSURE BROWSER TABS
        // ====================================================
        //
        // Guarantees:
        //
        //     1 Streamlit tab
        //     1 NSE option-chain tab
        //
        // Existing tabs are reused.
        // Missing tabs are created.
        // Duplicate matching tabs are closed.
        //
        // A synchronization lock prevents simultaneous launch
        // requests from creating duplicate tabs.
        //
        // ====================================================

        if (
            message.action ===
            "ENSURE_TABS"
        ) {

            // ------------------------------------------------
            // If synchronization is already running, attach
            // this request to the existing Promise.
            // ------------------------------------------------

            if (
                tabSyncPromise !==
                null
            ) {

                tabSyncPromise
                    .then(
                        result => {

                            sendResponse(
                                result
                            );

                        }
                    )
                    .catch(
                        error => {

                            sendResponse({

                                success:
                                    false,

                                error:
                                    String(
                                        error?.message ||
                                        error
                                    )

                            });

                        }
                    );


                return true;
            }


            // ------------------------------------------------
            // Start new synchronization.
            // ------------------------------------------------

            tabSyncPromise =
                ensureRequiredTabs();


            // ------------------------------------------------
            // Return result to caller.
            // ------------------------------------------------

            tabSyncPromise
                .then(
                    result => {

                        sendResponse(
                            result
                        );

                    }
                )
                .catch(
                    error => {

                        console.error(
                            "Tab manager error:",
                            error
                        );


                        sendResponse({

                            success:
                                false,

                            error:
                                String(
                                    error?.message ||
                                    error
                                )

                        });

                    }
                )
                .finally(
                    () => {

                        // Release lock only after the entire
                        // synchronization has completed.

                        tabSyncPromise =
                            null;

                    }
                );


            // The response is asynchronous.
            return true;
        }


        // ====================================================
        // NSE INTERNAL REFRESH
        // ====================================================

        if (
            message.action !==
            "CLICK_NSE_REFRESH"
        ) {

            return;
        }


        // ----------------------------------------------------
        // Make sure request came from a real tab
        // ----------------------------------------------------

        if (
            !sender.tab ||
            !sender.tab.id
        ) {

            sendResponse({

                success:
                    false,

                error:
                    "No valid NSE tab."

            });

            return;
        }


        // ----------------------------------------------------
        // Execute inside NSE MAIN page context
        // ----------------------------------------------------

        chrome.scripting.executeScript({

            target: {

                tabId:
                    sender.tab.id

            },

            world:
                "MAIN",

            func: () => {

                const refreshButton =
                    document.getElementById(
                        "refresh_option_chain_eq"
                    );


                if (
                    !refreshButton
                ) {

                    return {

                        success:
                            false,

                        error:
                            "NSE refresh button not found."

                    };
                }


                // This is exactly the same click that
                // worked when tested manually in DevTools.

                refreshButton.click();


                return {

                    success:
                        true

                };

            }

        })

            .then(
                results => {

                    const result =
                        results &&
                            results.length > 0

                            ? results[0].result

                            : {

                                success:
                                    false,

                                error:
                                    "No execution result."

                            };


                    sendResponse(
                        result
                    );

                }
            )

            .catch(
                error => {

                    console.error(
                        "NSE refresh execution error:",
                        error
                    );


                    sendResponse({

                        success:
                            false,

                        error:
                            error.message

                    });

                }
            );


        // Keep the message channel open because the
        // executeScript call is asynchronous.

        return true;
    }
);


// ============================================================
// ENSURE REQUIRED TABS
// ============================================================

async function ensureRequiredTabs() {

    console.log(
        "🔐 Starting browser tab synchronization..."
    );


    const tabs =
        await chrome.tabs.query({});


    // ========================================================
    // STREAMLIT
    // ========================================================

    const streamlitTabs =
        tabs.filter(
            tab => {

                if (
                    typeof tab.url !==
                    "string"
                ) {

                    return false;
                }


                return (

                    tab.url.startsWith(
                        "http://localhost:8501"
                    )

                    ||

                    tab.url.startsWith(
                        "http://127.0.0.1:8501"
                    )

                );

            }
        );


    // ========================================================
    // NSE OPTION CHAIN
    // ========================================================

    const nseFeedTabs =
        tabs.filter(
            tab => {

                if (
                    typeof tab.url !==
                    "string"
                ) {

                    return false;
                }


                return (
                    tab.url.includes(
                        "nseindia.com/option-chain"
                    )
                    &&
                    tab.url.includes(
                        "#nifty-feed"
                    )
                );

            }
        );


    // ========================================================
    // ENSURE STREAMLIT
    // ========================================================

    const streamlitResult =
        await ensureSingleTab({

            tabs:
                streamlitTabs,

            createUrl:
                STREAMLIT_URL,

            name:
                "Streamlit"

        });


    // ========================================================
    // ENSURE NSE
    // ========================================================

    const nseResult =
        await ensureSingleTab({

            tabs:
                nseFeedTabs,

            createUrl:
                NSE_OPTION_CHAIN_URL,

            name:
                "NSE Feed"

        });

    // ========================================================
    // REGISTER DEDICATED NSE FEED TAB
    // ========================================================

    feedTabId =
        nseResult.tabId;


    await chrome.storage.local.set({

        nifty_feed_tab_id:
            feedTabId

    });


    console.log(
        "🎯 Registered NSE feed tab:",
        feedTabId
    );

    // ========================================================
    // FINAL RESPONSE
    // ========================================================

    const result = {

        success:
            true,

        streamlit: {

            action:
                streamlitResult.action,

            tabId:
                streamlitResult.tabId

        },

        nse: {

            action:
                nseResult.action,

            tabId:
                nseResult.tabId

        }

    };


    console.log(
        "✅ Browser tab synchronization complete:",
        result
    );


    return result;
}


// ============================================================
// ENSURE EXACTLY ONE MATCHING TAB
// ============================================================

async function ensureSingleTab(
    options
) {

    const tabs =
        options.tabs || [];


    // ========================================================
    // EXISTING TAB FOUND
    // ========================================================

    if (
        tabs.length > 0
    ) {

        // Keep the first matching tab.
        const keepTab =
            tabs[0];


        // ====================================================
        // CLOSE DUPLICATES
        // ====================================================

        for (
            let i = 1;
            i < tabs.length;
            i++
        ) {

            const duplicate =
                tabs[i];


            if (
                duplicate.id ===
                keepTab.id
            ) {

                continue;
            }


            try {

                await chrome.tabs.remove(
                    duplicate.id
                );


                console.log(
                    `🧹 Closed duplicate ${options.name} tab:`,
                    duplicate.id
                );

            } catch (error) {

                console.warn(
                    `Could not close duplicate ${options.name} tab:`,
                    error
                );
            }
        }


        // ====================================================
        // FOCUS THE EXISTING TAB
        // ====================================================

        try {

            await chrome.tabs.update(

                keepTab.id,

                {
                    active:
                        true
                }

            );


            if (
                keepTab.windowId !==
                undefined
            ) {

                await chrome.windows.update(

                    keepTab.windowId,

                    {
                        focused:
                            true
                    }

                );
            }


        } catch (error) {

            console.warn(
                `Could not focus existing ${options.name} tab:`,
                error
            );
        }


        console.log(
            `♻️ Reusing existing ${options.name} tab:`,
            keepTab.id
        );


        return {

            action:
                "reused",

            tabId:
                keepTab.id

        };
    }


    // ========================================================
    // NO TAB FOUND → CREATE ONE
    // ========================================================

    const newTab =
        await chrome.tabs.create({

            url:
                options.createUrl,

            active:
                true

        });


    console.log(
        `🆕 Created ${options.name} tab:`,
        newTab.id
    );


    return {

        action:
            "created",

        tabId:
            newTab.id

    };
}

// ============================================================
// FEED TAB REMOVED
// ============================================================
//
// If the dedicated NSE feed tab is manually closed,
// clear its stored ID so the next launch creates/reuses
// a fresh valid feed tab.
//

chrome.tabs.onRemoved.addListener(
    async (
        tabId
    ) => {

        if (
            tabId !== feedTabId
        ) {

            return;
        }


        console.log(
            "🧹 Registered NSE feed tab was closed:",
            tabId
        );


        feedTabId =
            null;


        try {

            await chrome.storage.local.set({

                nifty_feed_tab_id:
                    null

            });


            console.log(
                "✅ NSE feed tab ID cleared."
            );

        } catch (error) {

            console.warn(
                "Could not clear NSE feed tab ID:",
                error
            );
        }

    }
);