/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_TRIP_PATH } from '@/modules/driver-trip/shared/driverWorkspace.service'

const NAVIGATION_ENTRIES = [
  { href: '/', key: 'nfe', label: 'NF-e' },
  { href: '/freight', key: 'freight', label: 'Frete' },
  { href: '/cte-batches', key: 'cte-batch', label: 'CT-e' },
  { href: '/trips', key: 'trip', label: 'Viagens' },
  { href: '/mdfe-manifests', key: 'mdfe-manifest', label: 'MDF-e' },
  { href: '/billing', key: 'billing', label: 'Faturamento' },
  { href: '/nfse-invoices', key: 'nfse-invoice', label: 'NFS-e' },
  { href: '/operations', key: 'operations', label: 'Operações' },
  { href: '/ocorrencias', key: 'trip-occurrences', label: 'Ocorrências' },
  { href: '/recebimento', key: 'cargo-receiving', label: 'Recebimento' },
  { href: '/company-settings', key: 'company-settings', label: 'Empresa' },
  { href: '/usuarios', key: 'users', label: 'Acessos' },
  { href: '/papeis', key: 'access-profiles', label: 'Papéis e grupos' },
  { href: '/cte-profiles', key: 'cte-profiles', label: 'Perfis CT-e' },
  { href: '/fleet', key: 'fleet', label: 'Frota' },
  { href: '/pendencias', key: 'pendencias', label: 'Pendências' },
  { href: '/clientes', key: 'delivery-clients', label: 'Clientes' },
  { href: '/repasses', key: 'extra-charges', label: 'Repasses' },
  { href: '/ressarcimentos', key: 'reimbursements', label: 'Ressarcimentos' },
  { href: '/resultados', key: 'trip-financials', label: 'Resultados' },
  // Só aparece no menu para quem tem trip.report (workspaceAccess.service.ts): o separador puro não a vê.
  { href: DRIVER_TRIP_PATH, key: 'driver-trip', label: 'Minha viagem' },
  // Fora dos grupos do menu de propósito: a porta de entrada é o sino do cabeçalho, e a entrada
  // existe aqui só para o título da tela sair certo quando a rota abre.
  { href: '/notificacoes', key: 'notification', label: 'Notificações' },
] as const satisfies readonly Readonly<{ href: string; key: string; label: string }>[]

export type WorkspaceKey = (typeof NAVIGATION_ENTRIES)[number]['key']

export type WorkspaceNavigationItem = Readonly<{
  href: string
  key: WorkspaceKey
  label: string
}>

export type NavigationGroup = Readonly<{
  key: 'administration' | 'fiscal' | 'identity' | 'operations' | 'registries'
  label: string
  items: readonly WorkspaceNavigationItem[]
}>

export const WORKSPACE_NAVIGATION_ITEMS: readonly WorkspaceNavigationItem[] = NAVIGATION_ENTRIES

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  {
    key: 'fiscal',
    label: 'Fiscal',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      [
        'nfe',
        'freight',
        'cte-batch',
        'trip',
        'mdfe-manifest',
        'billing',
        'extra-charges',
        'reimbursements',
        'trip-financials',
        'nfse-invoice',
      ].includes(key),
    ),
  },
  {
    key: 'operations',
    label: 'Operações',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['operations', 'trip-occurrences', 'cargo-receiving', 'driver-trip'].includes(key),
    ),
  },
  {
    key: 'registries',
    label: 'Cadastros',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['fleet', 'pendencias', 'delivery-clients', 'cte-profiles'].includes(key),
    ),
  },
  /**
   * Identidade é categoria própria, e não um item dentro de "Administração": são duas telas com o
   * mesmo assunto e a mesma permissão, e empilhá-las numa só fazia o que se usa todo dia — a
   * listagem — ficar embaixo do que se consulta uma vez por mês.
   */
  {
    key: 'identity',
    label: 'Usuários',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['users', 'access-profiles'].includes(key),
    ),
  },
  {
    key: 'administration',
    label: 'Administração',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) => key === 'company-settings'),
  },
]
