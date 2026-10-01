import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid'; // Add at the top if not already imported
dotenv.config();


const prisma = new PrismaClient();
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY

const privateKey = fs.readFileSync("src/keys/"+process.env.JWT_PRIVATE_KEY, 'utf8');
const publicKey = fs.readFileSync("src/keys/"+process.env.JWT_PUBLIC_KEY, 'utf8');

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
