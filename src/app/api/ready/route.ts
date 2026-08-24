import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { loadServerConfig, ServerConfigError } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import {
  operationalLogger,
  resolveRequestCorrelationId,
} from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const requestId = resolveRequestCorrelationId(
    (await headers()).get("x-request-id")
  );

  try {
    const config = loadServerConfig();
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ready",
        timestamp: new Date().toISOString(),
        runtime: config.nodeEnv,
        providerMode: config.sabpaisaMode,
      },
      {
        status: 200,
        headers: NO_STORE,
      }
    );
  } catch (error) {
    if (error instanceof ServerConfigError) {
      operationalLogger.warn({
        event: "readiness_unavailable",
        requestId,
        category: "CONFIGURATION_ERROR",
        message: "configuration",
      });
      return NextResponse.json(
        { status: "unavailable", reason: "configuration" },
        { status: 503, headers: NO_STORE }
      );
    }

    operationalLogger.logOperationalFailure("readiness_dependency_failed", error, {
      requestId,
      entityType: "Database",
    });

    return NextResponse.json(
      { status: "unavailable", reason: "dependency" },
      { status: 503, headers: NO_STORE }
    );
  }
}
