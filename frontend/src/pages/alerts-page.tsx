import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertsFilters, AlertsTable } from "../components/alerts/alerts-table";
import { EmptyState } from "../components/shared/empty-state";
import { ErrorState } from "../components/shared/error-state";
import { PageHeader } from "../components/shared/page-header";
import { Button } from "../components/ui/button";
import { getAlerts, updateAlertStatus } from "../services/api/alerts";
import type { AlertStatus } from "../types/domain";
import { getAuthContext } from "../utils/auth";
import { queryKeys } from "../utils/query-keys";

const PAGE_SIZE = 20;

export function AlertsPage() {
  const { zoneId } = getAuthContext();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const queryClient = useQueryClient();

  const alertsQuery = useQuery({
    queryKey: queryKeys.alerts(zoneId, page, status, severity),
    queryFn: () => getAlerts({ zoneId, page, limit: PAGE_SIZE, status, severity }),
  });

  const mutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: AlertStatus }) => updateAlertStatus(id, next),
    onSuccess: () => {
      toast.success("Alert status updated");
      void queryClient.invalidateQueries({ queryKey: ["alerts", zoneId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Alerts" subtitle="Monitor and action open alerts in real time." />
      <AlertsFilters status={status} severity={severity} onStatusChange={setStatus} onSeverityChange={setSeverity} />
      {alertsQuery.isError ? (
        <ErrorState message={(alertsQuery.error as Error).message} />
      ) : alertsQuery.isLoading ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">Loading alerts...</div>
      ) : alertsQuery.data?.data.length ? (
        <AlertsTable
          alerts={alertsQuery.data.data}
          pending={mutation.isPending}
          onTransition={(id, next) => mutation.mutate({ id, next })}
        />
      ) : (
        <EmptyState message="No active alerts - system is currently healthy." />
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage((prev) => prev - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={(alertsQuery.data?.pagination.count ?? 0) < PAGE_SIZE}
          onClick={() => setPage((prev) => prev + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
