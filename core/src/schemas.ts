/**
 * Canonical Schemas (v0.2)
 *
 * These schemas are the contract for the Agent Runtime Security SDK.
 * They define the core data structures used across policy evaluation,
 * audit logging, and plugin lifecycle.
 */

// ---------------------------------------------------------------------------
// Agent Action Request
// ---------------------------------------------------------------------------

export interface AgentActionRequest {
  request_id: string; // uuid
  timestamp: string; // ISO-8601
  agent: {
    agent_id: string;
    name: string;
    owner: string; // email or team
    environment: string; // e.g. "dev", "staging", "prod", "sandbox", or any custom value
  };
  action: {
    type: string; // "tool_call", "memory_access", "web_browse", "code_execute", etc.
    tool_name: string;
    tool_args: Record<string, any>; // raw may be redacted
  };
  context: {
    user_input?: string; // optional; may be redacted
    data_labels?: string[]; // e.g., ["PII","PCI"]
    risk_hints?: string[]; // e.g., ["BULK_EXPORT","EXTERNAL_SEND"]
    trace_id?: string; // optional
    session_id?: string; // optional; for tracking state across calls
    parent_agent_id?: string; // optional; for multi-agent hierarchies
    [key: string]: any; // extensible context
  };
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

export type DecisionOutcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface Decision {
  outcome: DecisionOutcome;
  reasons: Array<{
    code: string;
    message: string;
  }>;
  approver_role?: string;
  constraints?: Record<string, any>; // e.g., max_rows, rate_limit_per_min
}

// ---------------------------------------------------------------------------
// Audit Event
// ---------------------------------------------------------------------------

export type EventOutcome =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "KILL_SWITCH"
  | "RATE_LIMITED"
  | "TIMEOUT";

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
  plugin_source?: string; // which plugin generated this event
}

// ---------------------------------------------------------------------------
// Policy Rules
// ---------------------------------------------------------------------------

export interface PolicyRule {
  id: string;
  description: string;
  match: {
    tool_name: string | string[]; // exact string, array of strings, glob pattern, or "*"
    environment: string; // any string or "*"
  };
  when?: {
    contains_any?: string[]; // applies to user_input + tool_args as stringified
    not_contains?: string[]; // none of these should match
    matches_regex?: string; // regex pattern to match against searchable text
    data_labels_any?: string[];
    tool_args_match?: Record<string, any>; // match specific tool_args values
  };
  outcome: DecisionOutcome;
  approver_role?: string;
  constraints?: Record<string, any>; // attached to the decision
}

export interface PolicyBundle {
  version: string;
  generated_at: string; // ISO-8601
  expires_at: string; // ISO-8601
  rules: PolicyRule[];
  defaults: {
    outcome: DecisionOutcome;
  };
  signature?: string; // optional; for policy integrity verification
}

// ---------------------------------------------------------------------------
// Plugin System
// ---------------------------------------------------------------------------

/**
 * Context passed to plugins during the beforeCheck phase.
 * Plugins can inspect the request and optionally short-circuit with a decision.
 */
export interface BeforeCheckContext {
  request: AgentActionRequest;
}

/**
 * Context passed to plugins during the afterDecision phase.
 * Plugins can inspect and optionally modify the decision.
 */
export interface AfterDecisionContext {
  request: AgentActionRequest;
  decision: Decision;
}

/**
 * Context passed to plugins during the afterExecution phase.
 * Plugins can inspect the tool result for output validation.
 */
export interface AfterExecutionContext {
  request: AgentActionRequest;
  decision: Decision;
  result?: any;
  error?: Error;
}

/**
 * Result returned by a plugin hook.
 * If a decision is provided, it short-circuits further evaluation.
 */
export interface PluginResult {
  /** If set, short-circuits with this decision */
  decision?: Decision;
  /** If set, replaces the request for subsequent processing */
  modifiedRequest?: AgentActionRequest;
}

/**
 * Interface that all security plugins must implement.
 *
 * Plugins hook into the security check lifecycle at defined phases:
 *
 *   Phase 1: beforeCheck   → Kill switch, rate limiting, session checks
 *   Phase 2: (evaluation)  → Core policy engine (not a plugin hook)
 *   Phase 3: afterDecision → Modify decisions, apply timeouts
 *   Phase 4: afterExecution → Output validation, audit enrichment
 */
export interface SecurityPlugin {
  /** Unique plugin name */
  readonly name: string;

  /** Semver version string */
  readonly version?: string;

  /**
   * Called once when the plugin is registered with the SDK.
   * Use for setup, connecting to external services, etc.
   */
  initialize?(): Promise<void>;

  /**
   * Called before policy evaluation.
   * Return a PluginResult with a decision to short-circuit evaluation.
   * Return void to continue to the next plugin / evaluation.
   */
  beforeCheck?(context: BeforeCheckContext): Promise<PluginResult | void>;

  /**
   * Called after policy evaluation, before the decision is finalized.
   * Can modify the decision (e.g. add timeout to approvals).
   * Return a PluginResult with a new decision to override.
   */
  afterDecision?(context: AfterDecisionContext): Promise<PluginResult | void>;

  /**
   * Called after tool execution (only when using protect() wrapper).
   * Use for output validation, audit enrichment, etc.
   */
  afterExecution?(context: AfterExecutionContext): Promise<void>;

  /**
   * Called when the SDK is being shut down.
   * Use for cleanup, flushing logs, disconnecting, etc.
   */
  destroy?(): Promise<void>;
}
