/* Copyright (c) 2026 Ada Technology. MIT License. */
import { canOpenWorkspace } from './workspaceAccess.service'
import type { WorkspaceKey } from './workspaceNavigation.constant'

/**
 * Spec 221 RF-D2/RF-D3: a parede de página decide pelo mesmo mapa do menu, e decide **aqui** — numa
 * função pura que o contrato exercita com conjuntos de permissão. Enquanto a condição morava dentro
 * do componente, o teste só podia afirmar que a fonte continha certas palavras, e inverter o `!`
 * deixava a suíte verde com a parede desligada.
 *
 * `companyId` ausente é parede porque sem empresa no contexto nenhuma consulta da tela tem alvo.
 */
export function isWorkspaceForbidden(
  input: Readonly<{
    companyId: string | undefined
    permissions: readonly string[]
    workspace: WorkspaceKey
  }>,
): boolean {
  if (input.companyId === undefined) return true
  return !canOpenWorkspace({ permissions: input.permissions, workspace: input.workspace })
}
