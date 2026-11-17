import { encode } from "uqr";

/** A QR code as an SVG: one path of dark modules over a light square. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  let path = "";
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    });
  });
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-qr={value}
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#101820" />
    </svg>
  );
}
