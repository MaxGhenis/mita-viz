// Color constants for the mita visualization
// SINGLE SOURCE OF TRUTH - change colors here to update everywhere

// =============================================================================
// COLOR PALETTES - Uncomment the one you want to use
// =============================================================================

// Slate Blue (mining/mineral theme - matches intro)
const MITA_PALETTE = {
  main: '#4A5568',
  dark: '#2D3748',
  darker: '#1A202C',
};

// // Original Red (treatment convention)
// const MITA_PALETTE = {
//   main: '#e74c3c',
//   dark: '#c0392b',
//   darker: '#a33025',
// };

// // Copper/Bronze (mining theme)
// const MITA_PALETTE = {
//   main: '#B87333',
//   dark: '#8B5A2B',
//   darker: '#6B4423',
// };

// // Teal (oxidized copper)
// const MITA_PALETTE = {
//   main: '#2C7A7B',
//   dark: '#285E61',
//   darker: '#1D4044',
// };

// // Deep Purple (Potosí silver ore)
// const MITA_PALETTE = {
//   main: '#6B46C1',
//   dark: '#553C9A',
//   darker: '#44337A',
// };

// // Earth/Ochre (mining earth tones)
// const MITA_PALETTE = {
//   main: '#C27C0E',
//   dark: '#975A16',
//   darker: '#744210',
// };

// =============================================================================
// EXPORTED COLORS
// =============================================================================

export const colors = {
  // Mita (treatment) colors - used for mita region fill on map AND scatter
  mita: '#222939',           // Dark slate - main mita fill
  mitaDark: '#2D3748',       // Slightly lighter dark for accents
  mitaStroke: '#1A202C',     // Darker stroke for mita regions
  mitaDarker: '#1A202C',     // Alias for mitaStroke (backwards compat)
  mitaLabel: '#E2E8F0',      // Light text for labels on dark mita background

  // Non-mita (control) colors - gray works with any mita palette
  nonmita: '#718096',        // Medium gray - stroke color
  nonmitaLight: '#A0AEC0',   // Light gray - main non-mita fill

  // UI colors
  textDark: '#2D3748',
  textLight: '#E2E8F0',      // Light text for dark backgrounds
  textMuted: '#666666',      // Muted text for labels
  gridLine: '#e0e0e0',
  white: '#FFFFFF',
  black: '#0F1219',

  // Grays for backgrounds
  grayLight: '#f5f5f5',      // Map background
  gray: '#607399',
  grayDark: '#222939',

  // Effect annotation colors
  effectLine: '#F7FAFC',     // White-ish for effect line
  effectBg: '#1A202C',       // Dark background for effect label
} as const;

// RGB versions for CSS rgba() usage
export const colorsRGB = {
  mita: hexToRgb(MITA_PALETTE.main),
  mitaDark: hexToRgb(MITA_PALETTE.dark),
  nonmita: hexToRgb(colors.nonmita),
  nonmitaLight: hexToRgb(colors.nonmitaLight),
  grayLight: '229, 233, 240',
  gray: '96, 115, 159',
  grayDark: '34, 41, 57',
  black: '15, 18, 25',
} as const;

// Helper to convert hex to RGB string
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

// Convenience function for components
export const getMitaColor = (isInside: boolean, variant: 'fill' | 'stroke' = 'fill') => {
  if (isInside) {
    return variant === 'fill' ? colors.mita : colors.mitaDark;
  }
  return variant === 'fill' ? colors.nonmitaLight : colors.nonmita;
};

// Generate CSS custom properties (for injecting into document)
export const generateCSSVariables = () => `
  --mita: ${colors.mita};
  --mita-dark: ${colors.mitaDark};
  --mita-darker: ${colors.mitaDarker};
  --nonmita: ${colors.nonmita};
  --nonmita-light: ${colors.nonmitaLight};
  --mita-rgb: ${colorsRGB.mita};
  --mita-dark-rgb: ${colorsRGB.mitaDark};
  --nonmita-rgb: ${colorsRGB.nonmita};
`;
