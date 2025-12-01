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
// Note: We flip the sign so mita (inside) is positive, non-mita (outside) is negative
// This matches Dell's convention and puts treatment on the right side
const processData = (outcome: 'consumption' | 'stunting' | 'roads') => {
  return (mitaData as DistrictData[])
    .filter((d) => {
      const value = d[outcome];
      return d.distance !== null && value !== null && value > 0;
    })
    .map((d) => {
      const rawValue = d[outcome] as number;
      const value = outcome === 'stunting' ? rawValue * 100 : rawValue;
      // Flip sign: mita (isInside=true) should be positive, non-mita negative
      const flippedDistance = d.isInside ? Math.abs(d.distance as number) : -Math.abs(d.distance as number);
      return {
        x: flippedDistance,
        y: value,
        distance: flippedDistance,
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

// Calculate fitted lines - both linear OLS and polynomial versions
const calculateFittedLines = (outcome: 'consumption' | 'stunting' | 'roads') => {
  const data = processData(outcome);
  const insideData = data.filter((d) => d.isInside);
  const outsideData = data.filter((d) => !d.isInside);

  // Simple linear OLS: y = a + b*x
  const calcLinearOLS = (points: { distance: number; value: number }[]) => {
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.distance, 0);
    const sumY = points.reduce((s, p) => s + p.value, 0);
    const sumXY = points.reduce((s, p) => s + p.distance * p.value, 0);
    const sumX2 = points.reduce((s, p) => s + p.distance * p.distance, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { intercept, slope };
  };

  // Quadratic polynomial regression: y = a + b*x + c*x^2
  const calcQuadraticOLS = (points: { distance: number; value: number }[]) => {
    const n = points.length;
    if (n < 3) {
      const linear = calcLinearOLS(points);
      return { ...linear, quadratic: 0 };
    }

    const sumX = points.reduce((s, p) => s + p.distance, 0);
    const sumX2 = points.reduce((s, p) => s + p.distance ** 2, 0);
    const sumX3 = points.reduce((s, p) => s + p.distance ** 3, 0);
    const sumX4 = points.reduce((s, p) => s + p.distance ** 4, 0);
    const sumY = points.reduce((s, p) => s + p.value, 0);
    const sumXY = points.reduce((s, p) => s + p.distance * p.value, 0);
    const sumX2Y = points.reduce((s, p) => s + p.distance ** 2 * p.value, 0);

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

  // Calculate both linear and polynomial fits
  const insideLinear = calcLinearOLS(insideData);
  const outsideLinear = calcLinearOLS(outsideData);
  const insidePoly = calcQuadraticOLS(insideData);
  const outsidePoly = calcQuadraticOLS(outsideData);

  // With flipped convention: inside (mita) is positive, outside (non-mita) is negative
  const maxInside = Math.max(...insideData.map((d) => d.distance));  // Positive values
  const minOutside = Math.min(...outsideData.map((d) => d.distance)); // Negative values

  // Paper's discontinuity (mita effect = inside - outside)
  const paperDiscontinuity = outcome === 'stunting'
    ? PAPER_COEFFICIENTS[outcome] * 100  // Convert to percentage points
    : PAPER_COEFFICIENTS[outcome];

  // Calculate what the naive OLS discontinuity would be (from linear fit)
  const naiveDiscontinuity = insideLinear.intercept - outsideLinear.intercept;

  // For the paper's estimate, we adjust intercepts to show the paper's discontinuity
  const allMean = data.reduce((s, d) => s + d.value, 0) / data.length;
  const paperOutsideIntercept = allMean;
  const paperInsideIntercept = allMean + paperDiscontinuity;

  // Generate LINEAR line points (for 'ols' and 'naive-effect' phases)
  // Inside (mita) goes from 0 to maxInside (positive)
  // Outside (non-mita) goes from minOutside (negative) to 0
  const insideLineLinear = [
    { distance: 0, fitted: insideLinear.intercept },
    { distance: Math.ceil(maxInside), fitted: insideLinear.intercept + insideLinear.slope * Math.ceil(maxInside) }
  ];
  const outsideLineLinear = [
    { distance: Math.floor(minOutside), fitted: outsideLinear.intercept + outsideLinear.slope * Math.floor(minOutside) },
    { distance: 0, fitted: outsideLinear.intercept }
  ];

  // Generate POLYNOMIAL curve points (for 'effect' phase with paper's adjusted intercepts)
  // Inside (mita): 0 to maxInside (positive direction)
  const insideLinePoly = [];
  for (let d = 0; d <= Math.ceil(maxInside); d += 1) {
    insideLinePoly.push({
      distance: d,
      fitted: paperInsideIntercept + insidePoly.slope * d + insidePoly.quadratic * d * d
    });
  }

  // Outside (non-mita): minOutside (negative) to 0
  const outsideLinePoly = [];
  for (let d = Math.floor(minOutside); d <= 0; d += 1) {
    outsideLinePoly.push({
      distance: d,
      fitted: paperOutsideIntercept + outsidePoly.slope * d + outsidePoly.quadratic * d * d
    });
  }

  return {
    insideLineLinear,
    outsideLineLinear,
    insideLinePoly,
    outsideLinePoly,
    naiveDiscontinuity,
    paperDiscontinuity
  };
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
  const {
    insideLineLinear,
    outsideLineLinear,
    insideLinePoly,
    outsideLinePoly,
    naiveDiscontinuity,
    paperDiscontinuity
  } = useMemo(
    () => calculateFittedLines(outcome),
    [outcome]
  );

  // Use naive estimate for early phases, paper's estimate for 'effect' phase
  const usePolynomial = phase === 'effect';
  const discontinuity = usePolynomial ? paperDiscontinuity : naiveDiscontinuity;
  const insideLine = usePolynomial ? insideLinePoly : insideLineLinear;
  const outsideLine = usePolynomial ? outsideLinePoly : outsideLineLinear;

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

      // Background regions - mita on RIGHT, non-mita on LEFT
      g.append('rect')
        .attr('class', 'nonmita-region')
        .attr('x', xScale(-50))
        .attr('width', xScale(0) - xScale(-50))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', colors.nonmita)
        .attr('opacity', 0.08);

      g.append('rect')
        .attr('class', 'mita-region')
        .attr('x', xScale(0))
        .attr('width', xScale(50) - xScale(0))
        .attr('y', 0)
        .attr('height', innerHeight)
        .attr('fill', colors.mita)
        .attr('opacity', 0.08);

      // Region labels
      g.append('text')
        .attr('x', xScale(-25))
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.nonmita)
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .text('Non-mita');

      g.append('text')
        .attr('x', xScale(25))
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .attr('fill', colors.mitaDark)
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .text('Mita');

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

      // Dots group
      g.append('g').attr('class', 'dots');

      // Treatment effect brace and label (added AFTER dots so label is on top)
      g.append('path').attr('class', 'treatment-brace').attr('opacity', 0);
      g.append('rect').attr('class', 'treatment-label-bg').attr('opacity', 0);
      g.append('text').attr('class', 'treatment-label').attr('opacity', 0);
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

    // X-axis shows absolute distance (positive both directions)
    g.select<SVGGElement>('.x-axis')
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => String(Math.abs(d as number))));

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

    // Show OLS lines in 'ols', 'naive-effect', and 'effect' phases
    const showOLS = phase === 'ols' || phase === 'naive-effect' || phase === 'effect';

    // For 'dots' phase, set opacity immediately without transition to prevent flash
    const insideLineEl = g.select('.fitted-line-inside').datum(insideLine);
    const outsideLineEl = g.select('.fitted-line-outside').datum(outsideLine);

    if (phase === 'dots') {
      // No transition - immediately hide
      insideLineEl
        .attr('d', lineGenerator)
        .attr('fill', 'none')
        .attr('stroke', colors.mitaDark)
        .attr('stroke-width', 3)
        .attr('opacity', 0);
      outsideLineEl
        .attr('d', lineGenerator)
        .attr('fill', 'none')
        .attr('stroke', colors.nonmita)
        .attr('stroke-width', 3)
        .attr('opacity', 0);
    } else {
      // Transition for other phases
      insideLineEl
        .transition()
        .duration(500)
        .attr('d', lineGenerator)
        .attr('fill', 'none')
        .attr('stroke', colors.mitaDark)
        .attr('stroke-width', 3)
        .attr('opacity', showOLS ? 1 : 0);
      outsideLineEl
        .transition()
        .duration(500)
        .attr('d', lineGenerator)
        .attr('fill', 'none')
        .attr('stroke', colors.nonmita)
        .attr('stroke-width', 3)
        .attr('opacity', showOLS ? 1 : 0);
    }

    // Show treatment effect brace only in 'effect' phase
    const showEffect = phase === 'naive-effect' || phase === 'effect';

    // Get the y positions at x=0 for both lines (the intercepts)
    // Inside line starts at 0, outside line ends at 0
    const insideY0 = insideLine.find(d => d.distance === 0)?.fitted ?? insideLine[0]?.fitted;
    const outsideY0 = outsideLine.find(d => d.distance === 0)?.fitted ?? outsideLine[outsideLine.length - 1]?.fitted;

    if (insideY0 !== undefined && outsideY0 !== undefined) {
      const y1 = yScale(insideY0);
      const y2 = yScale(outsideY0);
      const xPos = xScale(0) + 5; // Position brace on RIGHT side of boundary (mita side)
      const braceWidth = 8;

      // Create curly brace path - opens to the RIGHT (toward mita region)
      const createBracePath = (x: number, yTop: number, yBottom: number, width: number) => {
        const midY = (yTop + yBottom) / 2;
        const height = Math.abs(yBottom - yTop);
        const curveSize = Math.min(height * 0.12, 6);

        // Brace opens rightward
        return `M ${x} ${yTop}
                Q ${x + width} ${yTop}, ${x + width} ${yTop + curveSize * 2}
                L ${x + width} ${midY - curveSize}
                Q ${x + width} ${midY}, ${x + width * 1.8} ${midY}
                Q ${x + width} ${midY}, ${x + width} ${midY + curveSize}
                L ${x + width} ${yBottom - curveSize * 2}
                Q ${x + width} ${yBottom}, ${x} ${yBottom}`;
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
      const labelPadding = { x: 10, y: 6 };
      const labelWidth = labelText.length * 10 + labelPadding.x * 2;
      const labelHeight = 28;
      // Position label to the RIGHT of the brace
      const labelX = xPos + braceWidth * 2;
      const labelY = (y1 + y2) / 2;

      // Background box for label - solid white background
      g.select('.treatment-label-bg')
        .transition()
        .duration(500)
        .attr('x', labelX - labelPadding.x)
        .attr('y', labelY - labelHeight / 2)
        .attr('width', labelWidth)
        .attr('height', labelHeight)
        .attr('rx', 4)
        .attr('fill', 'white')
        .attr('fill-opacity', 1)
        .attr('stroke', colors.mitaDark)
        .attr('stroke-width', 2)
        .attr('opacity', showEffect ? 1 : 0)
        .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))');

      g.select('.treatment-label')
        .transition()
        .duration(500)
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('dy', '0.35em')
        .attr('font-size', '14px')
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
