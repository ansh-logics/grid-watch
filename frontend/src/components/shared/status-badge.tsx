import type { AlertSeverity, AlertStatus, SensorState } from "../../types/domain";
import { Badge } from "../ui/badge";

type StatusBadgeType = SensorState | AlertSeverity | AlertStatus;

const mapping: Record<StatusBadgeType, string> = {
  healthy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  silent: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  open: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  acknowledged: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
};

export function StatusBadge({ value }: { value: StatusBadgeType }) {
  return <Badge className={mapping[value]}>{value}</Badge>;
}
