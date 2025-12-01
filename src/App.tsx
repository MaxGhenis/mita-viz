import React, { useEffect } from 'react';
import './App.css';
import ScrollyStory from './components/ScrollyStory';
import { colors, colorsRGB } from './colors';

function App() {
  // Inject color CSS variables from the single source of truth
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--mita', colors.mita);
    root.style.setProperty('--mita-dark', colors.mitaDark);
    root.style.setProperty('--mita-darker', colors.mitaDarker);
    root.style.setProperty('--nonmita', colors.nonmita);
    root.style.setProperty('--nonmita-light', colors.nonmitaLight);
    root.style.setProperty('--mita-rgb', colorsRGB.mita);
  }, []);

  return (
    <div className="App">
      <ScrollyStory />
    </div>
  );
}

export default App;
