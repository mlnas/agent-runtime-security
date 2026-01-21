import { AgentActionRequest, Decision, Event, EventOutcome } from "./schemas";

/**
 * Generate a simple UUID for demo purposes
 * Not cryptographically secure, suitable for demo only
 */
function generateEventId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Create an Event from an AgentActionRequest and Decision
 * Redacts sensitive data and includes only safe payload information
 */
export function createEvent(
  request: AgentActionRequest,
  decision: Decision
): Event {
  return {
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    request_id: request.request_id,
    agent_id: request.agent.agent_id,
    tool_name: request.action.tool_name,
    outcome: decision.outcome as EventOutcome,
    reasons: decision.reasons,
    safe_payload: {
      agent_id: request.agent.agent_id,
      tool_name: request.action.tool_name,
      environment: request.agent.environment,
      outcome: decision.outcome,
    },
  };
}
