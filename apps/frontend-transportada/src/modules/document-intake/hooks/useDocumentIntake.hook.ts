/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { loadPdfGetDocument } from '../shared/pdfjsLoader.service'
import {
  readVehicleDocument,
  toDocumentBytes,
  type DocumentIntakeResult,
} from '../shared/documentIntake.service'

/**
 * Spec 048, P1: soltar o arquivo é evento, não carregamento — nada de `useEffect` aqui. O que o
 * estado guarda é o resultado da leitura, e o erro de leitura é estado também: PDF corrompido não
 * pode derrubar o formulário de veículo inteiro.
 */
export type DocumentIntakeStatus = 'failed' | 'idle' | 'ready' | 'reading'

export type DocumentIntakeController = Readonly<{
  read: (file: Blob) => Promise<void>
  reset: () => void
  result: DocumentIntakeResult | null
  status: DocumentIntakeStatus
}>

export function useDocumentIntake(
  onApply: (result: DocumentIntakeResult) => void,
): DocumentIntakeController {
  const [status, setStatus] = useState<DocumentIntakeStatus>('idle')
  const [result, setResult] = useState<DocumentIntakeResult | null>(null)

  async function read(file: Blob): Promise<void> {
    setStatus('reading')
    setResult(null)
    try {
      const getDocument = await loadPdfGetDocument()
      const reading = await readVehicleDocument({
        data: await toDocumentBytes(file),
        getDocument,
      })
      setResult(reading)
      setStatus('ready')
      if (reading.kind === 'crlv') onApply(reading)
    } catch {
      // O erro não é registrado: a mensagem do pdf.js carrega trecho do arquivo, e o arquivo é PII.
      setStatus('failed')
    }
  }

  function reset(): void {
    setResult(null)
    setStatus('idle')
  }

  return { read, reset, result, status }
}
