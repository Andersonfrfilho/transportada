/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'

import type { TripTimelineKind } from './trip.types'

/** A mesma permissão que a API cobra para devolver a coordenada do evento (ADR-0081 §6). */
export const OCCURRENCE_TRIP_MAP_EVENT_LOCATION_PERMISSION = 'trip.event-location'

/** Os dois `kind` da linha do tempo cujo `id` é o id da ocorrência (parada e nota). */
export const OCCURRENCE_TRIP_MAP_OCCURRENCE_KINDS = [
  'stop.occurrence',
  'document.occurrence',
] as const satisfies readonly TripTimelineKind[]

/** Páginas de 100 eventos lidas por vez: o teto evita varrer uma viagem enorme só para desenhar um mapa. */
export const OCCURRENCE_TRIP_MAP_MAX_TIMELINE_PAGES = 5

export const OCCURRENCE_TRIP_MAP_STOP_PIN_KEY_PREFIX = 'occurrence-map-stop-'
export const OCCURRENCE_TRIP_MAP_EVENT_PIN_KEY_PREFIX = 'occurrence-map-event-'

/** Ícone da linha da legenda cujo evento não tem posição: o mesmo "sem posição" da linha do tempo. */
export const OCCURRENCE_TRIP_MAP_WITHOUT_POSITION_ICON = 'map-pin-off' satisfies IconName

/** O aviso de quem não pode ver a coordenada, e o pino da parada da nota. */
export const OCCURRENCE_TRIP_MAP_RESTRICTED_ICON = 'eye-off' satisfies IconName
export const OCCURRENCE_TRIP_MAP_STOP_ICON = 'package' satisfies IconName

/** Zoom mínimo ao centralizar um pino pela legenda: perto o bastante para separar pinos vizinhos. */
export const OCCURRENCE_TRIP_MAP_FOCUS_ZOOM = 16
