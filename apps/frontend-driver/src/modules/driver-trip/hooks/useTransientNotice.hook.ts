/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

const TRANSIENT_NOTICE_DURATION_MS = 4000

export type TransientNotice = Readonly<{ id: string; message: string }>

export type TransientNoticeController = Readonly<{
  announce: (id: string, message: string) => void
  notice: TransientNotice | undefined
}>

/**
 * O aviso que confirma o toque ("Ocorrência registrada", "Entrega registrada") e some sozinho — a
 * linha persistente ao lado dele é o que fica. O temporizador vive aqui, com limpeza no `useEffect`:
 * trocar de aviso antes do prazo cancela o anterior, e desmontar não deixa `setState` órfão.
 */
export function useTransientNotice(): TransientNoticeController {
  const [notice, setNotice] = useState<TransientNotice | undefined>(undefined)

  useEffect(() => {
    if (notice === undefined) return undefined
    const timer = window.setTimeout(() => setNotice(undefined), TRANSIENT_NOTICE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  return {
    announce: (id, message) => setNotice({ id, message }),
    notice,
  }
}
