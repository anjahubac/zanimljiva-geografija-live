/**
 * Time is a dependency, not a global. Every module whose behavior depends on
 * "now" takes a Clock, and every deadline goes through a Scheduler, so tests can
 * advance time explicitly instead of faking timers under a live Socket.IO
 * connection (module 13).
 */
export type Clock = { now(): number };

export type Cancel = () => void;

export type Scheduler = { schedule(atMs: number, fn: () => void): Cancel };

export const systemClock: Clock = { now: () => Date.now() };

export const systemScheduler: Scheduler = {
  schedule(atMs, fn) {
    // A deadline already in the past fires on the next tick rather than never.
    const timer = setTimeout(fn, Math.max(0, atMs - Date.now()));
    return () => clearTimeout(timer);
  },
};
