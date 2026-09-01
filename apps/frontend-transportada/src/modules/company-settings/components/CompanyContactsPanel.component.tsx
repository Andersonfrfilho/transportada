/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import {
  COMPANY_SOCIAL_NETWORKS,
  toPhoneDigits,
  type CompanyContact,
  type CompanyContactSettings,
  type CompanySocialLink,
  type CompanySocialNetwork,
} from '../shared/companyContactsClient.service'
import styles from '../styles/companySettings.module.css'

type SaveState = 'error' | 'idle' | 'saved' | 'saving'

type CompanyContactsPanelProps = Readonly<{
  data: CompanyContactSettings
  disabled: boolean
  onSave: (settings: CompanyContactSettings) => void
  saveState: SaveState
}>

const NETWORK_LABEL_KEYS: Readonly<Record<CompanySocialNetwork, string>> = {
  facebook: 'contacts.networkFacebook',
  instagram: 'contacts.networkInstagram',
  linkedin: 'contacts.networkLinkedin',
  tiktok: 'contacts.networkTiktok',
  website: 'contacts.networkWebsite',
  x: 'contacts.networkX',
  youtube: 'contacts.networkYoutube',
}

/**
 * A lista é rascunho local até o salvamento: a ordem, a marca de WhatsApp e a remoção são uma edição
 * só para o operador, e o `PUT` grava a lista inteira — é isso que faz reordenar não custar três
 * chamadas nem deixar a empresa sem contato no meio do caminho.
 */
export function CompanyContactsPanel({
  data,
  disabled,
  onSave,
  saveState,
}: CompanyContactsPanelProps): JSX.Element {
  const { t } = useTranslation('companySettings')
  const [contacts, setContacts] = useState<readonly CompanyContact[]>(data.contacts)
  const [socialLinks, setSocialLinks] = useState<readonly CompanySocialLink[]>(data.socialLinks)

  const phones = contacts.filter((contact) => contact.kind === 'phone')
  const emails = contacts.filter((contact) => contact.kind === 'email')

  function replaceContact(target: CompanyContact, next: CompanyContact) {
    setContacts((current) => current.map((contact) => (contact === target ? next : contact)))
  }

  function removeContact(target: CompanyContact) {
    setContacts((current) => current.filter((contact) => contact !== target))
  }

  /** Move dentro do tipo: o rodapé imprime telefones e e-mails em blocos, não intercalados. */
  function moveContact(target: CompanyContact, direction: -1 | 1) {
    setContacts((current) => {
      const sameKind = current.filter((contact) => contact.kind === target.kind)
      const index = sameKind.indexOf(target)
      const swap = sameKind[index + direction]
      if (swap === undefined) return current

      return current.map((contact) => {
        if (contact === target) return swap
        if (contact === swap) return target
        return contact
      })
    })
  }

  function addContact(kind: CompanyContact['kind']) {
    setContacts((current) => [...current, { isWhatsapp: false, kind, label: '', value: '' }])
  }

  function handleSubmit() {
    onSave({
      /* Telefone vai só com dígitos e linha vazia não vira contato: o servidor recusaria as duas. */
      contacts: contacts
        .map((contact) =>
          contact.kind === 'phone' ? { ...contact, value: toPhoneDigits(contact.value) } : contact,
        )
        .filter((contact) => contact.value !== ''),
      socialLinks: socialLinks.filter((link) => link.url !== ''),
    })
  }

  function renderContactRow(contact: CompanyContact): JSX.Element {
    return (
      <li key={`${contact.kind}-${contacts.indexOf(contact)}`} className={styles.contactRow}>
        <label>
          {t('contacts.labelField')}
          <input
            disabled={disabled}
            placeholder={t('contacts.labelPlaceholder')}
            type="text"
            value={contact.label}
            onChange={(event) => replaceContact(contact, { ...contact, label: event.target.value })}
          />
        </label>
        <label>
          {contact.kind === 'phone' ? t('contacts.phoneField') : t('contacts.emailField')}
          <input
            disabled={disabled}
            /* Sem `inputMode` numérico no e-mail, e sem máscara no telefone: o servidor quer dígito. */
            inputMode={contact.kind === 'phone' ? 'tel' : 'email'}
            type="text"
            value={contact.value}
            onChange={(event) => replaceContact(contact, { ...contact, value: event.target.value })}
          />
        </label>
        {contact.kind === 'phone' ? (
          <Checkbox
            checked={contact.isWhatsapp}
            disabled={disabled}
            label={t('contacts.whatsapp')}
            onChange={(checked) => replaceContact(contact, { ...contact, isWhatsapp: checked })}
          />
        ) : null}
        <div className={styles.contactRowActions}>
          <Button
            aria-label={t('contacts.moveUp')}
            disabled={disabled}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => moveContact(contact, -1)}
          >
            <Icon name="chevron-up" />
          </Button>
          <Button
            aria-label={t('contacts.moveDown')}
            disabled={disabled}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => moveContact(contact, 1)}
          >
            <Icon name="chevron-down" />
          </Button>
          <Button
            aria-label={t('contacts.remove')}
            disabled={disabled}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => removeContact(contact)}
          >
            <Icon name="trash" />
          </Button>
        </div>
      </li>
    )
  }

  return (
    <section className={styles.settingsPanel} aria-labelledby="company-contacts-title">
      <div className={styles.sectionHeading}>
        <h2 id="company-contacts-title">{t('contacts.title')}</h2>
        <p>{t('contacts.hint')}</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <fieldset>
          <legend>{t('contacts.phones')}</legend>
          <ul className={styles.contactList}>
            {phones.map((contact) => renderContactRow(contact))}
          </ul>
          <Button
            disabled={disabled}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => addContact('phone')}
          >
            <Icon name="add" />
            {t('contacts.addPhone')}
          </Button>
        </fieldset>

        <fieldset>
          <legend>{t('contacts.emails')}</legend>
          <ul className={styles.contactList}>
            {emails.map((contact) => renderContactRow(contact))}
          </ul>
          <Button
            disabled={disabled}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => addContact('email')}
          >
            <Icon name="add" />
            {t('contacts.addEmail')}
          </Button>
        </fieldset>

        <fieldset>
          <legend>{t('contacts.social')}</legend>
          <ul className={styles.contactList}>
            {COMPANY_SOCIAL_NETWORKS.map((network) => {
              const link = socialLinks.find((candidate) => candidate.network === network)
              return (
                <li key={network} className={styles.contactRow}>
                  <label>
                    {t(NETWORK_LABEL_KEYS[network])}
                    <input
                      disabled={disabled}
                      placeholder={t('contacts.urlPlaceholder')}
                      type="url"
                      value={link?.url ?? ''}
                      onChange={(event) => {
                        const url = event.target.value
                        setSocialLinks((current) => {
                          const others = current.filter(
                            (candidate) => candidate.network !== network,
                          )
                          return url === '' ? others : [...others, { network, url }]
                        })
                      }}
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>

        <Button disabled={disabled || saveState === 'saving'} type="submit">
          {t('contacts.save')}
        </Button>
        {saveState === 'saved' ? <p role="status">{t('contacts.saved')}</p> : null}
        {saveState === 'error' ? <p role="alert">{t('contacts.saveError')}</p> : null}
      </form>
    </section>
  )
}
