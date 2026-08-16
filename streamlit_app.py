import json
from pathlib import Path

import xlwings as xw
import textwrap
import pandas as pd
import streamlit as st
from datetime import datetime, timedelta

# ============================================================
# PAGE CONFIG
# ============================================================

st.set_page_config(
    page_title="NIFTY 50 · Option Chain",
    page_icon="nifty_favicon.png",
    layout="wide",
    initial_sidebar_state="collapsed"
)


# ============================================================
# CUSTOM CSS
# ============================================================


CSS = """
<style>
.stApp {
    background: #f5f6f8;
    color: #111827;
}

.main .block-container {
    max-width: 100%;
    padding-top: 0.65rem;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
    padding-bottom: 1rem;
}

header[data-testid="stHeader"] {
    background: #ffffff;
}

#MainMenu, footer {
    visibility: hidden;
}

h1 {
    font-size: 36px !important;
    line-height: 1.05 !important;
    letter-spacing: -0.8px !important;
    font-weight: 800 !important;
    margin: 0 !important;
}

.stCaption {
    font-size: 13px !important;
    color: #64748b !important;
}

.terminal-kicker {
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    margin-bottom: 2px;
}

.health-text {
    font-size: 12px;
    color: #475569;
    font-weight: 800;
}

.health-good { color: #15803d; }
.health-warn { color: #b45309; }

.market-strip {
    border-top: 1px solid #d7dde6;
    border-bottom: 1px solid #d7dde6;
    margin: 8px 0 12px 0;
    padding: 9px 0;
}

.market-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
}

.market-label {
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.7px;
    text-transform: uppercase;
}

.market-value {
    color: #0f172a;
    font-size: 13px;
    font-weight: 800;
}

.market-open { color: #15803d; }
.market-closed { color: #92400e; }

div[data-testid="stMetric"] {
    background: #ffffff;
    border: 1px solid #dfe4eb;
    border-radius: 6px;
    padding: 9px 12px 8px 12px;
}

div[data-testid="stMetricLabel"] {
    font-size: 10px !important;
    font-weight: 800 !important;
    letter-spacing: 0.65px !important;
    text-transform: uppercase !important;
    color: #64748b !important;
}

div[data-testid="stMetricValue"] {
    font-size: 23px !important;
    font-weight: 800 !important;
    color: #0f172a !important;
}

.status-line {
    margin: 9px 0 10px 0;
    padding: 7px 0;
    border-bottom: 1px solid #d7dde6;
    color: #475569;
    font-size: 11px;
    font-weight: 700;
}
.status-line strong { color: #0f172a; }
.status-line .ok { color: #15803d; }

.section-rule {
    border-top: 1px solid #cfd6df;
    margin: 10px 0 8px 0;
}

.footer-note {
    margin-top: 8px;
    font-size: 10px;
    color: #94a3b8;
    text-align: right;
}

@media (max-width: 1100px) {
    h1 { font-size: 32px !important; }
    div[data-testid="stMetricValue"] { font-size: 20px !important; }
}


/* ============================================================
   TABLE
   ============================================================ */

.table-shell {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    overflow: hidden;
    box-shadow:
        0 1px 3px rgba(15, 23, 42, 0.04),
        0 8px 24px rgba(15, 23, 42, 0.04);
}

.option-scroll {
    overflow-x: auto;
    overflow-y: auto;
    max-height: 760px;
}

table.option-chain {
    width: max-content;
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 11px;
    white-space: nowrap;
}


/* ============================================================
   GROUP HEADERS
   ============================================================ */

table.option-chain thead tr.group-row th {
    position: sticky;
    top: 0;
    z-index: 6;
    padding: 10px 8px;
    text-align: center;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.55px;
    border-bottom: 1px solid #dbe1e8;
}

.group-call-nse {
    background: #eef2ff;
    color: #3730a3;
}

.group-call-custom {
    background: #f5f3ff;
    color: #6d28d9;
}

.group-strike {
    background: #111827;
    color: #ffffff;
}

.group-put-nse {
    background: #fff1f2;
    color: #be123c;
}

.group-put-custom {
    background: #fff7ed;
    color: #c2410c;
}


/* ============================================================
   COLUMN HEADERS
   ============================================================ */

table.option-chain thead tr.column-row th {
    position: sticky;
    top: 36px;
    z-index: 5;
    padding: 8px 8px;
    background: #f9fafb;
    color: #4b5563;
    font-size: 9.5px;
    font-weight: 750;
    text-align: center;
    letter-spacing: 0.25px;
    border-bottom: 1px solid #e5e7eb;
    border-right: 1px solid #f0f1f3;
}


/* ============================================================
   BODY
   ============================================================ */

table.option-chain tbody td {
    padding: 7px 8px;
    text-align: right;
    border-bottom: 1px solid #f0f1f3;
    border-right: 1px solid #f7f7f8;
    color: #1f2937;
    background: #ffffff;
}

table.option-chain tbody tr:hover td {
    background: #f8fafc;
}


/* ============================================================
   ITM SHADING — NSE STYLE
   ============================================================ */

/*
    CALL ITM:
        Strike < NIFTY Spot

    PUT ITM:
        Strike > NIFTY Spot

    These two regions mirror the original NSE option-chain
    visual convention.
*/

.itm-call {
    background: #f5f2dc !important;
}

.itm-put {
    background: #f5f2dc !important;
}


/* ============================================================
   STRIKE
   ============================================================ */

.strike-header {
    min-width: 100px;
}

.strike-cell {
    text-align: center !important;
    font-weight: 800 !important;
    color: #111827 !important;
    background: #f8fafc !important;
    position: sticky;
    left: 0;
    z-index: 3;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #d1d5db !important;
}

.strike-value {
    display: inline-block;
    padding: 3px 7px;
    border-radius: 6px;
    background: #eef2f7;
    color: #111827;
    font-weight: 800;
}


/* ============================================================
   SPECIAL VALUES
   ============================================================ */

.ltp {
    color: #1d4ed8 !important;
    font-weight: 750 !important;
}

.positive {
    color: #15803d !important;
    font-weight: 700 !important;
}

.negative {
    color: #dc2626 !important;
    font-weight: 700 !important;
}


/* ============================================================
   CUSTOM COLUMNS
   ============================================================ */

.custom-call {
    background: #faf8ff !important;
    color: #5b21b6 !important;
    font-weight: 750 !important;
}

.custom-put {
    background: #fffaf5 !important;
    color: #c2410c !important;
    font-weight: 750 !important;
}


/* ============================================================
   ATM
   ============================================================ */

tr.atm-row td {
    background: #fffbea !important;
    border-top: 1px solid #f1d36b;
    border-bottom: 1px solid #f1d36b;
}

tr.atm-row .strike-cell {
    background: #fff4c7 !important;
}

.atm-badge {
    display: inline-block;
    margin-left: 5px;
    padding: 2px 5px;
    border-radius: 5px;
    font-size: 8px;
    font-weight: 800;
    color: #92400e;
    background: #fde68a;
    vertical-align: middle;
}



.footer-note {
    margin-top: 8px;
    font-size: 10px;
    color: #94a3b8;
    text-align: right;
}

@media (max-width: 1100px) {
    h1 {
        font-size: 34px !important;
    }

    div[data-testid="stMetricValue"] {
        font-size: 23px !important;
    }

    .ops-value {
        font-size: 14px;
    }
}

</style>
"""

st.markdown(
    textwrap.dedent(CSS),
    unsafe_allow_html=True
)
# ============================================================
# RAW NSE DATA
# ============================================================

CALL_HEADERS = [
    "CALL OI",
    "CALL CHNG IN OI",
    "CALL VOLUME",
    "CALL IV",
    "CALL LTP",
    "CALL CHNG",
    "CALL BID QTY",
    "CALL BID",
    "CALL ASK",
    "CALL ASK QTY"
]

PUT_HEADERS = [
    "PUT BID QTY",
    "PUT BID",
    "PUT ASK",
    "PUT ASK QTY",
    "PUT CHNG",
    "PUT LTP",
    "PUT IV",
    "PUT VOLUME",
    "PUT CHNG IN OI",
    "PUT OI"
]

HEADERS = (
    CALL_HEADERS
    + ["STRIKE"]
    + PUT_HEADERS
)

# ============================================================
# LAST GOOD SNAPSHOT
# ============================================================
#
# This file stores the most recent successfully read market
# snapshot so the Streamlit UI can continue displaying the
# last known market state after:
#
#     - market close
#     - backend shutdown
#     - temporary Excel read failure
#
# It is project-relative and therefore portable with the
# project directory.
#
# ============================================================

PROJECT_DIR = (
    Path(__file__)
    .resolve()
    .parent
)

LAST_GOOD_SNAPSHOT_PATH = (
    PROJECT_DIR /
    "last_good_snapshot.json"
)

# ============================================================
# SNAPSHOT CACHE HELPERS
# ============================================================

def save_last_good_snapshot(
    df,
    nifty_spot,
    last_feed,
    schema_fingerprint,
    workbook,
    sheet
):

    try:

        payload = {

            "saved_at":
                datetime.now().isoformat(),

            "rows":
                df.to_dict(
                    orient="records"
                ),

            "nifty_spot":
                nifty_spot,

            "last_feed":
                (
                    last_feed.isoformat()
                    if isinstance(
                        last_feed,
                        datetime
                    )
                    else str(
                        last_feed
                    )
                ),

            "schema_fingerprint":
                schema_fingerprint,

            "workbook":
                workbook,

            "sheet":
                sheet
        }


        LAST_GOOD_SNAPSHOT_PATH.write_text(

            json.dumps(
                payload,
                ensure_ascii=False,
                default=str
            ),

            encoding="utf-8"

        )


    except Exception as error:

        # Snapshot persistence must NEVER make the dashboard
        # fail if the cache cannot be written.

        print(
            "Last-good snapshot save failed:",
            error
        )


def load_last_good_snapshot():

    try:

        if not LAST_GOOD_SNAPSHOT_PATH.exists():

            return None


        payload = json.loads(
                LAST_GOOD_SNAPSHOT_PATH.read_text(
                    encoding="utf-8"
                )
            )


        rows = payload.get(
                "rows",
                []
            )


        if not rows:

            return None


        df = pd.DataFrame(
                rows
            )


        # Ensure canonical column ordering.

        missing_columns = [
                column
                for column in HEADERS
                if column not in df.columns
            ]


        if missing_columns:

            return None


        df = df[
                HEADERS
            ]


        last_feed = payload.get(
                "last_feed"
            )


        if last_feed:

            parsed = pd.to_datetime(
                    last_feed,
                    errors="coerce"
                )


            if not pd.isna(
                parsed
            ):

                last_feed = parsed.to_pydatetime()


        return (

            df,

            payload.get(
                "nifty_spot"
            ),

            last_feed,

            payload.get(
                "schema_fingerprint"
            ),

            payload.get(
                "workbook",
                "live_market_feed.xlsx"
            ),

            payload.get(
                "sheet",
                "Sheet1"
            )

        )


    except Exception as error:

        print(
            "Last-good snapshot load failed:",
            error
        )


        return None
# ============================================================
# EXCEL DATA READER
# ============================================================

def read_excel_data():

    EXCEL_PATH = (
        str(
            PROJECT_DIR /
            "live_market_feed.xlsx"
        )
    )


    try:

        # ----------------------------------------------------
        # Find the exact workbook
        # ----------------------------------------------------

        wb = None


        for excel_app in xw.apps:

            try:

                for book in excel_app.books:

                    if (
                        book.fullname.lower()
                        == EXCEL_PATH.lower()
                    ):

                        wb = book

                        break

            except Exception:

                continue


            if wb is not None:

                break


        if wb is None:

            raise RuntimeError(
                "live_market_feed.xlsx is not open."
            )


        # ----------------------------------------------------
        # Exact worksheet
        # ----------------------------------------------------

        ws = wb.sheets[
                "Sheet1"
            ]


        # ----------------------------------------------------
        # OPTION CHAIN
        # ----------------------------------------------------

        values = ws.range(
                "A3:U107"
            ).value


        rows = []


        for row in values:

            if row is None:

                continue


            if not any(
                value not in (
                    None,
                    ""
                )
                for value in row
            ):

                continue


            rows.append(
                row
            )


        # ----------------------------------------------------
        # Reject an empty Excel snapshot.
        #
        # If Excel is currently empty because the backend has
        # stopped, we'll fall back to the persistent cache.
        # ----------------------------------------------------

        if not rows:

            raise RuntimeError(
                "Excel contains no market snapshot rows."
            )


        df = pd.DataFrame(
                rows,
                columns=HEADERS
            )


        # ----------------------------------------------------
        # ACTUAL NIFTY SPOT
        # ----------------------------------------------------

        nifty_spot = ws.range(
                "W2"
            ).value


        # ----------------------------------------------------
        # LAST FEED
        # ----------------------------------------------------

        last_feed = ws.range(
                "X2"
            ).value


        # ----------------------------------------------------
        # FINGERPRINT
        # ----------------------------------------------------

        schema_fingerprint = ws.range(
                "Y2"
            ).value


        workbook_name = wb.name


        sheet_name = ws.name


        # ----------------------------------------------------
        # SAVE LAST GOOD SNAPSHOT
        # ----------------------------------------------------

        save_last_good_snapshot(

            df,

            nifty_spot,

            last_feed,

            schema_fingerprint,

            workbook_name,

            sheet_name

        )


        return (

            df,

            nifty_spot,

            last_feed,

            schema_fingerprint,

            workbook_name,

            sheet_name

        )


    except Exception as error:

        print(
            "Excel read failed:",
            repr(error)
        )


        cached = (
            load_last_good_snapshot()
        )


        if cached is not None:

            print(
                "✅ Using last-good snapshot cache."
            )

            return cached


        print(
            "⚠️ No last-good snapshot cache available."
        )


        return (

            None,
            None,
            None,
            None,

            "live_market_feed.xlsx",

            f"ERROR: {error}"

        )


# ============================================================
# CALCULATIONS
# ============================================================

def safe_divide(
    numerator,
    denominator
):

    numerator = pd.to_numeric(
        numerator,
        errors="coerce"
    )

    denominator = pd.to_numeric(
        denominator,
        errors="coerce"
    )

    denominator = denominator.replace(
        0,
        pd.NA
    )

    return (
        numerator.div(
            denominator
        )
        * 100
    )


def calculate_custom_columns(df):

    # --------------------------------------------------------
    # CALL A
    # OI CHANGE %
    # --------------------------------------------------------

    df["CALL A"] = safe_divide(
        df["CALL CHNG IN OI"],
        df["CALL OI"]
    )


    # --------------------------------------------------------
    # CALL B
    # PREMIUM VALUE
    # --------------------------------------------------------

    call_oi = pd.to_numeric(
        df["CALL OI"],
        errors="coerce"
    )

    call_ltp = pd.to_numeric(
        df["CALL LTP"],
        errors="coerce"
    )

    df["CALL B"] = (
        call_oi * call_ltp
    )


    # --------------------------------------------------------
    # PUT C
    # OI CHANGE %
    # --------------------------------------------------------

    df["PUT C"] = safe_divide(
        df["PUT CHNG IN OI"],
        df["PUT OI"]
    )


    # --------------------------------------------------------
    # PUT D
    # PREMIUM VALUE
    # --------------------------------------------------------

    put_oi = pd.to_numeric(
        df["PUT OI"],
        errors="coerce"
    )

    put_ltp = pd.to_numeric(
        df["PUT LTP"],
        errors="coerce"
    )

    df["PUT D"] = (
        put_oi * put_ltp
    )

    return df


# ============================================================
# HELPERS
# ============================================================

def numeric(value):

    if value is None:
        return None

    if isinstance(value, str):

        value = value.strip()

        if value in (
            "",
            "-",
            "—"
        ):
            return None

        value = value.replace(
            ",",
            ""
        )

    try:

        return float(value)

    except (
        ValueError,
        TypeError
    ):

        return None


def format_number(
    value,
    decimals=0
):

    number = numeric(value)

    if number is None:
        return "—"

    return f"{number:,.{decimals}f}"


def format_percent(value):

    number = numeric(value)

    if number is None:
        return "—"

    return f"{number:,.2f}%"


def format_change(value):

    number = numeric(value)

    if number is None:
        return "—", ""

    formatted = f"{number:+,.2f}"

    if number > 0:
        return (
            formatted,
            "positive"
        )

    if number < 0:
        return (
            formatted,
            "negative"
        )

    return (
        formatted,
        ""
    )


def value_html(
    value,
    decimals=0,
    classes=""
):

    text = format_number(
        value,
        decimals
    )

    return (
        f'<td class="{classes}">'
        f'{text}'
        '</td>'
    )


def change_html(
    value,
    classes=""
):

    text, css_class = format_change(
        value
    )

    combined_classes = " ".join(
        item
        for item in [
            css_class,
            classes
        ]
        if item
    )

    return (
        f'<td class="{combined_classes}">'
        f'{text}'
        '</td>'
    )


def ltp_html(
    value,
    classes=""
):

    combined_classes = " ".join(
        item
        for item in [
            "ltp",
            classes
        ]
        if item
    )

    return (
        f'<td class="{combined_classes}">'
        f'{format_number(value, 2)}'
        '</td>'
    )


# ============================================================
# FEED STATUS
# ============================================================

def get_feed_status(last_feed):

    if last_feed is None:

        return (
            "WAITING",
            "summary-orange",
            False,
            "—"
        )


    try:

        # ----------------------------------------------------
        # Convert timestamp
        # ----------------------------------------------------

        if isinstance(
            last_feed,
            datetime
        ):

            feed_time = last_feed

        else:

            feed_time = pd.to_datetime(
                last_feed,
                errors="coerce"
            )

            if pd.isna(feed_time):

                return (
                    "WAITING",
                    "summary-orange",
                    False,
                    "—"
                )

            feed_time = feed_time.to_pydatetime()


        # ----------------------------------------------------
        # Age
        # ----------------------------------------------------

        now = datetime.now()

        age = (
            now - feed_time
        ).total_seconds()


        feed_time_display = (
            feed_time.strftime(
                "%H:%M:%S"
            )
        )


        # Feed arrives every 3 seconds.
        # 8 seconds provides reasonable tolerance.

        if age <= 8:

            return (
                "LIVE",
                "summary-green",
                True,
                feed_time_display
            )


        return (
            "STALE",
            "summary-orange",
            False,
            feed_time_display
        )


    except Exception:

        return (
            "WAITING",
            "summary-orange",
            False,
            "—"
        )


# ============================================================
# BUILD OPTION CHAIN HTML
# ============================================================

def build_option_chain_html(
    df,
    nifty_spot
):

    spot = numeric(
        nifty_spot
    )


    # ========================================================
    # STRIKES
    # ========================================================

    strike_numeric = pd.to_numeric(
        df["STRIKE"],
        errors="coerce"
    )

    valid_strikes = (
        strike_numeric.dropna()
    )


    # ========================================================
    # TRUE ATM
    # ========================================================

    atm_strike = None

    if (
        spot is not None
        and not valid_strikes.empty
    ):

        nearest_index = (
            (
                valid_strikes - spot
            )
            .abs()
            .idxmin()
        )

        atm_strike = (
            valid_strikes.loc[
                nearest_index
            ]
        )


    # ========================================================
    # TABLE HEADER
    # ========================================================

    html = """
<div class="table-shell">
<div class="option-scroll">

<table class="option-chain">

<thead>

<tr class="group-row">

<th colspan="10" class="group-call-nse">
    CALLS · NSE DATA
</th>

<th colspan="2" class="group-call-custom">
    CALLS · CUSTOM
</th>

<th rowspan="2" class="group-strike strike-header">
    STRIKE
</th>

<th colspan="10" class="group-put-nse">
    PUTS · NSE DATA
</th>

<th colspan="2" class="group-put-custom">
    PUTS · CUSTOM
</th>

</tr>

<tr class="column-row">

<th>OI</th>
<th>CHNG OI</th>
<th>VOLUME</th>
<th>IV</th>
<th>LTP</th>
<th>CHNG</th>
<th>BID QTY</th>
<th>BID</th>
<th>ASK</th>
<th>ASK QTY</th>

<th>CALL A</th>
<th>CALL B</th>

<th>BID QTY</th>
<th>BID</th>
<th>ASK</th>
<th>ASK QTY</th>
<th>CHNG</th>
<th>LTP</th>
<th>IV</th>
<th>VOLUME</th>
<th>CHNG OI</th>
<th>OI</th>

<th>PUT C</th>
<th>PUT D</th>

</tr>

</thead>

<tbody>
"""


    # ========================================================
    # DATA ROWS
    # ========================================================

    for _, row in df.iterrows():

        strike = numeric(
            row["STRIKE"]
        )


        # ----------------------------------------------------
        # ATM
        # ----------------------------------------------------

        is_atm = (
            atm_strike is not None
            and strike is not None
            and abs(
                strike - atm_strike
            ) < 0.001
        )


        # ----------------------------------------------------
        # ITM
        # ----------------------------------------------------

        # CALL ITM when strike < spot
        call_itm = (
            spot is not None
            and strike is not None
            and strike < spot
        )


        # PUT ITM when strike > spot
        put_itm = (
            spot is not None
            and strike is not None
            and strike > spot
        )


        call_class = (
            "itm-call"
            if call_itm
            else ""
        )

        put_class = (
            "itm-put"
            if put_itm
            else ""
        )


        tr_class = (
            "atm-row"
            if is_atm
            else ""
        )


        html += (
            f'<tr class="{tr_class}">'
        )


        # ====================================================
        # CALL NSE DATA
        # ====================================================

        html += value_html(
            row["CALL OI"],
            classes=call_class
        )

        html += value_html(
            row["CALL CHNG IN OI"],
            classes=call_class
        )

        html += value_html(
            row["CALL VOLUME"],
            classes=call_class
        )

        html += value_html(
            row["CALL IV"],
            2,
            classes=call_class
        )

        html += ltp_html(
            row["CALL LTP"],
            classes=call_class
        )

        html += change_html(
            row["CALL CHNG"],
            classes=call_class
        )

        html += value_html(
            row["CALL BID QTY"],
            classes=call_class
        )

        html += value_html(
            row["CALL BID"],
            2,
            classes=call_class
        )

        html += value_html(
            row["CALL ASK"],
            2,
            classes=call_class
        )

        html += value_html(
            row["CALL ASK QTY"],
            classes=call_class
        )


        # ====================================================
        # CALL CUSTOM
        # ====================================================

        call_a = numeric(
            row["CALL A"]
        )

        call_b = numeric(
            row["CALL B"]
        )

        html += (
            '<td class="custom-call">'
            f'{format_percent(call_a)}'
            '</td>'
        )

        html += (
            '<td class="custom-call">'
            f'{format_number(call_b, 0)}'
            '</td>'
        )


        # ====================================================
        # STRIKE
        # ====================================================

        strike_display = (
            format_number(
                strike,
                0
            )
            if strike is not None
            else "—"
        )


        atm_badge = (
            '<span class="atm-badge">ATM</span>'
            if is_atm
            else ""
        )


        html += (
            '<td class="strike-cell">'
            '<span class="strike-value">'
            f'{strike_display}'
            '</span>'
            f'{atm_badge}'
            '</td>'
        )


        # ====================================================
        # PUT NSE DATA
        # ====================================================

        html += value_html(
            row["PUT BID QTY"],
            classes=put_class
        )

        html += value_html(
            row["PUT BID"],
            2,
            classes=put_class
        )

        html += value_html(
            row["PUT ASK"],
            2,
            classes=put_class
        )

        html += value_html(
            row["PUT ASK QTY"],
            classes=put_class
        )

        html += change_html(
            row["PUT CHNG"],
            classes=put_class
        )

        html += ltp_html(
            row["PUT LTP"],
            classes=put_class
        )

        html += value_html(
            row["PUT IV"],
            2,
            classes=put_class
        )

        html += value_html(
            row["PUT VOLUME"],
            classes=put_class
        )

        html += value_html(
            row["PUT CHNG IN OI"],
            classes=put_class
        )

        html += value_html(
            row["PUT OI"],
            classes=put_class
        )


        # ====================================================
        # PUT CUSTOM
        # ====================================================

        put_c = numeric(
            row["PUT C"]
        )

        put_d = numeric(
            row["PUT D"]
        )

        html += (
            '<td class="custom-put">'
            f'{format_percent(put_c)}'
            '</td>'
        )

        html += (
            '<td class="custom-put">'
            f'{format_number(put_d, 0)}'
            '</td>'
        )


        html += "</tr>"


    # ========================================================
    # CLOSE TABLE
    # ========================================================

    html += """
</tbody>

</table>

</div>
</div>
"""

    return textwrap.dedent(
        html
    )



# ============================================================
# PROFESSIONAL MARKET TERMINAL UI
# ============================================================

@st.fragment(run_every="3s")
def live_terminal():

    (
        df,
        nifty_spot,
        last_feed,
        schema_fingerprint,
        workbook,
        sheet
    ) = read_excel_data()

    if df is None:
        st.error(f"Unable to read Excel: {sheet}")
        return

    df = calculate_custom_columns(df)

    # --------------------------------------------------------
    # LIVE VALUES
    # --------------------------------------------------------

    spot = numeric(nifty_spot)

    spot_display = (
        f"{spot:,.2f}"
        if spot is not None
        else "—"
    )

    strikes = pd.to_numeric(
        df["STRIKE"],
        errors="coerce"
    ).dropna()

    atm = "—"

    if spot is not None and not strikes.empty:
        nearest_index = (
            (strikes - spot)
            .abs()
            .idxmin()
        )

        atm_value = strikes.loc[
            nearest_index
        ]

        atm = f"{atm_value:,.0f}"

    total_call_oi = pd.to_numeric(
        df["CALL OI"],
        errors="coerce"
    ).sum()

    total_put_oi = pd.to_numeric(
        df["PUT OI"],
        errors="coerce"
    ).sum()

    pcr = (
        total_put_oi / total_call_oi
        if total_call_oi
        else None
    )

    pcr_display = (
        f"{pcr:.2f}"
        if pcr is not None
        else "—"
    )

    (
        feed_status,
        feed_status_class,
        feed_is_live,
        last_feed_display
    ) = get_feed_status(last_feed)

    data_age = "—"

    try:
        if isinstance(last_feed, datetime):
            feed_dt = last_feed
        else:
            feed_dt = pd.to_datetime(
                last_feed,
                errors="coerce"
            )

        if not pd.isna(feed_dt):
            if not isinstance(feed_dt, datetime):
                feed_dt = feed_dt.to_pydatetime()

            age = max(
                0,
                (datetime.now() - feed_dt).total_seconds()
            )

            data_age = f"{age:.1f}s"

    except Exception:
        data_age = "—"

    # ========================================================
    # MARKET SESSION
    # ========================================================

    now = datetime.now()

    market_open_time = now.replace(
        hour=9,
        minute=15,
        second=0,
        microsecond=0
    )

    market_close_time = now.replace(
        hour=15,
        minute=30,
        second=0,
        microsecond=0
    )

    is_weekday = now.weekday() < 5

    market_is_open = (
        is_weekday
        and
        market_open_time <= now <= market_close_time
    )

    if market_is_open:

        session_title = "MARKET OPEN"
        session_detail = "09:15–15:30 IST"
        session_color = "#15803d"

    else:

        session_title = "MARKET CLOSED"

        if is_weekday and now < market_open_time:

            next_open = market_open_time

        else:

            next_open = now + timedelta(days=1)

            while next_open.weekday() >= 5:
                next_open += timedelta(days=1)

            next_open = next_open.replace(
                hour=9,
                minute=15,
                second=0,
                microsecond=0
            )

        remaining_seconds = max(
            0,
            int(
                (
                    next_open - now
                ).total_seconds()
            )
        )

        rem_hours = remaining_seconds // 3600
        rem_minutes = (
            remaining_seconds % 3600
        ) // 60

        session_detail = (
            f"Opens 09:15 IST · "
            f"in {rem_hours}h {rem_minutes:02d}m"
        )

        session_color = "#b45309"


    # ========================================================
    # HEADER  (plain string concatenation — no HTML comments,
    # no giant f-string block — avoids Streamlit markdown
    # falling back to literal text rendering)
    # ========================================================

    header_html = (
        '<div style="display:flex;align-items:center;justify-content:space-between;'
        'padding-bottom:10px;border-bottom:2px solid #111827;margin-bottom:14px;">'
        '<div>'
        '<div style="color:#64748b;font-size:10.5px;font-weight:800;letter-spacing:1.4px;'
        'text-transform:uppercase;margin-bottom:3px;">NSE INDIA &nbsp;&middot;&nbsp; MARKET DATA TERMINAL</div>'
        '<div style="font-size:30px;font-weight:800;letter-spacing:-0.6px;color:#0f172a;line-height:1.1;">'
        'NIFTY 50 <span style="color:#94a3b8;font-weight:600;">/</span> Option Chain</div>'
        '<div style="color:#64748b;font-size:12.5px;font-weight:500;margin-top:3px;">'
        'Live market structure &nbsp;&middot;&nbsp; NSE source data &nbsp;&middot;&nbsp; Custom analytics</div>'
        '</div>'
        '<div style="text-align:right;">'
        + f'<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:5px;'
        + f'background:{"#ecfdf3" if market_is_open else "#fffbeb"};'
        + f'border:1px solid {"#a7e3bc" if market_is_open else "#fde68a"};">'
        + f'<span style="width:7px;height:7px;border-radius:50%;background:{session_color};'
        + f'box-shadow:0 0 0 3px {"rgba(21,128,61,0.12)" if market_is_open else "rgba(180,83,9,0.12)"};"></span>'
        + f'<span style="font-size:11.5px;font-weight:800;letter-spacing:0.5px;color:{session_color};">'
        + f'{session_title}</span>'
        + '</div>'
        + f'<div style="color:#64748b;font-size:10.5px;font-weight:600;margin-top:5px;">{session_detail}</div>'
        + '</div>'
        + '</div>'
    )

    st.markdown(header_html, unsafe_allow_html=True)

    # ========================================================
    # INSTITUTIONAL STATUS PANEL
    # ========================================================
    #
    # Single coherent terminal panel:
    #   1) Session / feed header
    #   2) Primary market metrics
    #   3) Integrity / destination metadata
    #   4) Session progress
    #
    # No nested "puzzle" of unrelated boxes.
    # ========================================================

    feed_dot_color = (
        "#16a34a"
        if feed_is_live
        else "#d97706"
    )

    feed_bg = (
        "rgba(22,163,74,0.08)"
        if feed_is_live
        else "rgba(217,119,6,0.08)"
    )

    feed_label = (
        "LIVE FEED"
        if feed_is_live
        else "STALE FEED"
    )

    rows_ratio = f"{len(df)} / 105"

    schema_ok = (
        bool(schema_fingerprint)
        and len(df) > 0
    )

    fingerprint_display = (
        f"{str(schema_fingerprint)[:12]}…"
        if schema_fingerprint
        else "—"
    )

    fingerprint_state = (
        "MATCHED"
        if schema_ok
        else "MISMATCHED"
    )

    fingerprint_color = (
        "#15803d"
        if schema_ok
        else "#dc2626"
    )

    session_pct = (
        min(
            100,
            max(
                0,
                (
                    (
                        now - market_open_time
                    ).total_seconds()
                    /
                    (
                        market_close_time
                        - market_open_time
                    ).total_seconds()
                ) * 100
            )
        )
        if market_is_open
        else 0
    )


    # --------------------------------------------------------
    # CELL HELPERS
    # --------------------------------------------------------

    def metric_cell(
        label,
        value,
        color="#0f172a",
        border_right=True,
        value_size="19px"
    ):

        border = (
            "border-right:1px solid #e4e9ef;"
            if border_right
            else ""
        )

        return (
            f'<div style="'
            f'padding:12px 16px 13px;'
            f'{border}'
            f'box-sizing:border-box;'
            f'">'
            f'<div style="'
            f'font-size:9px;'
            f'font-weight:850;'
            f'letter-spacing:0.8px;'
            f'text-transform:uppercase;'
            f'color:#64748b;'
            f'margin-bottom:6px;'
            f'">'
            f'{label}'
            f'</div>'
            f'<div style="'
            f'font-size:{value_size};'
            f'font-weight:800;'
            f'line-height:1.15;'
            f'color:{color};'
            f'white-space:nowrap;'
            f'overflow:hidden;'
            f'text-overflow:ellipsis;'
            f'">'
            f'{value}'
            f'</div>'
            f'</div>'
        )


    def metadata_cell(
        label,
        value,
        color="#0f172a",
        border_right=True,
        mono=False
    ):

        border = (
            "border-right:1px solid #e4e9ef;"
            if border_right
            else ""
        )

        font_family = (
            "font-family:Consolas,Monaco,monospace;"
            if mono
            else ""
        )

        return (
            f'<div style="'
            f'padding:10px 16px 11px;'
            f'{border}'
            f'box-sizing:border-box;'
            f'">'
            f'<div style="'
            f'font-size:8.5px;'
            f'font-weight:850;'
            f'letter-spacing:0.75px;'
            f'text-transform:uppercase;'
            f'color:#94a3b8;'
            f'margin-bottom:4px;'
            f'">'
            f'{label}'
            f'</div>'
            f'<div style="'
            f'font-size:11px;'
            f'font-weight:800;'
            f'{font_family}'
            f'color:{color};'
            f'white-space:nowrap;'
            f'overflow:hidden;'
            f'text-overflow:ellipsis;'
            f'">'
            f'{value}'
            f'</div>'
            f'</div>'
        )


    # --------------------------------------------------------
    # PANEL ROOT
    # --------------------------------------------------------

    panel_parts = [

        '<div style="'
        'background:#ffffff;'
        'border:1px solid #d7dee8;'
        'border-radius:8px;'
        'overflow:hidden;'
        'box-shadow:0 1px 2px rgba(15,23,42,0.035),'
        '0 5px 16px rgba(15,23,42,0.025);'
        'margin-bottom:14px;'
        '">'
    ]


    # --------------------------------------------------------
    # PANEL HEADER
    # --------------------------------------------------------

    panel_parts.append(
        '<div style="'
        'display:flex;'
        'align-items:center;'
        'justify-content:space-between;'
        'padding:10px 16px;'
        'background:#fbfcfe;'
        'border-bottom:1px solid #dfe5ec;'
        '">'
        '<div style="'
        'font-size:10.5px;'
        'font-weight:850;'
        'letter-spacing:0.9px;'
        'text-transform:uppercase;'
        'color:#0f172a;'
        '">'
        'MARKET STATUS'
        '</div>'
        '<div style="'
        'display:flex;'
        'align-items:center;'
        'gap:8px;'
        '">'
        '<span style="'
        'font-size:9px;'
        'font-weight:800;'
        'letter-spacing:0.65px;'
        'color:#94a3b8;'
        'text-transform:uppercase;'
        '">'
        'NIFTY 50 · NSE INDIA'
        '</span>'
        + f'<span style="'
        f'display:inline-flex;'
        f'align-items:center;'
        f'gap:6px;'
        f'padding:4px 9px;'
        f'border-radius:4px;'
        f'background:{feed_bg};'
        f'">'
        + f'<span style="'
        f'width:6px;'
        f'height:6px;'
        f'border-radius:50%;'
        f'background:{feed_dot_color};'
        f'"></span>'
        + f'<span style="'
        f'font-size:9.5px;'
        f'font-weight:850;'
        f'letter-spacing:0.55px;'
        f'color:{"#15803d" if feed_is_live else "#b45309"};'
        f'">'
        f'{feed_label}'
        '</span>'
        '</span>'
        '</div>'
        '</div>'
    )


    # --------------------------------------------------------
    # PRIMARY METRICS — ONE CONSISTENT SIX-COLUMN GRID
    # --------------------------------------------------------

    panel_parts.append(
        '<div style="'
        'display:grid;'
        'grid-template-columns:repeat(6,minmax(0,1fr));'
        'border-bottom:1px solid #e4e9ef;'
        '">'
    )

    panel_parts.append(
        metric_cell(
            "NIFTY SPOT",
            spot_display
        )
    )

    panel_parts.append(
        metric_cell(
            "ATM STRIKE",
            atm
        )
    )

    panel_parts.append(
        metric_cell(
            "PUT / CALL OI",
            pcr_display
        )
    )

    panel_parts.append(
        metric_cell(
            "LAST SUCCESS",
            last_feed_display
        )
    )

    panel_parts.append(
        metric_cell(
            "DATA AGE",
            data_age,
            color=(
                "#15803d"
                if feed_is_live
                else "#b45309"
            )
        )
    )

    panel_parts.append(
        metric_cell(
            "OPTION ROWS",
            len(df),
            border_right=False
        )
    )

    panel_parts.append('</div>')


    # --------------------------------------------------------
    # INTEGRITY / DESTINATION — SAME FIVE-COLUMN LANGUAGE
    # --------------------------------------------------------

    panel_parts.append(
        '<div style="'
        'display:grid;'
        'grid-template-columns:1fr 1.25fr 1fr 1.35fr 1.6fr;'
        'background:#fbfcfe;'
        'border-bottom:1px solid #e4e9ef;'
        '">'
    )

    panel_parts.append(
        metadata_cell(
            "SCHEMA",
            "VERIFIED" if schema_ok else "ERROR",
            "#15803d" if schema_ok else "#dc2626"
        )
    )

    panel_parts.append(
        metadata_cell(
            "FINGERPRINT",
            fingerprint_state,
            fingerprint_color
        )
    )

    panel_parts.append(
        metadata_cell(
            "SNAPSHOT",
            f"{rows_ratio} ROWS"
        )
    )

    panel_parts.append(
        metadata_cell(
            "DATA SOURCE",
            "NSE INDIA · NIFTY 50"
        )
    )

    panel_parts.append(
        metadata_cell(
            "EXCEL TARGET",
            f"{workbook} · {sheet}",
            border_right=False
        )
    )

    panel_parts.append('</div>')


    # --------------------------------------------------------
    # SESSION FOOTER — SIMPLE, NOT ANOTHER BOX
    # --------------------------------------------------------

    panel_parts.append(
        '<div style="'
        'padding:9px 16px 10px;'
        '">'
        '<div style="'
        'display:flex;'
        'align-items:center;'
        'justify-content:space-between;'
        'gap:16px;'
        'margin-bottom:5px;'
        '">'
        '<span style="'
        'font-size:8.5px;'
        'font-weight:800;'
        'letter-spacing:0.65px;'
        'text-transform:uppercase;'
        'color:#94a3b8;'
        '">'
        'REGULAR NSE EQUITY SESSION · 09:15–15:30 IST'
        '</span>'
        + f'<span style="'
        f'font-size:8.5px;'
        f'font-weight:850;'
        f'color:{session_color};'
        f'">'
        f'{session_pct:.0f}%'
        '</span>'
        '</div>'
        '<div style="'
        'height:3px;'
        'width:100%;'
        'background:#e7ebf0;'
        'border-radius:2px;'
        'overflow:hidden;'
        '">'
        + f'<div style="'
        f'height:100%;'
        f'width:{session_pct}%;'
        f'background:{session_color};'
        f'border-radius:2px;'
        f'"></div>'
        '</div>'
        '</div>'
    )


    panel_parts.append('</div>')

    st.markdown(
        "".join(panel_parts),
        unsafe_allow_html=True
    )


# TABLE HEADING
    # --------------------------------------------------------

    st.markdown(
        '<div class="section-rule"></div>',
        unsafe_allow_html=True
    )

    table_title, table_meta = st.columns(
        [1.3, 1.0],
        vertical_alignment="bottom"
    )

    with table_title:
        st.subheader("Live option chain")
        st.caption(
            "NSE source fields · Custom analytics · ATM highlighted"
        )

    with table_meta:
        st.markdown(
            '<div style="text-align:right;color:#64748b;font-size:11px;font-weight:700;">'
            '21 SOURCE FIELDS · 4 ANALYTICS FIELDS'
            '</div>',
            unsafe_allow_html=True
        )

    # --------------------------------------------------------
    # TABLE — KEEP USER'S TABLE IMPLEMENTATION UNCHANGED
    # --------------------------------------------------------

    table_html = build_option_chain_html(
        df,
        nifty_spot
    )

    st.markdown(
        table_html,
        unsafe_allow_html=True
    )

    # --------------------------------------------------------
    # FOOTER
    # --------------------------------------------------------

    current_time = datetime.now().strftime(
        "%H:%M:%S"
    )

    st.markdown(
        f'<div class="footer-note">'
        f'Source: NSE India · Workbook: {workbook} · Sheet: {sheet}'
        f' · UI refresh: {current_time} IST'
        f'</div>',
        unsafe_allow_html=True
    )


# ============================================================
# RUN
# ============================================================

live_terminal()