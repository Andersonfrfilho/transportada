/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'

import { TRIP_OCCURRENCE_STAGE } from '../shared/occurrence.constant'
import type { OccurrenceType, TripOccurrenceStage } from '../shared/occurrence.constant'
import styles from '../styles/trip.module.css'

type TripOccurrenceTypesProps = Readonly<{
  canManage: boolean
  isSaving: boolean
  onSave: (input: {
    readonly active: boolean
    readonly name: string
    readonly notifies: boolean
    readonly occurrenceTypeId: null | string
    readonly stage: TripOccurrenceStage
  }) => void
  types: readonly OccurrenceType[]
}>

/**
 * Spec 079: os tipos de ocorrência que a empresa cadastra.
 *
 * ⚠️ **O grupo é escolhido no cadastro**, e não é enfeite: `separation` é do galpão (`trip.manage`)
 * e `delivery` é da rua (`trip.report`). É ele que decide quem registra, e por isso o campo é
 * obrigatório — um padrão escondido daria permissão por omissão.
 *
 * ⚠️ **O padrão é não avisar.** Aviso que ninguém pediu vira ruído, e ruído faz o operador ignorar
 * também o que importa.
 */
export function TripOccurrenceNotifications({
  canManage,
  isSaving,
  onSave,
  types,
}: TripOccurrenceTypesProps) {
  const { t } = useTranslation('trip')
  const [name, setName] = useState('')
  const [stage, setStage] = useState<TripOccurrenceStage>(TRIP_OCCURRENCE_STAGE.separation)
  const [notifies, setNotifies] = useState(false)

  function handleAdd() {
    if (name.trim() === '') return
    onSave({ active: true, name, notifies, occurrenceTypeId: null, stage })
    setName('')
    setNotifies(false)
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('occurrence.notificationsTitle')}</h3>
      <p className={styles.hint}>{t('occurrence.notificationsHint')}</p>

      {types.length === 0 ? <p className={styles.hint}>{t('occurrence.empty')}</p> : null}

      {[TRIP_OCCURRENCE_STAGE.separation, TRIP_OCCURRENCE_STAGE.delivery].map((group) => {
        const doGrupo = types.filter((type) => type.stage === group)
        if (doGrupo.length === 0) return null

        return (
          <fieldset className={styles.occurrenceStage} key={group}>
            <legend className={styles.hint}>
              {group === TRIP_OCCURRENCE_STAGE.separation
                ? t('occurrence.stageSeparation')
                : t('occurrence.stageDelivery')}
            </legend>
            {doGrupo.map((type) => (
              <div className={styles.occurrenceForm} key={type.id}>
                <span>{type.name}</span>
                <Checkbox
                  checked={type.notifies}
                  disabled={!canManage || isSaving}
                  label={t('occurrence.notifies')}
                  onChange={(value) =>
                    onSave({
                      active: type.active,
                      name: type.name,
                      notifies: value,
                      occurrenceTypeId: type.id,
                      stage: type.stage,
                    })
                  }
                />
                {/* Aposentar não apaga: ocorrência já registrada continua com o nome sob o qual foi. */}
                <Checkbox
                  checked={type.active}
                  disabled={!canManage || isSaving}
                  label={t('occurrence.active')}
                  onChange={(value) =>
                    onSave({
                      active: value,
                      name: type.name,
                      notifies: type.notifies,
                      occurrenceTypeId: type.id,
                      stage: type.stage,
                    })
                  }
                />
              </div>
            ))}
          </fieldset>
        )
      })}

      {canManage ? (
        <div className={styles.occurrenceForm}>
          <input
            aria-label={t('occurrence.name')}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('occurrence.name')}
            type="text"
            value={name}
          />
          <Select
            ariaLabel={t('occurrence.stage')}
            onChange={(value) => setStage(value as TripOccurrenceStage)}
            options={[
              { label: t('occurrence.stageSeparation'), value: TRIP_OCCURRENCE_STAGE.separation },
              { label: t('occurrence.stageDelivery'), value: TRIP_OCCURRENCE_STAGE.delivery },
            ]}
            value={stage}
          />
          <Checkbox checked={notifies} label={t('occurrence.notifies')} onChange={setNotifies} />
          <Button disabled={isSaving} onClick={handleAdd} size="sm" type="button">
            <Icon name="add" />
            {t('occurrence.add')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
