// Create an engagement from a JSON description (see src/seed/engagement.js).
//
//   npm run seed:engagement -- engagement.json
//   cat engagement.json | npm run --silent seed:engagement
//
// Prints {"engagementId": "...", "created": true|false} on success. Exits 2,
// naming the field, if the description is invalid; nothing is written then.
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { seedEngagement, SeedError } from "./seed/engagement.js";

dotenv.config();

const file = process.argv[2];
const raw = file && file !== "-" ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");

let doc;
try {
    doc = JSON.parse(raw);
} catch (err) {
    console.error(`Not valid JSON: ${err.message}`);
    process.exit(2);
}

const prisma = new PrismaClient();
try {
    console.log(JSON.stringify(await seedEngagement(prisma, doc)));
} catch (err) {
    console.error(err instanceof SeedError ? `Invalid engagement description: ${err.message}` : err.message);
    process.exitCode = err instanceof SeedError ? 2 : 1;
} finally {
    await prisma.$disconnect();
}
