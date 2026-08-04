/**
 * Reads a fetch Response body as JSON without ever throwing a raw
 * "Unexpected token / is not valid JSON" parse error at the call site. A
 * route that 500s before it can call `NextResponse.json(...)` — an
 * unhandled throw, a platform-level error page, an empty body — returns
 * something that isn't JSON at all; naively calling `res.json()` on that
 * turns an honest "the server failed" into a confusing parser exception
 * instead. This always throws a real `Error` with a readable message.
 */
export async function readJsonSafe<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();

  if (!text.trim()) {
    throw new Error(res.ok ? "Empty response from the server." : `Request failed (${res.status}).`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok
        ? "The server returned an unexpected response."
        : `Request failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }
}

/** Shape most API routes in this app use for their error responses. */
export interface ApiErrorBody {
  error?: string;
}

/**
 * `readJsonSafe` + the "if (!res.ok) throw new Error(json.error ?? fallback)"
 * pattern every panel repeats — one place for it.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackErrorMessage: string,
): Promise<T> {
  const res = await fetch(input, init);
  const json = await readJsonSafe<T & ApiErrorBody>(res);
  if (!res.ok) {
    throw new Error(json.error ?? fallbackErrorMessage);
  }
  return json;
}
