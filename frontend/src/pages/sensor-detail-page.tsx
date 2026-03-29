import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState } from "../components/shared/empty-state";
import { ErrorState } from "../components/shared/error-state";
import { PageHeader } from "../components/shared/page-header";
import { StatusBadge } from "../components/shared/status-badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { getSensorDetail } from "../services/api/sensors";
import { suppressSensor } from "../services/api/suppression";
import { queryKeys } from "../utils/query-keys";

export function SensorDetailPage() {
  const { sensorId = "" } = useParams();
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const detailQuery = useQuery({
    queryKey: queryKeys.sensorDetail(sensorId),
    queryFn: () => getSensorDetail(sensorId),
    enabled: Boolean(sensorId),
  });

  const suppressMutation = useMutation({
    mutationFn: () => suppressSensor(sensorId, startTime, endTime),
    onSuccess: () => toast.success("Suppression window applied"),
    onError: (error: Error) => toast.error(error.message),
  });

  const suppressionValid = useMemo(() => Boolean(startTime && endTime && endTime > startTime), [endTime, startTime]);

  if (detailQuery.isError) return <ErrorState message={(detailQuery.error as Error).message} />;
  if (detailQuery.isLoading) return <div className="rounded-md border p-6 text-sm text-muted-foreground">Loading...</div>;
  if (!detailQuery.data) return <EmptyState message="Sensor not found." />;

  const { sensor, recentReadings, anomalies, suppression } = detailQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader title={`Sensor ${sensor.sensor_id}`} subtitle="Current status, recent readings and active suppressions." />
      <Card>
        <CardHeader>
          <CardTitle>Current State</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <StatusBadge value={sensor.state} />
          <span className="text-sm text-muted-foreground">
            Suppression: {suppression.active ? `Active until ${suppression.endTime}` : "Not active"}
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Readings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentReadings.slice(0, 10).map((reading) => (
              <div key={reading.id} className="flex justify-between rounded-md border p-2 text-sm">
                <span>{new Date(reading.timestamp).toLocaleString()}</span>
                <span>{reading.reading_value ?? "-"}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anomalies Triggered</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {anomalies.length === 0 ? (
              <EmptyState message="No recent anomalies." />
            ) : (
              anomalies.slice(0, 10).map((anomaly) => (
                <div key={anomaly.id} className="flex items-center justify-between rounded-md border border-amber-500/30 p-2 text-sm">
                  <span>{new Date(anomaly.timestamp).toLocaleString()}</span>
                  <StatusBadge value="warning" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suppress Alerts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <Button disabled={!suppressionValid || suppressMutation.isPending} onClick={() => suppressMutation.mutate()}>
            Apply Suppression
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
