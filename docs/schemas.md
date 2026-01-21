# Canonical Schemas (v0.1)
These schemas are the contract across SDK, gateway, and control-plane.
Do NOT change without explicit approval.

## AgentActionRequest
- request_id: string (uuid)
- timestamp: string (ISO-8601)
- agent:
  - agent_id: string
  - name: string
  - owner: string (email or team)
  - environment: "dev" | "staging" | "prod"
- action:
  - type: "tool_call"
  - tool_name: string
  - tool_args: object (raw may be redacted)
- context:
  - user_input: string (optional; may be redacted)
  - data_labels: string[] (e.g., ["PII","PCI"])
  - risk_hints: string[] (e.g., ["BULK_EXPORT","EXTERNAL_SEND"])
  - trace_id: string (optional)

## Decision
- outcome: "ALLOW" | "DENY" | "REQUIRE_APPROVAL"
- reasons: { code: string, message: string }[]
- approver_role: string (optional)
- constraints: object (optional; e.g., max_rows, rate_limit_per_min)

## Event
- event_id: string (uuid)
- timestamp: string (ISO-8601)
- request_id: string
- agent_id: string
- tool_name: string
- outcome: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "APPROVED" | "REJECTED"
- reasons: { code: string, message: string }[]
- safe_payload: object (redacted/minimized)

## PolicyBundle
- version: string
- generated_at: string (ISO-8601)
- expires_at: string (ISO-8601)
- rules: PolicyRule[]
- defaults: object
- signature: string (optional in v0.1)

## PolicyRule (v0.1 simple)
- id: string
- description: string
- match:
  - tool_name: string | "*"
  - environment: "dev" | "staging" | "prod" | "*"
- when:
  - contains_any: string[] (applies to user_input + tool_args as stringified)
  - data_labels_any: string[]
- outcome:
  - "ALLOW" | "DENY" | "REQUIRE_APPROVAL"
- approver_role: string (optional)
