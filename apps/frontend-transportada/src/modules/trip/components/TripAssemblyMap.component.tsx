/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import {
  IBGE_MESH_STALE_TIME_MS,
  loadStateMeshFeatures,
  type MeshFeature,
} from '@/modules/shared/ibgeMesh.service'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { useSolverCityOrder } from '../hooks/useSolverCityOrder.hook'
import { buildAssemblyMap, type AssemblyMapNote } from '../shared/assemblyMap.service'
import { buildStopAddressKey } from '../shared/stopAddressKey.service'
import { stopColorOf } from '../shared/stopColor.service'
import {
  buildAssemblyLegs,
  formatDuration,
  totalAssemblyMinutes,
} from '../shared/assemblyLeg.service'
import {} from '../shared/tileMap.service'
import { moveCity, proposeCityOrder, type AssemblyCityOrder } from '../shared/assemblyOrder.service'
import styles from '../styles/trip.module.css'

/**
 * ⚠️ O mapa entra por `lazy`, e isso **não é micro-otimização**: o MapLibre sozinho leva o bundle do
 * painel a 3 MB, acima do teto de 2 MiB do precache do workbox — com ele no pacote principal o
 * build de produção do PWA falha. Fora dele, o mapa só é baixado por quem abre a montagem de viagem
 * com nota selecionada, que é a única tela que o usa.
 */
const AssemblyVectorMap = lazy(async () => ({
  default: (await import('./AssemblyVectorMap.component')).AssemblyVectorMap,
}))

/** A altura é a mesma de `.vectorMap` — o esqueleto tem a forma do que ele antecede, não uma barra. */
const MAP_HEIGHT = '18rem'

type TripAssemblyMapProps = Readonly<{
  /** As notas que o filtro alcança e a seleção deixou de fora — o que faltou, em cinza claro. */
  nearby: readonly AssemblyMapNote[]
  onOrderChange: (order: AssemblyCityOrder) => void
  order: AssemblyCityOrder
  selected: readonly AssemblyMapNote[]
  /** O veículo escolhido no diálogo. O solver exige um: capacidade muda o roteiro. */
  vehicleId: string
}>

/** Nomear mais que isto vira parede de texto; o excedente sai como contagem. */
const NEARBY_NAME_LIMIT = 6
/** A altura é fixa e a largura é medida: a telha é pixel, e não acompanha `viewBox` nenhum. */
/**
 * A cor da parada casa o pino no mapa com a linha na lista. São os mesmos seis tons que a fatia do
 * baú usa (spec 076): a sétima parada recomeça no primeiro, porque inventar tom novo aqui daria
 * duas paletas para a mesma viagem.
 */

/** `2026-09-05T17:40:00Z` vira "05/09 17:40" — data curta porque o roteiro é do dia, não do ano. */
function formatFinishTime(iso: string): string {
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return iso
  return quando.toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
}

/**
 * O mapa de quem **monta** a viagem.
 *
 * Ele responde duas perguntas que a fila de notas não responde: "esta carga está junta?" e "sobrou
 * alguma cidade vizinha de fora?". A segunda é a razão de o desenho enquadrar também o que não foi
 * escolhido — cidade fora do enquadramento é cidade que ninguém percebe que faltou.
 *
 * ⚠️ **A ordem daqui não é o roteiro.** Ela é a ordem das paradas que o operador quer, e vira
 * `PATCH /trips/:id/stops/order` depois que a viagem nasce; a distância rodada continua saindo do
 * roteirizador em `plan-route`. A proposta do botão é vizinho mais próximo em linha reta, e o texto
 * ao lado dela diz isso.
 */
export function TripAssemblyMap({
  nearby,
  onOrderChange,
  order,
  selected,
  vehicleId,
}: TripAssemblyMapProps) {
  const { t } = useTranslation('trip')
  /**
   * ⚠️ O fundo de rua é o `.pmtiles` **nosso** (ADR-0044 §6), e enquanto ele não for gerado do
   * extract não há telha para servir. A ADR já decidiu o comportamento: cair para a lista ordenada
   * **e dizer isso**. Ícone de imagem quebrada não diz nada — parece defeito, e some com o roteiro
   * atrás do estrago.
   */
  const [hasBasemap, setHasBasemap] = useState(true)

  const states = useMemo(
    () =>
      [
        ...new Set(
          [...selected, ...nearby].map((note) => note.state ?? '').filter((state) => state !== ''),
        ),
      ].sort(),
    [nearby, selected],
  )

  const meshQuery = useQuery({
    enabled: states.length > 0,
    queryFn: async ({ signal }) => {
      const meshes = await Promise.all(
        states.map((state) =>
          loadStateMeshFeatures({ fetch: globalThis.fetch.bind(globalThis), signal, state }),
        ),
      )
      return meshes.flat()
    },
    queryKey: ['trip-assembly-mesh', states] as const,
    staleTime: IBGE_MESH_STALE_TIME_MS,
  })

  /**
   * A ordem manda no desenho: a parada é numerada pela posição que o operador deu a ela.
   *
   * ⚠️ **O ranque é por chave de parada, não por código de cidade.** `AssemblyCityOrder` mente no
   * nome: quem a alimenta é `reconcileCityOrder`, com `buildStopAddressKey(...)` — ela guarda
   * `cidade|CEP|número`. Consultá-la por `cityCode` nunca casa, todo item cai no
   * `MAX_SAFE_INTEGER`, e o `sort` vira no-op **silencioso**: os botões de subir e descer mudavam
   * a ordem de verdade e a lista não se mexia, sem erro nenhum. A mesma chave que o vínculo cria é
   * a que o solver devolve em `address_key`.
   */
  const orderedSelection = useMemo(() => {
    const rank = new Map(order.map((key, index) => [key, index]))
    const rankOf = (note: AssemblyMapNote) =>
      rank.get(
        buildStopAddressKey({
          cityCode: note.cityCode,
          number: note.addressNumber,
          postalCode: note.postalCode,
        }) ?? `cidade:${note.cityCode ?? ''}`,
      ) ?? Number.MAX_SAFE_INTEGER
    return [...selected].sort((left, right) => rankOf(left) - rankOf(right))
  }, [order, selected])

  const features = meshQuery.data ?? ([] as readonly MeshFeature[])
  /**
   * ⚠️ **Memoizado, e isso não é performance.** Sem `useMemo` o `map` é reconstruído a cada
   * renderização, e com ele `map.points` — um array novo toda vez. Os dois efeitos do mapa vetorial
   * têm `points` nas dependências: eles removiam e recriavam todos os marcadores, e re-enquadravam
   * o mapa, a cada render. Pino e linha passavam a discordar de lugar porque nunca terminavam de
   * ser desenhados sobre o mesmo estado.
   */
  const map = useMemo(
    () => buildAssemblyMap({ features, nearby, selected: orderedSelection }),
    [features, nearby, orderedSelection],
  )

  /**
   * ⚠️ Este `useQuery` fica **antes** do retorno antecipado abaixo: gancho depois de um retorno
   * condicional muda a ordem entre renders, e o React derruba a tela inteira com "Rendered more
   * hooks than during the previous render" — o modal simplesmente não abria. É o mesmo aviso que
   * já estava escrito no mapa da viagem, e que eu não segui.
   */
  /**
   * ⚠️ A chave da consulta é a **ordem das paradas**, não a viagem: reordenar muda o caminho, e uma
   * chave por seleção devolveria a estrada da ordem anterior. Só liga com duas paradas ou mais —
   * abaixo disso não há caminho a pedir.
   */
  const routeKey = map.points.map((point) => `${point.latitude},${point.longitude}`).join(';')
  const geometryQuery = useQuery({
    enabled: map.points.length >= 2,
    queryFn: () =>
      getTripClient().readPointsRouteGeometry({
        points: map.points.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        })),
      }),
    queryKey: ['trip-assembly-route-geometry', routeKey] as const,
    /** A estrada entre dois pontos não muda a cada minuto; o mapa não precisa repetir a pergunta. */
    staleTime: 5 * 60 * 1000,
  })

  /** Enquanto a sonda não responde, as telhas tentam — trocar de desenho depois pisca menos que antes. */

  /**
   * ⚠️ **Sem nota escolhida não há mapa** — nem o quadro vazio. Antes o portão exigia também nenhuma
   * cidade por perto, então com a seleção vazia e o filtro aberto a tela desenhava um mapa sem uma
   * única parada nele: moldura, controles e nada dentro. Quadro vazio lê como defeito, e quem abre a
   * tela pela primeira vez não tem como saber que aquilo é o estado normal.
   */
  /**
   * ⚠️ **Acima do retorno antecipado, e isso não é estilo.** Hook depois de um `return` condicional
   * muda a contagem entre renderizações — o React derruba a tela inteira com "Rendered more hooks
   * than during the previous render", e o modal simplesmente não abre. É o mesmo aviso que já está
   * escrito duas vezes neste arquivo, e que eu repeti mesmo assim.
   */
  const solver = useSolverCityOrder({
    onOrderChange,
    order,
    points: map.points,
    vehicleId: vehicleId === '' ? null : vehicleId,
  })

  if (map.points.length === 0) {
    return <p className={styles.hint}>{t('assemblyMap.empty')}</p>
  }

  /**
   * ⚠️ O texto do cinza só existe **depois** de haver seleção, e nomeia poucas cidades. Sem nenhuma
   * nota escolhida tudo está "de fora", e a tela abria com cinquenta municípios enfileirados — que
   * é ruído com aparência de aviso. Quem responde "o que faltou" é o ponto cinza no desenho; o
   * texto é o atalho para as primeiras, e o resto vira contagem.
   */
  const nearbyNotice =
    map.points.length === 0 || map.nearby.length === 0
      ? null
      : /**
         * A chave é escolhida aqui, e não pelo plural do i18next: com excedente zero o plural de
         * pt-BR cai em `other` e a frase sairia "e mais 0 cidades".
         */
        t(map.nearby.length > NEARBY_NAME_LIMIT ? 'assemblyMap.nearbyMore' : 'assemblyMap.nearby', {
          cities: map.nearby
            .slice(0, NEARBY_NAME_LIMIT)
            .map((point) => point.label)
            .join(', '),
          count: map.nearby.length - NEARBY_NAME_LIMIT,
        })

  /**
   * ⚠️ O enquadramento é o da **seleção**, não o de tudo. Cabendo também o que ficou de fora, o
   * mapa recuava até o estado inteiro — medido: zoom 6, com as quatro paradas em cima umas das
   * outras. E "perto" deixa de querer dizer alguma coisa quando o quadro tem 400 km de lado.
   *
   * A cidade fora da seleção continua desenhada: ela aparece se cair dentro do quadro, que é
   * exatamente a definição de perto. A que não cabe segue nomeada no texto abaixo.
   */
  /**
   * ⚠️ O trecho é o que vem **antes** da parada seguinte, então ele é impresso ao pé da parada de
   * origem: "daqui até a próxima". Pendurá-lo na parada de destino leria como tempo já gasto.
   */
  /**
   * ⚠️ Os trechos saem da **geometria**, não das coordenadas. Sem roteirizador a lista é vazia e a
   * tela não imprime tempo nenhum — ADR-0044 §5: não se estima o que o OSRM não respondeu.
   */
  const legs = buildAssemblyLegs({ geometry: geometryQuery.data ?? null, points: map.points })
  const legOf = (index: number) => legs[index] ?? null

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('assemblyMap.title')}</h3>
      {hasBasemap ? (
        <Suspense
          fallback={
            <SkeletonGroup label={t('assemblyMap.loading')}>
              <Skeleton height={MAP_HEIGHT} variant="block" />
            </SkeletonGroup>
          }
        >
          <AssemblyVectorMap
            geometry={geometryQuery.data ?? null}
            nearby={map.nearby}
            onBasemapMissing={() => setHasBasemap(false)}
            points={map.points}
            stopColor={stopColorOf}
          />
        </Suspense>
      ) : (
        /*
          ADR-0044 §6: sem o arquivo de mapa o painel **cai para a lista e diz isso**. A ordem, os
          endereços e o tempo continuam valendo — o mapa confere a sugestão, ele não é a sugestão.
        */
        <p className={styles.hint}>{t('assemblyMap.withoutBasemap')}</p>
      )}
      {legs.length === 0 ? null : (
        <p className={styles.hint}>
          {t('assemblyMap.totalTime', { duration: formatDuration(totalAssemblyMinutes(legs)) })}
        </p>
      )}
      {/*
        ⚠️ `ul` e não `ol`: a numeração é impressa por nós, com a cor da parada, e o marcador do
        navegador se somava a ela ao copiar o texto — "1. 1. RIBEIRAO PRETO" na área de transferência.
      */}
      <ul className={styles.assemblyOrder}>
        {map.points.map((point, index) => (
          <li key={point.stopKey}>
            <div className={styles.assemblyStop}>
              <span
                className={styles.assemblyBullet}
                style={{ background: stopColorOf(point.sequence ?? 1) }}
              >
                {point.sequence}
              </span>
              <div className={styles.assemblyStopBody}>
                <span className={styles.assemblyStopCity}>{point.label}</span>
                {/*
                  ⚠️ Metade desta base tem precisão só de município: o ponto é o **centroide**, não o
                  endereço. Sem este aviso o palpite lê como entrega de verdade — e o motorista vai
                  procurar porta onde só há mato (ADR-0044 §1).
                */}
                {point.isApproximate ? (
                  <span className={styles.assemblyStopApproximate}>
                    {t('assemblyMap.approximate')}
                  </span>
                ) : null}
                {point.notes.map((note) => (
                  <span className={styles.assemblyStopNote} key={note.id}>
                    {describeNote(note)}
                  </span>
                ))}
                {legOf(index) === null ? null : (
                  <span className={styles.assemblyStopLeg}>
                    {t('assemblyMap.legTime', {
                      distance: Math.round(legOf(index)?.distanceKilometres ?? 0),
                      duration: formatDuration(legOf(index)?.minutes ?? 0),
                    })}
                  </span>
                )}
              </div>
            </div>
            <Button
              aria-label={t('assemblyMap.moveUp', { label: point.label })}
              disabled={index === 0}
              onClick={() => onOrderChange(moveCity({ code: point.stopKey, direction: -1, order }))}
              size="sm"
              variant="ghost"
            >
              <Icon name="chevron-up" />
            </Button>
            <Button
              aria-label={t('assemblyMap.moveDown', { label: point.label })}
              disabled={index === map.points.length - 1}
              onClick={() => onOrderChange(moveCity({ code: point.stopKey, direction: 1, order }))}
              size="sm"
              variant="ghost"
            >
              <Icon name="chevron-down" />
            </Button>
          </li>
        ))}
      </ul>
      <div className={styles.assemblyActions}>
        <Button
          disabled={map.points.length < 3}
          onClick={() => onOrderChange(proposeCityOrder({ order, points: map.points }))}
          type="button"
          variant="secondary"
        >
          <Icon name="truck" />
          {t('assemblyMap.propose')}
        </Button>
        {/*
          ⚠️ Este é o roteirizador de verdade — estrada, capacidade e janela —, e por isso ele pede
          veículo e demora. O botão ao lado continua existindo porque é instantâneo e não depende de
          nada: serve para arrumar a lista antes de escolher o caminhão.
        */}
        <Button
          disabled={solver.blockReason !== null || solver.state === 'pedindo'}
          onClick={() => {
            void solver.request()
          }}
          type="button"
          variant="secondary"
        >
          <Icon name="target" />
          {t(solver.state === 'pedindo' ? 'assemblyMap.solving' : 'assemblyMap.solve')}
        </Button>
      </div>
      <p className={styles.hint}>
        {solver.blockReason === 'sem-veiculo'
          ? t('assemblyMap.solveNeedsVehicle')
          : t('assemblyMap.proposeHint')}
      </p>
      {solver.state === 'erro' ? (
        <p className={styles.hint}>{t('assemblyMap.solveFailed')}</p>
      ) : null}
      {/*
        O término previsto vem do solver, e vem com o que há de errado com ele. O aviso é de leitura,
        não bloqueio: quem decide se vale sair num sábado é quem carrega o caminhão.
      */}
      {solver.finish === null || solver.finish.arrivalIso === null ? null : (
        <p className={styles.hint}>
          {t('assemblyMap.finish', {
            distance: solver.finish.distanceKilometres?.toFixed(1) ?? '—',
            time: formatFinishTime(solver.finish.arrivalIso),
            total: formatDuration(solver.finish.minutes ?? 0),
          })}
          {solver.finish.warnings.length === 0
            ? null
            : ` ${t('assemblyMap.finishWarning', {
                reasons: solver.finish.warnings.map((warning) => warning.detail).join(', '),
              })}`}
        </p>
      )}
      {/* O mapa diz de onde veio a linha: estrada medida, ou reta assumida enquanto ela não vem. */}
      {map.points.length < 2 ? null : (
        <p className={styles.hint}>
          {t(
            geometryQuery.data?.source === 'road'
              ? 'assemblyMap.trace.road'
              : 'assemblyMap.trace.straight',
          )}
        </p>
      )}
      {nearbyNotice === null ? null : <p className={styles.hint}>{nearbyNotice}</p>}
      {map.unmapped.length === 0 ? null : (
        <p className={styles.hint}>
          {t('assemblyMap.unmapped', { cities: map.unmapped.join(', ') })}
        </p>
      )}
    </section>
  )
}

/**
 * A linha da nota dentro da parada: número, quem recebe, a rua com número e o CEP. Campo ausente
 * some da linha em vez de virar traço — a nota que não trouxe CEP não precisa anunciar isso.
 */
function describeNote(note: AssemblyMapNote): string {
  return [note.number, note.recipient, note.address, formatPostalCode(note.postalCode)]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join(' · ')
}

/** O banco guarda oito dígitos; quem lê espera o traço. */
function formatPostalCode(value: null | string): null | string {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null
}
