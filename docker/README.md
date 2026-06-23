# docker/ — VertexChain container images

This directory holds container build assets that are checked into source
control but live outside any single workspace. The CI pipeline
(`infrastructure/ci/docker-build-pipeline.yml`) consumes these files to
build, test, scan, and push the NestJS backend image, and the parallel
`infrastructure/ci/frontend-build.yml` workflow consumes the frontend
Dockerfile to build, scan, and push the Next.js standalone image.

## Assets

| File                       | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `backend.Dockerfile`       | Multi-stage build for the NestJS server                       |
| `frontend.Dockerfile`      | Multi-stage build for the Next.js app (standalone output)    |

The `Backend` and `Frontend` workspaces each have their own `.dockerignore`
because the CI builds with `context: ./<workspace>`. See
[Backend/.dockerignore](../Backend/.dockerignore) and
[Frontend/.dockerignore](../Frontend/.dockerignore).
There is no `docker/.dockerignore`: a Dockerfile would mis-copy
`package.json` from a repo-root context, so root-context builds are out
of scope for both images.

## Targets exposed by `backend.Dockerfile`

| Target       | Base image       | Purpose                                                                 | Size envelope |
| ------------ | ---------------- | ----------------------------------------------------------------------- | ------------- |
| `build`      | `node:20-alpine` | Compile TypeScript to `dist/` via `nest build`                           | ≈ 600 MB      |
| `test`       | `node:20-alpine` | Run `jest --coverage` against the source tree (dev deps + DB-free)     | ≈ 700 MB      |
| `production` | `node:20-alpine` | Runtime image: prod deps only, distilled `dist/`, non-root, healthcheck | < 200 MB      |

`build` and `test` are throwaway CI artefacts; only `production` is published
to GHCR (`ghcr.io/vertexchainlabs/vertexchain`).

## Targets exposed by `frontend.Dockerfile`

| Target    | Base image       | Purpose                                                                | Size envelope |
| --------- | ---------------- | ---------------------------------------------------------------------- | ------------- |
| `deps`    | `node:20-alpine` | `npm ci` install (dev + prod deps) for the build runner                 | ≈ 600 MB      |
| `builder` | `node:20-alpine` | `next build` with `output: 'standalone'`                                | ≈ 800 MB      |
| `runner`  | `node:20-alpine` | Runtime image: standalone output (traced `node_modules` + `server.js`), non-root, healthcheck against `/api/health` | < 150 MB (target < 100 MB) |

`deps` and `builder` are throwaway CI artefacts; only `runner` is published
to GHCR (`ghcr.io/vertexchainlabs/vertexchain-frontend`).

## Backend design decisions

1. **Alpine over distroless.** Alpine ships a shell and `wget`, which lets
   us use the standard `HEALTHCHECK` directive without authoring or vetting
   a Node-based liveness script. A `node:20-alpine` image with only
   production deps sits well below the 200 MB ceiling.

2. **`tini` as ENTRYPOINT.** Alpine's init choice for PID 1 is left to the
   image. We install `tini` and set it as the entrypoint so SIGTERM/SIGINT
   propagate to Node and orphaned reaping happens correctly under k8s.

3. **`node` user for privilege dropping.** The official `node:20-alpine`
   image ships with a built-in `node` user (UID 1000). Using that user
   satisfies the "production must not run as root" criterion without
   authoring custom `adduser`/`chown` boilerplate. We apply ownership at
   `COPY` time (`COPY --chown=node:node …`) so we never add an extra layer
   just to chown files.

4. **Layer ordering for cache reuse.** `package.json` + `package-lock.json`
   are copied and `npm ci` is run before any application source is copied,
   so iterating on TypeScript does not invalidate `node_modules` or the
   `npm ci` cache layer.

5. **Dedicated `prod-deps` stage.** Production-only `node_modules` is
   installed once into its own stage and `COPY --from=prod-deps`'d into
   the runtime image. We deliberately avoid both BuildKit cache mounts on
   `/root/.npm` (they cause ENOTEMPTY conflicts when multiple
   `npm ci`/`npm cache clean` cycles step on each other) and the
   deprecated `npm prune --omit=dev` workflow. Result: one prod-deps
   install, one runtime layer, no prune hop.

6. **Healthcheck via `/health`.** `Backend/src/health/health.controller.ts`
   exposes `GET /health` returning a database + PostGIS status JSON.
   `wget --spider` performs a HEAD-style probe against
   `http://127.0.0.1:${PORT}/health`. `start-period=30s` gives TypeORM time
   to open the DB pool and run the PostGIS extension check before the
   first failure flips the container to unhealthy.

7. **Test stage skips DB integration suite.** `Backend/src/gists/gist.repository.spec.ts`
   is gated behind `process.env.CI` and skips itself in CI environments, so
   running `npm test` inside the build target is safe without provisioning
   a Postgres container. `.e2e-spec.ts` files are also excluded via
   `--testPathIgnorePatterns='\.e2e-spec\.ts$'`. `node_modules` is already
   excluded by Jest by default, so we list only the e2e pattern.

## Frontend design decisions

1. **Next.js standalone output.** `Frontend/next.config.ts` sets
   `output: 'standalone'`, which causes `next build` to emit a
   self-contained `.next/standalone/` containing `server.js`, a
   pruned `node_modules` (only modules traced as required at runtime),
   and `.next/server/`. Combined with
   `productionBrowserSourceMaps: false`, that keeps the runtime image
   close to the 100 MB acceptance target without manually curating the
   shipped `node_modules`. `.next/static` and `public/` are still copied
   in separately because the standalone output deliberately omits them.

2. **Alpine + `libc6-compat`.** Same rationale as the backend image:
   Alpine gives the smallest Node base, but Next.js / sharp native
   shims link against glibc on some platforms. `libc6-compat` is the
   standard musl shim that bridges them without giving up the
   ≈ 50 MB base size.

3. **No `prod-deps` stage (unlike backend).** Where the backend needs
   an explicit `prod-deps` stage because `npm prune --omit=dev` would
   otherwise need to run after the fact, Next.js standalone already
   traces a production-only `node_modules` into
   `.next/standalone/node_modules/` during `next build`. A second
   `npm ci --omit=dev` would just duplicate work, so the runner stage
   copies the traced tree directly.

4. **Healthcheck via `/api/health`.** `Frontend/src/app/api/health/route.ts`
   defines an App Router `GET` handler that returns a tiny
   `{ status: 'ok', timestamp }` JSON envelope with
   `dynamic = 'force-dynamic'` so the route is never pre-rendered into
   the static output (which would break the runtime probe on the
   standalone server). `wget --spider` performs a HEAD-style probe
   against `http://127.0.0.1:${PORT}/api/health` exactly like the
   backend image's `/health` probe.

5. **Layer ordering for cache reuse.** `package.json` +
   `package-lock.json` are copied and `npm ci` runs *before* any
   application source (`next.config.ts`, `src/`, `public/`) is copied,
   so iterating on TypeScript does not invalidate the `node_modules`
   cache layer. Config files (`next.config.ts`, `tsconfig.json`) are
   copied separately so they live in their own cache layer and can be
   invalidated independently of application source.

6. **`npm ci --ignore-scripts`.** Skips postinstall hooks
   (`husky prepare`, …) inside the `deps` stage. None of those hooks
   are required for `next build` to succeed, and skipping them avoids
   installing build-time-only tools (e.g. native binaries that
   postinstall scripts copy into `node_modules/.bin/`) into a layer
   the runner image doesn't actually use.

## Local validation

### Backend

```bash
# Build context MUST be ./Backend because `backend.Dockerfile` does
# relative `COPY package.json ...` and `COPY src ./src` — these resolve
# to Backend/package.json and Backend/src only when the context is
# Backend/, matching how the CI pipeline posts `context: ./Backend` to
# docker/build-push-action.
#
# Issue #6 example commands use repo-root context (`docker build ... .`).
# Those literal invocations are NOT viable with this Dockerfile because
# `package.json` lives at Backend/package.json, not at the repo root.
# Use `./Backend` here and in any CI definition.

# Compile only:
docker build --target build      -f docker/backend.Dockerfile ./Backend

# Compile + run jest with coverage:
docker build --target test       -f docker/backend.Dockerfile ./Backend

# Ship-shaped runtime image (must be < 200 MB):
docker build --target production -f docker/backend.Dockerfile ./Backend

# Boot the production image and confirm the healthcheck passes:
docker run --rm -p 3000:3000 --name vertex-backend \
    $(docker build -q --target production -f docker/backend.Dockerfile ./Backend)
sleep 10
curl -fsS http://localhost:3000/health
docker inspect --format='{{json .State.Health.Status}}' vertex-backend
```

### Frontend

```bash
# Build context MUST be ./Frontend for the same reason as the backend
# image: `frontend.Dockerfile` does relative `COPY package.json`,
# `COPY src ./src`, and `COPY public ./public`, which only resolve
# correctly when the context is Frontend/.

# Install layer only (useful for debugging `npm ci` failures):
docker build --target deps    -f docker/frontend.Dockerfile ./Frontend

# Standalone compilation only (useful for tracing `next build` issues):
docker build --target builder -f docker/frontend.Dockerfile ./Frontend

# Ship-shaped runtime image (target < 100 MB per issue #7):
docker build --target runner  -f docker/frontend.Dockerfile ./Frontend

# Boot the runtime image and confirm the healthcheck passes:
docker run --rm -p 3000:3000 --name vertex-frontend \
    $(docker build -q --target runner -f docker/frontend.Dockerfile ./Frontend)
sleep 10
curl -fsS http://localhost:3000/api/health           # liveness probe
curl -fsS http://localhost:3000/                     # landing page renders
docker inspect --format='{{json .State.Health.Status}}' vertex-frontend
```

## Security considerations

### Backend

- Non-root runtime user (`USER node`).
- Production stage installs only `--omit=dev` dependencies and excludes
  source maps, dev configs, and `.env` files via `.dockerignore`.
- Image is scanned by Trivy in CI (`infrastructure/ci/docker-build-pipeline.yml`,
  `security-scan` job). High or critical CVEs gate the `push` job.
- `TOKEN=` style secret values are never baked into layers: they must
  be provided as runtime env vars (`docker run -e KEY=value` or k8s `Secret`).

### Frontend

- Non-root runtime user (`USER node`, UID 1000).
- Production stage copies only `.next/standalone/`, `.next/static/`, and
  `public/` from `builder`. Dev tooling (eslint, vitest, typescript,
  husky, …) never enters the runtime image.
- Source maps are not inlined into client bundles
  (`productionBrowserSourceMaps: false` in `Frontend/next.config.ts`),
  so an attacker pulling the image cannot reconstruct the original
  source from client-side bundles.
- Image is scanned by Trivy in CI; high or critical CVEs gate the push.
- `NEXT_PUBLIC_*` style values are intentionally *baked in* — that is
  the framework contract for browser-visible env vars. Any secret that
  must remain server-only belongs on the backend image, not here.
