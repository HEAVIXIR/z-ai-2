#!/usr/bin/env bash
# resolve-identity.sh
#
# SINGLE SOURCE OF TRUTH for E5 PostgreSQL identity validation.
# Both the E5 runbook and the E5 tests source this file.
#
# Functions provided:
#   resolve_connection_identity <db_url> <label>
#       Resolves the live identity of a PostgreSQL connection:
#         server        host:port, via
#                       COALESCE(inet_server_addr()::text,'NULL')
#                         || ':' ||
#                       COALESCE(inet_server_port()::text,'NULL')
#         cluster       system_identifier from pg_control_system()
#         db_name       current_database()
#         is_in_recovery pg_is_in_recovery()  ('f' = primary, 't' = standby)
#       Fails closed (returns 1) when ANY field is NULL/empty/UNRESOLVED.
#       On success, prints exactly one pipe-delimited line to stdout:
#           <server>|<cluster>|<db_name>|<is_in_recovery>
#
#   validate_connection_identity <db_url> <label> <expected_server>
#                                <expected_cluster> <expected_db> <require_primary>
#                                <ref_server> <ref_cluster>
#       Calls resolve_connection_identity, then validates EVERY field against the
#       supplied expected (and, when given, reference) values. For scratch and
#       restore flows the database-name match and the primary-role requirement are
#       enforced as independent checks (CR-06). Returns 0 on success, 1 on any
#       mismatch.
#
# Strict-ish mode: unset-variable and pipefail are enabled so problems surface,
# but `set -e` is deliberately NOT used so callers can capture exit codes.
set -uo pipefail

# Guard against accidental double-sourcing within the same shell.
if [[ -n "${_E5_RESOLVE_IDENTITY_SH:-}" ]]; then
    return 0 2>/dev/null || true
fi
_E5_RESOLVE_IDENTITY_SH=1
readonly _E5_RESOLVE_IDENTITY_SH

# ---------------------------------------------------------------------------
# resolve_connection_identity <db_url> <label>
# ---------------------------------------------------------------------------
resolve_connection_identity() {
    local db_url="${1:-}"
    local label="${2:-}"
    local rc
    local server cluster db_name is_in_recovery field
    local query_result err_file err_text

    if [[ -z "$db_url" ]]; then
        printf 'ERROR[%s]: resolve_connection_identity called with empty db_url\n' \
            "${label:-<no-label>}" >&2
        return 1
    fi

    # Capture stderr to a temp file so the data line (stdout) cannot be corrupted
    # by stray NOTICEs/messages on a successful round-trip.
    err_file=$(mktemp 2>/dev/null) || err_file="/tmp/e5_id_err.$$"

    # Single round-trip query. inet_server_addr()/inet_server_port() are wrapped
    # in COALESCE(...,'NULL') so that a NULL socket address surfaces as the
    # literal string "NULL" and is then rejected by the fail-closed check below.
    query_result=$(PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}" \
        psql "$db_url" -X -q -t -A -F '|' -v ON_ERROR_STOP=1 -c "
            SELECT
                COALESCE(inet_server_addr()::text, 'NULL')
                    || ':' ||
                    COALESCE(inet_server_port()::text, 'NULL')        AS server,
                s.system_identifier                                    AS cluster,
                current_database()                                     AS db_name,
                pg_is_in_recovery()                                    AS is_in_recovery
            FROM pg_control_system() s;
        " 2>"$err_file")
    rc=$?
    err_text=$(<"$err_file")
    rm -f "$err_file"

    if [[ $rc -ne 0 ]]; then
        printf 'ERROR[%s]: psql identity query failed (rc=%s): %s\n' \
            "$label" "$rc" "${err_text:-<no stderr>}" >&2
        return 1
    fi

    # psql -t -A prints exactly one pipe-delimited row. Normalize CRs and take
    # the first line so any trailing blank line cannot confuse the parser.
    query_result="${query_result//$'\r'/}"
    IFS='|' read -r server cluster db_name is_in_recovery <<< "$query_result"

    # Fail closed: any NULL/empty/UNRESOLVED field => refuse to return an
    # identity. This is the core safety property of E5 identity resolution.
    # E5-F08: The server field can be "NULL:NULL" when inet_server_addr() returns
    # NULL (Unix-domain socket). The regex ^(NULL|UNRESOLVED)$ doesn't match
    # "NULL:NULL" because of the colon, so we add an explicit check for it.
    for field in "$server" "$cluster" "$db_name" "$is_in_recovery"; do
        if [[ -z "$field" ]] || [[ "$field" =~ ^(NULL|UNRESOLVED)$ ]] || [[ "$field" == "NULL:NULL" ]]; then
            printf 'ERROR[%s]: unresolved identity field (server=%s cluster=%s db=%s recovery=%s)\n' \
                "$label" "$server" "$cluster" "$db_name" "$is_in_recovery" >&2
            return 1
        fi
    done

    printf '%s|%s|%s|%s\n' "$server" "$cluster" "$db_name" "$is_in_recovery"
    return 0
}

# ---------------------------------------------------------------------------
# validate_connection_identity <db_url> <label> <expected_server>
#                              <expected_cluster> <expected_db> <require_primary>
#                              <ref_server> <ref_cluster>
# ---------------------------------------------------------------------------
validate_connection_identity() {
    local db_url="${1:-}"
    local label="${2:-}"
    local expected_server="${3:-}"
    local expected_cluster="${4:-}"
    local expected_db="${5:-}"
    local require_primary="${6:-}"
    local ref_server="${7:-}"
    local ref_cluster="${8:-}"

    local resolved server cluster db_name is_in_recovery

    # 1. Resolve the live identity first. Any failure here is fatal.
    if ! resolved=$(resolve_connection_identity "$db_url" "$label"); then
        printf 'ERROR[%s]: resolve_connection_identity failed; cannot validate\n' \
            "$label" >&2
        return 1
    fi

    IFS='|' read -r server cluster db_name is_in_recovery <<< "$resolved"

    # 2. Validate server identity (host:port) against expected and reference.
    if [[ -n "$expected_server" && "$server" != "$expected_server" ]]; then
        printf 'ERROR[%s]: server mismatch (expected=%s actual=%s)\n' \
            "$label" "$expected_server" "$server" >&2
        return 1
    fi
    if [[ -n "$ref_server" && "$server" != "$ref_server" ]]; then
        printf 'ERROR[%s]: server mismatch vs reference (ref=%s actual=%s)\n' \
            "$label" "$ref_server" "$server" >&2
        return 1
    fi

    # 3. Validate cluster identifier (pg_control_system.system_identifier).
    if [[ -n "$expected_cluster" && "$cluster" != "$expected_cluster" ]]; then
        printf 'ERROR[%s]: cluster mismatch (expected=%s actual=%s)\n' \
            "$label" "$expected_cluster" "$cluster" >&2
        return 1
    fi
    if [[ -n "$ref_cluster" && "$cluster" != "$ref_cluster" ]]; then
        printf 'ERROR[%s]: cluster mismatch vs reference (ref=%s actual=%s)\n' \
            "$label" "$ref_cluster" "$cluster" >&2
        return 1
    fi

    # 4. CR-06: database-name match is enforced as an INDEPENDENT check for
    #    scratch and restore flows. It must hold regardless of server/cluster
    #    agreement.
    if [[ -n "$expected_db" && "$db_name" != "$expected_db" ]]; then
        printf 'ERROR[%s]: db_name mismatch (expected=%s actual=%s)\n' \
            "$label" "$expected_db" "$db_name" >&2
        return 1
    fi

    # 5. CR-06 + CR-11: primary-role requirement is enforced as an INDEPENDENT check.
    #    pg_is_in_recovery() returns 'f' for a primary, 't' for a standby.
    #
    #    CR-11 FIX: The prior `case` statement only checked for affirmative
    #    values (yes/true/on) and silently fell through for unknown values
    #    (e.g., "yees", "tru"), effectively disabling the primary guard.
    #    Now unknown values cause immediate failure (fail-closed).
    #
    #    Allowlist for require_primary:
    #      Affirmative (check primary): 1, true, yes, on (case-insensitive)
    #      Negative (skip primary check): 0, false, no, off (case-insensitive)
    #      Any other value → FAIL (return 1) — invalid configuration must not proceed
    case "${require_primary,,}" in
        1|true|yes|on)
            if [[ "$is_in_recovery" != "f" ]]; then
                printf 'ERROR[%s]: primary required but server is in recovery (is_in_recovery=%s)\n' \
                    "$label" "$is_in_recovery" >&2
                return 1
            fi
            ;;
        0|false|no|off)
            # Explicitly skipping primary check — legitimate for read-only validation
            ;;
        *)
            printf 'ERROR[%s]: invalid E5_REQUIRE_PRIMARY value "%s" — must be one of: 1/true/yes/on (require primary) or 0/false/no/off (skip)\n' \
                "$label" "$require_primary" >&2
            return 1
            ;;
    esac

    printf 'OK[%s]: identity validated (server=%s cluster=%s db=%s recovery=%s)\n' \
        "$label" "$server" "$cluster" "$db_name" "$is_in_recovery" >&2
    return 0
}
