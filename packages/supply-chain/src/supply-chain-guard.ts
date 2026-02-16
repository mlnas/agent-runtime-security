import {
  SecurityPlugin,
  BeforeCheckContext,
  PluginResult,
} from "@agent-security/core";
import { ToolProvenance } from "./tool-provenance";
import { CommandGovernor } from "./command-governor";

export interface SupplyChainGuardConfig {
  /** Tool provenance checker */
  provenance?: ToolProvenance;
  /** Command governor for terminal commands */
  commandGovernor?: CommandGovernor;
  /** Map of tool_name → current manifest content for runtime verification */
  manifestProvider?: (toolName: string) => string | undefined;
  /** Block unverified MCP tools. Default: false */
  blockUnverifiedMcp?: boolean;
}

/**
 * Supply chain guard plugin — enforces MCP verification, command governance,
 * and tool provenance in the beforeCheck phase.
 */
export function supplyChainGuard(config: SupplyChainGuardConfig): SecurityPlugin {
  const {
    provenance,
    commandGovernor,
    manifestProvider,
    blockUnverifiedMcp = false,
  } = config;

  return {
    name: "supply-chain-guard",
    version: "0.1.0",
    failOpen: false,

    async beforeCheck(context: BeforeCheckContext): Promise<PluginResult | void> {
      const { request } = context;
      const toolName = request.action.tool_name;

      // --- Command governance ---
      if (commandGovernor && (request.action.type === "code_execute" || request.action.type === "shell")) {
        const command = request.action.tool_args.command as string;
        if (command) {
          const result = commandGovernor.check(command);
          if (!result.allowed && !result.requires_approval) {
            return {
              decision: {
                outcome: "DENY",
                reasons: [{ code: "COMMAND_BLOCKED", message: result.reason }],
              },
            };
          }
          if (result.requires_approval) {
            return {
              decision: {
                outcome: "REQUIRE_APPROVAL",
                reasons: [{ code: "COMMAND_APPROVAL_REQUIRED", message: result.reason }],
              },
            };
          }
        }
      }

      // --- Tool provenance verification ---
      if (provenance && manifestProvider) {
        const manifest = manifestProvider(toolName);
        if (manifest) {
          const result = provenance.verify(toolName, manifest);
          if (!result.valid) {
            return {
              decision: {
                outcome: "DENY",
                reasons: [{ code: "PROVENANCE_FAILED", message: result.reason }],
              },
            };
          }
        }
      }

      // --- Block unverified MCP tools ---
      if (blockUnverifiedMcp) {
        const provider = request.action.tool_identity?.provider;
        if (provider === "mcp" && !request.action.tool_identity?.verified) {
          return {
            decision: {
              outcome: "DENY",
              reasons: [{
                code: "UNVERIFIED_MCP_TOOL",
                message: `MCP tool "${toolName}" is not verified`,
              }],
            },
          };
        }
      }
    },
  };
}
