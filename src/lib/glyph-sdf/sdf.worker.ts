/**
 * SDF build, off the main thread — the Felzenszwalb transform at hero size
 * costs 400-900ms, a hard no for the main thread. This file just wires
 * `buildGlyphFieldResponse` to postMessage; all the real work is in the
 * DOM-free `distance-transform.ts` so it's testable without a worker.
 *
 * Typed minimally rather than pulling in the "webworker" lib: this repo's
 * tsconfig lib is `["dom", ...]` for the app at large, and "dom" + "webworker"
 * declare conflicting globals (`self` among them) if mixed in one program.
 */
import { buildGlyphFieldResponse } from "./distance-transform";
import type { SdfRequest, SdfResponse } from "./types";

interface WorkerMessageEvent {
  data: SdfRequest;
}

type WorkerSelf = {
  onmessage: ((event: WorkerMessageEvent) => void) | null;
  postMessage: (message: SdfResponse, transfer: Transferable[]) => void;
};

const workerSelf = self as unknown as WorkerSelf;

workerSelf.onmessage = (event) => {
  const response = buildGlyphFieldResponse(event.data);
  // Transfer the packed texture buffer back — zero-copy.
  workerSelf.postMessage(response, [response.texture.buffer]);
};
