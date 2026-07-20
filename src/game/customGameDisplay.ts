// Display rules for a creator's own custom-game rows.
//
// UX-FINDINGS P2.3: moderation/quality-rejected games showed their raw
// prompt verbatim (including offensive test data). For those we hide the
// original text and show a generic "Rejected: moderation" placeholder.
// Calibration rejections (too hard/easy) keep the prompt — it's the
// creator's own benign text and useful for iterating.

import type { CustomGame } from '../services/api';

export interface CustomGameDisplay {
  /** Hide the raw prompt/description (moderation or quality rejection). */
  contentRejected: boolean;
  /** Friendly one-line rejection note, or null when not rejected. */
  rejectionNote: string | null;
}

export function getCustomGameDisplay(game: Pick<CustomGame, 'status' | 'calibration_stats'>): CustomGameDisplay {
  const reason = game.calibration_stats?.reason ?? '';
  if (game.status !== 'rejected') {
    return { contentRejected: false, rejectionNote: null };
  }
  if (reason === 'moderation' || reason.startsWith('low_quality')) {
    return { contentRejected: true, rejectionNote: 'Rejected: moderation' };
  }
  if (reason === 'too_hard') {
    return { contentRejected: false, rejectionNote: 'Rejected: too hard for the live band' };
  }
  if (reason === 'too_easy') {
    return { contentRejected: false, rejectionNote: 'Rejected: too easy for the live band' };
  }
  return { contentRejected: false, rejectionNote: reason ? `Rejected: ${reason}` : 'Rejected' };
}
