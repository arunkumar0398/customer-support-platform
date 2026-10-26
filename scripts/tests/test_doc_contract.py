"""Regression checks for the evolving acceptance ledger validator."""
import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("doc_contract", Path(__file__).parents[1] / "check-doc-contract.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class LedgerContractTests(unittest.TestCase):
    def check_ledger(self, result="NOT_RUN", evidence="", initial=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative, sections in checker.DOC_REQUIREMENTS.items():
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("\n".join(sections) + "\nflowchart LR\nflowchart LR", encoding="utf-8")
            ledger = root / "evidence/checkpoints/acceptance-status.md"
            ledger.parent.mkdir(parents=True)
            rows = [f"| A{number:02} | {result if number == 3 else 'NOT_RUN'} | {evidence if number == 3 else ''} |" for number in range(1, 41)]
            ledger.write_text("# Acceptance Status\n" + "\n".join(rows), encoding="utf-8")
            with patch.object(checker, "ROOT", root), patch("sys.argv", ["check-doc-contract.py"] + (["--initial"] if initial else [])), contextlib.redirect_stdout(io.StringIO()):
                return checker.main()

    def test_initial_not_run_ledger_passes(self):
        self.assertEqual(self.check_ledger(initial=True), 0)

    def test_evidenced_pass_can_advance_the_live_ledger(self):
        self.assertEqual(self.check_ledger("PASS", "[TK-11](TK-11.md): exact-source API evidence"), 0)

    def test_initial_mode_rejects_a_promoted_result(self):
        self.assertEqual(self.check_ledger("PASS", "[TK-11](TK-11.md)", initial=True), 1)

    def test_pass_without_evidence_is_rejected(self):
        self.assertEqual(self.check_ledger("PASS"), 1)

    def test_unknown_status_is_rejected(self):
        self.assertEqual(self.check_ledger("DONE", "unsupported"), 1)


if __name__ == "__main__":
    unittest.main()
