import { v4 as uuidv4 } from "uuid";
import { AgentActionRequest, Decision, Event, DecisionOutcome } from "./schemas";
import { PolicyBundleLoader } from "./loader";
import { PolicyEvaluator } from "./evaluator";
import { createEvent } from "./events";

/**
 * SDK Configuration Options
 */
export interface AgentSecurityConfig {
  /**
   * Path to policy bundle JSON file
   */
  policyPath?: string;

  /**
   * Policy bundle as JSON string
   */
  policyJson?: string;

  /**
   * Callback when an action requires approval
   * Return true to approve, false to reject
   */
  onApprovalRequired?: (request: AgentActionRequest, decision: Decision) => Promise<boolean>;

  /**
   * Callback when an action is denied
   */
  onDeny?: (request: AgentActionRequest, decision: Decision) => void;

  /**
   * Callback when an action is allowed
   */
  onAllow?: (request: AgentActionRequest, decision: Decision) => void;

  /**
   * Callback for audit events
   */
  onAuditEvent?: (event: Event) => void;

  /**
   * Default agent environment (dev, staging, prod)
   */
  defaultEnvironment?: "dev" | "staging" | "prod";

  /**
   * Default agent owner
   */
  defaultOwner?: string;
}

/**
 * Result of a security check
 */
export interface SecurityCheckResult {
  allowed: boolean;
  decision: Decision;
  event: Event;
}

/**
 * Agent Security SDK Client
 * 
 * This is the main entry point for integrating security policies
 * into your agent workflows.
 * 
 * @example
 * ```typescript
 * const security = new AgentSecurity({
 *   policyPath: './my-policy.json',
 *   onApprovalRequired: async (request) => {
 *     return await askManager(request);
 *   }
 * });
 * 
 * // Check before executing a tool
 * const result = await security.checkToolCall({
 *   toolName: 'send_email',
 *   toolArgs: { to: 'user@example.com', body: 'Hello' },
 *   agentId: 'my-agent',
 *   environment: 'prod'
 * });
 * 
 * if (result.allowed) {
 *   // Execute the tool
 *   await sendEmail(...);
 * }
 * ```
 */
export class AgentSecurity {
  private evaluator: PolicyEvaluator;
  private config: AgentSecurityConfig;
  private auditLog: Event[] = [];

  constructor(config: AgentSecurityConfig) {
    this.config = config;

    // Load policy bundle
    if (config.policyPath) {
      const bundle = PolicyBundleLoader.loadFromFile(config.policyPath);
      this.evaluator = new PolicyEvaluator(bundle);
    } else if (config.policyJson) {
      const bundle = PolicyBundleLoader.loadFromString(config.policyJson);
      this.evaluator = new PolicyEvaluator(bundle);
    } else {
      throw new Error("AgentSecurity requires either policyPath or policyJson");
    }
  }

  /**
   * Check if a tool call is allowed by the security policy
   * 
   * @param params Tool call parameters
   * @returns Security check result with allowed status
   */
  async checkToolCall(params: {
    toolName: string;
    toolArgs: Record<string, any>;
    agentId: string;
    agentName?: string;
    environment?: "dev" | "staging" | "prod";
    owner?: string;
    userInput?: string;
    dataLabels?: string[];
    riskHints?: string[];
  }): Promise<SecurityCheckResult> {
    // Build AgentActionRequest
    const request: AgentActionRequest = {
      request_id: uuidv4(),
      timestamp: new Date().toISOString(),
      agent: {
        agent_id: params.agentId,
        name: params.agentName || params.agentId,
        owner: params.owner || this.config.defaultOwner || "unknown",
        environment: params.environment || this.config.defaultEnvironment || "dev",
      },
      action: {
        type: "tool_call",
        tool_name: params.toolName,
        tool_args: params.toolArgs,
      },
      context: {
        user_input: params.userInput,
        data_labels: params.dataLabels,
        risk_hints: params.riskHints,
      },
    };

    // Evaluate the request
    const decision = this.evaluator.evaluate(request);

    // Create audit event
    const event = createEvent(request, decision);
    this.auditLog.push(event);

    // Call audit callback if configured
    if (this.config.onAuditEvent) {
      this.config.onAuditEvent(event);
    }

    // Handle the decision
    let allowed = false;

    switch (decision.outcome) {
      case "ALLOW":
        allowed = true;
        if (this.config.onAllow) {
          this.config.onAllow(request, decision);
        }
        break;

      case "DENY":
        allowed = false;
        if (this.config.onDeny) {
          this.config.onDeny(request, decision);
        }
        break;

      case "REQUIRE_APPROVAL":
        // If approval callback is configured, call it
        if (this.config.onApprovalRequired) {
          const approved = await this.config.onApprovalRequired(request, decision);
          allowed = approved;

          // Log approval decision
          const approvalEvent = createEvent(request, {
            ...decision,
            outcome: approved ? "ALLOW" : "DENY",
            reasons: [
              ...decision.reasons,
              {
                code: approved ? "APPROVED" : "REJECTED",
                message: approved
                  ? "Request was approved by security callback"
                  : "Request was rejected by security callback",
              },
            ],
          });
          this.auditLog.push(approvalEvent);

          if (this.config.onAuditEvent) {
            this.config.onAuditEvent(approvalEvent);
          }
        } else {
          // No approval callback configured, default to deny
          allowed = false;
          if (this.config.onDeny) {
            this.config.onDeny(request, decision);
          }
        }
        break;
    }

    return {
      allowed,
      decision,
      event,
    };
  }

  /**
   * Protect a function with security checks
   * 
   * @example
   * ```typescript
   * const sendEmail = security.protect(
   *   'send_email',
   *   async (to: string, body: string) => {
   *     return await emailService.send(to, body);
   *   }
   * );
   * 
   * // Automatically checked before execution
   * await sendEmail('user@example.com', 'Hello');
   * ```
   */
  protect<TArgs extends any[], TReturn>(
    toolName: string,
    fn: (...args: TArgs) => Promise<TReturn>,
    options?: {
      agentId?: string;
      environment?: "dev" | "staging" | "prod";
      extractToolArgs?: (...args: TArgs) => Record<string, any>;
    }
  ): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
      // Extract tool args from function arguments
      const toolArgs = options?.extractToolArgs
        ? options.extractToolArgs(...args)
        : { args: args.map((arg, i) => ({ [`arg${i}`]: arg })) };

      // Check security
      const result = await this.checkToolCall({
        toolName,
        toolArgs,
        agentId: options?.agentId || "protected-function",
        environment: options?.environment || this.config.defaultEnvironment || "dev",
      });

      if (!result.allowed) {
        throw new SecurityError(
          `Security policy blocked execution of ${toolName}`,
          result.decision
        );
      }

      // Execute the function
      return await fn(...args);
    };
  }

  /**
   * Get all audit events
   */
  getAuditLog(): Event[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Get the current policy bundle
   */
  getPolicyBundle() {
    return this.evaluator.getPolicyBundle();
  }

  /**
   * Reload policy from file or JSON
   */
  reloadPolicy(policyPath?: string, policyJson?: string): void {
    if (policyPath) {
      const bundle = PolicyBundleLoader.loadFromFile(policyPath);
      this.evaluator.updatePolicyBundle(bundle);
    } else if (policyJson) {
      const bundle = PolicyBundleLoader.loadFromString(policyJson);
      this.evaluator.updatePolicyBundle(bundle);
    } else if (this.config.policyPath) {
      const bundle = PolicyBundleLoader.loadFromFile(this.config.policyPath);
      this.evaluator.updatePolicyBundle(bundle);
    } else {
      throw new Error("No policy source specified for reload");
    }
  }
}

/**
 * Custom error thrown when security policy blocks an action
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public decision: Decision
  ) {
    super(message);
    this.name = "SecurityError";
  }
}
