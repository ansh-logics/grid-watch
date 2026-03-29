import type { Alert, AlertStatus, PaginatedResult } from "../../types/domain";
import { apiRequest } from "./client";

interface AlertsParams {
  zoneId: string;
  page: number;
  limit: number;
  status?: string;
  severity?: string;
}

export async function getAlerts(params: AlertsParams): Promise<PaginatedResult<Alert>> {
  const offset = params.page * params.limit;
  const query = new URLSearchParams({
    zoneId: params.zoneId,
    limit: String(params.limit),
    offset: String(offset),
  });
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.severity) {
    query.set("severity", params.severity);
  }
  return apiRequest<PaginatedResult<Alert>>(`/alerts?${query.toString()}`);
}

export async function updateAlertStatus(alertId: string, status: AlertStatus) {
  return apiRequest<{ message: string }>(`/alerts/${alertId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}
