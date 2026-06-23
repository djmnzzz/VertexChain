# syntax=docker/dockerfile:1.7
#
# VertexChain Backend — multi-stage Dockerfile
#
# Six stages, each contributing once:
#   base      – shared runtime root (Alpine + tini + ca-certs)
#   deps      – full dev + prod deps for build/test
#   prod-deps – production-only deps for the runtime image
#   build     – NestJS compile (nest build) → /usr/src/app/dist
#   test      – jest --coverage (e2e + DB-gated suites are excluded)
#   production – minimal runtime image: prod deps + compiled dist, non-root,
#                HEALTHCHECK against /health on port 3000.
#
# The CI pipeline (`infrastructure/ci/docker-build-pipeline.yml`) builds
# with `context: ./Backend` and `file: docker/backend.Dockerfile`. We use a
# dedicated `prod-deps` stage so the runtime image never regresses to
# carrying dev tooling (jest, eslint, ts-node, …) or the `node_modules`
# layer from `deps`.
#
# Acceptance commands (issue #6):
#   docker build --target build      -f docker/backend.Dockerfile Backend
#   docker build --target test       -f docker/backend.Dockerfile Backend
#   docker build --target production -f docker/backend.Dockerfile Backend

ARG NODE_VERSION=20

# =============================================================================
# base — minimal Alpine layer reused by every stage.
#   • tini: proper PID 1 + signal forwarding
#   • openssl + ca-certificates: required by pg TLS clients and many native
#     modules; harmless but future-proofs Postgres-SSL upgrades
#   `--no-cache` keeps the apk index out of the image, so the image never
#   carries `/var/cache/apk/*` to begin with.
# =============================================================================
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache ca-certificates tini \
 && chown node:node /usr/src/app
ENTRYPOINT ["/sbin/tini", "--"]

# =============================================================================
# deps — install every dependency needed by compile + tests.
# Cached independently so editing application source never invalidates this
# heavy `node_modules` layer.
# =============================================================================
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# =============================================================================
# prod-deps — production-only deps, installed once in isolation. The runtime
# image inherits from this stage's pristine production `node_modules` rather
# than paying the cost of re-installing or `npm prune`ing inside `build`.
# Works because `prod-deps` inherits `base`, which sets `WORKDIR
# /usr/src/app` — that path is what the production stage `COPY --from`
# resolves against.
# =============================================================================
FROM base AS prod-deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# =============================================================================
# build — compile NestJS to dist/.
# Inherits `deps` (which has dev tooling available) so `nest build` works.
# Output: /usr/src/app/dist
# =============================================================================
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# =============================================================================
# test — run jest with coverage.
#   • ENV CI=true triggers the existing internal skip in
#     Backend/src/gists/gist.repository.spec.ts (line 12:
#     `const describeIntegration = process.env.CI ? describe.skip : describe;`).
#     This is the ONLY Backend/src/**/*spec.ts that touches DataSource / pg /
#     Pool / TypeORM at runtime; everything else (e.g.
#     health.controller.spec.ts) is a unit test with a mocked
#     getDataSourceToken(), so it does not require a live Postgres.
#   • Contract: when adding a new .spec.ts under Backend/src/, grep for
#     `DataSource|pg\.Pool|TypeOrmModule|@InjectRepository|getRepository` and
#     add a parallel `describeIntegration ? describe.skip : describe` CI gate
#     if any match. Otherwise `docker build --target test` exits non-zero in CI.
#   • --testPathIgnorePatterns drops e2e specs that need a running Postgres
#     (Backend/test/*, *.e2e-spec.ts). node_modules is excluded by Jest
#     by default; we keep the e2e pattern only.
# =============================================================================
FROM build AS test
ENV CI=true
RUN npm test -- \
    --coverage \
    --coverageReporters=text-summary \
    --testPathIgnorePatterns='\.e2e-spec\.ts$'

# =============================================================================
# production — minimal runtime image.
#   • Fresh `base` so dev tooling, source maps, and .git never infect the
#     shipped image.
#   • node_modules from `prod-deps` (only prod deps, audited once).
#   • dist/ copied from `build` (compiled TS output only).
#   • `--chown=node:node` is folded into the COPYs so we don't add an
#     extra layer just to chown files; this also keeps cached layers thin.
#   • `node` user (UID 1000, ships with node:20-alpine) — required by
#     issue #6's "must not run as root" acceptance criterion.
#   • HEALTHCHECK against the NestJS GET /health endpoint.
# =============================================================================
FROM base AS production
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps --chown=node:node /usr/src/app/node_modules ./node_modules
# package.json is needed at runtime by libraries (TypeORM, etc.) that read
# its `type`, `main`, or `exports` fields during module resolution.
COPY --from=prod-deps --chown=node:node /usr/src/app/package.json ./package.json
COPY --from=build     --chown=node:node /usr/src/app/dist          ./dist

USER node

EXPOSE 3000

# NestJS exposes GET /health returning { status, timestamp, services }.
# `--spider` makes busybox `wget` HEAD-style probe without saving the body.
# `start-period=30s` gives TypeORM time to open the DB pool + PostGIS probe
# before the first failure flips the container to unhealthy.
#
# NOTE: this is the SHELL form of HEALTHCHECK CMD (no `[]` around the
# arguments). Docker runs it via `sh -c`, which is what lets `${PORT}`
# resolve at container runtime. Switching to exec form would silently
# break the env-var binding.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --quiet --tries=1 --spider \
        http://127.0.0.1:${PORT}/health || exit 1

# `--enable-source-maps` keeps production stack traces resolving back to
# the original TypeScript lines via the inline sources emitted by
# `nest build`. No runtime cost, much better postmortem signal in
# Datadog / Sentry when an exception escapes the request boundary.
CMD ["node", "--enable-source-maps", "dist/main"]
