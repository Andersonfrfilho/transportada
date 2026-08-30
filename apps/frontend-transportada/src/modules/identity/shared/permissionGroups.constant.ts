/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * As permissões agrupadas pela área do produto que elas guardam. O agrupamento é de apresentação —
 * a fonte da verdade é a API, que serve o catálogo e a matriz da mesma constante que o `authorize`
 * consulta. Aqui só se decide a ordem em que a pessoa lê.
 *
 * Permissão que a API servir e este mapa não conhecer **não some da tela**: ela cai em "Outras", com
 * o próprio código como rótulo. Sumir seria esconder poder concedido, que é o oposto do que esta
 * tela existe para fazer.
 */
export const PERMISSION_GROUPS = [
  { key: 'identity', permissions: ['users.manage', 'users.reveal'] },
  { key: 'invoices', permissions: ['invoices.import', 'invoices.read'] },
  { key: 'batches', permissions: ['batches.create', 'batches.approve'] },
  { key: 'cte', permissions: ['cte.manage', 'cte.submit', 'cte.issue', 'cte.cancel', 'cte.read'] },
  { key: 'freight', permissions: ['freight.simulate'] },
  { key: 'billing', permissions: ['billing.create', 'billing.cancel', 'billing.read'] },
  { key: 'fleet', permissions: ['fleet.read', 'fleet.manage'] },
  {
    key: 'trip',
    permissions: ['trip.read', 'trip.manage', 'trip.report', 'trip.financials'],
  },
  {
    key: 'mdfe',
    permissions: [
      'mdfe.read',
      'mdfe.manage',
      'mdfe.issue',
      'mdfe.close',
      'mdfe.cancel',
      'mdfe.auto-issue',
    ],
  },
  { key: 'nfse', permissions: ['nfse.read', 'nfse.manage', 'nfse.issue', 'nfse.cancel'] },
  {
    key: 'settings',
    permissions: ['settings.manage', 'addresses.read', 'view-preferences.manage'],
  },
  { key: 'operations', permissions: ['operations.read', 'audit.read'] },
  { key: 'portal', permissions: ['deliveries.track', 'charges.decide'] },
] as const

export const OTHER_PERMISSION_GROUP = 'other'

/** Agrupa o catálogo servido pela API, jogando o que este mapa não conhece em "Outras". */
export function groupPermissions(
  permissions: readonly string[],
): readonly { readonly key: string; readonly permissions: readonly string[] }[] {
  const known = new Set<string>(PERMISSION_GROUPS.flatMap((group) => [...group.permissions]))
  const served = new Set(permissions)
  const groups = PERMISSION_GROUPS.map((group) => ({
    key: group.key,
    permissions: group.permissions.filter((permission) => served.has(permission)),
  })).filter((group) => group.permissions.length > 0)

  const others = permissions.filter((permission) => !known.has(permission))
  return others.length === 0
    ? groups
    : [...groups, { key: OTHER_PERMISSION_GROUP, permissions: others }]
}
