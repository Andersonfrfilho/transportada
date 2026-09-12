import { useEffect, useState } from 'react'

type UseSlowLoadNoticeInput = Readonly<{
  delayMs: number
  isPending: boolean
}>

/**
 * Viagem grande demora a montar o mapa de carga — GET /trips/:id medido em 13-15 s. Sem aviso, a
 * tela em carregamento e a tela travada parecem a mesma coisa; este relógio liga o aviso só depois
 * do prazo, para não acender em toda consulta rápida.
 */
export function useSlowLoadNotice({ delayMs, isPending }: UseSlowLoadNoticeInput): boolean {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    if (!isPending) {
      setIsSlow(false)
      return
    }
    const timer = setTimeout(() => setIsSlow(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, isPending])

  return isSlow
}
