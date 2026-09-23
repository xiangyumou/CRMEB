import { contrast, fromHsl, mix, parseHex, toHex, toHsl, type Rgb } from './color';

/**
 * The operator-editable theme turned into readable tokens (docs/mini/design.md §3.3).
 *
 * The operator's brand colour is a business decision and is kept as it is; what is derived
 * guarantees the *text* stays readable:
 *
 * 1. `onPrimary`: white or `#1A1A1A`, whichever contrasts more with the primary colour.
 * 2. `primaryText`: the primary colour if it reaches 4.5:1 on white, otherwise darkened in HSL
 *    until it does (blue `#1DB0FC` becomes about `#0077B3`).
 * 3. `price`: the operator's price colour, or `primaryText`, through the same rule as 2.
 * 4. `onAccent`: as 1, for the accent colour (the primary colour when there is no accent).
 *
 * Design wants this in `packages/contracts/src/diy/theme.ts`, shared with the admin preview;
 * until F1 moves it there it lives here, pure and tested (theme/derive.test.ts).
 */
export interface ThemeInput {
  primary: string;
  accent?: string | null | undefined;
  price?: string | null | undefined;
}

export interface DerivedTheme {
  primary: string;
  onPrimary: string;
  primarySoft: string;
  primaryText: string;
  accent: string;
  onAccent: string;
  price: string;
}

export const DEFAULT_PRIMARY = '#E1251B';
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const INK: Rgb = { r: 0x1a, g: 0x1a, b: 0x1a };
const INK_HEX = '#1A1A1A';
/** WCAG AA for body text. */
export const TEXT_CONTRAST = 4.5;

function onColor(background: Rgb): string {
  return contrast(background, WHITE) >= contrast(background, INK) ? '#FFFFFF' : INK_HEX;
}

/** `color`, darkened in HSL lightness until it reads at 4.5:1 on white. */
export function readableOnWhite(color: Rgb): Rgb {
  if (contrast(color, WHITE) >= TEXT_CONTRAST) return color;
  const hsl = toHsl(color);
  for (let l = hsl.l; l >= 0; l -= 0.005) {
    const candidate = fromHsl({ ...hsl, l });
    // Round first: the hex that ships must pass, not the float before it.
    const shipped = parseHex(toHex(candidate)) ?? candidate;
    if (contrast(shipped, WHITE) >= TEXT_CONTRAST) return shipped;
  }
  return INK;
}

export function deriveTheme(input: ThemeInput): DerivedTheme {
  const primary = parseHex(input.primary) ?? (parseHex(DEFAULT_PRIMARY) as Rgb);
  const accent = (input.accent ? parseHex(input.accent) : null) ?? primary;
  const primaryText = readableOnWhite(primary);
  const priceBase = input.price ? parseHex(input.price) : null;
  const price = priceBase ? readableOnWhite(priceBase) : primaryText;
  return {
    primary: toHex(primary),
    onPrimary: onColor(primary),
    primarySoft: toHex(mix(primary, WHITE, 0.1)),
    primaryText: toHex(primaryText),
    accent: toHex(accent),
    onAccent: onColor(accent),
    price: toHex(price),
  };
}

export type RadiusScale = 'none' | 'small' | 'medium' | 'large';

/** `app/config` appearance.theme.radius → the multiplier on card and picture radii. */
export const RADIUS_FACTOR: Record<RadiusScale, number> = {
  none: 0,
  small: 0.5,
  medium: 1,
  large: 1.5,
};

/**
 * The CSS custom properties for a theme, as a `style` string (page-meta `page-style` takes a
 * string). Only what the operator can change is written; everything else keeps the default
 * from `app.scss`.
 */
export function themeStyle(theme: DerivedTheme, radius: RadiusScale = 'medium'): string {
  const vars: Array<[string, string]> = [
    ['--color-primary', theme.primary],
    ['--color-on-primary', theme.onPrimary],
    ['--color-primary-soft', theme.primarySoft],
    ['--color-primary-text', theme.primaryText],
    ['--color-accent', theme.accent],
    ['--color-on-accent', theme.onAccent],
    ['--color-price', theme.price],
    ['--radius-factor', String(RADIUS_FACTOR[radius])],
  ];
  return vars.map(([name, value]) => `${name}:${value}`).join(';');
}
