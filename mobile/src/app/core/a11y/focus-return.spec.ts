import { rememberFocus } from './focus-return';

describe('rememberFocus', () => {
  afterEach(() => document.body.replaceChildren());

  it('gives the focus back to what had it', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    const other = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const restore = rememberFocus();
    other.focus();
    restore();
    expect(document.activeElement).toBe(opener);
  });

  it('does nothing when that element is gone', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    const other = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const restore = rememberFocus();
    other.focus();
    opener.remove();
    restore();
    expect(document.activeElement).toBe(other);
  });
});
