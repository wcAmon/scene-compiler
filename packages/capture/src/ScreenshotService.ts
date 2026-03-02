import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { Tools } from "@babylonjs/core/Misc/tools";

export interface ScreenshotOptions {
  label: string;
  width?: number;
  height?: number;
  uploadUrl?: string;
}

export interface CaptureEntry {
  url: string;
  label: string;
  timestamp: string;
}

const MAX_CAPTURES = 50;

/**
 * Sanitize a label string so it is safe for use in a filename.
 * Keeps alphanumerics, hyphens, and underscores; collapses the rest.
 */
function sanitizeLabel(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Format the current date/time as YYYYMMDD-HHMMSS.
 */
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

/**
 * Convert a base-64 data URI to a Blob.
 */
function dataURItoBlob(dataURI: string): Blob {
  const [meta, base64] = dataURI.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export class ScreenshotService {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly captures: CaptureEntry[] = [];

  constructor(engine: Engine, scene: Scene) {
    this.engine = engine;
    this.scene = scene;
  }

  /**
   * Capture a screenshot from the given camera.
   *
   * Returns the resulting URL: either a data URI, or the upload location if
   * `options.uploadUrl` was provided.
   */
  async capture(
    camera: Camera,
    options: ScreenshotOptions,
  ): Promise<string> {
    const width = options.width ?? 1280;
    const height = options.height ?? 720;

    const dataURI = await new Promise<string>((resolve) => {
      Tools.CreateScreenshotUsingRenderTarget(
        this.engine,
        camera,
        { width, height },
        (data: string) => {
          resolve(data);
        },
      );
    });

    let url = dataURI;

    if (options.uploadUrl) {
      const now = new Date();
      const filename = `qa-${formatTimestamp(now)}-${sanitizeLabel(options.label)}.png`;

      const blob = dataURItoBlob(dataURI);
      const form = new FormData();
      form.append("file", blob, filename);

      const response = await fetch(options.uploadUrl, {
        method: "POST",
        body: form,
        credentials: "include",
      });

      url = response.url;
    }

    const entry: CaptureEntry = {
      url,
      label: options.label,
      timestamp: new Date().toISOString(),
    };

    this.captures.push(entry);
    if (this.captures.length > MAX_CAPTURES) {
      this.captures.shift();
    }

    return url;
  }

  /**
   * Return a shallow copy of the captures collected so far.
   */
  getCaptures(): readonly CaptureEntry[] {
    return [...this.captures];
  }
}
