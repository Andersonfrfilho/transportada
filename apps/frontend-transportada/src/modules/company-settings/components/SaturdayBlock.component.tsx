/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useSaturdaySetting } from '../hooks/useSaturdaySetting.hook'
import { describeBusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import styles from '../styles/businessCalendar.module.css'

import { HolidayRefusal } from './HolidayRefusal.component'

type SaturdayBlockProps = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * "Sábado é dia útil" (RF5): sem linha gravada o padrão é segunda a sexta, e a tela diz que é o padrão. O domingo
 * nunca conta, então não há interruptor para ele.
 */
export function SaturdayBlock({ companyId, enabled }: SaturdayBlockProps) {
  const { t } = useTranslation('businessCalendar')
  const setting = useSaturdaySetting({ companyId, enabled })
  const { query } = setting

  return (
    <section aria-labelledby="saturday-title" className={styles.block}>
      <h3 id="saturday-title">{t('saturday.title')}</h3>
      <p className={styles.hint}>{t('saturday.hint')}</p>
      {query.isPending ? (
        <SkeletonGroup label={t('saturday.loading')}>
          <Skeleton height="var(--control-height-compact)" width="14rem" />
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <div className={styles.actions}>
          <HolidayRefusal refusal={describeBusinessCalendarRefusal(query.error)} />
          <Button onClick={() => void query.refetch()} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('list.retry')}
          </Button>
        </div>
      ) : null}
      {query.data === undefined ? null : (
        <>
          <div className={styles.touchTarget}>
            <Checkbox
              checked={setting.isChecked}
              disabled={setting.isSaving}
              label={t('saturday.label')}
              onChange={(checked) => void setting.handleToggle(checked)}
            />
          </div>
          <p className={styles.hint}>{t(`saturday.origin.${query.data.origin}`)}</p>
          {setting.isSaving ? <p className={styles.hint}>{t('saturday.saving')}</p> : null}
          {setting.isSaved && !setting.isSaving ? (
            <p className={styles.status} role="status">
              {t('saturday.saved')}
            </p>
          ) : null}
          {setting.refusal === undefined ? null : <HolidayRefusal refusal={setting.refusal} />}
        </>
      )}
    </section>
  )
}
