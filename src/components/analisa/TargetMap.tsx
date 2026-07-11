import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  lat: number;
  long: number;
  label: string;
  kind: "cp" | "convertBTS" | "closestBTS";
  /** Jarak titik BTS ke target (meter) — jika tersedia dari balasan bot. */
  distance_m?: number;
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
const ESTIMATE_COLOR = "#ef4444";

function coloredIcon(kind: MapPoint["kind"]): L.DivIcon {
  const c = COLOR[kind];
  return L.divIcon({
    className: "",
    html: `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${c};border:2px solid #04070d;box-shadow:0 0 10px ${c}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function estimateIcon(): L.DivIcon {
  const c = ESTIMATE_COLOR;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:28px;height:28px;">
      <span style="position:absolute;inset:0;border-radius:50%;background:${c};opacity:0.25;animation:pulse 1.6s ease-out infinite"></span>
      <span style="position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:${c};border:2px solid #04070d;box-shadow:0 0 14px ${c}"></span>
      <span style="position:absolute;top:11px;left:11px;width:6px;height:6px;border-radius:50%;background:#fff;"></span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Haversine (meter)
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s1 = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1));
}

function estimateTarget(points: MapPoint[]): { lat: number; long: number; radius: number; basis: string } | null {
  if (points.length === 0) return null;
  // Bobot: /cp paling tinggi (real-time), convertBTS menengah, closestBTS terendah.
  const weightOf = (k: MapPoint["kind"]) => (k === "cp" ? 4 : k === "convertBTS" ? 2 : 1);
  let sumW = 0, sumLat = 0, sumLng = 0;
  const parts: Record<string, number> = {};
  for (const p of points) {
    const w = weightOf(p.kind);
    sumW += w; sumLat += p.lat * w; sumLng += p.long * w;
    parts[p.kind] = (parts[p.kind] ?? 0) + 1;
  }
  const lat = sumLat / sumW;
  const long = sumLng / sumW;
  // Radius = jarak terjauh titik berbobot dari centroid (min 150m, cap 5km)
  let radius = 150;
  for (const p of points) {
    const d = haversine([lat, long], [p.lat, p.long]);
    if (d > radius) radius = d;
  }
  radius = Math.min(radius, 5000);
  const basis = Object.entries(parts).map(([k, n]) => `${n}×${k}`).join(" + ");
  return { lat, long, radius, basis };
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

    const estimate = estimateTarget(points);

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

      // Estimasi lokasi target (weighted centroid + accuracy circle)
      if (estimate) {
        L.circle([estimate.lat, estimate.long], {
          radius: estimate.radius,
          color: ESTIMATE_COLOR,
          weight: 1.5,
          opacity: 0.9,
          fillColor: ESTIMATE_COLOR,
          fillOpacity: 0.1,
          dashArray: "6 6",
        }).addTo(layer);
        L.marker([estimate.lat, estimate.long], { icon: estimateIcon(), zIndexOffset: 1000 })
          .bindPopup(
            `<div style="font-family:monospace;font-size:11px;min-width:180px">
              <b style="color:${ESTIMATE_COLOR}">ESTIMASI LOKASI TARGET</b><br/>
              ${estimate.lat.toFixed(5)}, ${estimate.long.toFixed(5)}<br/>
              Radius akurasi: ± ${estimate.radius < 1000 ? `${Math.round(estimate.radius)} m` : `${(estimate.radius / 1000).toFixed(2)} km`}<br/>
              <span style="opacity:0.7">Basis: ${estimate.basis}</span>
            </div>`,
            { autoClose: true, closeOnClick: true, closeButton: true, closeOnEscapeKey: true },
          )
          .addTo(layer);
        latlngs.push([estimate.lat, estimate.long]);
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

  const estimate = useMemo(() => estimateTarget(points), [points]);

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
      {estimate && (
        <div className="px-3 py-2 border-t border-destructive/30 bg-destructive/5 text-[10px] font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="uppercase tracking-widest" style={{ color: ESTIMATE_COLOR }}>◉ Estimasi Target</span>
          <span className="text-foreground">{estimate.lat.toFixed(5)}, {estimate.long.toFixed(5)}</span>
          <span className="text-muted-foreground">
            akurasi ± {estimate.radius < 1000 ? `${Math.round(estimate.radius)} m` : `${(estimate.radius / 1000).toFixed(2)} km`}
          </span>
          <span className="text-muted-foreground">· basis {estimate.basis}</span>
          <a
            href={`https://www.google.com/maps?q=${estimate.lat},${estimate.long}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-cyber hover:underline"
          >
            Buka di Google Maps ↗
          </a>
        </div>
      )}
      <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-border text-[10px] font-mono">
        <Legend color={COLOR.cp} label="/cp lokasi" />
        <Legend color={COLOR.convertBTS} label="/convertBTS" />
        <Legend color={COLOR.closestBTS} label="/closestBTS" />
        <Legend color={ESTIMATE_COLOR} label="Estimasi target" />
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

