/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §11): o rótulo do papel na API, igual ao do painel (`identity.locale.json`, `role.*`; `operator`
 * é "Operação"). Serve de cargo ao assinante do e-mail que não tem cargo livre. `contractor` e `automation` não são
 * gente da transportadora e o painel não os rotula; ficam com rótulo próprio só para o mapa ser completo.
 */
import type { CompanyRole } from '../../database/identity.schema.js'

export const COMPANY_ROLE_LABELS = {
  aggregate: 'Agregado',
  automation: 'Automação',
  'company-admin': 'Administrador',
  contractor: 'Contratante',
  driver: 'Motorista',
  finance: 'Financeiro',
  fiscal: 'Fiscal',
  helper: 'Ajudante',
  operator: 'Operação',
  separator: 'Separador',
  viewer: 'Consulta',
} as const satisfies Record<CompanyRole, string>
