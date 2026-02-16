/**
 * CommandGovernor — allowlist/blocklist terminal commands.
 */

export interface CommandRule {
  pattern: string; // glob pattern
  action: "allow" | "block" | "require_approval";
  reason?: string;
}

export interface CommandGovernorConfig {
  /** Rules evaluated in order. First match wins. */
  rules: CommandRule[];
  /** Default action when no rule matches. Default: "block" */
  default_action?: "allow" | "block";
}

export interface CommandCheckResult {
  allowed: boolean;
  requires_approval: boolean;
  matched_rule?: CommandRule;
  reason: string;
}

/**
 * CommandGovernor — controls which terminal commands agents can execute.
 */
export class CommandGovernor {
  private config: CommandGovernorConfig;

  constructor(config: CommandGovernorConfig) {
    this.config = config;
  }

  /**
   * Check if a command is allowed.
   */
  check(command: string): CommandCheckResult {
    const normalized = command.trim();

    for (const rule of this.config.rules) {
      if (matchCommandPattern(rule.pattern, normalized)) {
        if (rule.action === "allow") {
          return { allowed: true, requires_approval: false, matched_rule: rule, reason: rule.reason || "Allowed by rule" };
        }
        if (rule.action === "require_approval") {
          return { allowed: false, requires_approval: true, matched_rule: rule, reason: rule.reason || "Requires approval" };
        }
        return { allowed: false, requires_approval: false, matched_rule: rule, reason: rule.reason || "Blocked by rule" };
      }
    }

    const defaultAction = this.config.default_action || "block";
    return {
      allowed: defaultAction === "allow",
      requires_approval: false,
      reason: `Default policy: ${defaultAction}`,
    };
  }

  /**
   * Update the command governance config.
   */
  updateConfig(config: CommandGovernorConfig): void {
    this.config = config;
  }
}

/**
 * Match a command against a pattern.
 * Patterns support:
 *   - Exact match: "npm install"
 *   - Prefix glob: "npm *"
 *   - Wildcard: "*"
 *   - Command name only: "curl" (matches "curl ..." anything)
 */
function matchCommandPattern(pattern: string, command: string): boolean {
  if (pattern === "*") return true;

  // If pattern has no spaces and no wildcards, match command name
  if (!pattern.includes(" ") && !pattern.includes("*")) {
    const cmdName = command.split(/\s+/)[0];
    return cmdName === pattern;
  }

  // Glob match
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(`^${regexStr}$`, "i");
  return regex.test(command);
}
