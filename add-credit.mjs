import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "public", "index.html");
if (!fs.existsSync(file)) {
  console.log("Could not find public/index.html. Put this file in the same folder as server.js and run it again.");
  process.exit(1);
}
let html = fs.readFileSync(file, "utf8");
if (html.includes("by Abdulhafiz")) {
  console.log("Already added. Nothing to do.");
  process.exit(0);
}

if (!html.includes("Front-end preview")) {
  console.log("Could not find the footer text. Nothing was changed.");
  process.exit(1);
}
html = html.replace("Front-end preview", "Made with ❤️ by Abdulhafiz");
if (!html.includes('name="author"')) {
  html = html.replace("<title>Job & Skills Opportunity Hub</title>", '<title>Job & Skills Opportunity Hub</title>\n<meta name="author" content="Abdulhafiz">');
}
fs.writeFileSync(file, html);
console.log("Done! Your name is now in the footer. Refresh the browser with Ctrl+F5.");