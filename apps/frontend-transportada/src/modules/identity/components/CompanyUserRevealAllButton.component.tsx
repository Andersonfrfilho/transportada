/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CompanyUserRevealState } from '../hooks/useCompanyUserReveal.hook'
import type { CompanyUser } from '../shared/companyUsers.types'

type CompanyUserRevealAllButtonProps = Readonly<{
  reveal: CompanyUserRevealState
  users: readonly CompanyUser[]
}>

/**
 * Fica na barra de ações do painel, ao lado de "Convidar usuário" — não dentro do cabeçalho da
 * coluna. Ali ele espremia o rótulo "Contato" e ficava longe de onde o olho procura ação.
 *
 * Age sobre **a página que está na frente do operador**, nunca sobre a base: cada revelação grava
 * auditoria, e "todos" precisa querer dizer o que a pessoa consegue conferir.
 */
export function CompanyUserRevealAllButton({ reveal, users }: CompanyUserRevealAllButtonProps) {
  const { t } = useTranslation('identity')
  const hasRevealed = reveal.revealed.size > 0

  if (!reveal.canReveal) return null

  return (
    <Button
      disabled={reveal.isPending || users.length === 0}
      onClick={() =>
        hasRevealed ? reveal.hide() : void reveal.reveal(users.map((user) => user.id))
      }
      type="button"
      variant="ghost"
    >
      <Icon name={hasRevealed ? 'eyeOff' : 'eye'} />
      {hasRevealed ? t('users.reveal.hideAll') : t('users.reveal.showAll')}
    </Button>
  )
}
