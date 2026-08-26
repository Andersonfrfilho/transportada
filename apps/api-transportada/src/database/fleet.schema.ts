/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  DEFAULT_FUEL_PRODUCT,
  FUEL_PRODUCT_MAX_LENGTH,
  FUEL_PRODUCTS,
  type FuelProduct,
} from '../shared/fuel.constant.js'
import {
  IDENTITY_DOCUMENT_ISSUERS,
  IDENTITY_DOCUMENT_MAX_LENGTH,
  type IdentityDocumentIssuer,
} from '../shared/identity-document-issuer.constant.js'
import { LICENSE_CATEGORIES, type LicenseCategory } from '../shared/license-category.constant.js'
import {
  PIX_KEY_MAX_LENGTH,
  PIX_KEY_TYPES,
  type PixKeyType,
} from '../shared/pix-key-type.constant.js'
import { RNTRC_INPUT_PATTERN } from '../shared/rntrc.service.js'
import {
  VEHICLE_TYPE_MAX_LENGTH,
  VEHICLE_TYPES,
  type VehicleType,
} from '../shared/vehicle-type.constant.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { storedObjects } from './storage.schema.js'
import { inList } from './schema-check.constant.js'

export const FLEET_VEHICLE_ROLES = ['traction', 'trailer'] as const
export type FleetVehicleRole = (typeof FLEET_VEHICLE_ROLES)[number]

export const FLEET_VEHICLE_STATUSES = ['active', 'inactive'] as const
export type FleetVehicleStatus = (typeof FLEET_VEHICLE_STATUSES)[number]

/** tpRod — 01 truck, 02 toco, 03 cavalo mecânico, 04 VAN, 05 utilitário, 06 outros. */
export const MDFE_WHEEL_TYPES = ['01', '02', '03', '04', '05', '06'] as const
export type MdfeWheelType = (typeof MDFE_WHEEL_TYPES)[number]

/** tpCar — 00 não aplicável, 01 aberta, 02 fechada/baú, 03 granelera, 04 porta container, 05 sider. */
export const MDFE_BODY_TYPES = ['00', '01', '02', '03', '04', '05'] as const
export type MdfeBodyType = (typeof MDFE_BODY_TYPES)[number]

/**
 * Lista fechada — texto livre misturava "PRATA", "prata" e "prata metálico". A base é a tabela do
 * Denatran, que é o que o CRLV imprime; os cinco tons de mercado restantes ela não nomeia. Alargar
 * é seguro porque cor é cadastro: nenhum documento fiscal a transmite.
 */
export const VEHICLE_COLORS = [
  'amarela',
  'azul',
  'azul_marinho',
  'bege',
  'branca',
  'champanhe',
  'cinza',
  'creme',
  'dourada',
  'fantasia',
  'grafite',
  'grena',
  'laranja',
  'marrom',
  'prata',
  'preta',
  'rosa',
  'roxa',
  'turquesa',
  'verde',
  'vermelha',
] as const
export type VehicleColor = (typeof VEHICLE_COLORS)[number]

export const FLEET_VEHICLE_OWNERSHIPS = ['own', 'aggregate', 'third_party'] as const
export type FleetVehicleOwnership = (typeof FLEET_VEHICLE_OWNERSHIPS)[number]

/** tpProp — 0 TAC agregado, 1 TAC independente, 2 outros. */
export const MDFE_OWNER_TAX_REGIMES = ['0', '1', '2'] as const
export type MdfeOwnerTaxRegime = (typeof MDFE_OWNER_TAX_REGIMES)[number]

export const FLEET_DRIVER_STATUSES = ['active', 'inactive'] as const
export type FleetDriverStatus = (typeof FLEET_DRIVER_STATUSES)[number]

/** xNome do condutor cabe em 60 caracteres no layout 3.00. */
const DRIVER_NAME_MAX_LENGTH = 60

/**
 * Guarda de forma, não de existência: o endereço só é conferido de verdade no envio. O teto de 254
 * é o mesmo que a fronteira de identidade aplica, porque este e-mail nasce o login do motorista.
 */
const EMAIL_PATTERN = '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
const EMAIL_MAX_LENGTH = 254

/** Mercosul (AAA1A23) e o formato antigo (AAA1234) cabem no mesmo padrão, sempre sem separador. */
const PLATE_PATTERN = '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'

const STATE_PATTERN = '^[A-Z]{2}$'

const POSTAL_CODE_PATTERN = '^[0-9]{8}$'
/**
 * Data mínima para nascimento e validade de CNH. O teto seria `current_date`, mas função volátil em
 * CHECK quebra o restore do dump — quem recusa data futura de nascimento é o Zod da fronteira.
 */
const DRIVER_DATE_FLOOR = '1900-01-01'
const DRIVER_STREET_MAX_LENGTH = 120
const DRIVER_ADDRESS_NUMBER_MAX_LENGTH = 20
const DRIVER_COMPLEMENT_MAX_LENGTH = 60
const DRIVER_DISTRICT_MAX_LENGTH = 60
const DRIVER_CITY_MAX_LENGTH = 60

/** "Brasileira" e as gentílicas mais longas cabem folgado; o campo é digitado, não é catálogo. */
const DRIVER_NATIONALITY_MAX_LENGTH = 40

/** Marca livre — a FIPE não cobre implemento, e o operador digita quando o catálogo falha. */
const VEHICLE_BRAND_MAX_LENGTH = 60
const VEHICLE_MODEL_MAX_LENGTH = 120
/** cInt do MDF-e — número de frota do transportador, opcional no layout. */
const VEHICLE_FLEET_NUMBER_MAX_LENGTH = 20

const moneyColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })
/** Tara e capacidade em decimal: o operador digita 8.000,25 kg e o MDF-e arredonda na saída. */
const measureColumn = (name: string) => numeric(name, { precision: 12, scale: 2 })

export const fleetVehicles = pgTable(
  'fleet_vehicles',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    plate: text().notNull(),
    renavam: text().notNull().default(''),
    brand: text().notNull().default(''),
    model: text().notNull().default(''),
    modelYear: integer('model_year').notNull().default(0),
    color: text().notNull().default(''),
    fleetNumber: text('fleet_number').notNull().default(''),
    role: text().$type<FleetVehicleRole>().notNull(),
    status: text().$type<FleetVehicleStatus>().notNull().default('active'),
    tareWeightKg: measureColumn('tare_weight_kg').notNull().default('0'),
    capacityKg: measureColumn('capacity_kg').notNull().default('0'),
    capacityM3: measureColumn('capacity_m3').notNull().default('0'),
    bodyType: text('body_type').$type<MdfeBodyType>().notNull().default('00'),
    axleCount: integer('axle_count').notNull().default(0),
    // O que o operador escolhe; `tipoRodado` e classe de frete saem dele por derivação
    vehicleType: varchar('vehicle_type', { length: VEHICLE_TYPE_MAX_LENGTH })
      .$type<VehicleType | ''>()
      .notNull()
      .default(''),
    state: text().notNull(),
    ownership: text().$type<FleetVehicleOwnership>().notNull().default('own'),
    ownerTaxId: text('owner_tax_id').notNull().default(''),
    ownerName: text('owner_name').notNull().default(''),
    ownerState: text('owner_state').notNull().default(''),
    ownerRntrc: text('owner_rntrc').notNull().default(''),
    ownerTaxRegime: text('owner_tax_regime').$type<MdfeOwnerTaxRegime | ''>().notNull().default(''),
    averageConsumption: numeric('average_consumption', { precision: 6, scale: 2 })
      .notNull()
      .default('0'),
    fuelType: varchar('fuel_type', { length: FUEL_PRODUCT_MAX_LENGTH })
      .$type<FuelProduct>()
      .notNull()
      .default(DEFAULT_FUEL_PRODUCT),
    // Vazio é "um tanque só": o flex é o par preenchido, e o híbrido é o par com `eletrico` de um lado
    secondaryFuelType: varchar('secondary_fuel_type', { length: FUEL_PRODUCT_MAX_LENGTH })
      .$type<FuelProduct | ''>()
      .notNull()
      .default(''),
    secondaryAverageConsumption: numeric('secondary_average_consumption', {
      precision: 6,
      scale: 2,
    })
      .notNull()
      .default('0'),
    otherCostsPerKilometer: moneyColumn('other_costs_per_kilometer').notNull().default('0'),
    acquisitionAmount: moneyColumn('acquisition_amount').notNull().default('0'),
    monthlyInstallmentAmount: moneyColumn('monthly_installment_amount').notNull().default('0'),
    annualVehicleTaxAmount: moneyColumn('annual_vehicle_tax_amount').notNull().default('0'),
    annualInsuranceAmount: moneyColumn('annual_insurance_amount').notNull().default('0'),
    costsUpdatedAt: timestamp('costs_updated_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'fleet_vehicles_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('fleet_vehicles_company_id_id_unique').on(table.companyId, table.id),
    unique('fleet_vehicles_company_id_plate_unique').on(table.companyId, table.plate),
    index('fleet_vehicles_company_status_plate_idx').on(table.companyId, table.status, table.plate),
    check('fleet_vehicles_plate_check', sql`${table.plate} ~ ${sql.raw(`'${PLATE_PATTERN}'`)}`),
    check(
      'fleet_vehicles_renavam_check',
      sql`length(${table.renavam}) = 0 or ${table.renavam} ~ '^[0-9]{9,11}$'`,
    ),
    check(
      'fleet_vehicles_brand_check',
      sql`length(${table.brand}) <= ${sql.raw(String(VEHICLE_BRAND_MAX_LENGTH))}`,
    ),
    check(
      'fleet_vehicles_model_check',
      sql`length(${table.model}) <= ${sql.raw(String(VEHICLE_MODEL_MAX_LENGTH))}`,
    ),
    check(
      'fleet_vehicles_color_check',
      sql`length(${table.color}) = 0 or ${table.color} in (${sql.raw(inList(VEHICLE_COLORS))})`,
    ),
    check(
      'fleet_vehicles_fleet_number_check',
      sql`length(${table.fleetNumber}) <= ${sql.raw(String(VEHICLE_FLEET_NUMBER_MAX_LENGTH))}`,
    ),
    // 0 é "não informado" — o motorista que buscou pela placa preenche depois, ninguém trava o salvamento
    check(
      'fleet_vehicles_model_year_check',
      sql`${table.modelYear} = 0 or ${table.modelYear} between 1900 and 2100`,
    ),
    check(
      'fleet_vehicles_role_check',
      sql`${table.role} in (${sql.raw(inList(FLEET_VEHICLE_ROLES))})`,
    ),
    check(
      'fleet_vehicles_status_check',
      sql`${table.status} in (${sql.raw(inList(FLEET_VEHICLE_STATUSES))})`,
    ),
    check(
      'fleet_vehicles_capacity_check',
      sql`${table.tareWeightKg} >= 0 and ${table.capacityKg} >= 0 and ${table.capacityM3} >= 0`,
    ),
    // 0 é "não informado" em todo campo de custo — nenhum motorista trava o cadastro por falta de nota
    check(
      'fleet_vehicles_cost_check',
      sql`${table.averageConsumption} >= 0 and ${table.secondaryAverageConsumption} >= 0 and ${table.otherCostsPerKilometer} >= 0 and ${table.acquisitionAmount} >= 0 and ${table.monthlyInstallmentAmount} >= 0 and ${table.annualVehicleTaxAmount} >= 0 and ${table.annualInsuranceAmount} >= 0`,
    ),
    // Implemento não tem tipo: quem traciona é que é moto, VAN ou cavalo mecânico
    check(
      'fleet_vehicles_vehicle_type_check',
      sql`(${table.role} = 'traction') = (${table.vehicleType} in (${sql.raw(inList(VEHICLE_TYPES))}))`,
    ),
    check(
      'fleet_vehicles_body_type_check',
      sql`${table.bodyType} in (${sql.raw(inList(MDFE_BODY_TYPES))})`,
    ),
    check(
      'fleet_vehicles_axle_count_check',
      sql`${table.axleCount} = 0 or ${table.axleCount} between 2 and 9`,
    ),
    check(
      'fleet_vehicles_state_check',
      sql`${table.state} ~ ${sql.raw(`'${STATE_PATTERN}'`)} and (length(${table.ownerState}) = 0 or ${table.ownerState} ~ ${sql.raw(`'${STATE_PATTERN}'`)})`,
    ),
    check(
      'fleet_vehicles_fuel_type_check',
      sql`${table.fuelType} in (${sql.raw(inList(FUEL_PRODUCTS))})`,
    ),
    // Consumo do segundo tanque sem o segundo produto é número órfão, e ele entraria na média do R$/km
    check(
      'fleet_vehicles_secondary_fuel_check',
      sql`case when length(${table.secondaryFuelType}) = 0 then ${table.secondaryAverageConsumption} = 0 else ${table.secondaryFuelType} in (${sql.raw(inList(FUEL_PRODUCTS))}) and ${table.secondaryFuelType} <> ${table.fuelType} end`,
    ),
    check(
      'fleet_vehicles_ownership_check',
      sql`${table.ownership} in (${sql.raw(inList(FLEET_VEHICLE_OWNERSHIPS))})`,
    ),
    check(
      'fleet_vehicles_owner_check',
      sql`case when ${table.ownership} = 'own' then length(${table.ownerTaxId}) = 0 and length(${table.ownerName}) = 0 and length(${table.ownerState}) = 0 and length(${table.ownerRntrc}) = 0 and length(${table.ownerTaxRegime}) = 0 else length(${table.ownerTaxId}) > 0 and length(${table.ownerName}) > 0 and length(${table.ownerState}) > 0 and length(${table.ownerRntrc}) > 0 and length(${table.ownerTaxRegime}) > 0 end`,
    ),
    check(
      'fleet_vehicles_owner_tax_id_check',
      sql`length(${table.ownerTaxId}) = 0 or ${table.ownerTaxId} ~ '^[0-9]{11}$' or ${table.ownerTaxId} ~ '^[A-Z0-9]{12}[0-9]{2}$'`,
    ),
    check(
      'fleet_vehicles_owner_rntrc_check',
      sql`length(${table.ownerRntrc}) = 0 or ${table.ownerRntrc} ~ ${sql.raw(`'${RNTRC_INPUT_PATTERN}'`)}`,
    ),
    check(
      'fleet_vehicles_owner_tax_regime_check',
      sql`length(${table.ownerTaxRegime}) = 0 or ${table.ownerTaxRegime} in (${sql.raw(inList(MDFE_OWNER_TAX_REGIMES))})`,
    ),
    check('fleet_vehicles_version_check', sql`${table.version} > 0`),
  ],
)

export const fleetDrivers = pgTable(
  'fleet_drivers',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    membershipId: uuid('membership_id'),
    name: text().notNull(),
    taxId: text('tax_id').notNull(),
    linkedTaxId: text('linked_tax_id').notNull().default(''),
    linkedLegalName: text('linked_legal_name').notNull().default(''),
    licenseNumber: text('license_number').notNull().default(''),
    licenseCategory: text('license_category').$type<LicenseCategory | ''>().notNull().default(''),
    licenseExpiresAt: date('license_expires_at'),
    firstLicenseAt: date('first_license_at'),
    birthDate: date('birth_date'),
    nationality: text().notNull().default(''),
    birthCity: text('birth_city').notNull().default(''),
    birthState: text('birth_state').notNull().default(''),
    fatherName: text('father_name').notNull().default(''),
    motherName: text('mother_name').notNull().default(''),
    identityDocument: text('identity_document').notNull().default(''),
    identityDocumentIssuer: text('identity_document_issuer')
      .$type<IdentityDocumentIssuer | ''>()
      .notNull()
      .default(''),
    identityDocumentState: text('identity_document_state').notNull().default(''),
    licenseIssuedCity: text('license_issued_city').notNull().default(''),
    licenseIssuedState: text('license_issued_state').notNull().default(''),
    email: text().notNull().default(''),
    phone: text().notNull().default(''),
    rntrc: text().notNull().default(''),
    anttCategory: text('antt_category').$type<MdfeOwnerTaxRegime | ''>().notNull().default(''),
    pixKeyType: text('pix_key_type').$type<PixKeyType | ''>().notNull().default(''),
    pixKey: text('pix_key').notNull().default(''),
    postalCode: text('postal_code').notNull().default(''),
    street: text().notNull().default(''),
    number: text().notNull().default(''),
    complement: text().notNull().default(''),
    district: text().notNull().default(''),
    city: text().notNull().default(''),
    state: text().notNull().default(''),
    linkedPostalCode: text('linked_postal_code').notNull().default(''),
    linkedStreet: text('linked_street').notNull().default(''),
    linkedNumber: text('linked_number').notNull().default(''),
    linkedComplement: text('linked_complement').notNull().default(''),
    linkedDistrict: text('linked_district').notNull().default(''),
    linkedCity: text('linked_city').notNull().default(''),
    linkedState: text('linked_state').notNull().default(''),
    status: text().$type<FleetDriverStatus>().notNull().default('active'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'fleet_drivers_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.membershipId, table.companyId],
      foreignColumns: [userCompanyMemberships.id, userCompanyMemberships.companyId],
      name: 'fleet_drivers_company_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('fleet_drivers_company_id_id_unique').on(table.companyId, table.id),
    unique('fleet_drivers_company_id_tax_id_unique').on(table.companyId, table.taxId),
    uniqueIndex('fleet_drivers_company_membership_unique')
      .on(table.companyId, table.membershipId)
      .where(sql`${table.membershipId} is not null`),
    // Parcial porque a CNH é opcional: dois motoristas sem habilitação cadastrada não colidem
    uniqueIndex('fleet_drivers_company_license_number_unique')
      .on(table.companyId, table.licenseNumber)
      .where(sql`length(${table.licenseNumber}) > 0`),
    index('fleet_drivers_company_status_name_idx').on(table.companyId, table.status, table.name),
    // Parcial porque a coluna admite vazio: CEP em branco não é endereço de ninguém
    index('fleet_drivers_company_postal_code_idx')
      .on(table.companyId, table.postalCode)
      .where(sql`length(${table.postalCode}) > 0`),
    check('fleet_drivers_tax_id_check', sql`${table.taxId} ~ '^[0-9]{11}$'`),
    // O condutor do MDF-e é sempre pessoa física — o CNPJ do autônomo acompanha o CPF, nunca o substitui
    check(
      'fleet_drivers_linked_tax_id_check',
      sql`length(${table.linkedTaxId}) = 0 or ${table.linkedTaxId} ~ '^[A-Z0-9]{12}[0-9]{2}$'`,
    ),
    check(
      'fleet_drivers_name_check',
      sql`length(${table.name}) > 0 and length(${table.name}) <= ${sql.raw(String(DRIVER_NAME_MAX_LENGTH))}`,
    ),
    // Razão social sem CNPJ não tem dono. A metade contrária fica solta de propósito: ficha
    // cadastrada antes deste campo tem CNPJ e não tem razão social, e ninguém a inventa numa migration.
    check(
      'fleet_drivers_linked_legal_name_check',
      sql`length(${table.linkedLegalName}) <= ${sql.raw(String(DRIVER_NAME_MAX_LENGTH))} and (length(${table.linkedLegalName}) = 0 or length(${table.linkedTaxId}) > 0)`,
    ),
    check(
      'fleet_drivers_email_check',
      sql`length(${table.email}) = 0 or (length(${table.email}) <= ${sql.raw(String(EMAIL_MAX_LENGTH))} and ${table.email} ~ ${sql.raw(`'${EMAIL_PATTERN}'`)})`,
    ),
    check(
      'fleet_drivers_rntrc_check',
      sql`length(${table.rntrc}) = 0 or ${table.rntrc} ~ ${sql.raw(`'${RNTRC_INPUT_PATTERN}'`)}`,
    ),
    check(
      'fleet_drivers_license_category_check',
      sql`length(${table.licenseCategory}) = 0 or ${table.licenseCategory} in (${sql.raw(inList(LICENSE_CATEGORIES))})`,
    ),
    check(
      'fleet_drivers_antt_category_check',
      sql`length(${table.anttCategory}) = 0 or ${table.anttCategory} in (${sql.raw(inList(MDFE_OWNER_TAX_REGIMES))})`,
    ),
    check(
      'fleet_drivers_pix_key_type_check',
      sql`length(${table.pixKeyType}) = 0 or ${table.pixKeyType} in (${sql.raw(inList(PIX_KEY_TYPES))})`,
    ),
    check(
      'fleet_drivers_pix_key_check',
      sql`length(${table.pixKey}) <= ${sql.raw(String(PIX_KEY_MAX_LENGTH))} and (length(${table.pixKey}) = 0) = (length(${table.pixKeyType}) = 0)`,
    ),
    check(
      'fleet_drivers_license_number_check',
      sql`length(${table.licenseNumber}) = 0 or ${table.licenseNumber} ~ '^[0-9]{11}$'`,
    ),
    check(
      'fleet_drivers_phone_check',
      sql`length(${table.phone}) = 0 or ${table.phone} ~ '^[0-9]{10,11}$'`,
    ),
    check(
      'fleet_drivers_dates_check',
      sql`(${table.birthDate} is null or ${table.birthDate} >= ${sql.raw(`date '${DRIVER_DATE_FLOOR}'`)}) and (${table.licenseExpiresAt} is null or ${table.licenseExpiresAt} >= ${sql.raw(`date '${DRIVER_DATE_FLOOR}'`)}) and (${table.firstLicenseAt} is null or ${table.firstLicenseAt} >= ${sql.raw(`date '${DRIVER_DATE_FLOOR}'`)})`,
    ),
    check(
      'fleet_drivers_postal_code_check',
      sql`length(${table.postalCode}) = 0 or ${table.postalCode} ~ ${sql.raw(`'${POSTAL_CODE_PATTERN}'`)}`,
    ),
    // A UF da naturalidade e a do DETRAN emissor seguem o padrão da UF do endereço; nenhuma das
    // duas exige a outra metade preenchida — ficha antiga tem cidade e não tem estado.
    check(
      'fleet_drivers_birth_state_check',
      sql`length(${table.birthState}) = 0 or ${table.birthState} ~ ${sql.raw(`'${STATE_PATTERN}'`)}`,
    ),
    check(
      'fleet_drivers_license_issued_state_check',
      sql`length(${table.licenseIssuedState}) = 0 or ${table.licenseIssuedState} ~ ${sql.raw(`'${STATE_PATTERN}'`)}`,
    ),
    // O trio do documento de identidade que a CNH imprime. O órgão é lista fechada e a UF segue o
    // padrão das outras; o número só tem teto, porque cada estado numera o RG do seu jeito. As três
    // metades ficam soltas de propósito: quem tem só o número na mão preenche só ele.
    check(
      'fleet_drivers_identity_document_issuer_check',
      sql`length(${table.identityDocumentIssuer}) = 0 or ${table.identityDocumentIssuer} in (${sql.raw(inList(IDENTITY_DOCUMENT_ISSUERS))})`,
    ),
    check(
      'fleet_drivers_identity_document_state_check',
      sql`length(${table.identityDocumentState}) = 0 or ${table.identityDocumentState} ~ ${sql.raw(`'${STATE_PATTERN}'`)}`,
    ),
    check(
      'fleet_drivers_identity_document_check',
      sql`length(${table.identityDocument}) <= ${sql.raw(String(IDENTITY_DOCUMENT_MAX_LENGTH))}`,
    ),
    check(
      'fleet_drivers_personal_length_check',
      sql`length(${table.nationality}) <= ${sql.raw(String(DRIVER_NATIONALITY_MAX_LENGTH))} and length(${table.birthCity}) <= ${sql.raw(String(DRIVER_CITY_MAX_LENGTH))} and length(${table.fatherName}) <= ${sql.raw(String(DRIVER_NAME_MAX_LENGTH))} and length(${table.motherName}) <= ${sql.raw(String(DRIVER_NAME_MAX_LENGTH))} and length(${table.licenseIssuedCity}) <= ${sql.raw(String(DRIVER_CITY_MAX_LENGTH))}`,
    ),
    check(
      'fleet_drivers_address_state_check',
      sql`length(${table.state}) = 0 or ${table.state} ~ ${sql.raw(`'${STATE_PATTERN}'`)}`,
    ),
    check(
      'fleet_drivers_address_length_check',
      sql`length(${table.street}) <= ${sql.raw(String(DRIVER_STREET_MAX_LENGTH))} and length(${table.number}) <= ${sql.raw(String(DRIVER_ADDRESS_NUMBER_MAX_LENGTH))} and length(${table.complement}) <= ${sql.raw(String(DRIVER_COMPLEMENT_MAX_LENGTH))} and length(${table.district}) <= ${sql.raw(String(DRIVER_DISTRICT_MAX_LENGTH))} and length(${table.city}) <= ${sql.raw(String(DRIVER_CITY_MAX_LENGTH))}`,
    ),
    // O endereço da empresa do agregado segue a forma do residencial, e nenhuma metade exige a
    // outra: quem tem só o CEP em mãos preenche só ele. Endereço de pessoa jurídica não é dado
    // pessoal — ele fica em claro, fora do envelope da ADR-0039.
    check(
      'fleet_drivers_linked_postal_code_check',
      sql`length(${table.linkedPostalCode}) = 0 or ${table.linkedPostalCode} ~ ${sql.raw(`'${POSTAL_CODE_PATTERN}'`)}`,
    ),
    check(
      'fleet_drivers_linked_state_check',
      sql`length(${table.linkedState}) = 0 or ${table.linkedState} ~ ${sql.raw(`'${STATE_PATTERN}'`)}`,
    ),
    check(
      'fleet_drivers_linked_address_length_check',
      sql`length(${table.linkedStreet}) <= ${sql.raw(String(DRIVER_STREET_MAX_LENGTH))} and length(${table.linkedNumber}) <= ${sql.raw(String(DRIVER_ADDRESS_NUMBER_MAX_LENGTH))} and length(${table.linkedComplement}) <= ${sql.raw(String(DRIVER_COMPLEMENT_MAX_LENGTH))} and length(${table.linkedDistrict}) <= ${sql.raw(String(DRIVER_DISTRICT_MAX_LENGTH))} and length(${table.linkedCity}) <= ${sql.raw(String(DRIVER_CITY_MAX_LENGTH))}`,
    ),
    check(
      'fleet_drivers_status_check',
      sql`${table.status} in (${sql.raw(inList(FLEET_DRIVER_STATUSES))})`,
    ),
    check('fleet_drivers_version_check', sql`${table.version} > 0`),
  ],
)

export const fleetDriverVehicleAssignments = pgTable(
  'fleet_driver_vehicle_assignments',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'fleet_driver_vehicle_assignments_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'fleet_driver_vehicle_assignments_company_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'fleet_driver_vehicle_assignments_company_vehicle_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('fleet_driver_vehicle_assignments_company_id_id_unique').on(table.companyId, table.id),
    uniqueIndex('fleet_driver_vehicle_assignments_live_link_unique')
      .on(table.companyId, table.driverId, table.vehicleId)
      .where(sql`${table.releasedAt} is null`),
    index('fleet_driver_vehicle_assignments_company_driver_assigned_at_idx').on(
      table.companyId,
      table.driverId,
      table.assignedAt,
    ),
    index('fleet_driver_vehicle_assignments_company_vehicle_idx').on(
      table.companyId,
      table.vehicleId,
    ),
    check(
      'fleet_driver_vehicle_assignments_period_check',
      sql`${table.releasedAt} is null or ${table.releasedAt} >= ${table.assignedAt}`,
    ),
  ],
)

/**
 * Vincula a conta do agregado (schema `user`, de outro módulo) ao CPF, não à ficha — a conta pode
 * nascer **antes** da aprovação (candidatura ainda pendente, sem `fleet_drivers` nenhuma ainda), e
 * o portal resolve o status lendo `aggregate_applications`/`fleet_drivers` por este CPF em tempo de
 * leitura (064/T2, T3). `userId` é referência, não FK — `user.users` vive num pg schema à parte,
 * dono de outro pacote, e a fronteira entre os dois só se cruza aqui. Um CPF tem no máximo uma
 * conta; uma conta, no máximo um CPF — as duas pontas são `unique`.
 */
export const aggregateAccounts = pgTable(
  'aggregate_accounts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: varchar('tax_id', { length: 14 }).notNull(),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'aggregate_accounts_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('aggregate_accounts_company_tax_id_unique').on(table.companyId, table.taxId),
    unique('aggregate_accounts_user_id_unique').on(table.userId),
  ],
)

export const AGGREGATE_DOCUMENT_TYPES = ['cnh', 'crlv'] as const
export type AggregateDocumentType = (typeof AGGREGATE_DOCUMENT_TYPES)[number]

export const AGGREGATE_DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const
export type AggregateDocumentStatus = (typeof AGGREGATE_DOCUMENT_STATUSES)[number]

/**
 * Um documento por (CPF, tipo) — reenvio depois de recusado **atualiza** a mesma linha (novo
 * `stored_object_id`, status volta a `pending`, motivo de recusa some), em vez de acumular
 * histórico: só a versão mais recente importa pra revisão (mesmo espírito do reenvio de
 * candidatura na 053). `tax_id`, não `driver_id`, pela mesma razão da conta (T2) — o agregado
 * pode enviar documento antes da aprovação.
 */
export const aggregateDocuments = pgTable(
  'aggregate_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: varchar('tax_id', { length: 14 }).notNull(),
    type: text().$type<AggregateDocumentType>().notNull(),
    status: text().$type<AggregateDocumentStatus>().notNull().default('pending'),
    rejectionReason: text('rejection_reason').notNull().default(''),
    storedObjectId: uuid('stored_object_id').notNull(),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'aggregate_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.storedObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'aggregate_documents_company_stored_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('aggregate_documents_company_tax_id_type_unique').on(
      table.companyId,
      table.taxId,
      table.type,
    ),
    check('aggregate_documents_type_check', sql`${table.type} in ('cnh', 'crlv')`),
    check(
      'aggregate_documents_status_check',
      sql`${table.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      'aggregate_documents_review_check',
      sql`(${table.reviewedBy} is null) = (${table.reviewedAt} is null)`,
    ),
    check(
      'aggregate_documents_rejection_reason_check',
      sql`(${table.status} = 'rejected') = (length(${table.rejectionReason}) > 0)`,
    ),
  ],
)
