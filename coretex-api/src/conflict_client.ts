import { analyzePrescription } from "@coretex/coretex-engine";
import type {
  InteractionFinding,
  PrescriptionAnalysisRequest,
  PrescriptionAnalysisResult,
  SafetyRecommendation,
} from "@coretex/shared-types";
import fetch from "node-fetch";

const EXTERNAL_CONFLICT_CHECK_URL =
  process.env.COLAB_CONFLICT_CHECK_URL?.trim() ?? "";

type JsonRecord = Record<string, unknown>;

type ParsedConflict = {
  hasConflict: boolean;
  severity?: InteractionFinding["severity"];
  reason?: string;
  canSeparateBySchedule?: boolean;
  minHoursApart?: number;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function parseBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "no", "n", "0"].includes(normalized)) return false;
    return undefined;
  }
  return undefined;
}

function readBoolean(record: JsonRecord, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const parsed = parseBooleanValue(record[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function readString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumber(record: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function parseBooleanFromText(text: string): boolean | undefined {
  const normalized = text.toLowerCase();

  if (
    normalized.includes("low interaction") ||
    normalized.includes("minor interaction") ||
    normalized.includes("relatively safe")
  ) {
    return false;
  }

  if (
    normalized.includes("high interaction") ||
    normalized.includes("moderate interaction") ||
    normalized.includes("high risk") ||
    normalized.includes("moderate risk") ||
    normalized.includes("avoid taking together") ||
    normalized.includes("use caution")
  ) {
    return true;
  }

  if (
    normalized.includes("no conflict") ||
    normalized.includes("no interaction") ||
    normalized.includes("compatible")
  ) {
    return false;
  }

  if (
    normalized.includes("not safe") ||
    normalized.includes("unsafe") ||
    normalized.includes("has conflict") ||
    normalized.includes("has interaction")
  ) {
    return true;
  }

  if (normalized.includes("conflict") || normalized.includes("interaction")) {
    return true;
  }

  if (normalized.includes("safe")) {
    return false;
  }

  return undefined;
}

function normalizeSeverity(
  value?: string,
): InteractionFinding["severity"] | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "minor") return "minor";
  if (normalized === "moderate" || normalized === "medium") return "moderate";
  if (normalized === "major" || normalized === "high" || normalized === "severe")
    return "major";
  if (normalized === "contraindicated" || normalized === "critical")
    return "contraindicated";
  return undefined;
}

function parseLevel(
  value?: string,
): { hasConflict: boolean; severity?: InteractionFinding["severity"] } | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();

  if (normalized === "high") {
    return { hasConflict: true, severity: "major" };
  }
  if (normalized === "moderate") {
    return { hasConflict: true, severity: "moderate" };
  }
  if (normalized === "low") {
    return { hasConflict: false, severity: "minor" };
  }
  if (normalized === "minor") {
    return { hasConflict: false, severity: "minor" };
  }

  return null;
}

function parseConflictResponse(response: unknown): ParsedConflict {
  if (typeof response === "boolean") {
    return { hasConflict: response };
  }

  if (typeof response === "string") {
    return {
      hasConflict: parseBooleanFromText(response) ?? false,
      reason: response,
    };
  }

  if (Array.isArray(response)) {
    if (response.length === 0) return { hasConflict: false };
    return parseConflictResponse(response[0]);
  }

  const root = asRecord(response);
  if (!root) return { hasConflict: false };

  const scopes: JsonRecord[] = [root];
  for (const key of ["result", "data", "prediction", "output"]) {
    const nested = asRecord(root[key]);
    if (nested) scopes.push(nested);
  }

  let hasConflict: boolean | undefined;
  let reason: string | undefined;
  let severity: InteractionFinding["severity"] | undefined;
  let canSeparateBySchedule: boolean | undefined;
  let minHoursApart: number | undefined;

  for (const scope of scopes) {
    const levelText = readString(scope, [
      "interaction_level",
      "interactionLevel",
      "level",
      "risk_level",
      "riskLevel",
    ]);
    const parsedLevel = parseLevel(levelText);
    if (parsedLevel) {
      if (hasConflict === undefined) hasConflict = parsedLevel.hasConflict;
      if (!severity) severity = parsedLevel.severity;
    }

    if (hasConflict === undefined) {
      hasConflict = readBoolean(scope, [
        "conflict",
        "hasConflict",
        "has_conflict",
        "isConflict",
        "is_conflict",
        "interaction",
        "isInteraction",
        "is_interaction",
        "unsafe",
        "isUnsafe",
        "is_unsafe",
      ]);
    }

    if (hasConflict === undefined) {
      const statusText = readString(scope, [
        "status",
        "result",
        "prediction",
        "decision",
        "label",
      ]);
      if (statusText) {
        hasConflict = parseBooleanFromText(statusText);
      }
    }

    if (!reason) {
      reason = readString(scope, [
        "reason",
        "message",
        "detail",
        "explanation",
        "notes",
      ]);
    }

    if (!severity) {
      severity = normalizeSeverity(
        readString(scope, ["severity", "risk", "riskLevel", "risk_level"]),
      );
    }

    if (canSeparateBySchedule === undefined) {
      canSeparateBySchedule = readBoolean(scope, [
        "canSeparateBySchedule",
        "can_separate_by_schedule",
        "canSeparate",
        "can_separate",
      ]);
    }

    if (minHoursApart === undefined) {
      minHoursApart = readNumber(scope, [
        "minHoursApart",
        "min_hours_apart",
        "hoursApart",
        "hours_apart",
      ]);
    }
  }

  return {
    hasConflict: hasConflict ?? false,
    severity,
    reason,
    canSeparateBySchedule: canSeparateBySchedule ?? false,
    minHoursApart,
  };
}

function buildRecommendations(
  interactions: InteractionFinding[],
): SafetyRecommendation[] {
  const recommendations: SafetyRecommendation[] = [];

  for (const interaction of interactions) {
    const [medA, medB] = interaction.medications;
    if (interaction.severity === "contraindicated") {
      recommendations.push({
        type: "avoid_combination",
        title: `Avoid combining ${medA} and ${medB}`,
        details: interaction.reason,
      });
      continue;
    }

    if (interaction.canSeparateBySchedule && interaction.minHoursApart) {
      recommendations.push({
        type: "keep_and_separate",
        title: `Separate ${medA} and ${medB}`,
        details: `Keep at least ${interaction.minHoursApart} hours apart. ${interaction.reason}`,
      });
      continue;
    }

    recommendations.push({
      type: "replace_medication",
      title: `Review ${medA} + ${medB}`,
      details: interaction.reason,
    });
  }

  return recommendations;
}

function computeSafety(interactions: InteractionFinding[]) {
  return !interactions.some(
    (interaction) =>
      interaction.severity === "contraindicated" ||
      (interaction.severity === "major" && !interaction.canSeparateBySchedule),
  );
}

async function checkPairConflict(
  drug1: string,
  drug2: string,
): Promise<ParsedConflict> {
  if (!EXTERNAL_CONFLICT_CHECK_URL) {
    return { hasConflict: false };
  }

  const url = new URL(EXTERNAL_CONFLICT_CHECK_URL);
  url.searchParams.set("drug1", drug1);
  url.searchParams.set("drug2", drug2);

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`External check failed with ${response.status}`);
  }

  const rawText = await response.text();
  let data: unknown = rawText;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = rawText;
  }

  return parseConflictResponse(data);
}

async function collectExternalInteractions(
  payload: PrescriptionAnalysisRequest,
): Promise<InteractionFinding[]> {
  const interactions: InteractionFinding[] = [];

  for (let i = 0; i < payload.medications.length; i += 1) {
    for (let j = i + 1; j < payload.medications.length; j += 1) {
      const medA = payload.medications[i];
      const medB = payload.medications[j];

      const parsed = await checkPairConflict(medA.name, medB.name);
      if (!parsed.hasConflict) continue;

      interactions.push({
        medications: [medA.name, medB.name],
        severity: parsed.severity ?? "major",
        reason:
          parsed.reason ??
          "Potential interaction detected by the external AI model.",
        canSeparateBySchedule: parsed.canSeparateBySchedule ?? false,
        minHoursApart:
          parsed.canSeparateBySchedule && parsed.minHoursApart
            ? Math.max(1, Math.round(parsed.minHoursApart))
            : undefined,
      });
    }
  }

  return interactions;
}

export async function analyzePrescriptionWithExternalCheck(
  payload: PrescriptionAnalysisRequest,
): Promise<PrescriptionAnalysisResult> {
  const local = analyzePrescription(payload);

  if (!EXTERNAL_CONFLICT_CHECK_URL) {
    return local;
  }

  try {
    const externalInteractions = await collectExternalInteractions(payload);
    return {
      ...local,
      isSafe: computeSafety(externalInteractions),
      interactions: externalInteractions,
      recommendations: buildRecommendations(externalInteractions),
    };
  } catch (err) {
    console.warn(
      "External conflict check unavailable. Falling back to local analyzer:",
      (err as Error).message,
    );
    return local;
  }
}
