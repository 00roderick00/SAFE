// Shared vault material (docs/vault-reference/*.jpg).
//
// SafeGraphic (your own vault, one on screen) and TargetSafeGraphic
// (target cards, up to ~20 on screen) must read as the same object, so
// the gradient/bevel vocabulary lives here rather than being copied. If
// the palette changes it changes for both — they cannot drift.
//
// Same constraints as the original material pass: no feTurbulence, no
// feSpecularLighting, no raster images. Everything is layered gradients
// and gradient-stroked rings, which the GPU composites for free.
//
// IDs are always namespaced by the caller's useId(): with ~20 target
// cards on screen, duplicate ids would make the first card's tint win
// for every card. That exact bug has already bitten once.

import type { ReactNode } from 'react';

/** Difficulty band → the same palette the rest of the game uses. */
export const BAND_COLORS = {
  soft: '#D8FF45',
  tricky: '#FFAE42',
  brutal: '#FF5B32',
} as const;

export type DifficultyBand = keyof typeof BAND_COLORS;

/**
 * The shared gradient set. `id(name)` must return a namespaced id.
 *
 * `tint` is the state/difficulty colour: it is applied as a fill over
 * the metal (not merely as a stroke) so the material takes the cast.
 */
export const VaultMaterialDefs = ({
  id,
  tint,
  detail = 'full',
}: {
  id: (name: string) => string;
  tint: string;
  /** 'full' adds the definitions only the large vault needs. */
  detail?: 'full' | 'compact';
}): ReactNode => (
  <>
    {/* Door face: cool blue-steel, lit from upper-left, falling to a
        deep shadow bottom-right. */}
    <linearGradient id={id('door-metal')} x1="0.12" y1="0.02" x2="0.88" y2="1">
      <stop offset="0" stopColor="#b3cadb" />
      <stop offset="0.16" stopColor="#7d94a6" />
      <stop offset="0.38" stopColor="#4a6375" />
      <stop offset="0.66" stopColor="#243646" />
      <stop offset="1" stopColor="#0a1622" />
    </linearGradient>

    {/* Bevel: light top-left edge, dark bottom-right — what makes a
        ring read as having real thickness. */}
    <linearGradient id={id('bevel')} x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stopColor="#cfe2ef" />
      <stop offset="0.35" stopColor="#7d95a5" />
      <stop offset="0.62" stopColor="#243646" />
      <stop offset="1" stopColor="#07111e" />
    </linearGradient>

    {/* Inverted bevel for inner walls / recesses. */}
    <linearGradient id={id('bevel-inv')} x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stopColor="#07111e" />
      <stop offset="0.4" stopColor="#1b2d3e" />
      <stop offset="0.75" stopColor="#8aa1b1" />
      <stop offset="1" stopColor="#c4d8e6" />
    </linearGradient>

    {/* Directional specular sweep across the upper-left. */}
    <linearGradient id={id('spec')} x1="0.05" y1="0" x2="0.75" y2="1">
      <stop offset="0.02" stopColor="#ffffff" stopOpacity="0" />
      <stop offset="0.16" stopColor="#f2fbff" stopOpacity="0.46" />
      <stop offset="0.27" stopColor="#dcecf8" stopOpacity="0.16" />
      <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>

    {/* Difficulty / state cast — strongest at the rim, so the metal
        takes the colour rather than just being outlined in it. */}
    <radialGradient id={id('door-tint')} cx="42%" cy="34%" r="72%">
      <stop offset="0.25" stopColor={tint} stopOpacity="0.03" />
      <stop offset="0.72" stopColor={tint} stopOpacity="0.10" />
      <stop offset="1" stopColor={tint} stopOpacity="0.22" />
    </radialGradient>

    {/* Rim vignette so the face reads domed. */}
    <radialGradient id={id('door-vignette')} cx="50%" cy="50%" r="50%">
      <stop offset="0.7" stopColor="#000000" stopOpacity="0" />
      <stop offset="0.92" stopColor="#000814" stopOpacity="0.22" />
      <stop offset="1" stopColor="#000814" stopOpacity="0.5" />
    </radialGradient>

    {/* Frame: same steel family, flatter and darker than the door. */}
    <linearGradient id={id('frame-metal')} x1="0" x2="1" y1="0" y2="1">
      <stop stopColor="#54697a" />
      <stop offset="0.32" stopColor="#15222f" />
      <stop offset="0.68" stopColor="#31414c" />
      <stop offset="1" stopColor="#06101c" />
    </linearGradient>

    {/* Polished hub cone. */}
    <radialGradient id={id('hub')} cx="38%" cy="30%" r="72%">
      <stop offset="0" stopColor="#e8f4fc" />
      <stop offset="0.45" stopColor="#8fa9ba" />
      <stop offset="1" stopColor="#233648" />
    </radialGradient>

    {detail === 'full' && (
      <>
        {/* Bolt barrel: shading runs ACROSS the axis, which is what
            separates a cylinder from a flat pill. Only the large vault
            draws individual bolts. */}
        <linearGradient id={id('bolt-barrel')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0d1b28" />
          <stop offset="0.18" stopColor="#41586c" />
          <stop offset="0.38" stopColor="#b9d0e2" />
          <stop offset="0.55" stopColor="#7089a0" />
          <stop offset="0.8" stopColor="#2a3d50" />
          <stop offset="1" stopColor="#0a1420" />
        </linearGradient>
        <linearGradient id={id('spec2')} x1="0" y1="1" x2="1" y2="0.2">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#cfe4f2" stopOpacity="0.13" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('contact')} cx="50%" cy="50%" r="50%">
          <stop offset="0.72" stopColor="#000000" stopOpacity="0.55" />
          <stop offset="0.88" stopColor="#000000" stopOpacity="0.28" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('bolt-cap')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1b2c3c" />
          <stop offset="0.35" stopColor="#cfe2f2" />
          <stop offset="0.62" stopColor="#8ba3b8" />
          <stop offset="1" stopColor="#16283a" />
        </linearGradient>
        <radialGradient id={id('dial-face')} cx="40%" cy="32%" r="75%">
          <stop offset="0" stopColor="#5e7482" />
          <stop offset="0.5" stopColor="#2e4250" />
          <stop offset="1" stopColor="#122130" />
        </radialGradient>
        <linearGradient id={id('breach-gap')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#01050a" stopOpacity="0.95" />
          <stop offset="0.7" stopColor="#02080f" stopOpacity="0.75" />
          <stop offset="1" stopColor="#04101c" stopOpacity="0" />
        </linearGradient>
      </>
    )}
  </>
);
