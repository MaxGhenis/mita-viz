// Scale and projection utilities
import * as d3 from 'd3';
import { geoMercator } from 'd3-geo';
import { MergedDistrictData, ScatterDataPoint, OutcomeType, Dimensions, Margin } from './types';

interface ProjectionParams {
  mergedData: MergedDistrictData[];
  peruFeature: any;
  currentZoom: number; // 0 = peru, 1 = mita
  innerWidth: number;
  innerHeight: number;
}

// Create interpolated projection between Peru and mita views
export const createProjection = ({
  mergedData,
  peruFeature,
  currentZoom,
  innerWidth,
  innerHeight,
}: ProjectionParams): d3.GeoProjection => {
  // Get all coordinates for mita region
  const allCoords: [number, number][] = [];
  mergedData.forEach(d => {
    d.polygon.forEach(p => allCoords.push([p[1], p[0]]));
  });

  // Create projections for both zoom levels
  const mitaProjection = geoMercator()
    .fitSize([innerWidth, innerHeight], {
      type: 'MultiPoint',
      coordinates: allCoords
    });

  const peruProjection = geoMercator()
    .fitSize([innerWidth, innerHeight], peruFeature.geometry);

  // Interpolate projection parameters
  const mitaCenter = mitaProjection.center();
  const peruCenter = peruProjection.center();
  const mitaScale = mitaProjection.scale();
  const peruScale = peruProjection.scale();
  const mitaTranslate = mitaProjection.translate();
  const peruTranslate = peruProjection.translate();

  const z = currentZoom;
  const interpolatedCenter: [number, number] = [
    peruCenter![0] + (mitaCenter![0] - peruCenter![0]) * z,
    peruCenter![1] + (mitaCenter![1] - peruCenter![1]) * z
  ];
  const interpolatedScale = peruScale + (mitaScale - peruScale) * z;
  const interpolatedTranslate: [number, number] = [
    peruTranslate[0] + (mitaTranslate[0] - peruTranslate[0]) * z,
    peruTranslate[1] + (mitaTranslate[1] - peruTranslate[1]) * z
  ];

  return geoMercator()
    .center(interpolatedCenter)
    .scale(interpolatedScale)
    .translate(interpolatedTranslate);
};

// Create X scale for scatter plot
export const createXScale = (innerWidth: number): d3.ScaleLinear<number, number> => {
  return d3.scaleLinear().domain([-50, 50]).range([0, innerWidth]);
};

// Create Y scales for all outcomes
export const createYScales = (
  allScatterData: ScatterDataPoint[],
  innerHeight: number
): Record<OutcomeType, d3.ScaleLinear<number, number>> => {
  // Stunting: fixed 0-100 scale
  const stuntingYScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

  // Consumption: dynamic based on data
  const consumptionValues = allScatterData
    .filter(d => d.consumptionY !== null)
    .map(d => d.consumptionY as number);
  const consumptionYScale = d3.scaleLinear()
    .domain([
      Math.floor(Math.min(...consumptionValues) * 0.95),
      Math.ceil(Math.max(...consumptionValues) * 1.05)
    ])
    .range([innerHeight, 0]);

  // Roads: dynamic based on data
  const roadsValues = allScatterData
    .filter(d => d.roadsY !== null)
    .map(d => d.roadsY as number);
  const roadsYScale = d3.scaleLinear()
    .domain([
      Math.floor(Math.min(...roadsValues) * 0.95),
      Math.ceil(Math.max(...roadsValues) * 1.05)
    ])
    .range([innerHeight, 0]);

  return {
    stunting: stuntingYScale,
    consumption: consumptionYScale,
    roads: roadsYScale,
  };
};

// Calculate inner dimensions
export const getInnerDimensions = (
  dimensions: Dimensions,
  margin: Margin
): { innerWidth: number; innerHeight: number } => {
  return {
    innerWidth: dimensions.width - margin.left - margin.right,
    innerHeight: dimensions.height - margin.top - margin.bottom,
  };
};
