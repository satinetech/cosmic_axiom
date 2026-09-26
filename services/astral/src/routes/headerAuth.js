import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

import { generateToken } from '../utils/tokenUtils.js';
import { isTrustedPeer } from '../auth/trustedProxy.js';

const prisma = new PrismaClient();

/**
 * Exchange a proxy-asserted identity for the same JWT the password flow issues.
 *
 * Everything downstream is unchanged: services still verify tokens against
 * astral exactly as before. Only how the FIRST token is obtained differs.
 *
 * This router is mounted only when AUTH_MODE=trusted-header. In the default
 * mode the route does not exist at all, which is a stronger guarantee than a
 * route that exists and checks a flag.
 */
export function createHeaderAuthRouter(config) {
    const router = Router();

    router.post('/token', async (req, res) => {
        // req.socket.remoteAddress, NOT req.ip.
        //
        // req.ip reads X-Forwarded-For when `trust proxy` is enabled, and
        // X-Forwarded-For is whatever the client sent unless the immediate hop
        // is already known to be trustworthy -- which is the very thing being
        // decided here. Only the address of the peer actually holding the
        // socket cannot be forged by whoever is on the other end of it.
        const peer = req.socket?.remoteAddress;

        if (!isTrustedPeer(peer, config.trustedProxies)) {
            console.warn(`headerAuth: refused identity assertion from untrusted peer ${peer}`);
            return res.status(403).json({ error: 'Forbidden: untrusted proxy' });
        }

        const rawLogin = req.headers[config.userHeader];
        // A repeated header arrives as an array. Two values means something in
        // the chain appended rather than replaced, and picking either one is
        // guessing, so refuse.
        if (Array.isArray(rawLogin)) {
            return res.status(400).json({ error: 'Ambiguous identity header' });
        }

        const login = rawLogin?.trim().toLowerCase();
        if (!login) {
            return res.status(401).json({ error: 'No identity on this request' });
        }

        try {
            let user = await prisma.user.findUnique({ where: { username: login } });

            if (!user) {
                if (!config.jitProvision) {
                    return res.status(403).json({ error: 'No account for this identity' });
                }

                const rawName = req.headers[config.nameHeader];
                const displayName = (Array.isArray(rawName) ? rawName[0] : rawName)?.trim();

                user = await prisma.user.create({
                    data: {
                        username: login,
                        name: displayName || login,
                        role: config.defaultRole,
                        // There is no password to store. An empty hash cannot
                        // match any bcrypt comparison, so this row can never be
                        // used to log in through the password route -- the
                        // proxy is the only way in for this account.
                        passwordHash: '',
                    },
                });
                console.log(`headerAuth: provisioned ${login} as ${config.defaultRole}`);
            }

            await prisma.user.update({
                where: { id: user.id },
                data: { lastLogin: new Date() },
            });

            return res.json({ token: generateToken(user), user });
        } catch (err) {
            console.error('headerAuth: token exchange failed:', err.message);
            return res.status(500).json({ error: 'Authentication failed' });
        }
    });

    return router;
}
