import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import type { Alert, AlertStatus } from "../../types/domain";
import { StatusBadge } from "../shared/status-badge";

const validTransitions: Record<AlertStatus, AlertStatus[]> = {
  open: ["acknowledged", "resolved"],
  acknowledged: ["resolved"],
  resolved: [],
};

export function AlertsTable({
  alerts,
  onTransition,
  pending,
}: {
  alerts: Alert[];
  onTransition: (id: string, next: AlertStatus) => void;
  pending: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sensor</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Timestamp</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert) => {
          const transitions = validTransitions[alert.status];
          return (
            <TableRow key={alert.id} className={alert.severity === "critical" ? "bg-red-500/5" : ""}>
              <TableCell>{alert.sensor_id}</TableCell>
              <TableCell>
                <StatusBadge value={alert.severity} />
              </TableCell>
              <TableCell>
                <StatusBadge value={alert.status} />
              </TableCell>
              <TableCell>{new Date(alert.timestamp).toLocaleString()}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!transitions.includes("acknowledged") || pending}
                  onClick={() => onTransition(alert.id, "acknowledged")}
                >
                  Acknowledge
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!transitions.includes("resolved") || pending}
                  onClick={() => onTransition(alert.id, "resolved")}
                >
                  Resolve
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function AlertsFilters({
  status,
  severity,
  onStatusChange,
  onSeverityChange,
}: {
  status: string;
  severity: string;
  onStatusChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Select value={status} onChange={(e) => onStatusChange(e.target.value)} className="w-44">
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="acknowledged">Acknowledged</option>
        <option value="resolved">Resolved</option>
      </Select>
      <Select value={severity} onChange={(e) => onSeverityChange(e.target.value)} className="w-44">
        <option value="">All severity</option>
        <option value="warning">Warning</option>
        <option value="critical">Critical</option>
      </Select>
    </div>
  );
}
