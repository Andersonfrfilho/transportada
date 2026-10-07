/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useCargoGroupTitle } from '../hooks/useCargoGroupTitle.hook'
import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'
import type { TouchFailure } from '../mutations/useSeparationTouch.mutation'
import type { CargoArrivalDocument, CargoArrivalGroup } from '../shared/cargoArrival.types'
import styles from '../styles/cargoSeparation.module.css'
import rowStyles from '../styles/cargoSeparationRow.module.css'
import { SeparationDocumentRow } from './SeparationDocumentRow.component'

type SeparationGroupCardProps = Readonly<{
  canAct: boolean
  failures: ReadonlyMap<string, TouchFailure>
  group: CargoArrivalGroup
  isOpen: boolean
  isSearching: boolean
  onRetry: (failure: TouchFailure) => void
  onSeparateGroup: (group: CargoArrivalGroup) => void
  onToggle: (group: CargoArrivalGroup) => void
  onTouch: (document: CargoArrivalDocument) => void
  pendingIds: ReadonlySet<string>
  refusals: ReadonlyMap<string, string>
}>

/** Um grupo rota × cidade: recolhível, com a contagem à vista e o "separar tudo" quando ainda falta nota. */
export function SeparationGroupCard(props: SeparationGroupCardProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const title = useCargoGroupTitle()(props.group)
  const { group } = props
  const { noteOf } = useCargoOccurrence()
  // A nota a devolver ou devolvida não se separa: o lote leva só as que o servidor aceitaria.
  const separable = group.documents.filter((item) => noteOf(item).returnState === 'none')
  const separatedCount = separable.filter((item) => item.separationState === 'separated').length
  const isComplete = separable.length > 0 && separatedCount === separable.length
  const asideCount = group.documents.length - separable.length
  // Um toque individual em voo já mexe numa nota do grupo: o lote em cima dele mandaria a mesma nota duas vezes.
  const hasTouchInFlight = group.documents.some((item) => props.pendingIds.has(item.nfeDocumentId))

  return (
    <li className={styles.groupCard}>
      <button
        aria-expanded={props.isOpen}
        aria-label={t('separation.groupToggle', { title })}
        className={styles.groupToggle}
        disabled={props.isSearching}
        onClick={() => props.onToggle(group)}
        type="button"
      >
        <span className={styles.groupTitle}>
          <span className={styles.groupName}>{title}</span>
          <span className={styles.groupCounts}>
            {t('group.counts', { done: separatedCount, total: separable.length })}
            {asideCount === 0 ? '' : ` · ${t('group.aside', { count: asideCount })}`}
          </span>
        </span>
        <Icon name={props.isOpen ? 'chevron-up' : 'chevron-down'} />
      </button>
      {props.isOpen ? (
        <div className={styles.groupBody}>
          {props.canAct && !props.isSearching && separable.length > 0 && !isComplete ? (
            <Button
              className={styles.groupAll}
              disabled={hasTouchInFlight}
              onClick={() => props.onSeparateGroup({ ...group, documents: separable })}
              type="button"
              variant="secondary"
            >
              <Icon name="check" />
              {t('separation.groupAll')}
            </Button>
          ) : null}
          {props.canAct && !props.isSearching && isComplete ? (
            <p className={styles.groupAllDone}>{t('separation.groupAllDone')}</p>
          ) : null}
          <ul className={rowStyles.documentList}>
            {group.documents.map((document) => (
              <SeparationDocumentRow
                canAct={props.canAct}
                document={document}
                failure={props.failures.get(document.nfeDocumentId)}
                isPending={props.pendingIds.has(document.nfeDocumentId)}
                key={document.nfeDocumentId}
                onRetry={props.onRetry}
                onTouch={props.onTouch}
                refusalReason={props.refusals.get(document.nfeDocumentId)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}
