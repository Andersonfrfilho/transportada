/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import type { LegalDocument } from '../shared/legalDocuments.service'
import styles from './LegalDocument.module.css'

type LegalDocumentViewProps = Readonly<{
  document: LegalDocument
  onNavigateHome: () => void
}>

export function LegalDocumentView({ document, onNavigateHome }: LegalDocumentViewProps): ReactNode {
  return (
    <article className={styles.document}>
      <h1 className={styles.title}>{document.title}</h1>
      <p className={styles.updatedAt}>Atualizada em {document.updatedAt}</p>
      <p className={styles.summary}>{document.summary}</p>

      {document.sections.map((section) => (
        <section className={styles.section} key={section.heading}>
          <h2 className={styles.heading}>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p className={styles.paragraph} key={paragraph}>
              {paragraph}
            </p>
          ))}
          {section.items.length === 0 ? null : (
            <ul className={styles.list}>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className={styles.contact}>
        <h2 className={styles.heading}>{document.contactHeading}</h2>
        <p className={styles.paragraph}>{document.contactLine}</p>
      </section>

      <a
        className={styles.backLink}
        href="/"
        onClick={(event) => {
          event.preventDefault()
          onNavigateHome()
        }}
      >
        ← Voltar para a página inicial
      </a>
    </article>
  )
}
