/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import { resolveLineOutcome } from './audio-transcription-line.outcome.js'
import { persistLineOutcome } from './audio-transcription-line.persistence.js'
import type { LogLineParams, ProcessLineParams } from './audio-transcription-line.types.js'
import { AUDIO_TRANSCRIPTION_LOG_MESSAGE } from './audio-transcription-runtime.constant.js'
import {
  AUDIO_TRANSCRIPTION_LINE_STATE,
  type AudioTranscriptionLineResult,
} from './audio-transcription-summary.js'

export type { AudioTranscriptionLineDependencies } from './audio-transcription-line.types.js'

/** Só ids, estado, código e tentativa: nunca o texto transcrito, o nome do arquivo ou a mensagem do motor. */
function logLine({ dependencies, line, result }: LogLineParams): void {
  const isAlert =
    result.state === AUDIO_TRANSCRIPTION_LINE_STATE.FAILED ||
    result.state === AUDIO_TRANSCRIPTION_LINE_STATE.INFRASTRUCTURE
  const log = isAlert ? safeLogError : safeLogInfo
  log({
    logger: dependencies.logger,
    message: isAlert
      ? AUDIO_TRANSCRIPTION_LOG_MESSAGE.LINE_FAILED
      : AUDIO_TRANSCRIPTION_LOG_MESSAGE.LINE_FINISHED,
    metadata: {
      attachmentId: line.attachmentId,
      attempts: line.attempts,
      code: result.code,
      companyId: line.companyId,
      state: result.state,
      transcriptionId: line.id,
    },
  })
}

/**
 * Uma linha reivindicada, do download à escrita. Devolve o que ela virou; `ownership_lost` é a escrita
 * que não achou o `lease_token` (outra execução ficou com a posse) e `released` é o desligamento.
 */
export async function processAudioTranscriptionLine(
  params: ProcessLineParams,
): Promise<AudioTranscriptionLineResult> {
  const { dependencies, line, signal } = params
  const outcome = await resolveLineOutcome(params)
  if (signal.aborted) return { state: AUDIO_TRANSCRIPTION_LINE_STATE.RELEASED }

  const result = await persistLineOutcome({ ...params, outcome })
  if (result === undefined) {
    safeLogInfo({
      logger: dependencies.logger,
      message: AUDIO_TRANSCRIPTION_LOG_MESSAGE.LINE_OWNERSHIP_LOST,
      metadata: { companyId: line.companyId, transcriptionId: line.id },
    })
    return { state: AUDIO_TRANSCRIPTION_LINE_STATE.OWNERSHIP_LOST }
  }
  logLine({ dependencies, line, result })
  return result
}
