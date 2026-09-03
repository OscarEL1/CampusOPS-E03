#!/usr/bin/env python3
"""Student-visible structural, toolchain and evidence checks for weekly DMI work."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
from pathlib import Path
from typing import Any


ALLOWED_WEEKS = {1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13}
EXCLUDED_DIRS = {".git", ".expo", "node_modules", "coverage", "dist", "android", "ios"}
SECRET_PATTERNS = {
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "aws_access_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "public_secret_name": re.compile(r"EXPO_PUBLIC_[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|ACCESS_TOKEN)\s*="),
}


def run(repo: Path, command: list[str], timeout: int = 300) -> tuple[bool, str]:
    try:
        result = subprocess.run(command, cwd=repo, text=True, capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)
    tail = ((result.stdout or "") + "\n" + (result.stderr or ""))[-3000:]
    return result.returncode == 0, tail.strip()


def git_sha(repo: Path) -> str:
    ok, output = run(repo, ["git", "rev-parse", "HEAD"], 20)
    return output.splitlines()[-1] if ok else "unknown"


def add(checks: list[dict[str, Any]], check_id: str, passed: bool, detail: str) -> None:
    checks.append({"id": check_id, "status": "pass" if passed else "fail", "detail": detail})


def load_object(path: Path) -> tuple[dict[str, Any] | None, str]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, str(exc)
    return (value, "ok") if isinstance(value, dict) else (None, "root must be an object")


def evidence_sha_matches(repo: Path, reported_sha: object, head_sha: str) -> tuple[bool, str]:
    if not isinstance(reported_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", reported_sha):
        return False, "commitSha must be a full lowercase Git SHA"
    if reported_sha == head_sha:
        return True, "report evaluates HEAD"
    ok, parent = run(repo, ["git", "rev-parse", "HEAD^"], 20)
    if not ok or reported_sha != parent.strip():
        return False, "commitSha must be HEAD or its direct evidence-only parent"
    ok, changed = run(repo, ["git", "diff", "--name-only", f"{reported_sha}..{head_sha}"], 20)
    if not ok:
        return False, "could not inspect evidence commit"
    paths = [line for line in changed.splitlines() if line]
    invalid = [path for path in paths if not path.startswith(("reports/", "evidence/"))]
    return (not invalid, f"evidence-only commit; invalid changes={invalid}")


def validate_report(repo: Path, path: Path, week: int, sha: str) -> tuple[bool, str]:
    data, detail = load_object(path)
    if data is None:
        return False, detail
    required = {"schemaVersion", "week", "commitSha", "generatedAt", "checks"}
    if not required.issubset(data):
        return False, f"missing keys: {sorted(required - set(data))}"
    if data["week"] != week:
        return False, "week does not match evaluated checkout"
    sha_ok, sha_detail = evidence_sha_matches(repo, data["commitSha"], sha)
    if not sha_ok:
        return False, sha_detail
    if not isinstance(data["checks"], list) or not data["checks"]:
        return False, "checks must be a non-empty list"
    valid_status = {"pass", "fail", "not_applicable"}
    valid_scenario = {"nominal", "boundary", "failure"}
    seen_observations: set[tuple[str, str]] = set()
    boundary_count = 0
    for item in data["checks"]:
        if not isinstance(item, dict) or not {"id", "status", "scenarioType", "command", "evidence"}.issubset(item):
            return False, "each check needs id, status, scenarioType, command and evidence"
        if not all(isinstance(item[field], str) and item[field].strip() for field in ("id", "command", "evidence")):
            return False, "check id, command and evidence must be non-empty strings"
        if item["status"] not in valid_status:
            return False, f"invalid status: {item['status']}"
        observation = (item["id"], item["status"])
        if observation in seen_observations:
            return False, f"duplicate check observation: {item['id']}={item['status']}"
        seen_observations.add(observation)
        if item["scenarioType"] not in valid_scenario:
            return False, f"invalid scenarioType: {item['scenarioType']}"
        if item["scenarioType"] in {"boundary", "failure"}:
            boundary_count += 1
    if boundary_count == 0:
        return False, "at least one boundary or failure scenario must be indexed"
    return True, f"{len(data['checks'])} checks indexed, {boundary_count} boundary/failure; {sha_detail}"


def validate_engineering(repo: Path, path: Path, week: int, sha: str) -> tuple[bool, str]:
    data, detail = load_object(path)
    if data is None:
        return False, detail
    required = {"schemaVersion", "week", "commitSha", "decision", "alternatives", "tradeoff", "requirementIds", "verification"}
    if not required.issubset(data):
        return False, f"missing keys: {sorted(required - set(data))}"
    if data["week"] != week:
        return False, "week mismatch"
    sha_ok, sha_detail = evidence_sha_matches(repo, data["commitSha"], sha)
    if not sha_ok:
        return False, sha_detail
    if not isinstance(data["alternatives"], list) or len(data["alternatives"]) < 2:
        return False, "at least two alternatives required"
    if any(not isinstance(item, str) or len(item.strip()) < 10 for item in data["alternatives"]):
        return False, "alternatives must be substantive strings"
    if len({item.strip().casefold() for item in data["alternatives"]}) != len(data["alternatives"]):
        return False, "alternatives must be distinct"
    if not isinstance(data["decision"], str) or len(data["decision"].strip()) < 30:
        return False, "decision must contain a substantive engineering conclusion"
    if not isinstance(data["tradeoff"], str) or len(data["tradeoff"].strip()) < 30:
        return False, "tradeoff must explain a substantive cost/benefit"
    requirement_ids = data["requirementIds"]
    if not isinstance(requirement_ids, list) or not requirement_ids or any(not re.fullmatch(r"AC-0[1-5]", str(item)) for item in requirement_ids):
        return False, "requirementIds must contain declared AC-01..AC-05 identifiers"
    verification = data["verification"]
    if not isinstance(verification, list) or not verification:
        return False, "verification must contain at least one reproducible observation"
    required_verification = {"command", "result", "evidence"}
    if any(
        not isinstance(item, dict)
        or not required_verification.issubset(item)
        or any(not isinstance(item[field], str) or not item[field].strip() for field in required_verification)
        for item in verification
    ):
        return False, "each verification item needs non-empty command, result and evidence"
    return True, f"decision evidence is substantive and reproducible; {sha_detail}"


def validate_individual(path: Path, week: int) -> tuple[bool, str]:
    data, detail = load_object(path)
    if data is None:
        return False, detail
    if data.get("schemaVersion") != 1 or data.get("week") != week or not isinstance(data.get("teamId"), str) or not data["teamId"].strip():
        return False, "schemaVersion=1, matching week and non-empty teamId are required"
    if not isinstance(data.get("members"), list) or len(data["members"]) != 3:
        return False, "week must match and members must contain exactly three entries"
    fields = {"studentId", "commitShas", "files", "tests", "reviews", "prediction", "command", "observedResult", "explanation"}
    if any(not isinstance(member, dict) or not fields.issubset(member) for member in data["members"]):
        return False, f"each member requires {sorted(fields)}"
    if len({member["studentId"] for member in data["members"]}) != 3:
        return False, "studentId values must be unique"
    for member in data["members"]:
        if not isinstance(member["studentId"], str) or not member["studentId"].strip():
            return False, "studentId values must be non-empty strings"
        if not isinstance(member["commitShas"], list) or not member["commitShas"]:
            return False, f"{member['studentId']}: at least one authored commit SHA is required"
        if any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value) for value in member["commitShas"]):
            return False, f"{member['studentId']}: commitShas must contain full lowercase Git SHAs"
        if not isinstance(member["files"], list) or not member["files"]:
            return False, f"{member['studentId']}: at least one technical file is required"
        if not isinstance(member["tests"], list) or not isinstance(member["reviews"], list) or not (member["tests"] or member["reviews"]):
            return False, f"{member['studentId']}: at least one test or review signal is required"
        for field in ("prediction", "command", "observedResult", "explanation"):
            if not isinstance(member[field], str) or len(member[field].strip()) < 8:
                return False, f"{member['studentId']}: {field} must be substantive"
    return True, "three individual evidence records found"


def scan_secrets(repo: Path) -> list[str]:
    hits: list[str] = []
    for path in repo.rglob("*"):
        if not path.is_file() or any(part in EXCLUDED_DIRS for part in path.parts):
            continue
        if path.name == ".env.example" or path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".zip", ".apk", ".aab"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for name, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                hits.append(f"{path.relative_to(repo)}:{name}")
    return hits


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--week", required=True, type=int)
    parser.add_argument("--mode", required=True, choices=("verify", "public", "evidence"))
    parser.add_argument("--repo", default=".")
    parser.add_argument("--execute-toolchain", action="store_true")
    args = parser.parse_args()
    if args.week not in ALLOWED_WEEKS:
        raise SystemExit(f"Week {args.week} is not an instruction/activity week")

    repo = Path(args.repo).resolve()
    week_key = f"{args.week:02d}"
    contracts, detail = load_object(repo / "course-contracts.json")
    if contracts is None:
        raise SystemExit(f"Invalid course-contracts.json: {detail}")
    spec = contracts["weeks"][week_key]
    sha = git_sha(repo)
    checks: list[dict[str, Any]] = []

    base_files = ["package.json", "package-lock.json", "app.json", "tsconfig.json", "Makefile", "src/course-evaluation/index.ts"]
    missing_base = [item for item in base_files if not (repo / item).is_file()]
    add(checks, "base_files", not missing_base, "missing=" + repr(missing_base))

    package, package_detail = load_object(repo / "package.json")
    if package is None:
        add(checks, "react_native_profile", False, package_detail)
    else:
        dependencies = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
        scripts = package.get("scripts", {})
        needed = {"expo", "react-native", "react", "typescript", "jest-expo", "@testing-library/react-native"}
        needed_scripts = {"typecheck", "lint", "test", "test:coverage:week11", "package:android"}
        add(checks, "react_native_profile", needed.issubset(dependencies), f"missing packages={sorted(needed - set(dependencies))}")
        add(checks, "toolchain_scripts", needed_scripts.issubset(scripts), f"missing scripts={sorted(needed_scripts - set(scripts))}")

    workflow_text = "\n".join(
        path.read_text(encoding="utf-8", errors="replace") for path in (repo / ".github" / "workflows").glob("*.y*ml")
    ) if (repo / ".github" / "workflows").exists() else ""
    bypass = re.findall(r"\|\|\s*true|continue-on-error\s*:\s*true|--passWithNoTests", workflow_text, re.I)
    add(checks, "workflow_integrity", not bypass, f"bypass markers={bypass}")
    secret_hits = scan_secrets(repo)
    add(checks, "secret_scan", not secret_hits, f"hits={secret_hits}")

    if args.mode in {"public", "evidence"}:
        missing = [item for item in spec["required"] if not (repo / item).is_file() or (repo / item).stat().st_size == 0]
        add(checks, "required_evidence", not missing, "missing/empty=" + repr(missing))
        for relative in spec["required"]:
            path = repo / relative
            if not path.is_file() or path.suffix != ".json":
                continue
            if path.name == "engineering.json":
                passed, report_detail = validate_engineering(repo, path, args.week, sha)
            elif path.name == "individual.json":
                passed, report_detail = validate_individual(path, args.week)
            else:
                passed, report_detail = validate_report(repo, path, args.week, sha)
            add(checks, f"schema:{relative}", passed, report_detail)

    if args.mode == "evidence":
        expected_tag = f"week-{week_key}-final"
        ok_tag, tag_sha = run(repo, ["git", "rev-list", "-n", "1", expected_tag], 20)
        add(checks, "frozen_sha", ok_tag and tag_sha.strip() == sha, f"tag={expected_tag} tagSha={tag_sha.strip()} head={sha}")

    if args.execute_toolchain:
        commands = [["npm", "run", "typecheck"], ["npm", "run", "lint"], ["npm", "run", "audit:ci"]]
        if args.mode == "verify":
            commands.append(["npm", "run", "test:smoke"])
            if args.week in {5, 6, 8, 9, 10}:
                commands.append(["npm", "run", "backend:self-test"])
            if args.week == 11:
                commands.append(["npm", "run", "bundle:release"])
            if args.week in {12, 13}:
                commands.append(["npm", "run", "package:android:ci"])
        elif args.mode == "public":
            if args.week == 11:
                commands.append(["npm", "run", "test:coverage:week11"])
            else:
                test_path = f"course-tests/public/week-{week_key}.test.ts"
                commands.append(["npm", "test", "--", "--ci", "--runInBand", test_path])
        for index, command in enumerate(commands, 1):
            passed, output = run(repo, command)
            add(checks, f"toolchain_{index}", passed, f"{' '.join(command)}\n{output}")

    passed = all(item["status"] == "pass" for item in checks)
    result = {
        "schemaVersion": 1,
        "week": args.week,
        "mode": args.mode,
        "commitSha": sha,
        "evaluatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "pass" if passed else "fail",
        "checks": checks,
    }
    report_dir = repo / "reports" / f"week-{week_key}"
    report_dir.mkdir(parents=True, exist_ok=True)
    filename = {"verify": "verify.json", "public": "public-tests.json", "evidence": "failure.json"}[args.mode]
    (report_dir / filename).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
