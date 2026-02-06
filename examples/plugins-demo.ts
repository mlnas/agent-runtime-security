/**
 * Plugins Demo
 *
 * Shows how to use the built-in plugins: kill switch, rate limiter,
 * session context, and output validator.
 */

import {
  AgentSecurity,
  killSwitch,
  rateLimiter,
  sessionContext,
  outputValidator,
} from "../core/src";
import * as path from "path";

// Create plugins
const ks = killSwitch();
const rl = rateLimiter({ maxPerMinute: 3 });
const sc = sessionContext({
  limits: { send_email: { maxPerSession: 2 } },
});
const ov = outputValidator({
  sensitivePatterns: [/\b\d{3}-\d{2}-\d{4}\b/], // SSN pattern
  onSensitiveData: (tool, matches) => {
    console.log(`  🚨 Sensitive data in ${tool}: ${matches.join(", ")}`);
  },
});

const security = new AgentSecurity({
  policyPath: path.join(__dirname, "../default-policy.json"),
  defaultEnvironment: "dev",
  plugins: [ks, rl, sc, ov],
});

async function main() {
  console.log("=== Plugin Demos ===\n");

  // Kill switch
  console.log("--- Kill Switch ---");
  ks.kill("bad-agent", "Compromised");
  const r1 = await security.checkToolCall({
    toolName: "anything",
    toolArgs: {},
    agentId: "bad-agent",
    environment: "dev",
  });
  console.log(`  bad-agent allowed? ${r1.allowed}`);
  ks.revive("bad-agent");
  console.log(`  Revived. Is killed? ${ks.isKilled("bad-agent")}\n`);

  // Rate limiter
  console.log("--- Rate Limiter (max 3/min) ---");
  for (let i = 1; i <= 4; i++) {
    const r = await security.checkToolCall({
      toolName: "fast_tool",
      toolArgs: {},
      agentId: "speed-agent",
      environment: "dev",
    });
    console.log(`  Call ${i}: ${r.allowed ? "✓" : "✗ rate-limited"}`);
  }
  console.log();

  // Session context
  console.log("--- Session Context (max 2 emails/session) ---");
  for (let i = 1; i <= 3; i++) {
    const r = await security.checkToolCall({
      toolName: "send_email",
      toolArgs: { to: `user${i}@example.com` },
      agentId: "session-agent",
      environment: "dev",
      sessionId: "sess-123",
    });
    console.log(`  Email ${i}: ${r.allowed ? "✓" : "✗ session limit"}`);
  }
  console.log();

  // Output validator (via protect wrapper)
  console.log("--- Output Validator ---");
  const riskyTool = security.protect(
    "lookup_user",
    async (userId: string) => {
      // Simulates a tool that accidentally returns an SSN
      return { name: "Alice", ssn: "123-45-6789" };
    },
    { agentId: "lookup-agent", extractToolArgs: (id) => ({ userId: id }) }
  );
  await riskyTool("user-1");
  console.log(`  Violations: ${ov.getViolations().length}`);
  ov.getViolations().forEach((v) => {
    console.log(`    [${v.type}] ${v.toolName}: ${v.details}`);
  });

  console.log("\n=== Done ===");
  await security.shutdown();
}

main();
