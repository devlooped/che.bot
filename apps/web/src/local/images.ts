import { FakeImageProvider } from "@chebot/providers";

// The image model of the local mode: a square SVG of a few flat shapes, its hues and places drawn
// from the prompt, so that each question gets a picture of its own without an outside service.

/** A number of 32 bits from a text (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function localPicture(prompt: string): string {
  let seed = hash(prompt);
  const next = (max: number) => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) >>> 0;
    return seed % max;
  };
  const hue = next(360);
  const shapes = Array.from({ length: 5 }, (_, i) => {
    const fill = `hsl(${(hue + 40 * i) % 360} ${35 + next(25)}% ${45 + next(25)}%)`;
    return i % 2 === 0
      ? `<circle cx="${next(512)}" cy="${next(512)}" r="${60 + next(140)}" fill="${fill}" fill-opacity="0.85"/>`
      : `<rect x="${next(400)}" y="${next(400)}" width="${80 + next(200)}" height="${80 + next(200)}" rx="12" fill="${fill}" fill-opacity="0.8"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="hsl(${hue} 30% 88%)"/>${shapes.join("")}</svg>`;
}

export const localImages = new FakeImageProvider((req) => ({
  bytes: new TextEncoder().encode(localPicture(req.prompt)),
  mediaType: "image/svg+xml",
  costUsd: 0.04,
}));
