#!/usr/bin/env ts-node

import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const GATEWAY_URL = "http://localhost:3000";

/**
 * Simple demo script for live demonstrations
 * Tests three scenarios: ALLOW, DENY, REQUIRE_APPROVAL
 */

interface AgentActionRequest {
  request_id: string;
  timestamp: string;
  agent: {
    agent_id: string;
    name: string;
    owner: string;
    environment: "dev" | "staging" | "prod";
  };
  action: {
    type: "tool_call";
    tool_name: string;
    tool_args: Record<string, any>;
  };
  context: {
    user_input?: string;
    data_labels?: string[];
    risk_hints?: string[];
    trace_id?: string;
  };
}

function createRequest(
  toolName: string,
  environment: "dev" | "staging" | "prod",
  toolArgs: Record<string, any>,
  userInput?: string
): AgentActionRequest {
  return {
    request_id: uuidv4(),
    timestamp: new Date().toISOString(),
    agent: {
      agent_id: "demo-agent-001",
      name: "DemoAgent",
      owner: "demo@example.com",
      environment,
    },
    action: {
      type: "tool_call",
      tool_name: toolName,
      tool_args: toolArgs,
    },
    context: {
      user_input: userInput,
    },
  };
}

async function testScenario(
  title: string,
  request: AgentActionRequest
): Promise<void> {
  console.log("\n" + "=".repeat(50));
  console.log(`Test: ${title}`);
  console.log("=".repeat(50));

  try {
    const response = await axios.post(`${GATEWAY_URL}/tool-call`, request);
    
    // Success (200)
    console.log("✓ ALLOWED");
    console.log(`Reason: ${response.data.reason.code}`);
    console.log(`Message: ${response.data.reason.message}`);
  } catch (error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 403) {
        // Denied
        console.log("✗ DENIED");
        console.log(`Reason: ${data.reason.code}`);
        console.log(`Message: ${data.reason.message}`);
      } else if (status === 202) {
        // Approval required
        console.log("⏳ APPROVAL REQUIRED");
        console.log(`Reason: ${data.reason.code}`);
        console.log(`Message: ${data.reason.message}`);
      } else {
        console.log(`⚠️  Unexpected status: ${status}`);
        console.log(`Response:`, data);
      }
    } else {
      console.log("⚠️  Error:", error.message);
    }
  }
}

async function checkGateway(): Promise<boolean> {
  try {
    await axios.get(`${GATEWAY_URL}/tool-call`, { timeout: 2000 });
    return true;
  } catch (error: any) {
    // Gateway responds with 404 for GET on /tool-call, which means it's running
    if (error.response && error.response.status === 404) {
      return true;
    }
    return false;
  }
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   Agent Runtime Security - Simple Demo        ║");
  console.log("╚════════════════════════════════════════════════╝");

  // Check if gateway is running
  console.log("\nChecking gateway availability...");
  const isRunning = await checkGateway();
  
  if (!isRunning) {
    console.log("❌ Gateway is not running!");
    console.log("Please start it with: cd gateway && npm run dev");
    process.exit(1);
  }
  
  console.log("✓ Gateway is running");

  // Test 1: Safe tool call (ALLOW)
  await testScenario(
    "Safe Tool Call",
    createRequest(
      "query_user_profile",
      "dev",
      { user_id: "12345" }
    )
  );

  // Test 2: Bulk export attempt (DENY)
  await testScenario(
    "Bulk Export Attempt",
    createRequest(
      "query_customer_db",
      "prod",
      { query: "SELECT * FROM customers WHERE 1=1" },
      "I need to export all customers to a CSV file"
    )
  );

  // Test 3: Production email (REQUIRE_APPROVAL)
  await testScenario(
    "Production Email",
    createRequest(
      "send_email",
      "prod",
      {
        to: "customer@example.com",
        subject: "Important Update",
        body: "Your account has been updated.",
      }
    )
  );

  console.log("\n" + "=".repeat(50));
  console.log("Demo completed! ✓");
  console.log("=".repeat(50) + "\n");
}

main().catch((error) => {
  console.error("Demo failed:", error.message);
  process.exit(1);
});
