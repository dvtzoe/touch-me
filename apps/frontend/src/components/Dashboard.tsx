"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const WS_URL = "ws://localhost:8000/ws";
const MAX_POINTS = 200;

interface SensorData {
  touch_value: number;
  voltage: number;
}

interface DataPoint extends SensorData {
  index: number;
}

type ConnectionState = "connecting" | "connected" | "disconnected";

export default function Dashboard() {
  const [data, setData] = useState<DataPoint[]>([]);
  const [latest, setLatest] = useState<SensorData | null>(null);
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [threshold, setThreshold] = useState(20);
  const wsRef = useRef<WebSocket | null>(null);
  const indexRef = useRef(0);

  const connect = useCallback(() => {
    setConnState("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnState("connected");

    ws.onmessage = (e) => {
      const d: SensorData = JSON.parse(e.data);
      setLatest(d);
      setData((prev) => {
        const next = [
          ...prev,
          { ...d, index: indexRef.current++ },
        ].slice(-MAX_POINTS);
        return next;
      });
    };

    ws.onclose = () => {
      setConnState("disconnected");
      setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const isTouched = latest !== null && latest.touch_value < threshold;

  const touchedRegions = data.reduce<{ start: number; end: number }[]>(
    (acc, point) => {
      const touched = point.touch_value < threshold;
      if (touched) {
        const last = acc[acc.length - 1];
        if (last && last.end === point.index - 1) {
          last.end = point.index;
        } else {
          acc.push({ start: point.index, end: point.index });
        }
      }
      return acc;
    },
    []
  );

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Touch Sensor Monitor
        </h1>
        <Badge
          variant={
            connState === "connected"
              ? "default"
              : connState === "connecting"
              ? "secondary"
              : "destructive"
          }
        >
          {connState === "connected"
            ? "● Connected"
            : connState === "connecting"
            ? "⟳ Connecting…"
            : "✕ Disconnected"}
        </Badge>
      </div>

      {/* Threshold control */}
      <div className="flex items-center gap-3 text-sm">
        <label htmlFor="threshold" className="text-muted-foreground">
          Touch Threshold:
        </label>
        <input
          id="threshold"
          type="number"
          min={0}
          max={100}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value) || 20)}
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-muted-foreground text-xs">
          (touched when value &lt; threshold)
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Touch Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${
                latest === null
                  ? "text-muted-foreground"
                  : isTouched
                  ? "text-green-500"
                  : "text-muted-foreground"
              }`}
            >
              {latest === null ? "--" : isTouched ? "TOUCHED" : "NOT TOUCHED"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Touch Value (raw)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-sky-400">
              {latest?.touch_value ?? "--"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Voltage (Pin 35)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-400">
              {latest ? `${latest.voltage.toFixed(3)} V` : "-- V"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Voltage chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Voltage over time
            <span className="ml-4 text-xs font-normal text-muted-foreground">
              <span className="inline-block w-3 h-3 bg-green-500/30 rounded-sm mr-1" />
              shaded = touched
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="index" hide />
              <YAxis domain={[0, 3.3]} tickCount={5} tickFormatter={(v) => `${v.toFixed(1)}V`} className="text-xs fill-muted-foreground" />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                labelFormatter={() => ""}
                formatter={(v: number) => [`${v.toFixed(3)} V`, "Voltage"]}
              />
              {touchedRegions.map((r) => (
                <ReferenceArea
                  key={r.start}
                  x1={r.start}
                  x2={r.end}
                  fill="rgba(34,197,94,0.15)"
                  strokeOpacity={0}
                />
              ))}
              <Line
                type="monotone"
                dataKey="voltage"
                stroke="#facc15"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Made by CE31, CE39 &amp; CE42
      </p>
    </div>
  );
}
