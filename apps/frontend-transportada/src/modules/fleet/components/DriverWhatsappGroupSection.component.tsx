/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useDriverWhatsappGroup } from '../hooks/useDriverWhatsappGroup.hook'
import type { WhatsappGroupOption } from '../shared/driverWhatsappGroup.validation'
import { FLEET_MANAGE_PERMISSION } from '../shared/fleet.constant'
import styles from '../styles/fleet.module.css'
import { FleetFeedback } from './FleetFeedback.component'

type DriverWhatsappGroupSectionProps = Readonly<{ driverId: string }>

/** Grupos que ainda não são de ninguém (ou já são deste motorista): só estes podem ser escolhidos. */
export function pickChoosableGroups(
  groups: readonly WhatsappGroupOption[],
  driverId: string,
): readonly WhatsappGroupOption[] {
  return groups.filter(
    (group) => group.assignedDriverId === null || group.assignedDriverId === driverId,
  )
}

/**
 * Spec 292 T1: o grupo de WhatsApp na ficha do motorista, 1 para 1. O grupo é a identidade do motorista
 * para o bot: cada grupo pertence a um só motorista, e quem já tem dono não é oferecido. A lista vai ao
 * WhatsApp, então só é pedida quando o operador clica em escolher.
 */
export function DriverWhatsappGroupSection({ driverId }: DriverWhatsappGroupSectionProps) {
  const { t } = useTranslation('fleet')
  const authQuery = useAuthMeQuery()
  const canManage = (authQuery.data?.data.permissions ?? []).includes(FLEET_MANAGE_PERMISSION)
  const [choosing, setChoosing] = useState(false)
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState<null | Readonly<{ isError: boolean; text: string }>>(null)
  const { groupQuery, groupsQuery, removeMutation, setMutation } = useDriverWhatsappGroup({
    driverId,
    groupsEnabled: choosing,
  })
  const current = groupQuery.data ?? null
  const allGroups = groupsQuery.data ?? []
  const choosable = pickChoosableGroups(allGroups, driverId)
  const hiddenCount = allGroups.length - choosable.length

  function errorText(error: unknown): string {
    const code = error instanceof Error ? error.message : ''
    const key = `driverWhatsappGroup.errors.${code}`
    const text = t(key, { defaultValue: '' })
    return text === '' ? t('driverWhatsappGroup.errors.default') : text
  }

  function closeChoice(): void {
    setChoosing(false)
    setSelected('')
  }

  function handleSave(): void {
    const group = allGroups.find((item) => item.groupJid === selected)
    if (group === undefined) return
    setNotice(null)
    setMutation.mutate(
      { groupJid: group.groupJid, groupName: group.name },
      {
        onError: (error) => setNotice({ isError: true, text: errorText(error) }),
        onSuccess: () => {
          closeChoice()
          setNotice({ isError: false, text: t('driverWhatsappGroup.saved') })
        },
      },
    )
  }

  function handleRemove(): void {
    setNotice(null)
    removeMutation.mutate(undefined, {
      onError: (error) => setNotice({ isError: true, text: errorText(error) }),
      onSuccess: () => setNotice({ isError: false, text: t('driverWhatsappGroup.removed') }),
    })
  }

  const isBusy = setMutation.isPending || removeMutation.isPending

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverWhatsappGroup.title')}</legend>
      <p className={styles.hint}>{t('driverWhatsappGroup.hint')}</p>

      {groupQuery.isPending ? (
        <SkeletonGroup label={t('driverWhatsappGroup.title')}>
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      ) : groupQuery.isError ? (
        <FleetFeedback isError reveal={false}>
          {t('driverWhatsappGroup.loadError')}
        </FleetFeedback>
      ) : (
        <p>
          {current === null
            ? t('driverWhatsappGroup.none')
            : current.groupName === ''
              ? t('driverWhatsappGroup.currentNoName')
              : t('driverWhatsappGroup.current', { name: current.groupName })}
        </p>
      )}

      {choosing ? (
        <div className={styles.fuelPriceForm}>
          {groupsQuery.isPending ? (
            <SkeletonGroup label={t('driverWhatsappGroup.loadingGroups')}>
              <Skeleton height="var(--field-height)" width="100%" />
            </SkeletonGroup>
          ) : groupsQuery.isError ? (
            <FleetFeedback isError reveal={false}>
              {errorText(groupsQuery.error)}
            </FleetFeedback>
          ) : choosable.length === 0 ? (
            <p className={styles.hint}>{t('driverWhatsappGroup.noFreeGroups')}</p>
          ) : (
            <>
              <Select
                ariaLabel={t('driverWhatsappGroup.selectLabel')}
                emptyLabel={t('driverWhatsappGroup.emptyLabel')}
                options={choosable.map((group) => ({
                  label: group.name,
                  value: group.groupJid,
                }))}
                placeholder={t('driverWhatsappGroup.selectPlaceholder')}
                searchPlaceholder={t('driverWhatsappGroup.searchPlaceholder')}
                value={selected}
                onChange={setSelected}
              />
              {hiddenCount > 0 ? (
                <small className={styles.fieldHint}>
                  {t('driverWhatsappGroup.hiddenTaken', { count: hiddenCount })}
                </small>
              ) : null}
            </>
          )}
          <div className={styles.fuelPriceActions}>
            <button
              className={styles.primaryAction}
              disabled={isBusy || selected === ''}
              type="button"
              onClick={handleSave}
            >
              <Icon name="save" />
              {t('driverWhatsappGroup.save')}
            </button>
            <button className={styles.secondaryAction} type="button" onClick={closeChoice}>
              {t('driverWhatsappGroup.cancel')}
            </button>
          </div>
        </div>
      ) : canManage ? (
        <div className={styles.fuelPriceActions}>
          <button
            className={styles.secondaryAction}
            disabled={isBusy || groupQuery.isPending}
            type="button"
            onClick={() => {
              setNotice(null)
              setChoosing(true)
            }}
          >
            <Icon name="link" />
            {t(current === null ? 'driverWhatsappGroup.choose' : 'driverWhatsappGroup.change')}
          </button>
          {current === null ? null : (
            <button
              className={styles.secondaryAction}
              disabled={isBusy}
              type="button"
              onClick={handleRemove}
            >
              <Icon name="trash" />
              {t('driverWhatsappGroup.remove')}
            </button>
          )}
        </div>
      ) : null}

      {notice === null ? null : (
        <FleetFeedback isError={notice.isError} reveal={false}>
          {notice.text}
        </FleetFeedback>
      )}
    </fieldset>
  )
}
