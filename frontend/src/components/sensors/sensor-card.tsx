import { memo } from "react";
import { Link } from "react-router-dom";
import type { Sensor } from "../../types/domain";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { StatusBadge } from "../shared/status-badge";

export const SensorCard = memo(function SensorCard({ sensor }: { sensor: Sensor }) {
  return (
    <Link to={`/sensors/${sensor.sensor_id}`}>
      <Card className="transition-all hover:border-primary/40 hover:shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{sensor.sensor_id}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <StatusBadge value={sensor.state} />
          <span className="text-xs text-muted-foreground">
            {sensor.last_seen_at ? new Date(sensor.last_seen_at).toLocaleTimeString() : "No signal"}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
});
