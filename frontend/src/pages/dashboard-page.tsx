import { useQuery } from "@tanstack/react-query";
import { Signal } from "lucide-react";
import { SensorGrid } from "../components/sensors/sensor-grid";
import { ErrorState } from "../components/shared/error-state";
import { PageHeader } from "../components/shared/page-header";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { useZoneSSE } from "../hooks/use-zone-sse";
import { getZoneSensors } from "../services/api/sensors";
import type { Sensor } from "../types/domain";
import { getAuthContext } from "../utils/auth";
import { queryKeys } from "../utils/query-keys";

export function DashboardPage() {
  const { zoneId } = getAuthContext();
  const sensorsQuery = useQuery({
    queryKey: queryKeys.sensors(zoneId),
    queryFn: () => getZoneSensors(zoneId),
  });
  const { connected, lastError } = useZoneSSE(zoneId);
  const sensors = sensorsQuery.data || ([] as Sensor[]);

  return (
    <div>
      <PageHeader
        title="Live Sensor Dashboard"
        subtitle={`Operators zone: ${zoneId}`}
        right={
          <Badge className={connected ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}>
            {connected ? "SSE connected" : "Reconnecting"}
          </Badge>
        }
      />
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
        <SensorGrid sensors={sensors} isLoading={sensorsQuery.isLoading} />
      )}
    </div>
  );
}
