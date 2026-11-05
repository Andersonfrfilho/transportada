/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateAttachmentEnvelopeV1 } from '../../messaging/aggregate-attachment-envelope.schema.js'
import type {
  AttachmentExtractionPort,
  AttachmentObjectReaderPort,
  AttachmentWriteBackPort,
} from './extract-attachment-fields.port.js'

export type ExtractAttachmentFieldsDependencies = Readonly<{
  /** Onde a leitura do anexo da ficha do motorista é gravada; sem ele, a mensagem volta para retry. */
  driverWriteBack?: AttachmentWriteBackPort
  extraction: AttachmentExtractionPort
  reader: AttachmentObjectReaderPort
  writeBack: AttachmentWriteBackPort
}>

/**
 * `extracted` fecha o ciclo com o que foi lido — inclusive `null`, que é resultado legítimo: o
 * documento não era CCMEI, ou era e nenhum rótulo bateu. `object_missing` e falha de parse são
 * defeito nosso e voltam para retry.
 */
export type ExtractAttachmentFieldsOutcome = 'extracted' | 'object_missing'

/**
 * A idempotência é a própria escrita: gravar `extracted_fields` duas vezes com o mesmo arquivo
 * converge no mesmo valor. Reentrega depois de o operador já ter revisado o anexo não é problema —
 * a revisão mora em `status`/`reviewed_by`, colunas que este caminho não toca.
 */
export async function extractAttachmentFields(
  envelope: AggregateAttachmentEnvelopeV1,
  dependencies: ExtractAttachmentFieldsDependencies,
): Promise<ExtractAttachmentFieldsOutcome> {
  const { attachmentId, bucket, objectKey, type } = envelope.payload

  const bytes = await dependencies.reader.read({ bucket, key: objectKey })
  if (bytes === undefined) return 'object_missing'

  const extractedFields = await dependencies.extraction.extract({ bytes, type })

  await resolveWriteBack(envelope, dependencies).saveExtractedFields({
    attachmentId,
    companyId: envelope.companyId,
    extractedFields,
  })

  return 'extracted'
}

function resolveWriteBack(
  envelope: AggregateAttachmentEnvelopeV1,
  dependencies: ExtractAttachmentFieldsDependencies,
): AttachmentWriteBackPort {
  if (envelope.payload.subject !== 'fleet_driver') return dependencies.writeBack
  // Gravar a leitura do motorista na tabela da candidatura seria escrever em linha de outra pessoa.
  if (dependencies.driverWriteBack === undefined) {
    throw new Error('fleet driver attachment write-back is not configured')
  }
  return dependencies.driverWriteBack
}
