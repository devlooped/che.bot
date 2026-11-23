import { generateImage } from "ai";
import { errorKind, type GatewayOptions, gatewayCost, gatewayProvider } from "./gateway.ts";
import { type ModelRef, ProviderError } from "./provider.ts";

// The picture of a question: an image model of the Gateway (the "image" role) draws the prompt
// that the helper wrote. One call, one image.

export interface ImageRequest {
  /** The idempotency key of the call, such as "image:1". */
  callKey: string;
  model: ModelRef;
  prompt: string;
  aspectRatio: `${number}:${number}`;
  /** When it aborts, the call fails with kind "timeout". */
  signal: AbortSignal;
}

export interface ImageResult {
  bytes: Uint8Array;
  /** As the SDK detected it from the bytes, such as image/jpeg. */
  mediaType: string;
  /** The spend the Gateway reported; 0 when it reported none. */
  costUsd: number;
  latencyMs: number;
}

export interface ImageProvider {
  generate(req: ImageRequest): Promise<ImageResult>;
}

export function createGatewayImages(options: GatewayOptions = {}): ImageProvider {
  const gateway = gatewayProvider(options);
  return {
    async generate(req) {
      const started = Date.now();
      try {
        const result = await generateImage({
          model: gateway.imageModel(req.model.id),
          prompt: req.prompt,
          aspectRatio: req.aspectRatio,
          maxRetries: 1,
          abortSignal: req.signal,
        });
        return {
          bytes: result.image.uint8Array,
          mediaType: result.image.mediaType,
          costUsd: gatewayCost(result.providerMetadata) ?? 0,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        const kind = errorKind(error, req.signal);
        throw new ProviderError({
          kind,
          callKey: req.callKey,
          message: `${req.callKey} (${req.model.id}): ${kind}: ${error instanceof Error ? error.message : String(error)}`,
          latencyMs: Date.now() - started,
          cause: error,
        });
      }
    },
  };
}

/** A PNG of one pixel: what the fake draws unless told otherwise. */
export const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

/** An image provider for tests and the local mode: it records each request and draws at once. */
export class FakeImageProvider implements ImageProvider {
  readonly calls: ImageRequest[] = [];

  constructor(
    private readonly draw: (req: ImageRequest) => Omit<ImageResult, "latencyMs"> = () => ({
      bytes: ONE_PIXEL_PNG,
      mediaType: "image/png",
      costUsd: 0.04,
    }),
  ) {}

  async generate(req: ImageRequest): Promise<ImageResult> {
    this.calls.push(req);
    try {
      return { ...this.draw(req), latencyMs: 0 };
    } catch (error) {
      throw new ProviderError({
        kind: "error",
        callKey: req.callKey,
        message: `${req.callKey}: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      });
    }
  }
}
