import {
  SecurityPlugin,
  BeforeCheckContext,
  AfterExecutionContext,
  PluginResult,
} from "@agent-security/core";
import { DataClassifier, ClassificationResult, DEFAULT_CLASSIFIERS } from "./classifiers";
import { DestinationPolicyEngine } from "./destination-engine";
import { EgressEvent, EgressChannel, ToolChannelMapping, EgressPolicy } from "./egress-types";

export interface EgressEnforcerConfig {
  /** Egress policy for destination-based rules */
  policy: EgressPolicy;
  /** Data classifiers to use. Defaults to built-in classifiers. */
  classifiers?: DataClassifier[];
  /** Tool-to-channel mappings */
  toolChannelMappings?: ToolChannelMapping[];
  /** Callback when data is blocked */
  onBlocked?: (event: EgressEvent) => void;
  /** Callback for all egress events (including allowed) */
  onEgressEvent?: (event: EgressEvent) => void;
}

/**
 * Egress enforcer plugin — classifies data in tool args (beforeCheck)
 * and tool output (afterExecution), enforces destination policies.
 */
export function egressEnforcer(config: EgressEnforcerConfig): SecurityPlugin & {
  getEgressLog(): EgressEvent[];
  clearEgressLog(): void;
} {
  const classifiers = config.classifiers || DEFAULT_CLASSIFIERS;
  const engine = new DestinationPolicyEngine(config.policy);
  const toolChannelMap = config.toolChannelMappings || [];
  const egressLog: EgressEvent[] = [];

  function classifyText(text: string): ClassificationResult[] {
    const results: ClassificationResult[] = [];
    for (const classifier of classifiers) {
      const result = classifier.classify(text);
      if (result) results.push(result);
    }
    return results;
  }

  function extractTextFromArgs(args: Record<string, any>): string {
    const parts: string[] = [];
    for (const value of Object.values(args)) {
      if (typeof value === "string") {
        parts.push(value);
      } else if (value !== null && value !== undefined) {
        parts.push(JSON.stringify(value));
      }
    }
    return parts.join(" ");
  }

  function resolveChannel(toolName: string): EgressChannel {
    for (const mapping of toolChannelMap) {
      if (mapping.tool_name === toolName || matchSimpleGlob(mapping.tool_name, toolName)) {
        return mapping.channel;
      }
    }
    return "terminal_output"; // default channel
  }

  function resolveDestination(toolName: string, toolArgs: Record<string, any>): string | undefined {
    for (const mapping of toolChannelMap) {
      if (
        (mapping.tool_name === toolName || matchSimpleGlob(mapping.tool_name, toolName)) &&
        mapping.destination_field
      ) {
        return toolArgs[mapping.destination_field] as string | undefined;
      }
    }
    return undefined;
  }

  return {
    name: "egress-enforcer",
    version: "0.1.0",
    failOpen: false,

    async beforeCheck(context: BeforeCheckContext): Promise<PluginResult | void> {
      const { request } = context;
      const text = extractTextFromArgs(request.action.tool_args);
      const classifications = classifyText(text);

      if (classifications.length === 0) return;

      const channel = resolveChannel(request.action.tool_name);
      const destination = resolveDestination(request.action.tool_name, request.action.tool_args);

      const checkResult = engine.check(classifications, channel, destination);

      const event: EgressEvent = {
        timestamp: new Date().toISOString(),
        agent_id: request.agent.agent_id,
        tool_name: request.action.tool_name,
        channel,
        destination,
        classifications,
        blocked: !checkResult.allowed,
        rule_id: checkResult.matched_rule?.id,
      };

      egressLog.push(event);
      config.onEgressEvent?.(event);

      if (!checkResult.allowed) {
        config.onBlocked?.(event);
        return {
          decision: {
            outcome: "DENY",
            reasons: [{
              code: "EGRESS_BLOCKED",
              message: checkResult.reason,
            }],
          },
        };
      }
    },

    async afterExecution(context: AfterExecutionContext): Promise<void> {
      if (!context.result) return;

      const text = typeof context.result === "string"
        ? context.result
        : JSON.stringify(context.result);

      const classifications = classifyText(text);
      if (classifications.length === 0) return;

      const channel = resolveChannel(context.request.action.tool_name);

      const event: EgressEvent = {
        timestamp: new Date().toISOString(),
        agent_id: context.request.agent.agent_id,
        tool_name: context.request.action.tool_name,
        channel,
        classifications,
        blocked: false, // Output already returned — log for compliance
      };

      egressLog.push(event);
      config.onEgressEvent?.(event);
    },

    getEgressLog(): EgressEvent[] {
      return [...egressLog];
    },

    clearEgressLog(): void {
      egressLog.length = 0;
    },
  };
}

function matchSimpleGlob(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}
