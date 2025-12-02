import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import southAmerica from '../data/southAmerica.json';
import { colors } from '../colors';
import {
  OutcomeType,
  ScatterPhase,
  ZoomLevel,
  HighlightMode,
  MergedDistrictData,
  DEFAULT_DIMENSIONS,
  DEFAULT_MARGIN,
  OUTCOME_LABELS,
  ANIMATION,
  MORPH_TIMING,
  mergeData,
  filterScatterData,
  getAllScatterData,
  createProjection,
  createXScale,
  createYScales,
  getInnerDimensions,
  calculateFittedLines,
  renderMap,
  renderScatterBackgrounds,
  renderScatterLabels,
  renderScatterAxes,
  renderMorph,
  renderFittedLines,
} from './viz';

interface TooltipData {
  x: number;
  y: number;
  district: MergedDistrictData;
}

interface UnifiedVizProps {
  morphProgress: number;
  outcome: OutcomeType;
  showDistricts: boolean;
  scatterPhase: ScatterPhase;
  zoomLevel: ZoomLevel;
  highlightMode?: HighlightMode;
}

const UnifiedViz: React.FC<UnifiedVizProps> = ({
  morphProgress,
  outcome,
  showDistricts,
  scatterPhase,
  zoomLevel,
  highlightMode = 'none',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions] = useState(DEFAULT_DIMENSIONS);
  const animationRef = useRef<number | null>(null);
  const zoomAnimationRef = useRef<number | null>(null);
  const borderAnimationRef = useRef<number | null>(null);
  const [currentProgress, setCurrentProgress] = useState(morphProgress);
  const [currentOutcome, setCurrentOutcome] = useState<OutcomeType>(outcome);
  const [currentZoom, setCurrentZoom] = useState(zoomLevel === 'peru' ? 0 : 1);
  const [borderOpacity, setBorderOpacity] = useState(showDistricts ? 1 : 0);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const prevScatterPhaseRef = useRef<string>(scatterPhase);
  const prevOutcomeRef = useRef<string>(outcome);

  // Hover handlers
  const handleDistrictHover = useCallback((district: MergedDistrictData | null, event?: MouseEvent) => {
    if (district && event && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setTooltip({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        district,
      });
    } else {
      setTooltip(null);
    }
  }, []);

  // Memoized data
  const mergedData = useMemo(() => mergeData(), []);
  const { innerWidth, innerHeight } = getInnerDimensions(dimensions, DEFAULT_MARGIN);

  // South America features
  const saFeatures = (southAmerica as any).features;
  const peruFeature = saFeatures.find((f: any) => f.properties?.name === 'Peru');
  const neighborFeatures = saFeatures.filter((f: any) => f.properties?.name !== 'Peru');

  // Animation effects
  useEffect(() => {
    let startProgress = currentProgress;
    const targetProgress = morphProgress;
    const duration = ANIMATION.morphDuration;
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

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morphProgress]);

  useEffect(() => {
    setCurrentOutcome(outcome);
  }, [outcome]);

  useEffect(() => {
    const targetZoom = zoomLevel === 'peru' ? 0 : 1;
    let startZoom = currentZoom;
    const duration = ANIMATION.zoomDuration;
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

    if (zoomAnimationRef.current) cancelAnimationFrame(zoomAnimationRef.current);
    zoomAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (zoomAnimationRef.current) cancelAnimationFrame(zoomAnimationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel]);

  useEffect(() => {
    const targetOpacity = showDistricts ? 1 : 0;
    let startOpacity = borderOpacity;
    const duration = 400; // Fade duration in ms
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const newOpacity = startOpacity + (targetOpacity - startOpacity) * eased;
      setBorderOpacity(newOpacity);

      if (t < 1) {
        borderAnimationRef.current = requestAnimationFrame(animate);
      }
    };

    if (borderAnimationRef.current) cancelAnimationFrame(borderAnimationRef.current);
    borderAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (borderAnimationRef.current) cancelAnimationFrame(borderAnimationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDistricts]);

  // Computed data
  const scatterData = useMemo(
    () => filterScatterData(mergedData, currentOutcome),
    [mergedData, currentOutcome]
  );

  const allScatterData = useMemo(
    () => getAllScatterData(mergedData),
    [mergedData]
  );

  const fittedLines = useMemo(
    () => calculateFittedLines(scatterData, currentOutcome),
    [scatterData, currentOutcome]
  );

  // Main render effect
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const margin = DEFAULT_MARGIN;
    const t = currentProgress;

    // Transition detection
    const isOutcomeOnlyTransition = t >= 1 && prevOutcomeRef.current !== currentOutcome && prevOutcomeRef.current !== '';
    const isPhaseTransition = t >= 1 && prevScatterPhaseRef.current !== scatterPhase && prevScatterPhaseRef.current !== '';
    const isAtFullScatter = t >= 1;
    const shouldPreserveElements = isOutcomeOnlyTransition || isPhaseTransition;

    // Clear elements appropriately
    if (shouldPreserveElements || isAtFullScatter) {
      svg.selectAll('*:not(.morph-dot):not(.inside-line):not(.outside-line):not(.effect-line):not(.effect-label-rect):not(.effect-label-text):not(.main-group)').remove();
    } else {
      svg.selectAll('*').remove();
    }

    // Get or create main group
    let g = svg.select<SVGGElement>('.main-group');
    if (g.empty()) {
      g = svg.append('g')
        .attr('class', 'main-group')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    } else if (!shouldPreserveElements && !isAtFullScatter) {
      g.selectAll('*').remove();
    }

    // Create projection and scales
    const projection = createProjection({
      mergedData,
      peruFeature,
      currentZoom,
      innerWidth,
      innerHeight,
    });
    const xScale = createXScale(innerWidth);
    const yScales = createYScales(allScatterData as any, innerHeight);
    const yScale = yScales[currentOutcome];

    // Render scatter backgrounds and labels (always, opacity controlled by t)
    renderScatterBackgrounds({ g, xScale, innerHeight, t });
    renderScatterLabels({ g, xScale, t });
    renderScatterAxes({ g, xScale, yScale, innerWidth, innerHeight, currentOutcome, t });

    // Scatter ubigeos for filtering
    const scatterUbigeos = new Set(scatterData.map(d => d.ubigeo));

    // Render based on progress
    if (t < 0.3) {
      // Map phase
      const polygonOpacity = 1 - (t / 0.3) * 0.3;

      renderMap({
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
        highlightMode,
        onHover: handleDistrictHover,
      });
    } else {
      // Morph/scatter phase
      const morphT = Math.min((t - MORPH_TIMING.start) / (MORPH_TIMING.end - MORPH_TIMING.start), 1);

      renderMorph({
        g,
        svg,
        projection,
        xScale,
        yScale,
        mergedData,
        scatterData,
        allScatterData: allScatterData as any,
        scatterUbigeos,
        morphT,
        currentOutcome,
        margin,
        innerHeight,
        isOutcomeTransition: isOutcomeOnlyTransition,
        isPhaseTransition,
        onHover: handleDistrictHover,
      });
    }

    // Fitted lines and effect annotation (only at full scatter)
    if (t >= 1) {
      renderFittedLines({
        svg,
        fittedLines,
        scatterPhase,
        prevScatterPhase: prevScatterPhaseRef.current,
        xScale,
        yScale,
        margin,
        currentOutcome,
        shouldPreserveElements,
      });

      prevScatterPhaseRef.current = scatterPhase;
    }

    prevOutcomeRef.current = currentOutcome;

  }, [currentProgress, currentOutcome, scatterPhase, mergedData, scatterData, allScatterData, fittedLines, dimensions, showDistricts, currentZoom, borderOpacity, innerWidth, innerHeight, peruFeature, neighborFeatures, handleDistrictHover, highlightMode]);

  const getTitle = () => {
    if (currentProgress < 0.3) return 'The mita boundary';
    return OUTCOME_LABELS[currentOutcome];
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
          background: currentProgress < 0.3 ? colors.grayLight : 'transparent',
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
      {tooltip && (
        <div
          className="district-tooltip"
          style={{
            position: 'absolute',
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            background: colors.grayDark,
            color: colors.textLight,
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            maxWidth: '200px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            District {tooltip.district.ubigeo}
          </div>
          <div style={{ color: tooltip.district.mita === 1 ? colors.mitaLabel : colors.nonmitaLight }}>
            {tooltip.district.mita === 1 ? 'Mita region' : 'Non-mita region'}
          </div>
          {tooltip.district.distance !== null && (
            <div style={{ marginTop: '4px' }}>
              Distance: {Math.abs(tooltip.district.distance).toFixed(1)} km {tooltip.district.isInside ? 'inside' : 'outside'}
            </div>
          )}
          {currentOutcome === 'stunting' && tooltip.district.stunting !== null && (
            <div>Stunting: {(tooltip.district.stunting * 100).toFixed(1)}%</div>
          )}
          {currentOutcome === 'consumption' && tooltip.district.consumption !== null && (
            <div>Consumption: {tooltip.district.consumption.toFixed(2)}</div>
          )}
          {currentOutcome === 'roads' && tooltip.district.roads !== null && (
            <div>Roads: {tooltip.district.roads.toFixed(0)} m/km²</div>
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedViz;
