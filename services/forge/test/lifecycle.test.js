import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

// src/utils/lifecycle.js is byte-identical in all seven services, so it is
// tested once rather than seven times.
//
// Each test needs its own module instance, because the draining flag is module
// state by design -- that is how healthz and the signal handler share it inside
// one process. A query string defeats the ESM cache and yields a fresh one.
let instance = 0;
const freshLifecycle = () => import(`../src/utils/lifecycle.js?i=${instance++}`);

// Port 0 lets the OS pick, so tests never collide with a running service.
const listen = (app) => new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const urlOf = (server) => `http://127.0.0.1:${server.address().port}`;

const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve: (...args) => resolve(...args) };
};

// The handlers registered on the process would otherwise fire on the next
// test's synthetic signal and act on an already-closed server.
const dropSignalHandlers = () => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
};

test('/healthz answers 200 with no credentials while the service is serving', async (t) => {
    const { healthz } = await freshLifecycle();

    const app = express();
    app.use('/healthz', healthz('forge'));
    const server = await listen(app);
    t.after(() => new Promise((r) => server.close(r)));

    const res = await fetch(`${urlOf(server)}/healthz`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'forge');
    assert.equal(typeof body.uptime, 'number');
});

test('SIGTERM finishes in-flight work, flips the probe to 503, then exits 0', async (t) => {
    const { healthz, installGracefulShutdown } = await freshLifecycle();
    t.after(dropSignalHandlers);

    // The probe is served by a SECOND listener sharing the same module
    // instance. draining is module state, so this observes the real flag -- and
    // unlike the signalled server, this one is still accepting connections
    // after the signal, which is what makes the assertion possible over HTTP.
    const probeApp = express();
    probeApp.use('/healthz', healthz('forge'));
    const probeServer = await listen(probeApp);
    t.after(() => new Promise((r) => probeServer.close(r)));

    const reachedHandler = deferred();
    const releaseHandler = deferred();

    const app = express();
    app.get('/slow', async (req, res) => {
        reachedHandler.resolve();
        await releaseHandler.promise;
        res.json({ done: true });
    });
    const server = await listen(app);
    t.after(() => new Promise((r) => server.close(() => r())));

    let exitCode = null;
    const exited = deferred();
    installGracefulShutdown(server, 'forge', {
        exit: (code) => { exitCode = code; exited.resolve(); },
    });

    // Signalling an idle server would prove nothing, so wait until the request
    // is demonstrably inside the handler.
    const inFlight = fetch(`${urlOf(server)}/slow`);
    await reachedHandler.promise;

    process.emit('SIGTERM');

    const probe = await fetch(`${urlOf(probeServer)}/healthz`);
    assert.equal(probe.status, 503, 'probe must report 503 as soon as the signal lands');
    assert.equal((await probe.json()).status, 'draining');
    assert.equal(exitCode, null, 'must not exit while a request is still in flight');

    const releasedAt = Date.now();
    releaseHandler.resolve();
    assert.deepEqual(await (await inFlight).json(), { done: true },
        'the in-flight response must arrive intact, not be cut off');

    await exited.promise;
    assert.equal(exitCode, 0);

    // Regression guard. The client keeps its connection alive, so a drain that
    // only sweeps idle connections once leaves this one open until Node's
    // 5s keepAliveTimeout expires -- the shutdown still completes, and still
    // exits 0, so nothing above catches it. Only the clock does.
    const drainMs = Date.now() - releasedAt;
    assert.ok(drainMs < 1000,
        `drain took ${drainMs}ms after the last response; it should be bounded by the work, not by keepAliveTimeout`);
});

test('a second signal does not start a second drain', async (t) => {
    const { installGracefulShutdown } = await freshLifecycle();
    t.after(dropSignalHandlers);

    const server = await listen(express());
    t.after(() => new Promise((r) => server.close(() => r())));

    let exitCalls = 0;
    const exited = deferred();
    installGracefulShutdown(server, 'forge', {
        exit: (code) => { exitCalls += 1; exited.resolve(code); },
    });

    process.emit('SIGTERM');
    process.emit('SIGINT');

    assert.equal(await exited.promise, 0);
    assert.equal(exitCalls, 1, 'the second signal must not re-enter the drain');
});

test('forces exit(1) when a request will not finish within the timeout', async (t) => {
    const { installGracefulShutdown } = await freshLifecycle();
    t.after(dropSignalHandlers);

    const reachedHandler = deferred();
    const releaseHandler = deferred();

    const app = express();
    app.get('/wedged', async (req, res) => {
        reachedHandler.resolve();
        await releaseHandler.promise;
        res.end();
    });
    const server = await listen(app);
    t.after(() => new Promise((r) => server.close(() => r())));
    // Let the wedged handler go once the assertion is done, so the runner is
    // not left holding an open socket.
    t.after(() => releaseHandler.resolve());

    let exitCode = null;
    const exited = deferred();
    installGracefulShutdown(server, 'forge', {
        timeoutMs: 50,
        exit: (code) => { exitCode = code; exited.resolve(); },
    });

    const wedged = fetch(`${urlOf(server)}/wedged`).catch(() => {});
    await reachedHandler.promise;

    process.emit('SIGTERM');

    await exited.promise;
    assert.equal(exitCode, 1, 'a drain that overruns its timeout must exit non-zero');

    releaseHandler.resolve();
    await wedged;
});
