import type { PaginatedResult, SensorReading } from "../../types/domain";
import { apiRequest } from "./client";

interface HistoryParams {
  sensorId: string;
  from: string;
  to: string;
  limit: number;
  page: number;
}

export async function getSensorHistory(params: HistoryParams) {
  const offset = params.page * params.limit;
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    limit: String(params.limit),
    offset: String(offset),
  });

  return apiRequest<PaginatedResult<SensorReading>>(
    `/sensors/${encodeURIComponent(params.sensorId)}/history?${query.toString()}`
  );
}
