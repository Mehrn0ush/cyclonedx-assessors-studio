---
title: Secret Rotation
description: How to rotate the JWT signing secret and other sensitive material, and how to purge a committed secret from git history.
---

Assessors Studio generates and persists a strong JWT signing secret on first
run when `JWT_SECRET` is unset. Operators who manage secrets externally, or
who need to rotate a leaked secret, should follow the procedures below.

## Rotate the JWT signing secret

Rotating the JWT signing secret invalidates every active session. Plan a
maintenance window or notify users.

### When `JWT_SECRET` is managed by the server

If you do not set `JWT_SECRET` explicitly, the secret lives in the
`app_config` table. To rotate it, connect to the backend container and
run the rekey script:

```bash
docker compose exec app node backend/dist/scripts/rotate-jwt-secret.js
```

For local development, run the TypeScript source directly:

```bash
cd backend
npx tsx src/scripts/rotate-jwt-secret.ts
```

The script writes a new random 64 byte value, clears all rows in the
`session` table, and returns. Users must sign in again.

### When `JWT_SECRET` is set via environment

Generate a new value of at least 32 characters:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Update the value in your deployment environment (docker compose `.env`,
Kubernetes Secret, HashiCorp Vault, etc.). Restart the backend. Active
sessions will be rejected on the next request because their JWTs were
signed with the previous key.

## Purge a committed secret from git history

If a secret was committed to the repository, removing the file in a new
commit is not sufficient. The file is still reachable through the git
history. You must rewrite history and then rotate the secret in every
environment that may have seen it.

### Remove the file and rewrite history

```bash
# From the repo root, make sure you have a clean working tree.
git status

# Remove the tracked file from the index only.
git rm --cached backend/.env
git commit -m "security: remove tracked backend/.env"

# Rewrite history to purge the file from every past commit.
# git filter-repo is the recommended tool; install via pip if needed.
pip install git-filter-repo
git filter-repo --path backend/.env --invert-paths --force

# Force push to all relevant branches. Coordinate with collaborators
# because this rewrites SHAs.
git push --force-with-lease origin main
```

After the force push, every contributor must re clone or run
`git fetch && git reset --hard origin/main`. Open pull requests based on
the old history will have to be rebased.

### Rotate the leaked secret everywhere

Even after history is rewritten, assume the secret is compromised.
Rotate it in every environment where the old `.env` could have been
applied:

1. Local developer machines: delete any stale `backend/.env` and let the
   server generate a fresh secret on next run, or follow the example at
   `backend/.env.example` to set a fresh value.
2. CI runners: update the `JWT_SECRET` secret in the pipeline if one is
   configured.
3. Staging and production: update the secret manager, restart the
   backend, and revoke all sessions with the rekey script above.

### Verify the purge

Confirm the file is absent from every ref:

```bash
git log --all --full-history -- backend/.env
# Expected: no output

git rev-list --all | xargs -I{} git cat-file -p {}:backend/.env 2>/dev/null | head -1
# Expected: no output
```

If any remote mirrors, forks, or cached clones exist, they will still
contain the secret. Inventory every mirror before declaring the rotation
complete.

## Rotate the master encryption key

The master encryption key protects envelope encrypted fields such as
webhook secrets. To rotate:

```bash
OLD_MASTER_ENCRYPTION_KEY="$OLD_MASTER_KEY" \
MASTER_ENCRYPTION_KEY="$NEW_MASTER_KEY" \
  docker compose exec app node backend/dist/scripts/rekey-master.js
```

The script iterates every envelope encrypted column, decrypts with the
old key, and re encrypts with the new key. See
`backend/src/scripts/rekey-master.ts` for the full list of columns.
