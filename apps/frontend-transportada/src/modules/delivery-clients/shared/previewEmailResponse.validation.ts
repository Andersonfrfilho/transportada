/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { CONTRACTOR_DIRECTORY_ERROR } from './contractorDirectory.types'
import { ContractorDirectoryRequestError } from './contractorDirectoryRequest.service'
import {
  GENERATED_ADDRESS_KEYS,
  PREVIEW_EMAIL_INTAKE_KEYS,
  PREVIEW_EMAIL_SETTINGS_KEYS,
  type GeneratedInboundAddress,
  type PreviewEmailIntake,
  type PreviewEmailSettings,
} from './previewEmail.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §8): a guarda recusa a resposta inteira, com erro
 * explícito — chave a mais (o hash, um endereço) ou a menos nunca chega à tela.
 */
function invalidResponse(): ContractorDirectoryRequestError {
  return new ContractorDirectoryRequestError(CONTRACTOR_DIRECTORY_ERROR.RESPONSE_INVALID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isSettings(value: unknown): value is PreviewEmailSettings {
  if (!hasExactKeys(value, PREVIEW_EMAIL_SETTINGS_KEYS)) return false
  return (
    typeof value.contractorId === 'string' &&
    isTextList(value.forwarderAllowlist) &&
    typeof value.hasInboundToken === 'boolean' &&
    isNullableText(value.inboundTokenSetAt) &&
    isTextList(value.senderAllowlist)
  )
}

function isIntake(value: unknown): value is PreviewEmailIntake {
  if (!hasExactKeys(value, PREVIEW_EMAIL_INTAKE_KEYS)) return false
  return (
    typeof value.outcome === 'string' &&
    isNullableText(value.previewId) &&
    isNullableText(value.reasonCode) &&
    typeof value.receivedAt === 'string'
  )
}

function isGeneratedAddress(value: unknown): value is GeneratedInboundAddress {
  return (
    hasExactKeys(value, GENERATED_ADDRESS_KEYS) &&
    typeof value.address === 'string' &&
    typeof value.token === 'string'
  )
}

export function toPreviewEmailSettings(payload: unknown): PreviewEmailSettings {
  if (!isRecord(payload) || !isSettings(payload.data)) throw invalidResponse()
  return payload.data
}

export function toPreviewEmailIntakes(payload: unknown): readonly PreviewEmailIntake[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw invalidResponse()
  if (!payload.data.every(isIntake)) throw invalidResponse()
  return payload.data
}

export function toGeneratedInboundAddress(payload: unknown): GeneratedInboundAddress {
  if (!isRecord(payload) || !isGeneratedAddress(payload.data)) throw invalidResponse()
  return payload.data
}
