import { nanoid } from "nanoid";

/** Stable-enough short id for a finding — matches the shape of the old
 * Python service's `uuid.uuid4().hex[:12]` (12 lowercase hex/alnum chars). */
export function newFindingId(): string {
  return nanoid(12);
}
