/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useSeparationScreen } from '../hooks/useSeparationScreen.hook'
import styles from '../styles/cargoSeparation.module.css'
import { CargoBatchOutcomePanel } from './CargoBatchOutcomePanel.component'
import { SeparationGroupList } from './SeparationGroupList.component'
import { SeparationHeader } from './SeparationHeader.component'
import { SeparationSearch } from './SeparationSearch.component'

type CargoSeparationScreenProps = Readonly<{
  arrivalId: string
  /** `trip.manage`: quem só lê vê o estado de cada nota, mas não ganha botão de toque. */
  canManage: boolean
}>

/**
 * A primeira separação, pelo celular (decisão do usuário): grupos rota × cidade recolhíveis, botão grande
 * por nota que avança o estado, "separar tudo deste grupo" e busca por número ou pela câmera.
 */
export function CargoSeparationScreen({
  arrivalId,
  canManage,
}: CargoSeparationScreenProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const screen = useSeparationScreen(arrivalId)
  const panelRef = useRef<HTMLElement>(null)
  const { arrival, groups, scanner, touches } = screen

  if (screen.isLoading) {
    return (
      <SkeletonGroup label={t('separation.loading')}>
        <Skeleton height="8rem" />
        <Skeleton height="6rem" />
      </SkeletonGroup>
    )
  }
  if (arrival === undefined) {
    return (
      <p className={styles.error} role="alert">
        {t('separation.error', { code: screen.errorCode ?? '' })}
      </p>
    )
  }

  const isClosed = arrival.status === 'closed'

  return (
    <main className={styles.screen} ref={panelRef}>
      <SeparationHeader
        arrival={arrival}
        onOpenList={screen.openList}
        onOpenOffice={screen.openOffice}
      />
      {screen.isOnline ? null : (
        <p className={styles.offline} role="status">
          {t('separation.offline')}
        </p>
      )}
      {isClosed ? <p className={styles.hint}>{t('separation.closedNotice')}</p> : null}
      <SeparationSearch
        isScannerOpen={scanner.isOpen}
        onCloseScanner={scanner.close}
        onOpenScanner={scanner.open}
        onQueryChange={groups.setQuery}
        onScan={scanner.submit}
        query={groups.query}
        scanResult={scanner.result}
      />
      {touches.outcomes === undefined ? null : (
        <CargoBatchOutcomePanel
          documents={screen.documents}
          onDismiss={touches.dismissOutcomes}
          outcomes={touches.outcomes}
          panelRef={panelRef}
        />
      )}
      <SeparationGroupList canAct={canManage && !isClosed} groups={groups} touches={touches} />
    </main>
  )
}
