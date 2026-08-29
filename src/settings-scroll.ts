export interface ScrollPositionSnapshot {
  element: HTMLElement;
  top: number;
}

export function captureScrollPosition(container: HTMLElement): ScrollPositionSnapshot | null {
  const element = container.closest<HTMLElement>(".vertical-tab-content");
  return element ? { element, top: element.scrollTop } : null;
}

export function restoreScrollPosition(snapshot: ScrollPositionSnapshot | null): void {
  if (snapshot) snapshot.element.scrollTop = snapshot.top;
}
