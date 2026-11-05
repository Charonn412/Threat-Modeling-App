# AI Threat Modeler

A browser-only app for threat modeling AI systems. It follows the *Enterprise AI Security — Threat Modeling Methodology & Architecture Assessment Appendices*. Everything runs locally in your browser, and no assessment data is sent anywhere.

See [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) for the full design.

## What works today

- **Start**
  - Blank assessment.
  - Starter templates: *RAG knowledge assistant* and *Agent with tools*.
  - *Describe your system*: type or paste a description and get component suggestions, with matched text highlighted. You accept or reject each one, and default flows can be proposed.
  - Open a saved `.tm.json` file.
- **Stage 1 · Intake (Appendix A)**
  - Purpose, users and exposure, criticality, data, autonomy, deployment and operations.
  - These compute a **Light / Standard / Deep** assurance tier, which you can override.
- **Stage 2 · Architecture (Appendix B, Section 7)**
  - **Building the diagram:** drag components from the palette onto the canvas. Draw flows between components, and add resizable trust boundaries.
  - **Answering questions:** selecting a component shows its Appendix B questions for the current tier, including traditional AppSec and cloud questions in every area. Each answer is Yes / No / N/A / Unknown, with a note, evidence, owner and due date.
  - **Two-way sync:** some answers offer to add related components, e.g. "spawns subagents = Yes" → add a subagent and a delegation flow.
  - **Flow labels:** each flow carries classification, protocol, authentication, authorization context, encryption, content origin, trust level and plane. Flows that cross a trust boundary are highlighted.
  - **Layer toggles:** data plane, control plane, trust boundaries and flow labels.
- **Gaps**
  - Lists Unknowns (each needs an owner and date), boundary-crossing flows with missing labels, isolated components and unanswered questions.
- **Stage 3 · Objectives (Section 8)**
  - Statements for the seven security objectives, each with the methodology's baseline available to insert.
  - Action authority: what the system must never do, may do only with approval, or may do on its own. Tools and effects from the architecture are offered for classification.
- **Stage 4 · Threats (Appendix C, E)**
  - 48 threat rules run against the components, flows, trust boundaries, answers and intake, and they re-run whenever the page opens.
  - Each candidate is a full Appendix E worksheet with a generated Section 9 narrative.
  - Each candidate is mapped to OWASP (LLM, Agentic, ML, Top 10, API, NHI, CI/CD, Kubernetes), MITRE ATLAS, MITRE ATT&CK and STRIDE. Every rule carries traditional mappings.
  - Suggested ratings cite the answers and intake facts behind them, e.g. "B9.2: execution not isolated → likelihood +2".
  - You confirm, dismiss with a reason, or edit each candidate, and you can add custom threats.
  - Refreshing never overwrites edits. Threats whose architecture element was removed are flagged as stale.
- **Stages 5–6 · Risk & treatment (Sections 9–10, Appendix D)**
  - Inherent and residual heatmaps, plus the Section 9 autonomy/reach modifier.
  - Treatment choice (avoid / mitigate / transfer / accept risk) and Appendix D secure patterns with their ASVS 5.0 chapters.
  - Owners, due dates, validation, and risk acceptance with an expiry date.
  - A register-health check for missing ratings, treatments and owners.
- **Report (Stage 8, Appendix H)**
  - A live preview, plus one-click **PDF** and **Word (.docx)** downloads and print. All are generated in the browser from the same content.
  - Sections:
    - Executive summary with top risks and key open items.
    - Charter and scope.
    - Architecture: a vector diagram with numbered flows, the component inventory, a fully labeled flow table, and trust boundaries.
    - Appendix B/F discovery record.
    - Security objectives.
    - Appendix E threat worksheets with Section 9 narratives and framework mappings.
    - Dismissed threats with reasons.
    - Heatmaps and the risk register.
    - Framework coverage traceability.
    - Gaps and unknowns.
    - Appendix H approval and sign-off.
  - Each section can be switched on or off.
- **Settings**
  - A configurable risk matrix: rename levels and click cells to change ratings.
  - The framework catalog versions, and the versions this assessment was assessed against.
- **Saving:** autosaves to browser storage. **Save file / Open** exports and imports the full assessment as JSON.

Planned next: in-app editing of libraries (questions, rules, lexicon, templates, framework imports), then Stage 7 validation and evidence tracking (Appendix G).

## Framework data

MITRE ATLAS and ATT&CK catalogs in `src/library/frameworks/*.json` are generated from MITRE's official releases:

```bash
# ATLAS: https://github.com/mitre-atlas/atlas-data  (dist/v6/ATLAS-latest.yaml names the current file)
# ATT&CK: https://github.com/mitre-attack/attack-stix-data  (enterprise-attack/enterprise-attack.json)
python3 -I scripts/extract_frameworks.py ATLAS-<version>.yaml enterprise-attack.json src/library/frameworks
npm test   # fails if any threat rule references an ID that no longer exists
```

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # static build in dist/ (relative paths; host anywhere or open locally)
```

## Project layout

```
src/
  model/      Domain types, factories
  library/    Content as data: component catalog, question bank, intake form, templates, lexicon,
              threat rules, secure patterns, framework catalogs (OWASP, ATLAS, ATT&CK, STRIDE)
  logic/      Tier, gaps/completeness, description analyzer, threat engine, risk (+ tests)
  state/      Zustand store with autosave
  io/         JSON save/open and migration
  report/     Report builder (format-neutral blocks), architecture SVG, PDF (pdfmake) and Word (docx) renderers
  ui/         Pages, canvas (React Flow), inspector
```
