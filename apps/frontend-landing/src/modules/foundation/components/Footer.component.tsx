/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { LEGAL_DOCUMENT_PATHS } from '@/modules/legal/shared/legalDocuments.service'
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

const ADA_WEBSITE_URL = 'https://adatechnology.com.br'
/** Mesma marca que assina o painel, para o produto não se apresentar com dois desenhos. */
const ADA_MARK_SOURCE = '/icons/ada-technology.png'

const LEGAL_LINKS = [
  { label: 'Política de Privacidade', path: LEGAL_DOCUMENT_PATHS.privacyPolicy },
  { label: 'Termos de Serviço', path: LEGAL_DOCUMENT_PATHS.termsOfService },
  { label: 'Exclusão de dados', path: LEGAL_DOCUMENT_PATHS.dataDeletion },
] as const

type FooterProps = Readonly<{
  brandName: string
  onNavigateTo: (path: string) => void
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

export function Footer({
  brandName,
  onNavigateTo,
  onNavigateToApplication,
  settings,
}: FooterProps): ReactNode {
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
        <div>
          <p className={styles.columnTitle}>Legal</p>
          <ul className={styles.linkList}>
            {LEGAL_LINKS.map((link) => (
              <li key={link.path}>
                <a
                  href={link.path}
                  onClick={(event) => {
                    event.preventDefault()
                    onNavigateTo(link.path)
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <p className={styles.copyright}>
            © {year} {brandName}. Todos os direitos reservados.
          </p>
          <p className={styles.poweredBy}>
            <img alt="" aria-hidden="true" className={styles.poweredByMark} src={ADA_MARK_SOURCE} />
            Plataforma TransportAdA — uma solução{' '}
            <a href={ADA_WEBSITE_URL} target="_blank" rel="noreferrer">
              Ada Technology
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
