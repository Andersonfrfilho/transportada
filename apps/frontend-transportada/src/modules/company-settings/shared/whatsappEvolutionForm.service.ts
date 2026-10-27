/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  WHATSAPP_EVOLUTION_DAILY_CAP_RANGE,
  WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE,
  type WhatsAppDefaultProvider,
  type WhatsAppEvolutionSaveInput,
  type WhatsAppEvolutionSettings,
} from './whatsappEvolution.validation'

const INSTANCE_NAME = /^[A-Za-z0-9_-]{1,64}$/u

export type WhatsAppEvolutionDraft = Readonly<{
  acknowledgeRisk: boolean
  apiKey: string
  baseUrl: string
  dailyCap: string
  defaultProvider: WhatsAppDefaultProvider
  enabled: boolean
  instanceName: string
  minIntervalSeconds: string
}>

/** Padrões do dono (spec 281 R2): teto baixo e intervalo longo, para o número novo não ser banido. */
export const WHATSAPP_EVOLUTION_DEFAULT_DRAFT: WhatsAppEvolutionDraft = {
  acknowledgeRisk: false,
  apiKey: '',
  baseUrl: '',
  dailyCap: '50',
  /** O e-mail e a Meta seguem como estão até o dono escolher o Evolution (spec 281 R1). */
  defaultProvider: 'meta',
  enabled: false,
  instanceName: '',
  minIntervalSeconds: '15',
}

/** O gravado abre o rascunho; a chave nunca volta, então o campo abre vazio e vazio significa "manter". */
export function startWhatsAppEvolutionDraft(
  stored: WhatsAppEvolutionSettings | null | undefined,
): WhatsAppEvolutionDraft {
  if (stored === null || stored === undefined) return WHATSAPP_EVOLUTION_DEFAULT_DRAFT

  return {
    acknowledgeRisk: stored.riskAcknowledgedAt !== null,
    apiKey: '',
    baseUrl: stored.baseUrl,
    dailyCap: String(stored.dailyCap),
    defaultProvider: stored.defaultProvider,
    enabled: stored.status === 'active',
    instanceName: stored.instanceName,
    minIntervalSeconds: String(stored.minIntervalSeconds),
  }
}

function parseInRange(text: string, range: Readonly<{ max: number; min: number }>): number | null {
  if (!/^\d{1,5}$/u.test(text.trim())) return null
  const value = Number(text)

  return value >= range.min && value <= range.max ? value : null
}

/**
 * `null` enquanto o rascunho não forma uma configuração que a API aceite. Cadastro novo exige a
 * chave; ligar exige o aviso de risco lido (RF7).
 */
export function buildWhatsAppEvolutionSubmission(
  draft: WhatsAppEvolutionDraft,
  stored: WhatsAppEvolutionSettings | null | undefined,
): WhatsAppEvolutionSaveInput | null {
  const dailyCap = parseInRange(draft.dailyCap, WHATSAPP_EVOLUTION_DAILY_CAP_RANGE)
  const minIntervalSeconds = parseInRange(
    draft.minIntervalSeconds,
    WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE,
  )
  const baseUrl = draft.baseUrl.trim()
  const apiKey = draft.apiKey.trim()
  const hasStoredKey = stored?.apiKeyConfigured === true

  if (dailyCap === null || minIntervalSeconds === null) return null
  if (baseUrl === '' || !INSTANCE_NAME.test(draft.instanceName.trim())) return null
  if (apiKey === '' && !hasStoredKey) return null
  if (draft.enabled && !draft.acknowledgeRisk) return null
  // Spec 281 P3: o Evolution só vira o provedor padrão com o canal ligado e o aviso de risco lido.
  if (draft.defaultProvider === 'evolution' && !draft.enabled) return null

  return {
    acknowledgeRisk: draft.acknowledgeRisk,
    ...(apiKey === '' ? {} : { apiKey }),
    baseUrl,
    dailyCap,
    defaultProvider: draft.defaultProvider,
    instanceName: draft.instanceName.trim(),
    minIntervalSeconds,
    status: draft.enabled ? 'active' : 'disabled',
  }
}
