# CoreTex Architecture

## Interfaces

### Doctor Interface
- Capture diagnosis.
- Build prescription with 2 to 4 medications.
- Display intelligent safety analysis before finalization.
- Show conflict handling options:
  - keep and separate by time,
  - replace with safer alternative,
  - avoid combination.

### Patient Interface
- Medication timeline.
- Safety alerts and instructions in plain language.
- Adherence and symptom reporting.

## Backend

### `coretex-api`
- Entry point for UI requests.
- Validates prescription payload.
- Calls CoreTex engine and returns structured analysis.

### `coretex-engine`
- Detects interaction rules.
- Tries to re-time medication schedule to avoid interactions.
- Generates safer alternative suggestions.
- Produces recommendation cards for clinical decision support.

## High-Level Flow

1. Doctor submits diagnosis and 2 to 4 medications.
2. API validates request and calls analysis engine.
3. Engine returns:
   - interaction findings,
   - optimized schedule if possible,
   - recommendation list.
4. Doctor reviews, accepts, or overrides recommendation.
5. Patient view consumes resulting schedule and guidance.
