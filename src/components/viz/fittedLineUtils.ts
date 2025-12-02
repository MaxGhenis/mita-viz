// Fitted line calculations for OLS and polynomial regression
import { ScatterDataPoint, FittedLines, OutcomeType } from './types';
import { PAPER_COEFFICIENTS } from './constants';

interface Point {
  scatterX: number;
  scatterY: number;
}

// Linear OLS: y = a + b*x
const calcLinearOLS = (points: Point[]): { intercept: number; slope: number } => {
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
const calcQuadraticOLS = (points: Point[]): { intercept: number; slope: number; quadratic: number } => {
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

  const det = n * (sumX2 * sumX4 - sumX3 * sumX3)
            - sumX * (sumX * sumX4 - sumX3 * sumX2)
            + sumX2 * (sumX * sumX3 - sumX2 * sumX2);

  if (Math.abs(det) < 1e-10) {
    const linear = calcLinearOLS(points);
    return { ...linear, quadratic: 0 };
  }

  const intercept = (sumY * (sumX2 * sumX4 - sumX3 * sumX3)
                   - sumX * (sumXY * sumX4 - sumX2Y * sumX3)
                   + sumX2 * (sumXY * sumX3 - sumX2Y * sumX2)) / det;
  const slope = (n * (sumXY * sumX4 - sumX2Y * sumX3)
               - sumY * (sumX * sumX4 - sumX3 * sumX2)
               + sumX2 * (sumX * sumX2Y - sumXY * sumX2)) / det;
  const quadratic = (n * (sumX2 * sumX2Y - sumX3 * sumXY)
                   - sumX * (sumX * sumX2Y - sumXY * sumX2)
                   + sumY * (sumX * sumX3 - sumX2 * sumX2)) / det;

  return { intercept, slope, quadratic };
};

// Calculate all fitted lines
export const calculateFittedLines = (
  scatterData: ScatterDataPoint[],
  currentOutcome: OutcomeType
): FittedLines => {
  const insideData = scatterData.filter(d => d.isInside);
  const outsideData = scatterData.filter(d => !d.isInside);

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

  // Polynomial curves with paper's discontinuity
  const allMean = scatterData.reduce((s, d) => s + d.scatterY, 0) / scatterData.length;
  const paperOutsideIntercept = allMean;
  const paperInsideIntercept = allMean + paperDiscontinuity;

  // Generate lines with SAME number of points for smooth interpolation
  const insideLineLinear: { x: number; y: number }[] = [];
  const insideLinePoly: { x: number; y: number }[] = [];
  for (let x = 0; x <= Math.ceil(maxInside); x += 1) {
    insideLineLinear.push({
      x,
      y: insideLinear.intercept + insideLinear.slope * x
    });
    insideLinePoly.push({
      x,
      y: paperInsideIntercept + insidePoly.slope * x + insidePoly.quadratic * x * x
    });
  }

  const outsideLineLinear: { x: number; y: number }[] = [];
  const outsideLinePoly: { x: number; y: number }[] = [];
  for (let x = Math.floor(minOutside); x <= 0; x += 1) {
    outsideLineLinear.push({
      x,
      y: outsideLinear.intercept + outsideLinear.slope * x
    });
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
};

// Format effect value for display
export const formatEffect = (
  discontinuity: number,
  currentOutcome: OutcomeType
): string => {
  if (currentOutcome === 'consumption') {
    const pctChange = (Math.exp(discontinuity) - 1) * 100;
    return `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}%`;
  } else if (currentOutcome === 'stunting') {
    return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(1)}pp`;
  } else {
    return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(0)} m/km²`;
  }
};
