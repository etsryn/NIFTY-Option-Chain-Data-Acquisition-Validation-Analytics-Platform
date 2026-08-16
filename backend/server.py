import time
import threading
import json
import hashlib

from http.server import (
    BaseHTTPRequestHandler,
    ThreadingHTTPServer
)

from datetime import (
    datetime,
    time as dt_time
)

from zoneinfo import ZoneInfo

import xlwings as xw


# ============================================================
# SERVER CONFIG
# ============================================================

HOST = "127.0.0.1"
PORT = 5000

FEED_INTERVAL = 3

EXCEL_PATH = (
    r"D:\Engineering\Programming\Python\NIFTY50"
    r"\live_market_feed.xlsx"
)

SHEET_NAME = "Sheet1"

SCHEMA_VERSION = 1

# ============================================================
# NSE MARKET SESSION
# ============================================================

IST = ZoneInfo(
    "Asia/Kolkata"
)

MARKET_OPEN_TIME = dt_time(
    9,
    15
)

MARKET_CLOSE_TIME = dt_time(
    15,
    30
)


# ============================================================
# NSE F&O FULL-DAY HOLIDAYS — 2026
# ============================================================
#
# Source:
# NSE F&O Trading Holidays Circular
# Ref: NSE/FAOP/71777
#
# November 8, 2026 is intentionally NOT included here because
# NSE has stated that Muhurat Trading will take place that day
# and its timings are notified separately.
#
# ============================================================

NSE_FO_HOLIDAYS_2026 = {

    "2026-01-15",  # Municipal Corporation Election in Maharashtra
    "2026-01-26",  # Republic Day
    "2026-03-03",  # Holi
    "2026-03-26",  # Shri Ram Navami
    "2026-03-31",  # Shri Mahavir Jayanti
    "2026-04-03",  # Good Friday
    "2026-04-14",  # Dr. Baba Saheb Ambedkar Jayanti
    "2026-05-01",  # Maharashtra Day
    "2026-05-28",  # Bakri Id
    "2026-06-26",  # Muharram
    "2026-09-14",  # Ganesh Chaturthi
    "2026-10-02",  # Mahatma Gandhi Jayanti
    "2026-10-20",  # Dussehra
    "2026-11-10",  # Diwali-Balipratipada
    "2026-11-24",  # Prakash Gurpurb Sri Guru Nanak Dev
    "2026-12-25",  # Christmas
}


# ============================================================
# SPECIAL SESSIONS
# ============================================================
#
# Keep this empty until NSE formally publishes the exact
# Muhurat Trading timing for 08-Nov-2026.
#
# Format:
#
# "YYYY-MM-DD": (
#     open_time,
#     close_time
# )
#
# ============================================================

NSE_SPECIAL_SESSIONS = {
}

# ============================================================
# APPROVED CANONICAL SCHEMA
# ============================================================
#
# This MUST match the canonical schema used by
# schema_validator.js.
#
# Python does not trust the browser to tell it what the
# expected schema is.
# ============================================================

EXPECTED_SCHEMA_COLUMNS = [

    "CALL_OI",
    "CALL_CHNG_OI",
    "CALL_VOLUME",
    "CALL_IV",
    "CALL_LTP",
    "CALL_CHNG",
    "CALL_BID_QTY",
    "CALL_BID",
    "CALL_ASK",
    "CALL_ASK_QTY",

    "STRIKE",

    "PUT_BID_QTY",
    "PUT_BID",
    "PUT_ASK",
    "PUT_ASK_QTY",
    "PUT_CHNG",
    "PUT_LTP",
    "PUT_IV",
    "PUT_VOLUME",
    "PUT_CHNG_OI",
    "PUT_OI"
]


# ============================================================
# EXCEL HEADERS
# ============================================================

HEADERS = [
    "OI",
    "CHNG IN OI",
    "VOLUME",
    "IV",
    "LTP",
    "CHNG",
    "BID QTY",
    "BID",
    "ASK",
    "ASK QTY",
    "STRIKE",
    "BID QTY",
    "BID",
    "ASK",
    "ASK QTY",
    "CHNG",
    "LTP",
    "IV",
    "VOLUME",
    "CHNG IN OI",
    "OI"
]


# ============================================================
# GLOBAL EXCEL LOCK
# ============================================================

EXCEL_LOCK = threading.Lock()


# ============================================================
# EXCEL INITIALIZATION STATE
# ============================================================

excel_layout_initialized = False


# ============================================================
# SHA-256
# ============================================================

def sha256_text(text):

    return hashlib.sha256(
        text.encode("utf-8")
    ).hexdigest()


# ============================================================
# BUILD CANONICAL SCHEMA
# ============================================================

def build_canonical_schema():

    return {
        "schema_version": SCHEMA_VERSION,

        "type": "NIFTY_OPTION_CHAIN",

        "total_columns": 21,

        "groups": {
            "calls": 10,
            "strike": 1,
            "puts": 10
        },

        "columns": EXPECTED_SCHEMA_COLUMNS
    }


# ============================================================
# CALCULATE APPROVED PYTHON FINGERPRINT
# ============================================================

def get_approved_schema_fingerprint():

    schema = build_canonical_schema()

    # Python's compact JSON representation must match the
    # semantic representation used by JavaScript.
    #
    # Property order is intentionally fixed by the dict
    # insertion order above.

    canonical_json = json.dumps(
        schema,
        ensure_ascii=False,
        separators=(",", ":")
    )

    return sha256_text(
        canonical_json
    )

# ============================================================
# MARKET SESSION STATE
# ============================================================

def get_market_state(
    now=None
):
    # return "OPEN" # Uncomment it to simulate that Market is OPEN
    """
    Return the current NSE F&O market state.

    States:

        CLOSED
        PRE_OPEN
        OPEN
        SPECIAL
        HOLIDAY
    """

    if now is None:

        now = datetime.now(
            IST
        )


    date_string = (
        now.strftime(
            "%Y-%m-%d"
        )
    )


    weekday = (
        now.weekday()
    )


    # ========================================================
    # WEEKEND
    # ========================================================

    if weekday >= 5:

        # Saturday / Sunday

        if date_string in NSE_SPECIAL_SESSIONS:

            return "SPECIAL"

        return "CLOSED"


    # ========================================================
    # FULL-DAY NSE F&O HOLIDAY
    # ========================================================

    if date_string in NSE_FO_HOLIDAYS_2026:

        return "HOLIDAY"


    # ========================================================
    # SPECIAL SESSION
    # ========================================================

    if date_string in NSE_SPECIAL_SESSIONS:

        open_time, close_time = (
            NSE_SPECIAL_SESSIONS[
                date_string
            ]
        )


        current_time = (
            now.time()
        )


        if current_time < open_time:

            return "CLOSED"


        if current_time >= close_time:

            return "CLOSED"


        return "SPECIAL"


    # ========================================================
    # REGULAR SESSION
    # ========================================================

    current_time = (
        now.time()
    )


    if current_time < MARKET_OPEN_TIME:

        return "PRE_OPEN"


    if current_time >= MARKET_CLOSE_TIME:

        return "CLOSED"


    return "OPEN"


# ============================================================
# MARKET IS LIVE?
# ============================================================

def market_is_open():

    return (
        get_market_state()
        in
        (
            "OPEN",
            "SPECIAL"
        )
    )

# ============================================================
# VALIDATE INCOMING SCHEMA
# ============================================================

def validate_incoming_schema(data):

    # --------------------------------------------------------
    # Extract metadata
    # --------------------------------------------------------

    incoming_version = data.get(
        "schema_version"
    )

    incoming_columns = data.get(
        "schema_columns"
    )

    incoming_fingerprint = data.get(
        "schema_fingerprint"
    )


    # --------------------------------------------------------
    # Version
    # --------------------------------------------------------

    if (
        incoming_version
        !=
        SCHEMA_VERSION
    ):

        raise RuntimeError(
            "Schema version mismatch: "
            f"expected {SCHEMA_VERSION}, "
            f"received {incoming_version}"
        )


    # --------------------------------------------------------
    # Columns must exist
    # --------------------------------------------------------

    if not isinstance(
        incoming_columns,
        list
    ):

        raise RuntimeError(
            "schema_columns is missing or invalid."
        )


    # --------------------------------------------------------
    # Exact column count
    # --------------------------------------------------------

    if len(
        incoming_columns
    ) != len(
        EXPECTED_SCHEMA_COLUMNS
    ):

        raise RuntimeError(
            "Schema column count mismatch: "
            f"expected "
            f"{len(EXPECTED_SCHEMA_COLUMNS)}, "
            f"received "
            f"{len(incoming_columns)}"
        )


    # --------------------------------------------------------
    # Exact semantic order
    # --------------------------------------------------------

    if (
        incoming_columns
        !=
        EXPECTED_SCHEMA_COLUMNS
    ):

        # Find first mismatch to make the error useful.

        mismatch_index = None

        for i, (
            expected,
            received
        ) in enumerate(
            zip(
                EXPECTED_SCHEMA_COLUMNS,
                incoming_columns
            )
        ):

            if expected != received:

                mismatch_index = i
                break


        if mismatch_index is None:

            mismatch_index = "unknown"


        raise RuntimeError(
            "Schema semantic mismatch at "
            f"position {mismatch_index}: "
            f"expected "
            f"'{EXPECTED_SCHEMA_COLUMNS[mismatch_index]}', "
            f"received "
            f"'{incoming_columns[mismatch_index]}'"
        )


    # --------------------------------------------------------
    # Fingerprint must exist
    # --------------------------------------------------------

    if not isinstance(
        incoming_fingerprint,
        str
    ):

        raise RuntimeError(
            "schema_fingerprint is missing or invalid."
        )


    # --------------------------------------------------------
    # Calculate fingerprint independently
    # --------------------------------------------------------

    approved_fingerprint = (
        get_approved_schema_fingerprint()
    )


    # --------------------------------------------------------
    # Compare
    # --------------------------------------------------------

    if (
        incoming_fingerprint
        !=
        approved_fingerprint
    ):

        raise RuntimeError(
            "Schema fingerprint mismatch. "
            f"Expected {approved_fingerprint}, "
            f"received {incoming_fingerprint}"
        )


    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    return {
        "schema_version":
            incoming_version,

        "columns":
            incoming_columns,

        "fingerprint":
            incoming_fingerprint
    }


# ============================================================
# CLEAN NSE VALUE
# ============================================================

def clean_value(value):

    if value is None:

        return "-"


    value = str(
        value
    ).strip()


    if value in (
        "",
        "-",
        "—"
    ):

        return "-"


    cleaned = value.replace(
        ",",
        ""
    )


    try:

        number = float(
            cleaned
        )


        if number.is_integer():

            return int(
                number
            )


        return number


    except ValueError:

        return value


# ============================================================
# CLEAN NIFTY SPOT
# ============================================================

def clean_spot(value):

    if value is None:

        return None


    try:

        if isinstance(
            value,
            str
        ):

            value = (
                value
                .replace(
                    ",",
                    ""
                )
                .strip()
            )


        spot = float(
            value
        )


        if spot <= 0:

            return None


        return spot


    except (
        ValueError,
        TypeError
    ):

        return None


# ============================================================
# GET EXACT EXCEL WORKBOOK
# ============================================================

def get_excel_sheet():

    # --------------------------------------------------------
    # Find already-open exact workbook.
    # --------------------------------------------------------

    for app in xw.apps:

        try:

            for book in app.books:

                try:

                    if (
                        book.fullname.lower()
                        ==
                        EXCEL_PATH.lower()
                    ):

                        return (
                            book,
                            book.sheets[
                                SHEET_NAME
                            ]
                        )

                except Exception:

                    continue

        except Exception:

            continue


    raise RuntimeError(
        "live_market_feed.xlsx is not open."
    )


# ============================================================
# INITIALIZE EXCEL LAYOUT
# ============================================================

def initialize_excel_layout(ws):

    global excel_layout_initialized


    if excel_layout_initialized:

        return


    print(
        "Initializing Excel layout..."
    )


    # ========================================================
    # HEADER STRUCTURE
    # ========================================================

    ws.range(
        "A1:J1"
    ).merge()

    ws.range(
        "A1"
    ).value = "CALLS"


    ws.range(
        "K1"
    ).value = ""


    ws.range(
        "L1:U1"
    ).merge()

    ws.range(
        "L1"
    ).value = "PUTS"


    ws.range(
        "A2:U2"
    ).value = [[

        "OI",
        "CHNG IN OI",
        "VOLUME",
        "IV",
        "LTP",
        "CHNG",
        "BID QTY",
        "BID",
        "ASK",
        "ASK QTY",
        "STRIKE",
        "BID QTY",
        "BID",
        "ASK",
        "ASK QTY",
        "CHNG",
        "LTP",
        "IV",
        "VOLUME",
        "CHNG IN OI",
        "OI"

    ]]


    # ========================================================
    # METADATA
    # ========================================================

    ws.range(
        "W1"
    ).value = "NIFTY SPOT"


    ws.range(
        "X1"
    ).value = "LAST FEED"


    # ========================================================
    # COLORS
    # ========================================================

    purple = (
        63,
        48,
        126
    )


    white = (
        255,
        255,
        255
    )


    red = (
        255,
        0,
        0
    )


    blue = (
        0,
        102,
        170
    )


    # ========================================================
    # GROUP HEADERS
    # ========================================================

    for rng in [

        "A1:J1",
        "L1:U1"

    ]:

        ws.range(
            rng
        ).color = purple

        ws.range(
            rng
        ).font.color = white

        ws.range(
            rng
        ).font.bold = True

        ws.range(
            rng
        ).font.size = 12

        ws.range(
            rng
        ).horizontal_alignment = "center"

        ws.range(
            rng
        ).vertical_alignment = "center"


    # ========================================================
    # COLUMN HEADERS
    # ========================================================

    ws.range(
        "A2:U2"
    ).color = purple

    ws.range(
        "A2:U2"
    ).font.color = white

    ws.range(
        "A2:U2"
    ).font.bold = True

    ws.range(
        "A2:U2"
    ).horizontal_alignment = "center"

    ws.range(
        "A2:U2"
    ).vertical_alignment = "center"


    # ========================================================
    # NIFTY SPOT
    # ========================================================

    ws.range(
        "W1:W2"
    ).font.bold = True

    ws.range(
        "W1"
    ).color = purple

    ws.range(
        "W1"
    ).font.color = white

    ws.range(
        "W1"
    ).horizontal_alignment = "center"

    ws.range(
        "W2"
    ).font.color = blue

    ws.range(
        "W2"
    ).number_format = '#,##0.00'

    ws.range(
        "W2"
    ).horizontal_alignment = "center"


    # ========================================================
    # LAST FEED
    # ========================================================

    ws.range(
        "X1:X2"
    ).font.bold = True

    ws.range(
        "X1"
    ).color = purple

    ws.range(
        "X1"
    ).font.color = white

    ws.range(
        "X1"
    ).horizontal_alignment = "center"

    ws.range(
        "X2"
    ).horizontal_alignment = "center"

    ws.range(
        "X2"
    ).number_format = "dd-mm-yyyy hh:mm:ss"


    # ========================================================
    # GENERAL ALIGNMENT
    # ========================================================

    ws.range(
        "A3:U1000"
    ).horizontal_alignment = "center"

    ws.range(
        "A3:U1000"
    ).vertical_alignment = "center"


    # ========================================================
    # BORDERS
    # ========================================================

    used_range = ws.range(
        "A1:U1000"
    )

    used_range.api.Borders.LineStyle = 1
    used_range.api.Borders.Weight = 2


    # ========================================================
    # COLUMN WIDTHS
    # ========================================================

    widths = {

        "A:A": 11,
        "B:B": 13,
        "C:C": 12,
        "D:D": 9,
        "E:E": 11,
        "F:F": 10,
        "G:G": 11,
        "H:H": 11,
        "I:I": 11,
        "J:J": 11,

        "K:K": 13,

        "L:L": 11,
        "M:M": 11,
        "N:N": 11,
        "O:O": 11,
        "P:P": 10,
        "Q:Q": 11,
        "R:R": 9,
        "S:S": 12,
        "T:T": 13,
        "U:U": 11,

        "W:W": 14,
        "X:X": 20
    }


    for column, width in widths.items():

        ws.range(
            column
        ).column_width = width


    # ========================================================
    # ROW HEIGHTS
    # ========================================================

    ws.range(
        "1:1"
    ).row_height = 24

    ws.range(
        "2:2"
    ).row_height = 38


    # ========================================================
    # NUMBER FORMATTING
    # ========================================================

    for rng in [

        "A3:C1000",
        "G3:G1000",
        "J3:J1000",
        "L3:L1000",
        "O3:O1000",
        "S3:U1000"

    ]:

        ws.range(
            rng
        ).number_format = '#,##0'


    ws.range(
        "D3:D1000"
    ).number_format = '0.00'

    ws.range(
        "R3:R1000"
    ).number_format = '0.00'


    for rng in [

        "E3:E1000",
        "H3:I1000",
        "K3:K1000",
        "M3:N1000",
        "Q3:Q1000"

    ]:

        ws.range(
            rng
        ).number_format = '#,##0.00'


    ws.range(
        "F3:F1000"
    ).number_format = '#,##0.00'

    ws.range(
        "P3:P1000"
    ).number_format = '#,##0.00'


    # ========================================================
    # LTP + STRIKE VISUAL STYLE
    # ========================================================

    for rng in [

        "E3:E1000",
        "K3:K1000",
        "Q3:Q1000"

    ]:

        ws.range(
            rng
        ).font.color = blue

        ws.range(
            rng
        ).font.bold = True

        ws.range(
            rng
        ).font.underline = True


    # ========================================================
    # CHANGE VALUES IN RED
    # ========================================================

    for rng in [

        "F3:F1000",
        "P3:P1000"

    ]:

        ws.range(
            rng
        ).font.color = red


    # ========================================================
    # FREEZE HEADER
    # ========================================================

    try:

        ws.api.Activate()

        ws.api.Application.ActiveWindow.SplitRow = 2

        ws.api.Application.ActiveWindow.SplitColumn = 0

        ws.api.Application.ActiveWindow.FreezePanes = True

    except Exception as e:

        print(
            "Freeze panes warning:",
            str(e)
        )


    excel_layout_initialized = True


    print(
        "Excel layout initialized."
    )


# ============================================================
# WRITE VERIFIED SNAPSHOT TO EXCEL
# ============================================================

def write_to_excel(
    rows,
    nifty_spot=None,
    schema_fingerprint=None
):

    with EXCEL_LOCK:

        # ----------------------------------------------------
        # Find exact workbook
        # ----------------------------------------------------

        app = xw.apps.active


        if app is None:

            raise RuntimeError(
                "Excel is not open."
            )


        wb, ws = (
            get_excel_sheet()
        )


        # ----------------------------------------------------
        # Initialize static layout once
        # ----------------------------------------------------

        initialize_excel_layout(
            ws
        )


        # ----------------------------------------------------
        # Prepare data
        # ----------------------------------------------------

        excel_rows = []


        for item in rows:

            if not isinstance(
                item,
                dict
            ):

                continue


            raw = item.get(
                "raw",
                []
            )


            # Current NSE DOM:
            #
            # 23 cells → strip wrappers → 21

            if (
                len(raw) == 23
            ):

                raw = raw[1:-1]


            if (
                len(raw) != 21
            ):

                raise RuntimeError(
                    "A verified row has "
                    f"{len(raw)} columns "
                    "instead of 21."
                )


            cleaned = [
                clean_value(
                    value
                )
                for value in raw
            ]


            excel_rows.append(
                cleaned
            )


        # ----------------------------------------------------
        # Never blank the existing snapshot.
        #
        # Write new data first.
        # ----------------------------------------------------

        count = len(excel_rows)


        if count == 0:

            raise RuntimeError(
                "No valid rows available "
                "for Excel update."
            )


        start_row = 3

        end_row = (
            start_row
            + count
            - 1
        )


        ws.range(
            f"A{start_row}:U{end_row}"
        ).value = excel_rows


        # ----------------------------------------------------
        # Remove obsolete rows AFTER the new snapshot is
        # already present.
        # ----------------------------------------------------

        if (
            end_row < 1000
        ):

            ws.range(
                f"A{end_row + 1}:U1000"
            ).clear_contents()


        # ----------------------------------------------------
        # NIFTY SPOT
        # ----------------------------------------------------

        cleaned_spot = clean_spot(
                nifty_spot
            )


        ws.range(
            "W2"
        ).value = cleaned_spot


        # ----------------------------------------------------
        # LAST FEED
        # ----------------------------------------------------

        last_feed = datetime.now()


        ws.range(
            "X2"
        ).value = last_feed

        ws.range(
            "X2"
        ).number_format = (
            "dd-mm-yyyy hh:mm:ss"
        )

        # ----------------------------------------------------
        # FINGERPRINT
        # ----------------------------------------------------

        ws.range("Y1").value = "SCHEMA FINGERPRINT"
        ws.range("Y2").value = schema_fingerprint

        return (

            wb.name,

            ws.name,

            count,

            cleaned_spot,

            last_feed.strftime(
                "%d-%m-%Y %H:%M:%S"
            )

        )

# ============================================================
# MARKET SESSION MONITOR
# ============================================================

def market_session_monitor():

    print(
        "Market session monitor started."
    )


    last_state = None


    while True:

        try:

            state = get_market_state()


            now = datetime.now(
                IST
            )


            if state != last_state:

                print(
                    f"Market state: "
                    f"{state} | "
                    f"{now.strftime('%Y-%m-%d %H:%M:%S %Z')}"
                )


                last_state = state


            # ------------------------------------------------
            # IMPORTANT:
            #
            # Do NOT immediately shut the server down here.
            #
            # The heartbeat handler must first return:
            #
            #     {"status": "market_closed"}
            #
            # to content.js.
            #
            # That lets content.js notify background.js, which
            # closes the #nifty-feed tab cleanly.
            #
            # ------------------------------------------------

        except Exception as error:

            print(
                "Market monitor error:",
                str(error)
            )


        time.sleep(
            5
        )

# ============================================================
# MARKET SHUTDOWN GUARD
# ============================================================

market_shutdown_triggered = False

market_shutdown_lock = (
    threading.Lock()
)


def request_market_shutdown():

    global market_shutdown_triggered


    with market_shutdown_lock:

        if market_shutdown_triggered:

            return


        market_shutdown_triggered = True


    print()
    print(
        "=========================================="
    )

    print(
        "🔴 NSE MARKET SESSION CLOSED"
    )

    print(
        "Stopping backend..."
    )

    print(
        "=========================================="
    )


    threading.Thread(
        target=server.shutdown,
        daemon=True
    ).start()

# ============================================================
# REQUEST HANDLER
# ============================================================

class RequestHandler(
    BaseHTTPRequestHandler
):


    # ========================================================
    # QUIET HTTP LOGGING
    # ========================================================

    def log_message(
        self,
        format,
        *args
    ):

        return


    # ========================================================
    # SEND JSON
    # ========================================================

    def send_json(
        self,
        status_code,
        data
    ):


        response = json.dumps(
                data,
                default=str
            ).encode(
                "utf-8"
            )


        self.send_response(
            status_code
        )


        self.send_header(
            "Content-Type",
            "application/json"
        )


        self.send_header(
            "Cache-Control",
            "no-store"
        )


        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )


        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )


        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )


        self.end_headers()


        self.wfile.write(
            response
        )


    # ============================================================
# GET /heartbeat
# ============================================================

    def do_GET(
        self
    ):

        if (
            self.path !=
            "/heartbeat"
        ):

            self.send_json(
                404,
                {
                    "status":
                        "error",

                    "message":
                        "Endpoint not found"
                }
            )

            return


        try:

            print(
                "Heartbeat requested..."
            )


            # ----------------------------------------------------
            # Python owns the 3-second feed cadence.
            # ----------------------------------------------------

            time.sleep(
                FEED_INTERVAL
            )


            # ----------------------------------------------------
            # Check the market AFTER the wait.
            #
            # This is important around 15:30.
            #
            # Example:
            #
            # 15:29:58 → heartbeat starts
            # 15:30:01 → sleep ends
            #
            # We check HERE, so the browser gets the explicit
            # MARKET CLOSED response instead of a generic network
            # failure.
            # ----------------------------------------------------

            market_state = get_market_state()


            now = datetime.now(
                    IST
                )


            # ====================================================
            # MARKET CLOSED / HOLIDAY
            # ====================================================

            if market_state in (
                "CLOSED",
                "HOLIDAY"
            ):

                print(
                    f"🔴 Heartbeat reached "
                    f"market state: {market_state}"
                )


                self.send_json(
                    200,
                    {

                        "status":
                            "market_closed",

                        "market_state":
                            market_state,

                        "message":
                            "NSE market session is closed.",

                        "timestamp":
                            now.isoformat(),

                        "timezone":
                            "Asia/Kolkata"

                    }
                )


                print(
                    "✅ MARKET_CLOSED response sent."
                )


                # ------------------------------------------------
                # Now shut the backend down.
                #
                # The HTTP response has already been written, so
                # content.js can receive MARKET_CLOSED first.
                # ------------------------------------------------

                request_market_shutdown()


                return


            # ====================================================
            # PRE-OPEN
            # ====================================================
            #
            # We don't stop the backend during pre-open.
            # This keeps the server available, while clearly
            # identifying that the regular 09:15 market has not
            # started yet.
            #
            # ====================================================

            if (
                market_state ==
                "PRE_OPEN"
            ):

                self.send_json(
                    200,
                    {

                        "status":
                            "pre_open",

                        "market_state":
                            "PRE_OPEN",

                        "interval":
                            FEED_INTERVAL,

                        "timestamp":
                            now.isoformat(),

                        "timezone":
                            "Asia/Kolkata"

                    }
                )


                print(
                    "🟡 PRE_OPEN heartbeat released."
                )


                return


            # ====================================================
            # SPECIAL SESSION
            # ====================================================

            if (
                market_state ==
                "SPECIAL"
            ):

                self.send_json(
                    200,
                    {

                        "status":
                            "tick",

                        "market_state":
                            "SPECIAL",

                        "interval":
                            FEED_INTERVAL,

                        "timestamp":
                            now.isoformat(),

                        "timezone":
                            "Asia/Kolkata"

                    }
                )


                print(
                    "🟠 SPECIAL SESSION heartbeat released."
                )


                return


            # ====================================================
            # NORMAL OPEN MARKET
            # ====================================================

            self.send_json(
                200,
                {

                    "status":
                        "tick",

                    "market_state":
                        "OPEN",

                    "interval":
                        FEED_INTERVAL,

                    "timestamp":
                        now.isoformat(),

                    "timezone":
                        "Asia/Kolkata"

                }
            )


            print(
                "🟢 Heartbeat released."
            )


        except Exception as e:

            print(
                "Heartbeat error:",
                str(e)
            )


            try:

                self.send_json(
                    500,
                    {

                        "status":
                            "error",

                        "message":
                            str(e)

                    }
                )

            except Exception:

                pass

        # ========================================================
    # OPTIONS
    # ========================================================

    def do_OPTIONS(
        self
    ):

        self.send_json(
            200,
            {
                "status":
                    "ok"
            }
        )


    # ========================================================
    # POST /update
    # ========================================================

    def do_POST(
        self
    ):

        if (
            self.path !=
            "/update"
        ):

            self.send_json(
                404,
                {
                    "status":
                        "error",

                    "message":
                        "Endpoint not found"
                }
            )

            return


        try:

            # ------------------------------------------------
            # Read body
            # ------------------------------------------------

            content_length = int(
                    self.headers.get(
                        "Content-Length",
                        0
                    )
                )


            if (
                content_length <= 0
            ):

                raise RuntimeError(
                    "Empty request body."
                )


            body = self.rfile.read(
                    content_length
                )


            data = json.loads(
                    body.decode(
                        "utf-8"
                    )
                )


            # ------------------------------------------------
            # VERIFY SCHEMA BEFORE EXCEL
            # ------------------------------------------------
            #
            # This MUST happen before write_to_excel().
            # If validation fails, Excel is untouched.
            # ------------------------------------------------

            schema_info = validate_incoming_schema(
                    data
                )


            print(
                "✅ Python schema verified:"
            )

            print(
                f"   Version: "
                f"{schema_info['schema_version']}"
            )

            print(
                f"   Fingerprint: "
                f"{schema_info['fingerprint']}"
            )


            # ------------------------------------------------
            # Extract option rows
            # ------------------------------------------------

            rows = data.get(
                    "rows",
                    []
                )


            if not isinstance(
                rows,
                list
            ):

                raise RuntimeError(
                    "rows must be a list."
                )


            print(
                f"Received "
                f"{len(rows)} verified rows"
            )


            # ------------------------------------------------
            # NIFTY spot
            # ------------------------------------------------

            nifty_spot = data.get(
                    "nifty_spot"
                )


            print(
                f"NIFTY Spot: "
                f"{nifty_spot}"
            )


            # ------------------------------------------------
            # Only now write Excel
            # ------------------------------------------------

            (
                workbook,
                sheet,
                count,
                stored_spot,
                last_feed
            ) = write_to_excel(
                rows,
                nifty_spot,
                schema_info["fingerprint"]
            )


            print(
                f"Wrote "
                f"{count} rows "
                f"to Excel"
            )


            print(
                f"Stored NIFTY Spot: "
                f"{stored_spot}"
            )


            print(
                f"Last Feed: "
                f"{last_feed}"
            )


            # ------------------------------------------------
            # SUCCESS
            # ------------------------------------------------

            self.send_json(
                200,
                {

                    "status":
                        "success",

                    "rows_written":
                        count,

                    "workbook":
                        workbook,

                    "sheet":
                        sheet,

                    "nifty_spot":
                        stored_spot,

                    "last_feed":
                        last_feed,

                    "schema_verified":
                        True,

                    "schema_fingerprint":
                        schema_info[
                            "fingerprint"
                        ]

                }
            )


        except Exception as e:

            print()
            print(
                "🚨 UPDATE REJECTED:"
            )

            print(
                str(e)
            )


            # IMPORTANT:
            #
            # If schema verification failed, write_to_excel()
            # was never called.

            self.send_json(
                500,
                {

                    "status":
                        "error",

                    "message":
                        str(e),

                    "schema_verified":
                        False

                }
            )


# ============================================================
# START SERVER
# ============================================================

server = ThreadingHTTPServer(
        (
            HOST,
            PORT
        ),
        RequestHandler
    )

# ============================================================
# START MARKET SESSION MONITOR
# ============================================================

market_monitor_thread = threading.Thread(
        target=
            market_session_monitor,
        daemon=True
    )


market_monitor_thread.start()



print()
print(
    "=========================================="
)

print(
    "   NIFTY 50 OPTION CHAIN BACKEND"
)

print(
    "=========================================="
)

print(
    f"Backend: "
    f"http://{HOST}:{PORT}"
)

print(
    f"Feed interval: "
    f"{FEED_INTERVAL} seconds"
)

print(
    f"Workbook: "
    f"{EXCEL_PATH}"
)

print(
    f"Sheet: "
    f"{SHEET_NAME}"
)

print(
    "Python schema verification: ENABLED"
)

print(
    "Waiting for Chrome extension..."
)

print(
    "Press Ctrl+C to stop."
)

print(
    "=========================================="
)


try:

    server.serve_forever()


except KeyboardInterrupt:

    print()
    print(
        "Server stopped."
    )


finally:

    server.server_close()
