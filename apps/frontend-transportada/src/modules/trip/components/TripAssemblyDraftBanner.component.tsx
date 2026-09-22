/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { TripQuickCreateController } from '../hooks/useTripQuickCreate.hook'
import type { TripRouteAssemblyController } from '../hooks/useTripRouteAssembly.hook'
import styles from '../styles/trip.module.css'

type TripAssemblyDraftBannerProps = Readonly<{
  assembly: TripRouteAssemblyController
  quickCreate: TripQuickCreateController
}>

type DraftLineProps = Readonly<{
  /** Notas que não puderam ser relidas: o aviso é alerta, e a ação é reler — não retomar. */
  isUnreachable?: boolean
  message: string
  onDiscard: () => void
  onResume: () => void
}>

function DraftLine({ isUnreachable = false, message, onDiscard, onResume }: DraftLineProps) {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.draftBanner}>
      <p className={isUnreachable ? styles.alert : styles.hint} role="status">
        {message}
      </p>
      <div className={styles.draftBannerActions}>
        <Button onClick={onResume} size="sm" type="button" variant="secondary">
          <Icon name={isUnreachable ? 'refresh' : 'edit'} />
          {t(isUnreachable ? 'assemblyDraft.retry' : 'assemblyDraft.resume')}
        </Button>
        <Button onClick={onDiscard} size="sm" type="button" variant="ghost">
          <Icon name="trash" />
          {t('actions.resetCreation')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Cancelar a montagem **guarda** o rascunho. Sem esta faixa ele ficaria invisível atrás do botão que
 * abre o diálogo — e rascunho que ninguém sabe que existe reaparece como surpresa horas depois.
 */
export function TripAssemblyDraftBanner({ assembly, quickCreate }: TripAssemblyDraftBannerProps) {
  const { t } = useTranslation('trip')
  const showsManual = quickCreate.hasDraft && !quickCreate.isOpen
  const showsAutomatic = assembly.assemblyDraft.hasDraft && !assembly.isOpen
  const isRestoring = quickCreate.draftStore.isRestoring || assembly.assemblyDraft.isRestoring

  return (
    <>
      {/* A volta relê as notas pela busca inteira: segundos em que o diálogo ainda não reabriu. */}
      {isRestoring ? (
        <SkeletonGroup className={styles.draftBanner} label={t('assemblyDraft.restoring')}>
          <Skeleton variant="text" width="18rem" />
          <Skeleton height="var(--control-height-compact)" width="7rem" />
        </SkeletonGroup>
      ) : null}
      {quickCreate.draftStore.isUnreachable ? (
        <DraftLine
          isUnreachable
          message={t('assemblyDraft.manualUnreachable')}
          onDiscard={quickCreate.discardDraft}
          onResume={quickCreate.draftStore.retry}
        />
      ) : null}
      {assembly.assemblyDraft.isDocumentsUnreachable ? (
        <DraftLine
          isUnreachable
          message={t('assemblyDraft.automaticUnreachable')}
          onDiscard={assembly.discardDraft}
          onResume={assembly.assemblyDraft.retryDocuments}
        />
      ) : null}
      {showsManual ? (
        <DraftLine
          message={t('assemblyDraft.manualPending')}
          onDiscard={quickCreate.discardDraft}
          onResume={quickCreate.open}
        />
      ) : null}
      {showsAutomatic ? (
        <DraftLine
          message={t('assemblyDraft.automaticPending')}
          onDiscard={assembly.discardDraft}
          onResume={assembly.open}
        />
      ) : null}
    </>
  )
}
