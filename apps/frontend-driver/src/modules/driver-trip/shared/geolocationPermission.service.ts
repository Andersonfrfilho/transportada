/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 234 D4d: com a permissão de localização negada, entregar conta como "longe" (D4c) — o cartão da
 * parada avisa antes do "Entreguei". É só aviso: qualquer falha da Permissions API (ausente, consulta
 * que lança ou rejeita) vale "não mostra nada", e nada aqui chega a bloquear o toque.
 */
export type GeolocationPermissionStatus = Readonly<{
  addEventListener: (type: 'change', listener: () => void) => void
  removeEventListener: (type: 'change', listener: () => void) => void
  state: string
}>

export type GeolocationPermissionSource = Readonly<{
  query: (descriptor: { name: 'geolocation' }) => Promise<GeolocationPermissionStatus>
}>

/** Avisa o estado agora e a cada `change`; devolve a função que para de acompanhar e solta o ouvinte. */
export function watchGeolocationPermission(input: {
  readonly onChange: (isDenied: boolean) => void
  readonly permissions: GeolocationPermissionSource | undefined
}): () => void {
  if (input.permissions === undefined) return () => undefined

  let query: Promise<GeolocationPermissionStatus>
  try {
    query = input.permissions.query({ name: 'geolocation' })
  } catch {
    return () => undefined
  }

  let isStopped = false
  let detach: (() => void) | undefined
  query
    .then((status) => {
      if (isStopped) return
      const notify = () => input.onChange(status.state === 'denied')
      status.addEventListener('change', notify)
      detach = () => status.removeEventListener('change', notify)
      notify()
    })
    .catch(() => undefined)

  return () => {
    isStopped = true
    detach?.()
    detach = undefined
  }
}
