# NIFTY Option Chain Data Acquisition, Validation & Analytics Platform

> **A local, browser-driven NSE NIFTY 50 option-chain acquisition, validation, Excel persistence, and Streamlit analytics platform with a dedicated automation tab, schema/fingerprint protection, backend-controlled heartbeat cadence, market-session awareness, duplicate-tab prevention, lifecycle management, and automatic market-close shutdown.**

---

## 1. Project Identity

**Project:** NIFTY Option Chain Data Acquisition, Validation & Analytics Platform  
**Repository:** https://github.com/etsryn/NIFTY-Option-Chain-Data-Acquisition-Validation-Analytics-Platform  
**Primary NSE source:** https://www.nseindia.com/option-chain  
**Primary Python backend:** `backend/server.py`  
**Browser automation layer:** Chrome Extension / Manifest V3  
**Persistence target:** Microsoft Excel via `xlwings`  
**Analytics/dashboard layer:** Streamlit  
**Launcher:** `launch.bat` → `setup.vbs` → Chrome extension launcher  
**Shutdown controller:** `terminate.bat`

---

# 2. Executive Overview

This project was built as a local end-to-end market-data pipeline around the NSE NIFTY 50 option chain.

The system intentionally does **not** treat the NSE webpage as a static webpage to be scraped once. Instead, the browser itself acts as the controlled acquisition environment while Python acts as the validation, persistence, timing, and backend orchestration layer.

At a high level:

```text
                         ┌──────────────────────────────┐
                         │       NSE Option Chain       │
                         │ https://www.nseindia.com/    │
                         │        option-chain          │
                         └──────────────┬───────────────┘
                                        │
                                        │ Browser DOM
                                        ▼
                         ┌──────────────────────────────┐
                         │      Chrome Extension        │
                         │                              │
                         │ schema_validator.js          │
                         │ content.js                   │
                         │ background.js                │
                         │ launcher.js                  │
                         └──────────────┬───────────────┘
                                        │
                         verified JSON  │
                                        ▼
                         ┌──────────────────────────────┐
                         │       Python Backend         │
                         │      backend/server.py       │
                         │                              │
                         │ heartbeat                    │
                         │ market session state         │
                         │ schema verification          │
                         │ Excel persistence            │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │       Excel Workbook         │
                         │    live_market_feed.xlsx     │
                         └──────────────┬───────────────┘
                                        │
                                        ▼
                         ┌──────────────────────────────┐
                         │        Streamlit UI           │
                         │    streamlit_app.py           │
                         └──────────────────────────────┘
```

The architecture evolved substantially during implementation. The final design includes not only extraction and analytics but also a carefully controlled runtime lifecycle:

```text
launch.bat
   ↓
setup.vbs
   ├── ensure Excel is open
   ├── ensure backend is running
   ├── ensure Streamlit is running
   └── open extension launcher
          ↓
      launcher.js
          ↓
      background.js
          ├── reuse/create Streamlit tab
          ├── reuse/create dedicated #nifty-feed tab
          ├── eliminate duplicate managed tabs
          └── register exact feed-tab ID
                ↓
            launcher.js
                ↓
            reload dedicated feed tab
                ↓
            content.js
                ↓
            heartbeat → schema → extraction → backend → Excel
```

At the end of a regular session:

```text
NSE market closes
      ↓
Python heartbeat returns market_closed
      ↓
content.js sends MARKET_CLOSED
      ↓
background.js closes ONLY the registered #nifty-feed tab
      ↓
backend shuts down
      ↓
normal NSE tabs remain open
      ↓
Streamlit remains open
      ↓
Excel remains open
      ↓
last successful Excel snapshot remains visible
```

---

# 3. Core Design Principles

The system was intentionally designed around the following principles.

## 3.1 Browser as controlled acquisition surface

The NSE option chain page is the acquisition surface. The extension operates only on a specifically identified automation tab.

The extension does **not** automatically refresh ordinary NSE tabs merely because they happen to exist.

The dedicated automation page is identified using the `#nifty-feed` URL fragment and, for lifecycle operations, by a persistent Chrome tab ID.

---

## 3.2 Python as runtime authority

Python is responsible for:

- backend availability
- heartbeat cadence
- market-session determination
- market-close signalling
- schema verification on the server side
- writing verified data into Excel

This prevents the browser from independently inventing timing or market state.

---

## 3.3 Schema-first data handling

Nothing is considered safe merely because it looks like an option-chain table.

The browser validates the page structure before sending data to Python, and Python independently validates the incoming schema before touching Excel.

The pipeline is therefore:

```text
DOM
 ↓
semantic table detection
 ↓
canonical column normalization
 ↓
data-shape validation
 ↓
strike validation
 ↓
fingerprint validation
 ↓
Python-side schema verification
 ↓
Excel write
```

---

## 3.4 Last known good data should survive market shutdown

The system deliberately distinguishes:

```text
LIVE
```
from:

```text
MARKET CLOSED / STALE
```

Closing the acquisition pipeline does not mean that the last valid market snapshot is useless.

Excel remains the persistent last-known-good source, and the Streamlit interface continues displaying the last successful snapshot after the market closes.

---

# 4. Main Features

## 4.1 Live NIFTY option-chain acquisition

The extension detects the NSE option-chain page and extracts the option-chain table directly from the browser DOM.

The currently expected canonical data structure contains 21 source fields:

### Calls — 10 fields

1. `CALL_OI`
2. `CALL_CHNG_OI`
3. `CALL_VOLUME`
4. `CALL_IV`
5. `CALL_LTP`
6. `CALL_CHNG`
7. `CALL_BID_QTY`
8. `CALL_BID`
9. `CALL_ASK`
10. `CALL_ASK_QTY`

### Strike

11. `STRIKE`

### Puts — 10 fields

12. `PUT_BID_QTY`
13. `PUT_BID`
14. `PUT_ASK`
15. `PUT_ASK_QTY`
16. `PUT_CHNG`
17. `PUT_LTP`
18. `PUT_IV`
19. `PUT_VOLUME`
20. `PUT_CHNG_OI`
21. `PUT_OI`

---

## 4.2 NIFTY spot extraction

The extension separately extracts the NIFTY 50 spot value from the option-chain page.

This is stored alongside the verified option-chain snapshot and later surfaced through:

- Excel
- Streamlit
- runtime state

---

## 4.3 Schema validation

The project contains both browser-side and backend-side validation.

### Browser-side

`schema_validator.js` validates the observed NSE DOM structure.

`content.js` additionally verifies:

- table identity
- header semantics
- column order
- row shape
- strike structure
- fingerprint

### Python-side

`server.py` independently validates:

- schema version
- column list existence
- exact column count
- exact semantic order
- fingerprint presence
- independently calculated fingerprint

This means the Python backend does not simply trust the browser's claim that the schema is valid.

---

# 5. Schema Fingerprinting Architecture

A major security/integrity feature of the platform is the schema fingerprint system.

## 5.1 What the fingerprint means

The fingerprint is a deterministic SHA-256 digest of the canonical schema representation.

Conceptually:

```text
Canonical Schema
      ↓
Deterministic JSON representation
      ↓
SHA-256
      ↓
Schema Fingerprint
```

The fingerprint is **not** an identifier for an individual market row or an individual user. It represents the structure expected by the application.

---

## 5.2 Why fingerprints exist

The main purpose is to detect structural changes in the NSE page.

Examples of structural problems include:

- unexpected column reordering
- missing columns
- new columns
- removed columns
- semantic changes to headers
- incorrect table selection
- malformed DOM layout

A page that visually resembles an option chain is not necessarily safe to ingest.

---

## 5.3 First approval

The extension allows a first known-good schema to establish the approved fingerprint when no existing approved fingerprint is present.

After approval, the system does not silently replace the baseline.

---

## 5.4 Subsequent validation

On subsequent pages:

```text
Observed schema
      ↓
Fingerprint calculated
      ↓
Compare with approved baseline
      ↓
MATCH     → continue
MISMATCH  → BLOCK
```

A fingerprint mismatch is treated as a hard safety condition rather than something to automatically “fix.”

---

## 5.5 Backend re-verification

Python reconstructs the canonical schema representation itself and independently calculates the expected SHA-256 fingerprint.

The incoming browser payload must match the Python-side expectation before the Excel write is allowed.

This gives two layers of protection:

```text
Browser validates structure
          +
Python validates structure again
          ↓
Only verified data reaches Excel
```

---

# 6. Browser Extension Architecture

The extension is a **Manifest V3** Chrome extension.

Core extension components include:

```text
extension/
├── manifest.json
├── background.js
├── content.js
├── schema_validator.js
├── launcher.js
├── launcher.html
├── popup.html
├── popup.js
└── other extension assets
```

---

# 7. `manifest.json`

The extension uses Manifest V3.

Major capabilities include:

- `activeTab`
- `scripting`
- `notifications`
- `storage`
- `tabs`
- host access for NSE
- host access for the local Python backend
- a background service worker
- popup UI

The content scripts are loaded at `document_idle` on NSE pages and include:

```text
schema_validator.js
content.js
```

The extension also has an extension action popup.

---

# 8. `background.js` Responsibilities

`background.js` is the extension's central orchestration and tab-control layer.

It handles several distinct responsibilities.

## 8.1 Runtime feed state

Messages such as:

- `FEED_STARTED`
- `FEED_SUCCESS`
- `FEED_ERROR`
- `MARKET_CLOSED`
- `ENSURE_TABS`

are used to coordinate state.

---

## 8.2 Dedicated feed-tab concept

The platform differentiates between:

### User-view NSE tabs

Ordinary NSE tabs the user may have opened for browsing.

### Dedicated automation tab

A specially managed NSE option-chain tab:

```text
#nifty-feed
```

Only the dedicated feed tab belongs to the automated lifecycle.

---

## 8.3 Why this separation was necessary

At one point the automated refresh mechanism was causing the NSE page to continuously reload while the user was trying to inspect the NSE website manually.

The solution was not to disable the feed; instead the architecture was changed so that:

```text
Automation tab
→ controlled refresh

Normal NSE tabs
→ untouched
```

This is one of the key architectural decisions of the project.

---

## 8.4 Duplicate tab prevention

The launcher does not blindly create new browser tabs every time.

The synchronization layer searches for existing managed tabs and follows the rule:

```text
existing managed tab
    → reuse

missing managed tab
    → create

multiple matching managed tabs
    → close duplicates
```

This solved the repeated-launch problem where every new launch created additional Streamlit and NSE tabs.

---

## 8.5 Exact feed-tab ID tracking

URL fragments alone were found to be insufficiently reliable for shutdown-time identity checks.

The final design stores the actual Chrome tab ID:

```text
feedTabId
```

and persists the logical identity in extension storage.

The result is:

```text
MARKET_CLOSED
      ↓
registered feedTabId
      ↓
chrome.tabs.remove(feedTabId)
```

rather than relying on a last-second URL-fragment inspection.

---

## 8.6 Feed-tab lifecycle persistence

The extension also handles the possibility of a Manifest V3 service-worker restart.

The feed tab ID is loaded from `chrome.storage.local` when the worker starts.

If the user manually closes the registered feed tab:

```text
chrome.tabs.onRemoved
      ↓
feedTabId cleared
      ↓
stored ID cleared
```

This prevents stale tab IDs from being reused.

---

# 9. `launcher.js`

`launcher.js` is intentionally small and acts as a bridge between `setup.vbs` and `background.js`.

Its job is not to implement market logic.

It performs:

```text
1. ENSURE_TABS
2. obtain the exact dedicated NSE tab ID
3. reload ONLY the dedicated feed tab
4. wait for content.js to be ready
5. send START
6. close the temporary launcher page
```

---

## 9.1 Why the feed tab is reloaded

A subtle issue appeared after terminating and relaunching the system.

An existing `#nifty-feed` tab could still physically exist, but its old content-script lifecycle had stopped.

A simple:

```javascript
chrome.tabs.sendMessage(... START ...)
```

produced:

```text
Could not establish connection.
Receiving end does not exist.
```

The robust solution became:

```text
reuse existing feed tab
        ↓
reload feed tab
        ↓
content.js injected again
        ↓
poll until START listener exists
        ↓
START feed
```

The launcher waits and retries for a bounded period rather than assuming a freshly loaded tab is immediately ready.

---

# 10. `content.js`

`content.js` is the main browser-side acquisition engine.

It handles:

- lifecycle state
- schema loading
- DOM inspection
- option-chain extraction
- NIFTY spot extraction
- verified backend transmission
- Python-controlled heartbeat
- NSE internal refresh
- safe stop behavior
- market-close notification
- runtime status reporting

---

# 11. NSE Internal Refresh Mechanism

The platform performs the equivalent of the NSE option-chain refresh action programmatically only on the dedicated feed tab.

The extension requests a runtime operation:

```text
CLICK_NSE_REFRESH
```

`background.js` executes the NSE refresh button click in the page's main world.

This was chosen because the same refresh action was proven to work manually in the browser developer environment.

The refresh interval was intentionally kept in one centralized constant so the mechanism is deterministic.

The final runtime behavior uses a 5-second NSE internal refresh timer while the Python heartbeat controls backend pacing separately.

---

# 12. Python-Controlled Heartbeat

A critical architectural refinement was moving the primary feed cadence away from a browser-side `setInterval()` loop.

The browser instead requests:

```text
GET /heartbeat
```

and Python controls the cadence through the backend.

Conceptually:

```text
content.js
    ↓
GET /heartbeat
    ↓
Python waits FEED_INTERVAL
    ↓
returns market state
    ↓
OPEN → browser captures next snapshot
CLOSED → browser shuts down
```

The configured backend feed interval is **3 seconds**.

The internal NSE page refresh remains a separate browser operation.

---

# 13. Startup Ordering Fix

An important bug was discovered when the market was closed.

The first implementation did this:

```text
START
 ↓
first /update
 ↓
backend already closed
 ↓
connection error
```

That caused misleading errors before the market-closure heartbeat could be observed.

The startup flow was therefore redesigned:

```text
START
 ↓
load schema approval
 ↓
start heartbeat FIRST
 ↓
ask backend for market state
 ↓
OPEN → snapshot/update
CLOSED → MARKET_CLOSED
```

This distinction is critical because a closed market is a normal lifecycle state, not a backend failure.

---

# 14. Backend Connectivity States

The extension differentiates several runtime states.

### Connected

Backend responds normally and verified data is being accepted.

### Disconnected

The backend has been intentionally stopped or is unavailable.

### Market Closed

The backend explicitly communicated that the current market session is closed.

### Error

An actual application or validation problem occurred.

This distinction avoids turning ordinary market closure into a generic failure condition.

---

# 15. Backend: `backend/server.py`

The backend is implemented with Python's standard library HTTP server stack:

```python
BaseHTTPRequestHandler
ThreadingHTTPServer
```

It listens on:

```text
127.0.0.1:5000
```

The primary endpoints are:

```text
GET  /heartbeat
OPTIONS /heartbeat
POST /update
```

---

# 16. CORS Handling

The backend explicitly provides:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

This is necessary because the extension page originates from NSE while the backend is local HTTP on `127.0.0.1:5000`.

During development a failure was observed where the wrong/old handler returned:

```text
501 Unsupported method ('GET')
```

This was traced not to CORS itself, but to the `RequestHandler` methods having accidentally ended up outside the class.

The final structure is explicitly:

```text
RequestHandler
├── log_message()
├── send_json()
├── do_GET()
├── do_OPTIONS()
└── do_POST()
```

A direct AST inspection was used to verify that the actual Python file on disk contained those methods.

---

# 17. `/heartbeat` Contract

The heartbeat is the lifecycle authority.

### Open session

Conceptually returns:

```json
{
  "status": "tick",
  "market_state": "OPEN",
  "interval": 3,
  "timestamp": "...",
  "timezone": "Asia/Kolkata"
}
```

### Closed session

Returns:

```json
{
  "status": "market_closed",
  "market_state": "CLOSED",
  "message": "NSE market session is closed.",
  "timestamp": "...",
  "timezone": "Asia/Kolkata"
}
```

The closed response is written before the server is instructed to shut down. This gives the browser a chance to process the explicit market-closure state.

---

# 18. Market Session Engine

The backend uses `Asia/Kolkata` explicitly through Python's `zoneinfo` system.

Regular session parameters are:

```text
Open:  09:15 IST
Close: 15:30 IST
```

The engine recognizes:

- `OPEN`
- `PRE_OPEN`
- `CLOSED`
- `HOLIDAY`
- `SPECIAL`

This prevents relying solely on the host computer's timezone configuration.

---

# 19. Holiday Awareness

The backend includes a 2026 NSE F&O holiday set and supports a structure for special sessions.

The design intentionally keeps special sessions separate from normal full-day holidays because an exchange may schedule exceptional trading windows such as Muhurat Trading.

Special sessions are represented by a mapping of:

```text
YYYY-MM-DD → (open_time, close_time)
```

The framework is present so that exceptional NSE session times can be represented without corrupting the normal session model.

---

# 20. Market Close Shutdown Protocol

This became one of the most significant platform features.

The intended lifecycle is:

```text
15:30 / holiday / non-trading session
             ↓
backend heartbeat evaluates CLOSED
             ↓
HTTP 200 market_closed response
             ↓
content.js receives market_closed
             ↓
sends MARKET_CLOSED
             ↓
background.js verifies exact registered feed tab
             ↓
closes ONLY #nifty-feed
             ↓
Python backend shutdown
```

What remains open:

```text
Normal NSE tabs       ✅
Streamlit             ✅
Excel                 ✅
```

What stops:

```text
Dedicated feed tab    ✅ closed
Backend               ✅ stopped
Heartbeat             ✅ stopped
NSE automation loop   ✅ stopped
```

---

# 21. Why Only the Feed Tab Is Closed

A user may have multiple NSE tabs for ordinary analysis.

Closing every `nseindia.com` tab would be unacceptable.

The final design therefore uses an exact feed-tab registration system.

The shutdown operation never means:

```text
"close every NSE tab"
```

It means:

```text
"close the registered automation tab only"
```

---

# 22. Excel Persistence Layer

The workbook is:

```text
live_market_feed.xlsx
```

The backend uses `xlwings` to access the already-open workbook.

The exact workbook is identified rather than simply trusting whichever workbook happens to be active.

---

# 23. Excel Layout

The backend writes the verified option-chain snapshot into:

```text
Sheet1
```

Primary source table:

```text
A3:U...
```

Metadata:

```text
W2 → NIFTY SPOT
X2 → LAST FEED
Y2 → SCHEMA FINGERPRINT
```

The workbook also contains a formatted header structure with CALLS, STRIKE, and PUTS regions.

---

# 24. Excel Write Safety

The Excel writer deliberately follows a safer order:

```text
validate incoming schema
       ↓
convert/clean rows
       ↓
verify row width
       ↓
write new snapshot
       ↓
remove obsolete rows
```

The system does not intentionally erase a previously valid snapshot merely because a subsequent market request failed.

This was important for maintaining the final “last known successful market state” after market closure.

---

# 25. Streamlit Analytics Layer

`streamlit_app.py` serves as the visual market-data terminal.

It reads from the Excel workbook rather than directly scraping NSE.

The dashboard presents:

- NIFTY spot
- ATM strike
- Put/Call OI ratio
- last successful feed time
- data age
- option row count
- schema status
- fingerprint status
- Excel target
- complete formatted option-chain table
- custom analytics columns

---

# 26. Streamlit Custom Analytics

The Streamlit layer derives additional fields from the raw NSE source columns.

### CALL A

Call-side OI change percentage.

### CALL B

Call-side premium value derived from call OI and call LTP.

### PUT C

Put-side OI change percentage.

### PUT D

Put-side premium value derived from put OI and put LTP.

These are calculated after the raw Excel snapshot is read.

---

# 27. ATM Detection

The Streamlit UI determines the ATM strike by finding the strike closest to the NIFTY spot value.

The ATM row is visually highlighted.

---

# 28. ITM Highlighting

The interface applies NSE-style visual logic to option-chain regions.

For calls:

```text
strike < spot → CALL ITM
```

For puts:

```text
strike > spot → PUT ITM
```

---

# 29. Live vs Stale Semantics

The Streamlit terminal uses the age of `LAST FEED` to distinguish:

```text
LIVE
```
and:

```text
STALE
```

The final system intentionally does not equate stale data with corrupted data.

After the market closes, the UI may show:

```text
MARKET CLOSED
STALE FEED
```

while continuing to display the last successful snapshot.

This is an important distinction between:

```text
market lifecycle
```
and:

```text
data validity
```

---

# 30. Closed-Market UI Behavior

The desired final UI after market close is:

```text
MARKET CLOSED

STALE FEED

NIFTY SPOT      last successful value
ATM STRIKE      last successful value
PUT / CALL OI   last successful value
LAST SUCCESS    last successful timestamp
DATA AGE        increasing / historical age
OPTION ROWS     last successful count
SCHEMA          VERIFIED
FINGERPRINT     MATCHED
```

The data is frozen.

The status changes.

That prevents an empty terminal from appearing as though the market had no data at all.

---

# 31. `popup.html` / `popup.js`

The browser extension contains a compact runtime-status interface.

The popup displays concepts including:

- last update
- next update
- rows captured
- backend state
- Excel state
- schema state
- fingerprint state

The intended semantics are:

### Active

```text
LIVE FEED ACTIVE
Backend       Connected
Excel         Updating
Schema        APPROVED/VERIFIED
Fingerprint   active
```

### Closed/stopped

```text
MARKET CLOSED / inactive
Backend       Disconnected
Excel         Stopped
Schema        Unmounted
Fingerprint   —
```

The distinction was explicitly designed so that shutdown does not leave misleading values such as “Updating” or a meaningless live fingerprint.

---

# 32. Launcher and Shutdown Scripts

The local lifecycle is controlled using simple Windows entry points.

```text
launch.bat
setup.vbs
terminate.bat
```

---

# 33. `launch.bat`

The final launch script is intentionally minimal.

Conceptually:

```bat
@echo off
wscript.exe "%~dp0setup.vbs"
exit
```

The important design choice is `%~dp0`, which resolves paths relative to the script location.

---

# 34. `setup.vbs`

`setup.vbs` is responsible for startup orchestration.

Its tasks include:

1. determine the project root from its own location
2. find the installed Python executable
3. ensure the exact Excel workbook is open
4. ensure backend port 5000 is available/active
5. ensure Streamlit port 8501 is available/active
6. open the Chrome extension launcher

The project path is derived from `setup.vbs`, rather than hard-coding every project file location.

---

# 35. Portability Considerations

The project was intentionally changed so that local project files resolve relative to the project root whenever possible.

This was motivated by a real portability requirement:

```text
D:\Engineering\Programming\Python\NIFTY50
```

should not be the only environment where the project can live.

Important distinction:

```text
Project paths → intended to be relative
Python executable → still an installed machine dependency
Chrome extension → installed/configured separately
```

A truly portable distribution would additionally need dependency/environment management for Python and the Chrome extension.

---

# 36. `terminate.bat`

The final `terminate.bat` was intentionally simplified.

Its main job is to stop the NIFTY backend only.

It intentionally does **not** kill the Streamlit process.

This solved a user-visible failure where terminating the backend left a broken Streamlit browser tab displaying a connection error.

Final desired shutdown behavior:

```text
Backend      → stopped
Streamlit    → left running
Excel        → left open
Normal NSE   → left open
Feed NSE     → stopped/closed through extension lifecycle
```

The script also verifies whether port 5000 remains occupied.

---

# 37. Error and Failure Modes Encountered

The project was developed through several real failure cases. These are important parts of the engineering history because each one influenced the final architecture.

## 37.1 Backend termination did not stop NSE refresh

### Problem

`terminate.bat` stopped Python, but the browser's `content.js` kept refreshing the NSE page.

### Root cause

The browser refresh timer was independent of backend lifecycle.

### Resolution

The browser now stops its own refresh/heartbeat lifecycle when backend connectivity is lost, and market-close messages explicitly stop the feed.

---

## 37.2 Normal NSE tabs were being refreshed

### Problem

A user trying to inspect NSE manually saw continuous table refreshes.

### Resolution

Automation was isolated to a dedicated `#nifty-feed` tab.

Normal NSE tabs are intentionally not managed by the feed lifecycle.

---

## 37.3 Repeated launches created duplicate tabs

### Problem

Repeated `launch.bat` executions created new Streamlit and NSE tabs even when the old tabs were already open.

### Resolution

`background.js` now synchronizes managed tabs:

```text
existing → reuse
missing → create
duplicate → close
```

---

## 37.4 Reused feed tab had no active message listener

### Problem

A reused feed tab existed, but `chrome.tabs.sendMessage()` produced:

```text
Could not establish connection.
Receiving end does not exist.
```

### Resolution

`launcher.js` explicitly reloads the dedicated feed tab, waits for the content script to become available, then sends `START` with bounded retry logic.

---

## 37.5 Market closed triggered a generic fetch error

### Problem

The browser attempted `/update` before checking whether the market was open.

### Result

Instead of a clean market-closure state, the console showed backend connection/CORS failures.

### Resolution

Heartbeat is now started before the first `/update` snapshot.

The browser first asks Python whether the market is open.

---

## 37.6 Backend returned 501 for `/heartbeat`

### Problem

The browser received:

```text
501 Unsupported method ('GET')
```

### Investigation

Direct `curl` testing confirmed the backend really returned 501.

A Python AST inspection showed:

```text
RequestHandler methods:
['log_message', 'send_json']
```

with no `do_GET`, `do_OPTIONS`, or `do_POST` methods.

### Root cause

The HTTP methods had accidentally been placed outside the `RequestHandler` class due to indentation/structure damage.

### Resolution

The methods were restored inside the class, and AST verification confirmed:

```text
RequestHandler methods:
['log_message', 'send_json', 'do_GET', 'do_OPTIONS', 'do_POST']
```

---

## 37.7 Streamlit server was incorrectly killed by termination

### Problem

`terminate.bat` stopped Streamlit, leaving the Streamlit browser page displaying a connection error.

### Resolution

The final termination script stops the backend only and intentionally leaves Streamlit running.

---

## 37.8 Closed-market UI showed empty/default data

### Problem

Once the feed tab closed and the Excel source became empty in an early test state, Streamlit showed errors/zero data.

### Investigation

The system was tested again by simulating market OPEN. Once the Excel sheet was populated with a valid 105-row snapshot, the true market-CLOSED workflow was tested again.

### Final behavior

The populated Excel snapshot remained available and Streamlit correctly retained and displayed the last successful snapshot while showing market closed/stale status.

This verified that Excel could act as the persistent last-known-good market snapshot source in the final tested state.

---

# 38. Diagnostic Techniques Used

The project was not debugged solely through browser screenshots. Several direct diagnostics were used.

## Port ownership

```powershell
netstat -ano | findstr ":5000" | findstr "LISTENING"
```

## Python process inspection

```powershell
Get-CimInstance Win32_Process -Filter 'ProcessId = <PID>' |
Select-Object ProcessId,ParentProcessId,Name,CommandLine |
Format-List
```

## Direct HTTP test

```powershell
curl -i http://127.0.0.1:5000/heartbeat
```

## HTTP method test

```powershell
curl -i -X OPTIONS http://127.0.0.1:5000/heartbeat
```

## AST structural verification

The Python `ast` module was used to prove which methods were actually inside `RequestHandler`.

This was particularly useful because the source visible in an editor and the source actually being executed must always be treated as separate facts until verified.

---

# 39. Runtime State Model

The project intentionally tracks multiple dimensions of runtime health instead of reducing everything to one boolean.

Representative concepts include:

```text
running
heartbeatRunning
nseRefreshRunning
backendState
excelState
schemaState
nse_schema_state
fingerprintActive
marketState
```

This makes it possible to distinguish:

```text
backend connected
```
from:

```text
market open
```

and from:

```text
schema verified
```

and from:

```text
Excel being updated
```

---

# 40. Important State Semantics

### `CONNECTED`

The Python backend is reachable.

### `DISCONNECTED`

The Python backend is not available or was intentionally stopped.

### `UPDATING`

The last verified snapshot successfully reached Excel.

### `STOPPED`

The Excel destination is no longer receiving live updates.

### `VERIFIED`

The current data/schema passed the validation layer.

### `UNMOUNTED`

No active feed is running; schema/fingerprint runtime state is not considered active.

### `BLOCKED`

A schema integrity violation was detected.

---

# 41. Launch Lifecycle

## Normal startup

```text
User clicks launch.bat
        ↓
setup.vbs
        ↓
Excel ensured open
        ↓
backend ensured on :5000
        ↓
Streamlit ensured on :8501
        ↓
launcher.html opened
        ↓
launcher.js
        ↓
ENSURE_TABS
        ↓
background.js
        ↓
Streamlit tab reused/created
        ↓
NSE feed tab reused/created
        ↓
feed tab registered by exact tab ID
        ↓
launcher reloads feed tab
        ↓
content.js starts
        ↓
heartbeat
```

---

# 42. Successful Open-Market Lifecycle

```text
Heartbeat
    ↓
market_state = OPEN
    ↓
snapshot extraction
    ↓
schema validation
    ↓
fingerprint validation
    ↓
POST /update
    ↓
Python schema verification
    ↓
Excel write
    ↓
FEED_SUCCESS
    ↓
Streamlit reads Excel
```

---

# 43. Market-Closed Lifecycle

```text
Heartbeat
    ↓
market_state = CLOSED
    ↓
HTTP 200 market_closed
    ↓
content.js sends MARKET_CLOSED
    ↓
background.js verifies registered feed tab ID
    ↓
feed tab closes
    ↓
backend shutdown
    ↓
Streamlit remains available
    ↓
Excel remains available
```

---

# 44. Manual Termination Lifecycle

```text
terminate.bat
    ↓
find server.py process for this project
    ↓
stop backend
    ↓
verify port 5000
    ↓
leave Streamlit running
    ↓
content.js loses heartbeat
    ↓
feed lifecycle stops
```

---

# 45. Security / Integrity Model

This is not a cloud security system and should not be presented as one.

Its primary security/integrity objective is **data correctness and structural safety** in a local ingestion environment.

Important controls include:

- approved schema fingerprint
- independent Python schema verification
- exact column ordering checks
- exact row-width checks
- dedicated automation tab
- explicit backend host binding to `127.0.0.1`
- no silent fingerprint replacement
- explicit shutdown handling
- exact workbook matching

---

# 46. Why the Localhost Backend Exists

The extension should not write directly to Excel.

The backend provides a clean separation:

```text
Browser extraction
        ≠
Excel persistence
```

Instead:

```text
Browser
  ↓ verified JSON
Python
  ↓ verified write
Excel
```

This allows Python to enforce a second trust boundary.

---

# 47. Why Excel Is Not the Extraction Layer

Excel is used as the persistence/consumption layer, not as the browser scraper.

This makes the responsibilities clearer:

```text
NSE page → acquisition
Chrome extension → extraction/validation
Python → backend validation/persistence
Excel → stored market snapshot
Streamlit → visualization/analytics
```

---

# 48. Technology Stack

## Browser

- Google Chrome
- Chrome Extensions Manifest V3
- JavaScript
- DOM APIs
- `chrome.runtime`
- `chrome.tabs`
- `chrome.storage`
- `chrome.scripting`

## Backend

- Python 3.11+
- `http.server`
- `ThreadingHTTPServer`
- `zoneinfo`
- `json`
- `hashlib`
- `threading`
- `xlwings`

## Analytics/UI

- Streamlit
- pandas
- HTML/CSS generated through Streamlit

## Persistence

- Microsoft Excel
- `xlwings`

## Windows lifecycle

- `.bat`
- Windows Script Host / VBScript (`.vbs`)
- PowerShell process inspection

## Version control

- Git
- GitHub

---

# 49. Installation Requirements

## 49.1 Windows

The current launcher/termination layer is designed for Windows.

Required components include:

- Windows
- Google Chrome
- Microsoft Excel
- Python 3.11 or compatible Python installation
- Git

---

# 50. Python Installation

Official Python website:

https://www.python.org/

Python should be installed on the target system.

The current VBScript launcher expects the Python executable in the local Python installation path used during development. The project is more portable in file placement than in Python environment provisioning.

---

# 51. Required Python Packages

The project uses at least:

```text
xlwings
pandas
streamlit
```

Install them with:

```powershell
python -m pip install xlwings pandas streamlit
```

If the system is being deployed to a fresh machine, additional environment-specific packages should be installed according to the import requirements of the final project source.

---

# 52. Git Installation

Git:

https://git-scm.com/

Verify:

```powershell
git --version
```

---

# 53. GitHub Repository Setup

Repository:

https://github.com/etsryn/NIFTY-Option-Chain-Data-Acquisition-Validation-Analytics-Platform

Typical first-time setup:

```powershell
cd /d D:\Engineering\Programming\Python\NIFTY50

git init

git remote add origin https://github.com/etsryn/NIFTY-Option-Chain-Data-Acquisition-Validation-Analytics-Platform.git

git branch -M main
```

If the remote already contains an independently created README/license commit, use:

```powershell
git pull origin main --allow-unrelated-histories
```

then:

```powershell
git push -u origin main
```

After upstream tracking is established:

```powershell
git add .
git commit -m "Describe change"
git push
```

---

# 54. Recommended `.gitignore`

A typical project `.gitignore` should exclude runtime and local-machine artifacts such as:

```gitignore
__pycache__/
*.py[cod]
.venv/
venv/
env/
.streamlit/secrets.toml
last_good_snapshot.json
~$*.xlsx
*.log
.vscode/
.DS_Store
Thumbs.db
.pytest_cache/
.mypy_cache/
*.tmp
*.temp
```

The live workbook should generally be treated as runtime state rather than a canonical source file in a public repository.

A clean template workbook can be distributed separately if required.

---

# 55. Chrome Extension Installation

Open:

```text
chrome://extensions
```

Enable:

```text
Developer mode
```

Choose:

```text
Load unpacked
```

Select:

```text
NIFTY50/extension/
```

Chrome then provides the extension ID.

The launcher configuration currently uses the extension ID in `setup.vbs` to open `launcher.html`.

If a new machine receives a newly loaded unpacked extension with a different extension identity, the launcher configuration must be updated accordingly unless the extension identity is otherwise kept stable.

---

# 56. Launching the System

From the project root:

```text
launch.bat
```

Expected result:

- Excel opens or is reused
- backend starts or is reused
- Streamlit starts or is reused
- Streamlit browser tab is reused/created
- dedicated NSE feed tab is reused/created
- duplicate managed tabs are eliminated
- feed tab is reloaded
- feed lifecycle starts

---

# 57. Stopping the System

Use:

```text
terminate.bat
```

Expected result:

- backend stops
- port 5000 is released
- Streamlit remains running
- Excel remains open
- normal NSE tabs remain open
- dedicated feed lifecycle stops

---

# 58. Troubleshooting Guide

## Problem: `/heartbeat` returns 501

Check that `RequestHandler` contains:

```python
def do_GET(...)
def do_OPTIONS(...)
def do_POST(...)
```

Use:

```powershell
python -c "import ast; ..."
```

or inspect the class manually.

---

## Problem: port 5000 is still occupied

Run:

```powershell
netstat -ano | findstr ":5000" | findstr "LISTENING"
```

Then identify the PID:

```powershell
Get-CimInstance Win32_Process -Filter 'ProcessId = <PID>' |
Select-Object ProcessId,ParentProcessId,Name,CommandLine |
Format-List
```

---

## Problem: feed tab exists but START fails

Expected diagnostic:

```text
Could not establish connection.
Receiving end does not exist.
```

The launcher should reload the dedicated feed tab and retry START.

Verify the launcher console contains:

```text
NSE feed tab selected
Reloading dedicated NSE feed tab
Attempting to start NSE feed
NSE feed START response
```

---

## Problem: multiple Streamlit/NSE tabs

The managed-tab synchronization mechanism should reuse one matching tab and close duplicates.

Inspect the service worker console for messages such as:

```text
Reusing existing Streamlit tab
Reusing existing NSE Feed tab
Closed duplicate Streamlit tab
Closed duplicate NSE Feed tab
```

---

## Problem: normal NSE tabs are refreshing

Ensure the feed lifecycle is attached only to:

```text
#nifty-feed
```

Normal NSE option-chain tabs should not be used as the automation surface.

---

## Problem: market close does not close the feed tab

Verify:

1. backend returns `market_closed`
2. content.js prints `NSE MARKET CLOSED`
3. background.js has a registered `feedTabId`
4. the incoming `MARKET_CLOSED` message originates from the registered feed tab

---

## Problem: Streamlit shows connection error after termination

The termination script should not kill the Streamlit process.

Check:

```text
8501
```

and confirm Streamlit remains running.

---

## Problem: Streamlit shows empty data after market close

First inspect Excel.

Check:

```text
A3:U107
W2
X2
Y2
```

The intended final behavior is to preserve the last successful snapshot rather than intentionally clearing it on market closure.

---

# 59. Direct URLs / Useful Resources

## NSE Option Chain

https://www.nseindia.com/option-chain

## NSE Home

https://www.nseindia.com/

## NSE Market Timings / Exchange Resources

https://www.nseindia.com/resources/exchange-communication-holidays

## Python

https://www.python.org/

## Python `http.server`

https://docs.python.org/3/library/http.server.html

## Python `zoneinfo`

https://docs.python.org/3/library/zoneinfo.html

## xlwings

https://www.xlwings.org/

## pandas

https://pandas.pydata.org/

## Streamlit

https://streamlit.io/

## Git

https://git-scm.com/

## GitHub

https://github.com/

## Chrome Extensions Documentation

https://developer.chrome.com/docs/extensions/

## Chrome Extension Manifest V3

https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3/

---

# 60. Development Evolution / Major Milestones

The project evolved through multiple architectural iterations.

## Phase 1 — Basic live acquisition

Initial concept:

```text
NSE → browser → Python → Excel
```

The first goal was reliable data movement from the NSE option chain into Excel.

---

## Phase 2 — Backend lifecycle

A dedicated Python server was introduced to centralize:

- timing
- update endpoint
- heartbeat
- Excel writes

---

## Phase 3 — Chrome extension integration

The extension was introduced to control the browser-side DOM and communicate with Python.

---

## Phase 4 — Schema validation

Browser-side table detection became semantic rather than “first table containing familiar strings.”

---

## Phase 5 — Fingerprint integrity

A permanent schema fingerprint baseline was introduced.

---

## Phase 6 — Backend-side revalidation

Python began independently validating incoming schema metadata before writing to Excel.

---

## Phase 7 — Managed browser tabs

A dedicated automation tab and managed-tab synchronization were introduced.

---

## Phase 8 — Reused tab reliability

The launcher began reloading the dedicated feed tab and waiting for the content-script listener before sending START.

---

## Phase 9 — Market-aware lifecycle

The backend learned regular market session state, weekends, holiday state, and special-session scaffolding.

---

## Phase 10 — Automatic market shutdown

Market-close heartbeat responses now trigger a controlled shutdown:

```text
market_closed
→ close dedicated feed tab
→ stop backend
```

---

## Phase 11 — Persistent visual market state

Streamlit was validated to continue displaying the last successful Excel snapshot after the live feed closes, while changing status to stale/closed.

---

# 61. Design Lessons From the Build

## 61.1 Do not equate process state with market state

A backend can be alive while the market is closed.

A market can be closed without implying data corruption.

A stale snapshot can still be valid historical market information.

Therefore these states must remain separate.

---

## 61.2 Do not identify critical browser resources by URL alone

A URL is useful for recognizing a page category, but a tab ID is a stronger lifecycle handle when the exact browser tab must later be closed.

---

## 61.3 Do not assume a reused tab has a live content script

Tabs persist longer than content-script instances.

Explicit reload + readiness retry is more robust than assuming a message listener still exists.

---

## 61.4 Do not let one failed update decide the entire feed lifecycle

The heartbeat should remain the authority on backend/process availability.

A single application-level rejection should not always be interpreted as a process death.

---

## 61.5 Treat schema validation as a trust boundary

Schema mismatch should block propagation instead of being silently adapted.

---

## 61.6 Test the runtime, not only the source file

A particularly important debugging lesson was that the file visible in an editor and the code actually being executed are not the same fact.

Direct runtime checks such as:

```text
curl
netstat
PowerShell process inspection
Python AST inspection
```

were therefore essential.

---

# 62. Production Hardening Opportunities

The current platform is working and has been tested end-to-end. Future engineering work could include:

- formal dependency locking with `requirements.txt` or `pyproject.toml`
- virtual environment provisioning
- removal of remaining machine-specific Python paths
- relative project path handling everywhere
- configuration file for ports and paths
- automatic extension ID configuration
- formal logging to rotating files
- automated health-check diagnostics
- persistent last-known-good snapshot file as a secondary cache
- test fixtures for schema changes
- automated tests for market-session transitions
- unit tests for canonical fingerprint generation
- integration tests for `/heartbeat` and `/update`
- automated browser tests
- packaging for easier deployment on another Windows machine
- CI checks on GitHub

These are future hardening opportunities and are separate from the currently validated working system.

---

# 63. Recommended Repository Structure

```text
NIFTY-Option-Chain-Data-Acquisition-Validation-Analytics-Platform/
│
├── backend/
│   └── server.py
│
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── schema_validator.js
│   ├── launcher.js
│   ├── launcher.html
│   ├── popup.html
│   ├── popup.js
│   └── assets...
│
├── streamlit_app.py
├── setup.vbs
├── launch.bat
├── terminate.bat
├── live_market_feed.xlsx        # runtime/local state; preferably ignored
├── live_market_feed_template.xlsx
├── .gitignore
└── README.md
```

---

# 64. Quick Start

```powershell
# 1. Clone

git clone https://github.com/etsryn/NIFTY-Option-Chain-Data-Acquisition-Validation-Analytics-Platform.git
cd NIFTY-Option-Chain-Data-Acquisition-Validation-Analytics-Platform

# 2. Install Python dependencies

python -m pip install xlwings pandas streamlit

# 3. Load extension
# chrome://extensions → Developer mode → Load unpacked → extension/

# 4. Ensure the Excel workbook exists/open

# 5. Launch

launch.bat
```

Stop:

```text
terminate.bat
```

---

# 65. Git Development Workflow

After the repository is initialized and `origin/main` is configured:

```powershell
git status
git add .
git commit -m "Describe change"
git push
```

Before significant changes, create a checkpoint:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

A stable tag is particularly valuable for this platform because it combines several independently interacting systems:

```text
Chrome Extension
+ Python server
+ Excel
+ Streamlit
+ Windows launcher
```

---

# 66. Final System Contract

The final validated behavior of the platform can be summarized as:

### Open market

```text
NSE feed active
→ schema verified
→ fingerprint matched
→ NIFTY captured
→ 105 option rows captured
→ Python validates
→ Excel updates
→ Streamlit displays LIVE
```

### Closed market

```text
NSE market state = CLOSED
→ heartbeat returns market_closed
→ extension sends MARKET_CLOSED
→ dedicated #nifty-feed closes
→ backend stops
→ Streamlit stays open
→ Excel stays open
→ last successful snapshot remains visible
→ UI marks STALE / MARKET CLOSED
```

### User browsing

```text
Normal NSE tabs
→ remain untouched

Dedicated feed tab
→ managed automatically
```

### Schema integrity

```text
Schema matches
→ allow data

Schema fingerprint changes
→ block data

Python mismatch
→ reject update
```

### Restart

```text
launch.bat
→ reuse existing resources
→ avoid duplicates
→ reload feed tab
→ wait for content.js
→ restart feed safely
```

---

# 67. Project Status

## Current status: FUNCTIONALLY VALIDATED

The following major workflows have been tested successfully during development:

- live feed startup
- backend connectivity
- Python heartbeat
- browser refresh lifecycle
- duplicate-tab prevention
- reuse of existing managed tabs
- dedicated feed-tab management
- schema validation
- schema fingerprint matching
- backend schema revalidation
- Excel population
- Streamlit display
- manual termination
- preserving Streamlit while stopping backend
- automatic market-close detection
- automatic backend shutdown
- automatic dedicated feed-tab closure
- preservation of the last successful market snapshot
- reopening/restarting the managed feed lifecycle

The project is now at a stable checkpoint suitable for version-controlled development and future hardening.

---

# 68. Closing Note

This repository is not merely a scraper. It is a coordinated local data-acquisition system with explicit boundaries between acquisition, validation, persistence, analytics, process lifecycle, browser lifecycle, and market lifecycle.

The most important engineering property is that **each layer has a defined responsibility**:

```text
NSE
  → source

Chrome Extension
  → controlled acquisition + browser lifecycle

Schema Validator
  → structural integrity

Python Backend
  → timing + second validation + persistence + market session

Excel
  → durable last successful snapshot

Streamlit
  → analytics + visualization + stale/live state

BAT / VBS
  → Windows process orchestration

Git / GitHub
  → version history and distribution
```

The project should therefore be treated as a system rather than as a collection of unrelated scripts.

---

## License

Add the project's intended license here before public distribution.

## Disclaimer

This software is an engineering/data-acquisition project. It is not investment advice, a trading recommendation, or a guarantee of data correctness or market availability. NSE website structure, exchange schedules, browser behavior, and third-party software behavior can change. Production use should include independent operational monitoring and validation.
