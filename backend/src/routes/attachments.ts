import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { AuthedRequest } from "../middleware/auth";
import { httpError } from "../middleware/error";
import { deleteObject, getDownloadUrl, putObject } from "../lib/s3";
import { caseWhere, executionWhere } from "../middleware/scope";
import { logger } from "../lib/logger";

export const attachmentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

async function accessibleAttachment(req: AuthedRequest, id: string) {
  return prisma.attachment.findFirst({
    where: {
      id,
      OR: [
        { case: caseWhere(req.user!) },
        { execution: executionWhere(req.user!) },
      ],
    },
  });
}

attachmentsRouter.post("/", upload.single("file"), async (req: AuthedRequest, res, next) => {
  try {
    if (!req.file) throw httpError(400, "No file uploaded");
    const { caseId, executionId } = req.body as { caseId?: string; executionId?: string };
    if (!caseId && !executionId) throw httpError(400, "caseId or executionId required");

    // Authorize target ownership before writing.
    if (caseId) {
      const c = await prisma.testCase.findFirst({ where: caseWhere(req.user!, { id: caseId }), select: { id: true } });
      if (!c) throw httpError(404, "Case not found");
    }
    if (executionId) {
      const e = await prisma.testExecution.findFirst({ where: executionWhere(req.user!, { id: executionId }), select: { id: true } });
      if (!e) throw httpError(404, "Execution not found");
    }

    const storageKey = `${caseId ? `cases/${caseId}` : `executions/${executionId}`}/${randomUUID()}-${req.file.originalname}`;
    await putObject(storageKey, req.file.buffer, req.file.mimetype);

    const attachment = await prisma.attachment.create({
      data: {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageKey,
        caseId: caseId || null,
        executionId: executionId || null,
        uploadedById: req.user!.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    logger.info(
      { attachmentId: attachment.id, storageKey, size: req.file.size, userId: req.user!.id, companyId: req.user!.companyId },
      "attachment uploaded",
    );
    res.status(201).json(attachment);
  } catch (e) {
    next(e);
  }
});

attachmentsRouter.get("/:id/download", async (req: AuthedRequest, res, next) => {
  try {
    const attachment = await accessibleAttachment(req, req.params.id);
    if (!attachment) throw httpError(404, "Attachment not found");
    const url = await getDownloadUrl(attachment.storageKey, attachment.filename);
    res.json({ url });
  } catch (e) {
    next(e);
  }
});

attachmentsRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const attachment = await accessibleAttachment(req, req.params.id);
    if (!attachment) throw httpError(404, "Attachment not found");
    await deleteObject(attachment.storageKey);
    await prisma.attachment.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
