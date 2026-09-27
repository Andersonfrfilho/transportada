/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

import {
  OCCURRENCE_REDELIVERY_POLICY,
  TRIP_OCCURRENCE_STAGE,
} from '@/modules/trip/shared/occurrence.constant'
import type {
  OccurrenceAttachmentMode,
  OccurrenceRedeliveryPolicy,
  OccurrenceType,
  TripOccurrenceStage,
} from '@/modules/trip/shared/occurrence.constant'
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
    /** Spec 166 RF9: desligado, o campo de item na tela de registro vira seleção única. */
    readonly allowsMultipleItems: boolean
    /** Spec 179 RF1: só tem efeito em tipo de rua — é o motorista quem tira a foto. */
    readonly attachmentMode: OccurrenceAttachmentMode
    readonly emailTemplateKey: null | string
    /** Spec 185 T6.1 (D2, RF6): só vale para `stage: 'separation'` — o CHECK do banco recusa em `delivery`. */
    readonly leavesDocumentBehind: boolean
    readonly name: string
    readonly notifies: boolean
    readonly occurrenceTypeId: null | string
    /** Spec 164 RF1: conjunto completo — sempre enviado, nunca omitido no `PUT`. */
    readonly redeliveryPolicy: OccurrenceRedeliveryPolicy
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
  /** RF3: o padrão é aceitar vários itens — preserva o comportamento de hoje. */
  const [allowsMultipleItems, setAllowsMultipleItems] = useState(true)
  /** Spec 164 D1: nasce `unset` — nenhum tipo novo escala para o contratante sem decisão explícita. */
  const [redeliveryPolicy, setRedeliveryPolicy] = useState<OccurrenceRedeliveryPolicy>(
    OCCURRENCE_REDELIVERY_POLICY.unset,
  )
  /** Spec 185 D2/RF6: padrão desligado — nenhum tipo novo tira nota da viagem sem decisão explícita. */
  const [leavesDocumentBehind, setLeavesDocumentBehind] = useState(false)
  /** Spec 179 RF1: nasce `off` — nenhum tipo novo passa a exigir foto sem decisão explícita. */
  const [attachmentMode, setAttachmentMode] = useState<OccurrenceAttachmentMode>('off')

  const attachmentModeOptions = [
    { label: t('occurrenceTypeCatalog.attachmentModeOff'), value: 'off' },
    { label: t('occurrenceTypeCatalog.attachmentModeOptional'), value: 'optional' },
    { label: t('occurrenceTypeCatalog.attachmentModeRequired'), value: 'required' },
  ]

  const redeliveryPolicyOptions = [
    {
      label: t('occurrenceTypeCatalog.redeliveryPolicyUnset'),
      value: OCCURRENCE_REDELIVERY_POLICY.unset,
    },
    {
      label: t('occurrenceTypeCatalog.redeliveryPolicyAllowed'),
      value: OCCURRENCE_REDELIVERY_POLICY.allowed,
    },
    {
      label: t('occurrenceTypeCatalog.redeliveryPolicyBlocked'),
      value: OCCURRENCE_REDELIVERY_POLICY.blocked,
    },
  ]

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
      allowsMultipleItems,
      attachmentMode: stage === TRIP_OCCURRENCE_STAGE.delivery ? attachmentMode : 'off',
      emailTemplateKey: emailTemplateKey === OCCURRENCE_TEMPLATE_NONE ? null : emailTemplateKey,
      leavesDocumentBehind: stage === TRIP_OCCURRENCE_STAGE.separation && leavesDocumentBehind,
      name,
      notifies,
      occurrenceTypeId: null,
      redeliveryPolicy,
      stage,
    })
    setName('')
    setNotifies(false)
    setEmailTemplateKey(OCCURRENCE_TEMPLATE_NONE)
    setAllowsMultipleItems(true)
    setRedeliveryPolicy(OCCURRENCE_REDELIVERY_POLICY.unset)
    setLeavesDocumentBehind(false)
    setAttachmentMode('off')
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
                      allowsMultipleItems: type.allowsMultipleItems,
                      attachmentMode: type.attachmentMode,
                      emailTemplateKey: type.emailTemplateKey,
                      leavesDocumentBehind: type.leavesDocumentBehind,
                      name: type.name,
                      notifies: value,
                      occurrenceTypeId: type.id,
                      redeliveryPolicy: type.redeliveryPolicy,
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
                      allowsMultipleItems: type.allowsMultipleItems,
                      attachmentMode: type.attachmentMode,
                      emailTemplateKey: type.emailTemplateKey,
                      leavesDocumentBehind: type.leavesDocumentBehind,
                      name: type.name,
                      notifies: type.notifies,
                      occurrenceTypeId: type.id,
                      redeliveryPolicy: type.redeliveryPolicy,
                      stage: type.stage,
                    })
                  }
                />
                <Checkbox
                  checked={type.allowsMultipleItems}
                  disabled={!canManage || isSaving}
                  label={t('occurrenceTypeCatalog.allowsMultipleItems')}
                  onChange={(value) =>
                    onSave({
                      active: type.active,
                      allowsMultipleItems: value,
                      attachmentMode: type.attachmentMode,
                      emailTemplateKey: type.emailTemplateKey,
                      leavesDocumentBehind: type.leavesDocumentBehind,
                      name: type.name,
                      notifies: type.notifies,
                      occurrenceTypeId: type.id,
                      redeliveryPolicy: type.redeliveryPolicy,
                      stage: type.stage,
                    })
                  }
                />
                <Select
                  ariaLabel={t('occurrenceTypeCatalog.redeliveryPolicy')}
                  disabled={!canManage || isSaving}
                  onChange={(value) =>
                    onSave({
                      active: type.active,
                      allowsMultipleItems: type.allowsMultipleItems,
                      attachmentMode: type.attachmentMode,
                      emailTemplateKey: type.emailTemplateKey,
                      leavesDocumentBehind: type.leavesDocumentBehind,
                      name: type.name,
                      notifies: type.notifies,
                      occurrenceTypeId: type.id,
                      redeliveryPolicy: value as OccurrenceRedeliveryPolicy,
                      stage: type.stage,
                    })
                  }
                  options={redeliveryPolicyOptions}
                  value={type.redeliveryPolicy}
                />
                {/* Spec 179 T401: só em tipo de rua — é o motorista quem tira a foto na hora. */}
                {type.stage === TRIP_OCCURRENCE_STAGE.delivery ? (
                  <Tooltip label={t('occurrenceTypeCatalog.attachmentModeHint')}>
                    <Select
                      ariaLabel={t('occurrenceTypeCatalog.attachmentMode')}
                      disabled={!canManage || isSaving}
                      onChange={(value) =>
                        onSave({
                          active: type.active,
                          allowsMultipleItems: type.allowsMultipleItems,
                          attachmentMode: value as OccurrenceAttachmentMode,
                          emailTemplateKey: type.emailTemplateKey,
                          leavesDocumentBehind: type.leavesDocumentBehind,
                          name: type.name,
                          notifies: type.notifies,
                          occurrenceTypeId: type.id,
                          redeliveryPolicy: type.redeliveryPolicy,
                          stage: type.stage,
                        })
                      }
                      options={attachmentModeOptions}
                      value={type.attachmentMode}
                    />
                  </Tooltip>
                ) : null}
                {/* Spec 185 T6.1 (D2/RF6): só para tipos de separação — o CHECK do banco recusa em `delivery`. */}
                {type.stage === TRIP_OCCURRENCE_STAGE.separation ? (
                  <Tooltip label={t('occurrenceTypeCatalog.leavesDocumentBehindHint')}>
                    <Checkbox
                      checked={type.leavesDocumentBehind}
                      disabled={!canManage || isSaving}
                      label={t('occurrenceTypeCatalog.leavesDocumentBehind')}
                      onChange={(value) =>
                        onSave({
                          active: type.active,
                          allowsMultipleItems: type.allowsMultipleItems,
                          attachmentMode: type.attachmentMode,
                          emailTemplateKey: type.emailTemplateKey,
                          leavesDocumentBehind: value,
                          name: type.name,
                          notifies: type.notifies,
                          occurrenceTypeId: type.id,
                          redeliveryPolicy: type.redeliveryPolicy,
                          stage: type.stage,
                        })
                      }
                    />
                  </Tooltip>
                ) : null}
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
          <Checkbox
            checked={allowsMultipleItems}
            label={t('occurrenceTypeCatalog.allowsMultipleItems')}
            onChange={setAllowsMultipleItems}
          />
          <Select
            ariaLabel={t('occurrenceTypeCatalog.redeliveryPolicy')}
            onChange={(value) => setRedeliveryPolicy(value as OccurrenceRedeliveryPolicy)}
            options={redeliveryPolicyOptions}
            value={redeliveryPolicy}
          />
          {stage === TRIP_OCCURRENCE_STAGE.delivery ? (
            <Tooltip label={t('occurrenceTypeCatalog.attachmentModeHint')}>
              <Select
                ariaLabel={t('occurrenceTypeCatalog.attachmentMode')}
                onChange={(value) => setAttachmentMode(value as OccurrenceAttachmentMode)}
                options={attachmentModeOptions}
                value={attachmentMode}
              />
            </Tooltip>
          ) : null}
          {/* Spec 185 T6.1 (D2/RF6): só para tipos de separação — o CHECK do banco recusa em `delivery`. */}
          {stage === TRIP_OCCURRENCE_STAGE.separation ? (
            <Tooltip label={t('occurrenceTypeCatalog.leavesDocumentBehindHint')}>
              <Checkbox
                checked={leavesDocumentBehind}
                label={t('occurrenceTypeCatalog.leavesDocumentBehind')}
                onChange={setLeavesDocumentBehind}
              />
            </Tooltip>
          ) : null}
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
