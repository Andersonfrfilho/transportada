/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O DOM de teste devolve retângulos zerados, e o `Select`/`MultiSelect` fecha na hora uma camada cujo gatilho
 * "está fora da janela" (`useFloatingLayer`): sem este remendo a lista só abre quando outra suíte já o
 * instalou, e o contrato passaria a depender da ordem. Devolve a função que o desfaz.
 */
export function stubVisibleLayout(): () => void {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
  const visibleRect: DOMRect = {
    bottom: 130,
    height: 30,
    left: 100,
    right: 300,
    toJSON: () => ({}),
    top: 100,
    width: 200,
    x: 100,
    y: 100,
  }
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => visibleRect,
    writable: true,
  })
  return () => {
    if (original !== undefined) {
      Object.defineProperty(Element.prototype, 'getBoundingClientRect', original)
    }
  }
}
