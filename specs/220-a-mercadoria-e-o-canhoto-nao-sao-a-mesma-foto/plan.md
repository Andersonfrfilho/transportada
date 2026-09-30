# Plano técnico

## Contexto e premissas

Tudo que esta spec precisa **já existe em pedaços**, espalhado por três apps. O plano é quase todo
de ligação, e o risco principal não é construir errado — é **construir de novo** o que já foi
decidido. Cinco decisões fechadas que entram como premissa, não como escolha:

| Assunto                            | Decisão fechada                                                                                | Onde                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| Como se faz miniatura              | 320 px, q 0,7, ≤ 60 KB, teto 128 KiB, purpose próprio, **gerada no cliente**, `sharp` recusado | spec 161 D12/D13/D14           |
| Bytes da foto do canhoto           | 2000 px, alvo 900 KiB, teto 960 KiB, redução depois de gravar                                  | spec 212 D1–D5                 |
| `cargo` acumula, canhoto substitui | índice único parcial `where kind <> 'cargo'`                                                   | spec 184 D2                    |
| Exceção vence por inteiro          | geral → contratante → destinatário, nunca campo a campo                                        | spec 218 RF-C3/RF-D1           |
| Nada bloqueia a foto na captura    | única exceção é o gate de campo `required` da 218                                              | ADR-0070, ADR-0079 §A3, 194 D1 |

Premissa de reuso que sustenta a fase mais cara: **o painel já sabe ler canhoto**.
`barcodeDecoder.service.ts` (zxing, Code-128 primeiro, chave de 44 posições com módulo 11),
`canhotoIdentification.service.ts` (cinco classificações), `canhotoOcrEngine.service.ts`
(tesseract com CSP resolvida, worker singleton, 15 s) e `canhotoOcr.service.ts` (número
`000.000.000`, série, confiança 80) estão escritos, testados e em uso no assistente de baixa em
campo. A Fase 6 **move o ponto de chamada**, não a lógica.

## Arquitetura e arquivos afetados

### Banco (`apps/api-transportada/src/database/`)

- `company-delivery-proof-settings.schema.ts` — nas **três** tabelas: coluna `cargo` (modo, CHECK
  pela lista existente, padrão `off`); em `company_delivery_proof_settings` e nas duas de exceção,
  `cargo_minimum_count integer not null default 1` com CHECK `between 1 and 5`.
- `trip.schema.ts` (`tripDeliveryProofs`, ~:1556) — `thumbnail_object_id` nullable; estado de
  conferência `canhoto_review varchar(16) not null default 'not_applicable'` com CHECK;
  `canhoto_review_by_user_id`, `canhoto_review_at`, `canhoto_review_reason varchar(16)`,
  `canhoto_review_note varchar(500)`, `canhoto_read_number varchar(16)`,
  `canhoto_read_source varchar(16)` (`barcode|ocr`).

### API (`apps/api-transportada/src/trips/`)

- `presentation/delivery-proof-settings.schema.ts` — `cargo` e `cargoMinimumCount`, ambos
  `.optional()` (precedente 193 D6), dentro dos três schemas; validação do mínimo contra o teto.
- `application/attach-delivery-proof.use-case.ts:323` — o portão de `classifyUploadPunctuality`
  passa a aceitar `cargo`, guiado por `settings.cargo`; `office` continua `not_required`.
- `application/read-delivery-proof.use-case.ts` — `thumbnailUrl` presigned ao lado de
  `downloadUrl`; os campos de conferência na resposta.
- Caso de uso novo: aprovar/recusar canhoto (`trip.manage`, trilha de auditoria); rota
  `PATCH /trips/:id/documents/:documentId/proof/review`.
- `domain/` — a guarda de PII do motivo **reusa** a função da spec 162 (`purge-illegible`), não
  escreve outra.

### Painel (`apps/frontend-transportada/src/modules/trip/`)

- `shared/deliveryProofSettings.service.ts:57` — a cascata ganha `cargo` e o mínimo.
- Tela de configuração — dois campos de foto com texto de apoio; `canhotoOcrEnabled` amarrado ao
  do canhoto.
- `components/TripDeliveryProof.component.tsx` — o trabalho da Fase 4 e 5 mora aqui:
  `ProofImage` (:135) vira miniatura clicável; "quem recebeu", hora, distância e selos.
- Componente novo `ProofGalleryDialog` — molde do `ProofImageLightbox` do app do motorista (foco
  preso, Esc, `popstate` do Android) **mais** próximo/anterior, sobre `useModalDialog` do painel.
- `shared/canhotoReview.service.ts` (novo) — orquestra barcode → OCR sobre a imagem baixada e
  devolve o veredito. Chama os serviços existentes; não os reimplementa.
- `locales/trip.locale.json` — rótulos novos; a chave órfã `deliveryProof.open` (:466) ganha
  consumidor.

### App do motorista (`apps/frontend-driver/src/modules/driver-trip/`)

- `shared/proofFormPlan.service.ts:49,94` — `rendersCargo`, contagem e pendência por mínimo.
- Geração da miniatura antes de enfileirar, reusando o `canvas` de `occurrencePhotoImage.service.ts`
  (que já faz decode/encode JPEG); `thumbnail` vai como campo **opcional** do form, como na 161.
- `components/DriverStopCard.component.tsx` — o campo da foto da mercadoria e a pendência de
  recaptura de canhoto recusado.

## Contratos/API/eventos

```
GET  /trips/field-delivery-settings          + cargo, cargoMinimumCount
PUT  /company-settings/delivery-proof        + cargo, cargoMinimumCount (opcionais)
GET  /trips/:id/documents/:documentId/proof  + thumbnailUrl?, canhotoReview, canhotoReadNumber?
POST .../proof            (multipart)        + thumbnail (opcional, nunca condição)
PATCH .../proof/review                       { action: 'approve' | 'reject', reason?, note? }
```

Códigos de erro estáveis novos: `DELIVERY_PROOF_MINIMUM_ABOVE_LIMIT`,
`DELIVERY_PROOF_REVIEW_REASON_REQUIRED`, `DELIVERY_PROOF_REVIEW_NOTE_HAS_PERSONAL_DATA`,
`DELIVERY_PROOF_REVIEW_NOT_APPLICABLE` (tentativa de conferir assinatura ou foto da mercadoria).

Envelope e status seguem `apis.md`: 200 com `{data}`, 400 de validação com todos os erros de uma
vez, 403 sem `trip.manage`, 409 em conferência já resolvida.

## Dados, migration e rollback

Aditiva, em um arquivo por fase — nenhuma coluna existente muda de tipo, nenhum `NOT NULL`
retroativo sem padrão. `cargo` nasce `off` e `canhoto_review` nasce `not_applicable`, de forma que
**a migration sozinha não muda comportamento nenhum**.

O único preenchimento retroativo é o canhoto existente virar `pending` — `UPDATE ... WHERE kind =
'photo'`, idempotente, no mesmo arquivo. Se isso produzir uma fila grande de pendências numa
instalação antiga, a alternativa é deixar tudo `not_applicable` e só marcar `pending` a partir da
data de corte; **decidir com o usuário na T6.1, com a contagem real em mãos**.

Rollback: `DROP COLUMN` de cada coluna nova, na ordem inversa. O objeto da miniatura no bucket não
é apagado pelo rollback — ele é órfão inofensivo, e a retenção de 5 anos já o alcança (161 RF3).

`make migration-test` fecha cada fase que toca o banco.

## Segurança e tenant

- `companyId` vem do contexto autenticado em toda leitura e escrita, nunca do payload.
- Aprovação e recusa exigem `trip.manage` e **verificação por objeto**: o comprovante pertence à
  empresa do token (BOLA/API1), não basta a rota estar protegida.
- O motivo livre da recusa passa pela guarda de PII da spec 162 antes de qualquer gravação.
- Nenhuma coordenada em query string (regra de privacidade); a distância é calculada no servidor ou
  derivada no cliente a partir de dados que ele já tem, e só o texto vai à tela.
- `receivedBy` continua fora de log, trilha, notificação e linha do tempo (spec 193 D10).
- Miniatura em purpose próprio, bucket privado, presigned de 5 min; `bucket`/`objectKey` nunca no
  corpo da resposta.
- Nada de OCR, grade, confiança ou imagem saindo do navegador para a API (RNF03).

## Idempotência e concorrência

- `PATCH .../proof/review` é idempotente por natureza (PUT-like sobre um estado): reenviar a mesma
  aprovação responde 200 sem nova trilha; aprovar o que já foi recusado (ou vice-versa) é 409, e a
  pessoa decide.
- O canhoto recapturado **substitui** pelo índice único existente; o `ON CONFLICT` atual já trata
  isso e precisa zerar o estado de conferência junto — senão o canhoto novo herda o "recusado" do
  velho. **É a armadilha número um desta spec.**
- A leitura no painel é assíncrona e pode voltar depois de a pessoa ter aprovado à mão: o resultado
  automático **nunca sobrescreve** decisão humana.
- A miniatura é anexo opcional do mesmo upload; se ela falhar, o original já entrou — não há meia
  gravação.

## Observabilidade

Máscara de log do §11 do code-standart. Eventos: `delivery_proof.thumbnail_missing` (contagem, para
medir se a geração no cliente está falhando em algum aparelho), `delivery_proof.review_approved` /
`review_rejected` (com o motivo enumerado, **sem** o texto livre), `delivery_proof.read_timeout`.
Nenhum evento carrega nome, documento, coordenada ou `receivedBy`.

## Estratégia de testes

Aceite/contrato **antes** da implementação, em toda task.

- **API contrato** (`bun --env-file=../../.env.test test --timeout 120000`) — modos, cascata,
  mínimo, pontualidade de `cargo`, veredito, guarda de PII, permissão.
- **API integração** (`bun --env-file=../../.env.test run test:integration`) — migration, o
  `ON CONFLICT` que zera a conferência na recaptura, e a URL assinada da miniatura. ⚠️ São **dois
  comandos e nenhum cobre o outro**; task que toca `test/integration/**` só fecha com o segundo.
- **Painel** — contratos sem DOM para os serviços puros (cascata, orquestração da leitura, ordem da
  galeria); o que só se prova montado vai para `test/trip-hooks/*.contract.ts` e `bun run
test:hooks`.
- **App do motorista** — `proofFormPlan` e a geração da miniatura.
- ⚠️ **Arquivo de teste novo entra na lista explícita do `package.json` da app**, senão não roda.
- `make migration-test` nas fases de banco; `make check` fecha cada fase.

## Riscos

| Risco                                                                  | Mitigação                                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Recaptura herda o "recusado" do canhoto anterior**                   | Teste de integração sobre o `ON CONFLICT` é a primeira task da Fase 6                     |
| Preencher `pending` retroativo cria fila enorme numa instalação antiga | Contar antes (T6.1) e decidir com o usuário; data de corte é o plano B                    |
| Miniatura gerada em três lugares diverge                               | Uma função só, e ela sai do molde da 161 — contrato mede bytes e lado, não "parece certo" |
| A leitura no painel trava a tela                                       | Fora do caminho de render, prazo de 20 s, veredito chega depois (RNF02)                   |
| Selo de pontualidade vira portão por engano                            | CA13 mede explicitamente que entrega, viagem, CT-e e fatura não param                     |
| `cargo` obrigatório quebra instalação existente                        | Padrão `off` — a migration sozinha não muda comportamento                                 |
| Escopo grande demais para uma leva                                     | Seis fases independentes; 1, 2 e 3 já entregam valor sem as outras                        |
