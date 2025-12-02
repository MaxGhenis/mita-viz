import React, { useState } from 'react';
import { Scrollama, Step } from 'react-scrollama';
import UnifiedViz from './UnifiedViz';
import './ScrollyStory.css';

interface StepData {
  id: string;
  title: string;
  text: string;
  // Unified viz state
  morphProgress: number; // 0 = map, 1 = scatter
  outcome: 'stunting' | 'consumption' | 'roads';
  showDistricts: boolean;
  scatterPhase: 'dots' | 'ols' | 'naive-effect' | 'effect';
  zoomLevel: 'peru' | 'mita';
  highlightMode?: 'none' | 'boundary' | 'mita-only' | 'nonmita-only';
}

// All main content steps (between intro and conclusion)
const mainSteps: StepData[] = [
  {
    id: 'context',
    title: 'The colonial labor draft',
    text: 'Under the mita, Spanish colonial administrators forced indigenous communities within a designated catchment area to send one-seventh of their adult male population to work in the silver mines of Potosí and the mercury mines of Huancavelica each year. The brutal conditions killed many workers.',
    morphProgress: 0,
    outcome: 'stunting',
    showDistricts: false,
    scatterPhase: 'dots',
    zoomLevel: 'peru',
    highlightMode: 'mita-only',
  },
  {
    id: 'research-question',
    title: 'A 450-year-old question',
    text: 'Spain abolished the mita in 1812. But does this colonial institution still affect Peru today? Are communities that suffered under the mita still worse off than their neighbors who escaped it?',
    morphProgress: 0,
    outcome: 'stunting',
    showDistricts: false,
    scatterPhase: 'dots',
    zoomLevel: 'mita',
    highlightMode: 'none',
  },
  {
    id: 'naive-comparison',
    title: 'Why we can\'t just compare',
    text: 'We could simply compare outcomes in mita vs. non-mita regions. But this would be misleading: maybe the regions differed before 1573. The mita area centered around Cusco—the Inca capital with unique history and geography. Any differences today might reflect pre-existing gaps, not the mita itself.',
    morphProgress: 0,
    outcome: 'stunting',
    showDistricts: true,
    scatterPhase: 'dots',
    zoomLevel: 'mita',
    highlightMode: 'none',
  },
  {
    id: 'boundary',
    title: 'Focus on the boundary',
    text: 'The solution: compare districts right at the boundary. Communities just inside vs. just outside were nearly identical before 1573—same geography, same climate, same Inca heritage. The only difference was which side of an administrative line they fell on.',
    morphProgress: 0,
    outcome: 'stunting',
    showDistricts: true,
    scatterPhase: 'dots',
    zoomLevel: 'mita',
    highlightMode: 'boundary',
  },
  {
    id: 'transform',
    title: 'From map to data',
    text: 'Watch as each district transforms into a data point. Geographic location gives way to a new axis: distance from the mita boundary. Districts that were neighbors on the map now separate based on their proximity to the colonial divide.',
    morphProgress: 1,
    outcome: 'stunting',
    showDistricts: true,
    scatterPhase: 'dots',
    zoomLevel: 'mita',
  },
  {
    id: 'rdd-intro',
    title: 'Plotting the data',
    text: 'Each dot represents a district. The x-axis shows distance from the mita boundary, with mita districts on the right (dark) and non-mita districts on the left (gray). The y-axis shows child stunting rates.',
    morphProgress: 1,
    outcome: 'stunting',
    showDistricts: true,
    scatterPhase: 'dots',
    zoomLevel: 'mita',
  },
  {
    id: 'rdd-ols',
    title: 'Finding the trend',
    text: 'We fit separate regression lines on each side of the boundary. These lines show the average relationship between distance and stunting within each region.',
    morphProgress: 1,
    outcome: 'stunting',
    showDistricts: true,
    scatterPhase: 'ols',
    zoomLevel: 'mita',
  },
  {
    id: 'naive-effect',
    title: 'A misleading result',
    text: 'Our simple regression suggests mita districts have less stunting—the opposite of what we\'d expect from forced labor! This counterintuitive result shows why we can\'t trust naive comparisons. Geography, elevation, and other factors confound the relationship.',
    morphProgress: 1,
    outcome: 'stunting',
    showDistricts: true,
    scatterPhase: 'naive-effect',
    zoomLevel: 'mita',
  },
  {
    id: 'stunting',
    title: 'The controlled estimate',
    text: 'Dell\'s paper uses polynomial RD with controls for elevation, slope, and other geographic factors. The refined estimate: 6 percentage points higher stunting in mita districts—about 15% above the baseline rate. Colonial exploitation continues to harm children generations later.',
    morphProgress: 1,
    outcome: 'stunting',
    showDistricts: true,
    scatterPhase: 'effect',
    zoomLevel: 'mita',
  },
  {
    id: 'consumption',
    title: 'Finding #2: Lower consumption',
    text: 'The same pattern appears for household consumption. Mita districts have about 22% lower consumption today—a coefficient of -0.25 log points. The persistent poverty reflects centuries of institutional disadvantage.',
    morphProgress: 1,
    outcome: 'consumption',
    showDistricts: true,
    scatterPhase: 'effect',
    zoomLevel: 'mita',
  },
  {
    id: 'roads',
    title: 'Finding #3: Less infrastructure',
    text: 'Mita districts have 36 fewer meters of road per km²—about a third less than the non-mita average of 108 m/km². Dell traces this to land tenure: without the labor draft, large haciendas formed and invested in roads to attract workers and transport goods.',
    morphProgress: 1,
    outcome: 'roads',
    showDistricts: true,
    scatterPhase: 'effect',
    zoomLevel: 'mita',
  },
  {
    id: 'mechanism',
    title: 'Why do effects persist?',
    text: 'The mita blocked hacienda formation, reducing long-term investments in land, infrastructure, and human capital. These institutional differences compounded over centuries, producing the disparities we observe today.',
    morphProgress: 1,
    outcome: 'roads',
    showDistricts: true,
    scatterPhase: 'effect',
    zoomLevel: 'mita',
  },
];

const ScrollyStory: React.FC = () => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = mainSteps[currentStepIndex] || mainSteps[0];
  const totalSteps = mainSteps.length + 2; // +2 for intro and conclusion

  const onStepEnter = ({ data }: { data: StepData }) => {
    const idx = mainSteps.findIndex(s => s.id === data.id);
    if (idx >= 0) setCurrentStepIndex(idx);
  };

  return (
    <div className="scrolly-container">
      {/* Progress indicator */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentStepIndex + 2) / totalSteps) * 100}%` }}
        />
      </div>

      {/* INTRO - scrolls in, then out */}
      <section className="intro-section">
        <div className="intro-visual">
          <div className="intro-content">
            <h1>The mining mita</h1>
            <p className="intro-subtitle">How a 450-year-old colonial institution still shapes Peru today</p>
            <p className="intro-citation">
              Based on Dell (2010), <em>Econometrica</em> [<a href="https://dell.scholars.harvard.edu/sites/g/files/omnuum7696/files/dell/files/ecta8121_0.pdf" target="_blank" rel="noopener noreferrer">PDF</a>]
            </p>
            <p className="intro-author">Built by <a href="https://maxghenis.com" target="_blank" rel="noopener noreferrer">Max Ghenis</a></p>
            <p className="scroll-hint">↓ Scroll to explore</p>
          </div>
        </div>
      </section>

      {/* MAIN CONTENT - single sticky graphic with all steps */}
      <section className="scrolly-section main-section">
        <div className="sticky-graphic">
          <div className="graphic-container">
            <UnifiedViz
              morphProgress={currentStep.morphProgress}
              outcome={currentStep.outcome}
              showDistricts={currentStep.showDistricts}
              scatterPhase={currentStep.scatterPhase}
              zoomLevel={currentStep.zoomLevel}
              highlightMode={currentStep.highlightMode}
            />
          </div>
        </div>
        <div className="scrolly-text">
          <Scrollama onStepEnter={onStepEnter} offset={0.5}>
            {mainSteps.map((step) => (
              <Step key={step.id} data={step}>
                <div className={`narrative-step ${currentStep.id === step.id ? 'active' : ''}`}>
                  <h2>{step.title}</h2>
                  <p>{step.text}</p>
                </div>
              </Step>
            ))}
          </Scrollama>
        </div>
      </section>

      {/* CONCLUSION - scrolls in */}
      <section className="conclusion-section">
        <div className="conclusion-visual">
          <div className="conclusion-content">
            <h2>History casts a long shadow</h2>
            <p className="conclusion-summary">
              Dell's study shows that institutions can shape economic outcomes for centuries.
              The mita's arbitrary boundary provides a rare opportunity to measure these persistent effects precisely.
            </p>
            <div className="key-findings">
              <h3>Key findings</h3>
              <ul>
                <li><strong>+6pp higher</strong> child stunting</li>
                <li><strong>~22% lower</strong> household consumption</li>
                <li><strong>~33% lower</strong> road density</li>
              </ul>
            </div>
            <p className="conclusion-note">
              These effects persist 200+ years after Spain abolished the mita.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="scrolly-footer">
        <p>
          Based on Dell, M. (2010). "The Persistent Effects of Peru's Mining Mita."
          <em> Econometrica</em>, 78(6), 1863-1903. [<a href="https://dell.scholars.harvard.edu/sites/g/files/omnuum7696/files/dell/files/ecta8121_0.pdf" target="_blank" rel="noopener noreferrer">PDF</a>]
        </p>
        <p className="data-note">
          Visualizations use real district boundaries and outcome data from the paper's{' '}
          <a href="https://www.econometricsociety.org/publications/econometrica/2010/11/01/persistent-effects-perus-mining-mita" target="_blank" rel="noopener noreferrer">replication files</a>.
          Fitted lines show OLS regressions of outcomes on distance to the mita boundary.
        </p>
        <p className="author-note">
          Built by <a href="https://maxghenis.com" target="_blank" rel="noopener noreferrer">Max Ghenis</a>
        </p>
      </footer>
    </div>
  );
};

export default ScrollyStory;
