/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AudioTranscriptionFailureCode } from '../shared/conversation-audio-transcription.constant.js'

export type ClaimedAudioTranscription = {
  readonly id: string
  readonly companyId: string
  readonly attachmentId: string
  /** Já contada: sobe na reivindicação, para o processo morto também gastar tentativa. */
  readonly attempts: number
  readonly leaseToken: string
  readonly bucket: string
  readonly objectKey: string
  /** `missing` é o objeto sem linha em `stored_objects`: tratado como `object_missing`. */
  readonly objectStatus: string
  readonly sha256: string
  readonly mimeType: string
  readonly isCompanyEnabled: boolean
}

/** Toda escrita da linha exige o `lease_token`: zero linhas é "perdi a posse", e o resultado é descartado. */
export type AudioTranscriptionLineKey = {
  readonly id: string
  readonly leaseToken: string
}

export type MarkAudioTranscriptionReadyParams = AudioTranscriptionLineKey & {
  readonly text: string | null
  readonly language: string | null
  readonly engine: string | null
  readonly model: string | null
  readonly audioDurationMs: number | null
  readonly processingMs: number | null
}

export type MarkAudioTranscriptionFailedParams = AudioTranscriptionLineKey & {
  readonly code: AudioTranscriptionFailureCode
  readonly audioDurationMs: number | null
  readonly maxDurationMs: number | null
}

export type ScheduleAudioTranscriptionRetryParams = AudioTranscriptionLineKey & {
  readonly delayMilliseconds: number
  readonly audioDurationMs: number | null
  /** Falha de ambiente não é culpa do áudio: a tentativa volta. */
  readonly shouldGiveBackAttempt: boolean
}

export type ClaimNextAudioTranscriptionParams = {
  readonly leaseMilliseconds: number
}

export type AudioTranscriptionLineQueuePort = {
  claimNext(
    params: ClaimNextAudioTranscriptionParams,
  ): Promise<ClaimedAudioTranscription | undefined>
  /**
   * Grava o texto só se a empresa continua ligada (privacidade: desligar durante a transcrição não deixa
   * texto). `false` = perdeu a posse ou a empresa desligou; quem chamou distingue com `markFailed`.
   */
  markReady(params: MarkAudioTranscriptionReadyParams): Promise<boolean>
  markFailed(params: MarkAudioTranscriptionFailedParams): Promise<boolean>
  scheduleRetry(params: ScheduleAudioTranscriptionRetryParams): Promise<boolean>
  /** Soltura graciosa (SIGTERM): `pending`, sem posse, e a tentativa devolvida. */
  release(params: AudioTranscriptionLineKey): Promise<boolean>
}

export type DiscoverAudioTranscriptionsParams = {
  readonly recoveryWindowHours: number
}

/** Só SQL, rápido: é o que o ciclo serial do job-run faz antes de entregar ao executor. */
export type AudioTranscriptionCycleQueuePort = {
  materializeMilestone(): Promise<void>
  closeExhausted(): Promise<number>
  discoverPending(params: DiscoverAudioTranscriptionsParams): Promise<number>
  purgeDeletedText(): Promise<number>
  countClaimable(): Promise<number>
}
