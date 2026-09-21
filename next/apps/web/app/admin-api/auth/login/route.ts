import { adminLogin } from '@shop/contracts/auth/auth.contract';
import { ADMIN_COOKIE, getContainer, handle } from '../../../../src/server';

/**
 * Sets the `admin_session` cookie and returns the profile the shell needs.
 *
 * The token never appears in the body: a JS-readable token would undo the
 * point of an httpOnly cookie. `handle()` marks the cookie httpOnly +
 * SameSite=Lax, and Secure whenever `NODE_ENV=production`.
 */
export const POST = handle(adminLogin, async (ctx, { body }) => {
  const container = getContainer();
  const result = await container.adminAuth.login(ctx, body);
  ctx.setCookie(ADMIN_COOKIE, result.token, {
    maxAge: Math.floor(result.expiresInMs / 1000),
    path: '/',
  });
  return result.profile;
});

export const dynamic = 'force-dynamic';
