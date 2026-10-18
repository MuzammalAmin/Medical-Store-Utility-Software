import { useEffect, useEffectEvent } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;

/** Calls `onIdle` after `minutes` without keyboard or mouse activity (PRD §2 auto-lock). */
export function useIdleLock(minutes: number, onIdle: () => void): void {
  const fireIdle = useEffectEvent(onIdle);

  useEffect(() => {
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fireIdle, minutes * 60_000);
    };
    reset();
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, reset);
    };
  }, [minutes]);
}
