import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "..", "data", "patients.json");
function ensureDbFile() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ patients: [] }));
    }
}
function readDb() {
    ensureDbFile();
    const raw = fs.readFileSync(DB_PATH, "utf8");
    try {
        return JSON.parse(raw);
    }
    catch {
        return { patients: [] };
    }
}
function writeDb(db) {
    ensureDbFile();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function buildHistoryId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function ensurePatientCollections(patient) {
    if (!patient.reports)
        patient.reports = [];
    if (!patient.feedback)
        patient.feedback = [];
    if (!patient.conditionsHistory)
        patient.conditionsHistory = [];
    if (!patient.medicalHistory)
        patient.medicalHistory = [];
}
function addHistoryRecord(patient, record) {
    ensurePatientCollections(patient);
    patient.medicalHistory.push({ id: buildHistoryId(), ...record });
}
function sortByTimestampDesc(items) {
    return items
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
export function listPatients() {
    return readDb().patients;
}
export function getPatient(id) {
    return readDb().patients.find((p) => p.id === id);
}
export function addPatient(patient) {
    const db = readDb();
    const normalized = {
        ...patient,
        reports: patient.reports ?? [],
        feedback: patient.feedback ?? [],
        conditionsHistory: patient.conditionsHistory ?? [],
        medicalHistory: patient.medicalHistory ?? [],
    };
    db.patients.push(normalized);
    writeDb(db);
}
export function deletePatient(id) {
    const db = readDb();
    const before = db.patients.length;
    db.patients = db.patients.filter((p) => p.id !== id);
    writeDb(db);
    return db.patients.length < before;
}
export function addReport(id, text) {
    const db = readDb();
    const p = db.patients.find((x) => x.id === id);
    if (!p)
        return false;
    ensurePatientCollections(p);
    const timestamp = new Date().toISOString();
    p.reports.push({ text, timestamp });
    addHistoryRecord(p, {
        category: "symptom_report",
        title: "Symptom Report Submitted",
        details: text,
        timestamp,
    });
    writeDb(db);
    return true;
}
export function setLabels(id, labels) {
    const db = readDb();
    const p = db.patients.find((x) => x.id === id);
    if (!p)
        return false;
    p.labels = labels;
    writeDb(db);
    return true;
}
export function setCondition(id, condition) {
    const db = readDb();
    const p = db.patients.find((x) => x.id === id);
    if (!p)
        return false;
    ensurePatientCollections(p);
    const timestamp = new Date().toISOString();
    p.condition = condition;
    p.conditionsHistory.push({ condition, timestamp });
    addHistoryRecord(p, {
        category: "condition_recorded",
        title: "Condition Recorded",
        details: condition,
        timestamp,
    });
    writeDb(db);
    return true;
}
export function setAnalysis(id, analysis) {
    const db = readDb();
    const p = db.patients.find((x) => x.id === id);
    if (!p)
        return false;
    ensurePatientCollections(p);
    p.analysis = analysis;
    p.medications = analysis.schedule.map((s) => ({
        name: s.medication,
        dose: "per schedule",
        frequencyPerDay: 1,
    }));
    const summary = analysis.schedule
        .map((slot) => `${slot.medication} (${slot.times.join(", ")})`)
        .join(" | ");
    addHistoryRecord(p, {
        category: "medication_plan_generated",
        title: "Medication Plan Generated",
        details: summary || "Medication plan created by doctor.",
        timestamp: new Date().toISOString(),
    });
    writeDb(db);
    return true;
}
export function addFeedback(id, text, sender = "patient") {
    const db = readDb();
    const p = db.patients.find((x) => x.id === id);
    if (!p)
        return false;
    ensurePatientCollections(p);
    const timestamp = new Date().toISOString();
    p.feedback.push({ text, timestamp, sender });
    addHistoryRecord(p, {
        category: sender === "doctor" ? "message_doctor" : "message_patient",
        title: sender === "doctor" ? "Doctor Message" : "Patient Message",
        details: text,
        timestamp,
    });
    writeDb(db);
    return true;
}
function deriveFallbackHistory(patient) {
    const fallback = [];
    const conditionHistory = patient.conditionsHistory ?? [];
    for (const report of patient.reports ?? []) {
        fallback.push({
            id: buildHistoryId(),
            category: "symptom_report",
            title: "Symptom Report Submitted",
            details: report.text,
            timestamp: report.timestamp,
        });
    }
    for (const conditionRecord of conditionHistory) {
        fallback.push({
            id: buildHistoryId(),
            category: "condition_recorded",
            title: "Condition Recorded",
            details: conditionRecord.condition,
            timestamp: conditionRecord.timestamp,
        });
    }
    if (patient.condition && conditionHistory.length === 0) {
        fallback.push({
            id: buildHistoryId(),
            category: "condition_recorded",
            title: "Condition Recorded",
            details: patient.condition,
            timestamp: patient.createdAt,
        });
    }
    for (const feedback of patient.feedback ?? []) {
        fallback.push({
            id: buildHistoryId(),
            category: feedback.sender === "doctor" ? "message_doctor" : "message_patient",
            title: feedback.sender === "doctor" ? "Doctor Message" : "Patient Message",
            details: feedback.text,
            timestamp: feedback.timestamp,
        });
    }
    return sortByTimestampDesc(fallback);
}
export function getPatientMedicalHistory(id) {
    const patient = getPatient(id);
    if (!patient)
        return undefined;
    const history = patient.medicalHistory && patient.medicalHistory.length > 0
        ? sortByTimestampDesc(patient.medicalHistory)
        : deriveFallbackHistory(patient);
    const conditionsHistory = sortByTimestampDesc(patient.conditionsHistory ?? []);
    return {
        id: patient.id,
        name: patient.name,
        createdAt: patient.createdAt,
        currentCondition: patient.condition ?? null,
        conditionsHistory,
        medicalHistory: history,
    };
}
