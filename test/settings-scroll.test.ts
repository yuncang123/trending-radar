import assert from "node:assert/strict";
import test from "node:test";
import { captureScrollPosition, restoreScrollPosition } from "../src/settings-scroll.js";

test("settings scroll snapshot restores position after a redraw resets scrollTop", () => {
  const scrollPanel = { scrollTop: 347 } as unknown as HTMLElement;
  const container = { closest: () => scrollPanel } as unknown as HTMLElement;
  const snapshot = captureScrollPosition(container);
  scrollPanel.scrollTop = 0;
  restoreScrollPosition(snapshot);
  assert.equal(scrollPanel.scrollTop, 347);
});

test("settings scroll helpers safely skip when no scroll container exists", () => {
  const container = { closest: () => null } as unknown as HTMLElement;
  const snapshot = captureScrollPosition(container);
  assert.equal(snapshot, null);
  restoreScrollPosition(snapshot);
});
