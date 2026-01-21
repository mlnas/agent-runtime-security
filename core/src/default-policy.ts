import { PolicyBundle } from "./schemas";

/**
 * Create a default PolicyBundle for demo purposes
 * Generates a bundle with realistic timestamps and sensible security rules
 */
export function createDefaultPolicyBundle(): PolicyBundle {
  const now = new Date();
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  return {
    version: "0.1.0",
    generated_at: now.toISOString(),
    expires_at: oneYearLater.toISOString(),
    rules: [
      {
        id: "DENY_BULK_EXPORT",
        description: "Block bulk export or data dump attempts from customer database",
        match: {
          tool_name: "query_customer_db",
          environment: "*",
        },
        when: {
          contains_any: ["export", "all customers", "dump"],
        },
        outcome: "DENY",
      },
      {
        id: "REQUIRE_APPROVAL_EMAIL_PROD",
        description: "Require approval for sending emails in production",
        match: {
          tool_name: "send_email",
          environment: "prod",
        },
        outcome: "REQUIRE_APPROVAL",
        approver_role: "security",
      },
      {
        id: "REQUIRE_APPROVAL_PAYMENT_PROD",
        description: "Require approval for payment operations in production",
        match: {
          tool_name: "trigger_payment",
          environment: "prod",
        },
        outcome: "REQUIRE_APPROVAL",
        approver_role: "security",
      },
    ],
    defaults: {
      outcome: "ALLOW",
    },
  };
}
