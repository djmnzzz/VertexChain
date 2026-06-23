# docker/ — VertexChain container images

This directory holds container build assets that are checked into source
control but live outside any single workspace. The CI pipeline
(`infrastructure/ci/docker-build-pipeline.yml`) consumes these files to
build, test, scan, and push the NestJS backend image.

## Assets

| File                       | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `backend.Dockerfile`       | Multi-stage build for the NestJS server                       |

The Backend workspace has its own `.dockerignore` because the CI builds
with `context: ./Backend`. See [Backend/.dockerignore](../Backend/.dockerignore).
There is no `docker/.dockerignore`: the Dockerfile would mis-copy package.json
from a repo-root context, so root-context builds are out of scope.

## Targets exposed by `backend.Dockerfile`

| Target       | Base image       | Purpose                                                                 | Size envelope |
| ------------ | ---------------- | ----------------------------------------------------------------------- | ------------- |
| `build`      | `node:20-alpine` | Compile TypeScript to `dist/` via `nest build`                           | ≈ 600 MB      |
| `test`       | `node:20-alpine` | Run `jest --coverage` against the source tree (dev deps + DB-free)     | ≈ 700 MB      |
| `production` | `node:20-alpine` | Runtime image: prod deps only, distilled `dist/`, non-root, healthcheck | < 200 MB      |

`build` and `test` are throwaway CI artefacts; only `production` is published
to GHCR (`ghcr.io/vertexchainlabs/vertexchain`).

## Design decisions

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

## Local validation

```bash
# Build each target standalone. The build context MUST be ./Backend
# because `backend.Dockerfile` does relative `COPY package.json ...` and
# `COPY src ./src` — these resolve to Backend/package.json and Backend/src
# only when the context is Backend/, matching how the CI pipeline posts
# `context: ./Backend` to docker/build-push-action.
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

## Security considerations

- Non-root runtime user (`USER node`).
- Production stage installs only `--omit=dev` dependencies and excludes
  source maps, dev configs, and `.env` files via `.dockerignore`.
- Image is scanned by Trivy in CI (`infrastructure/ci/docker-build-pipeline.yml`,
  `security-scan` job). High or critical CVEs gate the `push` job.
- `TOKEN=` style secret values are never baked into layers: they must be
  provided as runtime env vars (`docker run -e KEY=value` or k8s `Secret`).
