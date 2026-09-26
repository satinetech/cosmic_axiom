#!/bin/bash
# Runs once, on first initialisation of an empty data directory.
#
# A shell script rather than the .sql file used by the local setup, for two
# reasons. MySQL's entrypoint does no variable substitution in .sql, so a .sql
# file cannot know the credentials compose was given -- infra/db-init's answer
# is to hardcode them, which silently overrides MYSQL_PASSWORD and leaves the
# account on a password published in the repository. And the grants there are
# `ON *.*  WITH GRANT OPTION`, which is superuser by another name.
#
# Here the entrypoint has already created MYSQL_USER with MYSQL_PASSWORD. This
# script only adds the databases and grants rights on those databases.
set -euo pipefail

DATABASES=(astral forge library singularity)

for db in "${DATABASES[@]}"; do
    mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${db}\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${db}\`.* TO '${MYSQL_USER}'@'%';
SQL
    echo "db-init: ${db} ready"
done

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "FLUSH PRIVILEGES;"
