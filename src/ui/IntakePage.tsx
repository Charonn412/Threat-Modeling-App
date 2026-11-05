import { INTAKE_SECTIONS, type IntakeField } from '../library/intake';
import { TIER_LABEL, type Intake, type Tier } from '../model/types';
import { useStore } from '../state/store';
import { Chips, Field, Select, TextArea, TextInput } from './controls';
import { useTierResult } from './hooks';

export function IntakePage() {
  const intake = useStore((s) => s.assessment!.intake);
  const update = useStore((s) => s.updateIntake);
  const setStep = useStore((s) => s.setStep);
  const tier = useTierResult();

  return (
    <div className="page intake">
      <div className="intake-main">
        <h1>Stage 1 · Initiate & classify</h1>
        <p className="muted small">Appendix A: system context and business profile. These answers set the assessment depth and drive later stages.</p>
        {INTAKE_SECTIONS.map((sec) => (
          <section key={sec.title} className="card">
            <h2>{sec.title}</h2>
            <p className="small muted">{sec.appendixRef}</p>
            {sec.fields.map((f) => (
              <IntakeInput key={f.key} field={f} intake={intake} update={update} />
            ))}
          </section>
        ))}
        <div className="row end">
          <button type="button" className="btn primary" onClick={() => setStep('architecture')}>
            Continue to architecture →
          </button>
        </div>
      </div>
      <aside className="intake-side">
        <div className="card sticky">
          <h3>Assurance tier</h3>
          <div className={`tier-badge tier-${tier.tier}`}>{TIER_LABEL[tier.tier]}</div>
          <p className="small muted">Score {tier.score}. Rigor scales with sensitivity, exposure, autonomy and impact (Part I §3).</p>
          <ul className="small plain">
            {tier.reasons.length ? tier.reasons.map((r) => <li key={r}>{r}</li>) : <li className="muted">Answer intake questions to compute.</li>}
          </ul>
          <Field label="Override tier">
            <select
              className="input"
              value={intake.tierOverride}
              onChange={(e) => update({ tierOverride: Number(e.target.value) as 0 | Tier })}
            >
              <option value={0}>Automatic</option>
              <option value={1}>Light</option>
              <option value={2}>Standard</option>
              <option value={3}>Deep</option>
            </select>
          </Field>
          <p className="small muted">The tier controls how many Appendix B questions are shown per component. You can always show every tier.</p>
        </div>
      </aside>
    </div>
  );
}

function IntakeInput({ field, intake, update }: { field: IntakeField; intake: Intake; update: (p: Partial<Intake>) => void }) {
  const value = intake[field.key];
  const set = (v: unknown) => update({ [field.key]: v } as Partial<Intake>);
  switch (field.kind) {
    case 'text':
      return (
        <Field label={field.label} hint={field.help}>
          <TextInput value={String(value ?? '')} onChange={set} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={field.label} hint={field.help}>
          <TextArea value={String(value ?? '')} onChange={set} />
        </Field>
      );
    case 'single':
      return field.options.length <= 7 ? (
        <div className="field">
          <span className="field-label">{field.label}</span>
          <Chips single value={value ? [String(value)] : []} onChange={(v) => set(v[0] ?? '')} options={field.options} />
        </div>
      ) : (
        <Field label={field.label}>
          <Select value={String(value ?? '')} onChange={set} options={field.options} />
        </Field>
      );
    case 'multi':
      return (
        <div className="field">
          <span className="field-label">{field.label}</span>
          <Chips value={(value as string[]) ?? []} onChange={set} options={field.options} />
        </div>
      );
  }
}
