/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { mdfeFiscalDocuments, mdfeManifests } from '../../database/mdfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import { tripDrivers } from '../../database/trip.schema.js'
import type {
  MdfeDocumentLookup,
  MdfeDocumentSourcePort,
  MdfeDocumentSourceQuery,
} from '../application/read-mdfe-document.port.js'
import type { MdfeDatabase } from './mdfe-queryable.type.js'

/**
 * Encerrado ainda é documento válido a apresentar — o que não se imprime é o cancelado, porque
 * declarar carga sobre manifesto cancelado é declarar o que não existe.
 */
const PRINTABLE_DOCUMENT_STATUSES = ['authorized', 'closed'] as const

const DOCUMENT_JOIN = and(
  eq(mdfeFiscalDocuments.companyId, mdfeManifests.companyId),
  eq(mdfeFiscalDocuments.manifestId, mdfeManifests.id),
  inArray(mdfeFiscalDocuments.status, [...PRINTABLE_DOCUMENT_STATUSES]),
  isNull(mdfeFiscalDocuments.cancellationRequestedAt),
)

const XML_OBJECT_JOIN = and(
  eq(storedObjects.companyId, mdfeFiscalDocuments.companyId),
  eq(storedObjects.id, mdfeFiscalDocuments.xmlObjectId),
)

export function createMdfeDocumentSource(database: MdfeDatabase): MdfeDocumentSourcePort {
  return {
    async findAuthorizedDocument(query: MdfeDocumentSourceQuery): Promise<MdfeDocumentLookup> {
      /**
       * O motorista entra pela **própria escala**: o vínculo dele com a viagem é a condição da
       * junção, não um filtro depois. Manifesto de outra viagem simplesmente não vira linha, e a
       * resposta é a mesma de manifesto inexistente — dizer "existe, mas não é seu" já entrega que
       * ele existe.
       */
      const driverJoin =
        query.driverId === undefined
          ? undefined
          : and(
              eq(tripDrivers.companyId, mdfeManifests.companyId),
              eq(tripDrivers.tripId, mdfeManifests.tripId),
              eq(tripDrivers.driverId, query.driverId),
            )

      const base = database
        .select({
          accessKey: mdfeFiscalDocuments.accessKey,
          authorizedAt: mdfeFiscalDocuments.authorizedAt,
          bucket: storedObjects.bucket,
          objectKey: storedObjects.objectKey,
          protocol: mdfeFiscalDocuments.authorizationProtocol,
        })
        .from(mdfeManifests)
        .leftJoin(mdfeFiscalDocuments, DOCUMENT_JOIN)
        .leftJoin(storedObjects, XML_OBJECT_JOIN)

      const scoped = driverJoin === undefined ? base : base.innerJoin(tripDrivers, driverJoin)
      const [row] = await scoped
        .where(
          and(eq(mdfeManifests.companyId, query.companyId), eq(mdfeManifests.id, query.manifestId)),
        )
        .limit(1)

      if (row === undefined) return { kind: 'missing' }
      if (row.accessKey === null || row.bucket === null || row.objectKey === null) {
        return { kind: 'not-authorized' }
      }

      return {
        document: {
          accessKey: row.accessKey,
          authorizedAt: row.authorizedAt?.toISOString() ?? null,
          bucket: row.bucket,
          objectKey: row.objectKey,
          protocol: row.protocol ?? '',
        },
        kind: 'authorized',
      }
    },
  }
}
