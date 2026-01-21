# Default Policy Pack (v0.1)

## Objective
Provide immediate value with 3 obvious controls:
1) Block bulk export / sensitive data access attempts
2) Require approval for financial or external actions
3) Allow safe internal actions by default

## Default rules (examples)
- DENY if tool_name == "query_customer_db" AND contains_any includes ["all customers","export","dump"]
- REQUIRE_APPROVAL if tool_name in ["trigger_refund","trigger_payment","send_email"] AND environment == "prod"
- DENY if data_labels_any includes ["PCI"] AND tool_name == "send_email"
