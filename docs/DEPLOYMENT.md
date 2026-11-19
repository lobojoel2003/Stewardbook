# Deploying Stewardbook

Stewardbook is one Node.js server and one Postgres database. A small VPS, a spare office PC or a Raspberry Pi 4 is
plenty for a local.

## Docker Compose (recommended)

1. Get the compose file and choose a database password:

   ```bash
   curl -O https://raw.githubusercontent.com/lobojoel2003/Stewardbook/main/docker-compose.yml
   ```

   ```bash
   printf 'POSTGRES_PASSWORD=%s\nORIGIN=https://stewards.example.org\nSTEWARDBOOK_IMAGE=ghcr.io/lobojoel2003/stewardbook:1\n' "$(openssl rand -hex 24)" > .env
   ```

2. Start it:

   ```bash
   docker compose up -d --no-build
   ```

3. Put HTTPS in front (Caddy, nginx, Traefik or your host's proxy) forwarding to port 3000, and open the site to run
   the one-time setup.

`ghcr.io/lobojoel2003/stewardbook:1` follows the latest 1.x release; pin `:1.0.0` if you want to upgrade by hand.

### Caddy example

```
stewards.example.org {
	reverse_proxy localhost:3000
}
```

`ORIGIN` must match the public URL exactly, or form submissions are rejected as cross-site.

## Plain Node

Download `stewardbook-vX.Y.Z.tar.gz` from a [release](https://github.com/lobojoel2003/Stewardbook/releases) and
verify it against `SHA256SUMS.txt`, then in the extracted folder:

```bash
npm ci --omit=dev
```

```bash
DATABASE_URL=postgres://… ORIGIN=https://stewards.example.org BODY_SIZE_LIMIT=30M node build
```

Run it under systemd or another supervisor. Node.js 22.12+ is required.

## Upgrading

```bash
docker compose pull && docker compose up -d
```

Database migrations run automatically at start (`MIGRATE_ON_START=true`). Read the
[changelog](../CHANGELOG.md) before a major-version upgrade.

## Backups

Everything — cases, timelines, photos and documents — is in Postgres:

```bash
docker compose exec db pg_dump -U stewardbook -Fc stewardbook > stewardbook-$(date +%F).dump
```

Restore with `pg_restore --clean -d stewardbook`. Keep backups somewhere the local controls, and test a restore.

## Health checks

`GET /healthz` returns `{"status":"ok","version":"…","build":"…","db":"ok"}` (HTTP 503 if the database is unreachable).
The Docker image has a built-in `HEALTHCHECK` using it.

## Local AI (optional)

Any OpenAI-compatible endpoint works. With the bundled Ollama profile:

```bash
docker compose --profile ai up -d
```

```bash
docker compose exec ollama ollama pull llama3.1:8b
```

Add `LLM_BASE_URL=http://ollama:11434/v1` to `.env` and run `docker compose up -d` again. An 8B model on a CPU takes a
minute or two per contract; `LLM_TIMEOUT_SECONDS` controls how long to wait before falling back to the built-in reader.
