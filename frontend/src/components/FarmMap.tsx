import { CircleMarker, MapContainer, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import type { Preset } from "../types";

export interface Pin {
  lat: number;
  lon: number;
}

const LEAF = "#404f1d"; // --primary
const SUN = "#a9452c"; // --sun (Mars rust)

function ClickToPin({ onPick }: { onPick: (p: Pin) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return null;
}

export function FarmMap({
  presets,
  selectedId,
  pin,
  onSelectPreset,
  onPin,
}: {
  presets: Preset[];
  selectedId: string;
  pin: Pin | null;
  onSelectPreset: (id: string) => void;
  onPin: (p: Pin) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-input">
      <MapContainer center={[11.8, 123.4]} zoom={5} scrollWheelZoom={false} style={{ height: 180 }} aria-label="Map of the Philippines: tap your farm">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {presets.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={p.id === selectedId && !pin ? 9 : 7}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: LEAF, fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelectPreset(p.id) }}
          >
            <Tooltip direction="top">{p.name}</Tooltip>
          </CircleMarker>
        ))}
        {pin && (
          <CircleMarker center={[pin.lat, pin.lon]} radius={9} pathOptions={{ color: "#ffffff", weight: 2, fillColor: SUN, fillOpacity: 1 }}>
            <Tooltip direction="top" permanent>
              Your farm
            </Tooltip>
          </CircleMarker>
        )}
        <ClickToPin onPick={onPin} />
      </MapContainer>
    </div>
  );
}
