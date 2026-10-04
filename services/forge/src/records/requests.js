import { PrismaClient } from "@prisma/client";
import { recordsRouter } from "./router.js";

export default recordsRouter({
    prisma: new PrismaClient(),
    model: "clientRequest",
    path: "requests",
    fields: {
        request: { type: "string", required: true },
        detail: { type: "text" },
        requestedOf: { type: "string" },
        requestedAt: { type: "datetime" },
        dueAt: { type: "datetime" },
        status: { type: "enum", values: ["OPEN", "RECEIVED", "DECLINED", "NOT_NEEDED"], default: "OPEN" },
    },
    prepare: (data, current) => {
        const out = { ...data, requestedAt: data.requestedAt ?? new Date() };
        // resolvedAt follows the status: stamped when it leaves OPEN, cleared when it returns.
        if (out.status === "OPEN") out.resolvedAt = null;
        else if (!current || current.status === "OPEN" || !current.resolvedAt) out.resolvedAt = new Date();
        return out;
    },
    // Open first, then by due date and when asked.
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { requestedAt: "asc" }],
});
