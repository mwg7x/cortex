import "dotenv/config";
import cors from "cors";
import express from "express";
import { askGemini3 } from "./gemini_client.js";
import { analyzePrescriptionWithExternalCheck } from "./conflict_client.js";
import { nanoid } from "nanoid";
import { listPatients, addPatient, addReport, deletePatient, setLabels, getPatient, setCondition, setAnalysis, addFeedback, getPatientMedicalHistory, } from "./db.js";
const app = express();
const port = Number(process.env.PORT ?? 4000);
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "coretex-api" });
});
// Provide a friendly root route to avoid "Cannot GET /" when visiting the API root
app.get("/", (_req, res) => {
    res.redirect("/health");
});
app.post("/api/v1/prescriptions/analyze", async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload.diagnosis !== "string") {
        return res
            .status(400)
            .json({ error: "Invalid payload: diagnosis is required." });
    }
    if (!payload.patient || typeof payload.patient.name !== "string") {
        return res
            .status(400)
            .json({ error: "Invalid payload: patient data is required." });
    }
    if (!Array.isArray(payload.medications) ||
        payload.medications.length < 2 ||
        payload.medications.length > 4) {
        return res
            .status(400)
            .json({ error: "Prescriptions must include 2 to 4 medications." });
    }
    const invalidMedication = payload.medications.find((med) => typeof med.name !== "string" ||
        typeof med.dose !== "string" ||
        ![1, 2, 3, 4].includes(med.frequencyPerDay));
    if (invalidMedication) {
        return res.status(400).json({
            error: "Each medication must include name, dose, and frequencyPerDay (1-4).",
        });
    }
    const result = await analyzePrescriptionWithExternalCheck(payload);
    return res.json(result);
});
// Simple patient signup - generates a session id each time
app.post("/signup", (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string")
        return res.status(400).json({ error: "name required" });
    const id = nanoid(8);
    const patient = {
        id,
        name,
        labels: [],
        reports: [],
        createdAt: new Date().toISOString(),
    };
    addPatient(patient);
    return res.json(patient);
});
// Patient submits a symptom report
app.post("/patients/:id/report", (req, res) => {
    const { id } = req.params;
    const { text } = req.body;
    if (!text || typeof text !== "string")
        return res.status(400).json({ error: "text required" });
    const ok = addReport(id, text);
    if (!ok)
        return res.status(404).json({ error: "patient not found" });
    return res.json({ success: true });
});
// Patient submits feedback about medications
app.post("/patients/:id/feedback", (req, res) => {
    const { id } = req.params;
    const { text } = req.body;
    if (!text || typeof text !== "string")
        return res.status(400).json({ error: "feedback text required" });
    const normalizedText = text.trim();
    if (!normalizedText)
        return res.status(400).json({ error: "feedback text required" });
    const ok = addFeedback(id, normalizedText, "patient");
    if (!ok)
        return res.status(404).json({ error: "patient not found" });
    return res.json({ success: true });
});
// --- doctor auth (very small demo implementation) ---
const DOCTOR_NAME = "Ahmed Mohamed";
const DOCTOR_PASSWORD = "0000";
const DOCTOR_TOKEN = "doctor-secret-token"; // use in X-Doctor-Token header after login
app.post("/doctor/login", (req, res) => {
    const { name, password } = req.body;
    if (name === DOCTOR_NAME && password === DOCTOR_PASSWORD) {
        return res.json({ token: DOCTOR_TOKEN });
    }
    return res.status(401).json({ error: "invalid credentials" });
});
function requireDoctor(req, res, next) {
    const token = req.headers["x-doctor-token"];
    if (token !== DOCTOR_TOKEN)
        return res.status(401).json({ error: "unauthorized" });
    return next();
}
// List patients (doctor)
app.get("/doctor/patients", requireDoctor, (_req, res) => {
    return res.json(listPatients());
});
// Delete patient
app.delete("/doctor/patients/:id", requireDoctor, (req, res) => {
    const { id } = req.params;
    const ok = deletePatient(id);
    if (!ok)
        return res.status(404).json({ error: "patient not found" });
    return res.json({ success: true });
});
// Read full patient history (doctor)
app.get("/doctor/patients/:id/history", requireDoctor, (req, res) => {
    const { id } = req.params;
    const history = getPatientMedicalHistory(id);
    if (!history)
        return res.status(404).json({ error: "patient not found" });
    return res.json(history);
});
// Label patient
app.post("/doctor/patients/:id/label", requireDoctor, (req, res) => {
    const { id } = req.params;
    const { labels } = req.body;
    if (!Array.isArray(labels))
        return res.status(400).json({ error: "labels array required" });
    const ok = setLabels(id, labels);
    if (!ok)
        return res.status(404).json({ error: "patient not found" });
    return res.json({ success: true });
});
// Doctor replies to a patient message thread without changing condition/plan
app.post("/doctor/patients/:id/feedback", requireDoctor, (req, res) => {
    const { id } = req.params;
    const { text } = req.body;
    if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "reply text required" });
    }
    const normalizedText = text.trim();
    if (!normalizedText) {
        return res.status(400).json({ error: "reply text required" });
    }
    const ok = addFeedback(id, normalizedText, "doctor");
    if (!ok)
        return res.status(404).json({ error: "patient not found" });
    return res.json({ success: true });
});
// Doctor sets condition and AI generates medications/schedule
app.post("/doctor/patients/:id/condition", requireDoctor, async (req, res) => {
    const { id } = req.params;
    const { condition, medications } = req.body;
    if (!condition || typeof condition !== "string") {
        return res.status(400).json({ error: "condition required" });
    }
    if (!Array.isArray(medications) ||
        medications.length < 2 ||
        medications.length > 4) {
        return res.status(400).json({
            error: "Provide 2-4 medications for the condition",
        });
    }
    const patient = getPatient(id);
    if (!patient)
        return res.status(404).json({ error: "patient not found" });
    try {
        // Set condition on patient
        setCondition(id, condition);
        // Run AI analysis
        const payload = {
            diagnosis: condition,
            patient: {
                id: patient.id,
                name: patient.name,
                age: 0,
                allergies: [],
                conditions: [condition],
            },
            medications,
        };
        const analysis = await analyzePrescriptionWithExternalCheck(payload);
        setAnalysis(id, analysis);
        return res.json({
            success: true,
            condition,
            analysis,
        });
    }
    catch (err) {
        return res.status(500).json({
            error: "condition setting failed",
            detail: err.message,
        });
    }
});
// Patient gets their current condition and medications
app.get("/patients/:id", (req, res) => {
    const { id } = req.params;
    const patient = getPatient(id);
    if (!patient)
        return res.status(404).json({ error: "patient not found" });
    return res.json({
        id: patient.id,
        name: patient.name,
        condition: patient.condition || null,
        analysis: patient.analysis || null,
        reports: patient.reports,
        feedback: patient.feedback || [],
    });
});
// Check drug conflicts for a patient (doctor) - accepts medications payload or uses patient's stored meds if present
app.post("/doctor/patients/:id/check", requireDoctor, async (req, res) => {
    const { id } = req.params;
    const meds = req.body?.medications;
    const patient = getPatient(id);
    if (!patient)
        return res.status(404).json({ error: "patient not found" });
    const medications = meds ?? patient.medications;
    if (!Array.isArray(medications) ||
        medications.length < 2 ||
        medications.length > 4) {
        return res
            .status(400)
            .json({ error: "Provide 2-4 medications to analyze" });
    }
    const payload = {
        diagnosis: `Medication check for ${patient.name}`,
        patient: {
            id: patient.id,
            name: patient.name,
            age: 0,
            allergies: [],
            conditions: [],
        },
        medications,
    };
    try {
        const result = await analyzePrescriptionWithExternalCheck(payload);
        return res.json(result);
    }
    catch (err) {
        return res
            .status(500)
            .json({ error: "analysis failed", detail: err.message });
    }
});
// AI chatbot endpoint for doctor consultation
app.post("/api/v1/ask-ai", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "prompt required" });
    }
    try {
        const response = await askGemini3(prompt);
        if (typeof response !== "string" || !response.trim()) {
            throw new Error("AI returned an empty response");
        }
        return res.json({ response });
    }
    catch (err) {
        // Log the real error and return a helpful fallback so frontend still receives output
        console.error("AI askGemini3 failed:", err.message);
        const fallback = `AI service unavailable. I couldn't reach the external model; here are some general suggestions based on the prompt:\n\n${prompt.slice(0, 800)}`;
        return res.json({
            response: fallback,
            warning: "external_ai_unavailable",
            detail: err.message,
        });
    }
});
app.listen(port, () => {
    console.log(`CoreTex API listening on http://localhost:${port}`);
    // Example usage of the Gemini client (will use GEMINI_API_KEY env var)
    (async () => {
        try {
            const sample = await askGemini3("Say hello from Gemini Flash model.");
            console.log("Gemini sample output:", sample);
        }
        catch (err) {
            console.warn("Gemini client not available:", err.message);
        }
    })();
});
