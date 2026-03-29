import { apiRequest } from "./client";

export async function suppressSensor(sensorId: string, startTime: string, endTime: string) {
  return apiRequest<{ id: string; message: string }>(`/sensors/${encodeURIComponent(sensorId)}/suppress`, {
    method: "POST",
    body: JSON.stringify({ startTime, endTime }),
  });
}
