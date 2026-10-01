/**
 * Content-addressed evidence store.
 *
 * A file's identity is the sha256 of its bytes, and it lives at
 *
 *   <root>/sha256/<first two hex>/<next two hex>/<full hash>
 *
 * so identical files are stored once, a name can never be reused for
 * different bytes, and verifying a file is re-hashing it. Writes go to a temp
 * file in the same directory and are renamed into place, so a crash never
 * leaves a partial file under a valid name.
 *
 * The root is EVIDENCE_ROOT, or ./evidence relative to the working directory.
 * It must be on persistent storage.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const SHA256 = /^[0-9a-f]{64}$/;

export function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function assertSha(sha) {
    if (typeof sha !== "string" || !SHA256.test(sha)) {
        throw new Error(`not a sha256: ${JSON.stringify(sha)}`);
    }
}

export class EvidenceStore {
    constructor(root = process.env.EVIDENCE_ROOT || "evidence") {
        this.root = path.resolve(root);
    }

    pathFor(sha) {
        assertSha(sha);
        return path.join(this.root, "sha256", sha.slice(0, 2), sha.slice(2, 4), sha);
    }

    /** Stores the bytes if not already present. Returns { sha256, size, created }. */
    async put(buffer) {
        const sha = sha256(buffer);
        const target = this.pathFor(sha);
        if (fs.existsSync(target)) return { sha256: sha, size: buffer.length, created: false };

        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const temp = `${target}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
        await fs.promises.writeFile(temp, buffer, { flag: "wx", mode: 0o440 });
        await fs.promises.rename(temp, target);
        return { sha256: sha, size: buffer.length, created: true };
    }

    /** The bytes, or null if the file is missing. */
    async get(sha) {
        try {
            return await fs.promises.readFile(this.pathFor(sha));
        } catch (err) {
            if (err.code === "ENOENT") return null;
            throw err;
        }
    }

    /**
     * Re-hashes the file on disk, streaming. Returns the hash it actually has,
     * or null if it is missing -- never the name it is stored under.
     */
    async observe(sha) {
        const file = this.pathFor(sha);
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash("sha256");
            fs.createReadStream(file)
                .on("error", (err) => (err.code === "ENOENT" ? resolve(null) : reject(err)))
                .on("data", (chunk) => hash.update(chunk))
                .on("end", () => resolve(hash.digest("hex")));
        });
    }
}
