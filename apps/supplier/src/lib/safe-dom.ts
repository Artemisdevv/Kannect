/**
 * Leaflet (and similar libraries) treat a plain string as HTML. Anything a shop owner typed, such
 * as a shop name, must reach the page as text, so wrap it in an element whose textContent is set:
 * the browser then never parses it as markup.
 */
export function textElement(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}
