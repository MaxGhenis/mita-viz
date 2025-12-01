import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import mitaData from '../data/mitaData.json';
import { colors } from '../colors';

interface RDDChartProps {
  outcome: 'consumption' | 'stunting' | 'roads';
  phase?: 'dots' | 'ols' | 'naive-effect' | 'effect'; // Progressive reveal phase
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

// Get districts that have ALL outcomes (these will animate)
const getAnimatableUbigeos = () => {
  return new Set(
    (mitaData as DistrictData[])
      .filter((d) =>
        d.distance !== null &&
        d.consumption !== null && d.consumption > 0 &&
        d.stunting !== null && d.stunting > 0 &&
        d.roads !== null && d.roads > 0
      )
      .map(d => d.ubigeo)
  );
};

const animatableUbigeos = getAnimatableUbigeos();

// Process data for a specific outcome - includes ALL districts with that outcome
const processData = (outcome: 'consumption' | 'stunting' | 'roads') => {
  return (mitaData as DistrictData[])
    .filter((d) => {
      const value = d[outcome];
      return d.distance !== null && value !== null && value > 0;
    })
    .map((d) => {
      const rawValue = d[outcome] as number;
      const value = outcome === 'stunting' ? rawValue * 100 : rawValue;
      return {
        x: d.distance as number,
        y: value,
        distance: d.distance as number,
        value: value,
        isInside: d.isInside,
        ubigeo: d.ubigeo,
        isAnimatable: animatableUbigeos.has(d.ubigeo), // Can this dot animate?
      };
    });
};

// Dell (2010) regression discontinuity estimates (Table 2)
// These are the proper econometric estimates with controls
const PAPER_COEFFICIENTS = {
  consumption: -0.25,  // log points (≈ -22% consumption)
  stunting: 0.06,      // 6 percentage points higher stunting
  roads: -0.31,        // km road density
};

// Calculate OLS fitted lines for visualization
// Note: We use our simple OLS for the line slopes, but the paper's coefficients for the discontinuity
const calculateFittedLines = (outcome: 'consumption' | 'stunting' | 'roads') => {
  const data = processData(outcome);
  const insideData = data.filter((d) => d.isInside);
  const outsideData = data.filter((d) => !d.isInside);

  const calcOLS = (points: { distance: number; value: number }[]) => {
    const n = points.length;
    if (n < 2) return { intercept: 0, slope: 0 };
    const sumX = points.reduce((s, p) => s + p.distance, 0);
    const sumY = points.reduce((s, p) => s + p.value, 0);
    const sumXY = points.reduce((s, p) => s + p.distance * p.value, 0);
    const sumX2 = points.reduce((s, p) => s + p.distance * p.distance, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { intercept, slope };
  };

  const insideOLS = calcOLS(insideData);
  const outsideOLS = calcOLS(outsideData);

  const minInside = Math.min(...insideData.map((d) => d.distance));
  const maxOutside = Math.max(...outsideData.map((d) => d.distance));

  const insideLine = [];
  for (let d = Math.floor(minInside); d <= 0; d += 2) {
    insideLine.push({ distance: d, fitted: insideOLS.intercept + insideOLS.slope * d });
  }

  const outsideLine = [];
  for (let d = 0; d <= Math.ceil(maxOutside); d += 2) {
    outsideLine.push({ distance: d, fitted: outsideOLS.intercept + outsideOLS.slope * d });
  }

  // Naive OLS discontinuity (our simple estimate)
  const naiveDiscontinuity = insideOLS.intercept - outsideOLS.intercept;

  // Paper's controlled RD estimates
  // For stunting, convert from proportion to percentage points
  const paperDiscontinuity = outcome === 'stunting'
    ? PAPER_COEFFICIENTS[outcome] * 100  // Convert to percentage points
    : PAPER_COEFFICIENTS[outcome];

  return { insideLine, outsideLine, naiveDiscontinuity, paperDiscontinuity };
};

const outcomeLabels = {
  consumption: 'Log household consumption (2001)',
  stunting: 'Child stunting rate (2005)',
  roads: 'Road density in km (2006)',
};

const RDDChart: React.FC<RDDChartProps> = ({ outcome, phase = 'effect' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: any } | null>(null);

  const data = useMemo(() => processData(outcome), [outcome]);
  const { insideLine, outsideLine, naiveDiscontinuity, paperDiscontinuity } = useMemo(
    () => calculateFittedLines(outcome),
    [outcome]
  );

  // Use naive estimate for 'naive-effect' phase, paper's for 'effect' phase
  const discontinuity = phase === 'naive-effect' ? naiveDiscontinuity : paperDiscontinuity;

  const insideData = data.filter((d) => d.isInside);
  const outsideData = data.filter((d) => !d.isInside);

  // Chart dimensions
  const margin = { top: 40, right: 30, bottom: 50, left: 60 };
  const width = 700;
  const height = 400;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Y domain based on outcome
  const yDomain: [number, number] = outcome === 'stunting'
    ? [0, 100]
    : [
        Math.floor(Math.min(...data.map(d => d.y)) * 0.95),
        Math.ceil(Math.max(...data.map(d => d.y)) * 1.05)
      ];

  // Format discontinuity (mita effect = inside - outside)
  const formatDiscontinuity = () => {
    if (outcome === 'consumption') {
      const pctChange = (Math.exp(discontinuity) - 1) * 100;
      return `${pctChange.toFixed(1)}% consumption in mita districts`;
    } else if (outcome === 'stunting') {
      const ppChange = discontinuity;
      return `${ppChange > 0 ? '+' : ''}${ppChange.toFixed(1)}pp stunting in mita districts`;
    } else {
      return `${discontinuity.toFixed(1)} km road density in mita districts`;
    }
  };

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);

    // Scales
    const xScale = d3.scaleLinear().domain([-50, 50]).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

    // Select or create the main group
    let g = svg.select<SVGGElement>('g.chart-content');
    if (g.empty()) {
      g = svg.append('g')
        .attr('class', 'chart-content')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      // Background regions
      g.append('rect')
        .attr('class', 'mita-region')
        .attr('x', xScale(-50))
        .attr('width', xScale(0) - xScale(-50))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', colors.mita)
        .attr('opacity', 0.08);

      g.append('rect')
        .attr('class', 'nonmita-region')
        .attr('x', xScale(0))
        .attr('width', xScale(50) - xScale(0))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', colors.nonmita)
        .attr('opacity', 0.08);

      // Region labels
      g.append('text')
        .attr('x', xScale(-25))
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.mitaDark)
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .text('Mita');

      g.append('text')
        .attr('x', xScale(25))
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.nonmita)
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .text('Non-mita');

      // Grid lines
      g.append('g')
        .attr('class', 'grid-x')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => ''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('.tick line').attr('stroke', colors.gridLine).attr('stroke-dasharray', '3,3'));

      g.append('g')
        .attr('class', 'grid-y')
        .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ''))
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('.tick line').attr('stroke', colors.gridLine).attr('stroke-dasharray', '3,3'));

      // Axes
      g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${innerHeight})`);

      g.append('g')
        .attr('class', 'y-axis');

      // X-axis label
      g.append('text')
        .attr('class', 'x-label')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + 40)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .attr('font-size', '12px')
        .text('Distance from mita boundary (km)');

      // Boundary line
      g.append('line')
        .attr('class', 'boundary-line')
        .attr('x1', xScale(0))
        .attr('x2', xScale(0))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', colors.nonmita)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5');

      // Fitted lines groups
      g.append('path').attr('class', 'fitted-line-inside').attr('opacity', 0);
      g.append('path').attr('class', 'fitted-line-outside').attr('opacity', 0);

      // Treatment effect brace group (added before dots so dots are on top)
      g.append('path').attr('class', 'treatment-brace').attr('opacity', 0);
      g.append('rect').attr('class', 'treatment-label-bg').attr('opacity', 0);
      g.append('text').attr('class', 'treatment-label').attr('opacity', 0);

      // Dots group
      g.append('g').attr('class', 'dots');
    }

    // Update Y scale and axis
    yScale.domain(yDomain);

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => outcome === 'stunting' ? `${d}%` : String(d));

    g.select<SVGGElement>('.y-axis')
      .transition()
      .duration(500)
      .call(yAxis);

    g.select<SVGGElement>('.x-axis')
      .call(d3.axisBottom(xScale).ticks(5));

    // Update grid
    g.select<SVGGElement>('.grid-y')
      .transition()
      .duration(500)
      .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ''))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').attr('stroke', colors.gridLine).attr('stroke-dasharray', '3,3'));

    // Update fitted lines
    const lineGenerator = d3.line<{ distance: number; fitted: number }>()
      .x(d => xScale(d.distance))
      .y(d => yScale(d.fitted));

    // Show OLS lines only in 'ols' or 'effect' phase
    const showOLS = phase === 'ols' || phase === 'effect';

    g.select('.fitted-line-inside')
      .datum(insideLine)
      .transition()
      .duration(500)
      .attr('d', lineGenerator)
      .attr('fill', 'none')
      .attr('stroke', colors.mitaDark)
      .attr('stroke-width', 3)
      .attr('opacity', showOLS ? 1 : 0);

    g.select('.fitted-line-outside')
      .datum(outsideLine)
      .transition()
      .duration(500)
      .attr('d', lineGenerator)
      .attr('fill', 'none')
      .attr('stroke', colors.nonmita)
      .attr('stroke-width', 3)
      .attr('opacity', showOLS ? 1 : 0);

    // Show treatment effect brace only in 'effect' phase
    const showEffect = phase === 'naive-effect' || phase === 'effect';

    // Get the y positions at x=0 for both lines (the intercepts)
    const insideY0 = insideLine.find(d => d.distance === 0)?.fitted ?? insideLine[insideLine.length - 1]?.fitted;
    const outsideY0 = outsideLine.find(d => d.distance === 0)?.fitted ?? outsideLine[0]?.fitted;

    if (insideY0 !== undefined && outsideY0 !== undefined) {
      const y1 = yScale(insideY0);
      const y2 = yScale(outsideY0);
      const xPos = xScale(0) - 5; // Position brace on LEFT side of boundary (mita side)
      const braceWidth = 8;

      // Create curly brace path - opens to the LEFT (toward mita region)
      const createBracePath = (x: number, yTop: number, yBottom: number, width: number) => {
        const midY = (yTop + yBottom) / 2;
        const height = Math.abs(yBottom - yTop);
        const curveSize = Math.min(height * 0.12, 6);

        // Mirror the brace to open leftward
        return `M ${x} ${yTop}
                Q ${x - width} ${yTop}, ${x - width} ${yTop + curveSize * 2}
                L ${x - width} ${midY - curveSize}
                Q ${x - width} ${midY}, ${x - width * 1.8} ${midY}
                Q ${x - width} ${midY}, ${x - width} ${midY + curveSize}
                L ${x - width} ${yBottom - curveSize * 2}
                Q ${x - width} ${yBottom}, ${x} ${yBottom}`;
      };

      g.select('.treatment-brace')
        .transition()
        .duration(500)
        .attr('d', createBracePath(xPos, Math.min(y1, y2), Math.max(y1, y2), braceWidth))
        .attr('fill', 'none')
        .attr('stroke', colors.textDark)
        .attr('stroke-width', 2)
        .attr('opacity', showEffect ? 1 : 0);

      // Format treatment effect label (mita effect = inside - outside)
      const formatEffect = () => {
        if (outcome === 'consumption') {
          const pctChange = (Math.exp(discontinuity) - 1) * 100;
          return `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}%`;
        } else if (outcome === 'stunting') {
          return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(1)}pp`;
        } else {
          return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(1)} km`;
        }
      };

      const labelText = showEffect ? formatEffect() : '';
      const labelPadding = { x: 6, y: 4 };
      const labelWidth = labelText.length * 7 + labelPadding.x * 2;
      const labelHeight = 18;
      // Position label to the LEFT of the brace
      const labelX = xPos - braceWidth * 2 - labelWidth + labelPadding.x;
      const labelY = (y1 + y2) / 2;

      // Background box for label
      g.select('.treatment-label-bg')
        .transition()
        .duration(500)
        .attr('x', labelX - labelPadding.x)
        .attr('y', labelY - labelHeight / 2)
        .attr('width', labelWidth)
        .attr('height', labelHeight)
        .attr('rx', 3)
        .attr('fill', 'white')
        .attr('stroke', colors.mitaDark)
        .attr('stroke-width', 1.5)
        .attr('opacity', showEffect ? 1 : 0);

      g.select('.treatment-label')
        .transition()
        .duration(500)
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('dy', '0.35em')
        .attr('font-size', '11px')
        .attr('font-weight', '700')
        .attr('fill', colors.mitaDark)
        .attr('opacity', showEffect ? 1 : 0)
        .text(labelText);
    }

    // Update dots with transitions - separate animatable from non-animatable
    const dotsGroup = g.select('.dots');

    const dots = dotsGroup
      .selectAll<SVGCircleElement, typeof data[0]>('circle')
      .data(data, d => String(d.ubigeo));

    // Enter new dots - fade in
    const entering = dots.enter()
      .append('circle')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', 5)
      .attr('fill', d => d.isInside ? colors.mita : colors.nonmita)
      .attr('opacity', 0)
      .on('mouseenter', (event, d) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltip({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            data: d
          });
        }
      })
      .on('mouseleave', () => setTooltip(null));

    // Fade in new dots
    entering
      .transition()
      .duration(300)
      .attr('opacity', 0.7);

    // Update existing dots - animate position for animatable, instant for others
    dots
      .transition()
      .duration(d => d.isAnimatable ? 500 : 0)
      .ease(d3.easeQuadOut)
      .attr('cy', d => yScale(d.y))
      .attr('opacity', 0.7);

    // Remove old dots - fade out
    dots.exit()
      .transition()
      .duration(300)
      .attr('opacity', 0)
      .remove();

  }, [outcome, phase, data, insideLine, outsideLine, discontinuity, yDomain, innerWidth, innerHeight, margin]);

  return (
    <div className="rdd-chart" style={{ position: 'relative' }}>
      <h3 className="chart-title">{outcomeLabels[outcome]}</h3>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: '100%', height: 'auto' }}
      />

      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 10,
          top: tooltip.y - 10,
          background: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '8px 12px',
          fontSize: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          <div><strong>District {tooltip.data.ubigeo}</strong></div>
          <div>Distance: {tooltip.data.distance.toFixed(1)} km</div>
          <div>{outcomeLabels[outcome]}: {outcome === 'stunting' ? `${tooltip.data.value.toFixed(1)}%` : tooltip.data.value.toFixed(2)}</div>
          <div style={{ color: tooltip.data.isInside ? colors.mita : colors.nonmita }}>
            {tooltip.data.isInside ? 'Mita district' : 'Non-mita district'}
          </div>
        </div>
      )}

      <div className="chart-annotation">
        <p className="discontinuity-note">
          <strong>{phase === 'naive-effect' ? 'Simple OLS estimate' : 'Mita effect (Dell 2010)'}:</strong> {formatDiscontinuity()}
          {phase === 'naive-effect' && <span style={{ fontSize: '0.85em', color: 'rgb(var(--gray))' }}> (without controls)</span>}
        </p>
        <p className="methodology-note">
          {phase === 'naive-effect'
            ? 'This simple regression doesn\'t control for geography, elevation, or other factors. The paper\'s estimate uses polynomial RD with geographic controls for a more robust causal estimate.'
            : 'Simply comparing mita vs. non-mita districts would be misleading—maybe mita regions differed before 1573. Instead, we compare districts just inside vs. just outside the boundary, which shared similar characteristics. The sharp jump at the boundary isolates the mita\'s causal effect.'}
        </p>
        <p className="stats-note">
          <strong>N = {data.length} districts</strong> |
          Inside mita: {insideData.length} |
          Outside mita: {outsideData.length}
        </p>
      </div>
    </div>
  );
};

export default RDDChart;
