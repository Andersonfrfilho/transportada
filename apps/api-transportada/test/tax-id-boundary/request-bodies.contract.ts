/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createProfileSchema } from '../../src/cte-profiles/presentation/cte-emission-profile-request.schema.js'
import {
  createDriverSchema,
  createVehicleSchema,
} from '../../src/fleet/presentation/fleet-request.schema.js'
import { createManifestSchema } from '../../src/mdfe-manifests/presentation/mdfe-manifest-request.schema.js'
import { saveCredentialSchema } from '../../src/nfse-profiles/presentation/nfse-profile-request.schema.js'
import { CREATE_PROFILE_BODY } from '../fixtures/cte-profiles-http-payload.fixture'
import {
  CREATE_DRIVER_BODY,
  CREATE_VEHICLE_BODY,
  THIRD_PARTY_OWNER_BODY,
} from '../fixtures/fleet-http-payload.fixture'
import {
  createCompanySettingsHttpFixture,
  patchSettingsRequest,
  responseApiError,
} from '../fixtures/company-settings-http.fixture'
import { settingsBodyWith } from '../fixtures/company-settings-http-payload.fixture'

/** Exemplo oficial da IN RFB 2229/2024: `12.ABC.345/01DE-35`, DV calculado pela mesma módulo 11. */
const ALPHANUMERIC_CNPJ = '12ABC34501DE35'
const LOWERCASE_CNPJ = '12abc34501de35'
const NUMERIC_CNPJ = '12345678000195'
const OUT_OF_ALPHABET_CNPJ = '12ABC34501DE3!'
const ALPHANUMERIC_ROOT = '12ABC345'
const LOWERCASE_ROOT = '12abc345'

const VEHICLE_ID = '00000000-0000-4000-8000-000000000921'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000922'
const DRIVER_ID = '00000000-0000-4000-8000-000000000923'

const vehicleBodyWithOwner = (taxId: string) => ({
  ...CREATE_VEHICLE_BODY,
  owner: { ...THIRD_PARTY_OWNER_BODY, taxId },
  ownership: 'third_party',
})

const manifestBodyWithContractor = (contractorTaxId: string) => ({
  contractorTaxId,
  documentIds: [DOCUMENT_ID],
  driverIds: [DRIVER_ID],
  vehicleId: VEHICLE_ID,
})

const credentialBodyWith = (taxId: string) => ({
  apiToken: 'nota-rp-token',
  fiscalEnvironment: 'homologation',
  taxId,
})

const profileBodyWithMatcher = (taxId: string) => ({
  ...CREATE_PROFILE_BODY,
  matchers: [{ matchRole: 'sender', taxId }],
})

describe('CNPJ alfanumérico na fronteira: corpos de requisição', () => {
  test('o perfil fiscal da empresa aceita CNPJ alfanumérico e o entrega em maiúscula', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(
      patchSettingsRequest({
        body: settingsBodyWith({ path: 'profile.cnpj', value: LOWERCASE_CNPJ }),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.profile.cnpj).toBe(ALPHANUMERIC_CNPJ)
  })

  test('o perfil fiscal recusa caractere fora de [A-Z0-9] antes do caso de uso', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(
      patchSettingsRequest({
        body: settingsBodyWith({ path: 'profile.cnpj', value: OUT_OF_ALPHABET_CNPJ }),
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
  })

  test('a seguradora do MDF-e aceita CNPJ alfanumérico e mantém CPF e vazio', async () => {
    const alphanumericFixture = await createCompanySettingsHttpFixture()
    const alphanumericResponse = await alphanumericFixture.handle(
      patchSettingsRequest({
        body: settingsBodyWith({ path: 'mdfe.insurerTaxId', value: LOWERCASE_CNPJ }),
      }),
    )

    expect(alphanumericResponse.status).toBe(200)
    expect(alphanumericFixture.updateCalls[0]?.settings.mdfe.insurerTaxId).toBe(ALPHANUMERIC_CNPJ)

    const emptyFixture = await createCompanySettingsHttpFixture()
    const emptyResponse = await emptyFixture.handle(
      patchSettingsRequest({ body: settingsBodyWith({ path: 'mdfe.insurerTaxId', value: '' }) }),
    )

    expect(emptyResponse.status).toBe(200)
    expect(emptyFixture.updateCalls[0]?.settings.mdfe.insurerTaxId).toBe('')

    const invalidFixture = await createCompanySettingsHttpFixture()
    const invalidResponse = await invalidFixture.handle(
      patchSettingsRequest({
        body: settingsBodyWith({ path: 'mdfe.insurerTaxId', value: OUT_OF_ALPHABET_CNPJ }),
      }),
    )

    expect(invalidResponse.status).toBe(400)
    expect(invalidFixture.updateCalls).toHaveLength(0)
  })

  test('o proprietário do veículo aceita CNPJ alfanumérico, CPF e numérico legado', () => {
    expect(createVehicleSchema.safeParse(vehicleBodyWithOwner(NUMERIC_CNPJ)).success).toBe(true)
    expect(createVehicleSchema.safeParse(vehicleBodyWithOwner('12345678901')).success).toBe(true)

    const alphanumeric = createVehicleSchema.safeParse(vehicleBodyWithOwner(LOWERCASE_CNPJ))

    expect(alphanumeric.success).toBe(true)
    expect(alphanumeric.data?.owner?.taxId).toBe(ALPHANUMERIC_CNPJ)
    expect(createVehicleSchema.safeParse(vehicleBodyWithOwner(OUT_OF_ALPHABET_CNPJ)).success).toBe(
      false,
    )
  })

  test('a empresa ligada ao motorista aceita CNPJ alfanumérico e segue aceitando vazio', () => {
    const alphanumeric = createDriverSchema.safeParse({
      ...CREATE_DRIVER_BODY,
      linkedTaxId: LOWERCASE_CNPJ,
    })

    expect(alphanumeric.success).toBe(true)
    expect(alphanumeric.data?.linkedTaxId).toBe(ALPHANUMERIC_CNPJ)
    expect(createDriverSchema.safeParse({ ...CREATE_DRIVER_BODY, linkedTaxId: '' }).success).toBe(
      true,
    )
    expect(
      createDriverSchema.safeParse({ ...CREATE_DRIVER_BODY, linkedTaxId: OUT_OF_ALPHABET_CNPJ })
        .success,
    ).toBe(false)
  })

  // A raiz é prefixo do documento: se ela ficar numérica, o matcher para de casar as empresas novas
  test('o matcher do perfil de emissão aceita a raiz e o CNPJ inteiro alfanuméricos', () => {
    const fullTaxId = createProfileSchema.safeParse(profileBodyWithMatcher(LOWERCASE_CNPJ))
    const root = createProfileSchema.safeParse(profileBodyWithMatcher(LOWERCASE_ROOT))

    expect(fullTaxId.success).toBe(true)
    expect(fullTaxId.data?.matchers[0]?.taxId).toBe(ALPHANUMERIC_CNPJ)
    expect(root.success).toBe(true)
    expect(root.data?.matchers[0]?.taxId).toBe(ALPHANUMERIC_ROOT)
    expect(
      createProfileSchema.safeParse(profileBodyWithMatcher(OUT_OF_ALPHABET_CNPJ)).success,
    ).toBe(false)
  })

  test('a credencial de NFS-e aceita CNPJ alfanumérico do prestador', () => {
    const alphanumeric = saveCredentialSchema.safeParse(credentialBodyWith(LOWERCASE_CNPJ))

    expect(alphanumeric.success).toBe(true)
    expect(alphanumeric.data?.taxId).toBe(ALPHANUMERIC_CNPJ)
    expect(saveCredentialSchema.safeParse(credentialBodyWith(NUMERIC_CNPJ)).success).toBe(true)
    expect(saveCredentialSchema.safeParse(credentialBodyWith(OUT_OF_ALPHABET_CNPJ)).success).toBe(
      false,
    )
  })

  test('o contratante do MDF-e aceita CNPJ alfanumérico e segue aceitando CPF e vazio', () => {
    const alphanumeric = createManifestSchema.safeParse(manifestBodyWithContractor(LOWERCASE_CNPJ))

    expect(alphanumeric.success).toBe(true)
    expect(alphanumeric.data?.contractorTaxId).toBe(ALPHANUMERIC_CNPJ)
    expect(createManifestSchema.safeParse(manifestBodyWithContractor('12345678901')).success).toBe(
      true,
    )
    expect(createManifestSchema.safeParse(manifestBodyWithContractor('')).success).toBe(true)
    expect(
      createManifestSchema.safeParse(manifestBodyWithContractor(OUT_OF_ALPHABET_CNPJ)).success,
    ).toBe(false)
  })
})
