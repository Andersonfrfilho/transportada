/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { CargoArrivalDetailScreen } from '../components/CargoArrivalDetailScreen.component'
import { CargoArrivalListPanel } from '../components/CargoArrivalListPanel.component'
import { CargoArrivalRegistration } from '../components/CargoArrivalRegistration.component'
import { CargoPreviewDetailScreen } from '../components/CargoPreviewDetailScreen.component'
import { CargoPreviewListPanel } from '../components/CargoPreviewListPanel.component'
import { CargoReceivingShell } from '../components/CargoReceivingShell.component'
import { CargoSeparationScreen } from '../components/CargoSeparationScreen.component'
import { useCargoReceivingAccess } from '../hooks/useCargoReceivingAccess.hook'
import {
  navigateToCargoArrivals,
  parseCargoReceivingRoute,
  type CargoReceivingRoute,
} from '../shared/cargoReceivingRoute.service'
import styles from '../styles/cargoReceiving.module.css'

type CargoReceivingPageProps = Readonly<{ path: string }>

const LIST_ROUTE: CargoReceivingRoute = { kind: 'list' }

function Forbidden(): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <CargoReceivingShell title={t('list.title')}>
      <p className={styles.error} role="alert">
        {t('forbidden')}
      </p>
    </CargoReceivingShell>
  )
}

function RegisterPage(): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  return (
    <CargoReceivingShell
      actions={
        <Button onClick={() => navigateToCargoArrivals(navigator)} type="button" variant="ghost">
          <Icon name="chevron-left" />
          {t('register.back')}
        </Button>
      }
      hint={t('register.hint')}
      title={t('register.title')}
    >
      <CargoArrivalRegistration />
    </CargoReceivingShell>
  )
}

/**
 * `/recebimento`: a lista do escritório, o registro da chegada, o detalhe, a tela do celular do separador e
 * as prévias de carga (`/recebimento/previas`).
 * A parede decide pelo mesmo mapa de permissão do menu (spec 221); escrever (`trip.manage`) é da tela.
 */
export function CargoReceivingPage({ path }: CargoReceivingPageProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const access = useCargoReceivingAccess()
  const route = parseCargoReceivingRoute(path) ?? LIST_ROUTE

  if (access.isLoading) {
    return (
      <CargoReceivingShell title={t('list.title')}>
        <SkeletonGroup label={t('list.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      </CargoReceivingShell>
    )
  }
  if (access.isForbidden || access.hasFailed) return <Forbidden />

  switch (route.kind) {
    case 'register':
      return access.canManage ? <RegisterPage /> : <Forbidden />
    case 'detail':
      return (
        <CargoArrivalDetailScreen
          arrivalId={route.arrivalId}
          canManage={access.canManage}
          canResolve={access.canResolve}
        />
      )
    case 'separation':
      return (
        <CargoSeparationScreen
          arrivalId={route.arrivalId}
          canManage={access.canManage}
          canResolve={access.canResolve}
        />
      )
    case 'previews':
      return (
        <CargoReceivingShell
          hint={t('preview.list.hint')}
          section="previews"
          title={t('preview.list.title')}
        >
          <CargoPreviewListPanel canManage={access.canManage} />
        </CargoReceivingShell>
      )
    case 'preview-detail':
      return (
        <CargoPreviewDetailScreen
          canManage={access.canManage}
          companyId={access.companyId}
          permissions={access.permissions}
          previewId={route.previewId}
        />
      )
    case 'list':
      return (
        <CargoReceivingShell hint={t('list.hint')} section="arrivals" title={t('list.title')}>
          <CargoArrivalListPanel canManage={access.canManage} />
        </CargoReceivingShell>
      )
  }
}
