import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import districtPolygons from '../data/districtPolygons.json';
import mitaData from '../data/mitaData.json';
import { colors } from '../colors';

// Fix for default marker icons in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Key locations
const locations = [
  {
    name: 'Potosi',
    coords: [-19.5836, -65.7531] as [number, number],
    description: 'Silver mines - Primary destination for mita laborers. One of the largest silver deposits ever discovered.',
  },
  {
    name: 'Huancavelica',
    coords: [-12.7864, -74.9764] as [number, number],
    description: 'Mercury mines - Provided mercury for silver extraction. Extremely hazardous working conditions.',
  },
  {
    name: 'Cusco',
    coords: [-13.5319, -71.9675] as [number, number],
    description: 'Former Inca capital - Administrative center near the mita region.',
  },
];

interface DistrictPolygon {
  ubigeo: number;
  mita: number;
  polygon: [number, number][];
}

interface DistrictData {
  ubigeo: number;
  distance: number | null;
  isInside: boolean;
  consumption: number | null;
  stunting: number | null;
  roads: number | null;
  lat: number | null;
  lon: number | null;
}

interface MitaMapProps {
  showDistricts?: boolean;
}

// Component to fit bounds
const FitBounds: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    // Invalidate size first (important for sticky containers)
    map.invalidateSize();

    // Fit to the district polygons
    const allPoints: [number, number][] = [];
    (districtPolygons as DistrictPolygon[]).forEach(d => {
      d.polygon.forEach(p => allPoints.push(p));
    });
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    // Also refit after a short delay to handle sticky container issues
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

// Pre-calculated bounds from the district polygons
const PERU_BOUNDS: L.LatLngBoundsExpression = [
  [-16.5, -74.6], // Southwest corner
  [-12.9, -69.9], // Northeast corner
];

const MitaMap: React.FC<MitaMapProps> = ({ showDistricts = true }) => {
  const center: [number, number] = [-14.7, -72.2];

  // Create a lookup for outcome data
  const outcomeData = useMemo(() => {
    const lookup: Record<number, DistrictData> = {};
    (mitaData as DistrictData[]).forEach(d => {
      lookup[d.ubigeo] = d;
    });
    return lookup;
  }, []);

  const districts = districtPolygons as DistrictPolygon[];
  const mitaDistricts = districts.filter(d => d.mita === 1);
  const nonMitaDistricts = districts.filter(d => d.mita === 0);
  const mitaCount = mitaDistricts.length;
  const nonMitaCount = nonMitaDistricts.length;

  // For simplified view: collect all mita polygons as a single region
  const allMitaPolygons = mitaDistricts.map(d => d.polygon);
  const allNonMitaPolygons = nonMitaDistricts.map(d => d.polygon);

  return (
    <div className="mita-map">
      <h3 className="chart-title">The mita boundary</h3>
      <MapContainer
        bounds={PERU_BOUNDS}
        style={{ height: '400px', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds />

        {/* Simplified view: show mita region as unified areas */}
        {!showDistricts && (
          <>
            {/* Non-mita region (rendered first, behind) */}
            {allNonMitaPolygons.map((polygon, index) => (
              <Polygon
                key={`nonmita-${index}`}
                positions={polygon}
                pathOptions={{
                  color: colors.nonmita,
                  fillColor: colors.nonmitaLight,
                  fillOpacity: 0.4,
                  weight: 0,
                }}
              />
            ))}
            {/* Mita region - dark slate to match intro */}
            {allMitaPolygons.map((polygon, index) => (
              <Polygon
                key={`mita-${index}`}
                positions={polygon}
                pathOptions={{
                  color: '#1A202C',
                  fillColor: '#222939',  // Match intro background
                  fillOpacity: 0.85,
                  weight: 0,
                }}
              />
            ))}
          </>
        )}

        {/* Detailed view: show individual districts */}
        {showDistricts && districts.map((d, index) => {
          const data = outcomeData[d.ubigeo];
          const isMita = d.mita === 1;

          return (
            <Polygon
              key={index}
              positions={d.polygon}
              pathOptions={{
                color: isMita ? '#1A202C' : colors.nonmita,
                fillColor: isMita ? '#222939' : colors.nonmitaLight,
                fillOpacity: isMita ? 0.85 : 0.5,
                weight: 1,
              }}
            >
              <Popup>
                <strong>District {d.ubigeo || 'Unknown'}</strong>
                <br />
                <span style={{ color: isMita ? colors.mita : colors.nonmita, fontWeight: 'bold' }}>
                  {isMita ? 'Mita district' : 'Non-mita district'}
                </span>
                {data && (
                  <>
                    <br />
                    Distance to boundary: {Math.abs(data.distance || 0).toFixed(1)} km
                    {data.consumption && (
                      <>
                        <br />
                        Log consumption: {data.consumption.toFixed(3)}
                      </>
                    )}
                    {data.stunting && (
                      <>
                        <br />
                        Stunting rate: {(data.stunting * 100).toFixed(1)}%
                      </>
                    )}
                  </>
                )}
              </Popup>
            </Polygon>
          );
        })}

        {/* Key locations */}
        {locations.map((loc) => (
          <Marker key={loc.name} position={loc.coords}>
            <Popup>
              <strong>{loc.name}</strong>
              <br />
              {loc.description}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-color mita-region"></span>
          <span>Mita region</span>
        </div>
        <div className="legend-item">
          <span className="legend-color outside-region"></span>
          <span>Non-mita region</span>
        </div>
      </div>

      <div className="map-annotation">
        <p>
          <strong>The mita catchment area:</strong> The red region shows where indigenous
          communities had to send workers to the mines. The gray region shows neighboring
          areas that escaped the labor draft.
        </p>
      </div>
    </div>
  );
};

export default MitaMap;
