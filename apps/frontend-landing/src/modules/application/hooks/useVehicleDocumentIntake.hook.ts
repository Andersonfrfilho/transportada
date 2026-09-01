import { useState } from 'react'

import {
  readVehicleDocument,
  toDocumentBytes,
  type VehicleDocumentReading,
} from '../shared/documentIntake.service'
import { loadPdfGetDocument } from '../shared/pdfjsLoader.service'

/**
 * O gêmeo de `useCompanyDocumentIntake`, para o CRLV. Anexar é evento, não carregamento — nada de
 * `useEffect`. Erro de leitura é estado: PDF corrompido não derruba o cadastro, porque o arquivo
 * ainda vai ser anexado e o operador ainda vai revisá-lo. A leitura é conveniência, nunca porta de
 * entrada.
 *
 * `onApply` só é chamado quando o documento **é** um CRLV: documento de outro tipo não preenche
 * campo nenhum, mesmo trazendo dado legível.
 */
export type VehicleDocumentStatus = 'failed' | 'idle' | 'ready' | 'reading'

export type VehicleDocumentIntake = Readonly<{
  read: (file: Blob) => Promise<void>
  reading: VehicleDocumentReading | null
  reset: () => void
  status: VehicleDocumentStatus
}>

export function useVehicleDocumentIntake(
  onApply: (reading: VehicleDocumentReading) => void,
): VehicleDocumentIntake {
  const [status, setStatus] = useState<VehicleDocumentStatus>('idle')
  const [reading, setReading] = useState<VehicleDocumentReading | null>(null)

  async function read(file: Blob): Promise<void> {
    setStatus('reading')
    setReading(null)
    try {
      const getDocument = await loadPdfGetDocument()
      const result = await readVehicleDocument({ data: await toDocumentBytes(file), getDocument })
      setReading(result)
      setStatus('ready')
      if (result.kind === 'crlv') onApply(result)
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
