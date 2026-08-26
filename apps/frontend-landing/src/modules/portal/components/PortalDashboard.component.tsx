/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'

import type {
  PortalClient,
  PortalDocumentListItem,
  PortalDocumentType,
  PortalProfile,
} from '../shared/portalClient.service'
import styles from './Portal.module.css'

const DOCUMENT_LABELS: Record<PortalDocumentType, string> = { cnh: 'CNH', crlv: 'CRLV' }
const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  rejected: 'Recusado',
}

type PortalDashboardProps = Readonly<{
  client: PortalClient
  onLoggedOut: () => void
}>

export function PortalDashboard({ client, onLoggedOut }: PortalDashboardProps): ReactNode {
  const [profile, setProfile] = useState<PortalProfile | null>(null)
  const [documents, setDocuments] = useState<readonly PortalDocumentListItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([client.getProfile(), client.getDocuments()])
      .then(([loadedProfile, loadedDocuments]) => {
        if (cancelled) return
        setProfile(loadedProfile)
        setDocuments(loadedDocuments)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])

  async function handleLogout(): Promise<void> {
    await client.logout().catch(() => undefined)
    onLoggedOut()
  }

  async function handleUpload(type: PortalDocumentType, file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const uploaded = await client.uploadDocument({ bytes, contentType: file.type, type })
    setDocuments((current) =>
      (current ?? []).map((item) =>
        item.type === type
          ? { document: { ...uploaded }, type }
          : item,
      ),
    )
  }

  return (
    <section className={styles.section}>
      <h1 className={styles.title}>Portal do agregado</h1>
      {loadError ? (
        <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
          Não foi possível carregar seus dados agora. Tente recarregar a página.
        </div>
      ) : (
        <>
          {profile === null ? (
            <p>Carregando…</p>
          ) : (
            <ProfileCard profile={profile} />
          )}
          {profile?.status === 'approved' && documents !== null ? (
            <DocumentsCard documents={documents} onUpload={handleUpload} />
          ) : null}
        </>
      )}
      <button className={styles.logoutButton} type="button" onClick={() => void handleLogout()}>
        Sair
      </button>
    </section>
  )
}

function ProfileCard({ profile }: Readonly<{ profile: PortalProfile }>): ReactNode {
  return (
    <div className={styles.card}>
      <div>
        <span className={styles.label}>Status da candidatura</span>
        <div>
          <span className={styles.statusBadge} data-status={profile.status}>
            {STATUS_LABELS[profile.status] ?? profile.status}
          </span>
        </div>
      </div>
      {profile.status === 'rejected' && profile.rejectionReason !== '' ? (
        <p>{profile.rejectionReason}</p>
      ) : null}
      {profile.status === 'pending' ? <p>Sua candidatura ainda está em análise.</p> : null}
      {profile.driver !== null ? (
        <>
          <div>
            <span className={styles.label}>Nome</span>
            <p>{profile.driver.name}</p>
          </div>
          <div>
            <span className={styles.label}>Contato</span>
            <p>
              {profile.driver.email}
              <br />
              {profile.driver.phone}
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}

function DocumentsCard({
  documents,
  onUpload,
}: Readonly<{
  documents: readonly PortalDocumentListItem[]
  onUpload: (type: PortalDocumentType, file: File) => Promise<void>
}>): ReactNode {
  return (
    <div className={styles.card}>
      <span className={styles.label}>Documentos</span>
      {documents.map((item) => (
        <DocumentRow key={item.type} item={item} onUpload={onUpload} />
      ))}
    </div>
  )
}

function DocumentRow({
  item,
  onUpload,
}: Readonly<{
  item: PortalDocumentListItem
  onUpload: (type: PortalDocumentType, file: File) => Promise<void>
}>): ReactNode {
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (file === undefined) return
    setUploading(true)
    try {
      await onUpload(item.type, file)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className={styles.documentRow}>
      <div>
        <p>{DOCUMENT_LABELS[item.type]}</p>
        {item.document === null ? (
          <span className={styles.statusBadge} data-status="pending">
            Não enviado
          </span>
        ) : (
          <>
            <span className={styles.statusBadge} data-status={item.document.status}>
              {STATUS_LABELS[item.document.status] ?? item.document.status}
            </span>
            {item.document.status === 'rejected' && item.document.rejectionReason !== '' ? (
              <p>{item.document.rejectionReason}</p>
            ) : null}
          </>
        )}
      </div>
      <label className={styles.linkButton}>
        {uploading ? 'Enviando…' : item.document === null ? 'Enviar' : 'Reenviar'}
        <input
          accept="application/pdf,image/jpeg,image/png"
          disabled={uploading}
          hidden
          type="file"
          onChange={(event) => void handleFileChange(event)}
        />
      </label>
    </div>
  )
}
