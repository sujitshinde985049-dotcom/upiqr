import { NextResponse } from "next/server";
import { loadServerConfig, ServerConfigError } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
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
      return NextResponse.json(
        { status: "unavailable", reason: "configuration" },
        { status: 503, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { status: "unavailable", reason: "dependency" },
      { status: 503, headers: NO_STORE }
    );
  }
}
