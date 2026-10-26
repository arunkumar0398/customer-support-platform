#!/usr/bin/env python3
"""Check required planning docs and the initial acceptance ledger contract."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOC_REQUIREMENTS: dict[str, tuple[str, ...]] = {
    "docs/assumptions.md": (
        "## Employer requirements and project assumptions",
        "## Role and permission matrix",
        "## Tenant boundary",
        "## Ticket lifecycle",
        "## Dashboard definitions",
        "## Notification integration and failure behavior",
        "## Deferred and optional scope",
    ),
    "docs/architecture.md": (
        "## System shape",
        "## Local runtime and data flow",
        "## Security boundaries",
        "## Hosted topology (after approval)",
        "## Operations and reliability",
        "## Tradeoffs and growth path",
    ),
    "docs/data-model.md": (
        "## Entities and relationships",
        "## Tenant integrity",
        "## Constraints and indexes",
        "## Query and scale behavior",
    ),
    "docs/adr/0001-shared-postgres-and-membership-rbac.md": (
        "## Context",
        "## Decision",
        "## Consequences",
        "## Acceptance impact",
    ),
    "docs/adr/0002-staff-ticket-requester-selection.md": (
        "## Context",
        "## Decision",
        "## Consequences",
        "## Acceptance impact",
    ),
}


def main() -> int:
    errors: list[str] = []

    for relative_path, required_sections in DOC_REQUIREMENTS.items():
        path = ROOT / relative_path
        if not path.is_file():
            errors.append(f"Missing required document: {relative_path}")
            continue
        content = path.read_text(encoding="utf-8")
        for section in required_sections:
            if section not in content:
                errors.append(f"{relative_path}: missing required section: {section}")

    architecture_path = ROOT / "docs/architecture.md"
    if architecture_path.is_file():
        architecture = architecture_path.read_text(encoding="utf-8")
        if architecture.count("flowchart LR") < 2:
            errors.append("docs/architecture.md: expected separate local and hosted topology diagrams.")

    ledger_path = ROOT / "evidence/checkpoints/acceptance-status.md"
    if not ledger_path.is_file():
        errors.append("Missing required document: evidence/checkpoints/acceptance-status.md")
    else:
        ledger = ledger_path.read_text(encoding="utf-8")
        if not ledger.startswith("# Acceptance Status"):
            errors.append("Acceptance ledger must start with '# Acceptance Status'.")
        rows = re.findall(r"^\|\s*(A\d{2})\s*\|\s*([^|]+?)\s*\|", ledger, re.MULTILINE)
        ids = [acceptance_id for acceptance_id, _ in rows]
        expected = [f"A{number:02}" for number in range(1, 41)]
        duplicates = sorted({acceptance_id for acceptance_id in ids if ids.count(acceptance_id) > 1})
        missing = [acceptance_id for acceptance_id in expected if acceptance_id not in ids]
        unexpected = [acceptance_id for acceptance_id in ids if acceptance_id not in expected]
        if duplicates:
            errors.append(f"Acceptance ledger has duplicate IDs: {', '.join(duplicates)}")
        if missing:
            errors.append(f"Acceptance ledger is missing IDs: {', '.join(missing)}")
        if unexpected:
            errors.append(f"Acceptance ledger has unexpected IDs: {', '.join(sorted(set(unexpected)))}")
        if len(ids) != 40:
            errors.append(f"Acceptance ledger must contain exactly 40 ID rows; found {len(ids)}.")
        non_not_run = [acceptance_id for acceptance_id, result in rows if result.strip() != "NOT_RUN"]
        if non_not_run:
            errors.append(
                "Initial acceptance ledger must keep every result NOT_RUN; found other results for: "
                + ", ".join(non_not_run)
            )

    if errors:
        print("Documentation contract failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Documentation contract passed: required sections are present and A01-A40 are uniquely NOT_RUN.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
