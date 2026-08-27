/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  readCompanyDocument,
  toDocumentBytes,
  type CompanyDocumentReading,
} from '../shared/documentIntake.service'
import { loadPdfGetDocument } from '../shared/pdfjsLoader.service'

/**
 * Anexar é evento, não carregamento — nada de `useEffect` aqui. Erro de leitura é estado: PDF
 * corrompido não pode derrubar o cadastro inteiro, porque o arquivo ainda vai ser anexado e o
 * operador ainda vai revisá-lo. A leitura é conveniência, nunca porta de entrada.
 */
export type CompanyDocumentStatus = 'failed' | 'idle' | 'ready' | 'reading'

export type CompanyDocumentIntake = Readonly<{
  read: (file: Blob) => Promise<void>
  reading: CompanyDocumentReading | null
  reset: () => void
  status: CompanyDocumentStatus
}>

export function useCompanyDocumentIntake(
  onApply: (reading: CompanyDocumentReading) => void,
): CompanyDocumentIntake {
  const [status, setStatus] = useState<CompanyDocumentStatus>('idle')
  const [reading, setReading] = useState<CompanyDocumentReading | null>(null)

  async function read(file: Blob): Promise<void> {
    setStatus('reading')
    setReading(null)
    try {
      const getDocument = await loadPdfGetDocument()
      const result = await readCompanyDocument({
        data: await toDocumentBytes(file),
        getDocument,
      })
      setReading(result)
      setStatus('ready')
      if (result.kind === 'ccmei') onApply(result)
    } catch {
      setStatus('failed')
    }
  }

  function reset(): void {
    setReading(null)
    setStatus('idle')
  }

  return { read, reading, reset, status }
}
