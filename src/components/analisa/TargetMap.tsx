import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  lat: number;
  long: number;
  label: string;
  kind: "cp" | "convertBTS" | "closestBTS";
};

// Ganti path default marker Leaflet (assets tidak ter-bundle otomatis di TanStack).
const DEFAULT_ICON = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const COLOR: Record<MapPoint["kind"], string> = {
  cp: "#00e5ff",
  convertBTS: "#f59e0b",
  closestBTS: "#a855f7",
};

function coloredIcon(kind: MapPoint["kind"]): L.DivIcon {
  const c = COLOR[kind];
  return L.divIcon({
    className: "",
    html: `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${c};border:2px solid #04070d;box-shadow:0 0 10px ${c}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function TargetMap({ points, height = 320 }: { points: MapPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const key = useMemo(
    () => points.map((p) => `${p.id}:${p.lat.toFixed(4)},${p.long.toFixed(4)}`).join("|"),
    [points],
  );

  useEffect(() => {
    if (!ref.current) return;
    if (!mapRef.current) {
      // Bounds default: Indonesia (Sabang → Merauke)
      const map = L.map(ref.current, { attributionControl: false, zoomControl: true });
      map.fitBounds([[-11, 95], [6, 141]]);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      L.control.attribution({ position: "bottomright", prefix: false }).addAttribution("© OSM").addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
    }
    // Refresh markers
    const layer = layerRef.current!;
    layer.clearLayers();

    if (points.length > 0) {
      const latlngs: L.LatLngExpression[] = [];
      for (const p of points) {
        const marker = L.marker([p.lat, p.long], { icon: coloredIcon(p.kind) }).bindPopup(
          `<div style="font-family:monospace;font-size:11px"><b>${p.label}</b><br/>${p.lat.toFixed(5)}, ${p.long.toFixed(5)}</div>`,
        );
        marker.addTo(layer);
        latlngs.push([p.lat, p.long]);
      }
      if (latlngs.length > 1) {
        L.polyline(latlngs, { color: "#00e5ff", weight: 1.5, opacity: 0.6, dashArray: "4 4" }).addTo(layer);
      }
      if (latlngs.length === 1) {
        mapRef.current!.setView(latlngs[0], 13);
      } else {
        mapRef.current!.fitBounds(L.latLngBounds(latlngs).pad(0.25));
      }
    }
    // Suppress "unused" lint for DEFAULT_ICON in tree-shakers
    void DEFAULT_ICON;
  }, [key, points]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  return (
    <div className="panel-frame rounded-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cyber/30 bg-panel-elevated/60">
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyber text-glow">Peta Target · Indonesia</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">{points.length} titik</span>
      </div>
      <div ref={ref} style={{ height }} className="w-full bg-[#04070d]" />
      <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-border text-[10px] font-mono">
        <Legend color={COLOR.cp} label="/cp lokasi" />
        <Legend color={COLOR.convertBTS} label="/convertBTS" />
        <Legend color={COLOR.closestBTS} label="/closestBTS" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span style={{ background: color, boxShadow: `0 0 8px ${color}` }} className="inline-block w-2.5 h-2.5 rounded-full" />
      {label}
    </span>
  );
}
