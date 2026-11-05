import { useState } from 'react';
import { useStore, type Step } from './state/store';
import { downloadText, fileNameFor, parse, pickFile, serialize } from './io/file';
import { StartPage } from './ui/StartPage';
import { IntakePage } from './ui/IntakePage';
import { ArchitecturePage } from './ui/ArchitecturePage';
import { GapsPage } from './ui/GapsPage';
import { ObjectivesPage } from './ui/ObjectivesPage';
import { ThreatsPage } from './ui/ThreatsPage';
import { RiskPage } from './ui/RiskPage';
import { SettingsPage } from './ui/SettingsPage';
import { ReportPage } from './ui/ReportPage';
import { TIER_LABEL } from './model/types';
import { useTier } from './ui/hooks';

const STEPS: { id: Step | string; label: string; enabled: boolean }[] = [
  { id: 'intake', label: '1 · Intake', enabled: true },
  { id: 'architecture', label: '2 · Architecture', enabled: true },
  { id: 'gaps', label: 'Gaps', enabled: true },
  { id: 'objectives', label: '3 · Objectives', enabled: true },
  { id: 'threats', label: '4 · Threats', enabled: true },
  { id: 'risk', label: '5–6 · Risk & treatment', enabled: true },
  { id: 'report', label: '7 · Report', enabled: true },
  { id: 'settings', label: '⚙', enabled: true },
];

export default function App() {
  const assessment = useStore((s) => s.assessment);
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const load = useStore((s) => s.load);
  const [msg, setMsg] = useState('');

  if (!assessment || step === 'start') {
    return (
      <div className="app">
        <TopBar />
        <main className="main scroll">
          <StartPage />
        </main>
      </div>
    );
  }

  const save = () => {
    downloadText(fileNameFor(assessment), serialize(assessment));
    flash('Saved to your downloads.');
  };
  const open = async () => {
    const text = await pickFile();
    if (!text) return;
    try {
      if (window.confirm('Replace the current assessment with this file?')) load(parse(text));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not open file.');
    }
  };
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="app">
      <TopBar>
        <nav className="steps" aria-label="Assessment stages">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`step ${step === s.id ? 'on' : ''}`}
              disabled={!s.enabled}
              title={s.enabled ? (s.id === 'settings' ? 'Settings' : undefined) : 'Coming in the next build'}
              aria-label={s.id === 'settings' ? 'Settings' : undefined}
              aria-current={step === s.id ? 'page' : undefined}
              onClick={() => setStep(s.id as Step)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          {msg && <span className="small flash">{msg}</span>}
          <TierPill />
          <button type="button" className="btn small" onClick={save}>
            Save file
          </button>
          <button type="button" className="btn small" onClick={open}>
            Open
          </button>
          <button type="button" className="btn small" onClick={() => setStep('start')}>
            Home
          </button>
        </div>
      </TopBar>
      <main className={`main ${step === 'architecture' || step === 'threats' || step === 'report' ? '' : 'scroll'}`}>
        {step === 'intake' && <IntakePage />}
        {step === 'architecture' && <ArchitecturePage />}
        {step === 'gaps' && <GapsPage />}
        {step === 'objectives' && <ObjectivesPage />}
        {step === 'threats' && <ThreatsPage />}
        {step === 'risk' && <RiskPage />}
        {step === 'report' && <ReportPage />}
        {step === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function TopBar({ children }: { children?: React.ReactNode }) {
  const name = useStore((s) => s.assessment?.intake.systemName);
  const step = useStore((s) => s.step);
  return (
    <header className="topbar no-print">
      <div className="brand">
        <span aria-hidden>🛡</span> AI Threat Modeler
        {name && step !== 'start' && <span className="muted"> / {name}</span>}
      </div>
      {children}
    </header>
  );
}

function TierPill() {
  const tier = useTier();
  return <span className={`tier-pill tier-${tier}`}>{TIER_LABEL[tier]} tier</span>;
}
