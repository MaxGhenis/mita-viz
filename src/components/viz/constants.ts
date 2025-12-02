// Constants for visualization

// Dell (2010) regression discontinuity estimates
export const PAPER_COEFFICIENTS = {
  consumption: -0.25,
  stunting: 0.06,
  roads: -36,
};

export const OUTCOME_LABELS = {
  consumption: 'Log household consumption (2001)',
  stunting: 'Child stunting rate (2005)',
  roads: 'Road density (meters/km², 2006)',
};

export const DEFAULT_DIMENSIONS = {
  width: 700,
  height: 500,
};

export const DEFAULT_MARGIN = {
  top: 40,
  right: 30,
  bottom: 50,
  left: 60,
};

// Animation durations (ms)
export const ANIMATION = {
  morphDuration: 3000,
  zoomDuration: 1500,
  transitionDuration: 600,
  effectDelay: 300,
};

// Morph timing (as fraction of morphProgress)
export const MORPH_TIMING = {
  start: 0.2,
  end: 0.9,
  dotFadeStart: 0.2,
  dotFadeEnd: 0.8,
};

// Opacity values
export const OPACITY = {
  district: 0.85,
  dot: 0.8,
  mapFade: 0.5,
};
