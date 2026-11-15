# Security Specification — Sumate

## 1. Data Invariants
1. **Identity & Verification**: All writes require `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Path & Size Guards**: Every document ID matches `^[a-zA-Z0-9_\\-]+$` (`<= 128` chars), and every string and array enforces strict upper bounds.
3. **PII Isolation**: User email and phone reside exclusively in `/users/{uid}/private/info`, readable only by the owner (`request.auth.uid == uid`) or verified platform admin.
4. **Privilege Escalation Prevention**: Users cannot self-assign `admin` or `staff` roles in `/clubs/{clubId}/memberships/{memberUid}` unless they are the club's verified `ownerUid` or platform admin.
5. **Immutable Ownership & Timestamps**: `ownerUid`, `createdByUid`, `clubId`, and `createdAt` cannot change after creation; `createdAt == request.time` and `updatedAt == request.time` are enforced server-side.
6. **Terminal State Locking**: Once a `Booking` reaches `cancelled` or `no_show`, or a `ProposedMatch` reaches `confirmed` or `cancelled`, or a `Tournament` reaches `completed`, non-admin clients cannot mutate it.
7. **Zero Client Query Trust**: Every `allow list` rule evaluates `resource.data` directly without `get()`/`exists()` lookups.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on Club Create**: `{ id: 'c1', ..., isVerified: true }` -> rejected by `keys().hasOnly(...)`.
2. **Email Spoofing (Unverified Email)**: JWT with `email: 'bernardo@awalabs.com'`, `email_verified: false` -> rejected by `isEmailVerified()`.
3. **Cross-User PII Read**: Authenticated user A reads `/users/userB/private/info` -> rejected by `isOwner(uid) || isPlatformAdmin()`.
4. **Self-Assigned Club Admin**: Player creates `/clubs/c1/memberships/userA` with `role: 'admin'` -> rejected unless `club.ownerUid == userA` or `isPlatformAdmin()`.
5. **Category Tampering by Non-Admin**: Player updates another player's `category` in `/clubs/c1/memberships/userB` -> rejected.
6. **ID Poisoning**: Document creation at `/clubs/c1/bookings/${'x'.repeat(300)}` -> rejected by `isValidId()`.
7. **Client Timestamp Forgery**: Creating a booking with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time` -> rejected.
8. **Immutable Field Mutation**: Updating `booking.createdByUid` or `club.ownerUid` -> rejected.
9. **Terminal State Bypass**: Re-opening a `cancelled` booking as a regular player -> rejected by terminal lock.
10. **Orphaned Subcollection Write**: Creating `/clubs/nonexistent/courts/court1` -> rejected by `exists(/clubs/nonexistent)`.
11. **Array Exhaustion**: Submitting `weeklyAvailability` with 50 items (> 21 max) -> rejected by `.size() <= 21`.
12. **Blanket Unscoped List**: Listing `/users/{uid}/private` or `/clubs/{clubId}/payments` as an unrelated player -> rejected.
