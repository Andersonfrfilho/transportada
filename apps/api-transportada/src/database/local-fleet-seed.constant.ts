/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriverInput } from '../fleet/application/fleet.port.js'
import type { FleetDriverProfile } from '../fleet/domain/fleet-driver-profile.constant.js'

export type LocalFleetDriverSeed = {
  readonly driver: Omit<FleetDriverInput, 'membershipId'>
  readonly profile: FleetDriverProfile
}

type SeedParams = {
  readonly anttCategory?: FleetDriverInput['anttCategory']
  readonly birthDate: string
  readonly city: string
  readonly district: string
  readonly licenseNumber: string
  readonly linkedLegalName?: string
  readonly linkedTaxId?: string
  readonly name: string
  readonly number: string
  readonly phone: string
  readonly postalCode: string
  readonly profile: FleetDriverProfile
  readonly rntrc?: string
  readonly state: string
  readonly street: string
  readonly taxId: string
}

/** O e-mail é o contato do convite, então ele nasce do documento — dois motoristas nunca colidem. */
function buildSeedEmail(taxId: string): string {
  return `motorista.${taxId}@transportada.local`
}

function buildSeed(params: SeedParams): LocalFleetDriverSeed {
  return {
    driver: {
      address: {
        city: params.city,
        complement: '',
        district: params.district,
        number: params.number,
        postalCode: params.postalCode,
        state: params.state,
        street: params.street,
      },
      anttCategory: params.anttCategory ?? '',
      birthCity: '',
      birthDate: params.birthDate,
      birthState: '',
      email: buildSeedEmail(params.taxId),
      // Filiação, naturalidade e RG ficam em branco no seed: são dado de pessoa real, e o seed é local
      fatherName: '',
      identityDocument: '',
      identityDocumentIssuer: '',
      identityDocumentState: '',
      licenseCategory: 'E',
      firstLicenseAt: '2008-03-14',
      licenseExpiresAt: '2029-12-31',
      licenseIssuedCity: params.city,
      licenseIssuedState: params.state,
      licenseNumber: params.licenseNumber,
      linkedAddress: {
        city: '',
        complement: '',
        district: '',
        number: '',
        postalCode: '',
        state: '',
        street: '',
      },
      linkedLegalName: params.linkedLegalName ?? '',
      linkedTaxId: params.linkedTaxId ?? '',
      motherName: '',
      name: params.name,
      nationality: 'Brasileira',
      phone: params.phone,
      pixKey: '',
      pixKeyType: '',
      rntrc: params.rntrc ?? '',
      taxId: params.taxId,
    },
    profile: params.profile,
  }
}

/**
 * Fictícios de propósito: a semente é de ambiente descartável, e documento de pessoa real não entra
 * em repositório. O agregado leva RNTRC e categoria ANTT porque é ele quem aparece como proprietário
 * do veículo no MDF-e; o motorista da casa dirige o veículo da transportadora e não tem registro.
 */
export const LOCAL_FLEET_DRIVER_SEEDS: readonly LocalFleetDriverSeed[] = [
  buildSeed({
    anttCategory: '0',
    birthDate: '1979-04-12',
    city: 'Ribeirão Preto',
    district: 'Jardim Paulista',
    licenseNumber: '04812376590',
    linkedLegalName: 'ROCHA TRANSPORTES AGREGADOS LTDA',
    linkedTaxId: '19131243000197',
    name: 'Adalberto Rocha',
    number: '480',
    phone: '16988120045',
    postalCode: '14020210',
    profile: 'aggregate',
    rntrc: '58151044',
    state: 'SP',
    street: 'Avenida Independência',
    taxId: '31820947016',
  }),
  buildSeed({
    anttCategory: '1',
    birthDate: '1985-09-30',
    city: 'Barrinha',
    district: 'Centro',
    licenseNumber: '07219845331',
    name: 'Cleiton Marques de Sá',
    number: '112',
    phone: '16991450078',
    postalCode: '14290000',
    profile: 'aggregate',
    rntrc: '41230876',
    state: 'SP',
    street: 'Rua São Benedito',
    taxId: '54730218094',
  }),
  buildSeed({
    anttCategory: '2',
    birthDate: '1972-01-25',
    city: 'Sertãozinho',
    district: 'Vila Formosa',
    licenseNumber: '02914773108',
    linkedLegalName: 'TRANSPORTES DIAS COOPERADOS LTDA',
    linkedTaxId: '45115180000105',
    name: 'Eurides Dias Fontes',
    number: '2043',
    phone: '16987330211',
    postalCode: '14170480',
    profile: 'aggregate',
    rntrc: '069450123',
    state: 'SP',
    street: 'Rua Antônio Fagundes',
    taxId: '77605412083',
  }),
  buildSeed({
    birthDate: '1990-06-18',
    city: 'Ribeirão Preto',
    district: 'Ipiranga',
    licenseNumber: '08340192276',
    name: 'Fabiana Teixeira Lopes',
    number: '75',
    phone: '16992004417',
    postalCode: '14055340',
    profile: 'driver',
    state: 'SP',
    street: 'Rua Aureliano Guimarães',
    taxId: '20418663057',
  }),
  buildSeed({
    birthDate: '1994-11-07',
    city: 'Jaboticabal',
    district: 'Nova Jaboticabal',
    licenseNumber: '09628410534',
    name: 'Getúlio Ramos Prado',
    number: '318',
    phone: '16993870562',
    postalCode: '14870300',
    profile: 'driver',
    state: 'SP',
    street: 'Avenida 13 de Maio',
    taxId: '63297150421',
  }),
  buildSeed({
    birthDate: '1988-02-03',
    city: 'Pontal',
    district: 'Jardim Alvorada',
    licenseNumber: '05517330982',
    name: 'Ivanilde Souza Barreto',
    number: '990',
    phone: '16990112238',
    postalCode: '14180000',
    profile: 'driver',
    state: 'SP',
    street: 'Rua Sete de Setembro',
    taxId: '48136270935',
  }),
]
