import { describe, it, expect } from 'vitest';
import { getCustomGameDisplay } from './customGameDisplay';
import type { CustomGame } from '../services/api';

const stats = (reason: string): CustomGame['calibration_stats'] => ({ passes: false, reason });

describe('getCustomGameDisplay', () => {
  it('hides the prompt and shows a generic note for a moderation reject', () => {
    const d = getCustomGameDisplay({ status: 'rejected', calibration_stats: stats('moderation') });
    expect(d.contentRejected).toBe(true);
    expect(d.rejectionNote).toBe('Rejected: moderation');
  });

  it('treats a low_quality reject the same (no raw prompt surfaced)', () => {
    const d = getCustomGameDisplay({ status: 'rejected', calibration_stats: stats('low_quality:injection_like') });
    expect(d.contentRejected).toBe(true);
    expect(d.rejectionNote).toBe('Rejected: moderation');
  });

  it('keeps the prompt for a calibration (too hard) reject', () => {
    const d = getCustomGameDisplay({ status: 'rejected', calibration_stats: stats('too_hard') });
    expect(d.contentRejected).toBe(false);
    expect(d.rejectionNote).toBe('Rejected: too hard for the live band');
  });

  it('shows no rejection note for a live game', () => {
    const d = getCustomGameDisplay({ status: 'live', calibration_stats: stats('') });
    expect(d.contentRejected).toBe(false);
    expect(d.rejectionNote).toBeNull();
  });
});
