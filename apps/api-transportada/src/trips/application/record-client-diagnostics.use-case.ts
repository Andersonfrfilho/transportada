/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  DRIVER_CLIENT_DIAGNOSTIC_LOG_MESSAGE,
  type DiagnosticEffectiveType,
  type DiagnosticEventKind,
  type DiagnosticFailureKind,
  type DiagnosticStep,
} from '../domain/trip-client-diagnostics.constant.js'

export type ClientDiagnosticDevice = {
  readonly appVersion?: string | undefined
  readonly deviceMemoryGb?: number | undefined
  readonly effectiveType?: DiagnosticEffectiveType | undefined
  readonly hardwareConcurrency?: number | undefined
  readonly isStandalone?: boolean | undefined
  readonly saveData?: boolean | undefined
}

export type ClientDiagnosticEvent = {
  readonly attachmentKey?: string | undefined
  readonly attempt?: number | undefined
  readonly durationMs?: number | undefined
  readonly eventKind: DiagnosticEventKind
  readonly failureKind?: DiagnosticFailureKind | undefined
  readonly httpStatus?: number | undefined
  readonly idempotencyKey?: string | undefined
  readonly occurredAt: string
  readonly photoBytes?: number | undefined
  readonly reportKind?: string | undefined
  readonly step: DiagnosticStep
}

export type RecordClientDiagnosticsParams = {
  readonly companyId: string
  readonly device?: ClientDiagnosticDevice | undefined
  readonly events: readonly ClientDiagnosticEvent[]
  readonly membershipId: string
}

export type RecordClientDiagnosticsUseCase = {
  execute(params: RecordClientDiagnosticsParams): void
}

type Dependencies = { readonly logger: ApiLogger }

function omitUndefined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

function pickDevice(device: ClientDiagnosticDevice | undefined): Record<string, unknown> {
  if (device === undefined) return {}

  return {
    device: omitUndefined({
      appVersion: device.appVersion,
      deviceMemoryGb: device.deviceMemoryGb,
      effectiveType: device.effectiveType,
      hardwareConcurrency: device.hardwareConcurrency,
      isStandalone: device.isStandalone,
      saveData: device.saveData,
    }),
  }
}

export function createRecordClientDiagnosticsUseCase({
  logger,
}: Dependencies): RecordClientDiagnosticsUseCase {
  return {
    execute({ companyId, device, events, membershipId }): void {
      const deviceMetadata = pickDevice(device)

      for (const event of events) {
        safeLogInfo({
          logger,
          message: DRIVER_CLIENT_DIAGNOSTIC_LOG_MESSAGE,
          metadata: {
            ...omitUndefined({
              attachmentKey: event.attachmentKey,
              attempt: event.attempt,
              durationMs: event.durationMs,
              failureKind: event.failureKind,
              httpStatus: event.httpStatus,
              idempotencyKey: event.idempotencyKey,
              occurredAt: event.occurredAt,
              photoBytes: event.photoBytes,
              reportKind: event.reportKind,
            }),
            companyId,
            eventKind: event.eventKind,
            membershipId,
            step: event.step,
            ...deviceMetadata,
          },
        })
      }
    },
  }
}
