/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

type TickListener = () => void;

const listeners = new Set<TickListener>();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function subscribeSecondTick(listener: TickListener): () => void {
    listeners.add(listener);
    if (!intervalId) {
        intervalId = setInterval(() => {
            for (const fn of listeners) fn();
        }, 1000);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
}
