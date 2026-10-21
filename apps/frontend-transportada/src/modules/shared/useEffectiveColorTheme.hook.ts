/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import type { ColorTheme } from './colorTheme.constant'

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'

function readDocumentColorTheme(): ColorTheme {
  if (typeof document === 'undefined') return 'dark'
  const chosen = document.documentElement.dataset.theme
  if (chosen === 'light' || chosen === 'dark') return chosen
  return window.matchMedia(LIGHT_SCHEME_QUERY).matches ? 'light' : 'dark'
}

/**
 * O tema que a tela está mostrando agora, lido do documento: o atributo `data-theme` (escolha do botão) e, sem ele, o
 * sistema operacional. Fica de fora de `useColorTheme` de propósito — aquele é o dono do botão, este só observa, e
 * qualquer componente pode usá-lo sem uma segunda fonte de verdade.
 */
export function useEffectiveColorTheme(): ColorTheme {
  const [theme, setTheme] = useState<ColorTheme>(readDocumentColorTheme)

  useEffect(() => {
    const update = (): void => setTheme(readDocumentColorTheme())
    const media = window.matchMedia(LIGHT_SCHEME_QUERY)
    const observer = new MutationObserver(update)

    observer.observe(document.documentElement, {
      attributeFilter: ['data-theme'],
      attributes: true,
    })
    media.addEventListener('change', update)
    update()

    return () => {
      observer.disconnect()
      media.removeEventListener('change', update)
    }
  }, [])

  return theme
}
