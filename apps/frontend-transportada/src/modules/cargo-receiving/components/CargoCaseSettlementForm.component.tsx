/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useCargoSettlementQuery } from '../queries/useCargoSettlement.query'
import type { CargoOccurrenceView } from '../shared/cargoOccurrence.types'
import occurrenceStyles from '../styles/cargoOccurrence.module.css'
import { CargoCaseSettlementEditor } from './CargoCaseSettlementEditor.component'

type CargoCaseSettlementFormProps = Readonly<{
  occurrence: CargoOccurrenceView
  onDirtyChange: (isDirty: boolean) => void
}>

const NO_ITEMS: never[] = []

/**
 * Lê o acerto já gravado antes de mostrar o formulário: ele abre com o que está lá, nunca vazio por cima. Se a leitura
 * falha, avisa — e o formulário abre vazio mesmo assim, porque salvar substitui a lista e o texto diz isso.
 */
export function CargoCaseSettlementForm(props: CargoCaseSettlementFormProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const query = useCargoSettlementQuery({ isEnabled: true, occurrenceId: props.occurrence.id })

  if (query.isLoading) {
    return (
      <SkeletonGroup label={t('occurrence.settlement.loading')}>
        <Skeleton height="6rem" />
      </SkeletonGroup>
    )
  }

  return (
    <>
      {query.isError ? (
        <p className={occurrenceStyles.noteFailure} role="alert">
          {t('occurrence.settlement.loadFailed')}
        </p>
      ) : null}
      <CargoCaseSettlementEditor
        initialItems={query.data?.items ?? NO_ITEMS}
        occurrence={props.occurrence}
        onDirtyChange={props.onDirtyChange}
      />
    </>
  )
}
