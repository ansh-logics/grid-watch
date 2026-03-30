import type { PaginatedResult, SensorReading } from "../../types/domain";
import { apiRequest } from "./client";

interface HistoryParams {
  sensorId: string;
  from: string;
  to: string;
  limit: number;
  page: number;
}

interface HistoryApiAnomaly {
  alert_id?: string | null;
}

interface HistoryApiRow {
  reading_id: string;
  timestamp: string;
  voltage: string | number;
  anomalies: HistoryApiAnomaly[] | null;
}

export async function getSensorHistory(params: HistoryParams) {
  const offset = params.page * params.limit;
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    limit: String(params.limit),
    offset: String(offset),
  });

  const response = await apiRequest<PaginatedResult<HistoryApiRow>>(
    `/sensors/${encodeURIComponent(params.sensorId)}/history?${query.toString()}`
  );

  const normalized: PaginatedResult<SensorReading> = {
    ...response,
    data: response.data.map((row) => {
      const anomalies = Array.isArray(row.anomalies) ? row.anomalies : [];
      return {
        id: row.reading_id,
        sensor_id: params.sensorId,
        timestamp: row.timestamp,
        reading_type: "voltage",
        reading_value: Number(row.voltage),
        is_anomaly: anomalies.length > 0,
        linked_alert_id: anomalies.find((a) => a.alert_id)?.alert_id ?? null,
      };
    }),
  };

  return normalized;
}
