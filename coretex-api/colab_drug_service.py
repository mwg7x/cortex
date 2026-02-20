import joblib
from fastapi import FastAPI
import uvicorn

# Load trained model files
model = joblib.load("drug_model.pkl")
vectorizer = joblib.load("vectorizer.pkl")
le = joblib.load("label_encoder.pkl")

app = FastAPI()


@app.get("/")
def root():
    return {"status": "Drug Interaction Model is running"}


@app.get("/check")
def check(drug1: str, drug2: str):
    text = f"{drug1} {drug2}"
    vec = vectorizer.transform([text])
    pred = model.predict(vec)[0]
    level = le.inverse_transform([pred])[0]

    normalized = str(level).strip().lower()
    if normalized == "high":
        message = "HIGH RISK interaction - avoid taking together"
    elif normalized == "moderate":
        message = "MODERATE interaction - use caution"
    else:
        level = "Low"
        message = "LOW interaction - relatively safe"

    return {
        "drug1": drug1,
        "drug2": drug2,
        "interaction_level": level,
        "message": message,
    }


if __name__ == "__main__":
    # Use 0.0.0.0 for Colab/ngrok exposure.
    uvicorn.run(app, host="0.0.0.0", port=8000)
