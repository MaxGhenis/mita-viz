// Map rendering functions
import * as d3 from 'd3';
import { geoPath } from 'd3-geo';
import { colors } from '../../../colors';
import { MergedDistrictData } from '../types';
import { OPACITY } from '../constants';

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
  renderDistricts(g, pathGenerator, mergedData, z, polygonOpacity, borderOpacity, showDistricts);
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

const renderDistricts = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  pathGenerator: d3.GeoPath,
  mergedData: MergedDistrictData[],
  z: number,
  polygonOpacity: number,
  borderOpacity: number,
  showDistricts: boolean
): void => {
  // Sort: non-mita first, then mita on top
  const sortedData = [...mergedData].sort((a, b) => a.mita - b.mita);

  // Non-mita opacity scales with zoom
  const nonMitaOpacity = z * OPACITY.district * polygonOpacity;

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
    .attr('opacity', d => d.mita === 1 ? OPACITY.district * polygonOpacity : nonMitaOpacity);

  // Main district layer
  g.selectAll('.district')
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
    .attr('stroke', d => d.mita === 1 ? colors.mitaStroke : colors.nonmita)
    .attr('stroke-width', 1)
    .attr('stroke-opacity', borderOpacity)
    .attr('opacity', d => d.mita === 1 ? OPACITY.district * polygonOpacity : nonMitaOpacity);
};
