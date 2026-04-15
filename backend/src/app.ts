import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { suitesRouter } from "./routes/suites";
import { casesRouter } from "./routes/cases";
import { runsRouter } from "./routes/runs";
import { executionsRouter } from "./routes/executions";
import { attachmentsRouter } from "./routes/attachments";
import { dashboardRouter } from "./routes/dashboard";
import { jiraRouter } from "./routes/jira";
import { milestonesRouter } from "./routes/milestones";
import { commentsRouter } from "./routes/comments";
import { usersRouter } from "./routes/users";
import { activityRouter } from "./routes/activity";
import { matrixRouter } from "./routes/matrix";
import { companiesRouter } from "./routes/companies";
import { errorHandler } from "./middleware/error";
import { requireAuth } from "./middleware/auth";
import { httpLogger } from "./middleware/logging";

export const app = express();

app.use(httpLogger);
app.use(cors({ exposedHeaders: ["x-request-id"] }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/projects", requireAuth, projectsRouter);
app.use("/api/suites", requireAuth, suitesRouter);
app.use("/api/cases", requireAuth, casesRouter);
app.use("/api/runs", requireAuth, runsRouter);
app.use("/api/executions", requireAuth, executionsRouter);
app.use("/api/attachments", requireAuth, attachmentsRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/jira", requireAuth, jiraRouter);
app.use("/api/milestones", requireAuth, milestonesRouter);
app.use("/api/comments", requireAuth, commentsRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/activity", requireAuth, activityRouter);
app.use("/api/matrix", requireAuth, matrixRouter);
app.use("/api/companies", requireAuth, companiesRouter);

app.use(errorHandler);
