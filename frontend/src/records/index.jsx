import { INDICATOR_TYPES, IndicatorTools } from "./indicatorTools";
import { RequestTools } from "./requestTools";

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

export const ASSET_KINDS = [
    { value: "HOST", label: "Host" },
    { value: "ACCOUNT", label: "Account" },
    { value: "MAILBOX", label: "Mailbox" },
    { value: "APPLICATION", label: "Application" },
    { value: "CLOUD_RESOURCE", label: "Cloud resource" },
    { value: "NETWORK", label: "Network" },
    { value: "OTHER", label: "Other" },
];

export const COMPROMISE_STATUS = [
    { value: "CONFIRMED_COMPROMISED", label: "Compromised" },
    { value: "SUSPECTED", label: "Suspected" },
    { value: "CONTAINED", label: "Contained" },
    { value: "REMEDIATED", label: "Remediated" },
    { value: "NOT_AFFECTED", label: "Not affected" },
];

const STATUS_BADGES = {
    CONFIRMED_COMPROMISED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    SUSPECTED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    CONTAINED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    REMEDIATED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    NOT_AFFECTED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

export const REQUEST_STATUS = [
    { value: "OPEN", label: "Open" },
    { value: "RECEIVED", label: "Received" },
    { value: "DECLINED", label: "Declined" },
    { value: "NOT_NEEDED", label: "Not needed" },
];

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
    assets: {
        path: "assets",
        title: "Affected assets",
        noun: "asset",
        intro: "Hosts, accounts, mailboxes and applications the incident touched or may have, and where each stands. Worst first.",
        fields: [
            { name: "kind", label: "Kind", type: "enum", options: ASSET_KINDS, required: true, default: "HOST" },
            { name: "identifier", label: "Identifier", type: "string", required: true, wide: true, mono: true, placeholder: "e.g. FIN-LAPTOP-07, jsmith@example.com" },
            { name: "status", label: "Status", type: "enum", options: COMPROMISE_STATUS, required: true, default: "SUSPECTED" },
            { name: "firstCompromisedAt", label: "First compromised (UTC)", type: "datetime" },
            { name: "containedAt", label: "Contained (UTC)", type: "datetime" },
            { name: "description", label: "Notes", type: "text" },
        ],
        columns: ["status", "kind", "identifier", "firstCompromisedAt", "containedAt", "description"],
        cells: {
            status: (value) => (
                <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STATUS_BADGES[value] || ""}`}>
                    {COMPROMISE_STATUS.find((o) => o.value === value)?.label ?? value}
                </span>
            ),
        },
    },
    requests: {
        path: "requests",
        title: "Client requests",
        noun: "request",
        intro: "What the team has asked the client for. Open requests first: they are usually what the investigation is waiting on.",
        fields: [
            { name: "request", label: "Request", type: "string", required: true, wide: true },
            { name: "requestedOf", label: "Asked of", type: "string", placeholder: "Who at the client" },
            { name: "status", label: "Status", type: "enum", options: REQUEST_STATUS, required: true, default: "OPEN" },
            { name: "requestedAt", label: "Asked (UTC)", type: "datetime" },
            { name: "dueAt", label: "Needed by (UTC)", type: "datetime" },
            { name: "detail", label: "Detail", type: "text" },
        ],
        columns: ["status", "request", "requestedOf", "requestedAt", "dueAt"],
        cells: {
            status: (value) => (
                <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${value === "OPEN"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                    {REQUEST_STATUS.find((o) => o.value === value)?.label ?? value}
                </span>
            ),
        },
        actions: (props) => <RequestTools {...props} />,
    },
};
