/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Duração curta: acompanha o conteúdo sem fazer o motorista esperar para tocar no próximo botão. */
export const SMOOTH_HEIGHT_MS = 220

type HeightBox = Readonly<{
  addEventListener: (type: 'transitionend', listener: () => void) => void
  getBoundingClientRect: () => { height: number }
  removeEventListener: (type: 'transitionend', listener: () => void) => void
  style: { height: string; overflow: string; transition: string }
}>

type ContentBox = Readonly<{ offsetHeight: number }>

type Observer<T> = Readonly<{ disconnect: () => void; observe: (target: T) => void }>

/**
 * Pedido do usuário (14/10): anexar e confirmar a foto muda a altura do cartão — a mudança é uma
 * transição de altura, não um salto. A caixa de fora fixa a altura de onde estava, anima até a nova e
 * solta (`height` volta a automático, sem cortar sombra nem anel de foco depois). Sem animação quando o
 * aparelho pede para reduzir movimento.
 */
export function watchSmoothHeight<T extends ContentBox>(input: {
  readonly content: T
  readonly createObserver: (onResize: () => void) => Observer<T>
  readonly isReducedMotion: boolean
  readonly outer: HeightBox
}): () => void {
  const { content, createObserver, isReducedMotion, outer } = input
  if (isReducedMotion) return () => undefined
  let previous = content.offsetHeight

  function release(): void {
    outer.style.height = ''
    outer.style.overflow = ''
    outer.style.transition = ''
  }

  const observer = createObserver(() => {
    const next = content.offsetHeight
    if (next === previous) return
    const from = outer.getBoundingClientRect().height
    previous = next
    outer.style.overflow = 'hidden'
    outer.style.transition = 'none'
    outer.style.height = `${from}px`
    // Força a medida antes de ligar a transição, senão o navegador pula direto para o valor final.
    void outer.getBoundingClientRect()
    outer.style.transition = `height ${SMOOTH_HEIGHT_MS}ms ease`
    outer.style.height = `${next}px`
  })
  observer.observe(content)
  outer.addEventListener('transitionend', release)
  return () => {
    observer.disconnect()
    outer.removeEventListener('transitionend', release)
    release()
  }
}
