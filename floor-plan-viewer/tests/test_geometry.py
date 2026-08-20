"""Geometry primitive parity tests. Run: pytest tests/test_geometry.py

Same fixture file (fixtures/geometry-cases.json) is asserted by the JS suite
(scripts/geometry.test.mjs) against src/lib/geometry.js — keeps both impls in
lockstep.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from app import point_in_polygon, _polygon_area_norm

FIXTURE = json.loads(
    (Path(__file__).parent.parent / "fixtures" / "geometry-cases.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: c["name"])
def test_polygon_area(case):
    assert abs(_polygon_area_norm(case["polygon"]) - case["area"]) < 1e-9


@pytest.mark.parametrize(
    "case,query",
    [(c, q) for c in FIXTURE["cases"] for q in c["queries"]],
    ids=lambda v: v["name"] if isinstance(v, dict) and "name" in v else None,
)
def test_point_in_polygon(case, query):
    assert point_in_polygon(query["x"], query["y"], case["polygon"]) == query["inside"]
