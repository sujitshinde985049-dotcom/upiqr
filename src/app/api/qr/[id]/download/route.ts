import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AuthError } from "@/lib/auth/authorization";
import { downloadMerchantQR, QRServiceError } from "@/lib/services/qr-service";
import { qrDownloadQuerySchema } from "@/lib/validations/qr";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await context.params;
  const url = new URL(request.url);
  const parsed = qrDownloadQuerySchema.safeParse({
    format: url.searchParams.get("format") ?? undefined,
    size: url.searchParams.get("size") ?? undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code = issue?.path.includes("format") ? "INVALID_FORMAT" : "VALIDATION_ERROR";
    return NextResponse.json(
      { error: issue?.message ?? "Invalid download query", code },
      { status: 400 }
    );
  }

  try {
    const download = await downloadMerchantQR(session.user, id, parsed.data);
    return new NextResponse(new Uint8Array(download.body), {
      status: 200,
      headers: {
        "Content-Type": download.contentType,
        "Content-Disposition": `attachment; filename="${download.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof QRServiceError) {
      const status =
        error.code === "QR_NOT_FOUND"
          ? 404
          : error.code === "FORMAT_NOT_SUPPORTED" || error.code === "INVALID_FORMAT"
            ? 400
            : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("QR download route failed");
    return NextResponse.json({ error: "Failed to download QR" }, { status: 500 });
  }
}
