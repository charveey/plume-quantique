import path from "path";
import { fileURLToPath } from "url";

// Resolve the __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the Netlify function default export
import deploySucceeded from "../netlify/functions/deploy-succeeded.mts";

// Simulate a Request object
const req = new Request("http://localhost/");

// Minimal Context object
const context = {} as any;

(async () => {
  try {
    const res = await deploySucceeded(req, context);
    const text = await res.text();
    console.log("=== Function Output ===");
    console.log(text);
    console.log("=======================");
  } catch (err: any) {
    console.error("❌ Function failed:", err.message);
  }
})();
