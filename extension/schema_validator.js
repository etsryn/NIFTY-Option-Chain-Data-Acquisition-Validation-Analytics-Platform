// ============================================================
// NSE OPTION CHAIN SCHEMA VALIDATOR
// ============================================================
//
// Purpose:
//
// Protect the NSE → Python → Excel pipeline from silent
// semantic corruption if NSE changes the option-chain table.
//
// The validator intentionally ignores:
//
//     - colors
//     - fonts
//     - CSS classes
//     - spacing
//     - actual market values
//     - timestamps
//     - current row count
//
// It DOES validate:
//
//     - table identity
//     - logical column count
//     - CALL / STRIKE / PUT grouping
//     - normalized header semantics
//     - semantic column order
//     - value-type characteristics
//     - strike structure
//     - observed schema fingerprint
//
// FAIL CLOSED:
//
//     Safe / approved schema
//          ↓
//     FEED ALLOWED
//
//     Unknown / incompatible schema
//          ↓
//     FEED BLOCKED
//
// ============================================================


const NSE_SCHEMA_VERSION = 1;


// ============================================================
// EXPECTED CANONICAL SCHEMA
// ============================================================

const EXPECTED_SCHEMA = {

    type: "NIFTY_OPTION_CHAIN",

    total_columns: 21,

    groups: {
        calls: 10,
        strike: 1,
        puts: 10
    },

    columns: [

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
};


// ============================================================
// HEADER ALIASES
// ============================================================
//
// Different wording is allowed when the semantic meaning
// remains unchanged.
//
// Example:
//
//     CHNG IN OI
//     CHANGE IN OI
//     CHANGE IN OPEN INTEREST
//
// all normalize to:
//
//     CHNG_OI
// ============================================================

const HEADER_ALIASES = {

    OI: [
        "oi",
        "open interest",
        "openinterest"
    ],

    CHNG_OI: [
        "chng in oi",
        "change in oi",
        "change oi",
        "change in open interest",
        "change in openinterest",
        "change of oi"
    ],

    VOLUME: [
        "volume",
        "traded volume",
        "trading volume"
    ],

    IV: [
        "iv",
        "implied volatility"
    ],

    LTP: [
        "ltp",
        "last traded price",
        "last traded"
    ],

    CHNG: [
        "chng",
        "change",
        "change %"
    ],

    BID_QTY: [
        "bid qty",
        "bid quantity",
        "bid qty."
    ],

    BID: [
        "bid",
        "bid price"
    ],

    ASK: [
        "ask",
        "ask price"
    ],

    ASK_QTY: [
        "ask qty",
        "ask quantity",
        "ask qty."
    ],

    STRIKE: [
        "strike",
        "strike price"
    ]
};


// ============================================================
// NORMALIZE HEADER TEXT
// ============================================================

function normalizeHeaderText(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";
    }

    return String(value)
        .toLowerCase()
        .replace(
            /\u00a0/g,
            " "
        )
        .replace(
            /[_\-\/]+/g,
            " "
        )
        .replace(
            /[():.%]/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


// ============================================================
// RESOLVE HEADER → CANONICAL NAME
// ============================================================

function resolveCanonicalHeader(value) {

    const normalized =
        normalizeHeaderText(value);


    if (!normalized) {

        return null;
    }


    for (
        const [canonical, aliases]
        of Object.entries(
            HEADER_ALIASES
        )
    ) {

        for (
            const alias
            of aliases
        ) {

            if (
                normalized ===
                normalizeHeaderText(
                    alias
                )
            ) {

                return canonical;
            }
        }
    }


    return null;
}


// ============================================================
// FIND SEMANTIC HEADER ROW
// ============================================================

function findSemanticHeaderRow(table) {

    const headerRows =
        Array.from(
            table.querySelectorAll(
                "thead tr"
            )
        );


    const candidates = [];


    for (
        const row
        of headerRows
    ) {

        const cells =
            Array.from(
                row.querySelectorAll(
                    "th"
                )
            );


        if (
            cells.length !== 21 &&
            cells.length !== 23
        ) {

            continue;
        }


        let values =
            cells.map(
                cell =>
                    cell.innerText
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim()
            );


        // Existing NSE DOM may expose two wrapper cells.

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
            values.length === 21
        ) {

            candidates.push({
                row,
                values
            });
        }
    }


    if (
        candidates.length === 0
    ) {

        return null;
    }


    let bestCandidate =
        null;

    let bestScore =
        -1;


    for (
        const candidate
        of candidates
    ) {

        const score =
            candidate.values
                .filter(
                    value =>
                        resolveCanonicalHeader(
                            value
                        ) !== null
                )
                .length;


        if (
            score > bestScore
        ) {

            bestScore =
                score;

            bestCandidate =
                candidate;
        }
    }


    return bestCandidate;
}


// ============================================================
// BUILD CANONICAL COLUMN ORDER
// ============================================================

function buildCanonicalColumns(
    headerValues
) {

    if (
        !Array.isArray(
            headerValues
        ) ||
        headerValues.length !== 21
    ) {

        return null;
    }


    const resolved =
        headerValues.map(
            value =>
                resolveCanonicalHeader(
                    value
                )
        );


    if (
        resolved.some(
            value => value === null
        )
    ) {

        return null;
    }


    const result = [];


    for (
        let i = 0;
        i < resolved.length;
        i++
    ) {

        const field =
            resolved[i];


        // CALL SIDE
        if (
            i < 10
        ) {

            result.push(
                `CALL_${field}`
            );

        }

        // STRIKE
        else if (
            i === 10
        ) {

            if (
                field !== "STRIKE"
            ) {

                return null;
            }


            result.push(
                "STRIKE"
            );
        }

        // PUT SIDE
        else {

            result.push(
                `PUT_${field}`
            );
        }
    }


    return result;
}


// ============================================================
// NORMALIZE DATA ROW
// ============================================================

function normalizeDataRow(
    values
) {

    if (
        !Array.isArray(
            values
        )
    ) {

        return null;
    }


    // Current NSE DOM:
    //
    // [extra] + 21 useful values + [extra]

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

        return null;
    }


    return values;
}


// ============================================================
// NUMERIC TEST
// ============================================================

function isNumericLike(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return true;
    }


    const text =
        String(value)
            .trim();


    if (
        text === "" ||
        text === "-" ||
        text === "—"
    ) {

        return true;
    }


    const normalized =
        text.replace(
            /,/g,
            ""
        );


    const number =
        Number(
            normalized
        );


    return Number.isFinite(
        number
    );
}


// ============================================================
// INTEGER-LIKE TEST
// ============================================================

function isIntegerLike(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return true;
    }


    const text =
        String(value)
            .trim();


    if (
        text === "" ||
        text === "-" ||
        text === "—"
    ) {

        return true;
    }


    const normalized =
        text.replace(
            /,/g,
            ""
        );


    const number =
        Number(
            normalized
        );


    if (
        !Number.isFinite(
            number
        )
    ) {

        return false;
    }


    return Number.isInteger(
        number
    );
}


// ============================================================
// DATA SHAPE VALIDATION
// ============================================================

function validateDataShape(
    rows
) {

    if (
        !Array.isArray(
            rows
        ) ||
        rows.length === 0
    ) {

        return {

            valid: false,

            reason:
                "No option rows available."

        };
    }


    // Sample only several rows.
    //
    // We are checking structural characteristics,
    // NOT actual market values.

    const sample =
        rows.slice(
            0,
            Math.min(
                rows.length,
                10
            )
        );


    // --------------------------------------------------------
    // Columns expected to be integer-like
    // --------------------------------------------------------

    const integerColumns = [

        0,  // CALL OI
        1,  // CALL CHNG OI
        2,  // CALL VOLUME
        6,  // CALL BID QTY
        9,  // CALL ASK QTY

        11, // PUT BID QTY
        14, // PUT ASK QTY
        18, // PUT VOLUME
        19, // PUT CHNG OI
        20  // PUT OI

    ];


    for (
        const index
        of integerColumns
    ) {

        for (
            const row
            of sample
        ) {

            if (
                !isIntegerLike(
                    row[index]
                )
            ) {

                return {

                    valid: false,

                    reason:
                        `Column ${index + 1} ` +
                        "contains an unexpected " +
                        "non-integer value."

                };
            }
        }
    }


    // --------------------------------------------------------
    // Every option-chain field should be numeric-like
    // --------------------------------------------------------

    for (
        let index = 0;
        index < 21;
        index++
    ) {

        for (
            const row
            of sample
        ) {

            if (
                !isNumericLike(
                    row[index]
                )
            ) {

                return {

                    valid: false,

                    reason:
                        `Column ${index + 1} ` +
                        "contains non-numeric data."

                };
            }
        }
    }


    return {

        valid: true

    };
}


// ============================================================
// STRIKE STRUCTURE VALIDATION
// ============================================================

function validateStrikeStructure(
    rows
) {

    const strikes = [];


    for (
        const row
        of rows
    ) {

        const raw =
            String(
                row[10]
            )
                .replace(
                    /,/g,
                    ""
                )
                .trim();


        if (
            raw === "" ||
            raw === "-" ||
            raw === "—"
        ) {

            continue;
        }


        const strike =
            Number(
                raw
            );


        if (
            !Number.isFinite(
                strike
            )
        ) {

            return {

                valid: false,

                reason:
                    "Strike column contains " +
                    "non-numeric data."

            };
        }


        strikes.push(
            strike
        );
    }


    if (
        strikes.length < 3
    ) {

        return {

            valid: false,

            reason:
                "Too few valid strike values."

        };
    }


    // Remove duplicates while preserving order.

    const uniqueStrikes =
        [...new Set(
            strikes
        )];


    if (
        uniqueStrikes.length < 3
    ) {

        return {

            valid: false,

            reason:
                "Too few unique strike values."

        };
    }


    // --------------------------------------------------------
    // Check ordering
    // --------------------------------------------------------

    let ascending =
        true;

    let descending =
        true;


    for (
        let i = 1;
        i < uniqueStrikes.length;
        i++
    ) {

        if (
            uniqueStrikes[i]
            <=
            uniqueStrikes[i - 1]
        ) {

            ascending =
                false;
        }


        if (
            uniqueStrikes[i]
            >=
            uniqueStrikes[i - 1]
        ) {

            descending =
                false;
        }
    }


    if (
        !ascending &&
        !descending
    ) {

        return {

            valid: false,

            reason:
                "Strike values are not ordered."

        };
    }


    // --------------------------------------------------------
    // Calculate strike spacing
    // --------------------------------------------------------

    const differences = [];


    for (
        let i = 1;
        i < uniqueStrikes.length;
        i++
    ) {

        const difference =
            Math.abs(
                uniqueStrikes[i]
                -
                uniqueStrikes[i - 1]
            );


        if (
            difference > 0
        ) {

            differences.push(
                difference
            );
        }
    }


    if (
        differences.length === 0
    ) {

        return {

            valid: false,

            reason:
                "No valid strike spacing detected."

        };
    }


    const sortedDifferences =
        [...differences]
            .sort(
                (a, b) =>
                    a - b
            );


    const median =
        sortedDifferences[
        Math.floor(
            sortedDifferences.length / 2
        )
        ];


    // We intentionally do NOT hard-code 50.
    //
    // We simply reject clearly unreasonable spacing.

    if (
        median < 1 ||
        median > 5000
    ) {

        return {

            valid: false,

            reason:
                "Strike spacing looks unreasonable."

        };
    }


    // At least 75% of spacing intervals should resemble
    // the dominant spacing.

    const consistent =
        differences.filter(
            difference =>
                Math.abs(
                    difference - median
                )
                <=
                Math.max(
                    1,
                    median * 0.10
                )
        ).length;


    const consistency =
        consistent /
        differences.length;


    if (
        consistency < 0.75
    ) {

        return {

            valid: false,

            reason:
                "Strike spacing pattern is inconsistent."

        };
    }


    return {

        valid: true,

        median_spacing:
            median,

        consistency:
            consistency

    };
}


// ============================================================
// BUILD OBSERVED SCHEMA REPRESENTATION
// ============================================================
//
// THIS is the important part.
//
// We fingerprint what NSE ACTUALLY PRESENTED after
// normalization, rather than simply hashing EXPECTED_SCHEMA.
//
// Harmless changes such as:
//
//     "CHNG IN OI"
//     "CHANGE IN OI"
//
// become the same canonical field.
//
// Dangerous semantic/order changes produce a different
// observed representation.
// ============================================================

function buildObservedSchema(
    canonicalColumns
) {

    return {

        schema_version:
            NSE_SCHEMA_VERSION,

        type:
            EXPECTED_SCHEMA.type,

        total_columns:
            canonicalColumns.length,

        groups: {

            calls: 10,

            strike: 1,

            puts: 10
        },

        columns:
            canonicalColumns
    };
}


// ============================================================
// STRIKE SPACING CLASSIFICATION
// ============================================================
//
// We DO NOT fingerprint the exact current spacing value.
// That would make harmless contract changes unnecessarily
// alter the fingerprint.
//
// Instead we classify it broadly.
// ============================================================

function classifyStrikeSpacing(
    spacing
) {

    if (
        !Number.isFinite(
            spacing
        )
    ) {

        return "UNKNOWN";
    }


    if (
        spacing <= 10
    ) {

        return "TINY";
    }


    if (
        spacing <= 25
    ) {

        return "SMALL";
    }


    if (
        spacing <= 75
    ) {

        return "STANDARD";
    }


    if (
        spacing <= 250
    ) {

        return "WIDE";
    }


    return "VERY_WIDE";
}


// ============================================================
// BUILD DATA PROFILE
// ============================================================

function buildDataProfile(
    rows
) {

    const numericColumns = [];
    const integerColumns = [];


    for (
        let index = 0;
        index < 21;
        index++
    ) {

        let numericCount =
            0;

        let integerCount =
            0;

        let sampleCount =
            0;


        for (
            const row
            of rows.slice(
                0,
                Math.min(
                    rows.length,
                    20
                )
            )
        ) {

            const value =
                row[index];


            // Ignore empty/dash cells for profiling.

            if (
                value === null ||
                value === undefined ||
                String(value).trim() === "" ||
                String(value).trim() === "-" ||
                String(value).trim() === "—"
            ) {

                continue;
            }


            sampleCount++;


            if (
                isNumericLike(
                    value
                )
            ) {

                numericCount++;
            }


            if (
                isIntegerLike(
                    value
                )
            ) {

                integerCount++;
            }
        }


        if (
            sampleCount === 0
        ) {

            numericColumns.push(
                "EMPTY"
            );

            integerColumns.push(
                "EMPTY"
            );

            continue;
        }


        const numericRatio =
            numericCount /
            sampleCount;


        const integerRatio =
            integerCount /
            sampleCount;


        numericColumns.push(
            numericRatio >= 0.90
                ? "NUMERIC"
                : "NON_NUMERIC"
        );


        integerColumns.push(
            integerRatio >= 0.90
                ? "INTEGER"
                : "DECIMAL"
        );
    }


    return {

        numeric_columns:
            numericColumns,

        integer_columns:
            integerColumns,

        strike_column:
            "COLUMN_11"

    };
}


// ============================================================
// SHA-256 HELPER
// ============================================================

async function sha256(
    text
) {

    const encoder =
        new TextEncoder();


    const data =
        encoder.encode(
            text
        );


    const hashBuffer =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );


    return Array
        .from(
            new Uint8Array(
                hashBuffer
            )
        )
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(
                        2,
                        "0"
                    )
        )
        .join("");
}


// ============================================================
// CREATE OBSERVED SCHEMA FINGERPRINT
// ============================================================

async function createObservedSchemaFingerprint(
    observedSchema
) {

    const canonicalText =
        JSON.stringify(
            observedSchema
        );


    return sha256(
        canonicalText
    );
}


// ============================================================
// CREATE APPROVED SCHEMA REPRESENTATION
// ============================================================
//
// We build the approved representation using the SAME format
// as the observed representation.
//
// Therefore the comparison is meaningful.
// ============================================================

function buildApprovedSchemaProfile() {

    return {

        schema_version:
            NSE_SCHEMA_VERSION,

        type:
            EXPECTED_SCHEMA.type,

        total_columns:
            EXPECTED_SCHEMA
                .total_columns,

        groups: {

            calls:
                EXPECTED_SCHEMA
                    .groups.calls,

            strike:
                EXPECTED_SCHEMA
                    .groups.strike,

            puts:
                EXPECTED_SCHEMA
                    .groups.puts

        },

        columns:
            EXPECTED_SCHEMA.columns,

        data_profile: {

            // These correspond to the current canonical
            // 21-column structure.

            numeric_columns: [
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC",
                "NUMERIC"
            ],

            integer_columns: [
                "INTEGER",
                "INTEGER",
                "INTEGER",
                "DECIMAL",
                "DECIMAL",
                "DECIMAL",
                "INTEGER",
                "DECIMAL",
                "DECIMAL",
                "INTEGER",
                "DECIMAL",
                "INTEGER",
                "DECIMAL",
                "DECIMAL",
                "INTEGER",
                "DECIMAL",
                "DECIMAL",
                "DECIMAL",
                "INTEGER",
                "INTEGER",
                "INTEGER"
            ],

            strike_column:
                "COLUMN_11"

        },

        // Deliberately broad category rather than exact
        // strike spacing.

        strike_profile: {

            ordered:
                true,

            spacing_class:
                "STANDARD"

        }

    };
}


// ============================================================
// GET APPROVED FINGERPRINT
// ============================================================

async function getApprovedSchemaFingerprint() {

    const approvedSchema = {

        schema_version:
            NSE_SCHEMA_VERSION,

        type:
            EXPECTED_SCHEMA.type,

        total_columns:
            EXPECTED_SCHEMA.total_columns,

        groups: {

            calls:
                EXPECTED_SCHEMA.groups.calls,

            strike:
                EXPECTED_SCHEMA.groups.strike,

            puts:
                EXPECTED_SCHEMA.groups.puts
        },

        columns:
            EXPECTED_SCHEMA.columns
    };


    return createObservedSchemaFingerprint(
        approvedSchema
    );
}


// ============================================================
// COMPLETE OPTION-CHAIN VALIDATION
// ============================================================

async function validateOptionChainSchema(
    table,
    rows
) {

    const result = {

        valid:
            false,

        fingerprint:
            null,

        approved_fingerprint:
            null,

        reason:
            null,

        details: {

            schema_version:
                NSE_SCHEMA_VERSION,

            header_count:
                0,

            data_rows:
                rows.length,

            semantic_headers:
                [],

            strike_validation:
                null,

            data_profile:
                null

        }

    };


    // ========================================================
    // HEADER DISCOVERY
    // ========================================================

    const headerInfo =
        findSemanticHeaderRow(
            table
        );


    if (!headerInfo) {

        result.reason =
            "Could not identify a valid " +
            "option-chain header row.";

        return result;
    }


    result.details.header_count =
        headerInfo.values.length;


    // ========================================================
    // SEMANTIC HEADER RESOLUTION
    // ========================================================

    const canonicalColumns =
        buildCanonicalColumns(
            headerInfo.values
        );


    if (!canonicalColumns) {

        result.reason =
            "Header semantics could not " +
            "be mapped safely.";

        return result;
    }


    result.details.semantic_headers =
        canonicalColumns;


    // ========================================================
    // EXACT CANONICAL COLUMN COUNT
    // ========================================================

    if (
        canonicalColumns.length
        !==
        EXPECTED_SCHEMA.total_columns
    ) {

        result.reason =
            "Unexpected semantic column count.";

        return result;
    }


    // ========================================================
    // EXACT SEMANTIC ORDER
    // ========================================================

    for (
        let i = 0;
        i < EXPECTED_SCHEMA.columns.length;
        i++
    ) {

        if (
            canonicalColumns[i]
            !==
            EXPECTED_SCHEMA.columns[i]
        ) {

            result.reason =
                `Semantic column mismatch at ` +
                `position ${i + 1}: ` +
                `expected ${EXPECTED_SCHEMA.columns[i]}, ` +
                `found ${canonicalColumns[i]}.`;

            return result;
        }
    }


    // ========================================================
    // NORMALIZE DATA ROWS
    // ========================================================

    const normalizedRows =
        rows
            .map(
                row =>
                    normalizeDataRow(
                        row
                    )
            )
            .filter(
                row =>
                    row !== null
            );


    if (
        normalizedRows.length === 0
    ) {

        result.reason =
            "No structurally valid option rows.";

        return result;
    }


    // ========================================================
    // BASIC DATA SHAPE
    // ========================================================

    const shapeValidation =
        validateDataShape(
            normalizedRows
        );


    if (
        !shapeValidation.valid
    ) {

        result.reason =
            shapeValidation.reason;

        return result;
    }


    // ========================================================
    // STRIKE STRUCTURE
    // ========================================================

    const strikeValidation =
        validateStrikeStructure(
            normalizedRows
        );


    result.details.strike_validation =
        strikeValidation;


    if (
        !strikeValidation.valid
    ) {

        result.reason =
            strikeValidation.reason;

        return result;
    }


    // ========================================================
    // DATA PROFILE
    // ========================================================

    const observedSchema =
        buildObservedSchema(
            canonicalColumns
        );


    // ========================================================
    // FINGERPRINT OBSERVED SCHEMA
    // ========================================================

    const observedFingerprint =
        await createObservedSchemaFingerprint(
            observedSchema
        );


    result.fingerprint =
        observedFingerprint;


    // ========================================================
    // APPROVED FINGERPRINT
    // ========================================================

    const approvedFingerprint =
        await getApprovedSchemaFingerprint();


    result.approved_fingerprint =
        approvedFingerprint;


    // ========================================================
    // COMPARE
    // ========================================================

    if (
        observedFingerprint
        !==
        approvedFingerprint
    ) {

        result.reason =
            "Observed NSE schema fingerprint " +
            "does not match the approved schema.";

        return result;
    }


    // ========================================================
    // SUCCESS
    // ========================================================

    result.valid =
        true;


    result.reason =
        "NSE option-chain schema verified " +
        "and fingerprint approved.";


    return result;
}


// ============================================================
// LOAD MESSAGE
// ============================================================

console.log(
    "✅ NSE schema_validator.js LOADED"
);