import { DataClassification, ClassificationResult } from "./classifiers";

/**
 * Egress channel types — the categories of data egress from an agent.
 */
export type EgressChannel =
  | "http_request"
  | "file_write"
  | "db_query"
  | "email"
  | "clipboard"
  | "ci_artifact"
  | "mcp_response"
  | "terminal_output";

/**
 * A structured egress event, capturing data flowing out of the agent boundary.
 */
export interface EgressEvent {
  timestamp: string;
  agent_id: string;
  tool_name: string;
  channel: EgressChannel;
  destination?: string; // URL, file path, email address, etc.
  classifications: ClassificationResult[];
  blocked: boolean;
  rule_id?: string;
}

/**
 * Destination policy — binds data classifications to allowed destinations.
 */
export interface DestinationRule {
  id: string;
  description: string;
  /** Data classifications this rule applies to */
  classifications: DataClassification[];
  /** Allowed destination patterns (glob-style). Empty = block all. */
  allowed_destinations?: string[];
  /** Blocked destination patterns. Takes precedence over allowed. */
  blocked_destinations?: string[];
  /** Egress channels this rule applies to. Empty = all channels. */
  channels?: EgressChannel[];
  /** Action when rule matches: "block" or "alert" */
  action: "block" | "alert";
}

/**
 * Egress policy configuration.
 */
export interface EgressPolicy {
  rules: DestinationRule[];
  /** Default action when no rule matches. Default: "block" */
  default_action?: "allow" | "block";
}

/**
 * Tool-to-channel mapping — declares what egress channel a tool uses.
 */
export interface ToolChannelMapping {
  tool_name: string; // exact or glob pattern
  channel: EgressChannel;
  destination_field?: string; // tool_args field that contains the destination
}
