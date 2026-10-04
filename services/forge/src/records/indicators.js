import { PrismaClient } from "@prisma/client";
import { FieldError } from "./fields.js";
import { INDICATOR_TYPES, normaliseIndicator } from "./indicatorValues.js";
import { recordsRouter } from "./router.js";

export default recordsRouter({
    prisma: new PrismaClient(),
    model: "indicator",
    path: "indicators",
    fields: {
        type: { type: "enum", values: INDICATOR_TYPES, required: true },
        value: { type: "string", required: true, max: 512 },
        description: { type: "text" },
        firstSeen: { type: "datetime" },
        lastSeen: { type: "datetime" },
        confidence: { type: "enum", values: ["CONFIRMED", "LIKELY", "POSSIBLE"], default: "LIKELY" },
    },
    prepare: (data) => {
        const out = { ...data, value: normaliseIndicator(data.type, data.value) };
        if (out.firstSeen && out.lastSeen && new Date(out.lastSeen) < new Date(out.firstSeen)) {
            throw new FieldError("lastSeen", "is before first seen");
        }
        return out;
    },
    orderBy: [{ type: "asc" }, { value: "asc" }],
    duplicate: "This indicator is already recorded for this engagement",
});
