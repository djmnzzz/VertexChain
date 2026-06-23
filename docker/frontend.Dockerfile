# syntax=docker/dockerfile:1.7
#
# VertexChain Frontend — multi-stage Dockerfile
#
# Four stages, each contributing once:
#   base     – shared runtime root (Alpine + libc6-compat + tini)
#   deps     – full dev + prod deps so `npm run build` can succeed
#   builder  – Next.js standalone build (output: 'standalone')
#   runner   – minimal runtime image: standalone output only, non-root,
#              HEALTHCHECK against /api/health on port 3000.
#
# The runtime image is built from `runner`, which inherits a clean
# `base` so dev tooling (eslint, vitest, typescript, …) never enters
# the published image. `.next/standalone/` carries a pruned
# `node_modules` produced by Next.js's output-file-tracing pass, which
# is why this Dockerfile does not need a separate `prod-deps` stage
# like `docker/backend.Dockerfile` does.
#
# Acceptance commands (issue #7):
#   docker build --target runner -f docker/frontend.Dockerfile ./Frontend
#   docker run --rm -p 3000:3000 --name vertex-frontend \
#       $(docker build -q --target runner -f docker/frontend.Dockerfile ./Frontend)
#   curl -fsS http://localhost:3000/api/health

ARG NODE_VERSION=20

# =============================================================================
# base — minimal Alpine layer reused by every stage.
#   • tini: proper PID 1 + signal forwarding, same rationale as backend.
#   • libc6-compat: Next.js / sharp native shims link against glibc;
#     Alpine ships musl, so the compat layer is needed at runtime.
#   `--no-cache` keeps the apk index out of the image.
# =============================================================================
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache libc6-compat tini \
 && chown node:node /usr/src/app
ENTRYPOINT ["/sbin/tini", "--"]

# =============================================================================
# deps — install every dependency needed by `next build`, including
# devDependencies (typescript, eslint, …). Cached independently so
# editing application source never invalidates this heavy `node_modules`
# layer. `--ignore-scripts` skips postinstall hooks (autoprefixer,
# husky, …) since none of them are required for the standalone build.
# =============================================================================
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --ignore-scripts

# =============================================================================
# builder — compile Next.js to `.next/standalone` + `.next/static`.
#   • Inherits `deps` (node_modules + Workbox/Turbopack tooling).
#   • `NEXT_TELEMETRY_DISABLED=1` opts the build out of anonymous
#     telemetry events to https://telemetry.nextjs.org.
#   • `npm run build` runs `next build`, which performs output-file
#     tracing and produces:
#         .next/standalone/  – server.js + traced node_modules + .next/server
#         .next/static/      – hashed client bundles (kept separately)
#         public/            – user-authored static assets (kept separately)
# =============================================================================
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY next.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# =============================================================================
# runner — minimal runtime image.
#   • Fresh `base` so dev tooling, source maps, and `.git` never infect
#     the shipped image.
#   • `node` user (UID 1000, ships with node:20-alpine) — non-root,
#     satisfying the issue #7 "must not run as root" criterion.
#   • `--chown=node:node` is folded into the COPYs so we do not add an
#     extra layer just to chown files.
#   • The standalone directory is the only thing copied from `builder`.
#     Its top-level layout is:
#         ./
#           server.js          <- the entry point we run with `node`
#           package.json
#           node_modules/      <- pruned by next's tracing pass
#           .next/server/      <- server-side bundle
#       Files outside that subtree still need to be copied in
#       separately (`.next/static`, `public/`).
# =============================================================================
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone bundle: server.js, package.json, traced node_modules,
# .next/server. The trailing `/` is required so COPY targets the
# directory contents rather than the directory itself.
COPY --from=builder --chown=node:node /usr/src/app/.next/standalone ./
# Static assets hashed at build time (immutable, served by Next.js).
COPY --from=builder --chown=node:node /usr/src/app/.next/static   ./.next/static
# User-authored public/ assets (favicon, robots.txt, etc.).
COPY --from=builder --chown=node:node /usr/src/app/public         ./public

USER node

EXPOSE 3000

# Liveness probe against the App Router endpoint defined in
# `Frontend/src/app/api/health/route.ts`. `wget --spider` is a HEAD-style
# probe that doesn't save a response body, which matters because some
# App Router responses are streamed and the connection shouldn't be
# drained to disk. `start-period=10s` gives Next.js time to compile the
# server entry and bind the listener before the first probe.
#
# NOTE: this is the SHELL form of HEALTHCHECK CMD (no `[]` around the
# arguments). Docker runs it via `sh -c`, which is what lets `${PORT}`
# resolve at container runtime.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider \
        http://127.0.0.1:${PORT}/api/health || exit 1

# `next build` with `output: 'standalone'` emits a top-level
# `server.js` that listens on $PORT (default 3000). Running it under
# `tini` (ENTRYPOINT) ensures SIGTERM from Kubernetes propagates cleanly.
CMD ["node", "server.js"]
