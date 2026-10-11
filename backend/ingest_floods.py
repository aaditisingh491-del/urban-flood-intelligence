"""Validate and idempotently ingest source-backed flood inventory records."""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from backend.flood_intelligence import FloodStore, is_in_bengaluru, load_inventory

EVENT_TYPES = {"observed_flood", "official_flood_alert", "historical_flood", "rainfall_based_risk", "exposure_location"}
STATUSES = {"active", "resolved", "historical", "unverified"}
SEVERITIES = {"low", "moderate", "high", "critical", None}
CONFIDENCE = {"none", "low", "medium", "high", "verified"}
REQUIRED = {"location_id", "location_name", "city", "state", "country", "latitude", "longitude", "event_type", "status", "confidence", "source_name", "source_url", "fetched_at", "data_type"}


def read_input(path: str) -> list[dict]:
    file = Path(path)
    if file.suffix.lower() == ".csv":
        import csv
        with file.open(encoding="utf-8-sig", newline="") as stream:
            return list(csv.DictReader(stream))
    if file.suffix.lower() == ".json":
        value = json.loads(file.read_text(encoding="utf-8"))
        return value.get("records", []) if isinstance(value, dict) else value
    raise ValueError("Input must be a .csv or .json file")


def _timestamp(value, field):
    if value in (None, ""):
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone and use ISO 8601")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_records(rows: list[dict]) -> tuple[list[dict], int, list[str]]:
    """Return valid rows, skipped sample/duplicate count, and validation errors."""
    valid, skipped, errors, seen = [], 0, [], set()
    for index, original in enumerate(rows, 1):
        row = dict(original)
        if str(row.get("sample_only", "")).lower() in {"true", "1", "yes"} or row.get("data_type") == "sample_only":
            skipped += 1
            continue
        try:
            missing = sorted(field for field in REQUIRED if row.get(field) in (None, ""))
            if missing:
                raise ValueError("missing required fields: " + ", ".join(missing))
            row["latitude"], row["longitude"] = float(row["latitude"]), float(row["longitude"])
            if not (-90 <= row["latitude"] <= 90 and -180 <= row["longitude"] <= 180):
                raise ValueError("latitude/longitude out of range")
            if not is_in_bengaluru(row["latitude"], row["longitude"]):
                raise ValueError("coordinates are outside the configured Bengaluru service area")
            if row["event_type"] not in EVENT_TYPES or row["status"] not in STATUSES:
                raise ValueError("unsupported event_type or status")
            if str(row["confidence"]).lower() not in CONFIDENCE:
                raise ValueError("confidence must be none, low, medium, high, or verified")
            row["confidence"] = str(row["confidence"]).lower()
            if row["event_type"] == "historical_flood" and row["status"] not in {"historical", "resolved"}:
                raise ValueError("historical_flood records must have historical or resolved status")
            if row["event_type"] in {"observed_flood", "official_flood_alert"} and row["status"] == "active":
                if row["confidence"] not in {"high", "verified"} or not (row.get("observed_at") or row.get("last_verified_at")):
                    raise ValueError("active observations/alerts require high or verified confidence and an observation/verification timestamp")
            if row.get("severity") == "": row["severity"] = None
            if row.get("severity") not in SEVERITIES:
                raise ValueError("severity must be low, moderate, high, critical, or null")
            url = urlparse(str(row["source_url"]))
            if url.scheme not in {"https", "http"} or not url.netloc:
                raise ValueError("source_url must be an absolute HTTP(S) URL")
            for field in ("fetched_at", "observed_at", "last_verified_at", "expires_at"):
                row[field] = _timestamp(row.get(field), field)
            for field in ("rainfall_mm", "water_level"):
                if row.get(field) not in (None, ""):
                    row[field] = float(row[field])
                    if row[field] < 0:
                        raise ValueError(f"{field} cannot be negative")
            if row["location_id"] in seen:
                skipped += 1
                continue
            seen.add(row["location_id"])
            valid.append(row)
        except (TypeError, ValueError) as exc:
            errors.append(f"row {index}: {exc}")
    return valid, skipped, errors


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="JSON array or CSV file; omit for the bundled source inventory")
    parser.add_argument("--dry-run", action="store_true", help="validate and preview without AWS writes")
    args = parser.parse_args(argv)
    try:
        rows = read_input(args.input) if args.input else load_inventory()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Input failed: {exc}", file=sys.stderr)
        return 2
    valid, skipped, errors = validate_records(rows)
    print(f"Processed: {len(rows)} · Valid: {len(valid)} · Skipped: {skipped} · Failed: {len(errors)}")
    for error in errors: print(error, file=sys.stderr)
    if args.dry_run:
        print(json.dumps(valid, indent=2, ensure_ascii=False))
        print("Dry run only; no records were written.")
        return 1 if errors else 0
    if errors:
        print("No records were written because input validation failed.", file=sys.stderr)
        return 1
    if not valid:
        print("No eligible records to write.")
        return 0
    try:
        written = FloodStore().upsert_records(valid)
    except RuntimeError as exc:
        print(f"Write failed: {exc}. Processed: {len(rows)} · Skipped: {skipped} · Failed: {len(valid)}", file=sys.stderr)
        return 1
    print(f"DynamoDB confirmed batch write completion: {written} · Processed: {len(rows)} · Skipped: {skipped} · Failed: 0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
