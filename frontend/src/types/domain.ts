export type SensorState = "healthy" | "warning" | "critical" | "silent";
export type AlertSeverity = "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface Sensor {
  sensor_id: string;
  zone_id: string;
  state: SensorState;
  last_seen_at?: string;
}

export interface Alert {
  id: string;
  sensor_id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: string;
}

export interface SensorReading {
  id: string;
  sensor_id: string;
  reading_type?: string;
  reading_value?: number;
  is_anomaly: boolean;
  linked_alert_id?: string | null;
  timestamp: string;
}

export interface SensorDetail {
  sensor: Sensor;
  recentReadings: SensorReading[];
  anomalies: SensorReading[];
  suppression: {
    active: boolean;
    startTime?: string;
    endTime?: string;
  };
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}
