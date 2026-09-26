import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { Router } from 'express';
import { authenticateRequest } from '../middleware/authenticateRequest.js';
import { generateToken } from '../utils/tokenUtils.js';

const prisma = new PrismaClient();
const router = Router();

// GET /users/
router.get('/', authenticateRequest, async (req, res) => {
    console.log("Here");
    try {
        console.log
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                username: true,
                role: true,
                createdAt: true,
                lastLogin: true,
            },
        });

        res.json(users);
    } catch (err) {
        console.error('Get Users Error:', err.message);
        res.status(500).json({ error: 'System Error' });
    }
});


// POST /users/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update lastLogin timestamp
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
        });

        const token = generateToken(user);

        res.json({ token, user });
    } catch (err) {
        console.error('Login failed:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});


// POST /users/logout
router.post('/logout', authenticateRequest, async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(400).json({ error: 'Token missing from Authorization header' });
    }

    try {
        const { tokenPayload } = req;

        await prisma.token.create({
            data: {
                jti: tokenPayload.jti,
                userId: tokenPayload.sub,
                revokedAt: new Date(),
                expiresAt: new Date(tokenPayload.exp * 1000),
            },
        });

        res.json({ message: 'Logged out' });
    } catch (err) {
        console.error('Logout failed:', err.message);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

// POST /users/create
router.post('/create', authenticateRequest, async (req, res) => {
    const { username, name, password, role } = req.body;

    try {
        if (req.tokenPayload.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Admins only' });
        }

        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) return res.status(409).json({ error: 'User already exists' });

        const passwordHash = bcrypt.hashSync(password, 13);
        const user = await prisma.user.create({
            data: { username, name, passwordHash, role },
        });

        res.status(201).json({ message: 'User created', user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'User creation failed' });
    }
});

// POST /user/update
router.post('/update', authenticateRequest, async (req, res) => {
    const { id, name, username, role } = req.body;

    if (!id || !name || !username || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const isAdmin = req.tokenPayload.role === 'ADMIN';
        const isSelf = req.tokenPayload.sub === id;

        // Only allow ADMINs to change other users
        if (!isAdmin && !isSelf) {
            return res.status(403).json({ error: 'Forbidden: Admins only for this action' });
        }

        // Editing your own profile and editing your own privileges are two
        // different things, and this endpoint accepts them in one request body.
        // Without this check the self-update path grants any authenticated user
        // whatever role they ask for, because `role` is taken from the body and
        // written straight to the row.
        //
        // Read the stored role rather than trusting the token's copy of it: the
        // token was signed at login and may predate a legitimate change.
        const target = await prisma.user.findUnique({
            where: { id },
            select: { role: true },
        });

        if (!target) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!isAdmin && role !== target.role) {
            return res.status(403).json({ error: 'Forbidden: only an ADMIN can change a role' });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                name,
                username,
                role,
            },
            select: {
                id: true,
                name: true,
                username: true,
                role: true,
            },
        });

        res.json({ message: 'User updated', user: updatedUser });
    } catch (err) {
        console.error('Update user failed:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.post('/password-reset', authenticateRequest, async (req, res) => {
    const { userId, password } = req.body;
    console.log(password);
    if (!userId || !password || password.length < 8) {
        return res.status(400).json({ error: "Missing userId or password too short" });
    }

    try {
        const hashed = await bcrypt.hash(password, 13);

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: hashed },
        });

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        console.error("Astral: Password update failed:", err.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

// GET /users/me
router.get('/me', authenticateRequest, async (req, res) => {
    const userId = req.tokenPayload.sub;

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                username: true,
                role: true,
                createdAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to retrieve user' });
    }
});


export default router;
