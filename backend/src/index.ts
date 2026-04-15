import { app } from "./app";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  logger.info({ port }, "API listening");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  process.exit(1);
});
