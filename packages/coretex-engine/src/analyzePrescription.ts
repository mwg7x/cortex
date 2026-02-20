import type {
  InteractionFinding,
  PrescriptionAnalysisRequest,
  PrescriptionAnalysisResult,
  PrescribedMedication,
  SafetyRecommendation,
  ScheduleSlot
} from "@coretex/shared-types";

interface InteractionRule {
  severity: InteractionFinding["severity"];
  reason: string;
  canSeparateBySchedule: boolean;
  minHoursApart?: number;
  alternatives?: Record<string, string[]>;
}

const rules: Record<string, InteractionRule> = {
  "aspirin::warfarin": {
    severity: "major",
    reason: "Increased bleeding risk from additive anticoagulant effects.",
    canSeparateBySchedule: false,
    alternatives: {
      aspirin: ["clopidogrel"],
      warfarin: ["apixaban"]
    }
  },
  "clarithromycin::simvastatin": {
    severity: "contraindicated",
    reason: "Strong CYP3A4 inhibition may increase simvastatin toxicity.",
    canSeparateBySchedule: false,
    alternatives: {
      clarithromycin: ["azithromycin"],
      simvastatin: ["pravastatin", "rosuvastatin"]
    }
  },
  "calcium::levothyroxine": {
    severity: "moderate",
    reason: "Calcium reduces levothyroxine absorption.",
    canSeparateBySchedule: true,
    minHoursApart: 4,
    alternatives: {
      calcium: ["vitamin D only (if clinically acceptable)"]
    }
  },
  "ciprofloxacin::iron": {
    severity: "moderate",
    reason: "Iron chelates ciprofloxacin and lowers antibiotic absorption.",
    canSeparateBySchedule: true,
    minHoursApart: 2,
    alternatives: {
      ciprofloxacin: ["doxycycline (if appropriate)"]
    }
  }
};

const baseTimes: Record<PrescribedMedication["frequencyPerDay"], string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "14:00", "20:00"],
  4: ["06:00", "12:00", "18:00", "22:00"]
};

function toPairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("::");
}

function parseTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function timeDiffHours(a: string, b: string): number {
  const diff = Math.abs(parseTime(a) - parseTime(b));
  const wrapped = Math.min(diff, 1440 - diff);
  return wrapped / 60;
}

function allPairsRespectGap(timesA: string[], timesB: string[], minHours: number): boolean {
  for (const timeA of timesA) {
    for (const timeB of timesB) {
      if (timeDiffHours(timeA, timeB) < minHours) {
        return false;
      }
    }
  }
  return true;
}

function shiftTimes(times: string[], hours: number): string[] {
  const shiftMinutes = Math.round(hours * 60);
  return times.map((time) => formatTime(parseTime(time) + shiftMinutes));
}

function buildInitialSchedule(medications: PrescribedMedication[]): ScheduleSlot[] {
  return medications.map((med) => ({
    medication: med.name,
    times: [...baseTimes[med.frequencyPerDay]]
  }));
}

function detectInteractions(medications: PrescribedMedication[]): InteractionFinding[] {
  const findings: InteractionFinding[] = [];

  for (let i = 0; i < medications.length; i += 1) {
    for (let j = i + 1; j < medications.length; j += 1) {
      const a = medications[i];
      const b = medications[j];
      const rule = rules[toPairKey(a.name, b.name)];
      if (!rule) {
        continue;
      }

      findings.push({
        medications: [a.name, b.name],
        severity: rule.severity,
        reason: rule.reason,
        canSeparateBySchedule: rule.canSeparateBySchedule,
        minHoursApart: rule.minHoursApart,
        alternatives: rule.alternatives
      });
    }
  }

  return findings;
}

function optimizeSchedule(
  schedule: ScheduleSlot[],
  interactions: InteractionFinding[]
): ScheduleSlot[] {
  const updated = schedule.map((slot) => ({ ...slot, times: [...slot.times] }));

  for (const finding of interactions) {
    if (!finding.canSeparateBySchedule || !finding.minHoursApart) {
      continue;
    }

    const medA = updated.find((slot) => slot.medication === finding.medications[0]);
    const medB = updated.find((slot) => slot.medication === finding.medications[1]);
    if (!medA || !medB) {
      continue;
    }

    if (allPairsRespectGap(medA.times, medB.times, finding.minHoursApart)) {
      medB.note = `Keep at least ${finding.minHoursApart} hours apart from ${medA.medication}.`;
      continue;
    }

    let moved = false;
    for (let shift = finding.minHoursApart; shift <= 12; shift += 1) {
      const candidate = shiftTimes(medB.times, shift);
      if (allPairsRespectGap(medA.times, candidate, finding.minHoursApart)) {
        medB.times = candidate;
        medB.note = `Shifted to maintain ${finding.minHoursApart}-hour separation from ${medA.medication}.`;
        moved = true;
        break;
      }
    }

    if (!moved) {
      medB.note = `Unable to safely separate from ${medA.medication} by schedule alone.`;
    }
  }

  return updated;
}

function generateRecommendations(interactions: InteractionFinding[]): SafetyRecommendation[] {
  const recommendations: SafetyRecommendation[] = [];

  for (const finding of interactions) {
    const [medA, medB] = finding.medications;
    const alternatives = finding.alternatives ?? {};
    const medAAlternatives = alternatives[medA] ?? [];
    const medBAlternatives = alternatives[medB] ?? [];

    if (finding.severity === "contraindicated") {
      recommendations.push({
        type: "avoid_combination",
        title: `Avoid combining ${medA} and ${medB}`,
        details: `${finding.reason} Consider alternatives: ${[
          ...medAAlternatives,
          ...medBAlternatives
        ].join(", ") || "none listed"}`
      });
      continue;
    }

    if (finding.canSeparateBySchedule && finding.minHoursApart) {
      recommendations.push({
        type: "keep_and_separate",
        title: `Schedule ${medA} and ${medB} apart`,
        details: `Keep at least ${finding.minHoursApart} hours apart. ${finding.reason}`
      });
    } else {
      recommendations.push({
        type: "replace_medication",
        title: `Replace one medication in ${medA} + ${medB}`,
        details: `${finding.reason} Safer options: ${[
          ...medAAlternatives,
          ...medBAlternatives
        ].join(", ") || "review formulary alternatives"}`
      });
    }
  }

  return recommendations;
}

export function analyzePrescription(
  input: PrescriptionAnalysisRequest
): PrescriptionAnalysisResult {
  const interactions = detectInteractions(input.medications);
  const schedule = optimizeSchedule(buildInitialSchedule(input.medications), interactions);
  const recommendations = generateRecommendations(interactions);

  const isSafe = !interactions.some(
    (interaction) =>
      interaction.severity === "contraindicated" ||
      (interaction.severity === "major" && !interaction.canSeparateBySchedule)
  );

  return {
    isSafe,
    interactions,
    schedule,
    recommendations
  };
}
