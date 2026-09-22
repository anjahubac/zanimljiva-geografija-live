import { io, type Socket } from "socket.io-client";
import type { Ack } from "@contracts/errors";

export async function connectClient(port: number): Promise<Socket> {
  const socket = io(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

/** Resolve with the first payload of `event`, or fail fast with a readable error. */
export function waitFor<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Promise wrapper around an emit-with-ack. */
export function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Assert that `event` does NOT arrive within the window. Used for privacy tests. */
export async function expectNoEvent(socket: Socket, event: string, windowMs = 300): Promise<void> {
  let received: unknown;
  socket.once(event, (payload: unknown) => {
    received = payload;
  });
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  socket.off(event);
  if (received !== undefined) {
    throw new Error(`unexpected "${event}"`);
  }
}

/** Let queued socket emissions flush without a wall-clock sleep. */
export async function settle(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
