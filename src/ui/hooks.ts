import { useMemo } from 'react';
import { computeTier } from '../logic/tier';
import { emptyIntake, type Tier } from '../model/types';
import { useStore } from '../state/store';

export function useTierResult() {
  const intake = useStore((s) => s.assessment?.intake);
  return useMemo(() => computeTier(intake ?? emptyIntake()), [intake]);
}

export function useTier(): Tier {
  return useTierResult().tier;
}
