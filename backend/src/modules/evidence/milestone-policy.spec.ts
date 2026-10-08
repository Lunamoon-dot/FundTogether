import { milestoneActionReason, MilestonePolicyState } from './milestone-policy';

const state = (overrides: Partial<MilestonePolicyState> = {}): MilestonePolicyState => ({ state: 7, timestamp: 100n,
  evidenceDeadline: 200n, admissionDeadline: 200n, reviewEnd: 200n, version: 1, resolution: 0,
  responseDeadline: 0n, resolutionDeadline: 0n, responseHash: `0x${'0'.repeat(64)}`, bond: 0n,
  organizer: false, reviewer: false, donor: true, linked: true, readable: true, ...overrides });

describe('MVP milestone action policy', () => {
  it('opens challenge only for actual donors before exact deadline', () => {
    expect(milestoneActionReason('challenge', state())).toBe('');
    for (const change of [{ donor: false }, { timestamp: 200n }, { resolution: 1 }, { responseDeadline: 150n }, { linked: false }])
      expect(milestoneActionReason('challenge', state(change))).not.toBe('');
  });
  it('requires independent linked resolver and readable public evidence for admission', () => {
    expect(milestoneActionReason('admit', state({ state: 11, reviewer: true }))).toBe('');
    for (const change of [{ reviewer: false }, { readable: false }, { timestamp: 200n }, { linked: false }])
      expect(milestoneActionReason('admit', state({ state: 11, reviewer: true, ...change }))).not.toBe('');
  });
  it('allows final decisions only between the two chain deadlines', () => {
    const s = state({ state: 8, reviewer: true, responseDeadline: 100n, resolutionDeadline: 200n });
    expect(milestoneActionReason('continue', s)).toBe('');
    expect(milestoneActionReason('continue', { ...s, timestamp: 99n })).not.toBe('');
    expect(milestoneActionReason('stop', { ...s, timestamp: 200n })).not.toBe('');
    expect(milestoneActionReason('timeout', { ...s, reviewer: false, timestamp: 200n })).toBe('');
    expect(milestoneActionReason('resubmit', { ...s, version: 3 })).not.toBe('');
  });
  it('prevents replacement of response and settlement during a live challenge', () => {
    expect(milestoneActionReason('respond', state({ state: 8, organizer: true, responseDeadline: 200n }))).toBe('');
    expect(milestoneActionReason('respond', state({ state: 8, organizer: true, responseDeadline: 200n, responseHash: `0x${'a'.repeat(64)}` }))).not.toBe('');
    expect(milestoneActionReason('settle', state({ state: 8, timestamp: 300n }))).not.toBe('');
    expect(milestoneActionReason('settle', state({ timestamp: 200n }))).toBe('');
  });
  it('requires next evidence version within the existing three submission limit', () => {
    expect(milestoneActionReason('submit', state({ state: 6, organizer: true, version: 2 }))).toBe('');
    expect(milestoneActionReason('submit', state({ state: 6, organizer: true, version: 3 }))).not.toBe('');
    expect(milestoneActionReason('submit', state({ state: 6, organizer: true, timestamp: 200n }))).not.toBe('');
  });
});
