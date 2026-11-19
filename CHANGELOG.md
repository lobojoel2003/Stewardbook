# Changelog

All notable changes to Stewardbook are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-19

The first release: everything a steward needs to run grievances against their own contract.

### Added

- **Contract reader.** Paste the agreement or upload a text-based PDF. Stewardbook finds the articles, the grievance and
  arbitration procedure, every step's time limit (who must act, what they must do, working or calendar days), the
  contract's definition of "days", the work week and the holiday list, including the weekend-observance rule.
- **Human confirmation.** Every extracted deadline is shown beside its highlighted source sentence and must be
  confirmed by a person before the contract can be activated. Steps can be edited, reordered, added and removed.
- **Optional local AI drafting** through any OpenAI-compatible endpoint (Ollama, llama.cpp, LM Studio, vLLM), with
  output validation and quote checking. The built-in reader is used if the model fails.
- **Deadline engine** for working and calendar days: configurable work weeks; fixed, nth-weekday, Easter-relative and
  one-off holidays; federal and other observance rules; roll-forward of calendar-day limits; agreed extensions; and
  missed management answers that start the next clock from the missed date.
- **Cases** with a live countdown clock, a step tracker that flags late actions, undo, clock-start adjustment and
  skipped steps (e.g. discharges filed at Step 2).
- **One-tap timeline entries**: notes, photos (resized on the device), witness statements, Weingarten meeting notes,
  calls and documents. Attachments are stored in Postgres.
- **Offline support**: installable PWA, offline reading of recently opened pages, and an IndexedDB outbox that syncs
  entries made without signal — idempotently — when the connection returns.
- **Handoffs** with notes and a printable handoff packet (also as Markdown), plus JSON export of any case.
- **Precedent library**: full-text search over closed cases by issue, article and outcome, with citation counts and
  outcome bars per article.
- **Dashboard** of running deadlines sorted by urgency, with recent activity across the local.
- **Calendar feed** (`.ics`) of running deadlines with reminders, per steward or for the whole local.
- **Team management**: first-run setup, admin and steward roles, temporary passwords, deactivation.
- **Security**: scrypt password hashing, hashed session tokens with sliding expiry, login throttling, CSRF origin
  checks, strict Content-Security-Policy and hardened headers.
- **Operations**: automatic migrations, `/healthz`, a multi-stage Docker image for amd64 and arm64, Docker Compose
  with an optional Ollama profile, and a demo seed script.
- **Engineering**: unit, Postgres integration and Playwright end-to-end suites; CI with coverage, Docker smoke test and
  CodeQL; tag-driven releases to GHCR with SBOM and provenance; build numbers shown in the app.

[Unreleased]: https://github.com/lobojoel2003/Stewardbook/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lobojoel2003/Stewardbook/releases/tag/v1.0.0
