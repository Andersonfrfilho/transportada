# Plano técnico — Spec 194

Leia `spec.md` (D1–D5) e a ADR-0078 antes deste plano.

## Contexto e premissas

Estado conferido no código em 2026-09-25 (branch `work/driver-app`, base com `6aef92ab6`, os três
botões iguais "Tirar foto", "Anexar", "Colher assinatura"):

- **Fluxo da foto** — `DeliveryProofSection` (`apps/frontend-driver/src/modules/driver-trip/components/DriverStopCard.component.tsx`,
  props `documentId`, `onProof`, `proofSettings` em `:478-482`; reaproveitada em
  `pages/DriverPendingProofs.page.tsx`, onde `isQueued` a **desmonta**). Os dois `FilePickerButton`
  fazem `setCropFile(file)` → `<ProofCrop>` → `onConfirm={(file) => { setCropFile(null);
attach('photo', file) }}` → `onProof` (devolve `void`) → `DriverTripWorkspace.page.tsx:handleProof` →
  `useDriverTrip.attachProof` (`persistWhileOpen` + `enqueueProof`, `:489-535`; a `attachmentKey` nasce
  em `:500` e **não volta**) → `enqueueAttachment` (acrescenta; não substitui) → drenagem → `POST
.../documents/:documentId/proof`.
- **Defeito conhecido** — `attach` (`:549-555`) devolve cedo quando falta campo obrigatório e a foto
  some. Corrigido fora desta spec, em task própria: **pré-requisito da fase 1**.
- **Registro de capturas** — `captureRegistry.service.ts`: `close(kind)` chama os ouvintes de `onIdle`
  **na hora** em que fica ocioso. `setCropFile(null)` desmonta o `ProofCrop`, que fecha `'crop'`: sem
  outro kind aberto antes disso, o SW ou o `keycloak.init` podem navegar a página.
- **Câmera** — `useCameraCaptureFieldRef` devolve `RefCallback` (`:27`) e o `FilePickerButton` guarda o
  `<input>` num ref local: não há como pedir `click()` de fora hoje.
- **Pontualidade** — a foto substituta fica com a pior pontualidade (`mergeProofPunctuality`,
  `delivery-proof-punctuality.policy.ts:121-133`), gravada por upsert na API.
- **Recorte** — `proofCrop.service.ts` é cópia por valor do painel: contraste mínimo 30 (min/max),
  limiar na média, cobertura clara em `[0,02; 0,95]`, e **claro ocupando tudo = documento
  enquadrado**. Não muda.
- **OCR no painel** — `apps/frontend-transportada/src/modules/trip/shared/`: `canhotoOcrEngine.service.ts`
  (singleton por aba em `:12-13`, `CANHOTO_OCR_TIMEOUT_MS = 15_000` só no `recognize`),
  `canhotoOcrVersion.constant.ts`, `canhotoOcr.service.ts` (`extractCanhotoNumberFromWords`, limiar 80);
  `scripts/fetch-canhoto-ocr.ts`; `vite.config.ts` (`globIgnores`, `CacheFirst`, `manualChunks`
  `tesseract-ocr`); `server.ts` (`CANHOTO_OCR_PREFIX`).
- **App do motorista** — `script-src 'self'`, `worker-src 'self'`; `sw.ts` com uma rota; o
  `dist.contract` proíbe `canhoto-ocr|tesseract` em **todo** arquivo; `server.ts` sem pré-comprimido.
- **Interruptor** — `canhoto_ocr_enabled` fora do snapshot do motorista (`readProofSettings` lê só os
  quatro modos).
- **Snapshot** — `stops[].documents[]` com `number`/`series`; `pendingProofs[]` com
  `documentNumber`/`documentSeries`.
- **Testes da API** — `test/test-registry/declaration.contract.ts` confere só `scripts.test`; integração
  nova vai em `scripts["test:integration"]` do `package.json` da API.
- **Preview** — motorista em `53200` + API de demonstração do scratchpad (`driver-preview-api.ts`),
  que precisa ganhar `canhotoOcrEnabled: true` no `snapshot()` para a fase 2.

## Coordenação com as specs vizinhas

Regra comum: **nenhum caminho de `attach` descarta a foto**. Quem entra depois faz rebase +
`bun install --frozen-lockfile` e confere `git log` do arquivo antes do gate.

| Arquivo / área                                             | 192               | 193                                                 | 195        | 196                           | 194                                                         | Ordem                                                                                            |
| ---------------------------------------------------------- | ----------------- | --------------------------------------------------- | ---------- | ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| task do `attach` que descarta a foto (fora das specs)      | —                 | —                                                   | —          | —                             | pré-requisito                                               | **primeiro de tudo**                                                                             |
| `DriverStopCard.component.tsx` › `DeliveryProofSection`    | selo no cartão    | grupo "quem recebeu", botão rápido, `recipientName` | botão novo | —                             | `onConfirm` do `ProofCrop`, aviso de qualidade, props novas | 194 F1 antes da 193 F4 (a 194 não depende de API); 193 F4 faz rebase; 192/195 tocam outro trecho |
| `captureRegistry.service.ts` › `CAPTURE_KINDS`             | `'stop-order'`    | —                                                   | —          | —                             | `'proof-check'`                                             | linha acrescentada; qualquer ordem, conflito trivial                                             |
| `offlineAttachments.service.ts` › `QueuedAttachment`       | —                 | `receivedBy?`, `receivedByDetail?`                  | —          | —                             | `replaceQueuedProof` (F1); códigos (F4)                     | 194 F1 e 193 F4 independentes; 194 F4 depois da 193 F4                                           |
| `useDriverTrip.hook.ts` › `attachProof`/`enqueueProof`     | —                 | campos novos no anexo                               | —          | carimbo de posição nos toques | devolve `attachmentKey` (F2), substituição (F1)             | 196 antes da 194 F2, ou rebase; 194 F1 só acrescenta função                                      |
| `driverTripClient.service.ts` › multipart de `attachProof` | —                 | `form.set` de `receivedBy*`                         | ocorrência | não pode perder lat/long      | códigos (F4)                                                | 194 F4 por último                                                                                |
| `driverTripResponse.validation.ts` / `driverTrip.types.ts` | ordem das paradas | `deliveryProof.receivedBy`, contato                 | —          | tipos de carimbo              | `canhotoOcrEnabled` (F2)                                    | campos independentes; rebase                                                                     |
| `DriverTripWorkspace.page.tsx`                             | editor de ordem   | —                                                   | —          | carimbo                       | estado do OCR por `documentId` (F2)                         | 196 e 192 antes da 194 F2, ou rebase                                                             |
| `DriverPendingProofs.page.tsx`                             | —                 | a seção reaproveitada                               | —          | —                             | resultado do OCR na linha (F2)                              | independente                                                                                     |
| migration em `trip_delivery_proofs`                        | —                 | `received_by`, `received_by_detail` (T2.2)          | —          | expurgo lê a tabela           | códigos (F4, opcional)                                      | **194 F4 junto com a 193 ou depois dela**, número conferido em `origin/staging`                  |
| `locales/driverTrip*.locale.json`                          | sim               | sim                                                 | sim        | sim                           | `proofCheck.*`, `canhotoNumber.*`                           | chaves próprias; rebase                                                                          |

197 e 198 não existiam em nenhuma branch nem worktree em 2026-09-25: a T1.0 confere de novo e
acrescenta linhas aqui se aparecerem.

## Arquitetura e arquivos afetados

Tudo em `apps/frontend-driver/` salvo indicação.

### Fase 1 — qualidade, grava primeiro

| Arquivo                                                                         | Papel                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/driver-trip/shared/proofPhotoCheck.constant.ts` (novo)             | `PROOF_PHOTO_CHECK_ENABLED`, limiares (provisórios até a T1.2b), `PROOF_PHOTO_ANALYSIS_MAX_SIDE = 640`, `PROOF_PHOTO_SHARPNESS_WINDOW = 1024`, ordem dos motivos |
| `src/modules/driver-trip/shared/proofPhotoCheck.types.ts` (novo)                | `ProofPhotoIssue`, `ProofPhotoAssessment`, `ProofPhotoSource`                                                                                                    |
| `src/modules/driver-trip/shared/proofPhotoQuality.service.ts` (novo)            | puro: `computeLuminancePercentiles`, `assessDocumentPresence`, `assessDocumentCut`, `measureSharpness`, `assessPaperExposure`, `assessProofPhotoQuality`         |
| `src/modules/driver-trip/shared/proofPhotoRaster.service.ts` (novo)             | fino, com canvas: `File` → grade reduzida (640 px) + janela central em resolução nativa (≤ 1024 × 1024) para a nitidez; sem regra                                |
| `src/modules/driver-trip/shared/offlineAttachments.service.ts`                  | `replaceQueuedProof`: acrescenta a nova e remove a anterior (mesma `documentId` + `kind`, ainda não enviada) **numa única** `attachmentStore.update`             |
| `src/modules/driver-trip/hooks/useDriverTrip.hook.ts`                           | `attachProof` aceita `replacesAttachmentKey?` e devolve `{ outcome, attachmentKey? }`                                                                            |
| `src/modules/driver-trip/shared/proofPhotoCheckFlow.service.ts` (novo)          | puro: estados `checking → clean \| warn \| skipped`, ações `keep`/`retake`, regra da frase de pontualidade (parada concluída)                                    |
| `src/modules/driver-trip/hooks/useProofPhotoCheck.hook.ts` (novo)               | orquestra: abre `proof-check`, chama `attach`, analisa, fecha `proof-check`                                                                                      |
| `src/modules/driver-trip/components/ProofPhotoCheckNotice.component.tsx` (novo) | aviso no cartão: motivos com ícone + texto, "Tirar outra" e "Manter"                                                                                             |
| `src/components/ui/file-picker-button.tsx`                                      | `pickerRef` com handle `{ open(): void }` que chama `input.click()` **de forma síncrona** (dentro do gesto do toque)                                             |
| `components/DriverStopCard.component.tsx`                                       | `DeliveryProofSection`: guarda a origem; `onConfirm` → hook; aviso abaixo da miniatura; prop `stopCompleted`                                                     |
| `shared/captureRegistry.service.ts`                                             | `'proof-check'` em `CAPTURE_KINDS`                                                                                                                               |
| `locales/driverTrip*.locale.json`, `*.module.css`                               | `proofCheck.*`; tokens; ≥ 44 px                                                                                                                                  |

**Ordem no `onConfirm`** (dentro do mesmo manipulador, antes do commit do React):
`captureRegistry.open('proof-check')` → `attach('photo', file)` (que abre `'persisting'` pelo
`persistWhileOpen`) → `setCropFile(null)`. Assim o `close('crop')` do desmontar nunca encontra o
registro ocioso. `proof-check` fecha quando a análise termina (ou falha).

**Algoritmo** (puro, sobre `LuminanceGrid` de `proofCrop.service.ts`):

- **Presença** (grade do original): `p5`/`p95` em vez de min/max (um pixel de reflexo ou sombra não
  decide). `p95 − p5 < 30` → `noDocument`. Limiar = `(p5 + p95) / 2`; fração clara < 5% → `noDocument`;
  caixa clara com lado menor < 8% do lado correspondente → `noDocument`. Fração clara alta **não** é
  problema.
- **Corte** (grade do original): componente clara contínua (varredura por linhas com tolerância a
  ruído) que encosta nas duas laterais **e** transições escuras (texto) a menos de 2% da borda lateral
  → `documentCut`. Papel ocupando tudo com margem de texto preservada → nenhum motivo.
- **Nitidez** (janela central nativa): variância de `4·p − (N + S + L + O)`; lado menor < 64 px → não
  avalia.
- **Exposição** (pixels do papel, grade do recorte): média → `tooDark`; desvio → `lowContrast`; fração
  ≥ 250 → `overexposed`.
- Ordem fixa: `noDocument`, `documentCut`, `blurry`, `tooDark`, `lowContrast`, `overexposed`,
  `signatureMissing`.

**Calibração (T1.2b)** — `apps/frontend-driver/scripts/calibrate-proof-photo.ts` (fora do bundle): lê
uma pasta local de fotos (fora do Git) com um CSV de rótulos do usuário (`arquivo,boa|ruim,motivo`),
decodifica com a mesma redução, roda `assessProofPhotoQuality` e imprime a matriz de confusão por
motivo e a varredura de limiares. Só números vão para o `evidence.md`; nenhuma foto entra no
repositório.

### Fase 2 — OCR (🧠)

API (`apps/api-transportada/`):

- `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`: lê `canhoto_ocr_enabled` da
  empresa do contexto (uma consulta; sem linha → `DEFAULT_CANHOTO_OCR_ENABLED`).
- `src/trips/application/find-current-driver-trip.use-case.ts` + tipo da resposta: `canhotoOcrEnabled`.
- `src/trips/domain/delivery-proof-settings.policy.ts`: corrige o comentário (ADR-0078 §4).
- Contrato da rota; integração de isolamento em `test/integration/`, registrada em
  `scripts["test:integration"]`.

App do motorista (cópias por valor com `/* Cópia por valor de <origem> (ADR-0075 §7). */` e entradas no
mapa de `test/driver-trip/copy-by-value-header.contract.ts`):

| Arquivo                                                                                                                                                                        | Papel                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                                                                                                                 | `tesseract.js`, `tesseract.js-core` 7.0.0, `@tesseract.js-data/eng` 1.0.0, `workbox-strategies`/`-expiration`/`-cacheable-response` 7.4.1, exatas; `prebuild`/`predev` |
| `scripts/fetch-canhoto-ocr.ts`, `.gitignore`                                                                                                                                   | cópia; `apps/frontend-driver/public/canhoto-ocr/` ignorado                                                                                                             |
| `shared/canhotoOcrVersion.constant.ts`, `shared/canhotoOcr.service.ts`                                                                                                         | cópia (a segunda só com a extração)                                                                                                                                    |
| `shared/canhotoOcrEngine.service.ts`                                                                                                                                           | cópia + prazo total (`CANHOTO_OCR_TOTAL_DEADLINE_MS = 20_000`, desde o aceite) + `saveData` + `prefetchCanhotoOcrAssets`                                               |
| `shared/canhotoOcrImage.service.ts` (novo)                                                                                                                                     | `File` → canvas ≤ 2000 px no lado maior; giros de 90° para tira vertical                                                                                               |
| `shared/canhotoNumberCheck.service.ts` (novo)                                                                                                                                  | puro: `checkCanhotoNumber({ extraction, proofDocument, stopDocuments })`                                                                                               |
| `hooks/useCanhotoNumberChecks.hook.ts` (novo)                                                                                                                                  | no nível da página: `Map<documentId, { attachmentKey, state }>`; descarta resultado de chave velha ou fora do prazo                                                    |
| `components/CanhotoNumberNotice.component.tsx` (novo)                                                                                                                          | selo "confere" ou aviso; variante informativa para pendências                                                                                                          |
| `pages/DriverTripWorkspace.page.tsx`, `pages/DriverPendingProofs.page.tsx`                                                                                                     | recebem `{ outcome, attachmentKey }` do `attachProof`, disparam o hook, renderizam o aviso chaveado por `documentId`                                                   |
| `components/DriverStopCard.component.tsx`                                                                                                                                      | prop `canhotoNumberChecks` e `onRetakePhoto(documentId)`; o aviso fica fora da `DeliveryProofSection`                                                                  |
| `shared/driverTripResponse.validation.ts`, `shared/driverTrip.types.ts`                                                                                                        | `canhotoOcrEnabled`                                                                                                                                                    |
| `src/sw.ts`                                                                                                                                                                    | segunda rota `CacheFirst` só para `/canhoto-ocr/<versão>/` da própria origem                                                                                           |
| `vite.config.ts`                                                                                                                                                               | `injectManifest.globIgnores`, `manualChunks` `tesseract-ocr` (fica no precache), sem `modulepreload` dele                                                              |
| `server.ts`                                                                                                                                                                    | pré-comprimido + imutável sob `/canhoto-ocr/`; CSP com `'wasm-unsafe-eval'` só nessas respostas (se a sonda aprovar)                                                   |
| `src/modules/shared/contentSecurityPolicy.service.ts`                                                                                                                          | só se a sonda reprovar a CSP no worker                                                                                                                                 |
| `test/dist.contract.test.ts`, `test/shared/service-worker.contract.ts`, `test/shared/content-security-policy.contract.ts`, `test/shared/canhoto-ocr-assets.contract.ts` (novo) | regras da ADR-0078 §5 e §6                                                                                                                                             |
| `apps/frontend-driver/CLAUDE.md`                                                                                                                                               | orçamento, `dist.contract`, segunda rota, CSP — na própria T2.2                                                                                                        |
| `apps/frontend-transportada/src/modules/trip/locales/*`                                                                                                                        | texto do interruptor (RF14)                                                                                                                                            |

### Fase 3 — assinatura

`shared/canhotoSignature.service.ts` (novo, puro): `resolveSignatureRegion({ width, height })`,
`measureInkDensity(grid, region)`, `assessCanhotoSignature(...)`. Constantes no
`proofPhotoCheck.constant.ts`. Sem âncora pelo OCR (ADR-0078 §3). `signatureMissing` entra em
`assessProofPhotoQuality`.

### Fase 4 — metadado na API (opcional, 👤)

Migration aditiva em `trip_delivery_proofs` **depois** (ou junto) da `delivery_proof_received_by` da
193: `quality_check`, `number_check`, `signature_check` (`varchar`, `CHECK` por vocabulário, sem ENUM),
`number_read varchar(9)` com `CHECK (number_read ~ '^[0-9]{1,9}$')`; `rollback.sql`; `snapshot.json`.
`parseDeliveryProofUpload` aceita os campos opcionais; o caso de uso grava (a substituta sobrescreve);
`QueuedAttachment` e `attachProof` levam os códigos; o painel mostra, coordenado com a 193.

## Contratos/API/eventos

- `GET /me/trips/current` → `data.canhotoOcrEnabled: boolean` (F2). Aditivo.
- `POST /me/trips/current/documents/:documentId/proof` → campos opcionais (F4).
- Nenhum evento novo.

## Dados, migration e rollback

Fases 1–3: sem migration. Fase 4: uma migration aditiva com `rollback.sql`, `make migration-test` e
`db:generate` = `no_changes`, número conferido em `origin/staging`.

## Segurança e tenant

- Interruptor lido pela empresa do contexto; integração prova que A não vê o de B.
- Nada de imagem, grade ou texto OCR na rede ou em log. Na F4, só códigos e dígitos.
- `'wasm-unsafe-eval'`: registro em `docs/SECURITY.md` (data, motivo, forma escolhida pela sonda,
  mitigação).
- A rota `CacheFirst` só casa a própria origem e o prefixo versionado.

## Idempotência e concorrência

- A substituição da foto é uma escrita só no IndexedDB (nova entra, antiga sai); a API faz upsert.
- O resultado do OCR é amarrado à `attachmentKey` e ao prazo de 20 s desde o aceite.
- O worker do Tesseract é singleton por aba; erro ou prazo estourado encerra o worker.

## Observabilidade

Nenhum log nem telemetria do resultado. Tempos, tamanhos, matriz de confusão e o tempo do `prebuild`
vão para o `evidence.md`.

## Estratégia de testes

- **Fixtures sintéticas** (`test/fixtures/canhoto-grid.fixture.ts`): tira clara com barras escuras de
  "texto", quadro do número e célula de assinatura, **com ruído realista** (amplitude > 30), fundo de
  mesa claro nas laterais, sombra num canto; transformações nos dois sentidos (desfoque 7×7, escala,
  compressão de contraste, saturação, recorte do texto nas laterais, papel ocupando 98% do quadro).
- **Contratos do fluxo**: "a foto entra na fila antes da verificação", "cancelar a câmera depois de
  Tirar outra não perde a foto", "atualização do SW pedida durante a checagem espera", "Tirar outra
  substitui numa escrita só", "o handle abre o seletor de forma síncrona".
- **OCR**: listas de palavras; prazo total com relógio falso; descarte por chave trocada.
- **Plataforma**: `dist.contract`, SW, CSP, assets, cópia por valor.
- **API**: contrato + integração (os dois comandos; integração no `scripts["test:integration"]`).
- **Tempo**: Playwright com `Emulation.setCPUThrottlingRate` 6× sobre foto de 12 MP, medido e anotado;
  nenhuma asserção de milissegundos em CI.
- **Smoke**: imagens desenhadas em canvas na página; OCR com recarga + `context.setOffline(true)`.
- **Calibração** (T1.2b) e **validação de campo** (T5.4) com fotos reais.

## Riscos

| Risco                                                       | Mitigação                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Limiares geram aviso demais e o motorista aprende a ignorar | T1.2b antes de publicar (≤ 20% em foto boa); `PROOF_PHOTO_CHECK_ENABLED`; T5.4 |
| Conflito com 192/193/195/196 nos mesmos arquivos            | tabela de coordenação; rebase + install antes de cada gate                     |
| Pré-requisito do `attach` não entrar                        | T1.0 para a fase                                                               |
| `'wasm-unsafe-eval'` amplia a CSP                           | preferência pela CSP só no worker; security-reviewer; `docs/SECURITY.md`       |
| OCR "offline" falso                                         | chunk no precache; smoke com recarga e `setOffline(true)`                      |
| `mismatch` falso por dígito mal lido                        | só aviso; critério go/no-go na T5.4                                            |
| "Tirar outra" piora a pontualidade                          | frase explícita com a parada concluída                                         |
| Assinatura: carimbo conta, leiautes variam                  | só aviso, `inconclusive` fora da tira horizontal                               |
| `prebuild` estoura o teto do smoke (~180 s) ou alonga a CI  | medir na T2.2; `--skip-compression` no `predev`, compressão só no build        |
| Imagem Docker +44 MB                                        | aceito, como no painel                                                         |
