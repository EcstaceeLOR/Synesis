import { buildServer } from "./app.js";

const server = buildServer();
const port = Number.parseInt(process.env.SYNESIS_API_PORT ?? "4000", 10);

try {
  await server.listen({ host: "0.0.0.0", port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
