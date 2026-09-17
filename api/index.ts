import { buildServer } from "../apps/api/src/app.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const server = buildServer({ secureCookies: true });
let ready: Promise<unknown> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  ready ??= server.ready();
  await ready;
  server.server.emit("request", request, response);
}
