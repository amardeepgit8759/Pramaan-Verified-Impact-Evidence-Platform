import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, vi } from 'vitest';

// jsdom never runs animation frames to completion; render final states directly.
MotionGlobalConfig.skipAnimations = true;

// Full-route renders in jsdom can take over a second when the whole suite runs in parallel.
configure({ asyncUtilTimeout: 5000 });

// Vitest globals are off, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom has no matchMedia; the theme provider needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom lacks these browser APIs; Radix primitives (Slider, Select) expect them.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

/** A controllable EventSource: tests push live events with `FakeEventSource.emit`. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  static emit(type: string, data: unknown) {
    for (const source of FakeEventSource.instances.filter((s) => !s.closed)) {
      for (const fn of source.listeners.get(type) ?? []) {
        fn(new MessageEvent(type, { data: JSON.stringify(data) }));
      }
    }
  }
}
globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
