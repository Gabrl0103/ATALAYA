/**
 * Remembers what had the focus (the marker, card or button that opened a sheet or a picker) and gives
 * it back when called, so TalkBack and a keyboard go on from where the person was. Nothing to give back
 * when the focus was nowhere in particular (the page itself) or that element is gone.
 */
export function rememberFocus(doc: Document = document): () => void {
  const previous = doc.activeElement;
  return () => {
    if (previous instanceof HTMLElement && previous !== doc.body && previous.isConnected) {
      previous.focus({ preventScroll: true });
    }
  };
}
