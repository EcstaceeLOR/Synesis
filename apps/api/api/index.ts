import { buildServer } from "../src/app.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const server = buildServer({ secureCookies: true });
let ready: Promise<unknown> | undefined;

async function serverlessHandler(
  request: IncomingMessage,
  response: ServerResponse,
) {
  ready ??= server.ready();
  await ready;
  server.server.emit("request", request, response);
}

export default serverlessHandler;
