/**
 * Canonical Schemas (v0.1)
 * These schemas are the contract across SDK, gateway, and control-plane.
 * Do NOT change without explicit approval.
 */

export interface AgentActionRequest {
  request_id: string; // uuid
  timestamp: string; // ISO-8601
  agent: {
    agent_id: string;
    name: string;
    owner: string; // email or team
    environment: "dev" | "staging" | "prod";
  };
  action: {
    type: "tool_call";
    tool_name: string;
    tool_args: Record<string, any>; // raw may be redacted
  };
  context: {
    user_input?: string; // optional; may be redacted
    data_labels?: string[]; // e.g., ["PII","PCI"]
    risk_hints?: string[]; // e.g., ["BULK_EXPORT","EXTERNAL_SEND"]
    trace_id?: string; // optional
  };
}

export type DecisionOutcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface Decision {
  outcome: DecisionOutcome;
  reasons: Array<{
    code: string;
    message: string;
  }>;
  approver_role?: string; // optional
  constraints?: Record<string, any>; // optional; e.g., max_rows, rate_limit_per_min
}

export type EventOutcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "APPROVED" | "REJECTED";

export interface Event {
  event_id: string; // uuid
  timestamp: string; // ISO-8601
  request_id: string;
  agent_id: string;
  tool_name: string;
  outcome: EventOutcome;
  reasons: Array<{
    code: string;
    message: string;
  }>;
  safe_payload: Record<string, any>; // redacted/minimized
}

export interface PolicyRule {
  id: string;
  description: string;
  match: {
    tool_name: string; // string or "*"
    environment: "dev" | "staging" | "prod" | "*";
  };
  when?: {
    contains_any?: string[]; // applies to user_input + tool_args as stringified
    data_labels_any?: string[];
  };
  outcome: DecisionOutcome;
  approver_role?: string; // optional
}

export interface PolicyBundle {
  version: string;
  generated_at: string; // ISO-8601
  expires_at: string; // ISO-8601
  rules: PolicyRule[];
  defaults: {
    outcome: DecisionOutcome;
  };
  signature?: string; // optional in v0.1
}
