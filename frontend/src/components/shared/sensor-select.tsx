import type { Sensor } from "../../types/domain";
import { Select } from "../ui/select";

export function SensorSelect({
  sensors,
  value,
  onChange,
  className,
}: {
  sensors: Sensor[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {sensors.map((sensor) => (
        <option key={sensor.sensor_id} value={sensor.sensor_id}>
          {sensor.sensor_id} ({sensor.zone_id})
        </option>
      ))}
    </Select>
  );
}
