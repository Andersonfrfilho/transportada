/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { DeliveryClientForm } from '../components/DeliveryClientForm.component'
import { DeliveryWindowEditor } from '../components/DeliveryWindowEditor.component'
import { useDeliveryClients } from '../hooks/useDeliveryClients.hook'
import styles from '../styles/deliveryClients.module.css'

/**
 * Spec 060: **a base já existe** — todo destinatário virou cadastro na importação da nota. O que
 * esta tela faz é achar aquele que tem hora ou preço e preencher a regra dele, que é a minoria.
 *
 * Por isso a lista não tem "novo cliente": criar à mão seria o caminho de quem ainda não mandou
 * nota, e esse caso se resolve pela API — não vale uma porta na tela que confunde o caminho normal.
 */
export function DeliveryClientWorkspacePage() {
  const { t } = useTranslation('deliveryClients')
  const authQuery = useAuthMeQuery()
  const controller = useDeliveryClients({ permissions: authQuery.data?.data.permissions ?? [] })
  const isReadOnly = !controller.canManageClients

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.hint}>{t('subtitle')}</p>
      </header>

      <section className={styles.filters}>
        <label className={styles.field}>
          {t('filters.name')}
          <input
            onChange={(event) =>
              controller.setFilters({ ...controller.filters, nameContains: event.target.value })
            }
            placeholder={t('filters.namePlaceholder')}
            value={controller.filters.nameContains}
          />
        </label>

        <label className={styles.field}>
          {t('filters.status')}
          <Select
            ariaLabel={t('filters.status')}
            onChange={(value) =>
              controller.setFilters({
                ...controller.filters,
                status: value === '' ? null : value === 'inactive' ? 'inactive' : 'active',
              })
            }
            options={[
              { label: t('filters.statusAll'), value: '' },
              { label: t('form.statusActive'), value: 'active' },
              { label: t('form.statusInactive'), value: 'inactive' },
            ]}
            value={controller.filters.status ?? ''}
          />
        </label>

        <label className={styles.field}>
          {t('filters.scheduling')}
          <Select
            ariaLabel={t('filters.scheduling')}
            onChange={(value) =>
              controller.setFilters({
                ...controller.filters,
                requiresScheduling: value === '' ? null : value === 'true',
              })
            }
            options={[
              { label: t('filters.schedulingAll'), value: '' },
              { label: t('filters.schedulingOnly'), value: 'true' },
              { label: t('filters.schedulingNone'), value: 'false' },
            ]}
            value={controller.filters.requiresScheduling === null ? '' : String(controller.filters.requiresScheduling)}
          />
        </label>
      </section>

      {controller.isLoading ? (
        <SkeletonGroup label={t('table.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('table.name')}</th>
              <th scope="col">{t('table.taxId')}</th>
              <th scope="col">{t('table.scheduling')}</th>
              <th scope="col">{t('table.fee')}</th>
              <th scope="col">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(controller.clients ?? []).map((client) => (
              <tr key={client.id}>
                <td>{client.displayName === '' ? t('form.unnamed') : client.displayName}</td>
                <td className={styles.document}>{client.taxId}</td>
                <td>{client.requiresScheduling ? t('table.schedulingYes') : '—'}</td>
                <td>{client.deliveryFeeAmount ?? '—'}</td>
                <td>
                  <Button
                    onClick={() => controller.selectClient(client.id)}
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="edit" />
                    {t('table.open')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {controller.nextCursor === null ? null : (
        <Button onClick={() => controller.setCursor(controller.nextCursor)} type="button" variant="ghost">
          <Icon name="page-next" />
          {t('table.more')}
        </Button>
      )}

      {controller.selectedClientId === null ? null : controller.selectedClient === undefined ? (
        <SkeletonGroup label={t('form.loading')}>
          <Skeleton height="12rem" />
        </SkeletonGroup>
      ) : (
        <section className={styles.panel}>
          <DeliveryClientForm
            client={controller.selectedClient}
            isDisabled={isReadOnly}
            onSave={(values) =>
              controller.updateClient({ id: controller.selectedClient?.id ?? '', values })
            }
          />
          <DeliveryWindowEditor
            isDisabled={isReadOnly}
            key={controller.selectedClient.id}
            onSave={(windows) =>
              controller.replaceWindows({ id: controller.selectedClient?.id ?? '', windows })
            }
            windows={controller.selectedClient.windows}
          />
        </section>
      )}
    </main>
  )
}
