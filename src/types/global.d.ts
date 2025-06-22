// src/types/global.d.ts - Global type declarations for Node.js environment

declare global {
  // Node.js global objects
  namespace NodeJS {
    interface Global {
      requestTracker?: Map<string, number[]>;
      authLoopTracker?: Map<string, number[]>;
      clientPatterns?: Map<string, {
        lastRequest: number;
        requestCount: number;
        consecutiveFailures: number;
        blocked: boolean;
        blockUntil: number;
      }>;
    }
  }

  // Global variables
  var requestTracker: Map<string, number[]> | undefined;
  var authLoopTracker: Map<string, number[]> | undefined;
  var clientPatterns: Map<string, {
    lastRequest: number;
    requestCount: number;
    consecutiveFailures: number;
    blocked: boolean;
    blockUntil: number;
  }> | undefined;

  // Node.js built-in modules and globals
  var console: Console;
  var process: NodeJS.Process;
  var global: typeof globalThis;
  var Buffer: BufferConstructor;
  var URL: typeof import('url').URL;
  var setTimeout: typeof import('timers').setTimeout;
  var setInterval: typeof import('timers').setInterval;
  var clearTimeout: typeof import('timers').clearTimeout;
  var clearInterval: typeof import('timers').clearInterval;
}

// Module augmentation for Error constructor
interface Error {
  captureStackTrace?: (targetObject: any, constructorOpt?: any) => void;
}

interface ErrorConstructor {
  captureStackTrace?: (targetObject: any, constructorOpt?: any) => void;
}

export {};