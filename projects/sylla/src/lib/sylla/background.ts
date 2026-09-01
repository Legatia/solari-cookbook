import { sweepBrowserResearchRuns } from "@/lib/sylla/browser-research";
import {
  sweepFallbackRuns,
  type FallbackSweepResult,
} from "@/lib/sylla/runs";

function merge(
  first: FallbackSweepResult,
  second: FallbackSweepResult,
): FallbackSweepResult {
  return {
    examined: first.examined + second.examined,
    executed: first.executed + second.executed,
    skipped: first.skipped + second.skipped,
    failed: first.failed + second.failed,
    failures: [...first.failures, ...second.failures],
  };
}

export async function sweepBackgroundRuns(input: {
  limit?: number;
  workerId?: string;
} = {}) {
  const reconnect = await sweepFallbackRuns(input);
  const browser = await sweepBrowserResearchRuns(input);
  return merge(reconnect, browser);
}
