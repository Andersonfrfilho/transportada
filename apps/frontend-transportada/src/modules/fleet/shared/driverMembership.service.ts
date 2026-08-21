/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyUserSummary } from '@/modules/identity/queries/useCompanyUsers.query'

import { FLEET_FIELD_ENTRY_MODE, type FleetFieldEntryMode } from './fleet.types'

export type MembershipChoice = Readonly<{ label: string; value: string }>

/**
 * O vínculo suspenso não é oferecido: `hasMembership` exige vínculo ativo, então escolhê-lo faria a
 * gravação do motorista falhar com o erro genérico do formulário, longe da causa. Quem já está
 * gravado continua na lista mesmo suspenso — ver `buildDriverMembershipChoices`.
 */
function isOfferable(user: CompanyUserSummary): boolean {
  return user.status !== 'suspended'
}

function toLabel(user: CompanyUserSummary): string {
  const name = user.name.trim()
  return name === '' ? user.username : name
}

/**
 * Duas pessoas com o mesmo nome viram duas linhas idênticas, e escolher a errada só aparece no
 * relatório. O login desempata — e só entra quando há empate, senão toda linha carregaria um UUID.
 */
function disambiguate(users: readonly CompanyUserSummary[]): readonly MembershipChoice[] {
  const occurrences = new Map<string, number>()
  for (const user of users) {
    const label = toLabel(user)
    occurrences.set(label, (occurrences.get(label) ?? 0) + 1)
  }

  return users.map((user) => {
    const label = toLabel(user)
    const isAmbiguous = (occurrences.get(label) ?? 0) > 1
    return { label: isAmbiguous ? `${label} · ${user.username}` : label, value: user.membershipId }
  })
}

/**
 * O que já está gravado continua escolhível mesmo fora da lista — vínculo suspenso, removido ou de
 * uma consulta que não veio. O gatilho do select casa a opção pelo valor: sem a linha, ficha com
 * vínculo preenchido mostraria o placeholder, e salvar sem tocar no campo o apagaria.
 */
export function buildDriverMembershipChoices(
  input: Readonly<{ selected: string; users: readonly CompanyUserSummary[] }>,
): readonly MembershipChoice[] {
  const selected = input.selected.trim()
  const offerable = input.users.filter(isOfferable)
  const stored = input.users.find((user) => user.membershipId === selected)
  const users = stored === undefined || isOfferable(stored) ? offerable : [...offerable, stored]

  const choices = [...disambiguate(users)].sort((left, right) =>
    left.label.localeCompare(right.label, 'pt-BR'),
  )
  if (selected === '' || choices.some((choice) => choice.value === selected)) return choices

  return [...choices, { label: selected, value: selected }]
}

/**
 * Sem `users.manage` a rota responde 403, e o campo volta a ser digitável: o operador da frota que
 * não administra usuários ainda precisa cadastrar motorista. Lista vazia é o mesmo caso — empresa
 * recém-instalada não pode ficar sem cadastrar por causa de um select sem linha.
 */
export function resolveMembershipEntryMode(
  input: Readonly<{ canReadUsers: boolean; choiceCount: number; isLoading: boolean }>,
): FleetFieldEntryMode {
  const { LIST, TEXT } = FLEET_FIELD_ENTRY_MODE
  if (input.isLoading) return LIST
  if (!input.canReadUsers) return TEXT
  return input.choiceCount === 0 ? TEXT : LIST
}
