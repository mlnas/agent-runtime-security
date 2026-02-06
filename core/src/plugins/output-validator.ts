import { SecurityPlugin, AfterExecutionContext } from "../schemas";

/**
 * Output Validator Plugin
 *
 * Inspects tool execution results AFTER execution (only via protect() wrapper).
 * Can detect sensitive data in responses and trigger alerts.
 *
 * @example
 * ```typescript
 * const security = new AgentSecurity({
 *   policyPath: './policy.json',
 *   plugins: [
 *     outputValidator({
 *       sensitivePatterns: [
 *         /\b\d{3}-\d{2}-\d{4}\b/,   // SSN
 *         /\b\d{16}\b/,                // Credit card
 *         /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
 *       ],
 *       onSensitiveData: (toolName, matches) => {
 *         alertSecurityTeam(`Tool ${toolName} returned sensitive data: ${matches}`);
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export interface OutputValidatorConfig {
  /** Regex patterns to scan for in tool output */
  sensitivePatterns?: RegExp[];
  /** Forbidden keywords in output (case-insensitive) */
  forbiddenKeywords?: string[];
  /** Max allowed output size in characters (0 = unlimited) */
  maxOutputSize?: number;
  /** Callback when sensitive data is detected */
  onSensitiveData?: (toolName: string, matches: string[]) => void;
  /** Callback when output exceeds max size */
  onOversizedOutput?: (toolName: string, size: number) => void;
}

export interface OutputValidatorPlugin extends SecurityPlugin {
  /** Get list of all violations detected */
  getViolations(): OutputViolation[];
  /** Clear violation history */
  clearViolations(): void;
}

export interface OutputViolation {
  timestamp: string;
  toolName: string;
  agentId: string;
  type: "sensitive_data" | "forbidden_keyword" | "oversized_output";
  details: string;
}

export function outputValidator(config: OutputValidatorConfig = {}): OutputValidatorPlugin {
  const {
    sensitivePatterns = [],
    forbiddenKeywords = [],
    maxOutputSize = 0,
    onSensitiveData,
    onOversizedOutput,
  } = config;

  const violations: OutputViolation[] = [];

  const plugin: OutputValidatorPlugin = {
    name: "output-validator",
    version: "1.0.0",

    async afterExecution(context: AfterExecutionContext): Promise<void> {
      if (!context.result) return;

      const toolName = context.request.action.tool_name;
      const agentId = context.request.agent.agent_id;
      const output = typeof context.result === "string"
        ? context.result
        : JSON.stringify(context.result);

      // Check sensitive patterns
      if (sensitivePatterns.length > 0) {
        const matches: string[] = [];
        for (const pattern of sensitivePatterns) {
          const match = output.match(pattern);
          if (match) {
            matches.push(match[0]);
          }
        }
        if (matches.length > 0) {
          violations.push({
            timestamp: new Date().toISOString(),
            toolName,
            agentId,
            type: "sensitive_data",
            details: `Detected ${matches.length} sensitive pattern(s)`,
          });
          onSensitiveData?.(toolName, matches);
        }
      }

      // Check forbidden keywords
      if (forbiddenKeywords.length > 0) {
        const lower = output.toLowerCase();
        const found = forbiddenKeywords.filter((kw) =>
          lower.includes(kw.toLowerCase())
        );
        if (found.length > 0) {
          violations.push({
            timestamp: new Date().toISOString(),
            toolName,
            agentId,
            type: "forbidden_keyword",
            details: `Found forbidden keywords: ${found.join(", ")}`,
          });
          onSensitiveData?.(toolName, found);
        }
      }

      // Check output size
      if (maxOutputSize > 0 && output.length > maxOutputSize) {
        violations.push({
          timestamp: new Date().toISOString(),
          toolName,
          agentId,
          type: "oversized_output",
          details: `Output size ${output.length} exceeds max ${maxOutputSize}`,
        });
        onOversizedOutput?.(toolName, output.length);
      }
    },

    getViolations(): OutputViolation[] {
      return [...violations];
    },

    clearViolations(): void {
      violations.length = 0;
    },
  };

  return plugin;
}
