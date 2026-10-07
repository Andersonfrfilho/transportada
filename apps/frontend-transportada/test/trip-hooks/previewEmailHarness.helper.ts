/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b: a seção "Prévia por e-mail" montada de verdade, com a API dublada. ⚠️ `mock.module` não se
 * desfaz e vale para o processo inteiro: o cliente é trocado UMA vez, aqui, e cada teste só reconfigura
 * `previewEmailFakes`. O harness da ficha o importa, para que a ficha sempre tenha a seção dublada. Dados
 * sintéticos: endereços `@exemplo.test`.
 */
import { mock } from 'bun:test'

import type { PreviewEmailClient } from '@/modules/delivery-clients/shared/previewEmailClient.service'
import {
  PREVIEW_EMAIL_REASON_CODES,
  type GeneratedInboundAddress,
  type PreviewEmailIntake,
  type PreviewEmailLists,
  type PreviewEmailSettings,
} from '@/modules/delivery-clients/shared/previewEmail.types'

export const PREVIEW_EMAIL_CONTRACTOR_ID = '00000000-0000-4000-8000-000000237c01'
export const PREVIEW_ID = '00000000-0000-4000-8000-000000237c02'
export const FIRST_TOKEN = 'abcdefghijklmnopqrstuvwxyz'
export const SECOND_TOKEN = 'zyxwvutsrqponmlkjihgfedcba'
export const ENTRY_DOMAIN = 'entrada.exemplo.test'

export const EMPTY_SETTINGS: PreviewEmailSettings = {
  contractorId: PREVIEW_EMAIL_CONTRACTOR_ID,
  forwarderAllowlist: [],
  hasInboundToken: false,
  inboundTokenSetAt: null,
  senderAllowlist: [],
}

export const FILLED_SETTINGS: PreviewEmailSettings = {
  ...EMPTY_SETTINGS,
  forwarderAllowlist: ['equipe@transportadora.exemplo.test'],
  senderAllowlist: ['contratante.exemplo.test'],
}

export const ACTIVE_SETTINGS: PreviewEmailSettings = {
  ...FILLED_SETTINGS,
  hasInboundToken: true,
  inboundTokenSetAt: '2026-10-07T15:30:00.000Z',
}

/** Todos os motivos que o CHECK admite, uma recusa para cada, mais uma aceita com link. */
export const ALL_REASON_INTAKES: readonly PreviewEmailIntake[] = [
  {
    outcome: 'accepted',
    previewId: PREVIEW_ID,
    reasonCode: null,
    receivedAt: '2026-10-07T16:00:00.000Z',
  },
  ...PREVIEW_EMAIL_REASON_CODES.map((reasonCode, index) => ({
    outcome: 'rejected',
    previewId: null,
    reasonCode,
    receivedAt: new Date(Date.UTC(2026, 9, 7, 15, 59 - index)).toISOString(),
  })),
]

export type PreviewEmailCalls = {
  readonly generations: string[]
  readonly intakeReads: string[]
  readonly saves: { contractorId: string; lists: PreviewEmailLists }[]
  readonly settingsReads: string[]
}

export const previewEmailFakes: {
  client: PreviewEmailClient
  generateFailure: Error | undefined
  intakes: readonly PreviewEmailIntake[]
  saveFailure: Error | undefined
  settings: PreviewEmailSettings
  tokens: string[]
} = {
  client: undefined as unknown as PreviewEmailClient,
  generateFailure: undefined,
  intakes: [],
  saveFailure: undefined,
  settings: EMPTY_SETTINGS,
  tokens: [],
}

/** Instala a API dublada, com o estado inicial pedido, e registra tudo que a tela leu e gravou. */
export type PreviewEmailDoubleInitial = Readonly<{
  intakes?: readonly PreviewEmailIntake[]
  settings?: PreviewEmailSettings
}>

export function installPreviewEmailDouble(
  initial: PreviewEmailDoubleInitial = {},
): PreviewEmailCalls {
  const calls: PreviewEmailCalls = {
    generations: [],
    intakeReads: [],
    saves: [],
    settingsReads: [],
  }
  previewEmailFakes.generateFailure = undefined
  previewEmailFakes.saveFailure = undefined
  previewEmailFakes.intakes = initial.intakes ?? []
  previewEmailFakes.settings = initial.settings ?? EMPTY_SETTINGS
  previewEmailFakes.tokens = [FIRST_TOKEN, SECOND_TOKEN]
  previewEmailFakes.client = {
    generateAddress: (contractorId) => {
      calls.generations.push(contractorId)
      if (previewEmailFakes.generateFailure !== undefined) {
        return Promise.reject(previewEmailFakes.generateFailure)
      }
      const token = previewEmailFakes.tokens.shift() ?? FIRST_TOKEN
      previewEmailFakes.settings = {
        ...previewEmailFakes.settings,
        hasInboundToken: true,
        inboundTokenSetAt: '2026-10-07T18:00:00.000Z',
      }
      const generated: GeneratedInboundAddress = { address: `${token}@${ENTRY_DOMAIN}`, token }
      return Promise.resolve(generated)
    },
    getSettings: (contractorId) => {
      calls.settingsReads.push(contractorId)
      return Promise.resolve(previewEmailFakes.settings)
    },
    listIntakes: (contractorId) => {
      calls.intakeReads.push(contractorId)
      return Promise.resolve(previewEmailFakes.intakes)
    },
    saveAllowlists: ({ contractorId, lists }) => {
      calls.saves.push(structuredClone({ contractorId, lists }))
      if (previewEmailFakes.saveFailure !== undefined) {
        return Promise.reject(previewEmailFakes.saveFailure)
      }
      previewEmailFakes.settings = { ...previewEmailFakes.settings, ...lists }
      return Promise.resolve(previewEmailFakes.settings)
    },
  }
  return calls
}

/** Antes de qualquer hook ser importado: ele tem de nascer já apontando para o falso. */
void mock.module('@/modules/delivery-clients/shared/previewEmailClient.service', () => ({
  getPreviewEmailClient: () => previewEmailFakes.client,
}))
