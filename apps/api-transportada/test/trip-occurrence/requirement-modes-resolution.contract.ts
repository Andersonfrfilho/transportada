/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.1 (RF5, D-a): `listFieldOccurrenceTypes` devolve os seis campos de exigência — foto,
 * observação, assinatura, produtos e os dois mínimos — resolvidos em três camadas (destinatário >
 * contratante > tipo), **campo a campo**, com nulo da exceção herdando do tipo. O par `itemsMode` +
 * `itemsMinimumCount` herda junto. A precedência é a de `resolveWithOverrides`, nunca outra.
 */
import { describe, expect, test } from 'bun:test'

import {
  listFieldOccurrenceTypeResolutions,
  listFieldOccurrenceTypes,
  resolveFieldOccurrenceTypes,
} from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import type {
  FieldOccurrenceTypeContractorOverride,
  FieldOccurrenceTypeOverrides,
  FieldOccurrenceTypeRecipientOverride,
} from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000c1'
const RECIPIENT_TAX_ID = '12345678000190'

function type(overrides: Partial<OccurrenceTypeRecord> = {}): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TYPE_ID,
    itemsMinimumCount: null,
    itemsMode: 'optional',
    name: 'Recusa total',
    noteMode: 'optional',
    notifies: false,
    photoMinimumCount: 1,
    signatureMode: 'off',
    stage: 'delivery',
    ...overrides,
  }
}

/** A exceção que só declara o que muda: tudo o mais é nulo e herda do tipo. */
function contractorOverride(
  declared: Partial<FieldOccurrenceTypeContractorOverride>,
): FieldOccurrenceTypeContractorOverride {
  return {
    attachmentMode: 'optional',
    contractorId: CONTRACTOR,
    itemsMinimumCount: null,
    itemsMode: null,
    noteMode: null,
    occurrenceTypeId: TYPE_ID,
    photoMinimumCount: null,
    signatureMode: null,
    ...declared,
  }
}

function recipientOverride(
  declared: Partial<FieldOccurrenceTypeRecipientOverride>,
): FieldOccurrenceTypeRecipientOverride {
  return {
    attachmentMode: 'optional',
    itemsMinimumCount: null,
    itemsMode: null,
    noteMode: null,
    occurrenceTypeId: TYPE_ID,
    photoMinimumCount: null,
    signatureMode: null,
    taxId: RECIPIENT_TAX_ID,
    ...declared,
  }
}

async function list(input: {
  readonly contractorOverrides?: readonly FieldOccurrenceTypeContractorOverride[]
  readonly recipientOverrides?: readonly FieldOccurrenceTypeRecipientOverride[]
  readonly recordType?: OccurrenceTypeRecord
  readonly withContractor?: boolean
  readonly withRecipient?: boolean
}) {
  const [resolved] = await listFieldOccurrenceTypes({
    companyId: COMPANY,
    contractorId: input.withContractor === false ? null : CONTRACTOR,
    overrides: {
      async listOverridesForTypes() {
        return {
          contractorOverrides: input.contractorOverrides ?? [],
          recipientOverrides: input.recipientOverrides ?? [],
        }
      },
    },
    recipientTaxId: input.withRecipient === false ? null : RECIPIENT_TAX_ID,
    repository: {
      async listOccurrenceTypes() {
        return [input.recordType ?? type()]
      },
    },
  })
  return resolved
}

describe('os seis campos resolvem em três camadas, campo a campo (spec 246 T2.1)', () => {
  test('sem exceção: cada campo é o do tipo, e attachmentMode é a foto', async () => {
    const resolved = await list({
      recordType: type({
        attachmentMode: 'required',
        itemsMinimumCount: 2,
        itemsMode: 'required',
        noteMode: 'required',
        photoMinimumCount: 3,
        signatureMode: 'optional',
      }),
    })

    expect(resolved).toMatchObject({
      attachmentMode: 'required',
      itemsMinimumCount: 2,
      itemsMode: 'required',
      noteMode: 'required',
      photoMinimumCount: 3,
      photoMode: 'required',
      signatureMode: 'optional',
    })
  })

  test('exceção que declara só a assinatura herda foto, observação e produtos do tipo', async () => {
    const resolved = await list({
      contractorOverrides: [
        contractorOverride({ attachmentMode: 'required', signatureMode: 'required' }),
      ],
      recordType: type({ attachmentMode: 'required', noteMode: 'required' }),
    })

    expect(resolved).toMatchObject({
      itemsMode: 'optional',
      noteMode: 'required',
      photoMode: 'required',
      signatureMode: 'required',
    })
  })

  test('nulo da exceção herda do tipo mesmo quando o tipo é mais estrito', async () => {
    const resolved = await list({
      contractorOverrides: [contractorOverride({ attachmentMode: 'optional', noteMode: null })],
      recordType: type({ attachmentMode: 'required', noteMode: 'required' }),
    })

    expect(resolved).toMatchObject({ noteMode: 'required', photoMode: 'optional' })
  })

  test('destinatário vence contratante vence tipo, em cada campo', async () => {
    const resolved = await list({
      contractorOverrides: [
        contractorOverride({
          noteMode: 'required',
          photoMinimumCount: 2,
          signatureMode: 'required',
        }),
      ],
      recipientOverrides: [recipientOverride({ photoMinimumCount: 4, signatureMode: 'off' })],
      recordType: type({ noteMode: 'optional', signatureMode: 'optional' }),
    })

    expect(resolved).toMatchObject({
      noteMode: 'required',
      photoMinimumCount: 4,
      signatureMode: 'off',
    })
  })

  test('o contratante da nota que não tem exceção não herda a de outro contratante', async () => {
    const resolved = await list({
      contractorOverrides: [
        contractorOverride({
          contractorId: '00000000-0000-4000-8000-0000000000c9',
          noteMode: 'required',
        }),
      ],
      recordType: type({ noteMode: 'optional' }),
    })

    expect(resolved).toMatchObject({ noteMode: 'optional' })
  })
})

describe('o par itemsMode + itemsMinimumCount herda junto (spec 246 RF1c2)', () => {
  const requiredAtLeastTwo = type({ itemsMinimumCount: 2, itemsMode: 'required' })

  test('exceção com itemsMode nulo herda o par do tipo, ignorando mínimo solto', async () => {
    const resolved = await list({
      contractorOverrides: [contractorOverride({ itemsMinimumCount: 5, itemsMode: null })],
      recordType: requiredAtLeastTwo,
    })

    expect(resolved).toMatchObject({ itemsMinimumCount: 2, itemsMode: 'required' })
  })

  test('exceção com itemsMode declarado usa o próprio par: mínimo nulo é "todos os itens"', async () => {
    const resolved = await list({
      contractorOverrides: [contractorOverride({ itemsMinimumCount: null, itemsMode: 'required' })],
      recordType: requiredAtLeastTwo,
    })

    expect(resolved).toMatchObject({ itemsMinimumCount: null, itemsMode: 'required' })
  })

  test('exceção que desliga os produtos leva o próprio par, não o mínimo do tipo', async () => {
    const resolved = await list({
      recipientOverrides: [recipientOverride({ itemsMode: 'off' })],
      recordType: requiredAtLeastTwo,
    })

    expect(resolved).toMatchObject({ itemsMinimumCount: null, itemsMode: 'off' })
  })
})

describe('a verificação diz qual camada decidiu cada campo (spec 246 RF12)', () => {
  test('cada campo aponta para destinatário, contratante ou tipo', async () => {
    const [resolution] = await listFieldOccurrenceTypeResolutions({
      companyId: COMPANY,
      contractorId: CONTRACTOR,
      overrides: {
        async listOverridesForTypes() {
          return {
            contractorOverrides: [
              contractorOverride({ attachmentMode: 'required', noteMode: 'required' }),
            ],
            recipientOverrides: [
              recipientOverride({ attachmentMode: 'off', signatureMode: 'required' }),
            ],
          }
        },
      },
      recipientTaxId: RECIPIENT_TAX_ID,
      repository: {
        async listOccurrenceTypes() {
          return [type()]
        },
      },
    })

    expect(resolution?.sources).toMatchObject({
      itemsMode: 'type',
      noteMode: 'contractor',
      photoMode: 'recipient',
      signatureMode: 'recipient',
    })
  })
})

describe('o snapshot e a lista usam a mesma resolução pura (spec 246 RF5)', () => {
  const overrides: FieldOccurrenceTypeOverrides = {
    contractorOverrides: [contractorOverride({ signatureMode: 'required' })],
    recipientOverrides: [],
  }

  test('resolveFieldOccurrenceTypes devolve o que listFieldOccurrenceTypes devolve', async () => {
    const pure = resolveFieldOccurrenceTypes({
      contractorId: CONTRACTOR,
      overrides,
      recipientTaxId: RECIPIENT_TAX_ID,
      types: [type()],
    })
    const listed = await list({ contractorOverrides: overrides.contractorOverrides })

    expect(pure).toEqual(listed === undefined ? [] : [listed])
    expect(listed).toBeDefined()
    expect(pure[0]?.signatureMode).toBe('required')
  })

  test('sem contratante nem destinatário resolvidos, cai nos modos do tipo e não consulta exceção', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      overrides: {
        async listOverridesForTypes() {
          throw new Error('NÃO DEVERIA CONSULTAR SEM CONTEXTO')
        },
      },
      repository: {
        async listOccurrenceTypes() {
          return [type({ signatureMode: 'optional' })]
        },
      },
    })

    expect(types[0]).toMatchObject({ signatureMode: 'optional' })
  })
})
