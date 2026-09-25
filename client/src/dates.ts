// specification.md §11 — APP_TIMEZONE is a display setting only; every
// stored date is UTC and no calculation depends on it.
export const APP_TIMEZONE = "Asia/Bangkok";

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: APP_TIMEZONE, dateStyle: "medium", timeStyle: "short" });
}

// <input type="datetime-local"> works in the browser's local time; these two
// helpers convert between that and the ISO strings the API uses.
export function toDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInput(value: string): string {
  return new Date(value).toISOString();
}
