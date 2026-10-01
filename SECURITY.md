# Security & Data Governance Policy

## 1. Scope & Operational Model

**Manga Reviews Management** is designed as a **self-hosted, single-user / local trusted environment application**.
- **Network Scope**: Intended for execution behind a local loopback (`127.0.0.1`) or a secure private VPN/LAN.
- **Authentication**: The application currently does not implement multi-tenant role-based access control (RBAC). Do not expose FastAPI or MinIO ports directly to the public internet without an authenticating reverse proxy (e.g. Nginx with OAuth2/Authelia/Cloudflare Access).
- **Media Access**: MinIO S3 media access is handled via time-limited presigned URLs or local API proxy streaming.

---

## 2. Sensitive Data & Public Repository Boundaries

To maintain public repository security, contributors and coding agents must strictly adhere to these rules:

1. **Credentials & Keys**:
   - Never commit `.env`, API keys (`GEMINI_API_KEY`), MangaDex client credentials, or MinIO production keys.
   - All example files must use dummy placeholders (see [`backend/.env.example`](backend/.env.example)).
2. **Personal Data & Media**:
   - Never commit real user database dumps, personal reviews, reading histories, or copyright-protected manga scan chapters.
   - Test suites must use synthetic mock fixtures or transient in-memory objects.
3. **Local Snapshots & Dumps**:
   - Source dump files (`*_source_dump.txt`), scratch scripts, and local tool snapshots must remain in `.gitignore`.

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability or accidental secret exposure:
1. **Do not create a public issue**.
2. Contact the repository maintainer privately via GitHub Private Vulnerability Reporting or email listed on the maintainer's GitHub profile ([@huyxuantruong1411](https://github.com/huyxuantruong1411)).
3. Provide a clear description, reproduction steps, and potential impact.
4. If a credential was mistakenly shared, revoke and rotate the secret immediately with the provider.
