-- Constrain User.role to the values the application actually uses.
--
-- The column is a free-text VARCHAR today and `POST /users/update` and
-- `/users/create` write it straight from the request body, so a deployment can
-- hold any string at all -- including a typo that no authorization check will
-- ever match, which fails open or closed depending on where it is read.
--
-- Normalise first, constrain second. Adding the constraint FAILS if any existing
-- row violates it, so an upgrade of a real database would stop here rather than
-- silently coercing.

-- Case and whitespace variants of the three known roles.
UPDATE `User` SET `role` = 'ADMIN'
    WHERE UPPER(TRIM(`role`)) = 'ADMIN';

UPDATE `User` SET `role` = 'PENTESTER'
    WHERE UPPER(TRIM(`role`)) = 'PENTESTER';

UPDATE `User` SET `role` = 'PENTEST LEAD'
    WHERE UPPER(TRIM(`role`)) IN ('PENTEST LEAD', 'PENTEST_LEAD', 'PENTESTLEAD');

-- Anything left was never a role this application recognises, so no check has
-- ever granted it anything. It becomes PENTESTER: of the three, the one that
-- confers least. Demoting an unrecognised value is recoverable by an admin;
-- promoting one is not.
UPDATE `User` SET `role` = 'PENTESTER'
    WHERE `role` NOT IN ('ADMIN', 'PENTESTER', 'PENTEST LEAD');

-- A CHECK constraint, not an ENUM column. Prisma reads a MySQL ENUM back as its
-- enum's member names, and a member cannot contain a space, so 'PENTEST LEAD'
-- would reach every caller as PENTEST_LEAD and be refused when written as
-- itself. The constraint enforces the same set while the column stays a
-- VARCHAR, so nothing that reads or writes a role changes. MySQL enforces
-- CHECK from 8.0.16.
ALTER TABLE `User`
    ADD CONSTRAINT `User_role_check` CHECK (`role` IN ('ADMIN', 'PENTESTER', 'PENTEST LEAD'));
