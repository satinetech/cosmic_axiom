import { PrismaClient } from "@prisma/client";
import { recordsRouter } from "./router.js";

// MITRE ATT&CK Enterprise tactics, in kill-chain order.
export const TACTICS = [
    "Reconnaissance", "Resource Development", "Initial Access", "Execution", "Persistence",
    "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
    "Collection", "Command and Control", "Exfiltration", "Impact",
];

export default recordsRouter({
    prisma: new PrismaClient(),
    model: "timelineEvent",
    path: "timeline",
    fields: {
        occurredAt: { type: "datetime", required: true },
        title: { type: "string", required: true },
        detail: { type: "text" },
        source: { type: "string" },
        confidence: { type: "enum", values: ["CONFIRMED", "LIKELY", "POSSIBLE"], default: "LIKELY" },
        tactic: { type: "enum", values: TACTICS },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
});
