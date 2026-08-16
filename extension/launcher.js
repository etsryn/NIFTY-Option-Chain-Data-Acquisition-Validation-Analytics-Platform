// ============================================================
// NIFTY EXTENSION LAUNCHER
// ============================================================
//
// This page is opened by setup.vbs.
//
// Its job is to:
//
//     1. Ensure Streamlit exists.
//     2. Ensure exactly one dedicated NSE feed tab exists.
//     3. Reload the dedicated feed tab so its content script is
//        definitely initialized.
//     4. Wait until content.js is ready.
//     5. Explicitly START the feed.
//     6. Close this temporary launcher tab.
//
// Normal NSE view tabs are never touched.
//
// ============================================================

(async () => {

    try {

        console.log(
            "🚀 NIFTY launcher started."
        );


        // ====================================================
        // REQUEST TAB SYNCHRONIZATION
        // ====================================================

        const result =
            await chrome.runtime.sendMessage({

                action:
                    "ENSURE_TABS"

            });


        // ====================================================
        // CHECK RESULT
        // ====================================================

        if (
            !result ||
            !result.success
        ) {

            console.error(
                "❌ Browser tab synchronization failed:",
                result?.error ||
                "Unknown error"
            );


            return;
        }


        console.log(
            "✅ Browser tabs synchronized.",
            result
        );


        // ====================================================
        // GET DEDICATED NSE FEED TAB ID
        // ====================================================

        const feedTabId =
            result.nse?.tabId;


        if (
            !Number.isInteger(
                feedTabId
            )
        ) {

            console.error(
                "❌ No valid NSE feed tab ID returned."
            );


            return;
        }


        console.log(
            "🎯 NSE feed tab selected:",
            feedTabId
        );


        // ====================================================
        // RELOAD THE DEDICATED NSE FEED TAB
        // ====================================================
        //
        // This solves the case where the tab already existed
        // from a previous session but its content.js instance
        // had already stopped or disappeared.
        //
        // ONLY the dedicated #nifty-feed tab is reloaded.
        //
        // Normal NSE view tabs are untouched.
        //
        // ====================================================

        console.log(
            "🔄 Reloading dedicated NSE feed tab:",
            feedTabId
        );


        try {

            await chrome.tabs.reload(
                feedTabId
            );


        } catch (error) {

            console.error(
                "❌ Could not reload NSE feed tab:",
                error
            );


            return;
        }


        // ====================================================
        // WAIT FOR CONTENT.JS TO BECOME READY
        // ====================================================
        //
        // A tab can finish navigation before the content script
        // has registered its runtime message listener.
        //
        // Therefore we repeatedly attempt START for up to
        // 15 seconds.
        //
        // ====================================================

        const START_TIMEOUT =
            15000;


        const START_POLL_INTERVAL =
            500;


        const startDeadline =
            Date.now() +
            START_TIMEOUT;


        let feedStarted =
            false;


        while (
            Date.now() <
            startDeadline
        ) {

            try {

                // ------------------------------------------------
                // Make sure the tab still exists.
                // ------------------------------------------------

                const tab =
                    await chrome.tabs.get(
                        feedTabId
                    );


                if (
                    !tab
                ) {

                    console.error(
                        "❌ NSE feed tab no longer exists."
                    );


                    break;
                }


                // ------------------------------------------------
                // Attempt START.
                // ------------------------------------------------

                console.log(
                    "▶️ Attempting to start NSE feed:",
                    feedTabId
                );


                const startResult =
                    await chrome.tabs.sendMessage(
                        feedTabId,
                        {
                            action:
                                "START"
                        }
                    );


                console.log(
                    "✅ NSE feed START response:",
                    startResult
                );


                feedStarted =
                    true;


                break;


            } catch (error) {

                console.debug(
                    "⏳ NSE feed content script not ready yet. Retrying..."
                );


                await new Promise(
                    resolve => {

                        setTimeout(
                            resolve,
                            START_POLL_INTERVAL
                        );

                    }
                );
            }
        }


        // ====================================================
        // START RESULT
        // ====================================================

        if (
            !feedStarted
        ) {

            console.error(
                "❌ NSE feed content script did not become ready " +
                "within 15 seconds."
            );

        } else {

            console.log(
                "✅ NSE feed lifecycle successfully started."
            );
        }


    } catch (error) {

        console.error(
            "❌ Launcher error:",
            error
        );

    }


    // ========================================================
    // CLOSE THIS LAUNCHER TAB
    // ========================================================
    //
    // setup.vbs opened this page only as a temporary bridge.
    //
    // ========================================================

    try {

        window.close();

    } catch (error) {

        console.debug(
            "Launcher tab could not close itself:",
            error
        );
    }


})();