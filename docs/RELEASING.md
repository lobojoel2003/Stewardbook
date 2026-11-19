# Releasing

## Versions

Stewardbook uses [Semantic Versioning](https://semver.org):

- **patch** (`1.0.1`) — bug fixes, including any deadline that was counted wrong;
- **minor** (`1.1.0`) — new features, backwards-compatible migrations;
- **major** (`2.0.0`) — anything that needs manual steps on upgrade.

Pre-releases use a suffix (`1.1.0-rc.1`); they publish an image tagged with the full version only and a GitHub
pre-release.

## Build numbers

Every CI run has a monotonically increasing **build number** (`github.run_number`). It is baked into the app with the
version and commit and shown as `v1.0.0 · build 42 · 3f9c2ab` in the sidebar, Settings → About, `/healthz`, the image
label `dev.stewardbook.build-number` and the release notes. Release images are also tagged `build-42`, so any running
installation can be traced to the exact workflow run that produced it.

## Cutting a release

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading and update the
   comparison links at the bottom. Commit.
2. Bump, commit and tag in one step:

   ```bash
   npm run release:minor
   ```

   (or `release:patch` / `release:major`). This updates `package.json` and `package-lock.json`, commits
   `chore(release): vX.Y.Z` and creates the annotated tag `vX.Y.Z`.

3. Push the commit and the tag:

   ```bash
   git push --follow-tags
   ```

The [release workflow](../.github/workflows/release.yml) then:

1. checks that the tag matches `package.json`;
2. runs the full CI suite (lint, types, unit + integration, e2e, Docker smoke test);
3. builds the Node bundle with the version and build number, and writes `SHA256SUMS.txt`;
4. builds and pushes `ghcr.io/lobojoel2003/stewardbook` for amd64 and arm64 with tags `X.Y.Z`, `X.Y`, `X`, `latest`
   and `build-N`, an SBOM and provenance, and a signed build attestation;
5. publishes the GitHub Release with the changelog section as notes and the bundle attached.

### Releasing from GitHub instead

**Actions → Release → Run workflow** on `main` with the tag (e.g. `v1.1.0`) does the same thing without pushing a tag
from your machine: it checks that `package.json` already has that version, creates the annotated tag on the head of
`main`, and runs the pipeline above. Run it with an existing tag to rebuild a release (for example after fixing the
workflow).
