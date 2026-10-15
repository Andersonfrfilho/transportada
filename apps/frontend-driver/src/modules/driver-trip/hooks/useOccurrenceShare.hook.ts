/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { DriverFileShareOutcome } from '../shared/driverFileShare.service'

export type OccurrenceShareNotice = 'downloaded' | 'failed' | 'unavailable'

export type OccurrenceShareController = Readonly<{
  notice: OccurrenceShareNotice | undefined
  /** A chave de quem está compartilhando agora: segura o botão enquanto o arquivo vem. */
  pendingKey: string | undefined
  share: (input: {
    readonly key: string
    readonly run: () => Promise<DriverFileShareOutcome | 'unavailable'>
  }) => Promise<void>
}>

/** Spec 266 RF6: o estado do compartilhar — o que está em curso e o aviso do último resultado (cancelar não avisa). */
export function useOccurrenceShare(): OccurrenceShareController {
  const [pendingKey, setPendingKey] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<OccurrenceShareNotice | undefined>(undefined)

  async function share(input: {
    readonly key: string
    readonly run: () => Promise<DriverFileShareOutcome | 'unavailable'>
  }): Promise<void> {
    setNotice(undefined)
    setPendingKey(input.key)
    try {
      const outcome = await input.run()
      setNotice(outcome === 'downloaded' || outcome === 'unavailable' ? outcome : undefined)
    } catch {
      setNotice('failed')
    } finally {
      setPendingKey(undefined)
    }
  }

  return { notice, pendingKey, share }
}
