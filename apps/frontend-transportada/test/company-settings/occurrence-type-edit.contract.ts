/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Item 9 da spec 183 ("tela completa dos tipos"): cada edição da linha regrava o tipo **inteiro**.
 * Cada interruptor montava o próprio `onSave({...})` à mão, campo por campo — e cada campo que
 * nasceu depois (`attachmentMode`, `emailsContractor`) ficou de fora de todos. Uma função só monta a
 * edição a partir do tipo lido, e o painel ganha o interruptor "avisar a contratante por e-mail"
 * (spec 183 T802), que até aqui só existia na API.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import companySettingsPt from '../../src/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEn from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import { occurrenceTypeEdit } from '../../src/modules/company-settings/shared/occurrenceTypeEdit.service'
import type { OccurrenceType } from '../../src/modules/trip/shared/occurrence.constant'
import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'

const PANEL = new URL(
  '../../src/modules/company-settings/components/OccurrenceTypeCatalogPanel.component.tsx',
  import.meta.url,
)

const TYPE: OccurrenceType = {
  active: true,
  allowsMultipleItems: false,
  attachmentMode: 'required',
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: 'occurrence.refused',
  emailsContractor: true,
  id: '54ed0225-f293-47c3-84fe-0b66eff68784',
  name: 'Recusa total',
  notifies: true,
  redeliveryPolicy: 'allowed',
  stage: 'delivery',
}

describe('a edição da linha regrava o tipo inteiro (item 9)', () => {
  it('muda só o campo pedido e leva todos os outros como estão', () => {
    expect(occurrenceTypeEdit(TYPE, { notifies: false })).toEqual({
      active: true,
      allowsMultipleItems: false,
      attachmentMode: 'required',
      emailTemplateKey: 'occurrence.refused',
      emailsContractor: true,
      name: 'Recusa total',
      notifies: false,
      occurrenceTypeId: TYPE.id,
      redeliveryPolicy: 'allowed',
      stage: 'delivery',
    })
  })

  it('desligar o aviso por e-mail não mexe na exigência de foto nem na reentrega', () => {
    const edit = occurrenceTypeEdit(TYPE, { emailsContractor: false })

    expect(edit.emailsContractor).toBe(false)
    expect(edit.attachmentMode).toBe('required')
    expect(edit.redeliveryPolicy).toBe('allowed')
  })

  it('nenhuma linha do painel monta o onSave à mão — só o cadastro novo', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel.split('onSave({').length - 1).toBe(1)
    expect(panel).toContain('onSave(occurrenceTypeEdit(type, ')
  })
})

describe('interruptor "avisar a contratante por e-mail" (spec 183 T802)', () => {
  it('existe na linha e no cadastro, pelo Checkbox do design system', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toMatch(/<Checkbox[^>]*checked=\{type\.emailsContractor\}/u)
    expect(panel).toMatch(/<Checkbox[^>]*checked=\{emailsContractor\}/u)
    expect(panel).toContain("t('occurrenceTypeCatalog.emailsContractor')")
  })

  /** Dois avisos lado a lado: o rótulo tem de dizer para quem vai cada um. */
  it('os dois avisos dizem o destinatário, nos dois idiomas', () => {
    expect(companySettingsPt.occurrenceTypeCatalog.emailsContractor).toInclude('contratante')
    expect(companySettingsPt.occurrenceTypeCatalog.notifies).toInclude('despach')
    expect(companySettingsEn.occurrenceTypeCatalog.emailsContractor).toBeString()
    expect(companySettingsEn.occurrenceTypeCatalog.notifies).toBeString()
  })

  it('o cliente manda emailsContractor e attachmentMode no corpo do PUT', async () => {
    const bodies: unknown[] = []
    const client = createTripClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        bodies.push(await new Request(input, init).json())
        return Response.json({ data: { ...TYPE } })
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    await client.saveOccurrenceType(occurrenceTypeEdit(TYPE, { active: false }))

    expect(bodies[0]).toMatchObject({
      active: false,
      attachmentMode: 'required',
      emailsContractor: true,
    })
  })

  /**
   * O aviso automático (T802) sai com o texto sugerido da conversa, não com o modelo do tipo. A linha
   * dizia "Sem e-mail: este tipo só fica registrado na viagem" com o aviso à contratante ligado.
   */
  it('tipo sem modelo mas com aviso à contratante não diz "sem e-mail"', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toMatch(
      /type\.emailsContractor\s*\?\s*t\('occurrenceTypeCatalog\.withoutTemplateContractor'\)/u,
    )
    expect(companySettingsPt.occurrenceTypeCatalog.withoutTemplateContractor).toInclude(
      'contratante',
    )
    expect(companySettingsEn.occurrenceTypeCatalog.withoutTemplateContractor).toBeString()
  })
})
