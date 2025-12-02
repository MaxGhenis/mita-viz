// Morph transition rendering (districts to dots)
import * as d3 from 'd3';
import { colors } from '../../../colors';
import { ScatterDataPoint, MergedDistrictData, OutcomeType, Margin } from '../types';
import { OPACITY, MORPH_TIMING } from '../constants';
import { getOutcomeY } from '../dataUtils';

interface MorphParams {
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  projection: d3.GeoProjection;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  mergedData: MergedDistrictData[];
  scatterData: ScatterDataPoint[];
  allScatterData: ScatterDataPoint[];
  scatterUbigeos: Set<number>;
  morphT: number; // 0-1 morph progress
  currentOutcome: OutcomeType;
  margin: Margin;
  innerHeight: number;
  isOutcomeTransition: boolean;
  isPhaseTransition: boolean;
  onHover?: (district: MergedDistrictData | null, event?: MouseEvent) => void;
}

// Apply easing function for smoother animation
const easeInOutQuad = (t: number): number => {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

export const renderMorph = ({
  g,
  svg,
  projection,
  xScale,
  yScale,
  mergedData,
  scatterData,
  allScatterData,
  scatterUbigeos,
  morphT,
  currentOutcome,
  margin,
  innerHeight,
  isOutcomeTransition,
  isPhaseTransition,
  onHover,
}: MorphParams): void => {
  const easedMorphT = easeInOutQuad(morphT);

  // Fade out districts without scatter data
  if (morphT < 1) {
    renderFadingDistricts(g, projection, mergedData, scatterUbigeos, easedMorphT);
  }

  // Handle different morph states
  if (morphT >= 1 && isOutcomeTransition) {
    renderOutcomeTransition(svg, allScatterData, xScale, yScale, margin, innerHeight, currentOutcome, onHover);
  } else if (morphT >= 1 && isPhaseTransition) {
    // Dots stay the same during phase transition
    svg.selectAll<SVGCircleElement, ScatterDataPoint>('.morph-dot')
      .data(scatterData, (d: any) => d.ubigeo);
  } else if (morphT < 1) {
    renderMorphingDistricts(g, projection, scatterData, xScale, yScale, easedMorphT);
    renderMorphingDots(svg, projection, scatterData, xScale, yScale, margin, morphT, easedMorphT, onHover);
  } else {
    renderFullScatterDots(svg, scatterData, xScale, yScale, margin, onHover);
  }
};

const renderFadingDistricts = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  projection: d3.GeoProjection,
  mergedData: MergedDistrictData[],
  scatterUbigeos: Set<number>,
  easedMorphT: number
): void => {
  const fadeOpacity = Math.max(0, 0.5 - easedMorphT * 0.8);
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
      return d3.geoPath().projection(projection)(geoJSON);
    })
    .attr('fill', d => d.mita === 1 ? colors.mita : colors.nonmitaLight)
    .attr('stroke', 'none')
    .attr('opacity', fadeOpacity);
};

const renderOutcomeTransition = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  allScatterData: ScatterDataPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  margin: Margin,
  innerHeight: number,
  currentOutcome: OutcomeType,
  onHover?: (district: MergedDistrictData | null, event?: MouseEvent) => void
): void => {
  svg.selectAll<SVGCircleElement, ScatterDataPoint>('.morph-dot')
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
        .attr('fill', d => d.isInside ? colors.mita : colors.nonmitaLight)
        .attr('opacity', 0)
        .style('cursor', 'pointer')
        .on('mousemove', function(event: MouseEvent, d: ScatterDataPoint) {
          if (onHover) onHover(d, event);
          d3.select(this).attr('r', 7).attr('opacity', 1);
        })
        .on('mouseout', function() {
          if (onHover) onHover(null);
          d3.select(this).attr('r', 5).attr('opacity', OPACITY.dot);
        })
        .call(enter => enter.transition().duration(600)
          .attr('opacity', d => getOutcomeY(d, currentOutcome) !== null ? OPACITY.dot : 0)),
      update => update
        .style('cursor', 'pointer')
        .on('mousemove', function(event: MouseEvent, d: ScatterDataPoint) {
          if (onHover) onHover(d, event);
          d3.select(this).attr('r', 7).attr('opacity', 1);
        })
        .on('mouseout', function() {
          if (onHover) onHover(null);
          d3.select(this).attr('r', 5).attr('opacity', OPACITY.dot);
        })
        .call(update => update.transition().duration(600)
          .attr('cy', d => {
            const yVal = getOutcomeY(d, currentOutcome);
            return yVal !== null ? yScale(yVal) : innerHeight / 2;
          })
          .attr('opacity', d => getOutcomeY(d, currentOutcome) !== null ? OPACITY.dot : 0)),
      exit => exit
        .call(exit => exit.transition().duration(600).attr('opacity', 0).remove())
    );
};

const renderMorphingDistricts = (
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  projection: d3.GeoProjection,
  scatterData: ScatterDataPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  easedMorphT: number
): void => {
  const districtScale = 1 - easedMorphT;
  const roundness = easedMorphT;

  g.selectAll('.morphing-district')
    .data(scatterData, (d: any) => d.ubigeo)
    .join('path')
    .attr('class', 'morphing-district')
    .attr('d', d => {
      const centroid = projection([d.centroidLon, d.centroidLat]);
      if (!centroid) return '';

      const targetX = xScale(d.scatterX);
      const targetY = yScale(d.scatterY);

      const currentCenterX = centroid[0] + (targetX - centroid[0]) * easedMorphT;
      const currentCenterY = centroid[1] + (targetY - centroid[1]) * easedMorphT;

      const projectedPoints = d.polygon
        .map(p => projection([p[1], p[0]]))
        .filter(Boolean) as [number, number][];
      if (projectedPoints.length < 3) return '';

      const avgRadius = projectedPoints.reduce((sum, p) => {
        const dx = p[0] - centroid[0];
        const dy = p[1] - centroid[1];
        return sum + Math.sqrt(dx * dx + dy * dy);
      }, 0) / projectedPoints.length;

      const targetRadius = 5 + (avgRadius - 5) * districtScale;

      const morphedCoords = projectedPoints.map(projected => {
        const dx = projected[0] - centroid[0];
        const dy = projected[1] - centroid[1];
        const angle = Math.atan2(dy, dx);

        const circleX = Math.cos(angle) * targetRadius;
        const circleY = Math.sin(angle) * targetRadius;

        const blendedX = dx * (1 - roundness) * districtScale + circleX * roundness * districtScale;
        const blendedY = dy * (1 - roundness) * districtScale + circleY * roundness * districtScale;

        return [currentCenterX + blendedX, currentCenterY + blendedY];
      });

      return 'M' + morphedCoords.map(c => `${c[0]},${c[1]}`).join('L') + 'Z';
    })
    .attr('fill', d => d.isInside ? colors.mita : colors.nonmitaLight)
    .attr('stroke', d => d.isInside ? colors.mitaStroke : colors.nonmita)
    .attr('stroke-width', Math.max(0.5, 1 - easedMorphT))
    .attr('opacity', OPACITY.dot * (1 - easedMorphT * 0.3));
};

const renderMorphingDots = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  projection: d3.GeoProjection,
  scatterData: ScatterDataPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  margin: Margin,
  morphT: number,
  easedMorphT: number,
  onHover?: (district: MergedDistrictData | null, event?: MouseEvent) => void
): void => {
  if (morphT <= MORPH_TIMING.dotFadeStart) return;

  const dotOpacity = Math.min(1, (morphT - MORPH_TIMING.dotFadeStart) / (MORPH_TIMING.dotFadeEnd - MORPH_TIMING.dotFadeStart));
  const dotRadius = 5 * easedMorphT;

  svg.selectAll<SVGCircleElement, ScatterDataPoint>('.morph-dot')
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
      return mapX + (scatterX - mapX) * easedMorphT;
    })
    .attr('cy', d => {
      const geoCoord = projection([d.centroidLon, d.centroidLat]);
      const mapY = geoCoord ? geoCoord[1] : 0;
      const scatterY = yScale(d.scatterY);
      return mapY + (scatterY - mapY) * easedMorphT;
    })
    .attr('r', dotRadius)
    .attr('fill', d => d.isInside ? colors.mita : colors.nonmitaLight)
    .attr('opacity', dotOpacity * OPACITY.dot)
    .style('cursor', morphT > 0.8 ? 'pointer' : 'default')
    .on('mousemove', function(event: MouseEvent, d: ScatterDataPoint) {
      if (morphT > 0.8 && onHover) {
        onHover(d, event);
        d3.select(this).attr('r', 7).attr('opacity', 1);
      }
    })
    .on('mouseout', function() {
      if (onHover) onHover(null);
      d3.select(this).attr('r', dotRadius).attr('opacity', dotOpacity * OPACITY.dot);
    });
};

const renderFullScatterDots = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  scatterData: ScatterDataPoint[],
  xScale: d3.ScaleLinear<number, number>,
  yScale: d3.ScaleLinear<number, number>,
  margin: Margin,
  onHover?: (district: MergedDistrictData | null, event?: MouseEvent) => void
): void => {
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
    .attr('opacity', OPACITY.dot)
    .style('cursor', 'pointer')
    .on('mousemove', function(event: MouseEvent, d: ScatterDataPoint) {
      if (onHover) onHover(d, event);
      d3.select(this).attr('r', 7).attr('opacity', 1);
    })
    .on('mouseout', function() {
      if (onHover) onHover(null);
      d3.select(this).attr('r', 5).attr('opacity', OPACITY.dot);
    });
};
