/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useHolidayImportToggle } from '../hooks/useHolidayImportToggle.hook'
import { describeBusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import styles from '../styles/businessCalendar.module.css'

import { HolidayRefusal } from './HolidayRefusal.component'

type HolidayImportToggleProps = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * "Importar feriados da FeriadosAPI" (RF6, RF11): a empresa liga e desliga a própria importação. É o `Checkbox` do design
 * system com rótulo explícito. Desligar NÃO apaga o que já foi importado, e a tela diz isso ao lado da caixa. Ler e
 * escrever pedem só `settings.manage` — trocar a chave da instalação é outra permissão.
 */
export function HolidayImportToggle({ companyId, enabled }: HolidayImportToggleProps) {
  const { t } = useTranslation('businessCalendar')
  const toggle = useHolidayImportToggle({ companyId, enabled })
  const { query } = toggle

  return (
    <div className={styles.form}>
      {query.isPending ? (
        <SkeletonGroup label={t('providerSettings.toggle.loading')}>
          <Skeleton height="var(--control-height-compact)" width="16rem" />
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
              checked={toggle.isChecked}
              disabled={toggle.isSaving}
              label={t('providerSettings.toggle.label')}
              onChange={(checked) => void toggle.handleToggle(checked)}
            />
          </div>
          <p className={styles.hint}>{t('providerSettings.toggle.hint')}</p>
          <p className={styles.hint}>{t(`providerSettings.toggle.origin.${query.data.origin}`)}</p>
          {toggle.isSaving ? (
            <p className={styles.hint}>{t('providerSettings.toggle.saving')}</p>
          ) : null}
          {toggle.isSaved && !toggle.isSaving ? (
            <p className={styles.status} role="status">
              {t('providerSettings.toggle.saved')}
            </p>
          ) : null}
          {toggle.refusal === undefined ? null : <HolidayRefusal refusal={toggle.refusal} />}
        </>
      )}
    </div>
  )
}
