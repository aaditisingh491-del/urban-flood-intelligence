import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  risk: number;
  coordinates?: { latitude: number; longitude: number } | null;
  onSelect?: () => void;
  municipality?: boolean;
};

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

export default function InteractiveMap({ risk, coordinates, onSelect, municipality = false }: Props) {
  const center: LatLngExpression = coordinates
    ? [coordinates.latitude, coordinates.longitude]
    : [12.9716, 77.5946];
  const color = risk >= 85 ? '#d85b58' : risk >= 60 ? '#e98570' : risk >= 40 ? '#e2b56e' : '#73b892';

  return (
    <div className="interactive-map-wrap">
      <MapContainer center={center} zoom={13} scrollWheelZoom zoomControl className="interactive-map" aria-label="Interactive Bengaluru street map">
        <ResizeMap />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {!municipality && coordinates && (
          <CircleMarker
            center={center}
            radius={10}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 3 }}
            eventHandlers={{ click: () => onSelect?.() }}
          >
            <Popup>
              <strong>Backend demo risk point</strong><br />
              {risk}% sample risk<br />
              {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>
      <div className="map-data-note" role="note">
        {municipality
          ? 'Hotspot records have no coordinates in the current API. Map is interactive; no hotspot locations are inferred.'
          : coordinates
            ? 'One backend-provided coordinate · selected sample locations are not geocoded · not live flood observations'
            : 'Risk API coordinates unavailable · sample map view only'}
      </div>
    </div>
  );
}
