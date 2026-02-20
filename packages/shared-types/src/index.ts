export type InteractionSeverity = "minor" | "moderate" | "major" | "contraindicated";

export interface PatientProfile {
  id: string;
  name: string;
  age: number;
  allergies: string[];
  conditions: string[];
  renalImpairment?: boolean;
  hepaticImpairment?: boolean;
}

export interface PrescribedMedication {
  name: string;
  dose: string;
  frequencyPerDay: 1 | 2 | 3 | 4;
  medicationClass?: string;
}

export interface PrescriptionAnalysisRequest {
  diagnosis: string;
  patient: PatientProfile;
  medications: PrescribedMedication[];
}

export interface InteractionFinding {
  medications: [string, string];
  severity: InteractionSeverity;
  reason: string;
  canSeparateBySchedule: boolean;
  minHoursApart?: number;
  alternatives?: Record<string, string[]>;
}

export interface ScheduleSlot {
  medication: string;
  times: string[];
  note?: string;
}

export type RecommendationType =
  | "keep_and_separate"
  | "replace_medication"
  | "avoid_combination";

export interface SafetyRecommendation {
  type: RecommendationType;
  title: string;
  details: string;
}

export interface PrescriptionAnalysisResult {
  isSafe: boolean;
  interactions: InteractionFinding[];
  schedule: ScheduleSlot[];
  recommendations: SafetyRecommendation[];
}
