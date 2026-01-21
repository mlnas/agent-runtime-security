import { AgentActionRequest, Decision, PolicyBundle, PolicyRule } from "./schemas";

/**
 * PolicyEvaluator - evaluates agent actions against policy rules
 */
export class PolicyEvaluator {
  constructor(private policyBundle: PolicyBundle) {}

  /**
   * Evaluate an agent action request and return a decision
   */
  evaluate(request: AgentActionRequest): Decision {
    // Iterate through rules in order and return the first match
    for (const rule of this.policyBundle.rules) {
      if (this.matchesRule(request, rule)) {
        return this.createDecision(rule, request);
      }
    }

    // No rule matched, return default decision
    return {
      outcome: "ALLOW",
      reasons: [
        {
          code: "DEFAULT_ALLOW",
          message: "No specific rule matched; applying default policy",
        },
      ],
    };
  }

  /**
   * Check if a request matches a rule
   */
  private matchesRule(request: AgentActionRequest, rule: PolicyRule): boolean {
    // Check tool_name match
    if (rule.match.tool_name !== "*" && rule.match.tool_name !== request.action.tool_name) {
      return false;
    }

    // Check environment match
    if (rule.match.environment !== "*" && rule.match.environment !== request.agent.environment) {
      return false;
    }

    // Check 'when' conditions if they exist
    if (rule.when) {
      // Check contains_any
      if (rule.when.contains_any && rule.when.contains_any.length > 0) {
        const searchableText = this.getSearchableText(request);
        const hasMatch = rule.when.contains_any.some((term) =>
          searchableText.toLowerCase().includes(term.toLowerCase())
        );
        if (!hasMatch) {
          return false;
        }
      }

      // Check data_labels_any
      if (rule.when.data_labels_any && rule.when.data_labels_any.length > 0) {
        const requestLabels = request.context.data_labels || [];
        const hasMatch = rule.when.data_labels_any.some((label) =>
          requestLabels.includes(label)
        );
        if (!hasMatch) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get searchable text from request (user_input + tool_args stringified)
   */
  private getSearchableText(request: AgentActionRequest): string {
    const parts: string[] = [];

    if (request.context.user_input) {
      parts.push(request.context.user_input);
    }

    parts.push(JSON.stringify(request.action.tool_args));

    return parts.join(" ");
  }

  /**
   * Create a decision from a matching rule
   */
  private createDecision(rule: PolicyRule, request: AgentActionRequest): Decision {
    const decision: Decision = {
      outcome: rule.outcome,
      reasons: [
        {
          code: rule.id,
          message: rule.description,
        },
      ],
    };

    if (rule.approver_role) {
      decision.approver_role = rule.approver_role;
    }

    return decision;
  }

  /**
   * Get the current policy bundle
   */
  getPolicyBundle(): PolicyBundle {
    return this.policyBundle;
  }

  /**
   * Update the policy bundle
   */
  updatePolicyBundle(bundle: PolicyBundle): void {
    this.policyBundle = bundle;
  }
}
