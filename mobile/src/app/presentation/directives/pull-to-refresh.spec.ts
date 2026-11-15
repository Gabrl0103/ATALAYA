import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Haptic } from '../../core/haptics';
import { PULL_MAX, PULL_THRESHOLD, PullToRefresh, pullDistance } from './pull-to-refresh';

@Component({
  imports: [PullToRefresh],
  template: `<div class="scroll" appPullToRefresh (pullRefresh)="refreshes = refreshes + 1"></div>`,
})
class Host {
  refreshes = 0;
}

const touch = (type: string, clientY?: number): TouchEvent => {
  const event = new Event(type, { bubbles: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: clientY === undefined ? [] : [{ clientY }] });
  return event;
};

function render() {
  vi.spyOn(TestBed.inject(Haptic), 'tap').mockImplementation(() => undefined);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const scroll = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.scroll')!;
  const drag = (to: number) => {
    scroll.dispatchEvent(touch('touchstart', 100));
    scroll.dispatchEvent(touch('touchmove', 100 + to));
    fixture.detectChanges();
  };
  return { fixture, scroll, drag };
}

describe('pullDistance', () => {
  it('follows half the finger, never upwards and up to a ceiling', () => {
    expect(pullDistance(-30)).toBe(0);
    expect(pullDistance(60)).toBe(30);
    expect(pullDistance(1000)).toBe(PULL_MAX);
  });
});

describe('PullToRefresh', () => {
  it('asks again when pulled past the threshold from the top, and shows the pull meanwhile', () => {
    const { fixture, scroll, drag } = render();
    drag(PULL_THRESHOLD * 2);
    expect(scroll.classList).toContain('is-armed');
    expect(scroll.style.getPropertyValue('--pull')).toBe(`${PULL_THRESHOLD}px`);
    scroll.dispatchEvent(touch('touchend'));
    fixture.detectChanges();
    expect(fixture.componentInstance.refreshes).toBe(1);
    expect(scroll.classList).not.toContain('is-pulling');
  });

  it('does nothing for a short pull', () => {
    const { fixture, scroll, drag } = render();
    drag(PULL_THRESHOLD);
    expect(scroll.classList).toContain('is-pulling');
    expect(scroll.classList).not.toContain('is-armed');
    scroll.dispatchEvent(touch('touchend'));
    expect(fixture.componentInstance.refreshes).toBe(0);
  });

  it('leaves the screen to scroll when the pull starts below the top', () => {
    const { fixture, scroll, drag } = render();
    scroll.scrollTop = 0;
    Object.defineProperty(scroll, 'scrollTop', { value: 120 });
    drag(PULL_THRESHOLD * 2);
    scroll.dispatchEvent(touch('touchend'));
    expect(scroll.classList).not.toContain('is-pulling');
    expect(fixture.componentInstance.refreshes).toBe(0);
  });
});
