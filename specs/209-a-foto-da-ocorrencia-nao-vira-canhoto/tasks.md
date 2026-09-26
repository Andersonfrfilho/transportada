# Tasks — Spec 209 (a foto da ocorrência não vira canhoto)

> 🤖 Modelo: `opus`. É defeito P0 que cruza API, app do motorista e legado.

- [x] **T1** Contratos antes, vistos falhar:
  - API: `test/trip-occurrence/stop-upload.contract.ts`;
  - API: `test/integration/stop-occurrence-photo.integration.ts`;
  - app do motorista: `test/driver-trip/stop-occurrence-photo.contract.ts`.
- [x] **T2** API:
  - rotas de upload por parada;
  - `attachmentObjectId` na ocorrência de parada;
  - reenvio que completa o anexo.
  - Gates: contrato, integração, typecheck e lint.
- [x] **T3** App do motorista:
  - item `stopOccurrencePhoto`;
  - redução da foto;
  - fila cheia derruba a foto;
  - `onOccurrencePhoto` removido.
  - Gates: `check` e `smoke` (porta 53112).
- [x] **T4** Legado `/minha-viagem`: a mesma correção. Gate: `test` do painel.
- [x] **T5** `evidence.md`, com os números dos gates e a consulta somente leitura de diagnóstico.
- [x] **T6** Revisão de design do formulário "Deu problema": print em 375 px.

## Pendências fora desta spec

- Mostrar a foto da ocorrência de parada no feed e na linha do tempo do escritório.
- `PUT` que falha por CSP. A drenagem o trata como "sem rede" e segura os itens de trás. Vale para a
  179 também.
