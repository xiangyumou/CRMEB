import type { DbOrTx } from '@shop/db';

/**
 * The seam between session handling and the `user` domain.
 *
 * Session handling must be able to reject a storefront session whose
 * `passwordVersion` is stale, and to refuse a disabled account, without owning
 * the `users` table. The user domain registers the real implementation;
 * `@shop/testing` ships an in-memory fake so everything here is testable on its
 * own.
 */

export interface UserAuthState {
  id: number;
  /** Bumped on every password change; a session minted before it is dead. */
  passwordVersion: number;
  /** 1 = active. Anything else refuses the session. */
  status: number;
}

export interface UserLookup {
  findAuthState(db: DbOrTx, userId: number): Promise<UserAuthState | null>;
}

let lookup: UserLookup | undefined;

export function registerUserLookup(impl: UserLookup): void {
  lookup = impl;
}

export function getUserLookup(): UserLookup | undefined {
  return lookup;
}

/**
 * `auth: 'staff'` routes (`/api/v1/staff/*`) are a storefront session whose
 * user is an order handler. Who counts as staff is the order domain's business;
 * `handle()` only needs a yes/no.
 */
export interface StaffCheck {
  isStaff(db: DbOrTx, userId: number): Promise<boolean>;
}

let staffCheck: StaffCheck | undefined;

export function registerStaffCheck(impl: StaffCheck): void {
  staffCheck = impl;
}

export function getStaffCheck(): StaffCheck | undefined {
  return staffCheck;
}

/** Test helper. Never call this from app code. */
export function resetUserLookup(): void {
  lookup = undefined;
  staffCheck = undefined;
}
