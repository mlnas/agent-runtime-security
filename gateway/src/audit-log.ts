import * as fs from "fs";
import * as path from "path";
import { Event } from "@agent-security/core";

/**
 * AuditLog - simple append-only event writer to events.jsonl
 */
export class AuditLog {
  private logPath: string;
  private writeStream: fs.WriteStream;

  constructor(logDir: string = "./logs") {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Use fixed filename: events.jsonl
    this.logPath = path.join(logDir, "events.jsonl");
    
    // Create write stream in append mode
    this.writeStream = fs.createWriteStream(this.logPath, { flags: "a" });
  }

  /**
   * Write an event to the audit log
   */
  writeEvent(event: Event): void {
    const line = JSON.stringify(event) + "\n";
    this.writeStream.write(line);
  }

  /**
   * Close the audit log
   */
  close(): void {
    this.writeStream.end();
  }

  /**
   * Get the path to the current log file
   */
  getLogPath(): string {
    return this.logPath;
  }
}
