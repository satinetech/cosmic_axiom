import { test } from "node:test";
import assert from "node:assert/strict";
import { toIncident } from "../src/incident.js";

const entry = (seq, fields) => ({
    seq, occurredAt: `2026-01-0${seq}T00:00:00.000Z`, summary: `entry ${seq}`,
    operator: "u1", kind: "ACTION", approvedBy: null, targetAddress: null, correctsSeq: null, ...fields,
});

test("splits the log into decisions and actions", () => {
    const incident = toIncident({
        timeline: [], indicators: [], assets: [], users: [],
        log: [entry(1), entry(2, { kind: "DECISION", approvedBy: "CISO" }), entry(3, { targetAddress: "10.0.0.5" })],
    });
    assert.deepEqual(incident.decisions, [{ occurredAt: "2026-01-02T00:00:00.000Z", summary: "entry 2", approvedBy: "CISO", operator: null }]);
    assert.deepEqual(incident.actions.map((a) => [a.summary, a.targetAddress]), [["entry 1", null], ["entry 3", "10.0.0.5"]]);
});

test("leaves out entries a later entry corrects", () => {
    const incident = toIncident({
        timeline: [], indicators: [], assets: [], users: [],
        log: [entry(1, { kind: "DECISION", approvedBy: "CFO" }), entry(2, { kind: "DECISION", approvedBy: "CEO", correctsSeq: 1 })],
    });
    assert.deepEqual(incident.decisions.map((d) => d.approvedBy), ["CEO"]);
});

test("names operators astral knows, and leaves the rest unnamed", () => {
    const incident = toIncident({
        timeline: [], indicators: [], assets: [],
        users: [{ id: "u1", name: "Sam Analyst", username: "sam" }, { id: "u2", name: null, username: "kim" }],
        log: [entry(1), entry(2, { operator: "u2" }), entry(3, { operator: "u9" })],
    });
    assert.deepEqual(incident.actions.map((a) => a.operator), ["Sam Analyst", "kim", null]);
});

test("passes the records through as forge returned them", () => {
    const timeline = [{ occurredAt: "2026-01-01T00:00:00.000Z", title: "t" }];
    const indicators = [{ type: "IP", value: "198.51.100.7" }];
    const assets = [{ kind: "HOST", identifier: "h" }];
    const incident = toIncident({ timeline, indicators, assets, log: [], users: [] });
    assert.equal(incident.timeline, timeline);
    assert.equal(incident.indicators, indicators);
    assert.equal(incident.assets, assets);
});
