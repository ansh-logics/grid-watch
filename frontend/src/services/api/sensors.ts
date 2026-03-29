import type { Sensor, SensorDetail } from "../../types/domain";
import { apiRequest } from "./client";

export async function getZoneSensors(zoneId: string): Promise<Sensor[]> {
  return apiRequest<Sensor[]>(`/sensors?zoneId=${encodeURIComponent(zoneId)}`);
}

export async function getSensorDetail(sensorId: string): Promise<SensorDetail> {
  return apiRequest<SensorDetail>(`/sensors/${encodeURIComponent(sensorId)}`);
}
