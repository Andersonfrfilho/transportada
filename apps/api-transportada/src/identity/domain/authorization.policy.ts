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
  'cte.issue',
  'cte.cancel',
  'cte.read',
  'billing.create',
  'billing.cancel',
  'billing.read',
  'settings.manage',
  'audit.read',
] as const)

export type TransportadaPermission = (typeof TRANSPORTADA_PERMISSIONS)[number]
export type CompanyPermission = Exclude<TransportadaPermission, 'companies.manage'>

export const COMPANY_ROLE_PERMISSIONS = Object.freeze({
  'company-admin': Object.freeze([
    'users.manage',
    'invoices.read',
    'cte.read',
    'billing.read',
    'settings.manage',
    'audit.read',
  ]),
  finance: Object.freeze(['cte.read', 'billing.create', 'billing.cancel', 'billing.read']),
  fiscal: Object.freeze([
    'invoices.import',
    'invoices.read',
    'batches.create',
    'batches.approve',
    'freight.simulate',
    'cte.issue',
    'cte.cancel',
    'cte.read',
  ]),
  operator: Object.freeze([
    'invoices.import',
    'invoices.read',
    'batches.create',
    'freight.simulate',
    'cte.read',
  ]),
  viewer: Object.freeze(['invoices.read', 'cte.read']),
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
