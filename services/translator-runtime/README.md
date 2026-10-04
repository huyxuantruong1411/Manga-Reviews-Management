# Translator Runtime Subsystem

This directory houses the isolated execution plane for the **MangaTranslator** engine (`meangrinch/MangaTranslator`).

## Architectural Invariants
1. **Isolated Environment**: This runtime runs in its own dedicated Python virtual environment or container. It is NEVER imported directly into `backend.main`.
2. **Subprocess Protocol**: Communication with the parent FastAPI worker (`backend/tasks/translation_worker.py`) is conducted strictly over standard input/output using JSON envelope messages:
   - Input: Serialized job envelope passed via stdin.
   - Streaming: Stage progress and events emitted as JSONL lines on stdout.
   - Output: Final output manifest containing image paths, checksums, normalized bounding boxes, and region transcripts.
3. **No Secret Leaks**: Credentials (e.g. Gemini API keys) are injected into the subprocess via transient pipes/environment variables and are strictly redacted from stdout/stderr.
4. **Deterministic Workdir**: All intermediate processing occurs in temporary directories allocated by the parent process and cleaned up after artifacts are committed to MinIO S3 storage.
