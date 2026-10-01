import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid'; // Add at the top if not already imported
dotenv.config();


const prisma = new PrismaClient();
// Defaulted, because jwt.sign throws on an undefined expiresIn -- and
// TOKEN_EXPIRY appears nowhere in .env.example or in infra/standup.sh, so on a
// stock install it IS undefined. The failure lands inside sign(), so a correct
// username and password returns 500 rather than a token.
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '1h'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolved against this file rather than the process working directory, and
// defaulted to the filenames infra/standup.sh generates.
//
// The previous form was "src/keys/" + process.env.JWT_PRIVATE_KEY, which had
// two separate problems. JWT_PRIVATE_KEY is not in .env.example, so a stock
// install read "src/keys/undefined" -- astral, the service every other service
// authenticates against, did not start. And the path was relative to the
// working directory, so even with the variable set it only resolved when the
// process happened to be launched from the service root. nebula already
// resolves its keys this way.
const KEY_DIR = path.join(__dirname, '..', 'keys');
const privateKeyPath = path.join(KEY_DIR, process.env.JWT_PRIVATE_KEY || 'private.key');
const publicKeyPath = path.join(KEY_DIR, process.env.JWT_PUBLIC_KEY || 'public.key.pub');

// Fail loudly and at startup. astral cannot issue or verify a token without
// these, so continuing would only move the failure somewhere less obvious --
// every downstream service would report an authentication error instead.
function readKey(kind, keyPath) {
    try {
        return fs.readFileSync(keyPath, 'utf8');
    } catch (err) {
        throw new Error(
            `astral cannot start: could not read its JWT ${kind} key at ${keyPath} (${err.code}). ` +
            `Run infra/standup.sh to generate one, or set JWT_${kind.toUpperCase()}_KEY to the ` +
            `name of an existing key file in ${KEY_DIR}.`
        );
    }
}

const privateKey = readKey('private', privateKeyPath);
const publicKey = readKey('public', publicKeyPath);

export function generateToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            email: user.email,
            role: user.role,
            jti: uuidv4(),
        },
        privateKey,
        {   algorithm: 'RS256',
            expiresIn: TOKEN_EXPIRY }
    );
}

export async function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
        const jti = decoded.jti;
        // If a token with this jti exists, it's revoked
        const revokedToken = await prisma.token.findUnique({ where: { jti } });
        if (revokedToken) return null;
        return { valid:true, payload: decoded}
    } catch (err) {
        // Don't leak token or sensitive details. A token that fails
        // verification is invalid: return null, as for a revoked one, so the
        // caller refuses it.
        console.error('Token verification failed:', err.message);
        return null;
    }
}

export function decodeToken(token) {
    return jwt.decode(token); // does not verify signature!
}
