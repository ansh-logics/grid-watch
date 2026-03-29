export const queryKeys = {
  sensors: (zoneId: string) => ["sensors", zoneId] as const,
  sensorDetail: (sensorId: string) => ["sensor-detail", sensorId] as const,
  alerts: (zoneId: string, page: number, status: string, severity: string) =>
    ["alerts", zoneId, page, status, severity] as const,
  history: (sensorId: string, from: string, to: string, page: number, limit: number) =>
    ["history", sensorId, from, to, page, limit] as const,
};
