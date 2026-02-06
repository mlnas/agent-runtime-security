import { AgentActionRequest, Decision, PolicyBundle, PolicyRule } from "./schemas";

// ---------------------------------------------------------------------------
// Regex safety utilities
// ---------------------------------------------------------------------------

/**
 * Known dangerous regex patterns that can cause catastrophic backtracking.
 * Checks for nested quantifiers, overlapping alternations, etc.
 */
const DANGEROUS_REGEX_PATTERNS = [
  /\(.*[+*].*\)[+*]/, // nested quantifiers: (a+)+, (a*)*
  /\(.*\|.*\)[+*]/,   // alternation inside quantifier: (a|a)+
  /\(.*[+*].*\)\{/,   // nested quantifier with repetition: (a+){2,}
];

const MAX_REGEX_LENGTH = 512;

/**
 * Validates that a regex pattern is safe from catastrophic backtracking.
 * Returns true if the regex is considered safe.
 */
function isSafeRegex(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) return false;

  for (const dangerous of DANGEROUS_REGEX_PATTERNS) {
    if (dangerous.test(pattern)) return false;
  }

  // Verify it compiles
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-compile and cache a regex, or return null if it's unsafe/invalid.
 */
const regexCache = new Map<string, RegExp | null>();

function getSafeRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;

  if (!isSafeRegex(pattern)) {
    regexCache.set(pattern, null);
    return null;
  }

  try {
    const regex = new RegExp(pattern, "i");
    regexCache.set(pattern, regex);
    return regex;
  } catch {
    regexCache.set(pattern, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Searchable text utilities
// ---------------------------------------------------------------------------

/**
 * Recursively extract all string values from an object.
 * Produces a flat array of strings without JSON structural characters.
 */
function extractStringValues(obj: unknown): string[] {
  const values: string[] = [];

  if (typeof obj === "string") {
    values.push(obj);
  } else if (typeof obj === "number" || typeof obj === "boolean") {
    values.push(String(obj));
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      values.push(...extractStringValues(item));
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const val of Object.values(obj)) {
      values.push(...extractStringValues(val));
    }
  }

  return values;
}

// ---------------------------------------------------------------------------
// PolicyEvaluator
// ---------------------------------------------------------------------------

/**
 * PolicyEvaluator - evaluates agent actions against policy rules.
 *
 * Supports:
 *   - Exact tool name matching, wildcard "*", and array-of-names matching
 *   - Glob-style environment matching (any string or "*")
 *   - Keyword matching (contains_any, not_contains) on structured values
 *   - Regex matching (matches_regex) with ReDoS protection
 *   - Data label matching (data_labels_any)
 *   - Tool arg matching (tool_args_match)
 *   - First-match rule processing with configurable default
 */
export class PolicyEvaluator {
  constructor(private policyBundle: PolicyBundle) {
    // Pre-validate all regex patterns at construction time
    this.precompileRegexPatterns();
  }

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
      const searchValues = this.getSearchableValues(request);
      const matched = contains_any.some((term) => {
        const lowerTerm = term.toLowerCase();
        return searchValues.some((val) => val.toLowerCase().includes(lowerTerm));
      });
      if (!matched) return false;
    }

    // not_contains — none of these keywords should appear
    if (not_contains && not_contains.length > 0) {
      const searchValues = this.getSearchableValues(request);
      const matched = not_contains.some((term) => {
        const lowerTerm = term.toLowerCase();
        return searchValues.some((val) => val.toLowerCase().includes(lowerTerm));
      });
      if (matched) return false;
    }

    // matches_regex — searchable text must match the pattern (with ReDoS protection)
    if (matches_regex) {
      const regex = getSafeRegex(matches_regex);
      if (!regex) {
        // Unsafe or invalid regex — fail closed (treat as non-match)
        return false;
      }
      const searchText = this.getSearchableValues(request).join(" ");
      if (!regex.test(searchText)) return false;
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
   * Extract all string values from user_input and tool_args for keyword matching.
   * Uses structured extraction instead of JSON.stringify to avoid matching
   * on JSON structural characters (keys, braces, quotes).
   */
  private getSearchableValues(request: AgentActionRequest): string[] {
    const values: string[] = [];
    if (request.context.user_input) values.push(request.context.user_input);
    values.push(...extractStringValues(request.action.tool_args));
    return values;
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

  /**
   * Pre-compile and validate all regex patterns in the policy bundle.
   * Called at construction time to detect unsafe patterns early.
   */
  private precompileRegexPatterns(): void {
    for (const rule of this.policyBundle.rules) {
      if (rule.when?.matches_regex) {
        const regex = getSafeRegex(rule.when.matches_regex);
        if (!regex) {
          console.warn(
            `[PolicyEvaluator] Rule "${rule.id}" has an unsafe or invalid regex pattern: "${rule.when.matches_regex}". This rule's regex condition will never match.`
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public accessors
  // -----------------------------------------------------------------------

  /**
   * Returns a deep copy of the policy bundle to prevent external mutation.
   */
  getPolicyBundle(): PolicyBundle {
    return JSON.parse(JSON.stringify(this.policyBundle));
  }

  updatePolicyBundle(bundle: PolicyBundle): void {
    this.policyBundle = bundle;
    regexCache.clear();
    this.precompileRegexPatterns();
  }
}
