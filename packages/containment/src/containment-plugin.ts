import {
  SecurityPlugin,
  BeforeCheckContext,
  PluginResult,
} from "@agent-security/core";
import { SandboxManager } from "./sandbox-manager";
import { ChangeControl } from "./change-control";

export interface ContainmentPluginConfig {
  /** Sandbox manager for tool execution constraints */
  sandboxManager?: SandboxManager;
  /** Change control for ticket validation */
  changeControl?: ChangeControl;
  /** Tools that require a ticket for execution */
  ticketRequiredTools?: string[];
  /** Callback when containment blocks a request */
  onBlocked?: (toolName: string, reason: string) => void;
}

/**
 * Containment plugin — bridges semantic reasoning + sandbox enforcement.
 * Checks sandbox constraints and ticket requirements before allowing tool calls.
 */
export function containmentPlugin(config: ContainmentPluginConfig): SecurityPlugin {
  const {
    sandboxManager,
    changeControl,
    ticketRequiredTools = [],
    onBlocked,
  } = config;

  return {
    name: "containment",
    version: "0.1.0",
    failOpen: false,

    async beforeCheck(context: BeforeCheckContext): Promise<PluginResult | void> {
      const { request } = context;
      const toolName = request.action.tool_name;

      // --- Sandbox constraint check ---
      if (sandboxManager) {
        const check = sandboxManager.checkConstraints(toolName, request.action.tool_args);
        if (!check.allowed) {
          const reason = `Sandbox violation: ${check.violations.join("; ")}`;
          onBlocked?.(toolName, reason);
          return {
            decision: {
              outcome: "DENY",
              reasons: [{ code: "SANDBOX_VIOLATION", message: reason }],
            },
          };
        }
      }

      // --- Ticket requirement check ---
      if (changeControl && ticketRequiredTools.includes(toolName)) {
        const ticketId = request.action.tool_args.ticket_id as string | undefined;
        if (!ticketId) {
          const reason = `Tool "${toolName}" requires a change ticket`;
          onBlocked?.(toolName, reason);
          return {
            decision: {
              outcome: "REQUIRE_TICKET",
              reasons: [{ code: "TICKET_REQUIRED", message: reason }],
            },
          };
        }

        const ticket = await changeControl.validate(ticketId);
        if (!ticket) {
          const reason = `Ticket "${ticketId}" is not valid or not approved`;
          onBlocked?.(toolName, reason);
          return {
            decision: {
              outcome: "DENY",
              reasons: [{ code: "TICKET_INVALID", message: reason }],
            },
          };
        }
      }
    },
  };
}
