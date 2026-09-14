# Spec 119 — Plano

- **API** (`trips/domain`): `CargoPlanBox`, `PlacementBox` e `PlacedBox` ganham `documentId` e
  `documentNumber`; `toPlacementBoxes` e os três pontos que criam `PlacedBox` copiam os dois;
  `buildCargoPreviewStops` e `drizzle-trip.repository.ts` carimbam a nota nas caixas dela.
- **Frontend**: `noteTone.service.ts` (tons, trava contra colisão, notas por parada);
  `stopFocus.service.ts` ganha o foco por nota; `cargo-isometric.tsx` pinta por `currentColor` +
  classe de tom e marca a presumida com contorno pontilhado; `TripCargoLayers` lista as notas da
  parada.
- **Contratos antes**: `api/test/cargo-placement/note-identity.contract.ts` e
  `frontend/test/trip/note-tone.contract.ts`, mais os ajustes dos contratos da lavagem e do foco.
