# Quizzie 🎓

Online quiz platform with AI proctoring, built with **FastAPI + React + PostgreSQL**.

---

## Features
- Role-based auth (Student / Examiner)
- **Email verification** on registration
- **Forgot / Reset password** via email
- AI-powered proctoring (webcam + audio monitoring)
- Real-time analytics
- Fully containerised with Docker

---

## Quick Start (Local)

### Prerequisites
- Docker Desktop
- Git

### 1. Clone & configure
```bash
git clone <your-repo-url>
cd Quizzie

# Copy and fill in the backend env
cp backend/.env.example backend/.env
# At minimum, add your SMTP credentials so email works.
# Leave SMTP_USERNAME blank to skip email (tokens print to console).
```

### 2. Start everything
```bash
docker compose up --build
# or:  make build && make up
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost           |
| Backend  | http://localhost:8000      |
| API Docs | http://localhost:8000/docs |

### 3. Run DB migrations
```bash
make migrate
# or manually:
docker compose exec backend alembic upgrade head
```

---

## Email Setup (Gmail)

1. Enable **2-Factor Authentication** on your Google account.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Create an App Password → copy the 16-character code.
4. Add to `backend/.env`:

```
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx   # 16-char app password (spaces OK)
EMAIL_FROM=you@gmail.com
FRONTEND_URL=http://localhost:5173  # update to your deployed URL in prod
```

> **Dev tip:** If `SMTP_USERNAME` is blank, the app still works — verification tokens are printed to the backend console instead of emailed.

---

## Auth Flow

```
Register → "Check your inbox" screen
         ↓
Verification email → /verify-email?token=...
         ↓
Email verified → Login allowed

Login with unverified email → 403 + "Resend" button shown
Forgot password → email link → /reset-password?token=... (expires 1 hr)
```

---

## Deploy on Render (Free Tier)

1. Push to GitHub.
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**.
3. Connect your repo → Render finds `render.yaml` automatically.
4. After first deploy, go to **quizzie-backend → Environment** and set:
   - `SMTP_USERNAME`
   - `SMTP_PASSWORD`
   - `FRONTEND_URL` → your frontend Render URL (e.g. `https://quizzie-frontend.onrender.com`)
   - `CORS_ORIGINS` → same URL
5. Redeploy the backend service.

> **Note:** Render free tier services spin down after 15 min of inactivity. First request after sleep takes ~30s. Upgrade to Starter ($7/mo) to avoid this.

---

## Project Structure

```
Quizzie/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Route handlers
│   │   │   └── auth.py      # Register, verify, login, forgot/reset password
│   │   ├── core/
│   │   │   ├── config.py    # All settings (env-driven)
│   │   │   └── security.py  # JWT + bcrypt helpers
│   │   ├── models/
│   │   │   └── user.py      # User model (+ verification/reset fields)
│   │   ├── services/
│   │   │   └── email_service.py  # SMTP email sender + HTML templates
│   │   └── main.py
│   ├── alembic/             # DB migrations
│   ├── Dockerfile           # Production image (non-root, 2 workers)
│   └── .env                 # Local secrets (never commit)
├── frontend/
│   ├── src/features/auth/pages/
│   │   ├── LoginPage.tsx         # + Forgot password link + resend button
│   │   ├── RegisterPage.tsx      # + "Check your inbox" success screen
│   │   ├── VerifyEmailPage.tsx   # Handles ?token= from email link
│   │   ├── ForgotPasswordPage.tsx
│   │   └── ResetPasswordPage.tsx
│   ├── Dockerfile           # Multi-stage: Node build → nginx
│   └── nginx.conf           # SPA routing + /api proxy + WebSocket
├── docker-compose.yml       # Full stack (postgres + backend + frontend)
├── render.yaml              # One-click Render.com deploy blueprint
├── Makefile                 # Handy dev commands
└── .env.production.example  # Production env template
```

---

## Useful Commands

```bash
make up            # Start all services
make down          # Stop all services
make build         # Rebuild images from scratch
make logs          # Tail logs
make migrate       # Run alembic upgrade head
make shell-backend # Bash into the backend container
make shell-db      # psql into postgres
make clean         # Remove everything (containers + volumes)
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `SECRET_KEY` | — | JWT signing key (generate with `secrets.token_hex(32)`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | JWT lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `FRONTEND_URL` | `http://localhost:5173` | Used in email links |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port (TLS) |
| `SMTP_USERNAME` | — | Sender email (blank = skip sending) |
| `SMTP_PASSWORD` | — | SMTP / App password |
| `EMAIL_FROM` | — | From address shown in emails |
| `EMAIL_FROM_NAME` | `Quizzie` | Sender display name |
| `ENVIRONMENT` | `development` | `development` or `production` |
