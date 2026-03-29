import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Signal } from "lucide-react";
import { SensorSelect } from "../components/shared/sensor-select";
import { SensorGrid } from "../components/sensors/sensor-grid";
import { ErrorState } from "../components/shared/error-state";
import { PageHeader } from "../components/shared/page-header";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { useZoneSSE } from "../hooks/use-zone-sse";
import { getZoneSensors } from "../services/api/sensors";
import type { Sensor } from "../types/domain";
import { getAuthContext } from "../utils/auth";
import { queryKeys } from "../utils/query-keys";

export function DashboardPage() {
  const { zoneId } = getAuthContext();
  const navigate = useNavigate();
  const [manualSensorId, setManualSensorId] = useState("");
  const sensorsQuery = useQuery({
    queryKey: queryKeys.sensors(zoneId),
    queryFn: () => getZoneSensors(zoneId),
  });
  const { status, lastError, lastUpdatedSensorId } = useZoneSSE(zoneId);
  const sensors = sensorsQuery.data || ([] as Sensor[]);
  const selectedSensorId = manualSensorId || sensors[0]?.sensor_id || "";
  const selectedSensor = sensors.find((sensor) => sensor.sensor_id === selectedSensorId);

  return (
    <div>
      <PageHeader
        title="Live Sensor Dashboard"
        subtitle={`Operators zone: ${zoneId}`}
        right={
          <div className="flex items-center gap-2">
            <Badge
              className={
                status === "connected"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : status === "reconnecting"
                    ? "bg-amber-500/15 text-amber-700"
                    : "bg-slate-500/15 text-slate-700"
              }
            >
              {status === "connected" ? "Connected" : status === "reconnecting" ? "Reconnecting..." : "Disconnected"}
            </Badge>
          </div>
        }
      />
      {sensors.length > 0 ? (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-3 pt-5">
            <span className="text-sm text-muted-foreground">Select sensor</span>
            <SensorSelect
              sensors={sensors}
              value={selectedSensorId}
                onChange={setManualSensorId}
              className="w-[380px] max-w-full"
            />
            <Button
              variant="outline"
              disabled={!selectedSensor}
              onClick={() => selectedSensor && navigate(`/sensors/${selectedSensor.sensor_id}`)}
            >
              Open Detail
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {lastError ? (
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-2 pt-5 text-sm text-amber-700">
            <Signal className="h-4 w-4" />
            Stream unstable: {lastError}
          </CardContent>
        </Card>
      ) : null}

      {sensorsQuery.isError ? (
        <ErrorState message={(sensorsQuery.error as Error).message} />
      ) : (
        <SensorGrid sensors={sensors} isLoading={sensorsQuery.isLoading} recentlyUpdatedSensorId={lastUpdatedSensorId} />
      )}
    </div>
  );
}
