import { askGemini3 } from "./gemini_client.js";
async function run() {
    console.log("Asking Gemini 3 Flash...");
    const answer = await askGemini3("Explain the theory of relativity in one sentence.");
    console.log("\nResponse:\n", answer);
}
run();
