# where.name

Guess the country geography game with real-time multiplayer presence.

## Stack

- **Frontend** — Next.js (`apps/frontend-js`)
- **Backend** — Go (`apps/backend-go`)
- **Reverse proxy** — Caddy (`apps/reverse-proxy`)
- **Database** — PostgreSQL

## Running locally

Docker runs everything behind Caddy. For local development, the Go backend and frontend run outside Docker while postgres stays containerised.

```sh
# start postgres
docker compose up postgres -d

# backend
cd apps/backend-go && air

# frontend
cd apps/frontend-js && npm run dev
```

### Required: `.env.local`

Create `apps/frontend-js/.env.local`:

```
NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
```

Without this, the WebSocket connects through the Next.js dev server which cannot proxy WebSocket connections. In Docker, Caddy handles the `/ws` route so this variable is not needed.
