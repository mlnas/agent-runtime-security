import { AgentActionRequest, Decision, PolicyBundle, PolicyRule } from "./schemas";

/**
 * PolicyEvaluator - evaluates agent actions against policy rules.
 *
 * Supports:
 *   - Exact tool name matching, wildcard "*", and array-of-names matching
 *   - Glob-style environment matching (any string or "*")
 *   - Keyword matching (contains_any, not_contains)
 *   - Regex matching (matches_regex)
 *   - Data label matching (data_labels_any)
 *   - Tool arg matching (tool_args_match)
 *   - First-match rule processing with configurable default
 */
export class PolicyEvaluator {
  constructor(private policyBundle: PolicyBundle) {}

  /**
   * Evaluate an agent action request and return a decision.
   */
  evaluate(request: AgentActionRequest): Decision {
    for (const rule of this.policyBundle.rules) {
      if (this.matchesRule(request, rule)) {
        return this.createDecision(rule);
      }
    }

    // No rule matched — return the bundle's configured default
    return {
      outcome: this.policyBundle.defaults.outcome,
      reasons: [
        {
          code: `DEFAULT_${this.policyBundle.defaults.outcome}`,
          message: `No specific rule matched; applying default policy (${this.policyBundle.defaults.outcome})`,
        },
      ],
    };
  }

  // -----------------------------------------------------------------------
  // Rule matching
  // -----------------------------------------------------------------------

  private matchesRule(request: AgentActionRequest, rule: PolicyRule): boolean {
    if (!this.matchesToolName(request, rule)) return false;
    if (!this.matchesEnvironment(request, rule)) return false;
    if (!this.matchesWhenConditions(request, rule)) return false;
    return true;
  }

  /**
   * Match tool_name — supports exact string, "*", and string[] (array of names).
   */
  private matchesToolName(request: AgentActionRequest, rule: PolicyRule): boolean {
    const { tool_name } = rule.match;

    if (tool_name === "*") return true;

    if (Array.isArray(tool_name)) {
      return tool_name.includes(request.action.tool_name);
    }

    // Support simple glob prefix matching (e.g. "query_*")
    if (typeof tool_name === "string" && tool_name.endsWith("*") && tool_name.length > 1) {
      const prefix = tool_name.slice(0, -1);
      return request.action.tool_name.startsWith(prefix);
    }

    return tool_name === request.action.tool_name;
  }

  /**
   * Match environment — any string or "*".
   */
  private matchesEnvironment(request: AgentActionRequest, rule: PolicyRule): boolean {
    const { environment } = rule.match;
    if (environment === "*") return true;
    return environment === request.agent.environment;
  }

  /**
   * Match optional `when` conditions (all must be true for the rule to apply).
   */
  private matchesWhenConditions(request: AgentActionRequest, rule: PolicyRule): boolean {
    if (!rule.when) return true;

    const { contains_any, not_contains, matches_regex, data_labels_any, tool_args_match } = rule.when;

    // contains_any — at least one keyword must appear in searchable text
    if (contains_any && contains_any.length > 0) {
      const text = this.getSearchableText(request);
      const matched = contains_any.some((term) =>
        text.toLowerCase().includes(term.toLowerCase())
      );
      if (!matched) return false;
    }

    // not_contains — none of these keywords should appear
    if (not_contains && not_contains.length > 0) {
      const text = this.getSearchableText(request);
      const matched = not_contains.some((term) =>
        text.toLowerCase().includes(term.toLowerCase())
      );
      if (matched) return false;
    }

    // matches_regex — searchable text must match the pattern
    if (matches_regex) {
      const text = this.getSearchableText(request);
      try {
        const regex = new RegExp(matches_regex, "i");
        if (!regex.test(text)) return false;
      } catch {
        // Invalid regex — treat as non-match rather than crashing
        return false;
      }
    }

    // data_labels_any — at least one label must be present
    if (data_labels_any && data_labels_any.length > 0) {
      const labels = request.context.data_labels || [];
      const matched = data_labels_any.some((label) => labels.includes(label));
      if (!matched) return false;
    }

    // tool_args_match — each key/value must match in tool_args
    if (tool_args_match) {
      for (const [key, expected] of Object.entries(tool_args_match)) {
        const actual = request.action.tool_args[key];

        // Support numeric comparisons via special operators
        if (typeof expected === "object" && expected !== null && !Array.isArray(expected)) {
          if ("gt" in expected && !(typeof actual === "number" && actual > expected.gt)) return false;
          if ("gte" in expected && !(typeof actual === "number" && actual >= expected.gte)) return false;
          if ("lt" in expected && !(typeof actual === "number" && actual < expected.lt)) return false;
          if ("lte" in expected && !(typeof actual === "number" && actual <= expected.lte)) return false;
          if ("eq" in expected && actual !== expected.eq) return false;
          if ("neq" in expected && actual === expected.neq) return false;
        } else {
          // Strict equality
          if (actual !== expected) return false;
        }
      }
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Build a single string from user_input + stringified tool_args for keyword matching.
   */
  private getSearchableText(request: AgentActionRequest): string {
    const parts: string[] = [];
    if (request.context.user_input) parts.push(request.context.user_input);
    parts.push(JSON.stringify(request.action.tool_args));
    return parts.join(" ");
  }

  /**
   * Build a Decision from the matched rule.
   */
  private createDecision(rule: PolicyRule): Decision {
    const decision: Decision = {
      outcome: rule.outcome,
      reasons: [{ code: rule.id, message: rule.description }],
    };
    if (rule.approver_role) decision.approver_role = rule.approver_role;
    if (rule.constraints) decision.constraints = rule.constraints;
    return decision;
  }

  // -----------------------------------------------------------------------
  // Public accessors
  // -----------------------------------------------------------------------

  getPolicyBundle(): PolicyBundle {
    return this.policyBundle;
  }

  updatePolicyBundle(bundle: PolicyBundle): void {
    this.policyBundle = bundle;
  }
}
