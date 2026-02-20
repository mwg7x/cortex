import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import coretexLogo from "./assets/coretex-logo.svg";
import healthVisual1 from "./assets/health-visual-1.svg";
import healthVisual2 from "./assets/health-visual-2.svg";
import healthVisual3 from "./assets/health-visual-3.svg";
const API_BASE = import.meta.env.VITE_API_BASE?.trim() ||
    "http://localhost:4000";
function toRequestErrorMessage(caught, fallback) {
    if (caught instanceof TypeError &&
        caught.message.toLowerCase().includes("failed to fetch")) {
        return `Cannot reach API server at ${API_BASE}. Start the backend with "npm run dev:api".`;
    }
    if (caught instanceof Error && caught.message.trim()) {
        return caught.message;
    }
    return fallback;
}
function PatientLogo() {
    return (_jsx("img", { src: coretexLogo, alt: "CoreTex logo", className: "patient-top-logo" }));
}
function EmergencyNotice() {
}
function PatientVisualGallery() {
    return (_jsxs("section", { className: "patient-visual-gallery", "aria-label": "Patient support visuals", children: [_jsx("img", { src: healthVisual1, alt: "Health monitoring visual" }), _jsx("img", { src: healthVisual2, alt: "Medication management visual" }), _jsx("img", { src: healthVisual3, alt: "Care team communication visual" })] }));
}
export function App() {
    const [patientId, setPatientId] = useState(null);
    const [patientName, setPatientName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [symptom, setSymptom] = useState("");
    const [symptomSubmitted, setSymptomSubmitted] = useState(false);
    const [patientData, setPatientData] = useState(null);
    const [messageInput, setMessageInput] = useState("");
    const [messageSubmitted, setMessageSubmitted] = useState(false);
    useEffect(() => {
        const storedId = sessionStorage.getItem("patientId");
        const storedName = sessionStorage.getItem("patientName");
        if (storedId && storedName) {
            setPatientId(storedId);
            setPatientName(storedName);
            void fetchPatientData(storedId);
        }
    }, []);
    useEffect(() => {
        if (!patientId)
            return;
        void fetchPatientData(patientId);
        const interval = setInterval(() => {
            void fetchPatientData(patientId);
        }, 3000);
        return () => clearInterval(interval);
    }, [patientId]);
    const fetchPatientData = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/patients/${id}`);
            if (!res.ok)
                throw new Error("Fetch failed");
            const data = (await res.json());
            if (data && data.id && data.name) {
                setPatientData({
                    ...data,
                    reports: data.reports ?? [],
                    feedback: data.feedback ?? [],
                });
                // If patient already submitted reports or has a condition, skip symptom form.
                if ((data.reports?.length ?? 0) > 0 || Boolean(data.condition)) {
                    setSymptomSubmitted(true);
                }
            }
        }
        catch (caught) {
            console.error("Fetch patient data failed:", caught);
        }
    };
    const handleSignup = async () => {
        if (!patientName.trim()) {
            setError("Please enter your name");
            return;
        }
        setError("");
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/signup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: patientName }),
            });
            if (!res.ok)
                throw new Error("Signup failed");
            const created = (await res.json());
            sessionStorage.setItem("patientId", created.id);
            sessionStorage.setItem("patientName", created.name);
            setPatientId(created.id);
            setPatientData({
                id: created.id,
                name: created.name,
                condition: null,
                analysis: null,
                reports: [],
                feedback: [],
            });
        }
        catch (caught) {
            setError(toRequestErrorMessage(caught, "Signup failed"));
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleSubmitSymptom = async () => {
        if (!symptom.trim() || !patientId)
            return;
        setError("");
        try {
            const res = await fetch(`${API_BASE}/patients/${patientId}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: symptom }),
            });
            if (!res.ok)
                throw new Error("Failed to submit symptoms");
            setSymptom("");
            setSymptomSubmitted(true);
            await fetchPatientData(patientId);
        }
        catch (caught) {
            setError(toRequestErrorMessage(caught, "Failed to submit symptoms"));
        }
    };
    const handleSendMessageToDoctor = async () => {
        if (!messageInput.trim() || !patientId)
            return;
        setError("");
        try {
            const res = await fetch(`${API_BASE}/patients/${patientId}/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: messageInput }),
            });
            if (!res.ok)
                throw new Error("Failed to send message");
            setMessageInput("");
            setMessageSubmitted(true);
            setTimeout(() => setMessageSubmitted(false), 2500);
            await fetchPatientData(patientId);
        }
        catch (caught) {
            setError(toRequestErrorMessage(caught, "Failed to send message"));
        }
    };
    const handleLogout = () => {
        sessionStorage.clear();
        setPatientId(null);
        setPatientName("");
        setPatientData(null);
        setSymptom("");
        setSymptomSubmitted(false);
        setMessageInput("");
        setMessageSubmitted(false);
        setError("");
    };
    const hasCondition = Boolean(patientData?.condition);
    const hasAnalysis = Boolean(patientData?.analysis);
    const hasPlan = hasCondition && hasAnalysis;
    const journeyStep = !symptomSubmitted
        ? 1
        : !hasCondition
            ? 2
            : !hasPlan
                ? 3
                : 4;
    const scheduleTimeline = useMemo(() => {
        const schedule = patientData?.analysis?.schedule ?? [];
        return schedule
            .flatMap((slot) => slot.times.map((time) => ({
            time,
            medication: slot.medication,
            note: slot.note,
        })))
            .sort((a, b) => a.time.localeCompare(b.time));
    }, [patientData?.analysis?.schedule]);
    const messageHistory = patientData?.feedback ?? [];
    const patientSentMessageCount = messageHistory.filter((message) => message.sender !== "doctor").length;
    const nextDose = scheduleTimeline[0]
        ? `${scheduleTimeline[0].time} • ${scheduleTimeline[0].medication}`
        : "Pending";
    const planStatus = hasPlan ? "Active" : "Pending";
    const journeyBar = (_jsx("section", { className: "journey-bar", children: ["Symptoms", "Doctor Review", "Plan Build", "Active Treatment"].map((label, index) => (_jsxs("div", { className: `journey-step ${journeyStep >= index + 1 ? "active" : ""}`, children: [_jsx("span", { className: "journey-dot", children: index + 1 }), _jsx("p", { children: label })] }, label))) }));
    const patientPageEnhancements = (_jsxs(_Fragment, { children: [_jsx(EmergencyNotice, {}), _jsx(PatientVisualGallery, {})] }));
    const messageCard = (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Message Your Doctor" }), _jsx("p", { className: "form-description", children: "Send a new message anytime if symptoms change or you need plan adjustments." }), _jsx("textarea", { value: messageInput, onChange: (e) => setMessageInput(e.target.value), placeholder: "Example: I started feeling dizzy after the evening dose. Can we adjust timing?", rows: 4, className: "symptoms-textarea" }), _jsx("button", { className: "btn btn-primary", onClick: handleSendMessageToDoctor, disabled: !messageInput.trim(), children: "Send Message to Doctor" }), messageSubmitted && (_jsx("p", { className: "form-description", style: { color: "#0284c7", marginTop: "12px" }, children: "Message sent." })), messageHistory.length > 0 && (_jsxs("div", { className: "submitted-symptoms", children: [_jsx("h3", { children: "Conversation" }), _jsx("div", { className: "report-list", children: messageHistory
                            .slice()
                            .reverse()
                            .map((item, idx) => {
                            const isDoctorMessage = item.sender === "doctor";
                            return (_jsxs("div", { className: `report-item ${isDoctorMessage ? "report-item-doctor" : "report-item-patient"}`, children: [_jsxs("small", { children: [isDoctorMessage ? "Doctor" : "You", " \u2022", " ", new Date(item.timestamp).toLocaleString()] }), _jsx("p", { children: item.text })] }, `${item.timestamp}-${idx}`));
                        }) })] }))] }));
    if (!patientId) {
        return (_jsxs("main", { className: "auth-container", children: [_jsxs("div", { className: "auth-card", children: [_jsxs("div", { className: "auth-header", children: [_jsx(PatientLogo, {}), _jsx("p", { className: "auth-subtitle", children: "Patient Portal" })] }), _jsxs("div", { className: "auth-form", children: [_jsx("h2", { children: "Welcome" }), _jsx("p", { className: "form-description", children: "Tell us your name to get started" }), error && _jsx("div", { className: "error-message", children: error }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "name", children: "Full Name" }), _jsx("input", { id: "name", type: "text", value: patientName, onChange: (e) => setPatientName(e.target.value), placeholder: "John Doe", onKeyDown: (e) => e.key === "Enter" && void handleSignup() })] }), _jsx("button", { className: "btn btn-primary", onClick: handleSignup, disabled: isLoading, children: isLoading ? "Creating Account..." : "Get Started" })] })] })] }));
    }
    if (!symptomSubmitted) {
        return (_jsxs("main", { className: "patient-page", children: [_jsx("header", { className: "patient-header", children: _jsxs("div", { className: "header-content", children: [_jsxs("div", { children: [_jsx(PatientLogo, {}), _jsx("p", { className: "eyebrow", children: "CoreTex" }), _jsx("h1", { children: "Tell Us Your Symptoms" }), _jsxs("p", { className: "subhead", children: ["Welcome, ", patientName] })] }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: handleLogout, children: "Logout" })] }) }), journeyBar, patientPageEnhancements, _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Describe Your Symptoms" }), _jsx("p", { className: "form-description", children: "Your doctor will review this and create your treatment plan." }), error && _jsx("div", { className: "error-message", children: error }), _jsx("textarea", { value: symptom, onChange: (e) => setSymptom(e.target.value), placeholder: "Example: I have headache, fever, and body aches for 2 days.", rows: 6, className: "symptoms-textarea" }), _jsx("button", { className: "btn btn-primary", onClick: handleSubmitSymptom, disabled: !symptom.trim(), children: "Submit Symptoms" })] })] }));
    }
    if (!hasCondition) {
        return (_jsxs("main", { className: "patient-page", children: [_jsx("header", { className: "patient-header", children: _jsxs("div", { className: "header-content", children: [_jsxs("div", { children: [_jsx(PatientLogo, {}), _jsx("p", { className: "eyebrow", children: "CoreTex" }), _jsx("h1", { children: "Your Care Team is Working" }), _jsxs("p", { className: "subhead", children: ["Welcome, ", patientName] })] }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: handleLogout, children: "Logout" })] }) }), journeyBar, patientPageEnhancements, _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Waiting for Doctor Review" }), _jsxs("div", { className: "waiting-container", children: [_jsx("div", { className: "spinner" }), _jsx("p", { className: "waiting-text", children: "Your symptoms were received. Your doctor is preparing your plan." }), _jsx("p", { className: "waiting-subtext", children: "This page updates automatically." })] }), _jsxs("div", { className: "submitted-symptoms", children: [_jsx("h3", { children: "Your Submitted Symptoms" }), _jsx("div", { className: "report-list", children: (patientData?.reports ?? []).map((report, idx) => (_jsxs("div", { className: "report-item", children: [_jsx("small", { children: new Date(report.timestamp).toLocaleString() }), _jsx("p", { children: report.text })] }, `${report.timestamp}-${idx}`))) })] })] }), messageCard] }));
    }
    if (!hasPlan) {
        return (_jsxs("main", { className: "patient-page", children: [_jsx("header", { className: "patient-header", children: _jsxs("div", { className: "header-content", children: [_jsxs("div", { children: [_jsx(PatientLogo, {}), _jsx("p", { className: "eyebrow", children: "CoreTex" }), _jsx("h1", { children: "Your Treatment Plan" }), _jsx("p", { className: "subhead", children: "Treatment plan assigned. Loading medication details..." })] }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: handleLogout, children: "Logout" })] }) }), journeyBar, patientPageEnhancements, _jsx("section", { className: "card", children: _jsxs("div", { className: "waiting-container", children: [_jsx("div", { className: "spinner" }), _jsx("p", { className: "waiting-text", children: "Fetching your medication plan." }), _jsx("p", { className: "waiting-subtext", children: "This page will update automatically." })] }) }), messageCard] }));
    }
    return (_jsxs("main", { className: "patient-page", children: [_jsx("header", { className: "patient-header", children: _jsxs("div", { className: "header-content", children: [_jsxs("div", { children: [_jsx(PatientLogo, {}), _jsx("p", { className: "eyebrow", children: "CoreTex" }), _jsx("h1", { children: "Your Treatment Plan" }), _jsx("p", { className: "subhead", children: "Follow your medication timeline below." })] }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: handleLogout, children: "Logout" })] }) }), journeyBar, patientPageEnhancements, error && _jsx("div", { className: "error-message", children: error }), _jsxs("section", { className: "patient-stat-grid", children: [_jsxs("article", { className: "patient-stat-card", children: [_jsx("p", { className: "stat-label", children: "Today's Doses" }), _jsx("p", { className: "stat-value", children: scheduleTimeline.length })] }), _jsxs("article", { className: "patient-stat-card", children: [_jsx("p", { className: "stat-label", children: "Next Dose" }), _jsx("p", { className: "stat-value stat-value-sm", children: nextDose })] }), _jsxs("article", { className: "patient-stat-card", children: [_jsx("p", { className: "stat-label", children: "Plan Status" }), _jsx("p", { className: "stat-value stat-value-sm", children: planStatus })] }), _jsxs("article", { className: "patient-stat-card", children: [_jsx("p", { className: "stat-label", children: "Messages Sent" }), _jsx("p", { className: "stat-value", children: patientSentMessageCount })] })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Your Medication Timeline" }), _jsx("div", { className: "timeline", children: scheduleTimeline.map((item, index) => (_jsxs("div", { className: "timeline-item", children: [_jsx("div", { className: "timeline-time", children: item.time }), _jsxs("div", { className: "timeline-content", children: [_jsx("p", { className: "med", children: item.medication }), item.note && _jsx("p", { className: "instruction", children: item.note })] })] }, `${item.medication}-${item.time}-${index}`))) })] }), messageCard] }));
}
