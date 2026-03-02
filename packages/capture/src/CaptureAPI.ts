import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { ScreenshotService } from "./ScreenshotService.js";

/** Shape of the incoming postMessage request. */
export interface CaptureRequest {
  type: "scene:capture";
  label: string;
  width?: number;
  height?: number;
}

/** Shape of the outgoing postMessage response. */
export interface CaptureResult {
  type: "scene:capture:result";
  url: string;
  label: string;
}

/**
 * Bridges window.postMessage events with the ScreenshotService so external
 * tools (QA dashboards, CI runners, etc.) can request screenshots.
 */
export class CaptureAPI {
  private readonly screenshotService: ScreenshotService;
  private readonly getActiveCamera: () => Camera;
  private readonly uploadUrl?: string;
  private handler: ((event: MessageEvent) => void) | null = null;

  constructor(
    screenshotService: ScreenshotService,
    getActiveCamera: () => Camera,
    uploadUrl?: string,
  ) {
    this.screenshotService = screenshotService;
    this.getActiveCamera = getActiveCamera;
    this.uploadUrl = uploadUrl;
  }

  /**
   * Start listening for capture requests via postMessage.
   */
  listen(): void {
    if (this.handler) return; // already listening

    this.handler = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> | undefined;
      if (!data || data.type !== "scene:capture") return;

      const request = data as unknown as CaptureRequest;
      const camera = this.getActiveCamera();

      void this.screenshotService
        .capture(camera, {
          label: request.label,
          width: request.width,
          height: request.height,
          uploadUrl: this.uploadUrl,
        })
        .then((url) => {
          const result: CaptureResult = {
            type: "scene:capture:result",
            url,
            label: request.label,
          };
          window.postMessage(result, "*");
        });
    };

    window.addEventListener("message", this.handler);
  }

  /**
   * Stop listening for capture requests.
   */
  stop(): void {
    if (this.handler) {
      window.removeEventListener("message", this.handler);
      this.handler = null;
    }
  }
}
