/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { BarcodeScanner, type BarcodeScannerFeedback } from '@/components/ui/barcode-scanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { MeasurementCardPrint } from './MeasurementCardPrint.component'
import { PackageBoxCameraFlow } from './PackageBoxCameraFlow.component'
import { PackageBoxFamilyApplyButton } from './PackageBoxFamilyApplyButton.component'
import { PackageBoxMeasurementForm } from './PackageBoxMeasurementForm.component'
import { PackageBoxReplicateDialog } from './PackageBoxReplicateDialog.component'
import {
  PACKAGE_BOX_STATUS_FILTERS,
  type PackageBox,
  type PackageBoxMeasurementInput,
  type PackageBoxQueue,
  type PackageBoxStatusFilter,
} from '../shared/packageBoxClient.service'
import {
  measurementSourceLabel,
  packageBoxMeasureFailureMessage,
  type Translate,
} from '../shared/packageBoxMeasurementLabel.service'
import { toCentimetres } from '../shared/packageBoxMeasurementUnits.service'
import { groupPackageBoxesByPackaging } from '../shared/packageBoxPackagingGroup.service'
import { resolveInitialUnitsPerBox } from '../shared/packageBoxUnitsPerBox.service'
import {
  buildPackageBoxPendingExportCsv,
  buildPackageBoxPendingExportSheetData,
  PACKAGE_BOX_PENDING_EXPORT_CSV_MEDIA_TYPE,
  packageBoxPendingExportFileName,
  type PackageBoxPendingExportFeedback,
  type PackageBoxPendingExportFormat,
  type PackageBoxPendingExportLabels,
} from '../shared/packageBoxPendingExport.service'
import {
  resolveReplicateOffer,
  shouldOpenReplicateDialog,
  type ReplicateOffer,
} from '../shared/packageBoxReplicateOffer.service'
import styles from '../styles/packageBoxes.module.css'

type PackageBoxMeasurementPanelProps = Readonly<{
  /** Spec 152 D14: sem ela ligada, a etapa Medida não existe — só "Digitar medida". */
  cameraMeasurementEnabled: boolean
  denied: boolean
  failed: boolean
  loading: boolean
  /** `true` enquanto a fila reconsulta a API por causa de um bipe — não o carregamento inicial. */
  matching: boolean
  /**
   * T14 (revisão final, ALTO-2): `onSuccess` é por chamada, nunca um efeito que reage ao estado
   * global da mutação — sem isso, uma gravação que falha ou uma segunda caixa gravada no meio do
   * caminho não tinham como saber a diferença entre "esta chamada" e "a última chamada".
   */
  onMeasure: (input: PackageBoxMeasurementInput, onSuccess: () => void) => void
  /** M-a: zera o desfecho da gravação anterior — o fluxo abre sem a recusa da caixa passada. */
  onResetSaveError: () => void
  /** T14 (revisão final, ALTO-2): zera a recusa e o estado da réplica anterior ao abrir/fechar. */
  onResetReplicate: () => void
  /** T14 item A1 (4ª revisão): refaz a consulta que falhou, sem fechar o fluxo nem perder a captura. */
  onRetryLookup: () => void
  onStatusChange: (status: PackageBoxStatusFilter) => void
  onScan: (text: string) => void
  onSearchChange: (search: string) => void
  /**
   * Export de "tudo o que falta medir" — sempre a fila inteira, independente da busca da tela, e
   * buscada só no clique (`usePackageBoxPendingExport`).
   */
  pendingExport: Readonly<{
    feedback: PackageBoxPendingExportFeedback
    prepare: (format: PackageBoxPendingExportFormat) => Promise<readonly PackageBox[] | undefined>
    preparingFormat: PackageBoxPendingExportFormat | undefined
  }>
  /**
   * Spec 155 (G004, D5): quem grava a réplica confirmada pelo diálogo. `onSuccess` fecha o diálogo
   * desta chamada — nunca um efeito que reage ao `replicateSaving` global (T14 ALTO-2/MÉDIO-4).
   */
  onReplicate: (
    input: Readonly<{ boxId: string; targetIds: readonly string[] }>,
    onSuccess: () => void,
  ) => void
  queue: PackageBoxQueue | null
  /** A1: o código da recusa do último `PUT` de medida — `undefined` enquanto nada falhou. */
  saveErrorCode: string | undefined
  /** A1: o desfecho da gravação, para o fluxo da câmera sair de "Gravando" só com ele. */
  saveStatus: 'error' | 'idle' | 'pending' | 'success'
  saving: boolean
  search: string
  status: PackageBoxStatusFilter
  /** O código da recusa da última réplica — `undefined` enquanto nada falhou. */
  replicateErrorCode: string | undefined
  replicateSaving: boolean
}>

const FOUND_FEEDBACK_DELAY_MS = 900
const NOT_FOUND_FEEDBACK_DELAY_MS = 2500
/** Acima do teto, a lista não cresce — refinar a busca é mais rápido que rolar dezenas de linhas. */
const MAX_CANDIDATES_SHOWN = 8
const CANDIDATES_TITLE_ID = 'package-box-candidates-title'

/** GTIN-8/12/13/14: só dígitos, no comprimento fixo dos padrões de código de barras de produto. */
const SCANNED_CODE_LENGTHS = new Set([8, 12, 13, 14])
/** Chave de acesso da NF-e/CT-e: 44 posições, UF+ano/mês+CNPJ fixos numéricos, dígito verificador. */
const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/

/**
 * ⚠️ Diferencia a pistola de código de barras (digita rápido e manda Enter) de alguém digitando uma
 * busca de texto normal. Sem essa forma o valor cai no filtro por `ilike`, e a pistola nunca acha a
 * caixa pela chave da nota nem pelo GTIN — o defeito que esta heurística existe para fechar.
 */
function looksLikeScannedCode(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return false
  if (/^[0-9]+$/.test(trimmed)) return SCANNED_CODE_LENGTHS.has(trimmed.length)
  return ACCESS_KEY_PATTERN.test(trimmed)
}

const PERCENT_SCALE = 100

function QueueSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <SkeletonGroup label={t('packageBoxes.title')}>
      <Skeleton variant="text" width="16rem" />
      <Skeleton variant="text" width="70%" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton height="var(--field-height)" key={row} width="100%" />
      ))}
    </SkeletonGroup>
  )
}

/**
 * A fila de medição do conferente (spec 085 G005). Mobile-first porque ela é usada de pé no galpão,
 * com o celular numa mão e a fita na outra.
 *
 * ⚠️ A cobertura aparece por linha: sem ela a tela é uma lista longa em que ninguém sabe onde parar
 * de descer — doze caixas cobrem um quarto do que sai daqui, e as de baixo custam o mesmo tempo.
 */
export function PackageBoxMeasurementPanel({
  cameraMeasurementEnabled,
  denied,
  failed,
  loading,
  matching,
  onMeasure,
  onReplicate,
  onResetReplicate,
  onResetSaveError,
  onRetryLookup,
  onScan,
  onSearchChange,
  onStatusChange,
  pendingExport,
  queue,
  replicateErrorCode,
  replicateSaving,
  saveErrorCode,
  saveStatus,
  saving,
  search,
  status,
}: PackageBoxMeasurementPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [editingId, setEditingId] = useState<null | string>(null)
  /**
   * ⚠️ Quem chegou pela câmera volta para ela depois de gravar: o conferente mede uma pilha inteira
   * de caixas seguidas, e obrigá-lo a tocar "Ler etiqueta" a cada uma quebra o ciclo com a fita na
   * outra mão. Quem chegou digitando fica na busca — ali ele está procurando, não varrendo.
   */
  const [cameFromScan, setCameFromScan] = useState(false)
  /**
   * ⚠️ Equivalente ao `cameFromScan` da câmera, mas para a pistola física (USB/Bluetooth que
   * "digita" o código e manda Enter): quem bipou pela pistola volta o foco ao campo de busca ao
   * gravar, não abre a câmera — o ciclo de pilha de caixas é o mesmo, o retorno é outro.
   */
  const [cameFromKeyboardScan, setCameFromKeyboardScan] = useState(false)
  const [scanFeedback, setScanFeedback] = useState<BarcodeScannerFeedback | undefined>(undefined)
  /** `true` do bipe até a fila responder — é o sinal que diz quando avaliar achou/não achou. */
  const [awaitingScan, setAwaitingScan] = useState(false)
  /**
   * ⚠️ Ref, não estado: só decide o destino de `openMeasurementForScannedBox` (câmera ou pistola),
   * nunca dispara render sozinho — o `awaitingScan` já cuida disso.
   */
  const scanOriginRef = useRef<'camera' | 'keyboard'>('camera')
  const searchInputRef = useRef<HTMLInputElement>(null)
  /**
   * ⚠️ Mais de uma caixa achada nunca escolhe sozinha (o GTIN ainda não é gravado nas caixas — só
   * chave de acesso e código de produto casam hoje, e o segundo é ambíguo entre emitentes). A lista
   * mora aqui, não no `queue`: ela é o resultado de **um** bipe, e a fila recarrega por outros
   * motivos (troca de situação, busca) que não devem reabrir a escolha.
   */
  const [candidates, setCandidates] = useState<readonly PackageBox[] | null>(null)
  const closeScanTimer = useRef<number | undefined>(undefined)
  /**
   * Spec 152 T11 (entrada unificada): com a função ligada, "Ler etiqueta" abre o
   * `PackageBoxCameraFlow` em vez do leitor de sempre — dono da própria sessão de câmera
   * (`useCameraStream`, D19), que encadeia etiqueta → produto → medida → conferência sem reabrir
   * permissão. Aberto, ele casa a etiqueta com a fila pela mesma pergunta
   * (`onScan`/`matching`/`queue`), então o efeito abaixo (que abre a edição digitada / a lista de
   * candidatas) precisa ficar de fora enquanto ele decide. Com a função desligada este estado nunca
   * vira `true` — o botão sempre abre o leitor antigo, comportamento idêntico ao de antes da T11.
   */
  const [isCameraFlowOpen, setIsCameraFlowOpen] = useState(false)
  /** A caixa escolhida na fila por "Medir pela câmera" — `undefined` quando o fluxo abre pela etiqueta. */
  const [cameraFlowBox, setCameraFlowBox] = useState<PackageBox | undefined>(undefined)
  const [isPrintCardOpen, setIsPrintCardOpen] = useState(false)

  /**
   * Spec 155 (D5, G010), T14 (revisão final, ALTO-2/MÉDIO-4): a oferta de replicar abre no
   * `onSuccess` **desta** gravação (amarrada à caixa/dimensões da própria chamada), nunca num
   * efeito que reage a `saveStatus`/`replicateSaving` globais — um `PUT` que falha para outra caixa
   * não tinha como sujar a oferta anterior, mas o efeito reagia ao estado da mutação inteira, não
   * a "esta chamada terminou".
   */
  const [replicateDialog, setReplicateDialog] = useState<ReplicateOffer | undefined>(undefined)

  function openReplicateDialogIfEligible(
    box: PackageBox,
    dimensions: ReplicateOffer['dimensions'],
  ): void {
    const offer = resolveReplicateOffer({ box, dimensions })
    if (offer === undefined) return
    if (
      !shouldOpenReplicateDialog({
        replicateDialogOpen: replicateDialog !== undefined,
        replicateSaving,
      })
    )
      return
    onResetReplicate()
    setReplicateDialog(offer)
  }

  function closeReplicateDialog(): void {
    setReplicateDialog(undefined)
    onResetReplicate()
  }

  /**
   * Spec 155 (D12, G012): "aplicar medida de um sabor a todos" abre o MESMO diálogo de replicar —
   * a origem já vem resolvida pelo botão (a irmã medida preferida, ou a própria caixa), nunca a
   * caixa da linha clicada.
   */
  function openReplicateDialogFromFamilyApply(offer: ReplicateOffer): void {
    if (
      !shouldOpenReplicateDialog({
        replicateDialogOpen: replicateDialog !== undefined,
        replicateSaving,
      })
    )
      return
    onResetReplicate()
    setReplicateDialog(offer)
  }

  useEffect(() => {
    return () => window.clearTimeout(closeScanTimer.current)
  }, [])

  /**
   * ⚠️ Ponto de entrada isolado de propósito: quando a medição por câmera (spec em andamento)
   * chegar, ela entra por aqui — bipar já leva direto à edição da caixa achada, só falta o
   * formulário de medida também vir da câmera em vez do teclado.
   */
  function openMeasurementForScannedBox(id: string): void {
    setScanFeedback({ kind: 'found', message: t('packageBoxes.scanner.found') })
    setEditingId(id)
    if (scanOriginRef.current === 'keyboard') {
      setCameFromKeyboardScan(true)
    } else {
      setCameFromScan(true)
    }
    closeScanTimer.current = window.setTimeout(() => {
      setIsScannerOpen(false)
      setScanFeedback(undefined)
    }, FOUND_FEEDBACK_DELAY_MS)
  }

  /**
   * A resposta da fila chegou: uma caixa, abre a medição dela; nenhuma, segue lendo; mais de uma —
   * o GTIN ainda não está gravado, então a etiqueta pode casar com caixas de emitentes diferentes —
   * o operador escolhe, nunca a tela.
   */
  useEffect(() => {
    /**
     * ⚠️ Com o fluxo da câmera aberto quem decide é ele — mas a espera **tem que ser desarmada**:
     * uma leitura da pistola durante o fluxo deixava `awaitingScan` ligado para sempre, e a
     * primeira leitura depois de fechar o fluxo abria a medição da caixa errada (T14, item baixo).
     */
    if (isCameraFlowOpen) {
      if (awaitingScan) setAwaitingScan(false)
      return
    }
    if (!awaitingScan || matching) return
    setAwaitingScan(false)
    const items = queue?.items ?? []
    if (items.length === 0) {
      setScanFeedback({ kind: 'notFound', message: t('packageBoxes.scanner.notFound') })
      return
    }
    if (items.length > 1) {
      setCandidates(items)
      return
    }
    const [match] = items
    if (match !== undefined) openMeasurementForScannedBox(match.id)
  }, [awaitingScan, isCameraFlowOpen, matching, queue, t, openMeasurementForScannedBox])

  useEffect(() => {
    if (scanFeedback?.kind !== 'notFound') return
    const timer = window.setTimeout(() => setScanFeedback(undefined), NOT_FOUND_FEEDBACK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [scanFeedback])

  /**
   * ⚠️ O fluxo abre do zero: sem o reset, o código da recusa da gravação anterior continuava no
   * estado e a Conferência da caixa seguinte já nascia com o aviso de erro (2ª revisão, item M-a).
   */
  function openCameraFlow(box?: PackageBox): void {
    onResetSaveError()
    setEditingId(null)
    setCameraFlowBox(box)
    setIsCameraFlowOpen(true)
  }

  function closeCameraFlow(): void {
    setIsCameraFlowOpen(false)
    setCameraFlowBox(undefined)
  }

  function pendingExportLabels(): PackageBoxPendingExportLabels {
    return {
      emptyValue: '—',
      header: {
        cartonGtin: t('packageBoxes.pendingExport.columns.cartonGtin'),
        commercialUnit: t('packageBoxes.pendingExport.columns.commercialUnit'),
        description: t('packageBoxes.pendingExport.columns.description'),
        emitterTaxId: t('packageBoxes.pendingExport.columns.emitterTaxId'),
        familyKey: t('packageBoxes.pendingExport.columns.familyKey'),
        productCode: t('packageBoxes.pendingExport.columns.productCode'),
        transportedVolumes: t('packageBoxes.pendingExport.columns.transportedVolumes'),
      },
    }
  }

  function todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10)
  }

  async function handleExportPendingCsv(): Promise<void> {
    const boxes = await pendingExport.prepare('csv')
    if (boxes === undefined) return
    const csv = buildPackageBoxPendingExportCsv({ boxes, labels: pendingExportLabels() })
    saveArchiveFile({
      blob: new Blob([csv], { type: PACKAGE_BOX_PENDING_EXPORT_CSV_MEDIA_TYPE }),
      fileName: packageBoxPendingExportFileName({ extension: 'csv', today: todayIsoDate() }),
    })
  }

  async function handleExportPendingXlsx(): Promise<void> {
    const boxes = await pendingExport.prepare('xlsx')
    if (boxes === undefined) return
    const sheetData = buildPackageBoxPendingExportSheetData({
      boxes,
      labels: pendingExportLabels(),
    })
    const { default: writeExcelFile } = await import('write-excel-file/browser')
    const blob = await writeExcelFile(sheetData.map((row) => [...row])).toBlob()
    saveArchiveFile({
      blob,
      fileName: packageBoxPendingExportFileName({ extension: 'xlsx', today: todayIsoDate() }),
    })
  }

  const scanner = (
    <BarcodeScanner
      closeLabel={t('packageBoxes.scanner.close')}
      deniedMessage={t('packageBoxes.scanner.denied')}
      feedback={scanFeedback}
      isOpen={isScannerOpen}
      onClose={() => {
        window.clearTimeout(closeScanTimer.current)
        setIsScannerOpen(false)
        setScanFeedback(undefined)
        setAwaitingScan(false)
        setCandidates(null)
      }}
      onRead={(text) => {
        scanOriginRef.current = 'camera'
        setScanFeedback(undefined)
        setAwaitingScan(true)
        onScan(text)
      }}
      readingMessage={t('packageBoxes.scanner.reading')}
      startingMessage={t('packageBoxes.scanner.starting')}
      title={t('packageBoxes.scanner.title')}
      unavailableMessage={t('packageBoxes.scanner.unavailable')}
    />
  )

  const items = queue?.items ?? []

  return (
    <section aria-labelledby="package-boxes-title" className={styles.panel}>
      <header className={styles.header}>
        <h3 id="package-boxes-title">{t('packageBoxes.title')}</h3>
        <p className={styles.hint}>{t('packageBoxes.description')}</p>
        <Button onClick={() => setIsPrintCardOpen(true)} size="sm" type="button" variant="ghost">
          <Icon name="download" />
          {t('packageBoxes.printCard.open')}
        </Button>
        <div className={styles.actions}>
          <Button
            aria-busy={pendingExport.preparingFormat === 'xlsx'}
            disabled={pendingExport.preparingFormat !== undefined}
            onClick={() => {
              void handleExportPendingXlsx()
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name={pendingExport.preparingFormat === 'xlsx' ? 'spinner' : 'download'} />
            {pendingExport.preparingFormat === 'xlsx'
              ? t('packageBoxes.pendingExport.preparing')
              : t('packageBoxes.pendingExport.xlsx')}
          </Button>
          <Button
            aria-busy={pendingExport.preparingFormat === 'csv'}
            disabled={pendingExport.preparingFormat !== undefined}
            onClick={() => {
              void handleExportPendingCsv()
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name={pendingExport.preparingFormat === 'csv' ? 'spinner' : 'download'} />
            {pendingExport.preparingFormat === 'csv'
              ? t('packageBoxes.pendingExport.preparing')
              : t('packageBoxes.pendingExport.csv')}
          </Button>
        </div>
        <PendingExportNotice feedback={pendingExport.feedback} t={t as Translate} />
      </header>

      {/*
        ⚠️ T14 ALTO-1 (5ª revisão): `denied`, `loading` e `failed` NÃO podem mais ser retornos
        antecipados — `PackageBoxCameraFlow` (abaixo) precisa continuar montado em toda situação da
        fila, senão o `useReducer` do fluxo volta para a etiqueta e `useCameraStream` derruba o
        `MediaStream` a cada bipe que troca a `queryKey` (D19). O ramo `lookupFailed` do próprio
        fluxo já sabe voltar para a etiqueta; o que falta aqui, fora do fluxo, é uma saída para quem
        nem chegou a abrir a câmera.
      */}
      {denied ? (
        <p className={styles.notice}>{t('packageBoxes.denied')}</p>
      ) : loading ? (
        <QueueSkeleton />
      ) : failed ? (
        <>
          <p className={styles.notice} role="alert">
            {t('packageBoxes.failed')}
          </p>
          <Button onClick={onRetryLookup} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('packageBoxes.retry')}
          </Button>
        </>
      ) : (
        <>
          <div className={styles.search}>
            <label className={styles.field} htmlFor="package-box-search">
              {t('packageBoxes.searchLabel')}
              <input
                id="package-box-search"
                inputMode="search"
                onChange={(event) => {
                  setCameFromScan(false)
                  setCameFromKeyboardScan(false)
                  onSearchChange(event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  const value = event.currentTarget.value
                  /** Digitação normal segue filtrando texto — só o formato de código vira bipe. */
                  if (!looksLikeScannedCode(value)) return
                  event.preventDefault()
                  scanOriginRef.current = 'keyboard'
                  setScanFeedback(undefined)
                  setAwaitingScan(true)
                  onScan(value)
                }}
                placeholder={t('packageBoxes.searchPlaceholder')}
                ref={searchInputRef}
                type="search"
                value={search}
              />
            </label>
            <Button
              onClick={() => (cameraMeasurementEnabled ? openCameraFlow() : setIsScannerOpen(true))}
              type="button"
              variant="secondary"
            >
              <Icon name="camera" />
              {t('packageBoxes.scan')}
            </Button>
          </div>

          <label className={styles.field} htmlFor="package-box-status">
            {t('packageBoxes.statusLabel')}
            <Select
              ariaLabel={t('packageBoxes.statusLabel')}
              onChange={(value) => onStatusChange(value as PackageBoxStatusFilter)}
              options={PACKAGE_BOX_STATUS_FILTERS.map((filter) => ({
                label: t(`packageBoxes.status.${filter}`),
                value: filter,
              }))}
              value={status}
            />
          </label>

          {items.length === 0 ? (
            <p className={styles.notice}>{t('packageBoxes.empty')}</p>
          ) : (
            <ul className={styles.list}>
              {groupPackageBoxesByPackaging(items).map((group) => (
                <li className={styles.packagingGroup} key={group.key}>
                  {/*
                    ⚠️ D3/G008: o cabeçalho só aparece quando há mais de uma embalagem NESTA página —
                    é o que resolve a queixa de "produto duplicado" sem apagar nenhuma linha.
                  */}
                  {group.items.length < 2 ? null : (
                    <p className={styles.packagingGroupTitle}>
                      {t('packageBoxes.packagingGroup.title', {
                        description:
                          group.items[0]?.description ?? group.items[0]?.productCode ?? '',
                        productCode: group.items[0]?.productCode ?? '',
                      })}
                    </p>
                  )}
                  <ul className={styles.list}>
                    {group.items.map((box) => (
                      <PackageBoxRow
                        box={box}
                        isEditing={editingId === box.id}
                        key={`${box.id}:${box.measuredAt ?? 'sem-medida'}`}
                        onApplyFamilyMeasure={openReplicateDialogFromFamilyApply}
                        onCancel={() => {
                          onResetSaveError()
                          setEditingId(null)
                        }}
                        onMeasure={(measurement) => {
                          /**
                           * A1: os desdobramentos do bipe só valem quando a gravação teve sucesso —
                           * antes eles rodavam incondicionalmente e fechavam a edição mesmo com o
                           * `PUT` recusado, sem nenhuma mensagem na linha (a recusa silenciosa).
                           */
                          onMeasure({ ...measurement, id: box.id }, () => {
                            openReplicateDialogIfEligible(box, measurement)
                            setEditingId(null)
                            if (cameFromScan) setIsScannerOpen(true)
                            if (cameFromKeyboardScan) {
                              setCameFromKeyboardScan(false)
                              searchInputRef.current?.focus()
                            }
                          })
                        }}
                        onMeasureWithCamera={
                          cameraMeasurementEnabled ? () => openCameraFlow(box) : undefined
                        }
                        onOpen={() => {
                          onResetSaveError()
                          setEditingId(box.id)
                        }}
                        saveErrorCode={saveErrorCode}
                        saving={saving}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {scanner}

      {candidates === null ? null : (
        <PackageBoxCandidatePicker
          candidates={candidates}
          onBack={() => setCandidates(null)}
          onSelect={(id) => {
            setCandidates(null)
            openMeasurementForScannedBox(id)
          }}
        />
      )}

      <PackageBoxCameraFlow
        cameraEnabled={cameraMeasurementEnabled}
        isOpen={isCameraFlowOpen}
        lookupFailed={failed}
        matches={queue?.items}
        matching={matching}
        onClose={closeCameraFlow}
        onLookup={(text) => onScan(text)}
        onSave={(id, submission) => {
          const box = items.find((item) => item.id === id)
          onMeasure({ ...submission, id }, () => {
            if (box !== undefined) openReplicateDialogIfEligible(box, submission)
          })
        }}
        preselectedBox={cameraFlowBox}
        saveErrorCode={saveErrorCode}
        saveStatus={saveStatus}
      />

      <MeasurementCardPrint isOpen={isPrintCardOpen} onClose={() => setIsPrintCardOpen(false)} />

      {replicateDialog === undefined ? null : (
        <PackageBoxReplicateDialog
          boxId={replicateDialog.boxId}
          dimensions={replicateDialog.dimensions}
          errorCode={replicateErrorCode}
          onClose={closeReplicateDialog}
          onConfirm={(targetIds) =>
            onReplicate({ boxId: replicateDialog.boxId, targetIds }, closeReplicateDialog)
          }
          saving={replicateSaving}
        />
      )}
    </section>
  )
}

type PackageBoxCandidatePickerProps = Readonly<{
  candidates: readonly PackageBox[]
  onBack: () => void
  onSelect: (id: string) => void
}>

/**
 * O GTIN ainda não é gravado nas caixas (chega com o pacote fiscal numa etapa seguinte) — hoje só
 * chave de acesso e código de produto casam a etiqueta, e o segundo pode achar a mesma caixa em
 * emitentes diferentes. Escolher sozinho aqui seria adivinhar; quem decide é o operador, tocando na
 * candidata certa. A camada nasce sobre o leitor, nunca inline — a mesma razão que abre o próprio
 * `BarcodeScanner` em portal: o conferente está de pé, com o celular numa mão.
 */
function PackageBoxCandidatePicker({
  candidates,
  onBack,
  onSelect,
}: PackageBoxCandidatePickerProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: onBack })
  const total = candidates.length
  const shown = candidates.slice(0, MAX_CANDIDATES_SHOWN)

  /** Foco no primeiro item, não no contêiner: quem chegou aqui vai tocar ou apertar Enter direto. */
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[data-candidate] button')?.focus()
  }, [dialogRef])

  return createPortal(
    <div className={styles.candidatesOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={CANDIDATES_TITLE_ID}
        aria-modal="true"
        className={styles.candidatesDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.candidatesHead}>
          <h3 className={styles.candidatesTitle} id={CANDIDATES_TITLE_ID}>
            {t('packageBoxes.scanner.candidates.title')}
          </h3>
          <Button
            aria-label={t('packageBoxes.scanner.candidates.back')}
            onClick={onBack}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        <p className={styles.hint}>{t('packageBoxes.scanner.candidates.hint')}</p>
        <ul className={styles.candidatesList}>
          {shown.map((box, index) => (
            <li data-candidate key={box.id}>
              <Button
                className={styles.candidateButton}
                onClick={() => onSelect(box.id)}
                type="button"
                variant="secondary"
              >
                <span className={styles.candidateMain}>
                  <strong>{box.description || box.productCode}</strong>
                  <span className={styles.unit}>{box.emitterTaxId}</span>
                </span>
                <span className={styles.hint}>
                  {t('packageBoxes.scanner.candidates.position', { position: index + 1, total })}
                  {box.measuredAt === null ? null : (
                    <>
                      {' · '}
                      <span className={styles.candidateMeasured}>
                        {t('packageBoxes.scanner.candidates.measured')}
                      </span>
                    </>
                  )}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {total > MAX_CANDIDATES_SHOWN ? (
          <p className={styles.notice}>
            {t('packageBoxes.scanner.candidates.overflow', { shown: shown.length, total })}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

type PackageBoxRowProps = Readonly<{
  box: PackageBox
  isEditing: boolean
  /** Spec 155 (D12, G012): o botão já devolve a origem resolvida — o painel só abre o diálogo. */
  onApplyFamilyMeasure: (offer: ReplicateOffer) => void
  onCancel: () => void
  onMeasure: (input: PackageBoxMeasurementInput) => void
  /** `undefined` com a medida pela câmera desligada na empresa — o botão nem aparece. */
  onMeasureWithCamera: (() => void) | undefined
  onOpen: () => void
  /** A1: o código da recusa do último `PUT` de medida — a linha aberta mostra a mensagem. */
  saveErrorCode: string | undefined
  saving: boolean
}>

function PackageBoxRow({
  box,
  isEditing,
  onApplyFamilyMeasure,
  onCancel,
  onMeasure,
  onMeasureWithCamera,
  onOpen,
  saveErrorCode,
  saving,
}: PackageBoxRowProps) {
  const { t } = useTranslation('nfeWorkspace')

  /**
   * ⚠️ D8/G008: a unidade sai do texto discreto e vira selo em destaque, com a contagem por extenso
   * quando a API resolveu o sufixo numérico (`CX36` → 36) — é a correção direta do que foi
   * reportado como produto duplicado: `CX36` e `FR12` do mesmo sabão eram indistinguíveis na tela.
   */
  const unitBadgeLabel =
    box.packagingUnitCount === undefined
      ? box.commercialUnit
      : t('packageBoxes.packagingUnitBadge', {
          count: box.packagingUnitCount,
          unit: box.commercialUnit,
        })

  /** D9: os contadores já chegam prontos da API — a tela nunca soma de novo por conta própria. */
  const familySize = box.familyPendingCount + box.familyMeasuredCount
  const showFamilyCounter = box.familyKey !== undefined && familySize > 1
  /**
   * D12/G012: medido e pendente na família — para a caixa medida, `familyPendingCount` já exclui
   * ela mesma; para a pendente, `familyPendingCount` já conta a própria (>= 1 sempre).
   */
  const canApplyFamilyMeasure =
    box.familyKey !== undefined && box.familyMeasuredCount >= 1 && box.familyPendingCount >= 1

  return (
    <li className={styles.item} data-within-coverage={box.withinCoverage}>
      <div className={styles.itemHeader}>
        <strong>{box.description || box.productCode}</strong>
        <Badge className={styles.unitBadge} variant="secondary">
          {unitBadgeLabel}
        </Badge>
      </div>
      {showFamilyCounter ? (
        <p className={styles.hint}>
          {t('packageBoxes.family.counter', {
            measured: box.familyMeasuredCount,
            total: familySize,
          })}
        </p>
      ) : null}
      {/*
        ⚠️ O acumulado e a marca de cobertura só valem para o que **falta** medir: eles respondem
        "até onde vale descer a fila". Na caixa já medida eles anunciariam uma decisão que não
        existe mais, e é a medida dela que interessa ali.
      */}
      <p className={styles.hint}>
        {t('packageBoxes.transported', { count: box.transportedVolumes })}
        {box.measuredAt !== null ? null : (
          <>
            {' · '}
            {t('packageBoxes.cumulative', {
              percent: Math.round(box.cumulativeShare * PERCENT_SCALE),
            })}
            {box.withinCoverage ? null : (
              <>
                {' · '}
                <span className={styles.tail}>{t('packageBoxes.tail')}</span>
              </>
            )}
          </>
        )}
      </p>

      {box.measuredAt === null || isEditing ? null : (
        <p className={styles.hint}>
          {t('packageBoxes.measured', {
            height: toCentimetres(box.heightMm),
            length: toCentimetres(box.lengthMm),
            units: box.unitsPerBox,
            width: toCentimetres(box.widthMm),
          })}
          {' · '}
          {measurementSourceLabel(t as Translate, box)}
        </p>
      )}

      {isEditing ? (
        <>
          {/* A1: a recusa do `PUT` digitado aparece na própria linha — antes ela fechava calada. */}
          {saveErrorCode === undefined ? null : (
            <p className={styles.fieldError} role="alert">
              <Icon name="alert" size="sm" />
              {packageBoxMeasureFailureMessage(t as Translate, saveErrorCode)}
            </p>
          )}
          <PackageBoxMeasurementForm
            boxId={box.id}
            /** D7/G009: só pendente e com irmã já medida ganha o botão — os contadores vêm da API (D9). */
            canQuickFillFromFamily={box.measuredAt === null && box.familyMeasuredCount > 0}
            grossWeightGrams={box.grossWeightGrams}
            heightMm={box.heightMm}
            lengthMm={box.lengthMm}
            onCancel={onCancel}
            onSubmit={(submission) => onMeasure({ ...submission, id: box.id })}
            proposal={undefined}
            saving={saving}
            unitsPerBox={resolveInitialUnitsPerBox(box)}
            widthMm={box.widthMm}
          />
        </>
      ) : (
        <div className={styles.actions}>
          <Button onClick={onOpen} size="sm" type="button" variant="secondary">
            <Icon name="edit" />
            {box.measuredAt === null ? t('packageBoxes.measure') : t('packageBoxes.remeasure')}
          </Button>
          {onMeasureWithCamera === undefined ? null : (
            <Button onClick={onMeasureWithCamera} size="sm" type="button" variant="secondary">
              <Icon name="camera" />
              {t('packageBoxes.measureWithCamera')}
            </Button>
          )}
          {!canApplyFamilyMeasure ? null : (
            <PackageBoxFamilyApplyButton box={box} onResolved={onApplyFamilyMeasure} />
          )}
        </div>
      )}
    </li>
  )
}

/**
 * ⚠️ O arquivo cortado não pode parecer completo: sem o aviso, a empresa com mais caixas pendentes
 * que o teto da API baixaria uma lista cortada achando que é a fila inteira. Falha e 429 são
 * `alert`; o resto é `status`.
 */
function PendingExportNotice({
  feedback,
  t,
}: Readonly<{ feedback: PackageBoxPendingExportFeedback; t: Translate }>) {
  if (feedback.kind === 'idle' || feedback.kind === 'preparing') return null
  if (feedback.kind === 'failed' || feedback.kind === 'rateLimited') {
    return (
      /* Falha é erro, não informação: mesmo desenho dos erros de campo deste painel. */
      <p className={styles.fieldError} role="alert">
        <Icon name="alert" size="sm" />
        {t(`packageBoxes.pendingExport.${feedback.kind}`)}
      </p>
    )
  }
  return (
    <p className={styles.hint} role="status">
      {feedback.kind === 'truncated'
        ? t('packageBoxes.pendingExport.truncated', { total: feedback.total })
        : t('packageBoxes.pendingExport.empty')}
    </p>
  )
}
