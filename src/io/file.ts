import { DEFAULT_FRAMEWORK_VERSIONS } from '../model/factory';
import { SCHEMA_VERSION, defaultRiskMatrix, emptyIntake, emptyObjectives, type Assessment } from '../model/types';

const FILE_KIND = 'ai-threat-model';

interface FileEnvelope {
  kind: typeof FILE_KIND;
  schemaVersion: number;
  exportedAt: string;
  assessment: Assessment;
}

export function serialize(a: Assessment): string {
  const env: FileEnvelope = { kind: FILE_KIND, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), assessment: a };
  return JSON.stringify(env, null, 2);
}

/** Validates shape and fills defaults for fields added after the file was written. */
export function migrate(raw: unknown): Assessment {
  if (!raw || typeof raw !== 'object') throw new Error('Not an assessment');
  const a = raw as Partial<Assessment>;
  if (!Array.isArray(a.components) || !Array.isArray(a.flows)) throw new Error('Assessment is missing components or flows');
  if ((a.schemaVersion ?? 1) > SCHEMA_VERSION) {
    throw new Error(`This file was saved by a newer version of the app (schema ${a.schemaVersion}).`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: a.id ?? `a_${Date.now().toString(36)}`,
    createdAt: a.createdAt ?? new Date().toISOString(),
    updatedAt: a.updatedAt ?? new Date().toISOString(),
    templateId: a.templateId ?? null,
    intake: { ...emptyIntake(), ...(a.intake ?? {}) },
    components: a.components,
    flows: a.flows,
    boundaries: a.boundaries ?? [],
    answers: a.answers ?? {},
    objectives: {
      ...emptyObjectives(),
      ...(a.objectives ?? {}),
      statements: { ...emptyObjectives().statements, ...(a.objectives?.statements ?? {}) },
    },
    threats: a.threats ?? [],
    settings: { riskMatrix: a.settings?.riskMatrix ?? defaultRiskMatrix() },
    // Schema 1 files predate threat assessment, so they adopt the current catalogs.
    frameworkVersions: (a.schemaVersion ?? 1) < 2 ? { ...DEFAULT_FRAMEWORK_VERSIONS } : { ...DEFAULT_FRAMEWORK_VERSIONS, ...(a.frameworkVersions ?? {}) },
  };
}

export function parse(text: string): Assessment {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const env = data as Partial<FileEnvelope>;
  if (env && env.kind === FILE_KIND && env.assessment) return migrate(env.assessment);
  // Accept a bare assessment object too.
  return migrate(data);
}

export function fileNameFor(a: Assessment): string {
  const base = (a.intake.systemName || 'threat-model').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'threat-model'}.tm.json`;
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
