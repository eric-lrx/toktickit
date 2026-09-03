import { ReactNode } from "react";

export type BadgeTone = "neutral" | "pale" | "warning" | "danger" | "success";

interface Props {
  tone: BadgeTone;
  children: ReactNode;
}

// Zen Green badge — ui-spec.md §5. Text is always visible; color never carries
// meaning alone (Requested Priority, Current Status).
export default function Badge({ tone, children }: Props) {
  return <span className={`badge-${tone}`}>{children}</span>;
}
