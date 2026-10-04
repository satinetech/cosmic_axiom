import { INDICATOR_TYPES, IndicatorTools } from "./indicatorTools";

/**
 * Engagement record kinds -- the incident-response modules (timeline,
 * indicators, ...). Each declares its form fields and table columns once;
 * RecordsTab renders any of them. The `path` matches forge's
 * /engagement/:id/<path> routes.
 *
 * Field types: string, text, datetime (entered and shown in UTC), enum.
 */

export const CONFIDENCE = [
    { value: "CONFIRMED", label: "Confirmed" },
    { value: "LIKELY", label: "Likely" },
    { value: "POSSIBLE", label: "Possible" },
];

// MITRE ATT&CK Enterprise tactics, in kill-chain order (forge validates the same list).
export const TACTICS = [
    "Reconnaissance", "Resource Development", "Initial Access", "Execution", "Persistence",
    "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
    "Collection", "Command and Control", "Exfiltration", "Impact",
].map((t) => ({ value: t, label: t }));

export const RECORD_TYPES = {
    timeline: {
        path: "timeline",
        title: "Timeline",
        noun: "event",
        intro: "What the attacker did, as you reconstruct it. Times are UTC. Edit freely as understanding changes; the operator log is the record of what the team did.",
        fields: [
            { name: "occurredAt", label: "When (UTC)", type: "datetime", required: true },
            { name: "title", label: "What happened", type: "string", required: true, wide: true },
            { name: "tactic", label: "ATT&CK tactic", type: "enum", options: TACTICS },
            { name: "confidence", label: "Confidence", type: "enum", options: CONFIDENCE, default: "LIKELY", required: true },
            { name: "source", label: "Seen in", type: "string", placeholder: "e.g. Entra sign-in logs, Velociraptor, mailbox audit" },
            { name: "detail", label: "Detail", type: "text" },
        ],
        columns: ["occurredAt", "title", "tactic", "confidence", "source"],
    },
    indicators: {
        path: "indicators",
        title: "Indicators",
        noun: "indicator",
        intro: "Indicators of compromise: what to block, hunt for and hand to the client. Values are stored normalised, so the same indicator is never recorded twice.",
        fields: [
            { name: "type", label: "Type", type: "enum", options: INDICATOR_TYPES, required: true, default: "IP" },
            { name: "value", label: "Value", type: "string", required: true, wide: true, mono: true, placeholder: "e.g. 203.0.113.7, evil[.]example, a SHA-256" },
            { name: "confidence", label: "Confidence", type: "enum", options: CONFIDENCE, default: "LIKELY", required: true },
            { name: "firstSeen", label: "First seen (UTC)", type: "datetime" },
            { name: "lastSeen", label: "Last seen (UTC)", type: "datetime" },
            { name: "description", label: "Notes", type: "text" },
        ],
        columns: ["type", "value", "confidence", "firstSeen", "lastSeen", "description"],
        actions: (props) => <IndicatorTools {...props} />,
    },
};
