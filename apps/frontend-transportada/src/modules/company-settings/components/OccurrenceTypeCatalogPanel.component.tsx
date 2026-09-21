/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'

import { TRIP_OCCURRENCE_STAGE } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceType, TripOccurrenceStage } from '@/modules/trip/shared/occurrence.constant'
import {
  buildOccurrenceEmailTemplateOptions,
  OCCURRENCE_TEMPLATE_NONE,
} from '@/modules/trip/shared/occurrenceTemplate.service'
import { useEmailTemplatesQuery } from '@/modules/notification/queries/useEmailTemplates.query'
import { NOTIFICATION_SETTINGS_HREF } from '@/modules/notification/shared/notificationCatalog.constant'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import styles from '@/modules/trip/styles/trip.module.css'

export type OccurrenceTypeCatalogPanelProps = Readonly<{
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
 * Spec 079, movido para Configurações → "Tipos de ocorrência": esta tela é o **cadastro** do
 * catálogo (nome, etapa, interruptor de aviso, modelo de e-mail), não uma tela de avisos — morar em
 * Viagens → "Avisos" escondia o cadastro atrás do nome do efeito colateral dele.
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
export function OccurrenceTypeCatalogPanel({
  canManage,
  isSaving,
  onSave,
  types,
}: OccurrenceTypeCatalogPanelProps) {
  const { t } = useTranslation('companySettings')
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
      return t('occurrenceTypeCatalog.legacyTemplate', { subject: type.emailSubject })
    }
    return t('occurrenceTypeCatalog.withoutTemplate')
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
      <h3 className={styles.hint}>{t('occurrenceTypeCatalog.title')}</h3>
      <p className={styles.hint}>{t('occurrenceTypeCatalog.hint')}</p>

      {types.length === 0 ? (
        <p className={styles.hint}>{t('occurrenceTypeCatalog.empty')}</p>
      ) : null}

      {[TRIP_OCCURRENCE_STAGE.separation, TRIP_OCCURRENCE_STAGE.delivery].map((group) => {
        const doGrupo = types.filter((type) => type.stage === group)
        if (doGrupo.length === 0) return null

        return (
          <fieldset className={styles.occurrenceStage} key={group}>
            <legend className={styles.hint}>
              {group === TRIP_OCCURRENCE_STAGE.separation
                ? t('occurrenceTypeCatalog.stageSeparation')
                : t('occurrenceTypeCatalog.stageDelivery')}
            </legend>
            {doGrupo.map((type) => (
              <div className={styles.occurrenceForm} key={type.id}>
                <span>{type.name}</span>
                <span className={styles.hint}>{templateLabelOf(type)}</span>
                <Checkbox
                  checked={type.notifies}
                  disabled={!canManage || isSaving}
                  label={t('occurrenceTypeCatalog.notifies')}
                  onChange={(value) =>
                    onSave({
                      active: type.active,
                      emailTemplateKey: type.emailTemplateKey,
                      name: type.name,
                      notifies: value,
                      occurrenceTypeId: type.id,
                      stage: type.stage,
                    })
                  }
                />
                <Checkbox
                  checked={type.active}
                  disabled={!canManage || isSaving}
                  label={t('occurrenceTypeCatalog.active')}
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
            aria-label={t('occurrenceTypeCatalog.name')}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('occurrenceTypeCatalog.name')}
            type="text"
            value={name}
          />
          <Select
            ariaLabel={t('occurrenceTypeCatalog.stage')}
            onChange={(value) => setStage(value as TripOccurrenceStage)}
            options={[
              {
                label: t('occurrenceTypeCatalog.stageSeparation'),
                value: TRIP_OCCURRENCE_STAGE.separation,
              },
              {
                label: t('occurrenceTypeCatalog.stageDelivery'),
                value: TRIP_OCCURRENCE_STAGE.delivery,
              },
            ]}
            value={stage}
          />
          <Checkbox
            checked={notifies}
            label={t('occurrenceTypeCatalog.notifies')}
            onChange={setNotifies}
          />
          <Select
            ariaLabel={t('occurrenceTypeCatalog.emailTemplate')}
            onChange={setEmailTemplateKey}
            options={[
              {
                label: t('occurrenceTypeCatalog.emailTemplateNone'),
                value: OCCURRENCE_TEMPLATE_NONE,
              },
              ...templateOptions.map((option) => ({ label: option.label, value: option.key })),
            ]}
            value={emailTemplateKey}
          />
          <Button disabled={isSaving} onClick={handleAdd} size="sm" type="button">
            <Icon name="add" />
            {t('occurrenceTypeCatalog.add')}
          </Button>
          <Button onClick={handleEditTemplates} size="sm" type="button" variant="ghost">
            <Icon name="edit" />
            {t('occurrenceTypeCatalog.editTemplates')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
