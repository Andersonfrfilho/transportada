/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 D8: the effective configuration copied into the reply. The contractor exception overrides
 * only the mode, the wait and the forward to the note's customer, and null inherits the type; every
 * other field comes from the type alone. A combination the type CHECKs cannot see (they never read the
 * exception) is refused here.
 */
import { describe, expect, test } from 'bun:test'

import {
  contractorReplyConfigurationSchema,
  type ContractorReplyConfiguration,
  resolveContractorReplyConfiguration,
  type ContractorReplyOverride,
  type ContractorReplyTypeConfiguration,
} from '../../src/occurrence-conversation/domain/contractor-reply-configuration.policy.js'

const TYPE: ContractorReplyTypeConfiguration = {
  alertIntervalMinutes: 30,
  alertMaxCount: 5,
  alertMode: 'alert_operator',
  attachmentKind: 'pdf_or_image',
  driverReplyChannel: 'both',
  driverReplyTemplate: 'Segue o boleto.',
  driverReplyWindowClosedAction: 'wait_for_driver',
  emailsContractor: true,
  forwardToInformedEmail: 'manual',
  forwardToNoteRecipient: 'manual',
  mode: 'forward_after_approval',
  acknowledgementQuickReplyId: null,
  resolveOnDelivery: false,
  waitHours: 6,
}

const EMPTY_OVERRIDE: ContractorReplyOverride = {
  forwardToNoteRecipient: null,
  mode: null,
  waitHours: null,
}

function open(
  type: Partial<ContractorReplyTypeConfiguration>,
  override: ContractorReplyOverride | null,
) {
  const decision = resolveContractorReplyConfiguration({ override, type: { ...TYPE, ...type } })
  if (decision.kind !== 'open') throw new Error(`EXPECTED_OPEN_GOT_${decision.reason}`)
  return decision.configuration
}

describe('a configuração efetiva do retorno (spec 248 D8)', () => {
  test('sem exceção ou com a exceção toda nula, herda o tipo, com a versão', () => {
    const expected: ContractorReplyConfiguration = {
      alertIntervalMinutes: 30,
      alertMaxCount: 5,
      alertMode: 'alert_operator',
      attachmentKind: 'pdf_or_image',
      driverReplyChannel: 'both',
      driverReplyTemplate: 'Segue o boleto.',
      driverReplyWindowClosedAction: 'wait_for_driver',
      forwardToInformedEmail: 'manual',
      forwardToNoteRecipient: 'manual',
      mode: 'forward_after_approval',
      acknowledgementQuickReplyId: null,
      resolveOnDelivery: false,
      version: 1,
      waitHours: 6,
    }

    expect(open({}, null)).toEqual(expected)
    expect(open({}, EMPTY_OVERRIDE)).toEqual(expected)
  })

  test('a exceção vence campo a campo; o que ela deixa nulo continua do tipo', () => {
    const configuration = open(
      {},
      { forwardToNoteRecipient: 'automatic', mode: 'forward_automatic', waitHours: 2 },
    )
    expect(configuration).toMatchObject({
      forwardToNoteRecipient: 'automatic',
      mode: 'forward_automatic',
      waitHours: 2,
    })

    expect(open({}, { ...EMPTY_OVERRIDE, waitHours: 12 })).toMatchObject({
      forwardToNoteRecipient: 'manual',
      mode: 'forward_after_approval',
      waitHours: 12,
    })
  })

  test('o resto vem só do tipo: a exceção não tem como mudar canal, anexo nem alerta', () => {
    const configuration = open(
      {},
      { forwardToNoteRecipient: 'off', mode: 'forward_automatic', waitHours: 1 },
    )

    expect(configuration).toMatchObject({
      alertIntervalMinutes: 30,
      alertMaxCount: 5,
      alertMode: 'alert_operator',
      attachmentKind: 'pdf_or_image',
      driverReplyChannel: 'both',
      driverReplyWindowClosedAction: 'wait_for_driver',
    })
  })

  test('modo efetivo desligado não abre — pelo tipo ou pela exceção', () => {
    expect(
      resolveContractorReplyConfiguration({
        override: null,
        type: { ...TYPE, forwardToNoteRecipient: 'off', mode: 'off' },
      }),
    ).toEqual({ kind: 'skip', reason: 'mode_off' })
    expect(
      resolveContractorReplyConfiguration({
        override: { ...EMPTY_OVERRIDE, mode: 'off' },
        type: TYPE,
      }),
    ).toEqual({ kind: 'skip', reason: 'mode_off' })
  })

  test('a exceção liga o modo num tipo desligado: vale, se o resto do tipo sustenta', () => {
    const configuration = open(
      { forwardToNoteRecipient: 'off', mode: 'off' },
      { ...EMPTY_OVERRIDE, mode: 'forward_automatic' },
    )

    expect(configuration.mode).toBe('forward_automatic')
  })

  test.each([
    ['o tipo não manda e-mail à contratante', { emailsContractor: false }],
    ['o texto ao motorista está em branco', { driverReplyTemplate: '   ' }],
    ['alerta ligado sem prazo (a exceção não traz prazo)', { waitHours: null }],
  ] as const)('combinação efetiva inválida não abre: %s', (_, type) => {
    expect(
      resolveContractorReplyConfiguration({
        override: { ...EMPTY_OVERRIDE, mode: 'forward_automatic' },
        type: { ...TYPE, ...type },
      }),
    ).toEqual({ kind: 'skip', reason: 'invalid_configuration' })
  })

  test('a exceção que tira o prazo não existe (nulo herda), então o alerta segue com o prazo do tipo', () => {
    expect(open({}, EMPTY_OVERRIDE).waitHours).toBe(6)
  })

  test('o esquema exige a versão e recusa valor fora do vocabulário', () => {
    const fields = Object.fromEntries(
      Object.entries(TYPE).filter(([key]) => key !== 'emailsContractor'),
    )
    const valid = { ...fields, version: 1 }

    expect(contractorReplyConfigurationSchema.safeParse(valid).success).toBe(true)
    expect(contractorReplyConfigurationSchema.safeParse(fields).success).toBe(false)
    expect(
      contractorReplyConfigurationSchema.safeParse({ ...valid, mode: 'whatever' }).success,
    ).toBe(false)
    expect(contractorReplyConfigurationSchema.safeParse({ ...valid, waitHours: 0 }).success).toBe(
      false,
    )
  })

  test('fechar sozinha depois de entregar (spec 276 T3b) vem do tipo; a cópia antiga sem o campo lê falso', () => {
    expect(open({ resolveOnDelivery: true }, EMPTY_OVERRIDE).resolveOnDelivery).toBe(true)
    expect(open({}, EMPTY_OVERRIDE).resolveOnDelivery).toBe(false)

    const stored = Object.fromEntries(
      Object.entries(TYPE).filter(
        ([key]) =>
          key !== 'resolveOnDelivery' &&
          key !== 'acknowledgementQuickReplyId' &&
          key !== 'emailsContractor',
      ),
    )
    const parsed = contractorReplyConfigurationSchema.parse({ ...stored, version: 1 })
    expect(parsed.resolveOnDelivery).toBe(false)
    expect(parsed.acknowledgementQuickReplyId).toBeNull()
  })

  test('a resposta automática à contratante (spec 276 T5) vem do tipo; nula é desligada', () => {
    const quickReplyId = '0f3f6a3c-7b8e-4c9a-9f1e-2b6d1c0e5a47'
    expect(
      open({ acknowledgementQuickReplyId: quickReplyId }, EMPTY_OVERRIDE)
        .acknowledgementQuickReplyId,
    ).toBe(quickReplyId)
    expect(open({}, EMPTY_OVERRIDE).acknowledgementQuickReplyId).toBeNull()
  })
})
