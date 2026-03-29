import type { Sensor } from "../../types/domain";
import { EmptyState } from "../shared/empty-state";
import { Skeleton } from "../ui/skeleton";
import { SensorCard } from "./sensor-card";

export function SensorGrid({
  sensors,
  isLoading,
  recentlyUpdatedSensorId,
}: {
  sensors: Sensor[];
  isLoading: boolean;
  recentlyUpdatedSensorId?: string;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-[120px]" />
        ))}
      </div>
    );
  }

  if (!sensors.length) {
    return <EmptyState message="No sensors found for this zone." />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {sensors.map((sensor) => (
        <SensorCard
          key={sensor.sensor_id}
          sensor={sensor}
          isRecentlyUpdated={recentlyUpdatedSensorId === sensor.sensor_id}
        />
      ))}
    </div>
  );
}
