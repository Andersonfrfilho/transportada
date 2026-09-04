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
import {
  buildOccurrenceEmailTemplateOptions,
  OCCURRENCE_TEMPLATE_NONE,
} from '../shared/occurrenceTemplate.service'
import { useEmailTemplatesQuery } from '@/modules/notification/queries/useEmailTemplates.query'
import { NOTIFICATION_SETTINGS_HREF } from '@/modules/notification/shared/notificationCatalog.constant'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import styles from '../styles/trip.module.css'

type TripOccurrenceTypesProps = Readonly<{
  canManage: boolean
  isSaving: boolean
  onSave: (input: {
    readonly active: boolean
    readonly emailTemplateKey: null | string
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
 * ⚠️ **O texto do aviso não é digitado aqui.** O template mora no módulo de notificações, e o tipo
 * só **seleciona** qual modelo usar — quem escreve o texto (e os marcadores dele) é o editor de
 * templates. Linha antiga com assunto/corpo próprios continua funcionando, marcada como legado.
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
  const [emailTemplateKey, setEmailTemplateKey] = useState<string>(OCCURRENCE_TEMPLATE_NONE)

  const emailTemplates = useEmailTemplatesQuery({ enabled: canManage })
  const templateOptions = buildOccurrenceEmailTemplateOptions(emailTemplates.data ?? [])

  function templateLabelOf(type: OccurrenceType): string {
    if (type.emailTemplateKey !== null) {
      const option = templateOptions.find((candidate) => candidate.key === type.emailTemplateKey)
      /** Sem a lista carregada (ou modelo desativado depois), a chave crua ainda diz qual é. */
      return option?.label ?? type.emailTemplateKey
    }
    if (type.emailSubject !== '') {
      return t('occurrence.legacyTemplate', { subject: type.emailSubject })
    }
    return t('occurrence.withoutTemplate')
  }

  function handleAdd() {
    if (name.trim() === '') return
    onSave({
      active: true,
      emailTemplateKey: emailTemplateKey === OCCURRENCE_TEMPLATE_NONE ? null : emailTemplateKey,
      name,
      notifies,
      occurrenceTypeId: null,
      stage,
    })
    setName('')
    setNotifies(false)
    setEmailTemplateKey(OCCURRENCE_TEMPLATE_NONE)
  }

  function handleEditTemplates() {
    const navigator = createBrowserWorkspaceNavigator()
    navigator.pushPath(NOTIFICATION_SETTINGS_HREF)
    navigator.rememberWorkspace('notification')
    navigator.dispatchPopState()
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
                <span className={styles.hint}>{templateLabelOf(type)}</span>
                <Checkbox
                  checked={type.notifies}
                  disabled={!canManage || isSaving}
                  label={t('occurrence.notifies')}
                  onChange={(value) =>
                    onSave({
                      active: type.active,
                      /*
                       * ⚠️ A escolha do modelo viaja junto: o `PUT` grava o tipo inteiro, e
                       * omiti-la aqui desligaria o template ao marcar uma caixa de seleção.
                       */
                      emailTemplateKey: type.emailTemplateKey,
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
                      emailTemplateKey: type.emailTemplateKey,
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
          <Select
            ariaLabel={t('occurrence.emailTemplate')}
            onChange={setEmailTemplateKey}
            options={[
              { label: t('occurrence.emailTemplateNone'), value: OCCURRENCE_TEMPLATE_NONE },
              ...templateOptions.map((option) => ({ label: option.label, value: option.key })),
            ]}
            value={emailTemplateKey}
          />
          <Button disabled={isSaving} onClick={handleAdd} size="sm" type="button">
            <Icon name="add" />
            {t('occurrence.add')}
          </Button>
          {/* Atalho discreto: o texto do modelo se edita no módulo de notificações, não aqui. */}
          <Button onClick={handleEditTemplates} size="sm" type="button" variant="ghost">
            <Icon name="edit" />
            {t('occurrence.editTemplates')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
