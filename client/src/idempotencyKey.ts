import { useRef } from "react";

// BR-28 — one key per form submission: kept for a retry after a failure (so
// a request that did reach the server is replayed, not duplicated), replaced
// after a success so the next submission is a new record.
export function useIdempotencyKey() {
  const ref = useRef<string | null>(null);
  return {
    current(): string {
      if (!ref.current) ref.current = crypto.randomUUID();
      return ref.current;
    },
    rotate() {
      ref.current = null;
    },
  };
}
