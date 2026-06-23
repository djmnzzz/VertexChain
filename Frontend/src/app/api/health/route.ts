import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Lightweight liveness endpoint used by the Docker HEALTHCHECK directive
 * in `docker/frontend.Dockerfile`. The probe intentionally performs no
 * SSR work, fetches no external services, and has no side effects so a
 * `wget --spider` against `http://127.0.0.1:${PORT}/api/health` is a
 * pure 200 OK signal. Frontend code that talks to the backend should
 * *not* route health checks through this endpoint — this is purely a
 * container-level liveness probe.
 *
 * Marked `dynamic = "force-dynamic"` so Next.js never tries to pre-render
 * the response at build time (which would otherwise compile this route
 * into the static output and break runtime probing on the standalone
 * server).
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
