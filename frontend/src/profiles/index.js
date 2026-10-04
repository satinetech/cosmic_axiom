/**
 * Engagement profiles: what kind of work an engagement is.
 *
 * An engagement's `profile` (forge: PENTEST or INCIDENT_RESPONSE) decides how
 * the workspace treats it -- the fields its form asks for, how it is labelled,
 * and (as further pieces land) which modules it uses and which report template
 * renders it. Everything profile-specific is declared here, so a new kind of
 * engagement is a new entry rather than edits across pages.
 */

export const PROFILES = {
    PENTEST: {
        key: "PENTEST",
        label: "Penetration test",
        // The pentest type (network, web app, ...) and testing methodology
        // refine this profile only.
        usesTestingType: true,
    },
    INCIDENT_RESPONSE: {
        key: "INCIDENT_RESPONSE",
        label: "Incident response",
        usesTestingType: false,
    },
};

export const DEFAULT_PROFILE = "PENTEST";

/** The profile definition for an engagement; anything unrecognised is a pentest. */
export function profileOf(engagement) {
    return PROFILES[engagement?.profile] || PROFILES[DEFAULT_PROFILE];
}

/** How an engagement's kind is shown: the pentest type for pentests, the profile otherwise. */
export function engagementKindLabel(engagement) {
    const profile = profileOf(engagement);
    if (!profile.usesTestingType) return profile.label;
    return engagement?.type?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || "Network Pentest";
}
