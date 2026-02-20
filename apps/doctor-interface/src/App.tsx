import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ||
  "http://localhost:4000";
const ASK_AI_TIMEOUT_MS = 30000;

const CHRONIC_DISEASE_OPTIONS = [
  "Diabetes",
  "Hypertension",
  "Chronic Kidney Disease",
  "Chronic Liver Disease",
  "Coronary Artery Disease",
  "Heart Failure",
  "COPD",
  "Asthma",
  "Epilepsy",
  "Thyroid Disorder",
];

interface AIChatMessage {
  role: "doctor" | "ai";
  text: string;
}

interface MedicationInput {
  name: string;
  dose: string;
  frequencyPerDay: 1 | 2 | 3 | 4;
}

interface FeedbackMessage {
  text: string;
  timestamp: string;
  sender?: "patient" | "doctor";
}

interface PatientWithSymptoms {
  id: string;
  name: string;
  reports: Array<{ text: string; timestamp: string }>;
  feedback?: FeedbackMessage[];
  condition?: string;
  analysis?: any;
}

interface ConflictCheckResult {
  isSafe: boolean;
  interactions: Array<{
    medications: [string, string];
    severity: "minor" | "moderate" | "major" | "contraindicated";
    reason: string;
    canSeparateBySchedule: boolean;
    minHoursApart?: number;
  }>;
}

interface DiseaseImpactResult {
  risk: "safe" | "warning";
  summary: string;
}

interface MedicalHistoryResponse {
  id: string;
  name: string;
  createdAt: string;
  currentCondition: string | null;
  conditionsHistory: Array<{
    condition: string;
    timestamp: string;
  }>;
  medicalHistory: Array<{
    id: string;
    category:
      | "symptom_report"
      | "condition_recorded"
      | "medication_plan_generated"
      | "message_patient"
      | "message_doctor";
    title: string;
    details: string;
    timestamp: string;
  }>;
}

const countPatientMessages = (feedback?: FeedbackMessage[]) =>
  (feedback ?? []).filter((message) => message.sender !== "doctor").length;

async function requestAiResponse(prompt: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASK_AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/api/v1/ask-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => null)) as
      | { response?: string; error?: string }
      | null;
    if (!res.ok) {
      throw new Error(data?.error || "AI request failed");
    }

    const text = data?.response?.trim();
    if (!text) {
      throw new Error("AI returned an empty response");
    }

    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `AI request timed out after ${ASK_AI_TIMEOUT_MS / 1000} seconds.`,
      );
    }
    throw err instanceof Error ? err : new Error("AI request failed");
  } finally {
    clearTimeout(timeout);
  }
}

export function App() {
  // Auth state
  const [doctorToken, setDoctorToken] = useState<string | null>(() =>
    localStorage.getItem("doctorToken"),
  );
  const [loginName, setLoginName] = useState("Ahmed Mohamed");
  const [loginPassword, setLoginPassword] = useState("0000");

  // Patient management
  const [patients, setPatients] = useState<PatientWithSymptoms[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null,
  );

  // AI Chat panel
  const [aiChat, setAiChat] = useState<AIChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Condition & medication assignment
  const [conditionInput, setConditionInput] = useState("");
  const [medications, setMedications] = useState<MedicationInput[]>([
    { name: "", dose: "", frequencyPerDay: 1 },
    { name: "", dose: "", frequencyPerDay: 1 },
  ]);
  const [settingCondition, setSettingCondition] = useState(false);
  const [editingConditionId, setEditingConditionId] = useState<string | null>(
    null,
  );
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflictCheckResult, setConflictCheckResult] =
    useState<ConflictCheckResult | null>(null);
  const [conflictCheckError, setConflictCheckError] = useState("");
  const [selectedChronicDisease, setSelectedChronicDisease] = useState(
    CHRONIC_DISEASE_OPTIONS[0],
  );
  const [impactDrugA, setImpactDrugA] = useState("");
  const [impactDrugB, setImpactDrugB] = useState("");
  const [checkingDiseaseImpact, setCheckingDiseaseImpact] = useState(false);
  const [diseaseImpactResult, setDiseaseImpactResult] =
    useState<DiseaseImpactResult | null>(null);
  const [diseaseImpactError, setDiseaseImpactError] = useState("");
  const [checkingMedicalHistory, setCheckingMedicalHistory] = useState(false);
  const [medicalHistoryError, setMedicalHistoryError] = useState("");
  const [medicalHistoryData, setMedicalHistoryData] =
    useState<MedicalHistoryResponse | null>(null);
  const [isMedicalHistoryOpen, setIsMedicalHistoryOpen] = useState(false);
  const [isSendMessageCollapsed, setIsSendMessageCollapsed] = useState(false);
  const [doctorReplyInput, setDoctorReplyInput] = useState("");
  const [sendingDoctorReply, setSendingDoctorReply] = useState(false);

  // Auto-scroll AI chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiChat]);

  // Fetch patients when doctor logs in (token exists)
  useEffect(() => {
    if (doctorToken) {
      fetchPatients(doctorToken);
    }
  }, [doctorToken]);

  useEffect(() => {
    if (!doctorToken) return;
    const interval = setInterval(() => {
      void fetchPatients(doctorToken);
    }, 4000);

    return () => clearInterval(interval);
  }, [doctorToken]);

  useEffect(() => {
    setConflictCheckResult(null);
    setConflictCheckError("");
    setDiseaseImpactResult(null);
    setDiseaseImpactError("");
  }, [medications, selectedPatientId]);

  useEffect(() => {
    setMedicalHistoryData(null);
    setMedicalHistoryError("");
    setImpactDrugA("");
    setImpactDrugB("");
    setIsMedicalHistoryOpen(false);
  }, [selectedPatientId]);

  useEffect(() => {
    setIsSendMessageCollapsed(false);
  }, [selectedPatientId]);

  const doctorLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/doctor/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: loginName, password: loginPassword }),
      });
      if (!res.ok) throw new Error("login failed");
      const { token } = await res.json();
      localStorage.setItem("doctorToken", token);
      setDoctorToken(token);
      fetchPatients(token);
    } catch (err) {
      alert("login failed");
    }
  };

  const fetchPatients = async (token?: string) => {
    try {
      const t = token ?? doctorToken;
      if (!t) return;
      const res = await fetch(`${API_BASE}/doctor/patients`, {
        headers: { "x-doctor-token": t },
      });
      if (!res.ok) throw new Error("fetch patients failed");
      const list = await res.json();
      setPatients(list);
    } catch (err) {
      console.error(err);
    }
  };

  const askAI = async () => {
    if (!aiInput.trim() || !selectedPatient) return;

    const userMessage = aiInput;
    setAiInput("");
    setAiChat((prev) => [...prev, { role: "doctor", text: userMessage }]);
    setAiLoading(true);

    try {
      // Build context from patient symptoms and current plan (if already assigned).
      const planSummary =
        selectedPatient.analysis?.schedule
          ?.map((s: any) => `${s.medication} at ${s.times.join(", ")}`)
          .join("\n") ?? "No treatment plan assigned yet.";
      const conditionSummary =
        selectedPatient.condition ?? "No condition assigned yet.";
      const context = `Patient: ${selectedPatient.name}
Condition: ${conditionSummary}
Symptoms reported:
${patientSymptoms || "No symptoms reported."}
Current medication plan:
${planSummary}

Doctor's query: ${userMessage}`;

      const aiResponse = await requestAiResponse(
        `You are a medical AI assistant. Based on the patient symptoms and doctor's question, provide helpful diagnostic suggestions and medication recommendations. Keep responses concise and professional.\n\n${context}`,
      );
      setAiChat((prev) => [...prev, { role: "ai", text: aiResponse }]);
    } catch (err) {
      console.error(err);
      const errorMsg =
        err instanceof Error ? err.message : "Error connecting to AI service";
      setAiChat((prev) => [...prev, { role: "ai", text: `⚠️ ${errorMsg}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  const deletePatientById = async (id: string) => {
    if (!confirm("Are you sure you want to delete this patient?")) return;

    try {
      const res = await fetch(`${API_BASE}/doctor/patients/${id}`, {
        method: "DELETE",
        headers: { "x-doctor-token": doctorToken ?? "" },
      });
      if (!res.ok) throw new Error("delete failed");

      setSelectedPatientId(null);
      setDoctorReplyInput("");
      setAiChat([]);
      await fetchPatients();
    } catch (err) {
      console.error(err);
      alert("Delete failed");
    }
  };

  const checkMedicalHistory = async (id: string) => {
    if (isMedicalHistoryOpen) {
      setIsMedicalHistoryOpen(false);
      return;
    }

    setIsMedicalHistoryOpen(true);
    setCheckingMedicalHistory(true);
    setMedicalHistoryError("");
    setMedicalHistoryData(null);

    try {
      const res = await fetch(`${API_BASE}/doctor/patients/${id}/history`, {
        headers: { "x-doctor-token": doctorToken ?? "" },
      });
      const data = (await res.json().catch(() => null)) as
        | MedicalHistoryResponse
        | { error?: string }
        | null;

      if (!res.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed to load medical history");
      }

      setMedicalHistoryData(data as MedicalHistoryResponse);
    } catch (err) {
      setMedicalHistoryData(null);
      setMedicalHistoryError(
        err instanceof Error ? err.message : "Failed to load medical history",
      );
    } finally {
      setCheckingMedicalHistory(false);
    }
  };

  const labelPatient = async (id: string) => {
    const labelsRaw = prompt("Enter comma-separated labels:");
    if (labelsRaw == null) return;
    const labels = labelsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await fetch(`${API_BASE}/doctor/patients/${id}/label`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-doctor-token": doctorToken ?? "",
        },
        body: JSON.stringify({ labels }),
      });
      if (!res.ok) throw new Error("label failed");
      fetchPatients();
    } catch (err) {
      console.error(err);
    }
  };

  const checkMeds = async (id: string) => {
    const filledMeds = medications.filter(
      (m) => m.name.trim() && m.dose.trim(),
    );

    if (filledMeds.length < 2) {
      setConflictCheckResult(null);
      setConflictCheckError("Add at least 2 medications before checking.");
      return;
    }

    setCheckingConflicts(true);
    setConflictCheckError("");
    try {
      const res = await fetch(`${API_BASE}/doctor/patients/${id}/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-doctor-token": doctorToken ?? "",
        },
        body: JSON.stringify({ medications: filledMeds }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Conflict check failed");
      }
      setConflictCheckResult(data as ConflictCheckResult);
    } catch (err) {
      setConflictCheckResult(null);
      setConflictCheckError(
        err instanceof Error ? err.message : "Conflict check failed",
      );
    } finally {
      setCheckingConflicts(false);
    }
  };

  const checkDiseaseImpact = async () => {
    const drugA = impactDrugA.trim();
    const drugB = impactDrugB.trim();

    if (!drugA || !drugB) {
      setDiseaseImpactResult(null);
      setDiseaseImpactError("Select 2 medications first.");
      return;
    }
    if (drugA.toLowerCase() === drugB.toLowerCase()) {
      setDiseaseImpactResult(null);
      setDiseaseImpactError("Choose 2 different medications.");
      return;
    }

    setCheckingDiseaseImpact(true);
    setDiseaseImpactError("");
    setDiseaseImpactResult(null);

    try {
      const prompt = `You are a medical safety assistant.
Evaluate if taking "${drugA}" and "${drugB}" can negatively affect a patient with "${selectedChronicDisease}".
Return only a JSON object in this exact format:
{"risk":"safe"|"warning","summary":"short explanation for doctor"}.
Use "warning" if there is any meaningful concern, contraindication, or caution.
Use "safe" only if generally acceptable with standard monitoring.`;

      const raw = await requestAiResponse(prompt);
      let parsedRisk: DiseaseImpactResult["risk"] = "warning";
      let parsedSummary = raw || "No model response.";

      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            risk?: string;
            summary?: string;
          };
          if (
            parsed.risk &&
            ["safe", "warning"].includes(parsed.risk.toLowerCase())
          ) {
            parsedRisk = parsed.risk.toLowerCase() as DiseaseImpactResult["risk"];
          }
          if (typeof parsed.summary === "string" && parsed.summary.trim()) {
            parsedSummary = parsed.summary.trim();
          }
        } catch {
          // Fall through to heuristic parsing below.
        }
      }

      if (!jsonMatch) {
        const lower = cleaned.toLowerCase();
        const warningSignals = [
          "warning",
          "risk",
          "avoid",
          "caution",
          "contraind",
          "worsen",
          "unsafe",
          "not recommended",
        ];
        const safeSignals = [
          "safe",
          "generally safe",
          "low risk",
          "acceptable",
          "no major concern",
        ];

        const hasWarningSignal = warningSignals.some((token) =>
          lower.includes(token),
        );
        const hasSafeSignal = safeSignals.some((token) => lower.includes(token));

        if (hasWarningSignal) {
          parsedRisk = "warning";
        } else if (hasSafeSignal) {
          parsedRisk = "safe";
        }
      }

      setDiseaseImpactResult({
        risk: parsedRisk,
        summary: parsedSummary,
      });
    } catch (err) {
      setDiseaseImpactError(
        err instanceof Error ? err.message : "Disease impact check failed",
      );
    } finally {
      setCheckingDiseaseImpact(false);
    }
  };

  const setPatientCondition = async (id: string) => {
    if (!conditionInput.trim()) {
      alert("Please enter a condition");
      return;
    }

    const filledMeds = medications.filter(
      (m) => m.name.trim() && m.dose.trim(),
    );

    if (filledMeds.length < 2 || filledMeds.length > 4) {
      alert("Please provide 2-4 medications");
      return;
    }

    setSettingCondition(true);
    try {
      const res = await fetch(`${API_BASE}/doctor/patients/${id}/condition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-doctor-token": doctorToken ?? "",
        },
        body: JSON.stringify({
          condition: conditionInput,
          medications: filledMeds,
        }),
      });

      if (!res.ok) throw new Error("Failed to set condition");
      const data = await res.json();

      alert(
        `✓ Done!\nCondition: ${conditionInput}\nPatient ${selectedPatient?.name} will now see their medication schedule.`,
      );
      setConditionInput("");
      setMedications([
        { name: "", dose: "", frequencyPerDay: 1 },
        { name: "", dose: "", frequencyPerDay: 1 },
      ]);
      setEditingConditionId(null);
      setAiChat([]);
      await fetchPatients();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set condition");
    } finally {
      setSettingCondition(false);
    }
  };

  const enterEditMode = () => {
    if (!selectedPatient) return;
    setConditionInput(selectedPatient.condition || "");
    const meds = selectedPatient.analysis?.schedule.map((s: any) => ({
      name: s.medication,
      dose: "per schedule",
      frequencyPerDay: 1,
    })) || [
      { name: "", dose: "", frequencyPerDay: 1 },
      { name: "", dose: "", frequencyPerDay: 1 },
    ];
    setMedications(meds);
    setEditingConditionId(selectedPatient.id);
  };

  const cancelEdit = () => {
    setEditingConditionId(null);
    setConditionInput("");
    setMedications([
      { name: "", dose: "", frequencyPerDay: 1 },
      { name: "", dose: "", frequencyPerDay: 1 },
    ]);
  };

  const sendDoctorReply = async (id: string) => {
    const replyText = doctorReplyInput.trim();
    if (!replyText || !doctorToken) return;

    setSendingDoctorReply(true);
    try {
      const res = await fetch(`${API_BASE}/doctor/patients/${id}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-doctor-token": doctorToken,
        },
        body: JSON.stringify({ text: replyText }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "Failed to send reply");
      }

      setDoctorReplyInput("");
      await fetchPatients();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSendingDoctorReply(false);
    }
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const checkedInteractions = conflictCheckResult?.interactions ?? [];
  const checkedHasConflicts = checkedInteractions.length > 0;
  const selectedPatientMessageCount = countPatientMessages(
    selectedPatient?.feedback,
  );
  const patientSymptoms =
    selectedPatient?.reports.map((r) => r.text).join("\n") || "";
  const totalPatients = patients.length;
  const waitingPatients = patients.filter((p) => !p.condition).length;
  const assignedPatients = totalPatients - waitingPatients;
  const unreadMessages = patients.reduce(
    (sum, p) => sum + countPatientMessages(p.feedback),
    0,
  );

  if (!doctorToken) {
    return (
      <main className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>CoreTex</h1>
            <p className="auth-subtitle">Doctor Portal</p>
          </div>

          <div className="auth-form">
            <h2>Doctor Login</h2>
            <p className="form-description">
              Access the patient management dashboard
            </p>

            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="Ahmed Mohamed"
                onKeyPress={(e) => e.key === "Enter" && doctorLogin()}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                onKeyPress={(e) => e.key === "Enter" && doctorLogin()}
              />
            </div>

            <button className="btn btn-primary" onClick={doctorLogin}>
              Login
            </button>

            <p className="auth-footer">
              Demo credentials: Ahmed Mohamed / 0000
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="doctor-page-layout">
      <header className="doctor-header">
        <div className="header-content">
          <div>
            <p className="eyebrow">CoreTex</p>
            <h1>Doctor Dashboard</h1>
            <p className="subhead">Patient Management & AI Consultation</p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              localStorage.removeItem("doctorToken");
              setDoctorToken(null);
              setPatients([]);
              setSelectedPatientId(null);
              setDoctorReplyInput("");
              setAiChat([]);
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <section className="doctor-kpi-row">
        <article className="kpi-card">
          <p className="kpi-label">Total Patients</p>
          <p className="kpi-value">{totalPatients}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Waiting Review</p>
          <p className="kpi-value">{waitingPatients}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Plans Assigned</p>
          <p className="kpi-value">{assignedPatients}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Unread Messages</p>
          <p className="kpi-value">{unreadMessages}</p>
        </article>
      </section>

      <div className="doctor-main-container">
        {/* Left Panel: Patient List */}
        <aside className="doctor-sidebar">
          <div className="sidebar-header">
            <h2>Patients Waiting</h2>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fetchPatients()}
            >
              ↻ Refresh
            </button>
          </div>

          <div className="patient-list">
            {patients.length === 0 ? (
              <p className="empty-state">No patients yet</p>
            ) : (
              patients.map((p) => {
                const patientMessageCount = countPatientMessages(p.feedback);
                return (
                  <div
                    key={p.id}
                    className={`patient-list-item ${selectedPatientId === p.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setAiChat([]);
                      setConditionInput("");
                      setMedications([
                        { name: "", dose: "", frequencyPerDay: 1 },
                        { name: "", dose: "", frequencyPerDay: 1 },
                      ]);
                      setDoctorReplyInput("");
                    }}
                  >
                    <p className="list-patient-name">{p.name}</p>
                    <p className="list-patient-id">{p.id}</p>
                    {p.condition && (
                      <p className="list-patient-condition">✓ {p.condition}</p>
                    )}
                    {!p.condition && p.reports.length > 0 && (
                      <p className="list-patient-status">
                        {p.reports.length} report
                        {p.reports.length !== 1 ? "s" : ""}
                      </p>
                    )}
                    {patientMessageCount > 0 && (
                      <p className="list-patient-status">
                        {patientMessageCount} new patient message
                        {patientMessageCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Center Panel: Patient Details & Condition Form */}
        {selectedPatient ? (
          <section className="doctor-center">
            <div className="patient-detail-header">
              <div>
                <h2>{selectedPatient.name}</h2>
                {selectedPatient.condition && (
                  <p className="assigned-condition">
                    Condition: {selectedPatient.condition}
                  </p>
                )}
                <div className="patient-meta-row">
                  <span
                    className={`status-chip ${selectedPatient.condition ? "ok" : "warn"}`}
                  >
                    {selectedPatient.condition
                      ? "Plan Assigned"
                      : "Waiting for Plan"}
                  </span>
                  {selectedPatientMessageCount > 0 && (
                    <span className="status-chip info">
                      {selectedPatientMessageCount} patient message
                      {selectedPatientMessageCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="patient-actions">
                <button
                  className="history-patient-btn"
                  onClick={() => void checkMedicalHistory(selectedPatient.id)}
                  disabled={checkingMedicalHistory}
                >
                  {checkingMedicalHistory
                    ? "Checking..."
                    : isMedicalHistoryOpen
                      ? "Close Medical History"
                      : "Check Medical History"}
                </button>
                <button
                  className="delete-patient-btn"
                  onClick={() => deletePatientById(selectedPatient.id)}
                >
                  Delete Patient
                </button>
              </div>
            </div>

            {isMedicalHistoryOpen && (
              <div className="medical-history-panel">
                <div className="medical-history-head">
                  <h3>Medical History</h3>
                  {medicalHistoryData && (
                    <p>
                      Patient ID: <strong>{medicalHistoryData.id}</strong>
                    </p>
                  )}
                </div>

                {checkingMedicalHistory && (
                  <p className="form-description">Loading medical history...</p>
                )}

                {medicalHistoryError && (
                  <p className="conflict-error">{medicalHistoryError}</p>
                )}

                {medicalHistoryData && (
                  <div className="medical-history-body">
                    <div className="history-summary-row">
                      <p>
                        <strong>Current Condition:</strong>{" "}
                        {medicalHistoryData.currentCondition || "Not assigned"}
                      </p>
                      <p>
                        <strong>Created:</strong>{" "}
                        {new Date(medicalHistoryData.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="history-conditions">
                      <p className="history-label">Recorded Conditions</p>
                      {medicalHistoryData.conditionsHistory.length > 0 ? (
                        <ul className="history-inline-list">
                          {medicalHistoryData.conditionsHistory.map((record) => (
                            <li
                              key={`${record.condition}-${record.timestamp}`}
                              className="history-chip"
                            >
                              {record.condition} (
                              {new Date(record.timestamp).toLocaleDateString()})
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="form-description">No conditions recorded yet.</p>
                      )}
                    </div>

                    <div className="history-log">
                      <p className="history-label">Full Timeline</p>
                      {medicalHistoryData.medicalHistory.length > 0 ? (
                        <div className="history-log-list">
                          {medicalHistoryData.medicalHistory.map((entry) => (
                            <div key={entry.id} className="history-log-item">
                              <div className="history-log-meta">
                                <strong>{entry.title}</strong>
                                <small>
                                  {new Date(entry.timestamp).toLocaleString()}
                                </small>
                              </div>
                              <p>{entry.details}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="form-description">No history records found.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Show symptoms if no condition yet */}
            {!selectedPatient.condition && (
              <div className="symptoms-section">
                <h3>Reported Symptoms</h3>
                <div className="symptoms-list">
                  {selectedPatient.reports.length > 0 ? (
                    selectedPatient.reports.map((r, idx) => (
                      <div key={idx} className="symptom-item">
                        <small>{new Date(r.timestamp).toLocaleString()}</small>
                        <p>{r.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">No symptoms reported yet</p>
                  )}
                </div>
              </div>
            )}

            {/* Condition Assignment Form */}
            {!selectedPatient.condition && (
              <div className="condition-form">
                <h3>Assign Condition & Medications</h3>

                <div className="form-group">
                  <label htmlFor="condition">Condition/Diagnosis</label>
                  <input
                    id="condition"
                    type="text"
                    value={conditionInput}
                    onChange={(e) => setConditionInput(e.target.value)}
                    placeholder="e.g., Hypertension, Diabetes..."
                  />
                </div>

                <div className="medications-section">
                  <label>Medications (Add 2-4)</label>
                  <div className="medications-list">
                    {medications.map((med, idx) => (
                      <div key={idx} className="medication-row">
                        <input
                          type="text"
                          value={med.name}
                          onChange={(e) => {
                            const newMeds = [...medications];
                            newMeds[idx].name = e.target.value;
                            setMedications(newMeds);
                          }}
                          placeholder="Medication name"
                        />
                        <input
                          type="text"
                          value={med.dose}
                          onChange={(e) => {
                            const newMeds = [...medications];
                            newMeds[idx].dose = e.target.value;
                            setMedications(newMeds);
                          }}
                          placeholder="Dose (e.g., 10mg)"
                        />
                        <select
                          value={med.frequencyPerDay}
                          onChange={(e) => {
                            const newMeds = [...medications];
                            newMeds[idx].frequencyPerDay = parseInt(
                              e.target.value,
                            ) as 1 | 2 | 3 | 4;
                            setMedications(newMeds);
                          }}
                        >
                          <option value={1}>1x/day</option>
                          <option value={2}>2x/day</option>
                          <option value={3}>3x/day</option>
                          <option value={4}>4x/day</option>
                        </select>
                        {medications.length > 2 && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setMedications(
                                medications.filter((_, i) => i !== idx),
                              );
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {medications.length < 4 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setMedications([
                          ...medications,
                          { name: "", dose: "", frequencyPerDay: 1 },
                        ]);
                      }}
                    >
                      + Add Medication
                    </button>
                  )}
                </div>

                <div className="conflict-check-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void checkMeds(selectedPatient.id)}
                    disabled={checkingConflicts}
                  >
                    {checkingConflicts ? "Checking..." : "Check Drug Conflict"}
                  </button>
                  {conflictCheckResult && (
                    <span
                      className={`conflict-chip ${checkedHasConflicts ? "warn" : "safe"}`}
                    >
                      {checkedHasConflicts
                        ? `${checkedInteractions.length} conflict${checkedInteractions.length === 1 ? "" : "s"} found`
                        : "No conflict found"}
                    </span>
                  )}
                </div>

                {conflictCheckError && (
                  <p className="conflict-error">{conflictCheckError}</p>
                )}

                {conflictCheckResult && (
                  <div
                    className={`conflict-result ${checkedHasConflicts ? "warn" : "safe"}`}
                  >
                    <p className="conflict-result-title">
                      {checkedHasConflicts
                        ? "Potential interactions detected."
                        : "No interaction detected for the entered medications."}
                    </p>
                    {checkedHasConflicts && (
                      <ul className="conflict-result-list">
                        {checkedInteractions.map((interaction, index) => (
                          <li key={`${interaction.medications.join("-")}-${index}`}>
                            <strong>{interaction.medications.join(" + ")}</strong>{" "}
                            ({interaction.severity}) - {interaction.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="disease-impact-box">
                  <label>Chronic Disease Impact Check</label>
                  <div className="disease-impact-inputs">
                    <select
                      value={selectedChronicDisease}
                      onChange={(e) => setSelectedChronicDisease(e.target.value)}
                    >
                      {CHRONIC_DISEASE_OPTIONS.map((disease) => (
                        <option key={disease} value={disease}>
                          {disease}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={impactDrugA}
                      onChange={(e) => setImpactDrugA(e.target.value)}
                      placeholder="Medicine 1"
                    />
                    <input
                      type="text"
                      value={impactDrugB}
                      onChange={(e) => setImpactDrugB(e.target.value)}
                      placeholder="Medicine 2"
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void checkDiseaseImpact()}
                      disabled={checkingDiseaseImpact}
                    >
                      {checkingDiseaseImpact
                        ? "Checking..."
                        : "Check Disease Impact"}
                    </button>
                  </div>

                  {diseaseImpactError && (
                    <p className="conflict-error">{diseaseImpactError}</p>
                  )}

                  {diseaseImpactResult && (
                    <div
                      className={`disease-impact-result ${diseaseImpactResult.risk}`}
                    >
                      <p className="disease-impact-title">
                        {diseaseImpactResult.risk === "warning"
                          ? "Warning"
                          : "Safe"}
                      </p>
                      <p className="disease-impact-summary">
                        {diseaseImpactResult.summary}
                      </p>
                      <p className="disease-impact-powered">
                        Powered by TF-IDF Model
                      </p>
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => setPatientCondition(selectedPatient.id)}
                  disabled={settingCondition || !conditionInput.trim()}
                >
                  {settingCondition
                    ? "Assigning..."
                    : "Assign Condition & Generate Schedule"}
                </button>
              </div>
            )}

            {/* Show assigned condition */}
            {selectedPatient.condition &&
              editingConditionId !== selectedPatient.id && (
                <div className="assigned-info">
                  <p className="form-description">
                    ✓ Done. Patient {selectedPatient.name} can now see their
                    treatment plan.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      justifyContent: "center",
                    }}
                  >
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={enterEditMode}
                    >
                      Edit Condition
                    </button>
                  </div>
                </div>
              )}

            {/* Edit Condition Form */}
            {editingConditionId === selectedPatient?.id && (
              <div className="condition-form">
                <h3>Edit Condition & Medications</h3>

                <div className="form-group">
                  <label htmlFor="condition-edit">Condition/Diagnosis</label>
                  <input
                    id="condition-edit"
                    type="text"
                    value={conditionInput}
                    onChange={(e) => setConditionInput(e.target.value)}
                    placeholder="e.g., Hypertension, Diabetes..."
                  />
                </div>

                <div className="medications-section">
                  <label>Medications (Add 2-4)</label>
                  <div className="medications-list">
                    {medications.map((med, idx) => (
                      <div key={idx} className="medication-row">
                        <input
                          type="text"
                          value={med.name}
                          onChange={(e) => {
                            const newMeds = [...medications];
                            newMeds[idx].name = e.target.value;
                            setMedications(newMeds);
                          }}
                          placeholder="Medication name"
                        />
                        <input
                          type="text"
                          value={med.dose}
                          onChange={(e) => {
                            const newMeds = [...medications];
                            newMeds[idx].dose = e.target.value;
                            setMedications(newMeds);
                          }}
                          placeholder="Dose (e.g., 10mg)"
                        />
                        <select
                          value={med.frequencyPerDay}
                          onChange={(e) => {
                            const newMeds = [...medications];
                            newMeds[idx].frequencyPerDay = parseInt(
                              e.target.value,
                            ) as 1 | 2 | 3 | 4;
                            setMedications(newMeds);
                          }}
                        >
                          <option value={1}>1x/day</option>
                          <option value={2}>2x/day</option>
                          <option value={3}>3x/day</option>
                          <option value={4}>4x/day</option>
                        </select>
                        {medications.length > 2 && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setMedications(
                                medications.filter((_, i) => i !== idx),
                              );
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {medications.length < 4 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setMedications([
                          ...medications,
                          { name: "", dose: "", frequencyPerDay: 1 },
                        ]);
                      }}
                    >
                      + Add Medication
                    </button>
                  )}
                </div>

                <div className="conflict-check-row">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void checkMeds(selectedPatient.id)}
                    disabled={checkingConflicts}
                  >
                    {checkingConflicts ? "Checking..." : "Check Drug Conflict"}
                  </button>
                  {conflictCheckResult && (
                    <span
                      className={`conflict-chip ${checkedHasConflicts ? "warn" : "safe"}`}
                    >
                      {checkedHasConflicts
                        ? `${checkedInteractions.length} conflict${checkedInteractions.length === 1 ? "" : "s"} found`
                        : "No conflict found"}
                    </span>
                  )}
                </div>

                {conflictCheckError && (
                  <p className="conflict-error">{conflictCheckError}</p>
                )}

                {conflictCheckResult && (
                  <div
                    className={`conflict-result ${checkedHasConflicts ? "warn" : "safe"}`}
                  >
                    <p className="conflict-result-title">
                      {checkedHasConflicts
                        ? "Potential interactions detected."
                        : "No interaction detected for the entered medications."}
                    </p>
                    {checkedHasConflicts && (
                      <ul className="conflict-result-list">
                        {checkedInteractions.map((interaction, index) => (
                          <li key={`${interaction.medications.join("-")}-${index}`}>
                            <strong>{interaction.medications.join(" + ")}</strong>{" "}
                            ({interaction.severity}) - {interaction.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="disease-impact-box">
                  <label>Chronic Disease Impact Check</label>
                  <div className="disease-impact-inputs">
                    <select
                      value={selectedChronicDisease}
                      onChange={(e) => setSelectedChronicDisease(e.target.value)}
                    >
                      {CHRONIC_DISEASE_OPTIONS.map((disease) => (
                        <option key={disease} value={disease}>
                          {disease}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={impactDrugA}
                      onChange={(e) => setImpactDrugA(e.target.value)}
                      placeholder="Medicine 1"
                    />
                    <input
                      type="text"
                      value={impactDrugB}
                      onChange={(e) => setImpactDrugB(e.target.value)}
                      placeholder="Medicine 2"
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void checkDiseaseImpact()}
                      disabled={checkingDiseaseImpact}
                    >
                      {checkingDiseaseImpact
                        ? "Checking..."
                        : "Check Disease Impact"}
                    </button>
                  </div>

                  {diseaseImpactError && (
                    <p className="conflict-error">{diseaseImpactError}</p>
                  )}

                  {diseaseImpactResult && (
                    <div
                      className={`disease-impact-result ${diseaseImpactResult.risk}`}
                    >
                      <p className="disease-impact-title">
                        {diseaseImpactResult.risk === "warning"
                          ? "Warning"
                          : "Safe"}
                      </p>
                      <p className="disease-impact-summary">
                        {diseaseImpactResult.summary}
                      </p>
                      <p className="disease-impact-powered">
                        Powered by TF-IDF Model
                      </p>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => setPatientCondition(selectedPatient.id)}
                    disabled={settingCondition || !conditionInput.trim()}
                    style={{ flex: 1 }}
                  >
                    {settingCondition
                      ? "Updating..."
                      : "Update Condition & Schedule"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={cancelEdit}
                    disabled={settingCondition}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Patient Feedback Section */}
            <div className="patient-feedback-section">
              <div className="send-message-header">
                <button
                  type="button"
                  className="send-message-toggle"
                  onClick={() =>
                    setIsSendMessageCollapsed((prevCollapsed) => !prevCollapsed)
                  }
                  aria-expanded={!isSendMessageCollapsed}
                >
                  <span
                    className={`triangle-indicator ${isSendMessageCollapsed ? "" : "expanded"}`}
                    aria-hidden="true"
                  ></span>
                  <span>Send Message</span>
                </button>
              </div>

              {!isSendMessageCollapsed && (
                <div className="send-message-section">
                  <p className="form-description">
                    Review patient messages and send updates from here.
                  </p>

                  {(selectedPatient.feedback?.length ?? 0) > 0 && (
                    <div className="feedback-list">
                      {selectedPatient.feedback?.map((f, idx) => {
                        const isDoctorMessage = f.sender === "doctor";
                        return (
                          <div
                            key={`${f.timestamp}-${idx}`}
                            className={`feedback-item ${isDoctorMessage ? "feedback-doctor" : "feedback-patient"}`}
                          >
                            <div className="feedback-meta">
                              <span
                                className={`feedback-author ${isDoctorMessage ? "doctor" : "patient"}`}
                              >
                                {isDoctorMessage ? "You" : "Patient"}
                              </span>
                              <small>
                                {new Date(f.timestamp).toLocaleString()}
                              </small>
                            </div>
                            <p>{f.text}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="doctor-reply-form">
                    <textarea
                      className="doctor-reply-input"
                      rows={3}
                      value={doctorReplyInput}
                      onChange={(e) => setDoctorReplyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendDoctorReply(selectedPatient.id);
                        }
                      }}
                      placeholder="Reply to patient updates without changing the treatment plan..."
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => void sendDoctorReply(selectedPatient.id)}
                      disabled={!doctorReplyInput.trim() || sendingDoctorReply}
                    >
                      {sendingDoctorReply ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="doctor-center">
            <p className="empty-state">
              Select a patient to view symptoms and assign a condition
            </p>
          </section>
        )}

        {/* Right Panel: AI Chat */}
        {selectedPatient && (
          <aside className="doctor-ai-panel">
            <div className="ai-header">
              <h3>AI Consultant</h3>
              <p className="ai-subtitle">
                Ask for diagnosis or treatment-plan guidance
              </p>
            </div>

            <div className="ai-chat-container">
              {aiChat.length === 0 ? (
                <div className="ai-welcome">
                  <p>
                    Ask me for help diagnosing the patient's condition based on
                    their symptoms.
                  </p>
                  <ul>
                    <li>"What conditions match these symptoms?"</li>
                    <li>"What medications would help?"</li>
                    <li>"Are there any interactions I should know about?"</li>
                  </ul>
                </div>
              ) : (
                <div className="ai-messages">
                  {aiChat.map((msg, idx) => (
                    <div key={idx} className={`ai-message ai-${msg.role}`}>
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="ai-loading">AI is thinking...</div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            <div className="ai-quick-prompts">
              <button
                className="quick-prompt-btn"
                onClick={() =>
                  setAiInput("Summarize this case in 3 concise bullet points.")
                }
              >
                Case Summary
              </button>
              <button
                className="quick-prompt-btn"
                onClick={() =>
                  setAiInput(
                    "Suggest a safer alternative plan and explain why in simple terms.",
                  )
                }
              >
                Safer Plan
              </button>
              <button
                className="quick-prompt-btn"
                onClick={() =>
                  setAiInput(
                    "Create a patient-friendly counseling script for this medication plan.",
                  )
                }
              >
                Counseling Script
              </button>
            </div>

            <div className="ai-input-area">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && askAI()}
                placeholder="Ask AI about the patient..."
                disabled={aiLoading}
              />
              <button
                className="btn btn-small"
                onClick={askAI}
                disabled={!aiInput.trim() || aiLoading}
              >
                Send
              </button>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
