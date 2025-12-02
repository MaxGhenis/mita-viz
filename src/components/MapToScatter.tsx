import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import districtPolygons from '../data/districtPolygons.json';
import mitaData from '../data/mitaData.json';
import { colors } from '../colors';

interface MapToScatterProps {
  // 0 = map, 1 = scatter, intermediate values for animation
  morphProgress: number;
  outcome: 'consumption' | 'stunting' | 'roads';
  showDistricts?: boolean;
  scatterPhase?: 'dots' | 'ols' | 'naive-effect' | 'effect';
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

const MapToScatter: React.FC<MapToScatterProps> = ({
  morphProgress,
  outcome,
  showDistricts = true,
  scatterPhase = 'effect'
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions] = useState({ width: 700, height: 500 });
  const animationRef = useRef<number | null>(null);
  const [currentProgress, setCurrentProgress] = useState(morphProgress);

  const mergedData = useMemo(() => mergeData(), []);

  // Smooth animation when morphProgress changes
  useEffect(() => {
    // Capture current value at start of animation
    let startProgress = currentProgress;
    const targetProgress = morphProgress;
    const duration = 800; // ms
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease in-out
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

  // Filter data for scatter plot (needs valid outcome values)
  const scatterData = useMemo(() => {
    return mergedData.filter(d => {
      const value = d[outcome];
      return d.distance !== null && value !== null && value > 0;
    }).map(d => {
      const rawValue = d[outcome] as number;
      const value = outcome === 'stunting' ? rawValue * 100 : rawValue;
      const flippedDistance = d.isInside ? Math.abs(d.distance as number) : -Math.abs(d.distance as number);
      return { ...d, scatterX: flippedDistance, scatterY: value };
    });
  }, [mergedData, outcome]);

  // Calculate fitted lines
  const fittedLines = useMemo(() => {
    const insideData = scatterData.filter(d => d.isInside);
    const outsideData = scatterData.filter(d => !d.isInside);

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

    const insideOLS = calcLinearOLS(insideData);
    const outsideOLS = calcLinearOLS(outsideData);

    const maxInside = Math.max(...insideData.map(d => d.scatterX), 0);
    const minOutside = Math.min(...outsideData.map(d => d.scatterX), 0);

    const paperDiscontinuity = outcome === 'stunting'
      ? PAPER_COEFFICIENTS[outcome] * 100
      : PAPER_COEFFICIENTS[outcome];
    const naiveDiscontinuity = insideOLS.intercept - outsideOLS.intercept;

    return {
      insideLine: [
        { x: 0, y: insideOLS.intercept },
        { x: Math.ceil(maxInside), y: insideOLS.intercept + insideOLS.slope * Math.ceil(maxInside) }
      ],
      outsideLine: [
        { x: Math.floor(minOutside), y: outsideOLS.intercept + outsideOLS.slope * Math.floor(minOutside) },
        { x: 0, y: outsideOLS.intercept }
      ],
      naiveDiscontinuity,
      paperDiscontinuity,
    };
  }, [scatterData, outcome]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = dimensions.width;
    const height = dimensions.height;
    const margin = { top: 40, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear and setup
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Geo projection for map view
    const allCoords: [number, number][] = [];
    mergedData.forEach(d => {
      d.polygon.forEach(p => allCoords.push([p[1], p[0]]));
    });

    const projection = geoMercator()
      .fitSize([innerWidth, innerHeight], {
        type: 'MultiPoint',
        coordinates: allCoords
      });

    const pathGenerator = geoPath().projection(projection);

    // Scatter scales
    const xScale = d3.scaleLinear().domain([-50, 50]).range([0, innerWidth]);
    const yDomain: [number, number] = outcome === 'stunting'
      ? [0, 100]
      : [
          Math.floor(Math.min(...scatterData.map(d => d.scatterY)) * 0.95),
          Math.ceil(Math.max(...scatterData.map(d => d.scatterY)) * 1.05)
        ];
    const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

    const t = currentProgress; // 0 = map, 1 = scatter

    // Background regions - fade in as we approach scatter
    const bgOpacity = t * 0.3;
    const mitaBgOpacity = t;

    if (t > 0) {
      g.append('rect')
        .attr('class', 'nonmita-region')
        .attr('x', xScale(-50))
        .attr('width', xScale(0) - xScale(-50))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', colors.nonmitaLight)
        .attr('opacity', bgOpacity);

      g.append('rect')
        .attr('class', 'mita-region')
        .attr('x', xScale(0))
        .attr('width', xScale(50) - xScale(0))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', '#222939')
        .attr('opacity', mitaBgOpacity);
    }

    // Region labels - fade in near end
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

    // Axes - fade in at end
    if (t > 0.8) {
      const axisOpacity = (t - 0.8) / 0.2;

      const xAxisG = g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .attr('opacity', axisOpacity);
      xAxisG.call(d3.axisBottom(xScale).ticks(5).tickFormat(d => String(Math.abs(d as number))));

      const yAxisG = g.append('g')
        .attr('opacity', axisOpacity);
      yAxisG.call(d3.axisLeft(yScale).ticks(5).tickFormat(d =>
        outcome === 'stunting' ? `${d}%` : String(d)
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

    // Draw based on progress
    if (t < 0.3) {
      // Pure map phase - show full polygons
      const polygonOpacity = 1 - (t / 0.3) * 0.3; // Fade slightly

      g.selectAll('.district')
        .data(mergedData)
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
        .attr('stroke', d => d.mita === 1 ? '#1A202C' : colors.nonmita)
        .attr('stroke-width', showDistricts ? 1 : 0)
        .attr('opacity', d => (d.mita === 1 ? 0.85 : 0.5) * polygonOpacity);

    } else {
      // Morphing/scatter phase - show dots moving from centroids to scatter positions
      const morphT = Math.min((t - 0.3) / 0.5, 1); // 0.3-0.8 is the morph range

      // Calculate dot size - starts larger (polygon-like) and shrinks
      const dotRadius = 8 - morphT * 3; // 8 -> 5

      g.selectAll('.morph-dot')
        .data(scatterData)
        .join('circle')
        .attr('class', 'morph-dot')
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
        .attr('opacity', 0.7 + morphT * 0.1)
        .attr('stroke', d => d.isInside ? '#1A202C' : '#fff')
        .attr('stroke-width', 1 - morphT * 0.5);
    }

    // Fitted lines - only at full scatter with appropriate phase
    if (t >= 1) {
      const showOLS = scatterPhase === 'ols' || scatterPhase === 'naive-effect' || scatterPhase === 'effect';
      const showEffect = scatterPhase === 'naive-effect' || scatterPhase === 'effect';

      if (showOLS) {
        const lineGenerator = d3.line<{ x: number; y: number }>()
          .x(d => xScale(d.x))
          .y(d => yScale(d.y));

        g.append('path')
          .datum(fittedLines.insideLine)
          .attr('d', lineGenerator)
          .attr('fill', 'none')
          .attr('stroke', '#E2E8F0')
          .attr('stroke-width', 3);

        g.append('path')
          .datum(fittedLines.outsideLine)
          .attr('d', lineGenerator)
          .attr('fill', 'none')
          .attr('stroke', colors.nonmita)
          .attr('stroke-width', 3);
      }

      if (showEffect) {
        const discontinuity = scatterPhase === 'effect'
          ? fittedLines.paperDiscontinuity
          : fittedLines.naiveDiscontinuity;

        const y1 = yScale(fittedLines.insideLine[0].y);
        const y2 = yScale(fittedLines.outsideLine[1].y);
        const xPos = xScale(0);

        g.append('line')
          .attr('x1', xPos)
          .attr('x2', xPos)
          .attr('y1', y1)
          .attr('y2', y2)
          .attr('stroke', '#F7FAFC')
          .attr('stroke-width', 4);

        const formatEffect = () => {
          if (outcome === 'consumption') {
            const pctChange = (Math.exp(discontinuity) - 1) * 100;
            return `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}%`;
          } else if (outcome === 'stunting') {
            return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(1)}pp`;
          } else {
            return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(0)} m/km²`;
          }
        };

        const labelText = formatEffect();
        const labelX = xPos + 20;
        const labelY = (y1 + y2) / 2;

        g.append('rect')
          .attr('x', labelX - 10)
          .attr('y', labelY - 14)
          .attr('width', labelText.length * 10 + 20)
          .attr('height', 28)
          .attr('rx', 4)
          .attr('fill', colors.mitaDarker)
          .attr('stroke', '#E2E8F0')
          .attr('stroke-width', 2);

        g.append('text')
          .attr('x', labelX)
          .attr('y', labelY)
          .attr('dy', '0.35em')
          .attr('font-size', '14px')
          .attr('font-weight', '700')
          .attr('fill', '#F7FAFC')
          .text(labelText);
      }
    }

  }, [currentProgress, outcome, scatterPhase, mergedData, scatterData, fittedLines, dimensions, showDistricts]);

  const outcomeLabels = {
    consumption: 'Log household consumption (2001)',
    stunting: 'Child stunting rate (2005)',
    roads: 'Road density (meters/km², 2006)',
  };

  // Dynamic title based on progress
  const getTitle = () => {
    if (currentProgress < 0.3) return 'The mita boundary';
    if (currentProgress < 0.8) return 'Districts become data points...';
    return outcomeLabels[outcome];
  };

  return (
    <div className="map-to-scatter" ref={containerRef} style={{ position: 'relative' }}>
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

export default MapToScatter;
