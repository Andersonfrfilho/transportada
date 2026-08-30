/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/database.schema'

export const TRANSPORTADA_PERMISSIONS = Object.freeze([
  'companies.manage',
  'users.manage',
  /**
   * Ver o contato e o documento sem máscara é permissão própria, separada de administrar usuários:
   * quem convida, suspende e troca papéis não precisa ler o CPF de todo mundo para fazer isso. Toda
   * revelação grava trilha de auditoria (`security.md` §10) — é acesso a dado pessoal, com nome.
   */
  'users.reveal',
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
  /**
   * Spec 061 D4: dinheiro tem permissão própria. Quem monta a viagem não precisa saber a margem, e
   * o valor pago ao motorista é dado sensível para o próprio motorista — que tem `trip.read`.
   */
  'trip.financials',
  /**
   * ADR-0047 §4: escopo enumerado, e ele é de **uma rota**. O serviço não recebe `mdfe.manage` —
   * que também descarta manifesto —, e sim a permissão criada para o gatilho automático.
   */
  'mdfe.auto-issue',
  /** ADR-0050: o contratante acompanha a entrega das notas amarradas à conta dele. */
  'deliveries.track',
  /** ADR-0050 §6: decidir repasse é dinheiro, e não sai de carona com acompanhar entrega. */
  'charges.decide',
] as const)

export type TransportadaPermission = (typeof TRANSPORTADA_PERMISSIONS)[number]
export type CompanyPermission = Exclude<TransportadaPermission, 'companies.manage'>

export const COMPANY_ROLE_PERMISSIONS = Object.freeze({
  // Instalação dedicada: o company-admin é o dono do ambiente e precisa dar entrada em nota,
  // faturar e emitir a nota de serviço do que faturou — só o finance tinha billing.create, e o
  // finance nem enxerga a lista de CT-e
  'company-admin': Object.freeze([
    'users.manage',
    'users.reveal',
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
    'trip.financials',
  ]),
  finance: Object.freeze([
    'cte.read',
    'trip.financials',
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
    /**
     * ADR-0049 §6: `trip.financials` **saiu daqui.** Quem monta a viagem decide se vale montá-la
     * pela avaliação prevista (065 D7), que não mostra o que se paga ao agregado — e o valor pago ao
     * motorista é dado sensível para o próprio motorista, que trabalha ao lado de quem monta.
     */
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
  /**
   * ADR-0050: o contratante lê **a entrega**, e só a das notas dos documentos dele — o recorte não
   * vem do papel, vem do vínculo, e é o repositório que o aplica. Nada de frota, faturamento ou
   * documento fiscal: quem paga o frete acompanha a carga, não administra a transportadora.
   */
  contractor: Object.freeze(['deliveries.track', 'charges.decide']),
  /**
   * ADR-0047 §4: **uma permissão, e só ela.** O token do serviço é cross-tenant — ele alcança toda
   * empresa onde exista a membership sintética —, e é por isso que o escopo não pode ser generoso.
   * Nada de leitura de nota, de frota ou de faturamento: o worker só precisa pedir o manifesto que
   * a viagem já está pronta para ter.
   */
  automation: Object.freeze(['mdfe.auto-issue']),
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
