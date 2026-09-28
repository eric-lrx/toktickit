import { Link } from "react-router-dom";
import { DashboardMetric } from "../api.js";

export function drillDownHref(drillDown: DashboardMetric["drillDown"]): string {
  if (!drillDown.query) return drillDown.path;
  return `${drillDown.path}?${new URLSearchParams(drillDown.query).toString()}`;
}

// ui-spec.md §2 — the whole card is one link whose accessible name carries
// the label, the count, and the destination; the count is a number, never a
// color. An in-page drill-down ("#…") stays a plain anchor.
export default function MetricCard({ metric, emphasis = false }: { metric: DashboardMetric; emphasis?: boolean }) {
  const href = drillDownHref(metric.drillDown);
  const body = (
    <>
      <span className="zg-metric-label">{metric.label}</span>
      <span className="zg-metric-count">{metric.count}</span>
      <span className="zg-metric-link" aria-hidden="true">
        View all
      </span>
    </>
  );
  const className = `zg-metric-card${emphasis && metric.count > 0 ? " zg-metric-card-warning" : ""}`;
  const label = `${metric.label}: ${metric.count}, view all`;
  return href.startsWith("#") ? (
    <a href={href} className={className} aria-label={label}>
      {body}
    </a>
  ) : (
    <Link to={href} className={className} aria-label={label}>
      {body}
    </Link>
  );
}
