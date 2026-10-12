/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TranscriptionFailureCode } from '../domain/conversation-audio-transcription.constant.js'

export type ClaimedTranscription = Readonly<{
  attachmentId: string
  attempts: number
  bucket: string
  companyId: string
  contentType: string
  conversationId: string
  /** `occurrence_conversation_attachments.duration_ms`, quando o app informou. */
  declaredDurationMs: number | null
  id: string
  leaseToken: string
  objectDeleted: boolean
  objectKey: string
  sha256: string
}>

type LeaseKey = Readonly<{ id: string; leaseToken: string }>

export type DiscoveryParams = Readonly<{ recoveryWindowHours: number }>

export type DiscoveryResult = Readonly<{ created: number }>

export type ClaimParams = Readonly<{ leaseMs: number }>

export type WriteReadyParams = LeaseKey &
  Readonly<{
    durationMs: number
    engine: string
    language: string
    model: string | null
    processingMs: number
    text: string
  }>

export type WriteFailedParams = LeaseKey &
  Readonly<{ durationMs?: number; failureCode: TranscriptionFailureCode; maxDurationMs?: number }>

export type ScheduleRetryParams = LeaseKey & Readonly<{ backoffMinutes: number }>

/**
 * Toda escrita por linha leva o `lease_token` e devolve `false` quando a posse foi perdida: quem
 * perdeu descarta o resultado, porque a linha já é de outra execução (contract §5.6 passo 5).
 */
export type AudioTranscriptionQueuePort = {
  /** Passo 1: empresas sem linha de configuração e `routine_started_at` ainda nulo. */
  materializeMarker(): Promise<void>
  /** Passo 2: `attempts >= 3` com lease vencido fecha como `attempts_exhausted`. */
  sweepExhausted(): Promise<number>
  /** Passo 3: cria `pending` para o anexo de áudio sem linha, depois do marco e dentro da janela. */
  discoverPending(params: DiscoveryParams): Promise<DiscoveryResult>
  countClaimable(): Promise<number>
  /** Passo 4: uma linha por vez, `FOR UPDATE SKIP LOCKED`, `attempts + 1` na reivindicação. */
  claimNext(params: ClaimParams): Promise<ClaimedTranscription | undefined>
  isCompanyEnabled(companyId: string): Promise<boolean>
  writeReady(params: WriteReadyParams): Promise<boolean>
  writeFailed(params: WriteFailedParams): Promise<boolean>
  scheduleRetry(params: ScheduleRetryParams): Promise<boolean>
  writePurged(params: LeaseKey): Promise<boolean>
  /** Soltura graciosa: devolve a tentativa (contract §5.8). */
  release(params: LeaseKey): Promise<boolean>
  /** Passo 7: `ready` cujo objeto foi apagado perde o texto. */
  purgeDeletedObjects(): Promise<number>
}
