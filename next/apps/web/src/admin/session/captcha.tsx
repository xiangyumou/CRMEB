'use client';

import type { ComponentType } from 'react';

export interface LoginCaptchaProps {
  /** Call with the token the server will verify as `captchaToken`. */
  onVerified: (token: string) => void;
  /** Call when the challenge is reset/expired so the form clears the token. */
  onReset: () => void;
  disabled?: boolean | undefined;
}

export type LoginCaptchaComponent = ComponentType<LoginCaptchaProps>;

let registered: LoginCaptchaComponent | null = null;

/**
 * Slot for the slider captcha.
 *
 * The hole, not an implementation: a captcha provider calls this once, from a
 * client module imported by the admin layout, and the login form starts
 * rendering the challenge and sending `captchaToken`. Until one registers, the
 * form renders no challenge.
 *
 * ```ts
 * registerLoginCaptcha(SliderCaptcha);
 * ```
 */
export function registerLoginCaptcha(component: LoginCaptchaComponent | null): void {
  registered = component;
}

export function getLoginCaptcha(): LoginCaptchaComponent | null {
  return registered;
}
