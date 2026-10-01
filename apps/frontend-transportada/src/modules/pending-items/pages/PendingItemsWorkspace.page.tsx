/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { buildFleetVehicleRoute } from '@/modules/fleet/shared/fleetRoute.service'

import { usePendingItems } from '../hooks/usePendingItems.hook'
import type { PendingItem } from '../shared/pendingItemsClient.service'
import styles from '../styles/pendingItems.module.css'

const PENDING_ITEMS_SKELETON_ROW_COUNT = 4

export function PendingItemsWorkspacePage() {
  const { t } = useTranslation('pendingItems')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id

  const workspace = usePendingItems({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })

  const status =
    authQuery.isError || workspace.pageQuery.isError
      ? 'error'
      : !workspace.controller.canReadPendingItems
        ? 'forbidden'
        : authQuery.isLoading || workspace.pageQuery.isLoading
          ? 'loading'
          : 'success'

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>

      {status === 'forbidden' ? (
        <p className={styles.boundary} role="alert">
          {t('boundary.forbidden')}
        </p>
      ) : status === 'error' ? (
        <p className={styles.boundary} role="alert">
          {t('status.error')}
        </p>
      ) : status === 'loading' ? (
        <SkeletonGroup className={styles.list} label={t('status.loading')}>
          {Array.from({ length: PENDING_ITEMS_SKELETON_ROW_COUNT }, (_, index) => (
            <div className={styles.row} key={index}>
              <Skeleton variant="text" width="60%" />
              <Skeleton height="var(--control-height-compact)" width="8rem" />
            </div>
          ))}
        </SkeletonGroup>
      ) : workspace.items.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {workspace.items.map((item) => (
              <PendingItemRow item={item} key={`${item.kind}-${item.entityId}`} />
            ))}
          </ul>
          {workspace.nextCursor === null ? null : (
            <Button onClick={workspace.goToNextPage} type="button" variant="ghost">
              <Icon name="page-next" />
              {t('actions.loadMore')}
            </Button>
          )}
        </>
      )}
    </main>
  )
}

function PendingItemRow({ item }: Readonly<{ item: PendingItem }>) {
  const { t } = useTranslation('pendingItems')

  return (
    <li className={styles.row}>
      <span>{t(`items.${item.kind}`, { plate: item.label })}</span>
      <a className={styles.link} href={buildFleetVehicleRoute(item.entityId)}>
        {t('actions.openVehicle')}
      </a>
    </li>
  )
}
