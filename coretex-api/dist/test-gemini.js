import { askGemini3 } from "./gemini_client.js";
async function run() {
    console.log("Asking Gemini...");
    try {
        const answer = await askGemini3("Explain the theory of relativity in one sentence.");
        console.log("\nResponse:\n", answer);
    }
    catch (err) {
        console.error("\nGemini test failed:\n", err.message);
        process.exitCode = 1;
    }
}
run();
