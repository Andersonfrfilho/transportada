/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 D8: the effective configuration of the contractor reply, copied into the reply when the
 * request is sent. Only the three fields with a contractor exception inherit; everything else comes
 * from the type alone. The database CHECKs read the type row only, so the combination that results
 * from the exception is validated here.
 */
import { z } from 'zod'

import {
  CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES,
  CONTRACTOR_REPLY_ALERT_MAX_COUNT,
  CONTRACTOR_REPLY_ALERT_MODES,
  CONTRACTOR_REPLY_ATTACHMENT_KINDS,
  CONTRACTOR_REPLY_MODES,
  CONTRACTOR_REPLY_WAIT_HOURS,
  DRIVER_REPLY_CHANNELS,
  DRIVER_REPLY_WINDOW_CLOSED_ACTIONS,
  FORWARD_TO_INFORMED_EMAIL_MODES,
  FORWARD_TO_NOTE_RECIPIENT_MODES,
  type ContractorReplyMode,
  type ForwardToNoteRecipientMode,
} from '../../shared/occurrence-contractor-reply.constant.js'
import { resolveWithOverrides } from '../../shared/resolve-with-overrides.policy.js'

export const CONTRACTOR_REPLY_CONFIGURATION_VERSION = 1

export const contractorReplyConfigurationSchema = z.object({
  alertIntervalMinutes: z
    .number()
    .int()
    .min(CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES.min)
    .max(CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES.max),
  alertMaxCount: z
    .number()
    .int()
    .min(CONTRACTOR_REPLY_ALERT_MAX_COUNT.min)
    .max(CONTRACTOR_REPLY_ALERT_MAX_COUNT.max),
  alertMode: z.enum(CONTRACTOR_REPLY_ALERT_MODES),
  attachmentKind: z.enum(CONTRACTOR_REPLY_ATTACHMENT_KINDS),
  driverReplyChannel: z.enum(DRIVER_REPLY_CHANNELS),
  driverReplyTemplate: z.string(),
  driverReplyWindowClosedAction: z.enum(DRIVER_REPLY_WINDOW_CLOSED_ACTIONS),
  forwardToInformedEmail: z.enum(FORWARD_TO_INFORMED_EMAIL_MODES),
  forwardToNoteRecipient: z.enum(FORWARD_TO_NOTE_RECIPIENT_MODES),
  mode: z.enum(CONTRACTOR_REPLY_MODES),
  /**
   * Spec 276 T3b: entregue ao motorista, a ocorrência fica solucionada sozinha. O retorno aberto antes do campo
   * não o tem e lê `false`: a cópia guardada nunca muda de sentido.
   */
  resolveOnDelivery: z.boolean().default(false),
  /** Spec 276 T5: a resposta rápida que sai à contratante depois da entrega; nula é desligada. */
  acknowledgementQuickReplyId: z.string().nullable().default(null),
  version: z.literal(CONTRACTOR_REPLY_CONFIGURATION_VERSION),
  waitHours: z
    .number()
    .int()
    .min(CONTRACTOR_REPLY_WAIT_HOURS.min)
    .max(CONTRACTOR_REPLY_WAIT_HOURS.max)
    .nullable(),
})

export type ContractorReplyConfiguration = z.infer<typeof contractorReplyConfigurationSchema>

export type ContractorReplyTypeConfiguration = Omit<ContractorReplyConfiguration, 'version'> & {
  readonly emailsContractor: boolean
}

export type ContractorReplyOverride = {
  readonly forwardToNoteRecipient: ForwardToNoteRecipientMode | null
  readonly mode: ContractorReplyMode | null
  readonly waitHours: number | null
}

export type ContractorReplyConfigurationDecision =
  | { readonly configuration: ContractorReplyConfiguration; readonly kind: 'open' }
  | { readonly kind: 'skip'; readonly reason: 'invalid_configuration' | 'mode_off' }

function hasText(value: string): boolean {
  return value.trim() !== ''
}

function isEffectiveCombinationValid(
  configuration: ContractorReplyConfiguration,
  emailsContractor: boolean,
): boolean {
  if (!emailsContractor || !hasText(configuration.driverReplyTemplate)) return false
  if (configuration.alertMode !== 'off' && configuration.waitHours === null) return false
  return true
}

export function resolveContractorReplyConfiguration(params: {
  readonly override: ContractorReplyOverride | null
  readonly type: ContractorReplyTypeConfiguration
}): ContractorReplyConfigurationDecision {
  const { override, type } = params
  const { emailsContractor, ...typeFields } = type
  const mode = resolveWithOverrides({
    contractorOverride: override?.mode ?? null,
    fallback: typeFields.mode,
    general: null,
    recipientOverride: null,
  })
  if (mode === 'off') return { kind: 'skip', reason: 'mode_off' }

  const candidate = {
    ...typeFields,
    forwardToNoteRecipient: resolveWithOverrides({
      contractorOverride: override?.forwardToNoteRecipient ?? null,
      fallback: typeFields.forwardToNoteRecipient,
      general: null,
      recipientOverride: null,
    }),
    mode,
    version: CONTRACTOR_REPLY_CONFIGURATION_VERSION,
    waitHours: resolveWithOverrides<number | null>({
      contractorOverride: override?.waitHours ?? null,
      fallback: typeFields.waitHours,
      general: null,
      recipientOverride: null,
    }),
  }
  const parsed = contractorReplyConfigurationSchema.safeParse(candidate)
  if (!parsed.success) return { kind: 'skip', reason: 'invalid_configuration' }
  if (!isEffectiveCombinationValid(parsed.data, emailsContractor)) {
    return { kind: 'skip', reason: 'invalid_configuration' }
  }
  return { configuration: parsed.data, kind: 'open' }
}
