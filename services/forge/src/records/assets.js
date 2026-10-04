import { PrismaClient } from "@prisma/client";
import { FieldError } from "./fields.js";
import { recordsRouter } from "./router.js";

export default recordsRouter({
    prisma: new PrismaClient(),
    model: "affectedAsset",
    path: "assets",
    fields: {
        kind: { type: "enum", values: ["HOST", "ACCOUNT", "MAILBOX", "APPLICATION", "CLOUD_RESOURCE", "NETWORK", "OTHER"], required: true },
        identifier: { type: "string", required: true },
        description: { type: "text" },
        status: { type: "enum", values: ["CONFIRMED_COMPROMISED", "SUSPECTED", "CONTAINED", "REMEDIATED", "NOT_AFFECTED"], default: "SUSPECTED" },
        firstCompromisedAt: { type: "datetime" },
        containedAt: { type: "datetime" },
    },
    prepare: (data) => {
        if (data.firstCompromisedAt && data.containedAt && new Date(data.containedAt) < new Date(data.firstCompromisedAt)) {
            throw new FieldError("containedAt", "is before it was first compromised");
        }
        return data;
    },
    // Worst first: the enum is declared in that order (schema.prisma).
    orderBy: [{ status: "asc" }, { kind: "asc" }, { identifier: "asc" }],
    duplicate: "This asset is already recorded for this engagement",
});
