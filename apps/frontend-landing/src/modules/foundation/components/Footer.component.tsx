/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { BrandMark } from '@/modules/shared/components/BrandMark.component'
import { Icon } from '@/modules/shared/components/Icon.component'
import {
  toContactHref,
  toSocialLabel,
  toWhatsappHref,
  type LandingContact,
  type LandingSettings,
} from '@/modules/shared/landingSettings.service'
import styles from './Footer.module.css'

const NAV_LINKS = [
  { href: '#sobre', label: 'Sobre' },
  { href: '#servicos', label: 'Serviços' },
  { href: '#app', label: 'App' },
  { href: '#contato', label: 'Contato' },
] as const

type FooterProps = Readonly<{
  brandName: string
  onNavigateToApplication: () => void
  settings: LandingSettings
}>

/**
 * A lista cadastrada (spec 068) manda; o par `contactPhone`/`contactEmail` do cadastro do site é
 * **reserva**, e só entra quando ela não tem nada daquele tipo — somados sem regra, quem cadastrou o
 * mesmo número nos dois lugares o veria duas vezes na mesma coluna.
 */
function renderContacts(settings: LandingSettings): ReactNode {
  const fallback: readonly LandingContact[] = [
    ...(settings.contactPhone === undefined
      ? []
      : [
          {
            isWhatsapp: false,
            kind: 'phone' as const,
            label: '',
            value: settings.contactPhone,
          },
        ]),
    ...(settings.contactEmail === undefined
      ? []
      : [
          {
            isWhatsapp: false,
            kind: 'email' as const,
            label: '',
            value: settings.contactEmail,
          },
        ]),
  ]
  const contacts = settings.contacts.length > 0 ? settings.contacts : fallback

  return contacts.map((contact) => (
    <li key={`${contact.kind}-${contact.value}`} className={styles.contactItem}>
      <Icon
        aria-hidden="true"
        height="18"
        name={contact.kind === 'phone' ? 'phone' : 'mail'}
        width="18"
      />
      <a href={toContactHref(contact)}>
        {contact.label === '' ? contact.value : `${contact.label}: ${contact.value}`}
      </a>
      {contact.isWhatsapp ? (
        <a href={toWhatsappHref(contact)} rel="noreferrer" target="_blank">
          WhatsApp
        </a>
      ) : null}
    </li>
  ))
}

export function Footer({ brandName, onNavigateToApplication, settings }: FooterProps): ReactNode {
  const year = new Date().getUTCFullYear()

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <div className={styles.brandRow}>
            <BrandMark className={styles.brandMark} />
            <span className={styles.brandName}>{brandName}</span>
          </div>
          <p className={styles.tagline}>
            Transporte de carga com rota planejada e acompanhamento de ponta a ponta.
          </p>
        </div>
        <div>
          <p className={styles.columnTitle}>Navegação</p>
          <ul className={styles.linkList}>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
            <li>
              <a
                href="/cadastro"
                onClick={(event) => {
                  event.preventDefault()
                  onNavigateToApplication()
                }}
              >
                Seja um agregado
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className={styles.columnTitle}>Contato</p>
          <ul className={styles.linkList}>{renderContacts(settings)}</ul>
          {settings.socialLinks.length === 0 ? null : (
            <ul className={styles.socialList}>
              {settings.socialLinks.map((link) => (
                <li key={link.network}>
                  <a href={link.url} rel="noreferrer" target="_blank">
                    {toSocialLabel(link.network)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <p className={styles.copyright}>
            © {year} {brandName}. Todos os direitos reservados.
          </p>
          <p className={styles.poweredBy}>
            <img alt="" className={styles.poweredByMark} src="/icons/icon.svg" />
            Plataforma TransportAdA
          </p>
        </div>
      </div>
    </footer>
  )
}
