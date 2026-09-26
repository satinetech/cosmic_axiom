import { randomBytes } from 'crypto';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

export const ROLES = ['ADMIN', 'PENTESTER', 'PENTEST LEAD'];

/**
 * Seed accounts from configuration.
 *
 * Idempotent, and deliberately never touches an account that already exists:
 * re-running must not silently reset someone's password, and a seed step that
 * can overwrite a live credential is a seed step nobody dares run twice.
 */

// 24 bytes of CSPRNG, base64url, so it is safe to paste into a shell or a URL.
export function generatePassword() {
    return randomBytes(24).toString('base64url');
}

/**
 * Parse `SEED_USERS`: "alice:ADMIN, bob:PENTESTER".
 *
 * Throws on anything malformed rather than skipping it. A typo in a role here
 * would otherwise create an account whose role no authorization check matches,
 * which is the failure mode this configuration exists to avoid.
 */
export function parseSeedUsers(raw) {
    return String(raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
            const at = entry.lastIndexOf(':');
            if (at < 1) {
                throw new Error(`SEED_USERS entry must be 'username:ROLE', got '${entry}'`);
            }

            const username = entry.slice(0, at).trim();
            const role = entry.slice(at + 1).trim().toUpperCase();

            if (!username) throw new Error(`SEED_USERS entry has no username: '${entry}'`);
            if (!ROLES.includes(role)) {
                throw new Error(`Unknown role '${role}' in SEED_USERS (expected one of ${ROLES.join(', ')})`);
            }

            return { username, role };
        });
}

async function ensureUser({ username, role, name, password }) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        return { username, created: false };
    }

    const generated = !password;
    const secret = password || generatePassword();

    await prisma.user.create({
        data: {
            username,
            name: name || username,
            role,
            passwordHash: bcrypt.hashSync(secret, 10),
        },
    });

    return { username, role, created: true, password: generated ? secret : null };
}

export async function seed(env = process.env) {
    const requested = parseSeedUsers(env.SEED_USERS);

    // Opt-in, and off by default. An administrator account that exists because
    // nobody turned it off is the account that still has its original password
    // a year later.
    if ((env.SEED_DEFAULT_ADMIN ?? 'false').trim().toLowerCase() === 'true') {
        requested.unshift({
            username: (env.SEED_DEFAULT_ADMIN_USERNAME ?? 'admin').trim(),
            role: 'ADMIN',
            name: 'Administrator',
            // Only used if supplied. Otherwise one is generated and shown once.
            password: env.SEED_DEFAULT_ADMIN_PASSWORD || undefined,
        });
    }

    if (requested.length === 0) {
        console.log('seed: nothing requested (set SEED_USERS or SEED_DEFAULT_ADMIN=true)');
        return [];
    }

    const results = [];
    for (const user of requested) {
        results.push(await ensureUser(user));
    }

    for (const r of results) {
        if (!r.created) {
            console.log(`seed: ${r.username} already exists, left unchanged`);
        } else if (!r.password) {
            console.log(`seed: created ${r.username} (${r.role}) with the supplied password`);
        }
    }

    // Generated passwords are shown once, here, and are not recoverable. They
    // are not written to a file: the one place they are certain to be read is
    // the terminal of the person who just ran this, and the one place they must
    // not persist is a file somebody forgets about.
    const generated = results.filter((r) => r.created && r.password);
    if (generated.length > 0) {
        console.log('');
        console.log('  ┌─ Generated credentials. Shown once; they are not stored anywhere.');
        for (const r of generated) {
            console.log(`  │  ${r.username}  (${r.role})`);
            console.log(`  │  ${r.password}`);
        }
        console.log('  └─ Sign in and change these now.');
        console.log('');
    }

    return results;
}

// Only run when executed directly, so the functions above stay testable.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    seed()
        .then(() => prisma.$disconnect())
        .catch(async (err) => {
            console.error(`seed failed: ${err.message}`);
            await prisma.$disconnect();
            process.exit(1);
        });
}
