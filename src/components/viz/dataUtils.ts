// Data processing utilities
import * as d3 from 'd3';
import districtPolygons from '../../data/districtPolygons.json';
import mitaData from '../../data/mitaData.json';
import { DistrictPolygon, DistrictData, MergedDistrictData, ScatterDataPoint, OutcomeType } from './types';

// Merge polygon and outcome data
export const mergeData = (): MergedDistrictData[] => {
  const outcomeMap = new Map<number, DistrictData>();
  (mitaData as DistrictData[]).forEach(d => outcomeMap.set(d.ubigeo, d));

  return (districtPolygons as DistrictPolygon[]).map(poly => {
    const outcome = outcomeMap.get(poly.ubigeo);
    // Calculate centroid from polygon
    const centroid = d3.polygonCentroid(poly.polygon.map(p => [p[1], p[0]] as [number, number]));
    return {
      ubigeo: poly.ubigeo,
      mita: poly.mita,
      polygon: poly.polygon,
      centroidLon: centroid[0],
      centroidLat: centroid[1],
      distance: outcome?.distance ?? null,
      isInside: outcome?.isInside ?? poly.mita === 1,
      consumption: outcome?.consumption ?? null,
      stunting: outcome?.stunting ?? null,
      roads: outcome?.roads ?? null,
    };
  });
};

// Filter data for scatter plot
export const filterScatterData = (
  mergedData: MergedDistrictData[],
  currentOutcome: OutcomeType
): ScatterDataPoint[] => {
  return mergedData.filter(d => {
    const value = d[currentOutcome];
    return d.distance !== null && value !== null && value > 0;
  }).map(d => {
    const rawValue = d[currentOutcome] as number;
    const value = currentOutcome === 'stunting' ? rawValue * 100 : rawValue;
    const flippedDistance = d.isInside ? Math.abs(d.distance as number) : -Math.abs(d.distance as number);
    return {
      ...d,
      scatterX: flippedDistance,
      scatterY: value,
      stuntingY: d.stunting !== null ? d.stunting * 100 : null,
      consumptionY: d.consumption,
      roadsY: d.roads,
    };
  });
};

// Get all scatter data with any outcome (for transitions)
export const getAllScatterData = (mergedData: MergedDistrictData[]): Omit<ScatterDataPoint, 'scatterY'>[] => {
  return mergedData.filter(d => {
    return d.distance !== null && (
      (d.stunting !== null && d.stunting > 0) ||
      (d.consumption !== null && d.consumption > 0) ||
      (d.roads !== null && d.roads > 0)
    );
  }).map(d => {
    const flippedDistance = d.isInside ? Math.abs(d.distance as number) : -Math.abs(d.distance as number);
    return {
      ...d,
      scatterX: flippedDistance,
      scatterY: 0, // Placeholder, use specific outcome Y values
      stuntingY: d.stunting !== null && d.stunting > 0 ? d.stunting * 100 : null,
      consumptionY: d.consumption !== null && d.consumption > 0 ? d.consumption : null,
      roadsY: d.roads !== null && d.roads > 0 ? d.roads : null,
    };
  });
};

// Helper to get Y value for a given outcome
export const getOutcomeY = (
  d: { stuntingY: number | null; consumptionY: number | null; roadsY: number | null },
  outcomeKey: string
): number | null => {
  if (outcomeKey === 'stunting') return d.stuntingY;
  if (outcomeKey === 'consumption') return d.consumptionY;
  if (outcomeKey === 'roads') return d.roadsY;
  return null;
};
