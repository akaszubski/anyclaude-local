const http = require("http");
const fs = require("fs");

// Read CLAUDE.md
const claudeMd = fs.readFileSync("CLAUDE.md", "utf8");
console.log(
  "CLAUDE.md size:",
  claudeMd.length,
  "chars (~" + Math.round(claudeMd.length / 4) + " tokens)"
);

// Simulate Anthropic API request
const payload = JSON.stringify({
  model: "claude-opus-4-5-20251101",
  max_tokens: 100,
  system: claudeMd,
  messages: [{ role: "user", content: "hi who are you?" }],
});

// Find proxy port from process or use default
const port = process.argv[2] || 65523;
console.log("Sending to proxy at port:", port);

const options = {
  hostname: "localhost",
  port: port,
  path: "/v1/messages",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "test-key",
    "Content-Length": Buffer.byteLength(payload),
  },
};

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    if (res.statusCode === 200) {
      console.log("SUCCESS! Response received (truncation worked)");
      console.log("Response preview:", data.substring(0, 200) + "...");
    } else {
      console.log("Response:", data.substring(0, 500));
    }
  });
});

req.on("error", (e) => {
  console.log("Error:", e.message);
});

req.write(payload);
req.end();
