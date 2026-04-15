import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { AuthedRequest, requireManager } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { logger } from "../lib/logger";

export const companiesRouter = Router();

companiesRouter.get("/current", async (req: AuthedRequest, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      include: { _count: { select: { users: true, projects: true } } },
    });
    if (!company) throw httpError(404, "Company not found");
    res.json(company);
  } catch (e) {
    next(e);
  }
});

const updateSchema = z.object({ name: z.string().min(1) });

companiesRouter.patch("/current", requireManager, async (req: AuthedRequest, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const company = await prisma.company.update({
      where: { id: req.user!.companyId },
      data: { name: data.name },
    });
    logger.info({ companyId: company.id, updatedBy: req.user!.id }, "company updated");
    res.json(company);
  } catch (e) {
    next(e);
  }
});
