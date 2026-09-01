/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, type ReactNode } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
const SCRIPT_ID = 'cf-turnstile-script'

type TurnstileRenderOptions = Readonly<{
  callback: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
  sitekey: string
}>

type TurnstileGlobal = Readonly<{
  remove: (widgetId: string) => void
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
}>

declare global {
  interface Window {
    turnstile?: TurnstileGlobal
  }
}

function loadTurnstileScript(): Promise<TurnstileGlobal> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }

    const existing = document.getElementById(SCRIPT_ID)
    if (existing !== null) {
      existing.addEventListener('load', () => {
        if (window.turnstile) resolve(window.turnstile)
        else reject(new Error('turnstile script loaded without exposing window.turnstile'))
      })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('turnstile script loaded without exposing window.turnstile'))
    })
    script.addEventListener('error', () => reject(new Error('failed to load turnstile script')))
    document.head.append(script)
  })
}

type TurnstileWidgetProps = Readonly<{
  onExpire?: () => void
  onVerify: (token: string) => void
  siteKey: string
}>

/**
 * Widget imperativo do Cloudflare por fora do ciclo de render do React — a API dele controla o
 * próprio DOM interno (iframe do desafio), então o React só monta o contêiner vazio e desmonta com
 * `turnstile.remove`, nunca tenta reconciliar o que está lá dentro.
 */
export function TurnstileWidget({ onExpire, onVerify, siteKey }: TurnstileWidgetProps): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  // Guarda a versão mais recente dos callbacks sem forçar o efeito a remontar o widget a cada
  // render — só `siteKey` justifica destruir e recriar o desafio do Cloudflare.
  const callbacksRef = useRef({ onExpire, onVerify })
  callbacksRef.current = { onExpire, onVerify }

  useEffect(() => {
    let widgetId: string | undefined
    let cancelled = false

    void loadTurnstileScript().then((turnstile) => {
      if (cancelled || containerRef.current === null) return
      widgetId = turnstile.render(containerRef.current, {
        callback: (token) => callbacksRef.current.onVerify(token),
        'error-callback': () => callbacksRef.current.onExpire?.(),
        'expired-callback': () => callbacksRef.current.onExpire?.(),
        sitekey: siteKey,
      })
    })

    return () => {
      cancelled = true
      if (widgetId !== undefined) window.turnstile?.remove(widgetId)
    }
  }, [siteKey])

  return <div ref={containerRef} />
}
