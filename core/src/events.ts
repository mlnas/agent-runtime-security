import { v4 as uuidv4 } from "uuid";
import { AgentActionRequest, Decision, Event, EventOutcome } from "./schemas";

/**
 * Create an Event from an AgentActionRequest and Decision.
 * Redacts sensitive data and includes only safe payload information.
 *
 * @param request The original agent action request
 * @param decision The policy decision
 * @param pluginSource Optional name of the plugin that generated this event
 */
export function createEvent(
  request: AgentActionRequest,
  decision: Decision,
  pluginSource?: string
): Event {
  return {
    event_id: uuidv4(),
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
    ...(pluginSource ? { plugin_source: pluginSource } : {}),
  };
}
