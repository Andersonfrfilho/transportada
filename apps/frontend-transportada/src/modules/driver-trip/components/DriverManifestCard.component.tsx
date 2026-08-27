/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Barcode } from '@/components/ui/barcode'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { DriverTripManifest } from '../shared/driverTrip.types'
import styles from '../styles/driverTrip.module.css'

type DriverManifestCardProps = Readonly<{
  manifest: DriverTripManifest
  onOpenDamdfe: (manifestId: string) => Promise<void>
  onOpenXml: (manifestId: string) => Promise<void>
}>

/**
 * Spec 065 D1/D9: **o MDF-e sob demanda**, e nos dois formatos que a rua pede. O DAMDFE é o papel
 * que a barreira confere; o XML é o arquivo que o cliente e a contabilidade pedem depois. Um botão
 * só, com as duas saídas, porque quem decide qual precisa é quem está com o fiscal na frente.
 *
 * A chave e o código de barras ficam **na tela**, sem toque nenhum: eles já vieram com a viagem, e
 * numa barreira sem sinal é o que existe — o download depende de rede, a tela não.
 */
export function DriverManifestCard({ manifest, onOpenDamdfe, onOpenXml }: DriverManifestCardProps) {
  const { t } = useTranslation('driverTrip')
  const [pending, setPending] = useState<'damdfe' | 'xml' | null>(null)
  const [failed, setFailed] = useState(false)

  async function open(kind: 'damdfe' | 'xml'): Promise<void> {
    setPending(kind)
    setFailed(false)
    try {
      await (kind === 'damdfe' ? onOpenDamdfe(manifest.id) : onOpenXml(manifest.id))
    } catch {
      // Sem rede o papel não vem, e dizer isso é melhor que um botão que não responde.
      setFailed(true)
    } finally {
      setPending(null)
    }
  }

  return (
    <section className={styles.manifest}>
      <header className={styles.manifestHeader}>
        <h2>{t('manifest.title')}</h2>
        <p className={styles.manifestKey}>{manifest.accessKey}</p>
        {manifest.protocol === '' ? null : (
          <p className={styles.manifestProtocol}>
            {t('manifest.protocol', { protocol: manifest.protocol })}
          </p>
        )}
      </header>

      <Barcode
        label={t('manifest.barcodeLabel', { accessKey: manifest.accessKey })}
        value={manifest.accessKey}
      />

      <div className={styles.manifestActions}>
        <Button disabled={pending !== null} onClick={() => void open('damdfe')} type="button">
          <Icon name="document" />
          {pending === 'damdfe' ? t('manifest.opening') : t('manifest.openDamdfe')}
        </Button>
        <Button
          disabled={pending !== null}
          onClick={() => void open('xml')}
          type="button"
          variant="ghost"
        >
          <Icon name="download" />
          {pending === 'xml' ? t('manifest.opening') : t('manifest.openXml')}
        </Button>
      </div>

      {failed ? (
        <p className={styles.rejectedBanner} role="alert">
          {t('manifest.failed')}
        </p>
      ) : null}
    </section>
  )
}
