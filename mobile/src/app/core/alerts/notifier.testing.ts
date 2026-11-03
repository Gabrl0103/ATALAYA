import type { PermissionState } from '@capacitor/core';
import type { AlertNotification, Notifier } from './notifier';

/** The phone's notifications for the specs: what it shows, the permission it has and what it answers. */
export interface FakeNotifier extends Notifier {
  readonly shown: AlertNotification[];
  /** The tap handler the app registered, to simulate a tap on an alert. */
  tap(zoneId: string | null): void;
  /** The permission changes in the phone's settings. */
  setPermission(state: PermissionState): void;
  requests: number;
}

/** `answer` is what the permission dialog returns; `current` the state before asking. */
export function fakeNotifier(answer: PermissionState = 'granted', current: PermissionState = 'prompt'): FakeNotifier {
  let state = current;
  let handler: ((zoneId: string | null) => void) | null = null;
  const notifier: FakeNotifier = {
    shown: [],
    requests: 0,
    checkPermission: async () => state,
    requestPermission: async () => {
      notifier.requests++;
      state = answer;
      return state;
    },
    show: async (notifications) => {
      notifier.shown.push(...notifications);
    },
    onTap: (tap) => {
      handler = tap;
    },
    tap: (zoneId) => handler?.(zoneId),
    setPermission: (next) => {
      state = next;
    },
  };
  return notifier;
}

/** Levels seen at the last check, kept in memory. */
export function memoryAlertsStorage(initial: string | null = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next: string) => {
      value = next;
    },
    get value() {
      return value;
    },
  };
}
