# Authentication

astral issues the JWT that every other service trusts. `AUTH_MODE` selects how
it decides who is asking.

| mode | |
|---|---|
| `local` | Username and password against the `User` table. **The default**, and the only behaviour this service has ever had. |
| `trusted-header` | An authenticating proxy in front has already established who the caller is, and says so in a request header. |

Nothing downstream changes between them. Services still verify tokens against
astral exactly as before; only how the *first* token is obtained differs.

## `local`

The default. Set none of the variables below and the service behaves exactly as
it always has — `POST /users/login` with a username and password.

## `trusted-header`

For deployments that already authenticate at the edge: Tailscale Serve,
oauth2-proxy, Authelia, authentik, an ALB with OIDC. The proxy injects the
authenticated user as a header, and `POST /auth/token` exchanges it for the same
JWT the password flow issues.

**That route exists only in this mode.** In `local` mode it is not mounted —
there is no code path to reach, however misconfigured the rest of the deployment
is.

### Why a header can be trusted, and the condition that makes it so

Forward-auth has no cryptographic component. The header is not signed and
carries no proof. It is trustworthy *only* because of where it came from: a
proxy that sets it on every request it forwards, overwriting anything the client
sent.

That holds while exactly one thing is true:

> nothing except that proxy can reach this service.

If any other path exists, whoever is on it simply sends the header themselves
and is whoever they like. This is why the mode is off by default, and why
turning it on requires saying explicitly which peers may assert an identity.

Two things follow, and both are implemented rather than left to the operator:

- **The peer is checked on every request**, not once at startup. A deployment
  changes under a running process, and a check that ran once is a check that has
  stopped being true.
- **The peer is the address holding the socket**, not `X-Forwarded-For`.
  Express's `req.ip` reads that header when `trust proxy` is set, and it is
  whatever the client sent unless the immediate hop is already known to be
  trustworthy — which is the very thing being decided. Only the socket's peer
  address cannot be forged by whoever is on the other end of it.

Your proxy must also **strip the identity header from inbound requests** before
setting its own. A proxy that only adds the header leaves a client free to send
one that arrives alongside it.

### Configuration

| variable | |
|---|---|
| `AUTH_MODE` | `local` (default) or `trusted-header` |
| `TRUSTED_PROXIES` | **Required.** Comma-separated addresses or IPv4 CIDRs allowed to assert an identity. IPv6 is matched literally. |
| `AUTH_HEADER_USER` | **Required.** The header your proxy sets, e.g. `X-Forwarded-User`, `X-Auth-Request-Email`, `Tailscale-User-Login`. No default — guessing it wrong means reading an attacker-supplied header. |
| `AUTH_HEADER_NAME` | Optional. Header carrying a display name, used only when provisioning. |
| `AUTH_JIT_PROVISION` | `true` to create an account on first sight. **Default `false`**: the proxy vouches for *who* someone is, not for whether they should have an account here. |
| `AUTH_DEFAULT_ROLE` | Role for provisioned accounts. Default `PENTESTER`, the least privileged. |

Every misconfiguration is fatal **at startup**, not at the first login: an
unknown mode, a missing or malformed `TRUSTED_PROXIES`, a missing
`AUTH_HEADER_USER`. A service whose job is to decide who someone is should not
run at all if it cannot state the rule it is deciding by.

### Example

```
AUTH_MODE=trusted-header
TRUSTED_PROXIES=172.18.0.0/16
AUTH_HEADER_USER=X-Forwarded-User
AUTH_JIT_PROVISION=true
AUTH_DEFAULT_ROLE=PENTESTER
```

These go in `services/astral/.env` alongside the rest of astral's configuration.

Set `TRUSTED_PROXIES` as narrowly as you can. Anything reachable from a listed
address can assert any identity, so a wide range means trusting every container
on that network, not just the proxy.

A provisioned account is stored with an empty password hash, which no bcrypt
comparison can match. Such an account cannot log in through the password route:
the proxy is the only way in for it.
