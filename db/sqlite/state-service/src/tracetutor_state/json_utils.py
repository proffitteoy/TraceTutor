from __future__ import annotations

import json
from typing import Any, Iterable, Mapping

JSON_COLUMNS = {
    "preference_json",
    "metadata_json",
    "structured_json",
    "input_json",
    "output_json",
    "output_summary_json",
    "delta_json",
    "state_value_json",
    "event_json",
    "value_json",
}


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def loads(value: str | None, default: Any = None) -> Any:
    if value is None:
        return default
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default if default is not None else value


def decode_mapping(row: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    result = dict(row)
    for key in JSON_COLUMNS.intersection(result):
        result[key] = loads(result[key], {})
    return result


def decode_rows(rows: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return [decode_mapping(row) or {} for row in rows]
