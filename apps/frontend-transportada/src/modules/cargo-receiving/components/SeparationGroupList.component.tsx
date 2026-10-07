/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { SeparationGroupsController } from '../hooks/useSeparationGroups.hook'
import type { SeparationTouchesController } from '../hooks/useSeparationTouches.hook'
import { resolveGroupKey } from '../shared/cargoArrivalGroups.service'
import styles from '../styles/cargoSeparation.module.css'
import { SeparationGroupCard } from './SeparationGroupCard.component'

type SeparationGroupListProps = Readonly<{
  canAct: boolean
  groups: SeparationGroupsController
  touches: SeparationTouchesController
}>

/** Os grupos rota × cidade que sobraram da busca, ou a frase de que nenhuma nota tem aquele número. */
export function SeparationGroupList({
  canAct,
  groups,
  touches,
}: SeparationGroupListProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  if (groups.visibleGroups.length === 0) {
    return <p className={styles.hint}>{t('separation.noMatches')}</p>
  }

  return (
    <ul className={styles.groupList}>
      {groups.visibleGroups.map((group) => (
        <SeparationGroupCard
          canAct={canAct}
          failures={touches.failures}
          group={group}
          isOpen={groups.openGroupKeys.has(resolveGroupKey(group))}
          isSearching={groups.isSearching}
          key={resolveGroupKey(group)}
          onRetry={touches.retry}
          onSeparateGroup={touches.separateGroup}
          onToggle={groups.toggleGroup}
          onTouch={touches.touchDocument}
          pendingIds={touches.pendingIds}
          refusals={touches.refusals}
        />
      ))}
    </ul>
  )
}
