# CI/CD Guardian & Autonomous Quality Assurance

## Overview
CI/CD Guardian ensures that every code change, refactoring, or dependency update passes strict pre-push local verification and remote GitHub Actions checks. It governs error classification, run identification, and targeted repair loops without weakening quality gates.

---

## 1. Pre-Push Local Verification Contract

Before pushing any commit, run the checks applicable to the modified paths:

### A. Python / Backend Changes
1. **Lint and Format**:
   ```bash
   uv run --project backend python scripts/ci/check_python.py
   ```
2. **Pytest / Regression Tests**:
   ```bash
   uv run --project backend python -m pytest backend/tests
   ```

### B. Frontend / UI Changes
1. **Biome Quality Check**:
   ```bash
   pnpm --dir frontend run check
   ```
2. **TypeScript Typecheck**:
   ```bash
   pnpm --dir frontend run typecheck
   ```
3. **Frontend Production Build**:
   ```bash
   pnpm --dir frontend run build
   ```
4. **Playwright UI Smoke**:
   ```bash
   pnpm --dir frontend run test:e2e
   ```

### C. Documentation & Route Synchronization
```bash
python scripts/check_docs.py
python scripts/generate_api_routes.py --check
```

---

## 2. Remote Run Identification

When commits are pushed to branches with active CI (`main`, `master`, `develop`):
1. **Identify the exact run by Commit SHA and Workflow**:
   ```powershell
   $ciRepo = "huyxuantruong1411/Manga-Reviews-Management"
   $ciSha = (git rev-parse HEAD).Trim()
   gh run list --repo $ciRepo --workflow ci.yml --commit $ciSha --limit 5 `
     --json databaseId,headSha,event,status,conclusion,url,workflowName
   ```
2. **Inspect Failed Jobs and Logs**:
   ```powershell
   gh run view <RUN_ID> --repo $ciRepo --log-failed
   ```

---

## 3. Targeted Repair Loop (Max 3 Rounds)

1. **Root-Cause Analysis**: Distinguish between code defects, environment timeouts, permissions, and secret findings.
2. **Minimal Patch**: Reproduce locally, apply minimal fix, re-verify locally.
3. **Commit & Push**: Push targeted fix and monitor the new run attempt.
4. **Hard Limit**: Maximum 3 self-correction attempts per issue. If unresolved after 3 attempts, escalate with detailed diagnostics to the user.
5. **No Weakening of Gates**: Never add `continue-on-error: true`, `|| true`, or dummy passes to bypass CI gates.

---

## 4. Status Reporting Contract

Always report exact verification state:
- **`Local Verified`**: All local checks passed; remote push has not occurred or remote run is pending.
- **`Remote Verification Pending`**: Changes pushed; GitHub Actions run is currently in progress.
- **`Remote Verified`**: GitHub Actions run for the exact commit SHA has completed with `ci-gate: success`.
