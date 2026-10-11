from backend.ingest_floods import validate_records, read_input


def valid_row(**updates):
    row = {"location_id": "row-1", "location_name": "Test", "city": "Test City", "state": "Test State",
           "country": "India", "latitude": "12.9716", "longitude": "77.5946", "event_type": "historical_flood",
           "severity": "moderate", "status": "historical", "confidence": "medium", "source_name": "Test source",
           "source_url": "https://example.org/record", "fetched_at": "2026-01-01T00:00:00Z",
           "observed_at": "2020-01-01T00:00:00+05:30", "data_type": "historical_record"}
    return row | updates


def test_ingestion_validation_normalizes_timestamp_and_coordinates():
    valid, skipped, errors = validate_records([valid_row()])
    assert skipped == 0 and errors == []
    assert valid[0]["latitude"] == 12.9716
    assert valid[0]["observed_at"] == "2019-12-31T18:30:00Z"
    assert valid[0]["status"] == "historical"


def test_ingestion_rejects_invalid_coordinates_and_missing_sources():
    valid, skipped, errors = validate_records([valid_row(latitude="100"), valid_row(location_id="row-2", source_url="")])
    assert not valid and skipped == 0 and len(errors) == 2


def test_duplicates_and_sample_records_are_skipped():
    sample = read_input("backend/data/sample-upload.json")[0]
    valid, skipped, errors = validate_records([valid_row(), valid_row(), sample])
    assert len(valid) == 1 and skipped == 2 and errors == []
