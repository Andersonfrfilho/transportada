/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryLocation } from '@/modules/shared/portal.types'
import {
  MAP_VIEWBOX_SIZE,
  formatCoordinate,
  projectPoint,
  toPoint,
} from '@/modules/deliveries/shared/mapProjection.service'

const GRID_STEPS = 4

type DeliveryMapProps = Readonly<{ location: DeliveryLocation }>

/**
 * ADR-0050 §5: **o mapa é desenho nosso.** Nada de tile de terceiro — a CSP declara `frame-src
 * 'none'` e `img-src 'self'`, então nem `iframe` nem imagem remota renderizam aqui, e a coordenada da
 * carga não sai para servidor de mapa nenhum. Mandar a posição a um provedor de mapas para *ver* a
 * posição entregaria a rota do caminhão a um terceiro que não tem contrato conosco.
 *
 * ⚠️ **Não há contorno de município.** A ADR previa a malha do IBGE, como no mapa de zonas do painel,
 * mas o payload mínimo do portal (§4) não carrega cidade nem UF — e alargá-lo só para desenhar um
 * contorno trocaria privacidade por enfeite. O que fica é um localizador com grade e escala: dá a
 * posição e a noção de distância, que é o que a pergunta "onde está minha carga" pede.
 */
export function DeliveryMap({ location }: DeliveryMapProps) {
  const point = toPoint(location)
  if (point === null) return null

  const marker = projectPoint({ center: point, point })
  const gridStep = MAP_VIEWBOX_SIZE / GRID_STEPS

  return (
    <figure className="panel" style={{ margin: 0 }}>
      <svg
        aria-label={`Posição da carga em ${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}`}
        className="map"
        role="img"
        viewBox={`0 0 ${MAP_VIEWBOX_SIZE} ${MAP_VIEWBOX_SIZE}`}
      >
        {Array.from({ length: GRID_STEPS - 1 }, (_, index) => (index + 1) * gridStep).map(
          (offset) => (
            <g key={offset} opacity={0.25} stroke="currentColor" strokeWidth={0.3}>
              <line x1={0} x2={MAP_VIEWBOX_SIZE} y1={offset} y2={offset} />
              <line x1={offset} x2={offset} y1={0} y2={MAP_VIEWBOX_SIZE} />
            </g>
          ),
        )}
        <circle cx={marker.x} cy={marker.y} fill="var(--color-copper)" r={3} />
        <circle
          cx={marker.x}
          cy={marker.y}
          fill="none"
          opacity={0.6}
          r={8}
          stroke="var(--color-copper)"
          strokeWidth={0.6}
        />
      </svg>
      <p className="panel__label">
        {formatCoordinate(point.latitude)}, {formatCoordinate(point.longitude)} · grade de ~13 km
      </p>
      <figcaption className="panel__label">
        Última posição em {new Date(location.recordedAt).toLocaleString('pt-BR')}
      </figcaption>
    </figure>
  )
}
