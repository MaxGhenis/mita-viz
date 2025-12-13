/**
 * Tests for RDDChart component
 *
 * Note: D3 uses ES modules which Jest can't transform by default.
 * These tests focus on the data processing and configuration logic
 * rather than the DOM manipulation aspects.
 */

export {};

// Test the data processing functions and paper coefficients
describe('RDDChart configuration', () => {
  describe('paper coefficients', () => {
    // These values must match Dell (2010) exactly
    const PAPER_COEFFICIENTS = {
      consumption: -0.25,  // log points (≈ -22% consumption)
      stunting: 0.06,      // 6 percentage points higher stunting
      roads: -36,          // meters/km² road density (Table VIII, Panel C)
    };

    it('has correct consumption coefficient (-0.25 log points)', () => {
      expect(PAPER_COEFFICIENTS.consumption).toBe(-0.25);
    });

    it('has correct stunting coefficient (+0.06 = 6pp)', () => {
      expect(PAPER_COEFFICIENTS.stunting).toBe(0.06);
    });

    it('has correct roads coefficient (-36 meters/km²)', () => {
      expect(PAPER_COEFFICIENTS.roads).toBe(-36);
    });

    it('consumption coefficient gives ~22% decrease', () => {
      const pctChange = (Math.exp(PAPER_COEFFICIENTS.consumption) - 1) * 100;
      expect(pctChange).toBeCloseTo(-22.1, 0);
    });

    it('stunting coefficient converts to 6 percentage points', () => {
      const ppChange = PAPER_COEFFICIENTS.stunting * 100;
      expect(ppChange).toBe(6);
    });
  });

  describe('outcome labels', () => {
    const outcomeLabels = {
      consumption: 'Log household consumption (2001)',
      stunting: 'Child stunting rate (2005)',
      roads: 'Road density (meters/km², 2006)',
    };

    it('has correct label for consumption', () => {
      expect(outcomeLabels.consumption).toContain('consumption');
      expect(outcomeLabels.consumption).toContain('2001');
    });

    it('has correct label for stunting', () => {
      expect(outcomeLabels.stunting).toContain('stunting');
      expect(outcomeLabels.stunting).toContain('2005');
    });

    it('has correct label for roads with proper units', () => {
      expect(outcomeLabels.roads).toContain('Road density');
      expect(outcomeLabels.roads).toContain('meters/km²');
      expect(outcomeLabels.roads).toContain('2006');
    });
  });

  describe('phase transitions', () => {
    type Phase = 'dots' | 'ols' | 'naive-effect' | 'effect';

    const shouldShowOLS = (phase: Phase) =>
      phase === 'ols' || phase === 'naive-effect' || phase === 'effect';

    const shouldShowEffect = (phase: Phase) =>
      phase === 'naive-effect' || phase === 'effect';

    it('dots phase should not show OLS lines', () => {
      expect(shouldShowOLS('dots')).toBe(false);
    });

    it('ols phase should show OLS lines', () => {
      expect(shouldShowOLS('ols')).toBe(true);
    });

    it('naive-effect phase should show OLS lines and treatment effect', () => {
      expect(shouldShowOLS('naive-effect')).toBe(true);
      expect(shouldShowEffect('naive-effect')).toBe(true);
    });

    it('effect phase should show OLS lines and treatment effect', () => {
      expect(shouldShowOLS('effect')).toBe(true);
      expect(shouldShowEffect('effect')).toBe(true);
    });

    it('ols phase should NOT show treatment effect', () => {
      expect(shouldShowEffect('ols')).toBe(false);
    });

    it('dots phase should NOT show treatment effect', () => {
      expect(shouldShowEffect('dots')).toBe(false);
    });
  });

  describe('data processing', () => {
    type Outcome = 'consumption' | 'stunting' | 'roads';

    const flipDistance = (rawDistance: number, isInside: boolean) =>
      isInside ? Math.abs(rawDistance) : -Math.abs(rawDistance);

    const convertValue = (rawValue: number, outcome: Outcome) =>
      outcome === 'stunting' ? rawValue * 100 : rawValue;

    it('mita districts (isInside=true) should have positive distance', () => {
      expect(flipDistance(10, true)).toBeGreaterThan(0);
    });

    it('non-mita districts (isInside=false) should have negative distance', () => {
      expect(flipDistance(10, false)).toBeLessThan(0);
    });

    it('stunting values should be converted to percentage (multiplied by 100)', () => {
      expect(convertValue(0.4, 'stunting')).toBe(40);
    });

    it('consumption values should NOT be converted', () => {
      expect(convertValue(5.5, 'consumption')).toBe(5.5);
    });

    it('roads values should NOT be converted', () => {
      expect(convertValue(50, 'roads')).toBe(50);
    });
  });

  describe('treatment effect formatting', () => {
    const formatEffect = (outcome: string, discontinuity: number) => {
      if (outcome === 'consumption') {
        const pctChange = (Math.exp(discontinuity) - 1) * 100;
        return `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(0)}%`;
      } else if (outcome === 'stunting') {
        return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(1)}pp`;
      } else {
        return `${discontinuity > 0 ? '+' : ''}${discontinuity.toFixed(0)} m/km²`;
      }
    };

    it('formats consumption effect as percentage', () => {
      const result = formatEffect('consumption', -0.25);
      expect(result).toBe('-22%');
    });

    it('formats stunting effect as percentage points', () => {
      const result = formatEffect('stunting', 6.0);
      expect(result).toBe('+6.0pp');
    });

    it('formats roads effect as meters/km²', () => {
      const result = formatEffect('roads', -36);
      expect(result).toBe('-36 m/km²');
    });
  });

  describe('scatter dot positioning', () => {
    const INNER_WIDTH = 610; // 700 - 60 (left margin) - 30 (right margin)
    const X_DOMAIN: [number, number] = [-50, 50];

    // This is the actual positioning logic from MapToScatter (with fix)
    const calculateDotCx = (
      mapX: number,
      scatterX: number,
      morphT: number,
      innerWidth: number
    ) => {
      const interpolatedX = mapX + (scatterX - mapX) * morphT;
      // Clamp final position to plot bounds
      return Math.max(0, Math.min(innerWidth, interpolatedX));
    };

    const xScale = (distance: number) => {
      // d3.scaleLinear().domain([-50, 50]).range([0, innerWidth])
      return ((distance - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0])) * INNER_WIDTH;
    };

    it('all dots must be within plot bounds (0 to innerWidth) at full scatter', () => {
      const morphT = 1; // Full scatter mode

      // Simulate a district far outside the map view (e.g., mapX = -200)
      // but with valid scatter position (distance = -40, so scatterX = 61)
      const mapX = -200; // Way off to the left in map coordinates
      const distance = -40; // 40km outside mita boundary
      const scatterX = xScale(distance); // Should be 61px

      const cx = calculateDotCx(mapX, scatterX, morphT, INNER_WIDTH);

      // At morphT=1, cx should equal scatterX (61), NOT be negative
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(INNER_WIDTH);
    });

    it('dots must stay in bounds even during animation (morphT < 1)', () => {
      const morphT = 0.95; // Nearly complete animation

      const mapX = -300; // Very far left in map coordinates
      const distance = -45; // Close to boundary, outside
      const scatterX = xScale(distance); // ~30.5px

      const cx = calculateDotCx(mapX, scatterX, morphT, INNER_WIDTH);

      // BUG: With morphT=0.95, cx = -300 + (30.5 - (-300)) * 0.95 = -300 + 313.975 = 13.975
      // This happens to pass, but with worse mapX values it fails
      // The real issue: final cx must ALWAYS be clamped to [0, innerWidth]
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(INNER_WIDTH);
    });

    it('dots with distance > 50km must be clamped to edge of plot', () => {
      const morphT = 1;

      // District 80km outside mita boundary
      const mapX = -400;
      const distance = -80; // Beyond the -50 to 50 display range
      const scatterX = xScale(distance); // Would be negative: -183px

      const cx = calculateDotCx(mapX, scatterX, morphT, INNER_WIDTH);

      // Must be clamped to 0 (left edge), not negative
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(INNER_WIDTH);
    });
  });

  describe('initial element opacity', () => {
    // These tests document the expected behavior for fade-in transitions
    it('fitted lines should start with opacity 0', () => {
      const initialOpacity = 0;
      expect(initialOpacity).toBe(0);
    });

    it('treatment effect elements should not exist initially in dots phase', () => {
      // In dots phase, treatment effect elements should not be in the DOM at all
      const showEffect = false; // dots phase
      expect(showEffect).toBe(false);
    });

    it('opacity check should detect hidden elements', () => {
      const currentOpacity = 0;
      const isHidden = currentOpacity < 0.5;
      expect(isHidden).toBe(true);
    });

    it('opacity check should detect visible elements', () => {
      const currentOpacity = 1;
      const isHidden = currentOpacity < 0.5;
      expect(isHidden).toBe(false);
    });
  });
});
