/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.2): etapa SEPARADA, depois de `signConversationAttachments`, que acrescenta
 * `durationMs` e `transcription` ao anexo de áudio das rotas por assunto. Nunca dentro de
 * `signConversationAttachments` nem de `readConversationAttachments`: o app antigo e o portal não ganham os campos;
 * a leitura do escritório na ocorrência chama esta etapa desde 21/10/2026 (o chat do painel é o SDK). Consultas por página: nenhuma sem áudio; com áudio, 1 (configuração) e, só se ligada, 1 (linhas).
 */
import {
  resolveAudioDurationMs,
  toParticipantTranscription,
} from '../domain/participant-transcription.mapper.js'
import type {
  ConversationAttachmentRecord,
  ConversationAttachmentView,
} from './conversation-attachment.port.js'
import type {
  AudioTranscriptionRecord,
  ConversationTranscriptionReadPort,
  SubjectAttachmentView,
} from './conversation-transcription.port.js'

const AUDIO_CONTENT_TYPE_PREFIX = 'audio/'

export type EnrichAudioAttachmentsParams = {
  readonly companyId: string
  readonly reader: Pick<
    ConversationTranscriptionReadPort,
    'findTranscriptionsByAttachmentIds' | 'readAudioTranscriptionEnabled'
  >
  readonly records: readonly ConversationAttachmentRecord[]
  readonly views: ReadonlyMap<string, readonly ConversationAttachmentView[]>
}

function isAudioRecord(record: ConversationAttachmentRecord): boolean {
  return record.contentType.startsWith(AUDIO_CONTENT_TYPE_PREFIX)
}

async function readTranscriptionState(
  params: EnrichAudioAttachmentsParams,
  audioIds: readonly string[],
): Promise<{
  readonly isEnabled: boolean
  readonly rows: ReadonlyMap<string, AudioTranscriptionRecord>
}> {
  const isEnabled = await params.reader.readAudioTranscriptionEnabled({
    companyId: params.companyId,
  })
  if (!isEnabled) return { isEnabled, rows: new Map() }
  const rows = await params.reader.findTranscriptionsByAttachmentIds({
    attachmentIds: audioIds,
    companyId: params.companyId,
  })
  return { isEnabled, rows }
}

export async function enrichAudioAttachments(
  params: EnrichAudioAttachmentsParams,
): Promise<ReadonlyMap<string, readonly SubjectAttachmentView[]>> {
  const audioRecords = new Map(
    params.records.filter(isAudioRecord).map((record) => [record.id, record]),
  )
  if (audioRecords.size === 0) return params.views
  const state = await readTranscriptionState(params, [...audioRecords.keys()])
  const enriched = new Map<string, readonly SubjectAttachmentView[]>()
  for (const [messageId, views] of params.views) {
    enriched.set(
      messageId,
      views.map((view): SubjectAttachmentView => {
        const record = audioRecords.get(view.id)
        if (record === undefined) return view
        const row = state.rows.get(view.id)
        const durationMs = resolveAudioDurationMs({
          attachmentDurationMs: record.durationMs,
          transcriptionDurationMs: row?.audioDurationMs,
        })
        const transcription = toParticipantTranscription({ isEnabled: state.isEnabled, row })
        return {
          ...view,
          ...(durationMs === undefined ? {} : { durationMs }),
          ...(transcription === undefined ? {} : { transcription }),
        }
      }),
    )
  }
  return enriched
}
