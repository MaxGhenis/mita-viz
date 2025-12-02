import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import districtPolygons from '../data/districtPolygons.json';
import mitaData from '../data/mitaData.json';
import southAmerica from '../data/southAmerica.json';
import { colors } from '../colors';

interface UnifiedVizProps {
  morphProgress: number; // 0 = map, 1 = scatter
  outcome: 'consumption' | 'stunting' | 'roads';
  showDistricts: boolean;
  scatterPhase: 'dots' | 'ols' | 'naive-effect' | 'effect';
  zoomLevel: 'peru' | 'mita'; // 'peru' shows whole country, 'mita' zooms to mita region
}

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

// Dell (2010) regression discontinuity estimates
const PAPER_COEFFICIENTS = {
  consumption: -0.25,
  stunting: 0.06,
  roads: -36,
};

// Merge polygon and outcome data
const mergeData = () => {
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


const outcomeLabels = {
  consumption: 'Log household consumption (2001)',
  stunting: 'Child stunting rate (2005)',
  roads: 'Road density (meters/km², 2006)',
};

const UnifiedViz: React.FC<UnifiedVizProps> = ({
  morphProgress,
  outcome,
  showDistricts,
  scatterPhase,
  zoomLevel
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions] = useState({ width: 700, height: 500 });
  const animationRef = useRef<number | null>(null);
  const zoomAnimationRef = useRef<number | null>(null);
  const [currentProgress, setCurrentProgress] = useState(morphProgress);
  const [currentOutcome, setCurrentOutcome] = useState(outcome);
  const [currentZoom, setCurrentZoom] = useState(zoomLevel === 'peru' ? 0 : 1); // 0 = peru, 1 = mita
  const prevScatterPhaseRef = useRef<string>(scatterPhase);
  const prevOutcomeRef = useRef<string>(outcome);

  const mergedData = useMemo(() => mergeData(), []);

  // Smooth animation when morphProgress changes
  useEffect(() => {
    let startProgress = currentProgress;
    const targetProgress = morphProgress;
    const duration = 3000; // Slow animation for district-to-dot morph
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const newProgress = startProgress + (targetProgress - startProgress) * eased;
      setCurrentProgress(newProgress);

      if (t < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphProgress]);

  // Smooth transition when outcome changes
  useEffect(() => {
    setCurrentOutcome(outcome);
  }, [outcome]);

  // Smooth zoom animation
  useEffect(() => {
    const targetZoom = zoomLevel === 'peru' ? 0 : 1;
    let startZoom = currentZoom;
    const duration = 1500;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const newZoom = startZoom + (targetZoom - startZoom) * eased;
      setCurrentZoom(newZoom);

      if (t < 1) {
        zoomAnimationRef.current = requestAnimationFrame(animate);
      }
    };

    if (zoomAnimationRef.current) {
      cancelAnimationFrame(zoomAnimationRef.current);
    }
    zoomAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (zoomAnimationRef.current) {
        cancelAnimationFrame(zoomAnimationRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel]);

  // Filter data for scatter plot - include all outcome values for smooth transitions
  const scatterData = useMemo(() => {
    return mergedData.filter(d => {
      const value = d[currentOutcome];
      return d.distance !== null && value !== null && value > 0;
    }).map(d => {
      const rawValue = d[currentOutcome] as number;
      const value = currentOutcome === 'stunting' ? rawValue * 100 : rawValue;
      const flippedDistance = d.isInside ? Math.abs(d.distance as number) : -Math.abs(d.distance as number);
      // Include all outcome values for transitions
      return {
        ...d,
        scatterX: flippedDistance,
        scatterY: value,
        stuntingY: d.stunting !== null ? d.stunting * 100 : null,
        consumptionY: d.consumption,
        roadsY: d.roads,
      };
    });
  }, [mergedData, currentOutcome]);

  // Full scatter data with all districts that have any outcome (for transitions)
  const allScatterData = useMemo(() => {
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
        stuntingY: d.stunting !== null && d.stunting > 0 ? d.stunting * 100 : null,
        consumptionY: d.consumption !== null && d.consumption > 0 ? d.consumption : null,
        roadsY: d.roads !== null && d.roads > 0 ? d.roads : null,
      };
    });
  }, [mergedData]);

  // Calculate fitted lines - both linear and polynomial
  const fittedLines = useMemo(() => {
    const insideData = scatterData.filter(d => d.isInside);
    const outsideData = scatterData.filter(d => !d.isInside);

    // Linear OLS: y = a + b*x
    const calcLinearOLS = (points: { scatterX: number; scatterY: number }[]) => {
      const n = points.length;
      if (n < 2) return { intercept: 0, slope: 0 };
      const sumX = points.reduce((s, p) => s + p.scatterX, 0);
      const sumY = points.reduce((s, p) => s + p.scatterY, 0);
      const sumXY = points.reduce((s, p) => s + p.scatterX * p.scatterY, 0);
      const sumX2 = points.reduce((s, p) => s + p.scatterX * p.scatterX, 0);
      const denom = n * sumX2 - sumX * sumX;
      if (Math.abs(denom) < 1e-10) return { intercept: sumY / n, slope: 0 };
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      return { intercept, slope };
    };

    // Quadratic OLS: y = a + b*x + c*x^2
    const calcQuadraticOLS = (points: { scatterX: number; scatterY: number }[]) => {
      const n = points.length;
      if (n < 3) {
        const linear = calcLinearOLS(points);
        return { ...linear, quadratic: 0 };
      }

      const sumX = points.reduce((s, p) => s + p.scatterX, 0);
      const sumX2 = points.reduce((s, p) => s + p.scatterX ** 2, 0);
      const sumX3 = points.reduce((s, p) => s + p.scatterX ** 3, 0);
      const sumX4 = points.reduce((s, p) => s + p.scatterX ** 4, 0);
      const sumY = points.reduce((s, p) => s + p.scatterY, 0);
      const sumXY = points.reduce((s, p) => s + p.scatterX * p.scatterY, 0);
      const sumX2Y = points.reduce((s, p) => s + p.scatterX ** 2 * p.scatterY, 0);

      const det = n * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumX * sumX4 - sumX3 * sumX2) + sumX2 * (sumX * sumX3 - sumX2 * sumX2);

      if (Math.abs(det) < 1e-10) {
        const linear = calcLinearOLS(points);
        return { ...linear, quadratic: 0 };
      }

      const intercept = (sumY * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumXY * sumX4 - sumX2Y * sumX3) + sumX2 * (sumXY * sumX3 - sumX2Y * sumX2)) / det;
      const slope = (n * (sumXY * sumX4 - sumX2Y * sumX3) - sumY * (sumX * sumX4 - sumX3 * sumX2) + sumX2 * (sumX * sumX2Y - sumXY * sumX2)) / det;
      const quadratic = (n * (sumX2 * sumX2Y - sumX3 * sumXY) - sumX * (sumX * sumX2Y - sumXY * sumX2) + sumY * (sumX * sumX3 - sumX2 * sumX2)) / det;

      return { intercept, slope, quadratic };
    };

    const insideLinear = calcLinearOLS(insideData);
    const outsideLinear = calcLinearOLS(outsideData);
    const insidePoly = calcQuadraticOLS(insideData);
    const outsidePoly = calcQuadraticOLS(outsideData);

    const maxInside = Math.max(...insideData.map(d => d.scatterX), 0);
    const minOutside = Math.min(...outsideData.map(d => d.scatterX), 0);

    const paperDiscontinuity = currentOutcome === 'stunting'
      ? PAPER_COEFFICIENTS[currentOutcome] * 100
      : PAPER_COEFFICIENTS[currentOutcome];
    const naiveDiscontinuity = insideLinear.intercept - outsideLinear.intercept;

    // Polynomial curves (for effect phase) - with paper's discontinuity
    const allMean = scatterData.reduce((s, d) => s + d.scatterY, 0) / scatterData.length;
    const paperOutsideIntercept = allMean;
    const paperInsideIntercept = allMean + paperDiscontinuity;

    // Generate lines with SAME number of points for smooth interpolation
    // Both linear and polynomial use the same x-coordinates so paths can morph
    const insideLineLinear: { x: number; y: number }[] = [];
    const insideLinePoly: { x: number; y: number }[] = [];
    for (let x = 0; x <= Math.ceil(maxInside); x += 1) {
      // Linear: y = intercept + slope * x
      insideLineLinear.push({
        x,
        y: insideLinear.intercept + insideLinear.slope * x
      });
      // Polynomial: y = paperIntercept + slope * x + quadratic * x^2
      insideLinePoly.push({
        x,
        y: paperInsideIntercept + insidePoly.slope * x + insidePoly.quadratic * x * x
      });
    }

    const outsideLineLinear: { x: number; y: number }[] = [];
    const outsideLinePoly: { x: number; y: number }[] = [];
    for (let x = Math.floor(minOutside); x <= 0; x += 1) {
      // Linear: y = intercept + slope * x
      outsideLineLinear.push({
        x,
        y: outsideLinear.intercept + outsideLinear.slope * x
      });
      // Polynomial: y = paperIntercept + slope * x + quadratic * x^2
      outsideLinePoly.push({
        x,
        y: paperOutsideIntercept + outsidePoly.slope * x + outsidePoly.quadratic * x * x
      });
    }

    return {
      insideLineLinear,
      outsideLineLinear,
      insideLinePoly,
      outsideLinePoly,
      naiveDiscontinuity,
      paperDiscontinuity,
    };
  }, [scatterData, currentOutcome]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = dimensions.width;
    const height = dimensions.height;
    const margin = { top: 40, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const t = currentProgress;

    // Check if we're just transitioning between outcomes or phases at full scatter
    const isOutcomeOnlyTransition = t >= 1 && prevOutcomeRef.current !== currentOutcome && prevOutcomeRef.current !== '';
    const isPhaseTransition = t >= 1 && prevScatterPhaseRef.current !== scatterPhase && prevScatterPhaseRef.current !== '';
    const isAtFullScatter = t >= 1;
    const shouldPreserveElements = isOutcomeOnlyTransition || isPhaseTransition;

    // Only clear non-persistent elements for smooth transitions
    // At full scatter, always preserve dots to prevent flashing
    if (shouldPreserveElements || isAtFullScatter) {
      // Remove everything except dots, lines, and effect elements which we'll transition
      svg.selectAll('*:not(.morph-dot):not(.inside-line):not(.outside-line):not(.effect-line):not(.effect-label-rect):not(.effect-label-text):not(.main-group)').remove();
    } else {
      svg.selectAll('*').remove();
    }

    // Get or create main group for non-transitioning elements
    let g = svg.select<SVGGElement>('.main-group');
    if (g.empty()) {
      g = svg.append('g')
        .attr('class', 'main-group')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    } else if (!shouldPreserveElements && !isAtFullScatter) {
      // Only clear the main group's children if not doing a smooth transition and not at full scatter
      g.selectAll('*').remove();
    }

    // Geo projection - interpolate between Peru view and mita view
    const allCoords: [number, number][] = [];
    mergedData.forEach(d => {
      d.polygon.forEach(p => allCoords.push([p[1], p[0]]));
    });

    // South America countries - Peru is the first feature
    const saFeatures = (southAmerica as any).features;
    const peruFeature = saFeatures.find((f: any) => f.properties?.name === 'Peru');
    const neighborFeatures = saFeatures.filter((f: any) => f.properties?.name !== 'Peru');

    // Create projections for both zoom levels
    const mitaProjection = geoMercator()
      .fitSize([innerWidth, innerHeight], {
        type: 'MultiPoint',
        coordinates: allCoords
      });

    // Peru-centered projection - use fitSize for proper fit
    const peruProjection = geoMercator()
      .fitSize([innerWidth, innerHeight], peruFeature.geometry);

    // Interpolate projection parameters based on zoom level
    const mitaCenter = mitaProjection.center();
    const peruCenter = peruProjection.center();
    const mitaScale = mitaProjection.scale();
    const peruScale = peruProjection.scale();
    const mitaTranslate = mitaProjection.translate();
    const peruTranslate = peruProjection.translate();

    const z = currentZoom; // 0 = peru, 1 = mita
    const interpolatedCenter: [number, number] = [
      peruCenter![0] + (mitaCenter![0] - peruCenter![0]) * z,
      peruCenter![1] + (mitaCenter![1] - peruCenter![1]) * z
    ];
    const interpolatedScale = peruScale + (mitaScale - peruScale) * z;
    const interpolatedTranslate: [number, number] = [
      peruTranslate[0] + (mitaTranslate[0] - peruTranslate[0]) * z,
      peruTranslate[1] + (mitaTranslate[1] - peruTranslate[1]) * z
    ];

    const projection = geoMercator()
      .center(interpolatedCenter)
      .scale(interpolatedScale)
      .translate(interpolatedTranslate);

    const pathGenerator = geoPath().projection(projection);

    // Scatter scales
    const xScale = d3.scaleLinear().domain([-50, 50]).range([0, innerWidth]);

    // Create Y scales for all outcomes (for smooth transitions)
    const stuntingYScale = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);

    const consumptionValues = allScatterData.filter(d => d.consumptionY !== null).map(d => d.consumptionY as number);
    const consumptionYScale = d3.scaleLinear()
      .domain([Math.floor(Math.min(...consumptionValues) * 0.95), Math.ceil(Math.max(...consumptionValues) * 1.05)])
      .range([innerHeight, 0]);

    const roadsValues = allScatterData.filter(d => d.roadsY !== null).map(d => d.roadsY as number);
    const roadsYScale = d3.scaleLinear()
      .domain([Math.floor(Math.min(...roadsValues) * 0.95), Math.ceil(Math.max(...roadsValues) * 1.05)])
      .range([innerHeight, 0]);

    const yScales = { stunting: stuntingYScale, consumption: consumptionYScale, roads: roadsYScale };
    const yScale = yScales[currentOutcome];

    // Background regions - fade in
    if (t > 0) {
      const bgOpacity = t * 0.3;

      g.append('rect')
        .attr('x', xScale(-50))
        .attr('width', xScale(0) - xScale(-50))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', colors.nonmitaLight)
        .attr('opacity', bgOpacity);

      g.append('rect')
        .attr('x', xScale(0))
        .attr('width', xScale(50) - xScale(0))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', '#222939')
        .attr('opacity', t);
    }

    // Region labels
    if (t > 0.7) {
      const labelOpacity = (t - 0.7) / 0.3;

      g.append('text')
        .attr('x', xScale(-25))
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.nonmita)
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .attr('opacity', labelOpacity)
        .text('Non-mita');

      g.append('text')
        .attr('x', xScale(25))
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('fill', '#E2E8F0')
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .attr('opacity', labelOpacity)
        .text('Mita');
    }

    // Axes
    if (t > 0.8) {
      const axisOpacity = (t - 0.8) / 0.2;

      const xAxisG = g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .attr('opacity', axisOpacity);
      xAxisG.call(d3.axisBottom(xScale).ticks(5).tickFormat(d => String(Math.abs(d as number))));

      const yAxisG = g.append('g')
        .attr('opacity', axisOpacity);
      yAxisG.call(d3.axisLeft(yScale).ticks(5).tickFormat(d =>
        currentOutcome === 'stunting' ? `${d}%` : String(d)
      ));

      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + 40)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .attr('font-size', '12px')
        .attr('opacity', axisOpacity)
        .text('Distance from mita boundary (km)');
    }

    // Set of ubigeos that have scatter data
    const scatterUbigeos = new Set(scatterData.map(d => d.ubigeo));

    // Draw based on progress
    if (t < 0.3) {
      // Map phase - show ALL polygons
      const polygonOpacity = 1 - (t / 0.3) * 0.3;

      // Draw South America map when zoomed out (z < 1)
      if (z < 1) {
        const mapOpacity = (1 - z);

        // Draw neighboring countries (same color as non-mita regions)
        neighborFeatures.forEach((feature: any) => {
          g.append('path')
            .datum(feature)
            .attr('class', 'neighbor-country')
            .attr('d', pathGenerator as any)
            .attr('fill', colors.nonmitaLight)
            .attr('stroke', colors.nonmita)
            .attr('stroke-width', 0.5)
            .attr('opacity', mapOpacity * 0.5);
        });

        // Draw Peru outline (same color as non-mita districts)
        g.append('path')
          .datum(peruFeature)
          .attr('class', 'peru-outline')
          .attr('d', pathGenerator as any)
          .attr('fill', colors.nonmitaLight)
          .attr('stroke', colors.nonmita)
          .attr('stroke-width', 1)
          .attr('opacity', mapOpacity * 0.5);

        // Add country labels
        const countryLabels = [
          { name: 'Peru', feature: peruFeature },
          ...neighborFeatures.map((f: any) => ({ name: f.properties?.name, feature: f }))
        ];

        countryLabels.forEach(({ name, feature }) => {
          if (!feature?.geometry) return;

          // Calculate centroid for label placement
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
              .attr('fill', '#666')
              .attr('font-size', name === 'Peru' ? '14px' : '11px')
              .attr('font-weight', name === 'Peru' ? '600' : '400')
              .attr('opacity', mapOpacity * 0.8)
              .text(name);
          }
        });
      }

      // Draw non-mita first, then mita on top
      const sortedData = [...mergedData].sort((a, b) => a.mita - b.mita);

      if (!showDistricts) {
        // When not showing districts, draw a background layer first
        // with matching stroke to fill anti-aliasing gaps
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
          .attr('fill', d => d.mita === 1 ? '#222939' : colors.nonmitaLight)
          .attr('stroke', d => d.mita === 1 ? '#222939' : colors.nonmitaLight)
          .attr('stroke-width', 1.5)
          .attr('opacity', d => (d.mita === 1 ? 0.85 : 0.5) * polygonOpacity);
      }

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
        .attr('fill', d => d.mita === 1 ? '#222939' : colors.nonmitaLight)
        .attr('stroke', showDistricts ? (d => d.mita === 1 ? '#1A202C' : colors.nonmita) : 'none')
        .attr('stroke-width', showDistricts ? 1 : 0)
        .attr('opacity', d => (d.mita === 1 ? 0.85 : 0.5) * polygonOpacity);

    } else {
      // Morphing/scatter phase
      const morphT = Math.min((t - 0.3) / 0.5, 1);

      // First: fade out districts without scatter data
      if (morphT < 1) {
        const fadeOpacity = Math.max(0, 0.5 - morphT * 0.8);
        const districtsWithoutData = mergedData.filter(d => !scatterUbigeos.has(d.ubigeo));

        g.selectAll('.fading-district')
          .data(districtsWithoutData)
          .join('path')
          .attr('class', 'fading-district')
          .attr('d', d => {
            const geoJSON = {
              type: 'Polygon' as const,
              coordinates: [d.polygon.map(p => [p[1], p[0]] as [number, number])]
            };
            return pathGenerator(geoJSON);
          })
          .attr('fill', d => d.mita === 1 ? '#222939' : colors.nonmitaLight)
          .attr('stroke', 'none')
          .attr('opacity', fadeOpacity);
      }

      // Helper to get Y value for current outcome
      const getOutcomeY = (d: typeof allScatterData[0], outcomeKey: string): number | null => {
        if (outcomeKey === 'stunting') return d.stuntingY;
        if (outcomeKey === 'consumption') return d.consumptionY;
        if (outcomeKey === 'roads') return d.roadsY;
        return null;
      };

      // When at full scatter and outcome is changing, use allScatterData for smooth transitions
      if (morphT >= 1 && isOutcomeOnlyTransition) {
        // Use svg.selectAll to find dots that are preserved outside the main group
        svg.selectAll<SVGCircleElement, typeof allScatterData[0]>('.morph-dot')
          .data(allScatterData, (d: any) => d.ubigeo)
          .join(
            enter => enter.append('circle')
              .attr('class', 'morph-dot')
              .attr('transform', `translate(${margin.left},${margin.top})`)
              .attr('cx', d => xScale(d.scatterX))
              .attr('cy', d => {
                const yVal = getOutcomeY(d, currentOutcome);
                return yVal !== null ? yScale(yVal) : innerHeight / 2;
              })
              .attr('r', 5)
              .attr('fill', d => d.isInside ? '#E2E8F0' : colors.nonmita)
              .attr('opacity', 0)
              .attr('stroke', d => d.isInside ? '#1A202C' : '#fff')
              .attr('stroke-width', 0.5)
              .call(enter => enter.transition().duration(600).attr('opacity', d => getOutcomeY(d, currentOutcome) !== null ? 0.8 : 0)),
            update => update
              .call(update => update.transition().duration(600)
                .attr('cy', d => {
                  const yVal = getOutcomeY(d, currentOutcome);
                  return yVal !== null ? yScale(yVal) : innerHeight / 2;
                })
                .attr('opacity', d => getOutcomeY(d, currentOutcome) !== null ? 0.8 : 0)),
            exit => exit
              .call(exit => exit.transition().duration(600).attr('opacity', 0).remove())
          );
      } else if (morphT >= 1 && isPhaseTransition) {
        // Phase transition only (e.g., ols -> naive-effect -> effect)
        // Dots stay the same, just re-bind data to ensure they persist
        svg.selectAll<SVGCircleElement, typeof scatterData[0]>('.morph-dot')
          .data(scatterData, (d: any) => d.ubigeo);
        // No changes needed - dots are preserved from the :not() selector
      } else if (morphT < 1) {
        // MORPHING PHASE: Show districts shrinking into dots while moving
        // Districts with scatter data shrink and move to their scatter positions
        const districtsWithData = scatterData;

        // Scale factor: 1 at start, 0 at end (district shrinks to nothing)
        const districtScale = 1 - morphT;
        // Dot grows as district shrinks
        const dotRadius = 5 * morphT;

        // Draw shrinking districts
        g.selectAll('.morphing-district')
          .data(districtsWithData, (d: any) => d.ubigeo)
          .join('path')
          .attr('class', 'morphing-district')
          .attr('d', d => {
            // Get centroid position (where the dot will end up)
            const centroid = projection([d.centroidLon, d.centroidLat]);
            if (!centroid) return '';

            // Target position in scatter plot
            const targetX = xScale(d.scatterX);
            const targetY = yScale(d.scatterY);

            // Current center position (interpolate from centroid to scatter)
            const currentCenterX = centroid[0] + (targetX - centroid[0]) * morphT;
            const currentCenterY = centroid[1] + (targetY - centroid[1]) * morphT;

            // Transform polygon points: scale around centroid, then translate
            const scaledCoords = d.polygon.map(p => {
              const projected = projection([p[1], p[0]]);
              if (!projected) return [currentCenterX, currentCenterY];

              // Scale point relative to original centroid
              const scaledX = centroid[0] + (projected[0] - centroid[0]) * districtScale;
              const scaledY = centroid[1] + (projected[1] - centroid[1]) * districtScale;

              // Translate to current position
              const finalX = scaledX + (currentCenterX - centroid[0]);
              const finalY = scaledY + (currentCenterY - centroid[1]);

              return [finalX, finalY];
            });

            // Create SVG path from scaled coordinates
            if (scaledCoords.length < 3) return '';
            return 'M' + scaledCoords.map(c => `${c[0]},${c[1]}`).join('L') + 'Z';
          })
          .attr('fill', d => d.isInside ? '#E2E8F0' : colors.nonmita)
          .attr('stroke', d => d.isInside ? '#1A202C' : colors.nonmita)
          .attr('stroke-width', Math.max(0.5, 1 - morphT))
          .attr('opacity', 0.8);

        // Also draw growing dots at the same position (for smooth transition)
        if (morphT > 0.3) {
          const dotOpacity = (morphT - 0.3) / 0.7; // Fade in during last 70% of morph

          svg.selectAll<SVGCircleElement, typeof scatterData[0]>('.morph-dot')
            .data(scatterData, (d: any) => d.ubigeo)
            .join(
              enter => enter.append('circle')
                .attr('class', 'morph-dot')
                .attr('transform', `translate(${margin.left},${margin.top})`),
              update => update,
              exit => exit.remove()
            )
            .attr('cx', d => {
              const geoCoord = projection([d.centroidLon, d.centroidLat]);
              const mapX = geoCoord ? geoCoord[0] : 0;
              const scatterX = xScale(d.scatterX);
              return mapX + (scatterX - mapX) * morphT;
            })
            .attr('cy', d => {
              const geoCoord = projection([d.centroidLon, d.centroidLat]);
              const mapY = geoCoord ? geoCoord[1] : 0;
              const scatterY = yScale(d.scatterY);
              return mapY + (scatterY - mapY) * morphT;
            })
            .attr('r', dotRadius)
            .attr('fill', d => d.isInside ? '#E2E8F0' : colors.nonmita)
            .attr('opacity', dotOpacity * 0.8)
            .attr('stroke', d => d.isInside ? '#1A202C' : '#fff')
            .attr('stroke-width', 0.5);
        }
      } else {
        // Full scatter - just show dots
        svg.selectAll<SVGCircleElement, typeof scatterData[0]>('.morph-dot')
          .data(scatterData, (d: any) => d.ubigeo)
          .join(
            enter => enter.append('circle')
              .attr('class', 'morph-dot')
              .attr('transform', `translate(${margin.left},${margin.top})`),
            update => update,
            exit => exit.remove()
          )
          .attr('cx', d => xScale(d.scatterX))
          .attr('cy', d => yScale(d.scatterY))
          .attr('r', 5)
          .attr('fill', d => d.isInside ? '#E2E8F0' : colors.nonmita)
          .attr('opacity', 0.8)
          .attr('stroke', d => d.isInside ? '#1A202C' : '#fff')
          .attr('stroke-width', 0.5);
      }
    }

    // Fitted lines and effect annotation (only at full scatter)
    if (t >= 1) {
      const showOLS = scatterPhase === 'ols' || scatterPhase === 'naive-effect' || scatterPhase === 'effect';
      const showEffect = scatterPhase === 'naive-effect' || scatterPhase === 'effect';
      const usePolynomial = scatterPhase === 'effect';

      // Determine if we need to animate (first time showing each element)
      const prevPhase = prevScatterPhaseRef.current;
      const prevShowedOLS = prevPhase === 'ols' || prevPhase === 'naive-effect' || prevPhase === 'effect';
      const prevShowedEffect = prevPhase === 'naive-effect' || prevPhase === 'effect';
      const animateOLS = showOLS && !prevShowedOLS;
      const animateEffect = showEffect && !prevShowedEffect;

      // Choose linear or polynomial lines based on phase
      const insideLine = usePolynomial ? fittedLines.insideLinePoly : fittedLines.insideLineLinear;
      const outsideLine = usePolynomial ? fittedLines.outsideLinePoly : fittedLines.outsideLineLinear;

      if (showOLS) {
        // Use linear curve - the actual shape comes from the data points
        // (both linear and polynomial lines now have the same number of points)
        const lineGenerator = d3.line<{ x: number; y: number }>()
          .x(d => xScale(d.x))
          .y(d => yScale(d.y))
          .curve(d3.curveLinear);

        // Custom interpolator that moves each point vertically (x stays same, y interpolates)
        const createPathInterpolator = (oldPath: string | null, newPoints: { x: number; y: number }[]) => {
          const newPath = lineGenerator(newPoints) || '';
          if (!oldPath) return () => newPath;

          // Parse paths into point arrays for interpolation
          const parsePathPoints = (path: string): number[][] => {
            const points: number[][] = [];
            const regex = /[ML]?\s*([\d.-]+)[,\s]+([\d.-]+)/g;
            let match;
            while ((match = regex.exec(path)) !== null) {
              points.push([parseFloat(match[1]), parseFloat(match[2])]);
            }
            return points;
          };

          const oldPoints = parsePathPoints(oldPath);
          const newPointsParsed = parsePathPoints(newPath);

          // If point counts match, interpolate point-by-point
          if (oldPoints.length === newPointsParsed.length && oldPoints.length > 0) {
            return (t: number) => {
              const interpolated = oldPoints.map((oldPt, i) => {
                const newPt = newPointsParsed[i];
                // x stays the same (or nearly), y interpolates
                const x = oldPt[0] + (newPt[0] - oldPt[0]) * t;
                const y = oldPt[1] + (newPt[1] - oldPt[1]) * t;
                return [x, y];
              });
              return 'M' + interpolated.map(p => `${p[0]},${p[1]}`).join('L');
            };
          }

          // Fallback to default interpolation
          return d3.interpolateString(oldPath, newPath);
        };

        // Use data join for smooth transitions between outcomes and phases
        // Always transition at full scatter since lines are preserved
        svg.selectAll<SVGPathElement, typeof insideLine>('.inside-line')
          .data([insideLine])
          .join(
            enter => enter.append('path')
              .attr('class', 'inside-line')
              .attr('transform', `translate(${margin.left},${margin.top})`)
              .attr('fill', 'none')
              .attr('stroke', '#E2E8F0')
              .attr('stroke-width', 3)
              .attr('d', lineGenerator)
              .attr('opacity', animateOLS ? 0 : 1)
              .call(enter => animateOLS ? enter.transition().duration(500).attr('opacity', 1) : enter),
            update => {
              const oldPath = update.attr('d');
              return update
                .transition().duration(800)
                .attrTween('d', () => createPathInterpolator(oldPath, insideLine));
            }
          );

        svg.selectAll<SVGPathElement, typeof outsideLine>('.outside-line')
          .data([outsideLine])
          .join(
            enter => enter.append('path')
              .attr('class', 'outside-line')
              .attr('transform', `translate(${margin.left},${margin.top})`)
              .attr('fill', 'none')
              .attr('stroke', colors.nonmita)
              .attr('stroke-width', 3)
              .attr('d', lineGenerator)
              .attr('opacity', animateOLS ? 0 : 1)
              .call(enter => animateOLS ? enter.transition().duration(500).attr('opacity', 1) : enter),
            update => {
              const oldPath = update.attr('d');
              return update
                .transition().duration(800)
                .attrTween('d', () => createPathInterpolator(oldPath, outsideLine));
            }
          );
      }

      if (showEffect) {
        const discontinuity = scatterPhase === 'effect'
          ? fittedLines.paperDiscontinuity
          : fittedLines.naiveDiscontinuity;

        // Get y values at x=0 for the effect line
        const insideY0 = insideLine.find(d => d.x === 0)?.y ?? insideLine[0]?.y;
        const outsideY0 = outsideLine.find(d => d.x === 0)?.y ?? outsideLine[outsideLine.length - 1]?.y;
        const y1 = yScale(insideY0);
        const y2 = yScale(outsideY0);
        const xPos = xScale(0);

        // Effect line with smooth transition
        svg.selectAll<SVGLineElement, number[]>('.effect-line')
          .data([[y1, y2]])
          .join(
            enter => enter.append('line')
              .attr('class', 'effect-line')
              .attr('transform', `translate(${margin.left},${margin.top})`)
              .attr('x1', xPos)
              .attr('x2', xPos)
              .attr('y1', d => d[0])
              .attr('y2', d => d[1])
              .attr('stroke', '#F7FAFC')
              .attr('stroke-width', 4)
              .attr('opacity', animateEffect ? 0 : 1)
              .call(enter => animateEffect ? enter.transition().duration(500).delay(300).attr('opacity', 1) : enter),
            update => update
              .call(update => shouldPreserveElements
                ? update.transition().duration(600)
                    .attr('y1', d => d[0])
                    .attr('y2', d => d[1])
                : update.attr('y1', d => d[0]).attr('y2', d => d[1]))
          );

        const formatEffect = () => {
          if (currentOutcome === 'consumption') {
            const pctChange = (Math.exp(discontinuity) - 1) * 100;
            return `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}%`;
          } else if (currentOutcome === 'stunting') {
            return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(1)}pp`;
          } else {
            return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(0)} m/km²`;
          }
        };

        const labelText = formatEffect();
        const labelX = xPos + 20;
        const labelY = (y1 + y2) / 2;

        // Label rect with smooth transition
        svg.selectAll<SVGRectElement, number>('.effect-label-rect')
          .data([labelY])
          .join(
            enter => enter.append('rect')
              .attr('class', 'effect-label-rect')
              .attr('transform', `translate(${margin.left},${margin.top})`)
              .attr('x', labelX - 10)
              .attr('y', d => d - 14)
              .attr('width', labelText.length * 10 + 20)
              .attr('height', 28)
              .attr('rx', 4)
              .attr('fill', colors.mitaDarker)
              .attr('stroke', '#E2E8F0')
              .attr('stroke-width', 2)
              .attr('opacity', animateEffect ? 0 : 1)
              .call(enter => animateEffect ? enter.transition().duration(500).delay(400).attr('opacity', 1) : enter),
            update => update
              .call(update => shouldPreserveElements
                ? update.transition().duration(600)
                    .attr('y', d => d - 14)
                    .attr('width', labelText.length * 10 + 20)
                : update.attr('y', d => d - 14).attr('width', labelText.length * 10 + 20))
          );

        // Label text with smooth transition
        svg.selectAll<SVGTextElement, number>('.effect-label-text')
          .data([labelY])
          .join(
            enter => enter.append('text')
              .attr('class', 'effect-label-text')
              .attr('transform', `translate(${margin.left},${margin.top})`)
              .attr('x', labelX)
              .attr('y', d => d)
              .attr('dy', '0.35em')
              .attr('font-size', '14px')
              .attr('font-weight', '700')
              .attr('fill', '#F7FAFC')
              .text(labelText)
              .attr('opacity', animateEffect ? 0 : 1)
              .call(enter => animateEffect ? enter.transition().duration(500).delay(400).attr('opacity', 1) : enter),
            update => update
              .text(labelText)
              .call(update => shouldPreserveElements
                ? update.transition().duration(600).attr('y', d => d)
                : update.attr('y', d => d))
          );
      }

      // Update prev ref after rendering
      prevScatterPhaseRef.current = scatterPhase;
    }

    // Update outcome ref at the end
    prevOutcomeRef.current = currentOutcome;

  }, [currentProgress, currentOutcome, scatterPhase, mergedData, scatterData, allScatterData, fittedLines, dimensions, showDistricts, currentZoom]);

  // Dynamic title
  const getTitle = () => {
    if (currentProgress < 0.3) return 'The mita boundary';
    if (currentProgress < 0.8) return 'Districts become data points...';
    return outcomeLabels[currentOutcome];
  };

  return (
    <div className="unified-viz" style={{ position: 'relative' }}>
      <h3 className="chart-title">{getTitle()}</h3>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        style={{
          maxWidth: '100%',
          height: 'auto',
          background: currentProgress < 0.3 ? '#f5f5f5' : 'transparent',
          transition: 'background 0.3s ease'
        }}
      />
      {currentProgress < 0.3 && (
        <div className="map-legend" style={{ opacity: 1 - currentProgress * 3 }}>
          <div className="legend-item">
            <span className="legend-color mita-region"></span>
            <span>Mita region</span>
          </div>
          <div className="legend-item">
            <span className="legend-color outside-region"></span>
            <span>Non-mita region</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedViz;
