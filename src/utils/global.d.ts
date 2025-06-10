// src/types/global.d.ts
declare global {
  var requestTracker: Map<string, number[]> | undefined;
  var authLoopTracker: Map<string, number[]> | undefined;
  var clientPatterns: Map<string, {
    lastRequest: number;
    requestCount: number;
    consecutiveFailures: number;
    blocked: boolean;
    blockUntil: number;
  }> | undefined;
}

export {};