#!/usr/bin/env python3
"""
오늘의 진짜 정보판 — 비밀값 검색기 (카드 2, T04-C11)

이 저장소는 애초에 API 키가 필요 없는 공개 엔드포인트(open.er-api.com)만 쓰고,
클라이언트(app.js)는 외부 API를 절대 직접 호출하지 않으며(같은 오리진의 정적
data/*.json만 fetch), 수집 스크립트도 표준 라이브러리 urllib으로 무키 호출만
한다. 즉 "숨길 비밀 자체가 없는" 구조다. 이 스크립트는 그 주장을 구두로 끝내지
않고, 실제로 다음 네 곳에서 비밀값 형태의 문자열을 정규식으로 검색해 0건임을
증명한다:

  1. 작업 트리의 모든 텍스트 파일 (= 브라우저가 받는 배포 파일 그 자체)
  2. data/*.json에 저장된 raw_response (= 실제 네트워크 응답 원문)
  3. git 커밋 기록 전체 (git log -p, 삭제된 과거 커밋 포함)
  4. (참고) .env류 파일이 애초에 존재하는지 여부

사용법:
  python3 scripts/check_secrets.py            # 작업 트리 + git 기록 모두 검사
  python3 scripts/check_secrets.py --worktree-only   # git 기록 없이 빠르게 작업 트리만

exit code 0 = 비밀값 패턴 0건 (통과), 1 = 의심되는 패턴 발견 (CI에서 빌드 실패용)
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# 확장자 기준으로 텍스트로 취급할 파일들 (바이너리는 스캔하지 않음)
TEXT_SUFFIXES = {".py", ".js", ".html", ".css", ".json", ".yml", ".yaml", ".md", ".txt", ".sh"}
SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv"}

# "값처럼 보이지 않는" 흔한 플레이스홀더는 오탐으로 치지 않는다
PLACEHOLDER_RE = re.compile(
    r"^(your[_-]?api[_-]?key|changeme|change_me|replace_me|xxxx+|example|sample|"
    r"none|null|todo|placeholder|<[^>]*>|\$\{[^}]*\}|process\.env.*)$",
    re.IGNORECASE,
)

PATTERNS = [
    (
        "key_value_assignment",
        re.compile(
            r"""(?ix)
            \b(api[_-]?key|apikey|secret[_-]?key|access[_-]?key|client[_-]?secret|
               auth[_-]?token|private[_-]?key|password|passwd)\b
            \s*[:=]\s*
            ["']?([A-Za-z0-9_\-/+=]{12,})["']?
            """,
        ),
    ),
    ("aws_access_key_id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("bearer_token_header", re.compile(r"(?i)authorization\s*:\s*bearer\s+[A-Za-z0-9\-_.~+/]{10,}=*")),
    ("jwt_like_token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("private_key_block", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----")),
    (
        "dotenv_style_secret_line",
        re.compile(r"(?im)^[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*=\s*(\S{8,})\s*$"),
    ),
]


def is_placeholder(value):
    return bool(PLACEHOLDER_RE.match(value.strip()))


def iter_text_files():
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        yield path


def scan_text(label, text):
    findings = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        for pattern_name, regex in PATTERNS:
            for m in regex.finditer(line):
                # 캡처 그룹이 있으면(대부분 key=value 계열) 값 부분만 플레이스홀더 검사
                groups = [g for g in m.groups() if g]
                candidate_value = groups[-1] if groups else m.group(0)
                if is_placeholder(candidate_value):
                    continue
                findings.append((label, line_no, pattern_name, line.strip()[:160]))
    return findings


def scan_worktree():
    all_findings = []
    files_scanned = 0
    for path in iter_text_files():
        files_scanned += 1
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        rel = path.relative_to(REPO_ROOT)
        all_findings.extend(scan_text(f"worktree:{rel}", text))
    return all_findings, files_scanned


def scan_git_history():
    if not (REPO_ROOT / ".git").exists():
        return [], 0, "git 저장소 아님 (건너뜀)"
    try:
        commit_count = subprocess.run(
            ["git", "rev-list", "--all", "--count"],
            cwd=REPO_ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
        log = subprocess.run(
            ["git", "log", "--all", "-p", "--full-history"],
            cwd=REPO_ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        return [], 0, f"git log 실행 실패: {e}"
    findings = scan_text("git-history", log)
    return findings, int(commit_count or 0), None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worktree-only", action="store_true", help="git 기록 검색 생략(빠른 로컬 확인용)")
    args = parser.parse_args()

    print("=== 카드 2 — 비밀값 검색 결과 (T04-C11) ===\n")

    wt_findings, files_scanned = scan_worktree()
    print(f"[1] 작업 트리(배포 파일 전체) 스캔: 텍스트 파일 {files_scanned}개 검사")
    if wt_findings:
        for label, line_no, pat, snippet in wt_findings:
            print(f"    ! {label}:{line_no} [{pat}] {snippet}")
    else:
        print("    → 비밀값 패턴 0건")

    git_findings = []
    if not args.worktree_only:
        git_findings, commit_count, note = scan_git_history()
        if note:
            print(f"\n[2] git 커밋 기록 스캔: {note}")
        else:
            print(f"\n[2] git 커밋 기록 스캔: 커밋 {commit_count}개 전체(git log -p) 검사")
            if git_findings:
                for label, line_no, pat, snippet in git_findings:
                    print(f"    ! {label}:{line_no} [{pat}] {snippet}")
            else:
                print("    → 비밀값 패턴 0건")
    else:
        print("\n[2] git 커밋 기록 스캔: --worktree-only 옵션으로 생략됨")

    env_files = [p for p in REPO_ROOT.rglob("*") if p.name.startswith(".env")]
    print(f"\n[3] .env류 파일 존재 여부: {'있음 → ' + ', '.join(str(p) for p in env_files) if env_files else '없음'}")

    total = len(wt_findings) + len(git_findings)
    print(f"\n=== 결과: 비밀값 의심 패턴 총 {total}건 ===")
    if total > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
