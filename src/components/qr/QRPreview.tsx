interface QRPreviewProps {
  qrId: string;
  vpa: string;
  merchantName: string;
  size?: number;
  className?: string;
}

function isCellVisible(index: number, seed: string) {
  const charCode = seed.charCodeAt(index % seed.length) || 0;
  return (index * 13 + charCode * 7) % 10 > 3;
}

export function QRPreview({
  qrId,
  vpa,
  merchantName,
  size = 200,
  className,
}: QRPreviewProps) {
  return (
    <div className={className}>
      <div
        className="relative mx-auto flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-white p-4"
        style={{ width: size + 32, minHeight: size + 80 }}
      >
        <div
          className="grid grid-cols-5 gap-0.5"
          style={{ width: size, height: size }}
        >
          {Array.from({ length: 25 }).map((_, i) => (
            <div
              key={i}
              className="bg-foreground"
              style={{
                opacity: isCellVisible(i, qrId) ? 1 : 0,
                borderRadius: i % 7 === 0 ? "2px" : 0,
              }}
            />
          ))}
        </div>
        <div className="mt-3 text-center">
          <p className="text-xs font-semibold text-primary">Demo QR</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {vpa}
          </p>
          <p className="text-[10px] text-muted-foreground">{merchantName}</p>
          <p className="mt-1 font-mono text-[9px] text-muted-foreground/60">
            {qrId}
          </p>
        </div>
      </div>
    </div>
  );
}
