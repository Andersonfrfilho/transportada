/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/database.schema'

export const TRANSPORTADA_PERMISSIONS = Object.freeze([
  'companies.manage',
  'users.manage',
  'invoices.import',
  'invoices.read',
  'batches.create',
  'batches.approve',
  'freight.simulate',
  'cte.manage',
  'cte.submit',
  'cte.issue',
  'cte.cancel',
  'cte.read',
  'billing.create',
  'billing.cancel',
  'billing.read',
  'settings.manage',
  'operations.read',
  'audit.read',
  'view-preferences.manage',
  // Consultar CEP serve três formulários com permissões diferentes, e a política de rota admite
  // uma só — daí a permissão própria, dada a quem já escreve endereço em alguma dessas telas
  'addresses.read',
  'fleet.read',
  'fleet.manage',
  'mdfe.read',
  'mdfe.manage',
  'mdfe.issue',
  'mdfe.close',
  'mdfe.cancel',
  'nfse.manage',
  'nfse.issue',
  'nfse.cancel',
  'nfse.read',
  'trip.read',
  'trip.manage',
  'trip.report',
] as const)

export type TransportadaPermission = (typeof TRANSPORTADA_PERMISSIONS)[number]
export type CompanyPermission = Exclude<TransportadaPermission, 'companies.manage'>

export const COMPANY_ROLE_PERMISSIONS = Object.freeze({
  // Instalação dedicada: o company-admin é o dono do ambiente e precisa dar entrada em nota,
  // faturar e emitir a nota de serviço do que faturou — só o finance tinha billing.create, e o
  // finance nem enxerga a lista de CT-e
  'company-admin': Object.freeze([
    'users.manage',
    'invoices.import',
    'invoices.read',
    'cte.manage',
    'cte.submit',
    'cte.read',
    'billing.create',
    'billing.cancel',
    'billing.read',
    'settings.manage',
    'operations.read',
    'audit.read',
    'view-preferences.manage',
    'addresses.read',
    'fleet.read',
    'fleet.manage',
    'mdfe.read',
    'mdfe.manage',
    'nfse.manage',
    'nfse.issue',
    'nfse.cancel',
    'nfse.read',
    'trip.manage',
  ]),
  finance: Object.freeze([
    'cte.read',
    'billing.create',
    'billing.cancel',
    'billing.read',
    'operations.read',
    'view-preferences.manage',
    'nfse.read',
  ]),
  fiscal: Object.freeze([
    'invoices.import',
    'invoices.read',
    'batches.create',
    'batches.approve',
    'freight.simulate',
    'cte.manage',
    'cte.submit',
    'cte.issue',
    'cte.cancel',
    'cte.read',
    'operations.read',
    'view-preferences.manage',
    'addresses.read',
    'fleet.read',
    'mdfe.read',
    'mdfe.manage',
    'mdfe.issue',
    'mdfe.close',
    'mdfe.cancel',
    'nfse.manage',
    'nfse.issue',
    'nfse.cancel',
    'nfse.read',
  ]),
  operator: Object.freeze([
    'invoices.import',
    'invoices.read',
    'batches.create',
    'freight.simulate',
    'cte.manage',
    'cte.submit',
    'cte.read',
    'operations.read',
    'view-preferences.manage',
    'addresses.read',
    'fleet.read',
    'fleet.manage',
    'mdfe.read',
    'mdfe.manage',
    'nfse.manage',
    'nfse.read',
    'trip.manage',
  ]),
  viewer: Object.freeze([
    'invoices.read',
    'cte.read',
    'operations.read',
    'view-preferences.manage',
    'fleet.read',
    'mdfe.read',
    'nfse.read',
  ]),
  // O motorista é papel de campo: só a própria viagem, nada de nota, CT-e, faturamento ou frota
  driver: Object.freeze(['trip.read', 'trip.report']),
  // O agregado dirige o veículo dele; o motorista, o dele ou o da empresa. Na tela isso muda
  // que campo o cadastro exige, não o que a conta pode ler — daí o mesmo par de permissões.
  aggregate: Object.freeze(['trip.read', 'trip.report']),
  // O separador monta a viagem do celular: lê a nota que bipa, lê a frota para escolher veículo e
  // motorista, e escreve a viagem. Ele não cadastra frota, não fatura e não emite documento fiscal
  // — e não reporta entrega, que é do campo.
  separator: Object.freeze(['invoices.read', 'fleet.read', 'trip.read', 'trip.manage']),
} satisfies Readonly<Record<CompanyRole, readonly CompanyPermission[]>>)

export type CompanyAuthorizationPolicy = {
  readonly permission: CompanyPermission
  readonly scope: 'company'
}

export type PlatformAuthorizationPolicy = {
  readonly permission: 'companies.manage'
  readonly scope: 'platform'
}

export type RouteAuthorizationPolicy = CompanyAuthorizationPolicy | PlatformAuthorizationPolicy

export function resolveCompanyPermissions(
  roles: readonly CompanyRole[],
): ReadonlySet<CompanyPermission> {
  const granted = new Set<CompanyPermission>()
  for (const role of roles) {
    for (const permission of COMPANY_ROLE_PERMISSIONS[role]) {
      granted.add(permission)
    }
  }

  const ordered = TRANSPORTADA_PERMISSIONS.filter(
    (permission): permission is CompanyPermission =>
      permission !== 'companies.manage' && granted.has(permission),
  )
  return createReadonlySet(ordered)
}

function createReadonlySet<TValue>(values: readonly TValue[]): ReadonlySet<TValue> {
  const internal = new Set(values)
  const methods = new Set<PropertyKey>([
    'difference',
    'entries',
    'has',
    'intersection',
    'isDisjointFrom',
    'isSubsetOf',
    'isSupersetOf',
    'keys',
    'symmetricDifference',
    'union',
    'values',
    Symbol.iterator,
  ])
  const view = new Proxy(internal, {
    get(target, property) {
      if (property === 'forEach') {
        return (
          callback: (value: TValue, value2: TValue, set: ReadonlySet<TValue>) => void,
          thisArg?: unknown,
        ): void => {
          internal.forEach((value) =>
            callback.call(thisArg, value, value, view as ReadonlySet<TValue>),
          )
        }
      }
      if (property === 'size') {
        return internal.size
      }
      if (!methods.has(property)) {
        return undefined
      }

      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
    has(_target, property) {
      return property === 'forEach' || property === 'size' || methods.has(property)
    },
  })

  return Object.freeze(view) as ReadonlySet<TValue>
}
