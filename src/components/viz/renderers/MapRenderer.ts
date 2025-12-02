// Map rendering functions
import * as d3 from 'd3';
import { geoPath } from 'd3-geo';
import { colors } from '../../../colors';
import { MergedDistrictData, HighlightMode } from '../types';
import { OPACITY } from '../constants';

// Distance threshold for "boundary" districts (km)
const BOUNDARY_THRESHOLD = 10;
// Very close threshold for white stroke emphasis
const VERY_CLOSE_THRESHOLD = 5;

interface MapRenderParams {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  projection: d3.GeoProjection;
  mergedData: MergedDistrictData[];
  peruFeature: any;
  neighborFeatures: any[];
  currentZoom: number;
  polygonOpacity: number;
  borderOpacity: number;
  showDistricts: boolean;
  innerWidth: number;
  innerHeight: number;
  highlightMode?: HighlightMode;
  onHover?: (district: MergedDistrictData | null, event?: MouseEvent) => void;
}

export const renderMap = ({
  g,
  projection,
  mergedData,
  peruFeature,
  neighborFeatures,
  currentZoom,
  polygonOpacity,
  borderOpacity,
  showDistricts,
  innerWidth,
  innerHeight,
  highlightMode = 'none',
  onHover,
}: MapRenderParams): void => {
  const pathGenerator = geoPath().projection(projection);
  const z = currentZoom;

  // Draw South America map when zoomed out (z < 1)
  if (z < 1) {
    const mapOpacity = (1 - z);

    // Draw neighboring countries
    neighborFeatures.forEach((feature: any) => {
      g.append('path')
        .datum(feature)
        .attr('class', 'neighbor-country')
        .attr('d', pathGenerator as any)
        .attr('fill', colors.nonmitaLight)
        .attr('stroke', colors.nonmita)
        .attr('stroke-width', 0.5)
        .attr('opacity', mapOpacity * OPACITY.mapFade);
    });

    // Draw Peru outline
    g.append('path')
      .datum(peruFeature)
      .attr('class', 'peru-outline')
      .attr('d', pathGenerator as any)
      .attr('fill', colors.nonmitaLight)
      .attr('stroke', colors.nonmita)
      .attr('stroke-width', 1)
      .attr('opacity', mapOpacity * OPACITY.mapFade);

    // Add country labels
    renderCountryLabels(g, projection, peruFeature, neighborFeatures, mapOpacity, innerWidth, innerHeight);
  }

  // Draw districts
  renderDistricts(g, pathGenerator, mergedData, z, polygonOpacity, borderOpacity, showDistricts, highlightMode, onHover);
};

const renderCountryLabels = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  projection: d3.GeoProjection,
  peruFeature: any,
  neighborFeatures: any[],
  mapOpacity: number,
  innerWidth: number,
  innerHeight: number
): void => {
  const countryLabels = [
    { name: 'Peru', feature: peruFeature },
    ...neighborFeatures.map((f: any) => ({ name: f.properties?.name, feature: f }))
  ];

  countryLabels.forEach(({ name, feature }) => {
    if (!feature?.geometry) return;

    const centroid = d3.geoCentroid(feature.geometry);
    const projected = projection(centroid);

    if (projected && projected[0] > 0 && projected[0] < innerWidth &&
        projected[1] > 0 && projected[1] < innerHeight) {
      g.append('text')
        .attr('class', 'country-label')
        .attr('x', projected[0])
        .attr('y', projected[1])
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', colors.textMuted)
        .attr('font-size', name === 'Peru' ? '14px' : '11px')
        .attr('font-weight', name === 'Peru' ? '600' : '400')
        .attr('opacity', mapOpacity * 0.8)
        .text(name);
    }
  });
};

// Helper to determine if a district should be highlighted
const isHighlighted = (d: MergedDistrictData, highlightMode: HighlightMode): boolean => {
  if (highlightMode === 'none') return false;
  if (highlightMode === 'mita-only') return d.mita === 1;
  if (highlightMode === 'nonmita-only') return d.mita === 0;
  if (highlightMode === 'boundary') {
    return d.distance !== null && Math.abs(d.distance) <= BOUNDARY_THRESHOLD;
  }
  return false;
};

// Helper to check if district is very close to boundary (gets white stroke)
const isVeryClose = (d: MergedDistrictData): boolean => {
  return d.distance !== null && Math.abs(d.distance) <= VERY_CLOSE_THRESHOLD;
};

// Helper to determine if a district should be dimmed
const isDimmed = (d: MergedDistrictData, highlightMode: HighlightMode): boolean => {
  if (highlightMode === 'none') return false;
  return !isHighlighted(d, highlightMode);
};

const renderDistricts = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  pathGenerator: d3.GeoPath,
  mergedData: MergedDistrictData[],
  z: number,
  polygonOpacity: number,
  borderOpacity: number,
  showDistricts: boolean,
  highlightMode: HighlightMode,
  onHover?: (district: MergedDistrictData | null, event?: MouseEvent) => void
): void => {
  // Sort: non-mita first, then mita on top, then highlighted on top
  const sortedData = [...mergedData].sort((a, b) => {
    const aHighlighted = isHighlighted(a, highlightMode) ? 1 : 0;
    const bHighlighted = isHighlighted(b, highlightMode) ? 1 : 0;
    if (aHighlighted !== bHighlighted) return aHighlighted - bHighlighted;
    return a.mita - b.mita;
  });

  // Non-mita opacity scales with zoom
  const nonMitaOpacity = z * OPACITY.district * polygonOpacity;

  // Calculate opacity for a district based on highlight mode
  const getDistrictOpacity = (d: MergedDistrictData): number => {
    const baseOpacity = d.mita === 1 ? OPACITY.district * polygonOpacity : nonMitaOpacity;
    if (highlightMode === 'none') return baseOpacity;
    if (isDimmed(d, highlightMode)) return baseOpacity * 0.5; // Dim non-highlighted (subtle)
    return baseOpacity; // Keep highlighted at normal opacity
  };

  // Background layer to fill anti-aliasing gaps (always drawn for consistent colors)
  g.selectAll('.district-bg')
    .data(sortedData)
    .join('path')
    .attr('class', 'district-bg')
    .attr('d', d => {
      const geoJSON = {
        type: 'Polygon' as const,
        coordinates: [d.polygon.map(p => [p[1], p[0]] as [number, number])]
      };
      return pathGenerator(geoJSON);
    })
    .attr('fill', d => d.mita === 1 ? colors.mita : colors.nonmitaLight)
    .attr('stroke', d => d.mita === 1 ? colors.mita : colors.nonmitaLight)
    .attr('stroke-width', 1.5)
    .attr('opacity', d => getDistrictOpacity(d));

  // Main district layer
  g.selectAll<SVGPathElement, MergedDistrictData>('.district')
    .data(sortedData)
    .join('path')
    .attr('class', 'district')
    .attr('d', d => {
      const geoJSON = {
        type: 'Polygon' as const,
        coordinates: [d.polygon.map(p => [p[1], p[0]] as [number, number])]
      };
      return pathGenerator(geoJSON);
    })
    .attr('fill', d => d.mita === 1 ? colors.mita : colors.nonmitaLight)
    .attr('stroke', d => {
      // Only very close districts get white stroke emphasis
      if (highlightMode === 'boundary' && isVeryClose(d)) {
        return colors.effectLine; // White stroke for very close districts
      }
      return d.mita === 1 ? colors.mitaStroke : colors.nonmita;
    })
    .attr('stroke-width', d => {
      if (highlightMode === 'boundary' && isVeryClose(d)) {
        return 2.5; // Thick stroke for very close districts
      }
      if (highlightMode === 'boundary' && isHighlighted(d, highlightMode)) {
        return 1.5; // Slightly thicker for boundary districts
      }
      return 1;
    })
    .attr('stroke-opacity', d => {
      if (highlightMode !== 'none' && isHighlighted(d, highlightMode)) {
        return 1; // Full stroke opacity for highlighted
      }
      return borderOpacity;
    })
    .attr('opacity', d => getDistrictOpacity(d))
    .style('cursor', 'pointer')
    .on('mousemove', function(event: MouseEvent, d: MergedDistrictData) {
      if (onHover) onHover(d, event);
      d3.select(this).attr('stroke-width', 2).attr('stroke-opacity', 1);
    })
    .on('mouseout', function() {
      if (onHover) onHover(null);
      const datum = d3.select(this).datum() as MergedDistrictData;
      let baseStrokeWidth = 1;
      if (highlightMode === 'boundary' && isVeryClose(datum)) {
        baseStrokeWidth = 2.5;
      } else if (highlightMode === 'boundary' && isHighlighted(datum, highlightMode)) {
        baseStrokeWidth = 1.5;
      }
      const baseStrokeOpacity = (highlightMode !== 'none' && isHighlighted(datum, highlightMode)) ? 1 : borderOpacity;
      d3.select(this).attr('stroke-width', baseStrokeWidth).attr('stroke-opacity', baseStrokeOpacity);
    });
};
