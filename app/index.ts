import { query } from "@anthropic-ai/claude-agent-sdk";

async function main() {
  console.log("Starting Claude Agent SDK test...");
  console.log(`HTTPS_PROXY: ${process.env.HTTPS_PROXY ?? "(not set)"}`);
  console.log(`NODE_EXTRA_CA_CERTS: ${process.env.NODE_EXTRA_CA_CERTS ?? "(not set)"}`);

  for await (const message of query({
    prompt: "Say hello in exactly 5 words.",
    options: {
      maxTurns: 1,
    },
  })) {
    if ("result" in message) {
      console.log("\nAgent result:", message.result);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
