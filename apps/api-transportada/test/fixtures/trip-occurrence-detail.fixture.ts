/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T201: um detalhe de ocorrência de nota completo, com o bloco do motorista preenchido.
 */
import type { TripOccurrenceDetail } from '../../src/trips/application/read-trip-occurrence-detail.use-case.js'

export const OCCURRENCE_DETAIL: TripOccurrenceDetail = {
  actorName: 'Operador de campo',
  case: null,
  channel: 'driver_app',
  createdAt: '2026-09-24T14:12:00.000Z',
  description: 'Recebedor cobrando descarga.',
  driver: {
    driverId: '00000000-0000-4000-8000-00000000f001',
    email: 'motorista@example.test',
    licenseCategory: 'E',
    licenseExpiresAt: '2028-03-31',
    name: 'Motorista A',
    phone: '5511999990001',
    picturePath: null,
    whatsappPhone: '5511999990001',
  },
  driverName: 'Motorista A',
  hasAttachment: true,
  id: '00000000-0000-4000-8000-00000000d001',
  invoiceNumber: '4512',
  invoiceSeries: '1',
  notifies: false,
  onBehalfOfDriverName: null,
  source: 'document',
  stage: 'delivery',
  stopLabel: 'Parada 2',
  tripId: '00000000-0000-4000-8000-00000000a001',
  typeName: 'Cobrança inesperada',
  vehiclePlate: 'ABC1D23',
}
