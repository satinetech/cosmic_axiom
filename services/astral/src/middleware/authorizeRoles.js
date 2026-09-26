/**
 * Role gate, to be used after authenticateRequest.
 *
 * Accepts either spelling, because both are in use at the call sites:
 *
 *     authorizeRoles('ADMIN')
 *     authorizeRoles(['ADMIN', 'PENTEST LEAD'])
 */
export function authorizeRoles(...allowedRoles) {
    const allowed = allowedRoles.flat();

    return (req, res, next) => {
        // authenticateRequest puts the verified claims on `tokenPayload`.
        // Reading anything else here means this gate cannot see the role, and a
        // gate that cannot see the role must refuse rather than guess.
        const role = req.tokenPayload?.role;

        if (!role || !allowed.includes(role)) {
            return res.status(403).json({ message: 'Forbidden - insufficient role' });
        }

        next();
    };
}
