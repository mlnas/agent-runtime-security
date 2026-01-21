import express, { Request, Response } from "express";
import {
  PolicyEvaluator,
  AgentActionRequest,
  Decision,
  Event,
  createEvent,
  createDefaultPolicyBundle,
} from "@agent-security/core";
import { AuditLog } from "./audit-log";
import {
  ApprovalRequest,
  createApproval,
  approveApproval,
  rejectApproval,
  getPendingApprovals,
  getApproval,
} from "./approval-model";

/**
 * GatewayServer - minimal HTTP server for demo enforcement
 */
export class GatewayServer {
  private app: express.Application;
  private evaluator: PolicyEvaluator;
  private auditLog: AuditLog;
  private port: number;
  private disabledAgents: Set<string>;

  constructor(port: number = 3000, logDir: string = "./logs") {
    this.app = express();
    this.app.use(express.json());
    
    // Use default policy bundle
    const policyBundle = createDefaultPolicyBundle();
    this.evaluator = new PolicyEvaluator(policyBundle);
    this.auditLog = new AuditLog(logDir);
    this.disabledAgents = new Set<string>();
    this.port = port;

    this.setupRoutes();
  }

  /**
   * Setup HTTP routes
   */
  private setupRoutes(): void {
    // Tool call enforcement endpoint
    this.app.post("/tool-call", (req: Request, res: Response) => {
      try {
        const request = req.body as AgentActionRequest;
        
        // Validate request
        if (!request.request_id || !request.agent || !request.action) {
          res.status(400).json({ error: "Invalid request format" });
          return;
        }

        // Check kill switch
        if (this.disabledAgents.has(request.agent.agent_id)) {
          // Log DENY event for kill switch
          const killSwitchEvent: Event = {
            event_id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            timestamp: new Date().toISOString(),
            request_id: request.request_id,
            agent_id: request.agent.agent_id,
            tool_name: request.action.tool_name,
            outcome: "DENY" as const,
            reasons: [{ code: "AGENT_DISABLED", message: "Agent has been disabled via kill switch" }],
            safe_payload: {
              agent_id: request.agent.agent_id,
              tool_name: request.action.tool_name,
              environment: request.agent.environment,
              outcome: "DENY"
            }
          };
          this.auditLog.writeEvent(killSwitchEvent);
          
          res.status(403).json({
            allowed: false,
            reason: {
              code: "AGENT_DISABLED",
              message: "Agent has been disabled via kill switch"
            }
          });
          return;
        }

        // Evaluate request
        const decision = this.evaluator.evaluate(request);

        // Create and log audit event
        const event = createEvent(request, decision);
        this.auditLog.writeEvent(event);

        // Enforce decision
        if (decision.outcome === "ALLOW") {
          res.status(200).json({
            allowed: true,
            reason: decision.reasons[0],
          });
        } else if (decision.outcome === "DENY") {
          res.status(403).json({
            allowed: false,
            reason: decision.reasons[0],
          });
        } else if (decision.outcome === "REQUIRE_APPROVAL") {
          const approval = createApproval(request, decision);
          
          res.status(202).json({
            approval_required: true,
            approval_id: approval.approval_id,
            status: approval.status,
            reason: decision.reasons[0],
          });
        }
      } catch (error) {
        console.error("Error processing tool call:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Kill switch endpoint
    this.app.post("/kill-switch/:agent_id", (req: Request, res: Response) => {
      const { agent_id } = req.params;
      
      if (!agent_id) {
        res.status(400).json({ error: "agent_id is required" });
        return;
      }
      
      this.disabledAgents.add(agent_id);
      
      res.status(200).json({
        success: true,
        agent_id,
        message: `Agent ${agent_id} has been disabled`
      });
    });

    // List pending approvals
    this.app.get("/approvals", (req: Request, res: Response) => {
      const pending = getPendingApprovals();
      
      res.json({
        approvals: pending
      });
    });

    // Approve request
    this.app.post("/approvals/:approval_id/approve", (req: Request, res: Response) => {
      const { approval_id } = req.params;
      const approval = getApproval(approval_id);
      
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      
      if (approval.status !== "PENDING") {
        res.status(409).json({ error: "Approval already processed", status: approval.status });
        return;
      }
      
      // Now approve it
      const approvedApproval = approveApproval(approval_id);
      
      // Log APPROVED event
      const approvedEvent: Event = {
        event_id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        timestamp: new Date().toISOString(),
        request_id: approvedApproval!.request_id,
        agent_id: approvedApproval!.agent_id,
        tool_name: approvedApproval!.tool_name,
        outcome: "APPROVED" as const,
        reasons: [{ code: "MANUAL_APPROVAL", message: "Approved by operator" }],
        safe_payload: {
          approval_id,
          agent_id: approvedApproval!.agent_id,
          tool_name: approvedApproval!.tool_name,
          environment: approvedApproval!.environment,
          outcome: "APPROVED"
        }
      };
      this.auditLog.writeEvent(approvedEvent);
      
      // Mock tool execution
      const toolResult = {
        success: true,
        tool_name: approvedApproval!.tool_name,
        result: `[MOCK] Tool ${approvedApproval!.tool_name} executed successfully`,
        executed_at: new Date().toISOString()
      };
      
      // Log ALLOW event for tool execution
      const executionEvent: Event = {
        event_id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        timestamp: new Date().toISOString(),
        request_id: approvedApproval!.request_id,
        agent_id: approvedApproval!.agent_id,
        tool_name: approvedApproval!.tool_name,
        outcome: "ALLOW" as const,
        reasons: [{ code: "TOOL_EXECUTED", message: "Tool executed after approval" }],
        safe_payload: {
          approval_id,
          agent_id: approvedApproval!.agent_id,
          tool_name: approvedApproval!.tool_name,
          environment: approvedApproval!.environment,
          outcome: "ALLOW",
          execution_result: "success"
        }
      };
      this.auditLog.writeEvent(executionEvent);
      
      res.json({
        status: "APPROVED",
        result: toolResult
      });
    });

    // Reject request
    this.app.post("/approvals/:approval_id/reject", (req: Request, res: Response) => {
      const { approval_id } = req.params;
      const approval = getApproval(approval_id);
      
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      
      if (approval.status !== "PENDING") {
        res.status(409).json({ error: "Approval already processed", status: approval.status });
        return;
      }
      
      // Now reject it
      const rejectedApproval = rejectApproval(approval_id);
      
      // Log REJECTED event
      const rejectedEvent: Event = {
        event_id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        timestamp: new Date().toISOString(),
        request_id: rejectedApproval!.request_id,
        agent_id: rejectedApproval!.agent_id,
        tool_name: rejectedApproval!.tool_name,
        outcome: "REJECTED" as const,
        reasons: [{ code: "MANUAL_REJECTION", message: "Rejected by operator" }],
        safe_payload: {
          approval_id,
          agent_id: rejectedApproval!.agent_id,
          tool_name: rejectedApproval!.tool_name,
          environment: rejectedApproval!.environment,
          outcome: "REJECTED"
        }
      };
      this.auditLog.writeEvent(rejectedEvent);
      
      res.status(403).json({
        approval_id,
        status: "REJECTED",
        reason: { code: "MANUAL_REJECTION", message: "Rejected by operator" }
      });
    });
  }

  /**
   * Start the server
   */
  start(): void {
    this.app.listen(this.port, () => {
      console.log(`Gateway server listening on port ${this.port}`);
      console.log(`Audit log: ${this.auditLog.getLogPath()}`);
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    this.auditLog.close();
  }

  /**
   * Get the Express app (for testing)
   */
  getApp(): express.Application {
    return this.app;
  }
}
