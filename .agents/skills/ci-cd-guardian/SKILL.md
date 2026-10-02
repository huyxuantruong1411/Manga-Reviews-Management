---
name: ci-cd-guardian
description: Autonomous CI/CD monitor, pre-push verification, and targeted repair loop for GitHub Actions.
---

# CI/CD Guardian

See full documentation at [.antigravity/skills/ci-cd-guardian.md](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/ci-cd-guardian.md).

## Core Rules:
1. **Pre-Push Verification**: Run locked toolchain checks matching CI before pushing (Ruff, pytest, Biome, tsc, build, docs).
2. **Accurate Run Identification**: Query `gh run list --workflow ci.yml --commit <SHA>` to match the exact run and attempt.
3. **Targeted Repair Loop**: Maximum 3 self-correction attempts per issue. Reproduce locally, apply minimal fix, verify, and monitor.
4. **No Quality Gate Bypass**: Never use `continue-on-error: true`, `|| true`, or dummy test passes to force green status.
5. **Truth in Reporting**: Explicitly distinguish between `Local Verified`, `Remote Verification Pending`, and `Remote Verified`.
