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
- **Saving:** autosaves to browser storage. **Save file / Open** exports and imports the full assessment as JSON.

Planned next: security objectives, rule-based threat generation mapped to OWASP (AI and traditional lists), MITRE ATLAS, MITRE ATT&CK and STRIDE, then risk rating and treatment, the PDF/Word report, and in-app library editing.

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
  library/    Content as data: component catalog, question bank, intake form, templates, description lexicon
  logic/      Tier calculation, boundary/gap/completeness analysis, description analyzer (+ tests)
  state/      Zustand store with autosave
  io/         JSON save/open and migration
  ui/         Pages, canvas (React Flow), inspector
```
