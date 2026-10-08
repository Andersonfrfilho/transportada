/* Copyright (c) 2026 Ada Technology. MIT License. */

export type DiagnosticEventKind = 'send_failed' | 'step_timing'

export type DiagnosticFailureKind = 'http_status' | 'identity' | 'network' | 'timeout'

/** Lista fechada (spec 254 RF4): nada de texto livre, URL, coordenada nem observação. */
export type DiagnosticInput = Readonly<{
  attachmentKey?: string | undefined
  attempt?: number | undefined
  durationMs?: number | undefined
  eventKind: DiagnosticEventKind
  failureKind?: DiagnosticFailureKind | undefined
  httpStatus?: number | undefined
  idempotencyKey?: string | undefined
  photoBytes?: number | undefined
  reportKind?: string | undefined
  step: string
}>

export type DiagnosticEvent = DiagnosticInput & Readonly<{ occurredAt: string }>

export type DeviceProfile = Readonly<{
  appVersion?: string
  deviceMemoryGb?: number
  effectiveType?: string
  hardwareConcurrency?: number
  isStandalone?: boolean
  saveData?: boolean
}>

export type DiagnosticsBatch = Readonly<{
  device?: DeviceProfile | undefined
  events: readonly DiagnosticEvent[]
}>

export type DiagnosticsSendResult = Readonly<{ status: number }>
