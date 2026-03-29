import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { SensorReading } from "../../types/domain";
import { StatusBadge } from "../shared/status-badge";

export function HistoryTable({ rows }: { rows: SensorReading[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-5 border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <div>Timestamp</div>
        <div>Value</div>
        <div>Type</div>
        <div>Anomaly</div>
        <div>Linked Alert</div>
      </div>
      <div ref={parentRef} className="max-h-[520px] overflow-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                key={row.id}
                className={`grid grid-cols-5 border-b px-3 py-2 text-sm ${row.is_anomaly ? "bg-amber-500/10" : ""}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div>{new Date(row.timestamp).toLocaleString()}</div>
                <div>{row.reading_value ?? "-"}</div>
                <div>{row.reading_type ?? "-"}</div>
                <div>{row.is_anomaly ? <StatusBadge value="warning" /> : "-"}</div>
                <div>{row.linked_alert_id ?? "-"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
