/**
 * Routes for a kind of record that belongs to an engagement -- timeline
 * events, indicators, affected assets, client requests.
 *
 *   GET    /engagement/:engagementId/<path>          every record, in `orderBy` order
 *   POST   /engagement/:engagementId/<path>          create
 *   PUT    /engagement/:engagementId/<path>/:id      update the fields sent
 *   DELETE /engagement/:engagementId/<path>/:id
 *
 * Each record type declares its fields once; this validates them the same way
 * everywhere and answers a bad value with a 400 naming the field. Records are
 * written as the token's user (createdBy), never as the body says.
 */

import { Router } from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";
import { FieldError, readFields } from "./fields.js";

/**
 * @param {object} options
 * @param {object} options.prisma
 * @param {string} options.model   Prisma delegate name, e.g. "timelineEvent"
 * @param {string} options.path    URL segment, e.g. "timeline"
 * @param {object} options.fields  { name: { type, required?, max?, values?, default? } }
 * @param {object|object[]} options.orderBy
 * @param {(data: object) => void} [options.check]  cross-field checks; throw FieldError
 * @param {string} [options.duplicate]  the 409 message for a unique-constraint clash
 */
export function recordsRouter({ prisma, model, path, fields, orderBy, check = () => {}, duplicate }) {
    const router = Router();
    const db = prisma[model];
    const operatorOf = (req) => req.tokenPayload?.payload?.sub ?? null;

    const fail = (res, err, what) => {
        if (err instanceof FieldError) return res.status(400).json({ error: err.message, field: err.field });
        if (err.code === "P2002") return res.status(409).json({ error: duplicate || "That record already exists" });
        console.error(`Failed to ${what} ${path}:`, err.message);
        return res.status(500).json({ error: `Failed to ${what} ${path}` });
    };

    // A record id that does not belong to this engagement is treated as absent.
    const owned = async (req) =>
        db.findFirst({ where: { id: req.params.id, engagementId: req.params.engagementId }, select: { id: true } });

    router.get(`/:engagementId/${path}`, authenticateRequest, async (req, res) => {
        try {
            res.json(await db.findMany({ where: { engagementId: req.params.engagementId }, orderBy }));
        } catch (err) {
            fail(res, err, "read");
        }
    });

    router.post(`/:engagementId/${path}`, authenticateRequest, async (req, res) => {
        try {
            const data = readFields(fields, req.body);
            check(data);
            const engagement = await prisma.engagement.findUnique({ where: { id: req.params.engagementId }, select: { id: true } });
            if (!engagement) return res.status(404).json({ error: "Engagement not found" });
            const created = await db.create({ data: { ...data, engagementId: engagement.id, createdBy: operatorOf(req) } });
            res.status(201).json(created);
        } catch (err) {
            fail(res, err, "create");
        }
    });

    router.put(`/:engagementId/${path}/:id`, authenticateRequest, async (req, res) => {
        try {
            const data = readFields(fields, req.body, { partial: true });
            if (!(await owned(req))) return res.status(404).json({ error: "Not found" });
            const current = await db.findUnique({ where: { id: req.params.id } });
            check({ ...current, ...data });
            res.json(await db.update({ where: { id: req.params.id }, data }));
        } catch (err) {
            fail(res, err, "update");
        }
    });

    router.delete(`/:engagementId/${path}/:id`, authenticateRequest, async (req, res) => {
        try {
            if (!(await owned(req))) return res.status(404).json({ error: "Not found" });
            await db.delete({ where: { id: req.params.id } });
            res.json({ deleted: req.params.id });
        } catch (err) {
            fail(res, err, "delete");
        }
    });

    return router;
}
