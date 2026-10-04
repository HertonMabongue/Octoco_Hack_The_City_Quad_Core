from __future__ import annotations

from app import db
from app.machine_learning import hotspots, seed_reports


def test_seed_populates_hotspots_once(client):
    added = seed_reports.seed_if_empty()
    assert added > 0
    assert seed_reports.seed_if_empty() == 0, "restart must not pile on more"

    reports = hotspots.located_reports()
    found = hotspots.find_hotspots(reports)
    assert len(reports) == added and all(r["simulated"] for r in reports)
    assert len(found) >= 2 and {h["action"] for h in found} >= {"add_bin", "cleanup_crew"}


def test_seed_keeps_real_reports_and_counts_resolved_ones(client):
    real = db.insert_report(-33.93, 18.86, "real one", None)
    seed_reports.seed_if_empty()
    with db.get_connection() as con:
        con.execute("UPDATE reports SET resolved = 1 WHERE note LIKE '[simulated]%'")
        con.commit()
    assert seed_reports.seed_if_empty() == 0            # resolved seeds still count as "already seeded"
    assert db.get_report(real) is not None
