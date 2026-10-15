/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

import {
  SMOOTH_HEIGHT_MS,
  watchSmoothHeight,
} from '@/modules/driver-trip/shared/smoothHeight.service'

const root = resolve(import.meta.dir, '../../src/modules/driver-trip')

function setup(isReducedMotion: boolean) {
  const style = { height: '', overflow: '', transition: '' }
  const log: string[] = []
  const listeners = new Map<string, () => void>()
  let outerHeight = 100
  const content = { offsetHeight: 100 }
  let notify: () => void = () => undefined
  const stop = watchSmoothHeight({
    content,
    createObserver: (onResize) => {
      notify = onResize
      return { disconnect: () => log.push('disconnect'), observe: () => log.push('observe') }
    },
    isReducedMotion,
    outer: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      getBoundingClientRect: () => ({ height: outerHeight }),
      removeEventListener: (type) => listeners.delete(type),
      style,
    },
  })
  return {
    content,
    listeners,
    log,
    notify: () => notify(),
    setOuterHeight: (value: number) => (outerHeight = value),
    stop,
    style,
  }
}

describe('a altura do cartão do comprovante muda com transição (pedido do usuário, 14/10)', () => {
  it('a altura nova anima a partir da altura de onde estava e solta ao terminar', () => {
    const view = setup(false)
    view.content.offsetHeight = 220
    view.notify()
    expect(view.style).toEqual({
      height: '220px',
      overflow: 'hidden',
      transition: `height ${SMOOTH_HEIGHT_MS}ms ease`,
    })
    view.listeners.get('transitionend')?.()
    expect(view.style).toEqual({ height: '', overflow: '', transition: '' })
  })

  it('mudança no meio da animação parte da altura que está na tela, não da antiga', () => {
    const view = setup(false)
    view.content.offsetHeight = 220
    view.notify()
    view.setOuterHeight(150)
    view.content.offsetHeight = 90
    view.notify()
    expect(view.style.height).toBe('90px')
  })

  it('sem mudança real de altura, nada é fixado', () => {
    const view = setup(false)
    view.notify()
    expect(view.style).toEqual({ height: '', overflow: '', transition: '' })
  })

  it('com movimento reduzido não anima nem observa', () => {
    const view = setup(true)
    expect(view.log).toEqual([])
    view.content.offsetHeight = 220
    view.notify()
    expect(view.style.height).toBe('')
  })

  it('ao desmontar, o observador sai e a caixa volta ao automático', () => {
    const view = setup(false)
    view.content.offsetHeight = 220
    view.notify()
    view.stop()
    expect(view.log).toContain('disconnect')
    expect(view.style).toEqual({ height: '', overflow: '', transition: '' })
    expect(view.listeners.size).toBe(0)
  })

  it('o miolo do comprovante usa a caixa que anima a altura', () => {
    const card = readFileSync(`${root}/components/DriverStopCard.component.tsx`, 'utf8')
    expect(card).toContain('<SmoothHeight className={styles.proofSection}>')
    expect(card).toContain('</SmoothHeight>')
  })
})
