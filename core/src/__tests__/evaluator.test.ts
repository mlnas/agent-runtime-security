import { PolicyEvaluator } from "../evaluator";
import { AgentActionRequest, PolicyBundle } from "../schemas";

const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

function makeBundle(rules: PolicyBundle["rules"]): PolicyBundle {
  return {
    version: "0.1.0",
    generated_at: "2026-01-01T00:00:00.000Z",
    expires_at: FUTURE,
    rules,
    defaults: { outcome: "ALLOW" },
  };
}

function makeRequest(
  toolName: string,
  toolArgs: Record<string, unknown> = {},
  overrides: Partial<AgentActionRequest["agent"]> = {}
): AgentActionRequest {
  return {
    request_id: "test-req",
    timestamp: new Date().toISOString(),
    action: { type: "tool_call", tool_name: toolName, tool_args: toolArgs },
    agent: { agent_id: "test-agent", name: "Test Agent", owner: "test@example.com", environment: "prod", ...overrides },
    context: {},
  };
}

describe("PolicyEvaluator", () => {
  test("1. returns ALLOW when no rules match (default)", () => {
    const evaluator = new PolicyEvaluator(makeBundle([]));
    const result = evaluator.evaluate(makeRequest("any_tool"));
    expect(result.outcome).toBe("ALLOW");
  });

  test("2. exact tool_name match returns rule outcome", () => {
    const evaluator = new PolicyEvaluator(
      makeBundle([
        {
          id: "DENY_TOOL",
          description: "Block tool",
          match: { tool_name: "bad_tool", environment: "*" },
          outcome: "DENY",
        },
      ])
    );
    expect(evaluator.evaluate(makeRequest("bad_tool")).outcome).toBe("DENY");
    expect(evaluator.evaluate(makeRequest("safe_tool")).outcome).toBe("ALLOW");
  });

  test("3. glob prefix matching (query_*)", () => {
    const evaluator = new PolicyEvaluator(
      makeBundle([
        {
          id: "DENY_QUERIES",
          description: "Block all queries",
          match: { tool_name: "query_*", environment: "*" },
          outcome: "DENY",
        },
      ])
    );
    expect(evaluator.evaluate(makeRequest("query_customers")).outcome).toBe("DENY");
    expect(evaluator.evaluate(makeRequest("query_orders")).outcome).toBe("DENY");
    expect(evaluator.evaluate(makeRequest("send_email")).outcome).toBe("ALLOW");
  });

  test("4. array tool_name matching", () => {
    const evaluator = new PolicyEvaluator(
      makeBundle([
        {
          id: "APPROVE_PAYMENT",
          description: "Payment approval",
          match: { tool_name: ["trigger_payment", "trigger_refund"], environment: "prod" },
          outcome: "REQUIRE_APPROVAL",
        },
      ])
    );
    expect(evaluator.evaluate(makeRequest("trigger_payment")).outcome).toBe("REQUIRE_APPROVAL");
    expect(evaluator.evaluate(makeRequest("trigger_refund")).outcome).toBe("REQUIRE_APPROVAL");
    expect(evaluator.evaluate(makeRequest("query_db")).outcome).toBe("ALLOW");
  });

  test("5. environment matching — prod rule does not fire in dev", () => {
    const evaluator = new PolicyEvaluator(
      makeBundle([
        {
          id: "PROD_ONLY",
          description: "Prod only deny",
          match: { tool_name: "export_data", environment: "prod" },
          outcome: "DENY",
        },
      ])
    );
    expect(evaluator.evaluate(makeRequest("export_data")).outcome).toBe("DENY"); // env=prod
    const devReq = makeRequest("export_data");
    devReq.agent.environment = "dev";
    expect(evaluator.evaluate(devReq).outcome).toBe("ALLOW");
  });

  test("6. when.contains_any condition", () => {
    const evaluator = new PolicyEvaluator(
      makeBundle([
        {
          id: "DENY_SELECT_STAR",
          description: "Block bulk selects",
          match: { tool_name: "query_db", environment: "*" },
          when: { contains_any: ["SELECT *", "LIMIT 10000"] },
          outcome: "DENY",
        },
      ])
    );
    expect(
      evaluator.evaluate(makeRequest("query_db", { sql: "SELECT * FROM users" })).outcome
    ).toBe("DENY");
    expect(
      evaluator.evaluate(makeRequest("query_db", { sql: "SELECT id FROM users LIMIT 10" })).outcome
    ).toBe("ALLOW");
  });

  test("7. when.tool_args_match numeric comparison (gt)", () => {
    const evaluator = new PolicyEvaluator(
      makeBundle([
        {
          id: "HIGH_AMOUNT",
          description: "Flag high amounts",
          match: { tool_name: "trigger_payment", environment: "*" },
          when: { tool_args_match: { amount: { gt: 1000 } } },
          outcome: "REQUIRE_APPROVAL",
        },
      ])
    );
    expect(
      evaluator.evaluate(makeRequest("trigger_payment", { amount: 1500 })).outcome
    ).toBe("REQUIRE_APPROVAL");
    expect(
      evaluator.evaluate(makeRequest("trigger_payment", { amount: 500 })).outcome
    ).toBe("ALLOW");
  });

  test("8. unsafe regex is rejected (fail-closed, rule skipped)", () => {
    const evaluator = new PolicyEvaluator(
      makeBundle([
        {
          id: "UNSAFE_REGEX",
          description: "Rule with ReDoS pattern",
          match: { tool_name: "any_tool", environment: "*" },
          when: { matches_regex: "(a+)+" },
          outcome: "DENY",
        },
      ])
    );
    // Unsafe regex → getSafeRegex returns null → condition fails closed → rule does not match
    expect(evaluator.evaluate(makeRequest("any_tool", { input: "aaaaaa" })).outcome).toBe("ALLOW");
  });
});
