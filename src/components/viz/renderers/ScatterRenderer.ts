// Scatter plot rendering functions
import * as d3 from 'd3';
import { colors } from '../../../colors';
import { ScatterDataPoint, OutcomeType, FittedLines, ScatterPhase, Margin } from '../types';
import { OPACITY } from '../constants';
import { formatEffect } from '../fittedLineUtils';

interface ScatterBackgroundParams {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  xScale: d3.ScaleLinear<number, number>;
  innerHeight: number;
  t: number; // morphProgress
}

export const renderScatterBackgrounds = ({
  g,
  xScale,
  innerHeight,
  t,
}: ScatterBackgroundParams): void => {
  if (t <= 0) return;

  // Left side (non-mita region) - matches mita map color
  g.append('rect')
    .attr('x', xScale(-50))
    .attr('width', xScale(0) - xScale(-50))
    .attr('y', 0)
    .attr('height', innerHeight)
    .attr('fill', colors.mita)
    .attr('opacity', t * OPACITY.district);

  // Right side (mita region) - matches non-mita map color
  g.append('rect')
    .attr('x', xScale(0))
    .attr('width', xScale(50) - xScale(0))
    .attr('y', 0)
    .attr('height', innerHeight)
    .attr('fill', colors.nonmitaLight)
    .attr('opacity', t * OPACITY.district);
};

interface ScatterLabelsParams {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  xScale: d3.ScaleLinear<number, number>;
  t: number;
}

export const renderScatterLabels = ({
  g,
  xScale,
  t,
}: ScatterLabelsParams): void => {
  if (t <= 0.7) return;

  const labelOpacity = (t - 0.7) / 0.3;

  // Non-mita label - same color as non-mita dots
  g.append('text')
    .attr('x', xScale(-25))
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .attr('fill', colors.nonmitaLight)
    .attr('font-size', '13px')
    .attr('font-weight', '600')
    .attr('opacity', labelOpacity)
    .text('Non-mita');

  // Mita label - same color as mita dots
  g.append('text')
    .attr('x', xScale(25))
    .attr('y', 20)
    .attr('text-anchor', 'middle')
    .attr('fill', colors.mita)
    .attr('font-size', '13px')
    .attr('font-weight', '600')
    .attr('opacity', labelOpacity)
    .text('Mita');
};

interface ScatterAxesParams {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  innerWidth: number;
  innerHeight: number;
  currentOutcome: OutcomeType;
  t: number;
}

export const renderScatterAxes = ({
  g,
  xScale,
  yScale,
  innerWidth,
  innerHeight,
  currentOutcome,
  t,
}: ScatterAxesParams): void => {
  if (t <= 0.8) return;

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
    .attr('fill', colors.textMuted)
    .attr('font-size', '12px')
    .attr('opacity', axisOpacity)
    .text('Distance from mita boundary (km)');
};

interface ScatterDotsParams {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  scatterData: ScatterDataPoint[];
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  margin: Margin;
}

export const renderScatterDots = ({
  svg,
  scatterData,
  xScale,
  yScale,
  margin,
}: ScatterDotsParams): void => {
  svg.selectAll<SVGCircleElement, ScatterDataPoint>('.morph-dot')
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
    .attr('fill', d => d.isInside ? colors.mita : colors.nonmitaLight)
    .attr('opacity', OPACITY.dot);
};

interface FittedLinesParams {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  fittedLines: FittedLines;
  scatterPhase: ScatterPhase;
  prevScatterPhase: string;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  margin: Margin;
  currentOutcome: OutcomeType;
  shouldPreserveElements: boolean;
}

export const renderFittedLines = ({
  svg,
  fittedLines,
  scatterPhase,
  prevScatterPhase,
  xScale,
  yScale,
  margin,
  currentOutcome,
  shouldPreserveElements,
}: FittedLinesParams): void => {
  const showOLS = scatterPhase === 'ols' || scatterPhase === 'naive-effect' || scatterPhase === 'effect';
  const showEffect = scatterPhase === 'naive-effect' || scatterPhase === 'effect';
  const usePolynomial = scatterPhase === 'effect';

  const prevShowedOLS = prevScatterPhase === 'ols' || prevScatterPhase === 'naive-effect' || prevScatterPhase === 'effect';
  const prevShowedEffect = prevScatterPhase === 'naive-effect' || prevScatterPhase === 'effect';
  const animateOLS = showOLS && !prevShowedOLS;
  const animateEffect = showEffect && !prevShowedEffect;

  const insideLine = usePolynomial ? fittedLines.insideLinePoly : fittedLines.insideLineLinear;
  const outsideLine = usePolynomial ? fittedLines.outsideLinePoly : fittedLines.outsideLineLinear;

  if (showOLS) {
    renderOLSLines(svg, insideLine, outsideLine, xScale, yScale, margin, animateOLS);
  }

  if (showEffect) {
    const discontinuity = scatterPhase === 'effect'
      ? fittedLines.paperDiscontinuity
      : fittedLines.naiveDiscontinuity;

    renderEffectAnnotation(
      svg,
      insideLine,
      outsideLine,
      xScale,
      yScale,
      margin,
      discontinuity,
      currentOutcome,
      animateEffect,
      shouldPreserveElements
    );
  }
};

const renderOLSLines = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  insideLine: { x: number; y: number }[],
  outsideLine: { x: number; y: number }[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  margin: Margin,
  animate: boolean
): void => {
  const lineGenerator = d3.line<{ x: number; y: number }>()
    .x(d => xScale(d.x))
    .y(d => yScale(d.y))
    .curve(d3.curveLinear);

  const createPathInterpolator = (oldPath: string | null, newPoints: { x: number; y: number }[]) => {
    const newPath = lineGenerator(newPoints) || '';
    if (!oldPath) return () => newPath;

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

    if (oldPoints.length === newPointsParsed.length && oldPoints.length > 0) {
      return (t: number) => {
        const interpolated = oldPoints.map((oldPt, i) => {
          const newPt = newPointsParsed[i];
          const x = oldPt[0] + (newPt[0] - oldPt[0]) * t;
          const y = oldPt[1] + (newPt[1] - oldPt[1]) * t;
          return [x, y];
        });
        return 'M' + interpolated.map(p => `${p[0]},${p[1]}`).join('L');
      };
    }

    return d3.interpolateString(oldPath, newPath);
  };

  // Inside line (mita side - right side of scatter)
  svg.selectAll<SVGPathElement, typeof insideLine>('.inside-line')
    .data([insideLine])
    .join(
      enter => enter.append('path')
        .attr('class', 'inside-line')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('fill', 'none')
        .attr('stroke', colors.mitaStroke)
        .attr('stroke-width', 3)
        .attr('d', lineGenerator)
        .attr('opacity', animate ? 0 : 1)
        .call(enter => animate ? enter.transition().duration(500).attr('opacity', 1) : enter),
      update => {
        // Get old path from the actual DOM element
        const node = update.node();
        const oldPath = node ? node.getAttribute('d') : null;
        return update
          .transition().duration(800)
          .attrTween('d', () => createPathInterpolator(oldPath, insideLine));
      }
    );

  // Outside line (non-mita side - left side of scatter)
  svg.selectAll<SVGPathElement, typeof outsideLine>('.outside-line')
    .data([outsideLine])
    .join(
      enter => enter.append('path')
        .attr('class', 'outside-line')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('fill', 'none')
        .attr('stroke', colors.nonmitaLight)
        .attr('stroke-width', 3)
        .attr('d', lineGenerator)
        .attr('opacity', animate ? 0 : 1)
        .call(enter => animate ? enter.transition().duration(500).attr('opacity', 1) : enter),
      update => {
        // Get old path from the actual DOM element
        const node = update.node();
        const oldPath = node ? node.getAttribute('d') : null;
        return update
          .transition().duration(800)
          .attrTween('d', () => createPathInterpolator(oldPath, outsideLine));
      }
    );
};

const renderEffectAnnotation = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  insideLine: { x: number; y: number }[],
  outsideLine: { x: number; y: number }[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  margin: Margin,
  discontinuity: number,
  currentOutcome: OutcomeType,
  animate: boolean,
  shouldPreserveElements: boolean
): void => {
  const insideY0 = insideLine.find(d => d.x === 0)?.y ?? insideLine[0]?.y;
  const outsideY0 = outsideLine.find(d => d.x === 0)?.y ?? outsideLine[outsideLine.length - 1]?.y;
  const y1 = yScale(insideY0);
  const y2 = yScale(outsideY0);
  const xPos = xScale(0);

  // Effect line
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
        .attr('stroke', colors.effectLine)
        .attr('stroke-width', 4)
        .attr('opacity', animate ? 0 : 1)
        .call(enter => animate ? enter.transition().duration(500).delay(300).attr('opacity', 1) : enter),
      update => update
        .call(update => shouldPreserveElements
          ? update.transition().duration(600)
              .attr('y1', d => d[0])
              .attr('y2', d => d[1])
          : update.attr('y1', d => d[0]).attr('y2', d => d[1]))
    );

  const labelText = formatEffect(discontinuity, currentOutcome);
  const labelX = xPos + 20;
  const labelY = (y1 + y2) / 2;

  // Label rect
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
        .attr('stroke', colors.textLight)
        .attr('stroke-width', 2)
        .attr('opacity', animate ? 0 : 1)
        .call(enter => animate ? enter.transition().duration(500).delay(400).attr('opacity', 1) : enter),
      update => update
        .call(update => shouldPreserveElements
          ? update.transition().duration(600)
              .attr('y', d => d - 14)
              .attr('width', labelText.length * 10 + 20)
          : update.attr('y', d => d - 14).attr('width', labelText.length * 10 + 20))
    );

  // Label text
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
        .attr('fill', colors.effectLine)
        .text(labelText)
        .attr('opacity', animate ? 0 : 1)
        .call(enter => animate ? enter.transition().duration(500).delay(400).attr('opacity', 1) : enter),
      update => update
        .text(labelText)
        .call(update => shouldPreserveElements
          ? update.transition().duration(600).attr('y', d => d)
          : update.attr('y', d => d))
    );
};
