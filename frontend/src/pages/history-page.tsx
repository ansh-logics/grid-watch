import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { HistoryTable } from "../components/history/history-table";
import { EmptyState } from "../components/shared/empty-state";
import { ErrorState } from "../components/shared/error-state";
import { PageHeader } from "../components/shared/page-header";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { getSensorHistory } from "../services/api/history";
import { queryKeys } from "../utils/query-keys";

const LIMIT = 100;

function defaultFrom() {
  const d = new Date(Date.now() - 1000 * 60 * 60 * 24);
  return d.toISOString().slice(0, 16);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 16);
}

export function HistoryPage() {
  const [sensorId, setSensorId] = useState("");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [page, setPage] = useState(0);
  const debouncedSensor = useDebouncedValue(sensorId, 350);

  const query = useQuery({
    queryKey: queryKeys.history(debouncedSensor, from, to, page, LIMIT),
    queryFn: () =>
      getSensorHistory({
        sensorId: debouncedSensor,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        limit: LIMIT,
        page,
      }),
    enabled: Boolean(debouncedSensor),
  });

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);

  return (
    <div className="space-y-4">
      <PageHeader title="Historical Data" subtitle="Query large reading datasets with anomaly-aware rows." />

      <div className="grid gap-3 rounded-md border p-4 md:grid-cols-4">
        <Input value={sensorId} placeholder="Sensor ID" onChange={(e) => setSensorId(e.target.value)} />
        <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((prev) => prev - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={(query.data?.pagination.count ?? 0) < LIMIT}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {query.isError ? (
        <ErrorState message={(query.error as Error).message} />
      ) : query.isLoading ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">Loading history...</div>
      ) : !debouncedSensor ? (
        <EmptyState message="Enter a sensor ID to query history." />
      ) : !rows.length ? (
        <EmptyState message="No historical rows in selected range." />
      ) : (
        <HistoryTable rows={rows} />
      )}
    </div>
  );
}
