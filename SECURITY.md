# Security policy

Stewardbook holds sensitive information about workers and their disputes with their employer. Security reports are
taken seriously.

## Supported versions

| Version | Supported         |
| ------- | ----------------- |
| 1.x     | ✅ Security fixes |
| < 1.0   | ❌                |

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through
[GitHub security advisories](https://github.com/lobojoel2003/Stewardbook/security/advisories/new) with steps to
reproduce, the version and build number (Settings → About), and the impact you expect. You should get a response
within a week. Once a fix is released you'll be credited in the release notes unless you'd rather not be.

## How Stewardbook protects data

- Passwords are hashed with scrypt; session cookies are `HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS, and only a
  SHA-256 hash of each session token is stored.
- Repeated failed sign-ins are throttled per address and per email.
- Form posts are origin-checked (CSRF); pages ship a strict Content-Security-Policy, `X-Frame-Options: DENY` and
  `nosniff`. Attachments are served with their own sandboxing CSP.
- Calendar feed URLs contain a random token that can be regenerated to revoke old subscriptions.
- There is no telemetry and no third-party service. The optional AI step only calls an endpoint you configure.
- When someone signs out, the device's cached pages are cleared, and unsynced offline entries are discarded only after
  a warning.

## Running it safely

- Serve it over HTTPS and set `ORIGIN` to the public URL.
- Keep Postgres off the public internet, use a strong `POSTGRES_PASSWORD`, and back up the database (it contains every
  attachment).
- Update regularly: `docker compose pull && docker compose up -d`.
