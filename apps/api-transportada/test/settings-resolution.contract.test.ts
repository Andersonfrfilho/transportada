/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-E1: a tela de verificação (P6 do spec.md) — as 4 combinações de presença (nenhum
 * override, só contratante, só destinatário, os dois) e a rota `GET /company-settings/settings-resolution`.
 * Escrito antes da implementação da rota (o use case e a rota nasceram para deixar isto verde).
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../src/identity/domain/authenticated-identity.js'
import type { AuthenticatedContext, CompanyContext } from '../src/identity/domain/tenant-context.js'
import type { DeliveryProofFieldSettings } from '../src/trips/domain/delivery-proof-settings.policy.js'
import {
  readSettingsResolution,
  type SettingsResolutionPort,
} from '../src/trips/application/read-settings-resolution.use-case.js'
import { createSettingsResolutionRoutes } from '../src/trips/presentation/settings-resolution.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000010'
const RECIPIENT_TAX_ID = '00000000000191'
const SETTINGS_RESOLUTION_PATH = '/company-settings/settings-resolution'

const GENERAL: DeliveryProofFieldSettings = {
  photo: 'optional',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}
const CONTRACTOR_OVERRIDE: DeliveryProofFieldSettings = {
  photo: 'off',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}
const RECIPIENT_OVERRIDE: DeliveryProofFieldSettings = {
  photo: 'required',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-000000000020'

function buildPort(input: {
  readonly contractorOverride?: DeliveryProofFieldSettings
  readonly occurrenceAttachmentMode?: 'off' | 'optional' | 'required'
  readonly recipientOverride?: DeliveryProofFieldSettings
}): SettingsResolutionPort {
  return {
    deliveryProof: {
      listContractorOverrides: async () =>
        input.contractorOverride === undefined
          ? []
          : [{ ...input.contractorOverride, contractorId: CONTRACTOR_ID }],
      listOverrides: async () =>
        input.recipientOverride === undefined
          ? []
          : [{ ...input.recipientOverride, taxId: RECIPIENT_TAX_ID }],
      readSettings: async () => ({
        ...GENERAL,
        canhotoOcrEnabled: false,
        latePenaltyPoints: 5,
        missingAfterHours: 24,
        missingPenaltyPoints: 10,
        proofRadiusMeters: 300,
        proofWindowMinutes: 60,
      }),
    },
    occurrenceTypeOverrides: {
      listOverridesForTypes: async () => ({
        contractorOverrides:
          input.occurrenceAttachmentMode === undefined
            ? []
            : [
                {
                  attachmentMode: input.occurrenceAttachmentMode,
                  contractorId: CONTRACTOR_ID,
                  occurrenceTypeId: OCCURRENCE_TYPE_ID,
                },
              ],
        recipientOverrides: [],
      }),
    },
    occurrenceTypes: {
      listOccurrenceTypes: async () => [
        {
          active: true,
          allowsMultipleItems: true,
          attachmentMode: 'off',
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          flow: 'document',
          id: OCCURRENCE_TYPE_ID,
          leavesDocumentBehind: false,
          name: 'Endereço não encontrado',
          notifies: false,
          redeliveryPolicy: 'unset',
          stage: 'delivery',
        },
      ],
    },
  }
}

describe('a resolução das 3 camadas para a tela de verificação (spec 218 RF-E1)', () => {
  it('nenhum override: vale a geral, e o attachmentMode do tipo', async () => {
    const result = await readSettingsResolution({
      companyId: COMPANY_ID,
      contractorId: CONTRACTOR_ID,
      port: buildPort({}),
      recipientTaxId: null,
    })

    expect(result.deliveryProof).toEqual(GENERAL)
    expect(result.occurrenceTypes).toEqual([
      {
        attachmentMode: 'off',
        flow: 'document',
        id: OCCURRENCE_TYPE_ID,
        name: 'Endereço não encontrado',
        stage: 'delivery',
      },
    ])
  })

  it('só contratante: ele vence a geral, nos dois assuntos', async () => {
    const result = await readSettingsResolution({
      companyId: COMPANY_ID,
      contractorId: CONTRACTOR_ID,
      port: buildPort({
        contractorOverride: CONTRACTOR_OVERRIDE,
        occurrenceAttachmentMode: 'required',
      }),
      recipientTaxId: null,
    })

    expect(result.deliveryProof).toEqual(CONTRACTOR_OVERRIDE)
    expect(result.occurrenceTypes[0]?.attachmentMode).toBe('required')
  })

  it('só destinatário: ele vence a geral', async () => {
    const result = await readSettingsResolution({
      companyId: COMPANY_ID,
      contractorId: null,
      port: buildPort({ recipientOverride: RECIPIENT_OVERRIDE }),
      recipientTaxId: RECIPIENT_TAX_ID,
    })

    expect(result.deliveryProof).toEqual(RECIPIENT_OVERRIDE)
  })

  it('P4 do spec.md: os dois presentes, o destinatário vence o contratante', async () => {
    const result = await readSettingsResolution({
      companyId: COMPANY_ID,
      contractorId: CONTRACTOR_ID,
      port: buildPort({
        contractorOverride: CONTRACTOR_OVERRIDE,
        recipientOverride: RECIPIENT_OVERRIDE,
      }),
      recipientTaxId: RECIPIENT_TAX_ID,
    })

    expect(result.deliveryProof).toEqual(RECIPIENT_OVERRIDE)
  })
})

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['settings.manage'] as never),
      roles: ['company-admin'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

function routeOf(): ReturnType<typeof createSettingsResolutionRoutes>[number] {
  const [route] = createSettingsResolutionRoutes({
    readSettingsResolution: async (input) =>
      readSettingsResolution({ ...input, port: buildPort({}) }),
  })
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return route
}

describe('rota GET /company-settings/settings-resolution (spec 218 RF-E1)', () => {
  it('exige settings.manage', () => {
    expect(routeOf().policy).toEqual({ permission: 'settings.manage', scope: 'company' })
  })

  it('400 sem nenhum dos dois parâmetros', async () => {
    try {
      await routeOf().execute({
        context: context(),
        correlationId: 'correlation-1',
        pathParameters: {},
        request: new Request(`http://localhost${SETTINGS_RESOLUTION_PATH}`),
      })
      throw new Error('EXPECTED_INVALID_REQUEST')
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400)
    }
  })

  it('200 com só contractorId', async () => {
    const response = await routeOf().execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: new Request(
        `http://localhost${SETTINGS_RESOLUTION_PATH}?contractorId=${CONTRACTOR_ID}`,
      ),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { deliveryProof: unknown } }
    expect(body.data.deliveryProof).toEqual(GENERAL)
  })

  it('200 com só recipientTaxId', async () => {
    const response = await routeOf().execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: new Request(
        `http://localhost${SETTINGS_RESOLUTION_PATH}?recipientTaxId=${RECIPIENT_TAX_ID}`,
      ),
    })

    expect(response.status).toBe(200)
  })
})
