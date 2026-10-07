/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.2 (RF12, P5): a tela de verificação mostra, por tipo, os seis campos resolvidos **e a
 * camada que decidiu cada um** — pelo mesmo resolvedor do snapshot e do registro.
 */
import { describe, expect, test } from 'bun:test'

import {
  readSettingsResolution,
  type SettingsResolutionPort,
} from '../../src/trips/application/read-settings-resolution.use-case.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const CONTRACTOR = '00000000-0000-4000-8000-000000000010'
const RECIPIENT_TAX_ID = '12345678000190'
const TYPE_ID = '00000000-0000-4000-8000-000000000020'

const PROOF = {
  canhotoOcrEnabled: false,
  cargo: 'off',
  cargoMinimumCount: 1,
  latePenaltyPoints: 5,
  missingAfterHours: 24,
  missingPenaltyPoints: 10,
  photo: 'optional',
  proofRadiusMeters: 300,
  proofWindowMinutes: 60,
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
} as const

function port(
  overrides: SettingsResolutionPort['occurrenceTypeOverrides'],
): SettingsResolutionPort {
  return {
    deliveryProof: {
      listContractorOverrides: async () => [],
      listOverrides: async () => [],
      readSettings: async () => PROOF,
    },
    occurrenceTypeOverrides: overrides,
    occurrenceTypes: {
      listOccurrenceTypes: async () => [
        {
          active: true,
          allowsMultipleItems: true,
          attachmentMode: 'optional',
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          flow: 'document',
          id: TYPE_ID,
          itemsMinimumCount: null,
          itemsMode: 'required',
          name: 'Recusa total',
          noteMode: 'optional',
          notifies: false,
          photoMinimumCount: 1,
          signatureMode: 'off',
          stage: 'delivery',
        },
      ],
    },
  }
}

describe('a verificação devolve os campos resolvidos e a camada de cada um (spec 246 RF12)', () => {
  test('sem exceção, tudo vem do tipo', async () => {
    const result = await readSettingsResolution({
      companyId: COMPANY,
      contractorId: CONTRACTOR,
      port: port({
        listOverridesForTypes: async () => ({ contractorOverrides: [], recipientOverrides: [] }),
      }),
      recipientTaxId: RECIPIENT_TAX_ID,
    })

    expect(result.occurrenceTypes[0]).toMatchObject({
      itemsMinimumCount: null,
      itemsMode: 'required',
      noteMode: 'optional',
      photoMinimumCount: 1,
      photoMode: 'optional',
      signatureMode: 'off',
      sources: {
        itemsMode: 'type',
        noteMode: 'type',
        photoMinimumCount: 'type',
        photoMode: 'type',
        signatureMode: 'type',
      },
    })
  })

  test('exceção do destinatário e do contratante: cada campo diz quem o decidiu', async () => {
    const result = await readSettingsResolution({
      companyId: COMPANY,
      contractorId: CONTRACTOR,
      port: port({
        listOverridesForTypes: async () => ({
          contractorOverrides: [
            {
              attachmentMode: 'required',
              contractorId: CONTRACTOR,
              noteMode: 'required',
              occurrenceTypeId: TYPE_ID,
            },
          ],
          recipientOverrides: [
            {
              attachmentMode: 'required',
              occurrenceTypeId: TYPE_ID,
              photoMinimumCount: 3,
              signatureMode: 'required',
              taxId: RECIPIENT_TAX_ID,
            },
          ],
        }),
      }),
      recipientTaxId: RECIPIENT_TAX_ID,
    })

    expect(result.occurrenceTypes[0]).toMatchObject({
      attachmentMode: 'required',
      noteMode: 'required',
      photoMinimumCount: 3,
      photoMode: 'required',
      signatureMode: 'required',
      sources: {
        itemsMode: 'type',
        noteMode: 'contractor',
        photoMinimumCount: 'recipient',
        photoMode: 'recipient',
        signatureMode: 'recipient',
      },
    })
  })
})
