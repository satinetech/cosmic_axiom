import { Router } from 'express';

// Liveness probe and graceful shutdown. Identical in every service.
//
// WHY A NEW /healthz RATHER THAN REUSING /health: /health sits behind
// authenticateRequest, so it answers "is this service reachable AND is my token
// valid". A container runtime has no token, and a probe that can fail for
// reasons unrelated to the thing being probed is worse than no probe -- a
// restart loop then looks like a sick service. /healthz is deliberately
// unauthenticated and deliberately shallow: it reports that this process is up
// and accepting requests, and nothing else. It touches no database and calls no
// other service, so it never reports a dependency's outage as this service's.
//
// /health is left exactly as it is.

let draining = false;

/**
 * Router for the unauthenticated liveness probe.
 *
 * 200 while serving, 503 once a shutdown signal has arrived. The 503 is the
 * useful half: it tells a proxy to stop sending new requests the moment the
 * signal lands, rather than when the listener finally closes. Requests already
 * in flight are served normally in between.
 */
export function healthz(service) {
    const router = Router();

    router.get('/', (req, res) => {
        res.status(draining ? 503 : 200).json({
            status: draining ? 'draining' : 'ok',
            service,
            uptime: Math.round(process.uptime()),
        });
    });

    return router;
}

/**
 * Close `server` on SIGTERM/SIGINT without dropping in-flight requests.
 *
 * Docker, Kubernetes and systemd all stop a process by sending SIGTERM and
 * waiting. Node's default handling is to exit immediately, which cuts every open
 * response mid-write -- a report generation thirty seconds in simply vanishes.
 * Handling the signal turns that into a drain.
 *
 * `exit` is injectable only so the behaviour can be tested without killing the
 * test runner. Application code should not pass it.
 */
export function installGracefulShutdown(server, service, {
    timeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000,
    exit = (code) => process.exit(code),
} = {}) {
    let started = false;

    const shutdown = (signal) => {
        // A second Ctrl-C, or a SIGINT arriving after a SIGTERM, must not start
        // a second drain and race the first.
        if (started) return;
        started = true;
        draining = true;

        console.log(`${service}: ${signal} received, draining (timeout ${timeoutMs}ms)`);

        // Keep-alive sockets with no request on them would otherwise hold
        // server.close() open until the client gives up.
        //
        // Sweeping REPEATEDLY rather than once is the load-bearing part. A
        // connection that is busy when the signal lands falls idle as soon as
        // its response finishes, and a single up-front sweep has already been
        // and gone by then -- so server.close() sits waiting out the full
        // keepAliveTimeout (5s by default) for a client that has no further
        // work to send. Sweeping closes each connection as it falls idle, which
        // bounds the drain by the work in flight rather than by a timeout.
        server.closeIdleConnections();
        const sweep = setInterval(() => server.closeIdleConnections(), 50);

        // A wedged request must not hold the shutdown open forever. Past this
        // point the orchestrator would SIGKILL us anyway; exiting on our own
        // terms at least logs the reason.
        const forced = setTimeout(() => {
            console.error(`${service}: still draining after ${timeoutMs}ms, forcing exit`);
            finish(1);
        }, timeoutMs);

        // Neither timer should keep the process alive on its own account.
        sweep.unref();
        forced.unref();

        // Hoisted, so the forced-exit timer above can name it. Whichever path
        // gets here first wins; the other is cancelled, and the guard covers
        // the case where it had already fired.
        let finished = false;
        function finish(code) {
            if (finished) return;
            finished = true;
            clearInterval(sweep);
            clearTimeout(forced);
            exit(code);
        }

        // Stops the listener accepting new connections. The callback runs once
        // every connection still open has finished.
        server.close((err) => {
            if (err) {
                console.error(`${service}: error while closing`, err);
                finish(1);
                return;
            }
            // Suppressed if the forced-exit path already ran: the drain did
            // not, in fact, complete in time, and saying so would be a lie.
            if (!finished) console.log(`${service}: drained, exiting`);
            finish(0);
        });
    };

    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, () => shutdown(signal));
    }

    return server;
}
