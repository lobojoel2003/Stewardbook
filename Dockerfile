# syntax=docker/dockerfile:1.7
#
# Stewardbook production image.
#   docker build -t stewardbook --build-arg APP_VERSION=1.0.0 --build-arg BUILD_NUMBER=42 .
#   docker run -p 3000:3000 -e DATABASE_URL=postgres://… -e ORIGIN=https://stewardbook.example.org stewardbook
#
# Multi-arch builds stay fast: dependencies are installed and the app is built once on the
# build machine's own platform ($BUILDPLATFORM), and the result is copied into each target
# platform's runtime image. That works because every production dependency is pure
# JavaScript, so nothing has to run under emulation.

ARG NODE_VERSION=22

# ── Dependencies (native platform) ────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ── Build (native platform) ───────────────────────────────────────────────────
FROM deps AS build
ARG APP_VERSION
ARG BUILD_NUMBER=docker
ARG GIT_SHA=unknown
ARG BUILD_DATE
ENV APP_VERSION=${APP_VERSION} \
    BUILD_NUMBER=${BUILD_NUMBER} \
    GIT_SHA=${GIT_SHA} \
    BUILD_DATE=${BUILD_DATE}
COPY . .
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && if find node_modules -name '*.node' | grep -q .; then \
      echo 'A production dependency ships a native binary; it must be installed per target platform.' >&2; exit 1; \
    fi

# ── Runtime (target platform) ─────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP_VERSION
ARG BUILD_NUMBER=docker
ARG GIT_SHA=unknown
ARG BUILD_DATE
LABEL org.opencontainers.image.title="Stewardbook" \
      org.opencontainers.image.description="Grievance tracker for union stewards" \
      org.opencontainers.image.source="https://github.com/lobojoel2003/Stewardbook" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      dev.stewardbook.build-number="${BUILD_NUMBER}"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=30M \
    MIGRATIONS_DIR=/app/drizzle

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/drizzle ./drizzle

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz > /dev/null || exit 1
CMD ["node", "build"]
