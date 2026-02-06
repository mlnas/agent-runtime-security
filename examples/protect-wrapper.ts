/**
 * protect() Wrapper Example
 *
 * Shows how to wrap existing functions with automatic security checks.
 */

import { AgentSecurity, SecurityError } from "../core/src";
import * as path from "path";

const security = new AgentSecurity({
  policyPath: path.join(__dirname, "../default-policy.json"),
  defaultEnvironment: "prod",
});

// Your existing tool functions
async function sendEmailOriginal(to: string, subject: string, body: string) {
  console.log(`  → Sending email to ${to}...`);
  return { success: true, messageId: "msg-123" };
}

async function queryDatabaseOriginal(query: string) {
  console.log(`  → Executing query: ${query}`);
  return { rows: [{ id: 1, name: "Alice" }] };
}

// Wrap them with security
const sendEmail = security.protect("send_email", sendEmailOriginal, {
  agentId: "email-agent",
  environment: "dev", // dev is allowed
  extractToolArgs: (to, subject, body) => ({ to, subject, body }),
});

const queryDatabase = security.protect("query_database", queryDatabaseOriginal, {
  agentId: "db-agent",
  environment: "prod",
  extractToolArgs: (query) => ({ query }),
});

async function main() {
  console.log("=== Protected Functions ===\n");

  // 1. Allowed (dev environment)
  try {
    console.log("1. Send email (dev):");
    await sendEmail("user@example.com", "Hello", "World");
    console.log("  ✓ Success\n");
  } catch (e) {
    if (e instanceof SecurityError) console.log(`  ✗ Blocked: ${e.message}\n`);
  }

  // 2. Allowed (safe query)
  try {
    console.log("2. Safe query (prod):");
    await queryDatabase("SELECT name FROM users LIMIT 10");
    console.log("  ✓ Success\n");
  } catch (e) {
    if (e instanceof SecurityError) console.log(`  ✗ Blocked: ${e.message}\n`);
  }

  // Show audit trail
  console.log("=== Audit Trail ===");
  security.getAuditLog().forEach((ev, i) => {
    console.log(`  ${i + 1}. ${ev.outcome}: ${ev.tool_name}`);
  });
}

main();
