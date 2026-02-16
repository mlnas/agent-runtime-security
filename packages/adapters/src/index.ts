/**
 * Framework adapters for Agent-SPM.
 *
 * Each adapter translates a framework-native call format into an
 * AgentActionRequest, runs it through the security pipeline, and
 * returns the decision.
 */

import { AgentSecurity, AgentActionRequest, CheckToolCallParams } from "@agent-security/core";

// ---------------------------------------------------------------------------
// Cursor MCP Adapter
// ---------------------------------------------------------------------------

export interface CursorMcpRequest {
  method: string;
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
  id?: string | number;
}

/**
 * Wrap an AgentSecurity instance as Cursor MCP middleware.
 * Intercepts MCP tool calls and enforces security policies.
 */
export function createCursorMiddleware(
  security: AgentSecurity,
  defaults?: Partial<CheckToolCallParams>
) {
  return async (request: CursorMcpRequest): Promise<{ allowed: boolean; reason?: string }> => {
    if (request.method !== "tools/call") {
      return { allowed: true };
    }

    const result = await security.checkToolCall({
      toolName: request.params.name,
      toolArgs: request.params.arguments || {},
      agentId: defaults?.agentId || "cursor-agent",
      agentName: defaults?.agentName || "Cursor IDE Agent",
      environment: defaults?.environment || "dev",
      owner: defaults?.owner || "cursor-user",
      agentType: defaults?.agentType || "ide_agent",
      trustLevel: defaults?.trustLevel,
      toolIdentity: {
        tool_name: request.params.name,
        provider: "mcp",
        ...(defaults?.toolIdentity || {}),
      },
    });

    return {
      allowed: result.allowed,
      reason: result.allowed ? undefined : result.decision.reasons.map((r) => r.message).join("; "),
    };
  };
}

// ---------------------------------------------------------------------------
// Claude Code Adapter
// ---------------------------------------------------------------------------

export interface ClaudeCodeToolCall {
  tool_name: string;
  tool_input: Record<string, any>;
  tool_use_id?: string;
}

/**
 * Wrap an AgentSecurity instance for Claude Code tool calls.
 */
export function createClaudeCodeWrapper(
  security: AgentSecurity,
  defaults?: Partial<CheckToolCallParams>
) {
  return async (toolCall: ClaudeCodeToolCall): Promise<{ allowed: boolean; reason?: string }> => {
    const result = await security.checkToolCall({
      toolName: toolCall.tool_name,
      toolArgs: toolCall.tool_input,
      agentId: defaults?.agentId || "claude-code-agent",
      agentName: defaults?.agentName || "Claude Code",
      environment: defaults?.environment || "dev",
      owner: defaults?.owner || "claude-code-user",
      agentType: defaults?.agentType || "ide_agent",
      trustLevel: defaults?.trustLevel,
    });

    return {
      allowed: result.allowed,
      reason: result.allowed ? undefined : result.decision.reasons.map((r) => r.message).join("; "),
    };
  };
}

// ---------------------------------------------------------------------------
// LangChain Adapter
// ---------------------------------------------------------------------------

export interface LangChainToolInput {
  name: string;
  args: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Wrap a LangChain tool function with security enforcement.
 * Returns a function compatible with LangChain's tool wrapper pattern.
 */
export function wrapLangChainTool<T>(
  security: AgentSecurity,
  toolName: string,
  fn: (input: T) => Promise<any>,
  defaults?: Partial<CheckToolCallParams>
): (input: T) => Promise<any> {
  return async (input: T): Promise<any> => {
    const toolArgs = typeof input === "object" && input !== null
      ? input as Record<string, any>
      : { input };

    const result = await security.checkToolCall({
      toolName,
      toolArgs,
      agentId: defaults?.agentId || "langchain-agent",
      agentName: defaults?.agentName || "LangChain Agent",
      environment: defaults?.environment || "dev",
      owner: defaults?.owner || "langchain-user",
      agentType: defaults?.agentType || "workflow_agent",
      trustLevel: defaults?.trustLevel,
      toolIdentity: {
        tool_name: toolName,
        provider: "langchain",
        ...(defaults?.toolIdentity || {}),
      },
    });

    if (!result.allowed) {
      throw new Error(
        `Security policy blocked "${toolName}": ${result.decision.reasons.map((r) => r.message).join("; ")}`
      );
    }

    return fn(input);
  };
}

// ---------------------------------------------------------------------------
// CrewAI Adapter
// ---------------------------------------------------------------------------

export interface CrewAITaskContext {
  task_description: string;
  agent_role: string;
  tool_name: string;
  tool_args: Record<string, any>;
  crew_id?: string;
}

/**
 * Wrap an AgentSecurity instance for CrewAI task execution.
 */
export function createCrewAIGuard(
  security: AgentSecurity,
  defaults?: Partial<CheckToolCallParams>
) {
  return async (ctx: CrewAITaskContext): Promise<{ allowed: boolean; reason?: string }> => {
    const result = await security.checkToolCall({
      toolName: ctx.tool_name,
      toolArgs: ctx.tool_args,
      agentId: defaults?.agentId || ctx.crew_id || "crewai-agent",
      agentName: defaults?.agentName || ctx.agent_role,
      environment: defaults?.environment || "dev",
      owner: defaults?.owner || "crewai-user",
      agentType: defaults?.agentType || "workflow_agent",
      trustLevel: defaults?.trustLevel,
      userInput: ctx.task_description,
    });

    return {
      allowed: result.allowed,
      reason: result.allowed ? undefined : result.decision.reasons.map((r) => r.message).join("; "),
    };
  };
}
