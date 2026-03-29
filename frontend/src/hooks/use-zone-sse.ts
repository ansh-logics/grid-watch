import { fetchEventSource } from "@microsoft/fetch-event-source";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Sensor } from "../types/domain";
import { getAuthContext } from "../utils/auth";
import { queryKeys } from "../utils/query-keys";
import { getApiBaseUrl } from "../services/api/client";

interface ZoneEvent {
  eventId?: string;
  sensor_id: string;
  state: Sensor["state"];
  zone_id?: string;
  timestamp?: string;
}

export function useZoneSSE(zoneId: string) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string>("");
  const seenEventIds = useRef<Set<string>>(new Set());
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const auth = getAuthContext();
    const controller = new AbortController();
    controllerRef.current = controller;

    const headers: Record<string, string> = {};
    if (auth.jwt) {
      headers.Authorization = `Bearer ${auth.jwt}`;
    } else {
      headers["x-user-id"] = auth.userId;
      headers["x-zone-id"] = auth.zoneId;
    }

    fetchEventSource(`${getApiBaseUrl()}/events/zone/${zoneId}`, {
      method: "GET",
      headers,
      signal: controller.signal,
      openWhenHidden: true,
      onopen: async () => {
        setConnected(true);
        setLastError("");
      },
      onclose: () => {
        setConnected(false);
      },
      onerror: (err) => {
        setConnected(false);
        setLastError(err instanceof Error ? err.message : "Connection dropped");
        throw err;
      },
      onmessage: (ev) => {
        if (!ev.data || ev.data.startsWith(":")) return;
        try {
          const payload = JSON.parse(ev.data) as ZoneEvent;
          const eventId =
            payload.eventId ||
            `${payload.sensor_id}:${payload.timestamp || ""}:${payload.state}`;
          if (seenEventIds.current.has(eventId)) return;
          seenEventIds.current.add(eventId);
          if (seenEventIds.current.size > 5000) {
            seenEventIds.current = new Set(Array.from(seenEventIds.current).slice(-2500));
          }

          queryClient.setQueryData<Sensor[]>(queryKeys.sensors(zoneId), (current = []) => {
            const index = current.findIndex((sensor) => sensor.sensor_id === payload.sensor_id);
            if (index === -1) {
              return [
                {
                  sensor_id: payload.sensor_id,
                  zone_id: payload.zone_id || zoneId,
                  state: payload.state,
                  last_seen_at: payload.timestamp || new Date().toISOString(),
                },
                ...current,
              ];
            }
            const previous = current[index];
            if (previous.state === payload.state) {
              return current;
            }
            const next = [...current];
            next[index] = {
              ...previous,
              state: payload.state,
              last_seen_at: payload.timestamp || new Date().toISOString(),
            };
            return next;
          });
        } catch {
          // Drop malformed events, stream remains alive.
        }
      },
    }).catch(() => {
      // Reconnect is automatically handled by fetch-event-source retries.
    });

    return () => {
      controller.abort();
      setConnected(false);
    };
  }, [queryClient, zoneId]);

  return { connected, lastError };
}
