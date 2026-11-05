import { useMemo, useState } from 'react';
import { CATEGORY_LABEL, type ComponentType } from '../../library/catalog';
import { getArea, type Question } from '../../library/questions';
import { DOMAINS, type ThreatRule } from '../../library/threatRules';
import type { LexiconEntry } from '../../library/lexicon';
import type { Pattern } from '../../library/patterns';
import { editorItems, libraryHealth, packStats, parsePack, useLibrary, type CollectionId, type Issue } from '../../library/registry';
import { downloadText, pickFile } from '../../io/file';
import { CATALOGS } from '../../library/frameworks';
import { ItemList } from './common';
import { ComponentForm, LexiconForm, PatternForm, QuestionForm, RuleForm } from './forms';
import { FrameworksPane, TemplatesPane } from './panes';

type Tab = 'rules' | 'questions' | 'components' | 'lexicon' | 'patterns' | 'templates' | 'frameworks';

const TABS: { id: Tab; label: string; help: string }[] = [
  { id: 'rules', label: 'Threat rules', help: 'Rules that generate threat scenarios from the architecture (Appendix C), with framework mappings, patterns and rating signals.' },
  { id: 'questions', label: 'Questions', help: 'Appendix B architecture questions per area, with their assurance tier and optional diagram suggestions.' },
  { id: 'components', label: 'Components', help: 'Component types in the palette and the Appendix B areas whose questions they receive.' },
  { id: 'lexicon', label: 'Description keywords', help: 'Phrases and product names the "Describe your system" analyzer recognizes.' },
  { id: 'patterns', label: 'Secure patterns', help: 'Appendix D secure design patterns offered as treatments.' },
  { id: 'templates', label: 'Templates', help: 'Starter architectures on the Home page.' },
  { id: 'frameworks', label: 'Frameworks', help: 'OWASP, MITRE ATLAS, MITRE ATT&CK, STRIDE and any framework you add.' },
];

const DOMAIN_NAME = new Map(DOMAINS.map((d) => [d.id, d.name]));

export function LibrariesPage() {
  const pack = useLibrary((s) => s.pack);
  const version = useLibrary((s) => s.version);
  const [tab, setTab] = useState<Tab>('rules');
  const [msg, setMsg] = useState('');
  const issues = useMemo(() => libraryHealth(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = packStats(pack);

  const counts: Record<Tab, number> = {
    rules: editorItems(pack, 'rules').length,
    questions: editorItems(pack, 'questions').length,
    components: editorItems(pack, 'components').length,
    lexicon: editorItems(pack, 'lexicon').length,
    patterns: editorItems(pack, 'patterns').length,
    templates: editorItems(pack, 'templates').length,
    frameworks: CATALOGS.length,
  };
  const issueCount = (t: Tab) => issues.filter((i) => i.collection === t || (t === 'frameworks' && i.collection === 'catalogs')).length;

  const exportPack = () => downloadText(`threat-model-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(pack, null, 2));
  const importPack = async () => {
    const text = await pickFile();
    if (!text) return;
    try {
      const p = parsePack(text);
      if (window.confirm(`Replace your current library edits (${stats.changes} changes) with "${p.name}"?`)) {
        useLibrary.getState().replacePack(p);
        setMsg(`Imported "${p.name}".`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not import.');
    }
  };

  return (
    <div className="libraries">
      <div className="lib-top">
        <div>
          <h1>Libraries</h1>
          <p className="small muted">
            Edit the content the app runs on. Changes apply immediately to every assessment in this browser and are saved here. Export them as a library pack to back them up
            or share them with your team. Built-in items are never lost: you can restore or re-enable them at any time.
          </p>
        </div>
        <div className="row gap">
          <span className="small muted">{stats.changes ? `${stats.changes} changes from built-in` : 'No changes from built-in'}</span>
          <button type="button" className="btn small" onClick={exportPack}>
            Export pack
          </button>
          <button type="button" className="btn small" onClick={importPack}>
            Import pack
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={!stats.changes}
            onClick={() => window.confirm('Discard all library edits and return to the built-in library? Export a pack first if you want to keep them.') && useLibrary.getState().resetAll()}
          >
            Reset all
          </button>
        </div>
      </div>
      {msg && <p className="small callout">{msg}</p>}
      {issues.length > 0 && <HealthPanel issues={issues} onGo={(t) => setTab(t)} />}
      <div className="lib-body">
        <nav className="lib-nav" aria-label="Library collections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`lib-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              <span>{t.label}</span>
              <span className="row">
                {issueCount(t.id) > 0 && <span className="badge warn-b">{issueCount(t.id)}</span>}
                <span className="count">{counts[t.id]}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="lib-main">
          <p className="small muted">{TABS.find((t) => t.id === tab)!.help}</p>
          {tab === 'rules' && (
            <CollectionEditor<ThreatRule>
              collection="rules"
              newLabel="New rule"
              label={(r) => r.title}
              sub={(r) => `${DOMAIN_NAME.get(r.domain) ?? r.domain} · per ${r.scope}`}
              blank={() => ({
                id: '',
                domain: 'traditional',
                scope: 'component',
                when: [{ kind: 'type', types: ['app_backend'] }],
                title: 'New threat at {name}',
                actor: '',
                asset: '',
                objectives: [],
                preconditions: '',
                attackPath: '',
                impact: '',
                tags: [{ fw: 'stride', id: 'T' }],
                patterns: [],
                likelihood: 2,
                impactLevel: 2,
                signals: [],
              })}
              Form={RuleForm}
            />
          )}
          {tab === 'questions' && (
            <CollectionEditor<Question>
              collection="questions"
              newLabel="New question"
              label={(q) => q.text}
              sub={(q) => `${q.area} ${getArea(q.area)?.title ?? ''} · ${['', 'Light', 'Standard', 'Deep'][q.tier]} · ${q.kind === 'ai' ? 'AI' : 'Traditional'}`}
              blank={() => ({ id: '', area: 'B1', tier: 2, kind: 'traditional', text: '' })}
              Form={QuestionForm}
            />
          )}
          {tab === 'components' && (
            <CollectionEditor<ComponentType>
              collection="components"
              newLabel="New component type"
              label={(c) => `${c.glyph} ${c.label}`}
              sub={(c) => `${CATEGORY_LABEL[c.category]} · ${c.areas.join(', ') || 'no questions'}`}
              blank={() => ({ id: '', label: '', category: 'application', areas: [], plane: 'data', glyph: '🔷', description: '' })}
              Form={ComponentForm}
            />
          )}
          {tab === 'lexicon' && (
            <CollectionEditor<LexiconEntry>
              collection="lexicon"
              newLabel="New keyword entry"
              label={(e) => e.patterns.slice(0, 4).join(', ') + (e.patterns.length > 4 ? '…' : '')}
              sub={(e) => `→ ${e.name ?? e.type ?? ''}${e.generic ? ' · generic' : ''}`}
              blank={() => ({ id: '', patterns: [], type: 'tool_connector', confidence: 'medium' })}
              Form={LexiconForm}
            />
          )}
          {tab === 'patterns' && (
            <CollectionEditor<Pattern> collection="patterns" newLabel="New pattern" label={(p) => p.name} sub={(p) => p.asvs.join(', ')} blank={() => ({ id: '', name: '', outcome: '', asvs: [] })} Form={PatternForm} />
          )}
          {tab === 'templates' && <TemplatesPane />}
          {tab === 'frameworks' && <FrameworksPane />}
        </div>
      </div>
    </div>
  );
}

function HealthPanel({ issues, onGo }: { issues: Issue[]; onGo: (t: Tab) => void }) {
  return (
    <details className="card health" open={issues.length <= 5}>
      <summary className="warn">
        ⚠ {issues.length} broken reference{issues.length === 1 ? '' : 's'} in the library
      </summary>
      <ul className="small plain">
        {issues.slice(0, 50).map((i, idx) => (
          <li key={idx}>
            <button type="button" className="link" onClick={() => onGo(i.collection === 'catalogs' ? 'frameworks' : (i.collection as Tab))}>
              {i.collection}/{i.id}
            </button>
            : {i.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

interface FormLike<T> {
  item: T;
  isNew: boolean;
  onSaved: (id: string) => void;
  onCancelNew: () => void;
}

function CollectionEditor<T extends { id: string }>({
  collection,
  label,
  sub,
  blank,
  newLabel,
  Form,
}: {
  collection: CollectionId;
  label: (t: T) => string;
  sub: (t: T) => string;
  blank: () => T;
  newLabel: string;
  Form: (p: FormLike<T>) => JSX.Element;
}) {
  const pack = useLibrary((s) => s.pack);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState<T | null>(null);
  const current = selected ? (editorItems(pack, collection).find((x) => x.item.id === selected)?.item as T | undefined) : undefined;

  return (
    <div className="lib-editor">
      <ItemList<T>
        collection={collection}
        selected={creating ? null : selected}
        onSelect={(id) => {
          setCreating(null);
          setSelected(id);
        }}
        onNew={() => {
          setSelected(null);
          setCreating(current ? ({ ...structuredClone(current), id: '' } as T) : blank());
        }}
        label={label}
        sub={sub}
        newLabel={newLabel}
      />
      <div className="lib-detail">
        {creating ? (
          <>
            <h3>{newLabel}</h3>
            {current === undefined && <p className="small muted">Tip: select an existing item first and then "+ {newLabel}" to start from a copy.</p>}
            <Form
              key="__new__"
              item={creating}
              isNew
              onSaved={(id) => {
                setCreating(null);
                setSelected(id);
              }}
              onCancelNew={() => setCreating(null)}
            />
          </>
        ) : current ? (
          <>
            <h3>{label(current)}</h3>
            <Form key={`${current.id}:${JSON.stringify(current)}`} item={current} isNew={false} onSaved={(id) => setSelected(id)} onCancelNew={() => setSelected(null)} />
          </>
        ) : (
          <p className="small muted pad">Select an item to view or edit it, or add a new one.</p>
        )}
      </div>
    </div>
  );
}
