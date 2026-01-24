import { PostHog } from "posthog-node";
import { hostname } from "node:os";
import { createHash } from "node:crypto";
import { isTelemetryEnabled } from "./config.js";

// Public project key - safe to expose
const POSTHOG_KEY = "phc_mbe7JOlqxY7kV9VRM4IIJSeZRNnL2baeeMvU8ukDlt6";
const POSTHOG_HOST = "https://eu.i.posthog.com"; // or us.i.posthog.com

let client: PostHog | null = null;
let telemetryEnabled: boolean | null = null;

export async function initTelemetry(): Promise<void> {
  telemetryEnabled = await isTelemetryEnabled();
}

function getClient(): PostHog {
  if (!client) {
    client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
  }
  return client;
}

// Anonymous user ID based on hostname hash
function getDistinctId(): string {
  const hash = createHash("sha256").update(hostname()).digest("hex");
  return hash.slice(0, 16);
}

interface TrackEvent {
  command: "picker" | "list" | "open" | "stats" | "recent" | "cost" | "export" | "archive" | "new";
  projectCount?: number;
  daysFilter?: number;
  success?: boolean;
  weekly?: boolean;
  format?: string;
}

export function track(event: TrackEvent): void {
  if (telemetryEnabled === false) return;
  try {
    getClient().capture({
      distinctId: getDistinctId(),
      event: "cclp_" + event.command,
      properties: {
        project_count: event.projectCount,
        days_filter: event.daysFilter,
        success: event.success,
        version: "1.5.0",
      },
    });
  } catch {
    // Silent fail - telemetry should never break the tool
  }
}

export async function shutdown(): Promise<void> {
  if (client) {
    await client.shutdown();
  }
}
