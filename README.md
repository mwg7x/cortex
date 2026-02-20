# CoreTex

CoreTex is a healthcare technology system with two interfaces:
- Doctor Interface for diagnosis and safe prescribing.
- Patient Interface for schedule visibility, reminders, and symptom reporting.

This repository is scaffolded as a TypeScript monorepo with clear separation between UI, API, and medication safety logic.

## Project Layout

```text
apps/
  doctor-interface/      # Doctor-facing web UI
  patient-interface/     # Patient-facing web UI
services/
  coretex-api/           # Backend API
packages/
  shared-types/          # Shared domain types
  coretex-engine/        # Drug interaction + scheduling + alternatives logic
docs/
  architecture.md
```

## Core Features Implemented in Scaffold

- Doctor can enter diagnosis and prescribe 2 to 4 medications.
- API validates prescription size and runs medication safety analysis.
- CoreTex engine:
  - detects drug-drug interactions,
  - attempts schedule separation for compatible interactions,
  - suggests safer alternatives on conflicts.
- Patient interface includes schedule view and safety/adherence panel.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start API:

```bash
npm run dev:api
```

3. Start Doctor UI:

```bash
npm run dev:doctor
```

4. Start Patient UI:

```bash
npm run dev:patient
```

## Notes

- This is a production-oriented scaffold, not a complete clinical product.
- Real deployment should use a validated clinical knowledge source and full HIPAA-compliant controls.

## Want to Run This Project? Here is a Step by Step :)

Use this when sharing the project with a friend.

1. Install required software:
- Node.js LTS (recommended: Node 20+)
- npm (comes with Node.js)

2. Copy the project folder to your friend's PC:
- Use Git clone OR send a zip of this folder.
- If sending a zip, do not include `node_modules` (it is OS-specific and large).

3. Open a terminal in the project root (the folder that contains `package.json`).

4. Install dependencies:

```bash
npm install
```

5. Start the backend API (Terminal 1):

```bash
npm run dev:api
```

6. Start the doctor web app (Terminal 2):

```bash
npm run dev:doctor
```

7. Start the patient web app (Terminal 3):

```bash
npm run dev:patient
```

8. Open the apps in a browser:
- Doctor UI: `http://localhost:5173` or  `http://localhost:5178`

![Image](https://drive.google.com/uc?export=view&id=1Zi4yEgLL7HjJw6JOLHf9m5cGoM5MCUz_)

- Patient UI: `http://localhost:5174` or  `http://localhost:5175`

![Image](https://drive.google.com/uc?export=view&id=1FhwDjbCo367Fd6gz8H2w5TK2mTrfienv)

- API health check: `http://localhost:4000/health`

9. Doctor login credentials:
- Name: `Ahmed Mohamed`
- Password: `0000`

10. Verify end-to-end quickly:
- In Patient UI, sign up and submit symptoms.
- In Doctor UI, log in, select patient, assign condition and meds.
- Patient should see the generated plan.

## Troubleshooting

- `npm` or `node` not found:
  Install Node.js from the official site, then reopen terminal.

- Port already in use (`4000`, `5173`, or `5174`):
  Stop the conflicting process or change the port in scripts/config.

- Fresh install recommended when moving between PCs:

- Delete `node_modules` and `package-lock.json`, then run:

```bash
npm install
```
