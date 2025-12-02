// Shared types for visualization components

export interface DistrictPolygon {
  ubigeo: number;
  mita: number;
  polygon: [number, number][];
}

export interface DistrictData {
  ubigeo: number;
  distance: number | null;
  isInside: boolean;
  consumption: number | null;
  stunting: number | null;
  roads: number | null;
  lat: number | null;
  lon: number | null;
}

export interface MergedDistrictData {
  ubigeo: number;
  mita: number;
  polygon: [number, number][];
  centroidLon: number;
  centroidLat: number;
  distance: number | null;
  isInside: boolean;
  consumption: number | null;
  stunting: number | null;
  roads: number | null;
}

export interface ScatterDataPoint extends MergedDistrictData {
  scatterX: number;
  scatterY: number;
  stuntingY: number | null;
  consumptionY: number | null;
  roadsY: number | null;
}

export interface FittedLines {
  insideLineLinear: { x: number; y: number }[];
  outsideLineLinear: { x: number; y: number }[];
  insideLinePoly: { x: number; y: number }[];
  outsideLinePoly: { x: number; y: number }[];
  naiveDiscontinuity: number;
  paperDiscontinuity: number;
}

export type OutcomeType = 'consumption' | 'stunting' | 'roads';
export type ScatterPhase = 'dots' | 'ols' | 'naive-effect' | 'effect';
export type ZoomLevel = 'peru' | 'mita';
export type HighlightMode = 'none' | 'boundary' | 'mita-only' | 'nonmita-only';

export interface Dimensions {
  width: number;
  height: number;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RenderContext {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  projection: d3.GeoProjection;
  pathGenerator: d3.GeoPath;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;
}
