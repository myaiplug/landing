MyAiPlug / HalfScrew — Security, Deployment & Recovery Runbook

Purpose
-------
This document is the "founder/owner/tech" bible for MyAiPlug / HalfScrew. It contains the operational, security, and recovery procedures you need to deploy, operate, and, when necessary, repair the platform. Keep a current copy in a secure vault (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, or an enterprise password manager). Do NOT store production secrets in the repository.

Scope
-----
- Backend service (the FastAPI app at `backend/main.py`)
- Frontend apps (echosharp/ and openDAW/ static bundles)
- Models registry (`backend/models.json`)
- User store (default: `backend/users.jsonl`)
- CI/CD and deployment assets (GitHub Actions workflows, build artifacts)

Owners & Emergency Contacts
---------------------------
- Primary owner (Founder/CEO): [Beezy Jutz]
- Secondary owner (CTO/Engineer): [Casey Jutz]
- Security incident contact (external/contractor): [Brian Jutz]
- Where credentials live: ? 
  - Vault: [INSERT VAULT URL]
  - GitHub org secrets: https://github.com/orgs/<ORG>/settings/secrets
  - Cloud console (AWS/Azure/GCP) access: [INSERT link & role]

Inventory (quick map)
---------------------
- `backend/main.py` — main FastAPI app & auth code. Key functions: `_create_token`, `_decode_token`, `_require_user`, endpoints under `/v1/` and `/auth/`.
- `backend/users.jsonl` — file-backed user store (if used). Each line is a JSON record.
- `backend/models.json` — model registry referenced at startup.
- `backend/SECURITY_AND_DEPLOYMENT_RUNBOOK.md` — this file (master copy)
- `backend/README.md` — quick run instructions (updated to include `AUTH_SECRET` requirement)
- `echosharp/` — frontend app using Vite; build commands live in `echosharp/package.json` and `docs/DEPLOYMENT_ROUTES.md`.
- `docs/DEPLOYMENT_ROUTES.md` — authoritative routing/NGINX examples (root vs subpath deployments).
- `openDAW/README-LOCAL.md` — local build/run instructions for the studio app (serves static `packages/app/studio/dist` on `5173`).
- `.github/workflows/` — CI jobs (e.g., `echosharp/.github/workflows/ci.yml` for dotnet tests). Review for build/test automation.

Required environment variables (definitive list)
----------------------------------------------
- `AUTH_SECRET` (REQUIRED): HMAC secret used to sign internal tokens. Must be strong (>=32 random bytes). The backend exits on startup if this is not set or equals the default dev value.
- `DEMO_API_KEY` (optional): demo API key for model toggles.
- `OPENAI_API_KEY` (optional): provider key for OpenAI adapter.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional): if using Google OAuth.
- `USERS_PATH` (optional): path to `users.jsonl` (default `backend/users.jsonl`).
- `MODEL_REGISTRY` (optional): path to `models.json` (default `backend/models.json`).
- `PROCESSED_DIR`, `USER_UPLOADS_DIR`, `SONGS_DIR`, etc: directories used by backend for artifacts (defaults are safe but document them in the deployment target).

Where to store secrets (best practice)
-------------------------------------
1. Use a managed secrets vault (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault). Store `AUTH_SECRET`, database credentials, OAuth secrets, and third-party keys.
2. CI secrets: place in GitHub Actions secrets or equivalent; do NOT print them in logs.
3. Kubernetes: mount secrets as environment variables or files with RBAC controls.

Generating secure secrets (PowerShell / Windows)
------------------------------------------------
PowerShell (one-liner to generate a base64 32-byte secret):

```powershell
$b = New-Object byte[] 32; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [System.Convert]::ToBase64String($b)
```

Or compact:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}) -as [byte[]])
```

Set the secret for the current shell (PowerShell):
```powershell
#$env:AUTH_SECRET = 'paste-generated-secret-here'
```

Deploy & start (recommended patterns)
-------------------------------------
You can deploy in multiple ways. Two common safe patterns:

1) Systemd + uWSGI / Gunicorn / uvicorn (Linux VM)
  - Build artifacts locally or in CI.
  - Upload `echosharp/dist/` to the web root (e.g., `/var/www/halfscrew/dist`) or to an object store + CDN.
  - Configure `nginx` to serve static assets and proxy `/api/` to the backend (see NGINX snippet below).
  - Run backend under systemd with environment variables injected from a secure location (e.g., `/etc/<service>.env` owned by root with 600 perms).

2) Containerized (Docker / Kubernetes)
  - Build a Docker image for the backend and frontend artifacts stored separately.
  - Use Kubernetes Deployments with Secrets and ConfigMaps for runtime config.
  - Use an Ingress controller (NGINX/Traefik) for TLS and path routing.

NGINX example (root site, secure headers):

```nginx
server {
   listen 80;
   server_name halfscrew.com myaiplug.com;
   return 301 https://$host$request_uri;
}
server {
   listen 443 ssl;
   server_name halfscrew.com;
   ssl_certificate /etc/letsencrypt/live/halfscrew.com/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/halfscrew.com/privkey.pem;

   root /var/www/halfscrew/dist;
   index index.html;

   add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
   add_header X-Frame-Options DENY;
   add_header X-Content-Type-Options nosniff;
   add_header Referrer-Policy no-referrer-when-downgrade;
   add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data:; connect-src 'self' https:;" always;

   location / {
      try_files $uri $uri/ /index.html;
   }

   location /api/ {
      proxy_pass http://127.0.0.1:5174/api/; # backend
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
   }
}
```

Startup service (systemd) example for backend (uvicorn):

```ini
[Unit]
Description=MyAiPlug Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/srv/myaiplug/backend
EnvironmentFile=/etc/myaiplug/backend.env
ExecStart=/usr/bin/env python -m uvicorn main:app --host 127.0.0.1 --port 5174 --workers 2
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Store runtime env in `/etc/myaiplug/backend.env` with mode 600 owned by root.

Admin & recovery playbook (step-by-step)
---------------------------------------
If you are locked out or need to create a founder/admin account, these are safe steps.

1) Quick bootstrap via script (recommended):
  - Use the helper script at `backend/tools/create_admin_user.py` (created alongside this runbook) to add an admin user with a hashed password that matches the backend's hashing scheme.
  - Run locally with your `AUTH_SECRET` in environment or on the target host after placing the repo there.

2) Temporary direct edit (emergency, not preferred):
  - On the server, stop the backend service.
  - Edit `backend/users.jsonl` and append a new JSON record:
    - Use the `create_admin_user.py` locally to generate the JSON record with `password_hash` already computed, then paste it into `users.jsonl`.
  - Start the backend and then login with the new credentials.

3) Password reset (if DB used):
  - If you migrated to a DB (Postgres), use SQL to find the user and update the password hash using the same PBKDF2 algorithm.

How to generate a compatible password hash (Python snippet)
-------------------------------------------------------
Run this small snippet (it uses the same algorithm as the backend):

```python
import os, base64, hashlib
def hash_pw(pw: str) -> str:
   salt = os.urandom(16)
   dk = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, 100_000)
   return base64.b64encode(salt+dk).decode('utf-8')

print(hash_pw('MySecretPassword123!'))
```

Protecting tokens & sessions
---------------------------
- Short-term: tokens are HMAC-signed using `AUTH_SECRET`. On suspected compromise rotate `AUTH_SECRET` and force re-login.
- Long-term: migrate to RS256-signed JWTs with short access token TTLs and rotating refresh tokens stored server-side or revocation lists.

Incident response (compromise checklist)
---------------------------------------
If you suspect a breach, follow these steps in order:
1. Triage: identify scope — which keys, servers, or services were exposed.
2. Isolate: take affected hosts offline behind maintenance pages.
3. Revoke: rotate `AUTH_SECRET`, third-party API keys (OpenAI, payment providers), and OAuth client secrets.
4. Re-issue: generate new secret(s) and update runtime secret stores.
5. Invalidate sessions: if using refresh tokens, revoke them; otherwise rotate secrets to invalidate tokens.
6. Preserve evidence: snapshot disk and logs, record times, and capture memory if possible.
7. Notify: stakeholders and legal/compliance teams according to local rules.
8. Postmortem: run root cause analysis and harden the system to prevent recurrence.

Monitoring & alerting
---------------------
- Health checks: configure `/v1/health` (or `/api/health`) in load balancer/health probe.
- Metrics: expose metrics endpoints and export to Prometheus; set alerts for high error rates and login failures.
- Log aggregation: ship logs to a central store (CloudWatch, Datadog, ELK). Keep 90+ days of logs for security investigations.

Rate limiting & abuse prevention
--------------------------------
- Implement per-IP and per-username rate limits on login endpoints. In single-host deployments an in-memory limiter is OK; for multi-host use Redis.
- Add request size limits for file uploads and check file type/content types server-side.
- Add CAPTCHAs for high-risk flows if bots are suspected.

Rate limiter configuration (Phase 1)
----------------------------------
The backend includes a simple in-memory sliding-window limiter. Configure via environment variables:

- `RATE_LIMIT_WINDOW_SEC` (default `60`) — window length in seconds
- `RATE_LIMIT_MAX_ATTEMPTS` (default `8`) — max attempts allowed per window per key (username based)

Behavior notes:
- The limiter keys are currently `user:<username>` (so limits are per username). You can extend to per-IP by passing an IP-derived key (e.g., `ip:<addr>`).
- The implementation is thread-safe for a single process but will not coordinate across multiple server instances. For multi-instance deployments replace with Redis-based limiter.

Redis-based limiter (production)
--------------------------------
If you run multiple backend instances (Kubernetes, multiple VMs, or container replicas) use a central store like Redis for counters. Two popular implementations:

1) Token bucket / leaky bucket via Redis INCR + EXPIRE
2) Sliding window using sorted sets (ZADD/ZREMRANGEBYSCORE + ZCARD)

Example pseudocode (token bucket):

```
KEY = "rl:login:" + username_or_ip
if redis.eval(lua_script, [KEY], [max_tokens, refill_interval_seconds]) then
  allow
else
  deny
end
```

Use a battle-tested library (e.g., `ratelimit`, `limits` in Python, or middleware for your framework) that supports Redis as a backend to avoid edge-case bugs.

CI/CD & deployment pipeline recommendations
-----------------------------------------
1. Build step (CI):
  - Run `npm install` and `npm run build` for frontend in a reproducible runner (GitHub Actions self-hosted or cloud). Upload `dist/` as an artifact.
  - Run backend tests (`python -m pytest`) and unit tests.
2. Release step:
  - On a release tag, publish frontend artifacts to CDN or object store and backend Docker image to registry.
3. Deploy step:
  - Pull artifacts/images to the target environment, update environment variables from secret store, and run migration scripts.
  - Blue/green or Canary deployment preferred. Run smoke tests after deploy.

Smoke test script (curl) examples
--------------------------------
Check backend health and basic endpoints:

```powershell
curl -i http://localhost:5174/v1/models
curl -i -H "Authorization: Bearer <token>" http://localhost:5174/v1/tracks
```

Frontend path checks (after deploying `dist/`):

```powershell
curl -i https://halfscrew.com/  # expect 200 and index.html contents
curl -i https://halfscrew.com/manifest.json # if using app manifest
```

Planned security roadmap (high level)
------------------------------------
Phase 0 — Immediate (done): startup `AUTH_SECRET` safety check (backend refuses to start with default dev secret)
Phase 1 — Near term (1-7 days): rate-limiting, login audit logs, basic monitoring/alerting, add `create_admin_user.py` helper.
Phase 2 — Medium term (2-6 weeks): JWT migration (RS256), refresh tokens + revocation, move user store to Postgres/Supabase, DB migrations.
Phase 3 — Hardening (4-12 weeks): WAF rules, automated penetration test, secret rotation automation, compliance checks.

Phase 2 — Migration & rollout details (practical steps)
-----------------------------------------------------
This section documents the concrete steps taken and recommended rollout plan when migrating from HMAC-signed tokens to RS256 JWTs with server-side refresh tokens.

1) Preparation (no downtime)
  - Add the new `backend/auth.py` module which implements RS256 signing with a keypair stored under `backend/keys/` and a small SQLite DB `backend/auth.db` for refresh token storage.
  - Deploy the new code to a staging environment and ensure `AUTH_SECRET` remains set (code supports both HMAC tokens and new RS256 tokens during migration).
  - Generate RSA keypair on the staging host (the application will auto-generate if `backend/keys` does not exist). Securely copy the private key into your secrets vault and restrict permissions.

2) Dual-mode operation (grace period)
  - Start the backend in a dual-accept mode: the new endpoints issue RS256 access tokens and refresh tokens, but the legacy HMAC token decode function is left in place so previously issued tokens remain valid until expiry or rotation.
  - Monitor authentication logs and token usage. Record active session counts and refresh activity.

3) Migration cutover
  - After a chosen window (e.g., 7 days), update clients to prefer the new `/v1/auth/login` flow and use access tokens with short TTLs (recommended 1 hour). Use refresh tokens to obtain new access tokens.
  - Revoke old sessions by rotating `AUTH_SECRET` if you need to immediately invalidate old HMAC tokens (this will invalidate all HMAC-signed tokens instantly). Perform this only during a maintenance window.

4) Key rotation & revocation
  - To rotate RSA keys: generate a new keypair, update `backend/keys/jwt_private.pem` and `jwt_public.pem` from the secure vault, and restart backend instances one at a time. Keep old public key available at least long enough to validate in-flight tokens if you're using multiple signers.
  - Maintain a short access token TTL and keep refresh tokens server-side so you can revoke them (refresh token revocation is supported in `backend/auth.py`).

5) Persistent user store migration (recommended)
  - Move `backend/users.jsonl` contents to a proper relational DB (Postgres). Create a `users` table with columns: id (pk), username (unique), password_hash, email, created_at, last_login. Provide a migration script to convert each JSON line to an INSERT.
  - Update backend authentication to query the DB rather than `users.jsonl`. Leave a compatibility shim to read `users.jsonl` on first-run if DB credentials are not provided.

6) Post-migration cleanup
  - Once confident clients use the new tokens and active HMAC tokens have expired, remove legacy HMAC token creation and verification code from `backend/main.py` to reduce risk.
  - Remove any hard-coded or dev auth secrets from the environment and ensure production secrets are stored in a vault.

Notes & Rollback
----------------
- Rollback is simple: if the new code has issues, redeploy the previous release. Keep a backup of the `backend/keys` and `backend/auth.db` prior to making destructive changes.
- Always test key rotation and revocation in staging before production.


Appendix A — Quick commands & cheat sheet (PowerShell)
----------------------------------------------------
# Generate a strong AUTH_SECRET and set for current shell
$env:AUTH_SECRET = [Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}) -as [byte[]])

# Run backend locally (ensure AUTH_SECRET is set)
python -m uvicorn backend.main:app --reload --port 5174

# Build frontend (echosharp) root or subpath
cd echosharp
npm install
npm run build                # standalone root
npx vite build --base=/halfscrew/  # subpath

Appendix B — Where to look when things fail
-------------------------------------------
- Backend crashes on start: check stdout/journalctl, ensure `AUTH_SECRET` set, run `python -m uvicorn backend.main:app` manually to observe tracebacks.
- NGINX 502 errors: check backend is listening on configured port (e.g., 5174), `ss -ltnp | grep 5174`, and nginx error log (/var/log/nginx/error.log).
- Missing models: check `backend/models.json` path and file permissions; check `MODEL_REGISTRY` envvar.
- Missing user login: check `backend/users.jsonl` or DB; use `create_admin_user.py` to bootstrap.

Change log
----------
  - 2025-09-20: Major expansion to the runbook (founder/owner operational bible). Includes admin bootstrapping helper references.
  - 2025-09-20: Phase-2 auth implemented (RS256 JWT access tokens + server-side refresh tokens). New helper: `backend/tools/init_auth_db.py` to initialize `backend/auth.db` and print or bootstrap keys/users.

IMPORTANT: fill in the Owners & Emergency Contacts section and place this file in your org vault.

End of runbook

