/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão final, M5): a leitura das exceções do tipo é porta **obrigatória** do registro do
 * motorista. Opcional, esquecê-la na composição (`main.ts`) ou num dublê não dava erro de tipo e a
 * exceção deixava de valer em silêncio — o defeito que o antigo contrato de parede (varredura do texto
 * de `main.ts`) tentava vigiar. Agora o tipo vigia: omitir a porta é erro de compilação (`tsc`, o gate
 * `bun run typecheck`), provado pelo `@ts-expect-error` abaixo, e o comportamento — a exceção da nota
 * vale e a porta é consultada com o tipo da empresa — fica provado pelo caso de uso.
 */
import { describe, expect, test } from 'bun:test'

import { resolveDocumentOccurrenceRequirements } from '../../src/trips/application/resolve-document-occurrence-requirements.service.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000c1'
const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'

const OCCURRENCE_TYPE: OccurrenceTypeRecord = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'optional',
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null,
  id: TYPE_ID,
  name: 'Recusa total',
  noteMode: 'optional',
  notifies: false,
  photoMinimumCount: 1,
  signatureMode: 'off',
  stage: 'delivery',
}

describe('a porta das exceções do tipo é obrigatória (spec 246, revisão final M5)', () => {
  test('omitir a porta não compila', () => {
    const resolution = resolveDocumentOccurrenceRequirements({
      companyId: COMPANY,
      document: { contractorId: CONTRACTOR },
      occurrenceType: OCCURRENCE_TYPE,
      // @ts-expect-error a porta `findOccurrenceTypeOverrides` é obrigatória
      repository: {},
    })

    // Em tempo de execução a omissão derruba a chamada, em vez de ignorar a exceção em silêncio.
    return expect(resolution).rejects.toThrow()
  })

  test('a exceção do contratante da nota vale, e a porta recebe a empresa e o tipo', async () => {
    const queries: unknown[] = []

    const requirements = await resolveDocumentOccurrenceRequirements({
      companyId: COMPANY,
      document: { contractorId: CONTRACTOR },
      occurrenceType: OCCURRENCE_TYPE,
      repository: {
        findOccurrenceTypeOverrides: async (query) => {
          queries.push(query)
          return {
            contractorOverrides: [
              {
                attachmentMode: 'optional',
                contractorId: CONTRACTOR,
                occurrenceTypeId: TYPE_ID,
                signatureMode: 'required',
              },
            ],
            recipientOverrides: [],
          }
        },
      },
    })

    expect(queries).toEqual([{ companyId: COMPANY, occurrenceTypeId: TYPE_ID }])
    expect(requirements.signatureMode).toBe('required')
  })

  test('nota sem contratante nem destinatário não consulta a porta e herda o tipo', async () => {
    let calls = 0

    const requirements = await resolveDocumentOccurrenceRequirements({
      companyId: COMPANY,
      document: {},
      occurrenceType: OCCURRENCE_TYPE,
      repository: {
        findOccurrenceTypeOverrides: async () => {
          calls += 1
          return { contractorOverrides: [], recipientOverrides: [] }
        },
      },
    })

    expect(calls).toBe(0)
    expect(requirements.signatureMode).toBe('off')
  })
})
