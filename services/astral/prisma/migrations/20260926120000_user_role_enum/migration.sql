-- Constrain User.role to the values the application actually uses.
--
-- The column is a free-text VARCHAR today and `POST /users/update` and
-- `/users/create` write it straight from the request body, so a deployment can
-- hold any string at all -- including a typo that no authorization check will
-- ever match, which fails open or closed depending on where it is read.
--
-- Normalise first, ALTER second. A MySQL ALTER to ENUM under the default strict
-- mode ERRORS on a row whose value is not a member, so an upgrade of a real
-- database would stop here rather than silently coercing.

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

ALTER TABLE `User`
    MODIFY `role` ENUM('ADMIN', 'PENTESTER', 'PENTEST LEAD') NOT NULL;
