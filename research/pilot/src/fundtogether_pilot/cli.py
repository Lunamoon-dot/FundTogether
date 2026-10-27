from __future__ import annotations

import argparse
import json
from pathlib import Path

from .comparative import run_comparative
from .comparative_schema import validate_comparative_jsonl_schema
from .config import load_comparative_config, load_config
from .reporting import write_report
from .validation import run_pilot, validate_jsonl_schema


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="FundTogether VNext PILOT-01")
    commands = parser.add_subparsers(dest="command", required=True)

    run = commands.add_parser("run", help="execute the bounded validation pilot")
    run.add_argument("--config", required=True)
    run.add_argument("--output", required=True)
    run.add_argument("--report")
    run.add_argument("--test-summary", default="not supplied to report generator")
    run.add_argument("--foundry-summary", default="not executed by this command")

    report = commands.add_parser("report", help="render a report from existing results")
    report.add_argument("--config", required=True)
    report.add_argument("--output", required=True)
    report.add_argument("--report", required=True)
    report.add_argument("--test-summary", required=True)
    report.add_argument("--foundry-summary", required=True)

    schema = commands.add_parser("verify-schema", help="validate raw JSONL fields")
    schema.add_argument("path")

    comparative = commands.add_parser(
        "run-sim01", help="execute the paired SIM-01 exploratory comparison"
    )
    comparative.add_argument("--config", required=True)
    comparative.add_argument("--output", required=True)

    comparative_schema = commands.add_parser(
        "verify-sim01-schema", help="validate typed SIM-01 comparative JSONL"
    )
    comparative_schema.add_argument("path")
    return parser


def main() -> None:
    args = _parser().parse_args()
    if args.command == "verify-schema":
        count = validate_jsonl_schema(args.path)
        print(json.dumps({"path": args.path, "records": count, "status": "PASS"}))
        return

    if args.command == "verify-sim01-schema":
        count = validate_comparative_jsonl_schema(args.path)
        print(json.dumps({"path": args.path, "records": count, "status": "PASS"}))
        return

    if args.command == "run-sim01":
        config = load_comparative_config(args.config)
        result = run_comparative(config, args.output)
        print(
            json.dumps(
                {
                    "output": str(Path(args.output)),
                    "raw_records": result["manifest"]["raw_record_count"],
                    "raw_sha256": result["manifest"]["raw_sha256"],
                },
                sort_keys=True,
            )
        )
        return

    if args.command == "report":
        config = load_config(args.config)
        output = Path(args.output)
        result = {
            "summary": json.loads((output / "summary.json").read_text(encoding="utf-8")),
            "manifest": json.loads((output / "manifest.json").read_text(encoding="utf-8")),
            "checksums": {},
        }
        write_report(
            result,
            config,
            output,
            args.report,
            test_summary=args.test_summary,
            foundry_summary=args.foundry_summary,
        )
        print(json.dumps({"report": args.report, "status": "PASS"}, sort_keys=True))
        return

    config = load_config(args.config)
    result = run_pilot(config, args.output)
    if args.report:
        write_report(
            result,
            config,
            args.output,
            args.report,
            test_summary=args.test_summary,
            foundry_summary=args.foundry_summary,
        )
    print(
        json.dumps(
            {
                "output": str(Path(args.output)),
                "raw_records": result["manifest"]["raw_record_count"],
                "raw_sha256": result["manifest"]["raw_sha256"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
