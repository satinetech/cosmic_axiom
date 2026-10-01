import { verifyToken } from '../utils/tokenUtils.js';

export async function authenticateRequest(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }

    try {
        const result = await verifyToken(token);
        // null for a token that is malformed, badly signed, expired or revoked.
        if (!result?.valid) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        req.tokenPayload = result.payload;
        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        return res.status(500).json({ error: 'Internal server error during token verification' });
    }
}