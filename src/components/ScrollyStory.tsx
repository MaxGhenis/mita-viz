import React, { useState } from 'react';
import { Scrollama, Step } from 'react-scrollama';
import MitaMap from './MitaMap';
import RDDChart from './RDDChart';
import './ScrollyStory.css';

interface StepData {
  id: string;
  title: string;
  text: string;
  visual: 'intro' | 'map' | 'rdd-consumption' | 'rdd-stunting' | 'rdd-roads' | 'conclusion';
  showDistricts?: boolean;
  rddPhase?: 'dots' | 'ols' | 'naive-effect' | 'effect'; // Phase of RDD chart reveal
}

const steps: StepData[] = [
  {
    id: 'intro',
    title: 'The mining mita',
    text: 'In 1573, the Spanish colonial government established the mita—a forced labor system that shaped Peru\'s economic geography for centuries.',
    visual: 'intro',
  },
  {
    id: 'context',
    title: 'The colonial labor draft',
    text: 'Under the mita, Spanish colonial administrators forced indigenous communities within a designated catchment area to send one-seventh of their adult male population to work in the silver mines of Potosí and the mercury mines of Huancavelica each year. The brutal conditions killed many workers.',
    visual: 'map',
    showDistricts: false,
  },
  {
    id: 'research-question',
    title: 'A 450-year-old question',
    text: 'Spain abolished the mita in 1812. But does this colonial institution still affect Peru today? Are communities that suffered under the mita still worse off than their neighbors who escaped it?',
    visual: 'map',
    showDistricts: false,
  },
  {
    id: 'naive-comparison',
    title: 'Why we can\'t just compare',
    text: 'We could simply compare outcomes in mita vs. non-mita regions. But this would be misleading: maybe the regions differed before 1573. The mita area centered around Cusco—the Inca capital with unique history and geography. Any differences today might reflect pre-existing gaps, not the mita itself.',
    visual: 'map',
    showDistricts: true,
  },
  {
    id: 'boundary',
    title: 'Focus on the boundary',
    text: 'The solution: compare districts right at the boundary. Communities just inside vs. just outside were nearly identical before 1573—same geography, same climate, same Inca heritage. The only difference was which side of an administrative line they fell on.',
    visual: 'map',
    showDistricts: true,
  },
  {
    id: 'rdd-intro',
    title: 'Plotting the data',
    text: 'Each dot represents a district. The x-axis shows distance from the mita boundary: negative values are inside the mita region (red), positive values are outside (gray). The y-axis shows household consumption in 2001.',
    visual: 'rdd-consumption',
    rddPhase: 'dots',
  },
  {
    id: 'rdd-ols',
    title: 'Finding the trend',
    text: 'We fit separate regression lines on each side of the boundary. These lines show the average relationship between distance and consumption within each region.',
    visual: 'rdd-consumption',
    rddPhase: 'ols',
  },
  {
    id: 'naive-effect',
    title: 'A first estimate',
    text: 'Our simple regression shows a gap at the boundary. But this naive estimate doesn\'t account for geography, elevation, or other factors that might also vary at the boundary.',
    visual: 'rdd-consumption',
    rddPhase: 'naive-effect',
  },
  {
    id: 'consumption',
    title: 'The controlled estimate',
    text: 'Dell\'s paper uses polynomial RD with controls for elevation, slope, and other geographic factors. The refined estimate: 22% lower consumption in mita districts. The robust result confirms this isn\'t driven by geography.',
    visual: 'rdd-consumption',
    rddPhase: 'effect',
  },
  {
    id: 'stunting',
    title: 'Finding #2: Higher child stunting',
    text: 'The same pattern appears for child stunting. Children in mita districts face significantly higher stunting rates, reflecting persistent poverty and malnutrition. Colonial exploitation continues to harm children generations later.',
    visual: 'rdd-stunting',
    rddPhase: 'effect',
  },
  {
    id: 'roads',
    title: 'Finding #3: Less infrastructure',
    text: 'Mita districts also have fewer roads today. Dell traces this to the mita\'s effect on land tenure: without the labor draft, large haciendas formed and invested in roads to attract workers and transport goods.',
    visual: 'rdd-roads',
    rddPhase: 'effect',
  },
  {
    id: 'mechanism',
    title: 'Why do effects persist?',
    text: 'The mita blocked hacienda formation, reducing long-term investments in land, infrastructure, and human capital. These institutional differences compounded over centuries, producing the disparities we observe today.',
    visual: 'rdd-roads',
    rddPhase: 'effect',
  },
  {
    id: 'conclusion',
    title: 'History casts a long shadow',
    text: 'Dell\'s study reveals how colonial institutions shape economic outcomes for centuries. Policymakers must understand these deep roots of inequality to design effective interventions that break cycles of poverty.',
    visual: 'conclusion',
  },
];

const ScrollyStory: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);

  const onStepEnter = ({ data }: { data: StepData }) => {
    setCurrentStep(steps.findIndex(s => s.id === data.id));
  };

  return (
    <div className="scrolly-container">
      {/* Progress indicator */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* SECTION 1: Intro - scrolls normally then sticks */}
      <section className="scrolly-section">
        <div className="sticky-graphic">
          <div className="intro-visual">
            <div className="intro-content">
              <h1>The mining mita</h1>
              <p className="intro-subtitle">How a 450-year-old colonial institution still shapes Peru today</p>
              <p className="intro-citation">
                Based on <a href="https://scholar.harvard.edu/dell/publications/persistent-effects-perus-mining-mita" target="_blank" rel="noopener noreferrer">Dell (2010), <em>Econometrica</em></a>
              </p>
              <p className="intro-author">Built by <a href="https://maxghenis.com" target="_blank" rel="noopener noreferrer">Max Ghenis</a></p>
              <p className="scroll-hint">↓ Scroll to explore</p>
            </div>
          </div>
        </div>
        <div className="scrolly-text">
          <Scrollama onStepEnter={onStepEnter} offset={0.5}>
            <Step data={steps[0]}>
              <div className={`narrative-step ${currentStep === 0 ? 'active' : ''}`}>
                <h2>{steps[0].title}</h2>
                <p>{steps[0].text}</p>
              </div>
            </Step>
          </Scrollama>
        </div>
      </section>

      {/* SECTION 2: Map - transitions from simple to district view */}
      <section className="scrolly-section">
        <div className="sticky-graphic">
          <div className="graphic-container">
            <MitaMap showDistricts={steps[currentStep]?.showDistricts ?? false} />
          </div>
        </div>
        <div className="scrolly-text">
          <Scrollama onStepEnter={onStepEnter} offset={0.5}>
            {steps.slice(1, 5).map((step, idx) => (
              <Step key={step.id} data={step}>
                <div className={`narrative-step ${currentStep === idx + 1 ? 'active' : ''}`}>
                  <h2>{step.title}</h2>
                  <p>{step.text}</p>
                </div>
              </Step>
            ))}
          </Scrollama>
        </div>
      </section>

      {/* SECTION 3: RDD Charts - single chart that transitions between outcomes */}
      <section className="scrolly-section">
        <div className="sticky-graphic">
          <div className="graphic-container">
            <RDDChart
              outcome={
                currentStep >= 10 ? 'roads' :
                currentStep >= 9 ? 'stunting' :
                'consumption'
              }
              phase={steps[currentStep]?.rddPhase ?? 'effect'}
            />
          </div>
        </div>
        <div className="scrolly-text">
          <Scrollama onStepEnter={onStepEnter} offset={0.5}>
            {steps.slice(5, 12).map((step, idx) => (
              <Step key={step.id} data={step}>
                <div className={`narrative-step ${currentStep === idx + 5 ? 'active' : ''}`}>
                  <h2>{step.title}</h2>
                  <p>{step.text}</p>
                </div>
              </Step>
            ))}
          </Scrollama>
        </div>
      </section>

      {/* SECTION 6: Conclusion */}
      <section className="scrolly-section">
        <div className="sticky-graphic">
          <div className="conclusion-visual">
            <div className="conclusion-content">
              <h2>Key takeaways</h2>
              <ul>
                <li><strong>~25% lower</strong> household consumption</li>
                <li><strong>Higher</strong> child stunting rates</li>
                <li><strong>Fewer</strong> roads</li>
              </ul>
              <p className="conclusion-note">
                These effects persist 200+ years after Spain abolished the mita.
              </p>
            </div>
          </div>
        </div>
        <div className="scrolly-text">
          <Scrollama onStepEnter={onStepEnter} offset={0.5}>
            <Step data={steps[10]}>
              <div className={`narrative-step ${currentStep === 10 ? 'active' : ''}`}>
                <h2>{steps[10].title}</h2>
                <p>{steps[10].text}</p>
              </div>
            </Step>
          </Scrollama>
        </div>
      </section>

      {/* Footer */}
      <footer className="scrolly-footer">
        <p>
          Based on Dell, M. (2010). "The Persistent Effects of Peru's Mining Mita."
          <em> Econometrica</em>, 78(6), 1863-1903.
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
