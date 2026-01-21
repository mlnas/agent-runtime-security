#!/usr/bin/env node

import { GatewayServer } from "./server";

/**
 * Main entry point for the minimal gateway server
 */
function main() {
  const port = parseInt(process.env.PORT || "3000", 10);
  const logDir = process.env.LOG_DIR || "./logs";

  console.log("Starting minimal gateway server...");
  console.log(`Port: ${port}`);
  console.log(`Log directory: ${logDir}`);

  const server = new GatewayServer(port, logDir);
  server.start();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down gateway...");
    server.stop();
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

export * from "./server";
export * from "./audit-log";
export * from "./approval-model";