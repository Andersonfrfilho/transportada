# Evidência — Feature 344

## T0 — medição do OCR nas fotos reais (22/11/2026)

Executada pelo Anderson na máquina dele com `tmp/ops/344-t0-mede-leitura.sh` (script fora do repositório; fotos e saída em `tmp/ops/saidas/`, dados de cliente, não commitados). Motor: o mesmo `loadOcrEngine`/`readOcrLines` do `canhoto-ocr` do worker (PP-OCRv4, `onnxruntime-web`), modelos conferidos por SHA-256. Extração do Nº/Série: protótipo ancorado por rótulo ("NF-e", "Nº", "SÉRIE"), sem texto solto. Cada foto foi lida em 4 rotações (0°, 90°, 180°, 270°).

| Foto (nome do arquivo = nota a que foi anexada) | Nº lido | Série | Confere com a nota?                               | Tempo por leitura |
| ----------------------------------------------- | ------- | ----- | ------------------------------------------------- | ----------------- |
| 1 — nota 931988 (o caso real)                   | 172195  | 1     | **não: é da NF 172195 série 1** (confirma o caso) | 1,3–1,5 s         |
| 2 — nota 932062                                 | 932062  | —     | sim                                               | 1,2–1,6 s         |
| 3 — nota 932066                                 | —       | —     | sem número ancorado (nenhum alerta)               | 2,6–3,0 s         |
| 4 — nota 932085                                 | 932085  | —     | sim                                               | 2,1–2,8 s         |

**Resultado do portão (Q1): 3 de 4 fotos com Nº ancorado e correto — passa (mínimo combinado: 3 de 4).** A foto do caso real é lida como a NF 172195 série 1, exatamente o alerta que a spec quer. A foto 3 não ancorou número: pela D3 não gera alerta (sem falso alarme), a tentativa seria carimbada.

Achados que ajustam a spec:

1. **As 4 rotações não mudaram nenhum resultado**: o motor já endireita (orientação por caixas, inclinação, 180° por confiança). A D2 passa a **uma** passada por foto, com rotações só como reserva se a primeira não ancora **[ajuste aplicado]**. Isso corta o custo à metade ou menos.
2. **Tempo**: 1,2–3,0 s por foto, bem abaixo dos ~30 s estimados; lote de 5 por ciclo fica em ~15 s no pior caso.
3. **Memória**: pico de RSS **577 MB** num processo com o motor e uma foto por vez (o bot mede ~740 MB com a thread permanente). A Q5 segue para a medição em staging (T6), agora com ponto de partida.
4. **Série** só foi lida em 1 das 3 fotos lidas; o alerta por número não depende dela (D4), e série ausente continua válida ("série não lida").
5. Ainda a conferir na T0 restante (leitura de código, não de fotos): onde a série mora em `nfe_documents`, o que a rota do robô aceita e os pontos de paridade. Ficam como primeiro passo da T1/T2 (contrato primeiro).

Limite honesto: n = 4 fotos. A medição prova que a abordagem é viável, não a taxa de produção; a taxa real vem da T6 em staging sobre as ~470 provas pendentes.

## T1 — `extractCanhotoIdentity` (22/11/2026)

Política de domínio pura no worker: `apps/worker-transportada/src/canhoto-read/domain/canhoto-identity.policy.ts` (tipo em `canhoto-identity.types.ts`, limites em `canhoto-identity.constant.ts`). Contrato primeiro: `test/canhoto-read/canhoto-identity.contract.ts`, ligado em `test/canhoto-read.contract.test.ts` (já na lista do `package.json`).

Régua implementada (D3):

- Número só com rótulo. "NF-e"/"NOTA FISCAL" é âncora forte; "Nº" solto é fraca (no DANFE inteiro pode ser o número da rua). Havendo forte, só a forte decide; dois números diferentes no mesmo nível ⇒ nada.
- "Nº" logo depois de rótulo de outro documento (pedido, ordem de compra, CT-e, fatura, CEP, CNPJ...) não conta.
- Número exato: 3 a 9 dígitos impressos (`nNF` tem no máximo 9), aceita `000.172.195`, `000,172,195` e `000172195`, sem zeros à esquerda na saída; nenhuma distância de edição no número. Rótulos tolerados: `Nº`, `N°`, `No`, `N.º`, `Nro`, `Num`, `Número`, `N`.
- Série: rótulo "SÉRIE" com até 1 erro (`SER1E`, `5ÉRIE`, `SERE`), 1 a 3 dígitos, `000` vira `0`. Duas séries diferentes ⇒ série `null`, o número fica. Série sem número ⇒ nada.
- Saída `{ number, series }` congelada, só dígitos; o texto reconhecido nunca sai da função.

CA02, linhas sintéticas (nenhuma foto de cliente no repositório): `bun test ./test/canhoto-read/canhoto-identity.contract.ts` → **42 pass, 0 fail** (Bun 1.4.4 no contêiner da sessão). Casos: rótulos em várias ordens e linhas, ruído de OCR do rótulo, número colado à série, sem âncora, número curto/zerado/longo, dois rótulos (pedido, CT-e, fatura, rua), ambiguidade, e o resultado nunca contém texto. `bun run typecheck` e `eslint` da app limpos.

Observação: na mesma sessão, 5 testes **já existentes** de `canhoto-read` que sobem `worker_thread` (decodificador de código de barras) falham com "thread exited with 13" também em `origin/staging` sem esta mudança: é o Bun 1.4.4 do contêiner, não o Bun 1.3.14 do projeto. A CI é a prova.

## T2 — rota do robô aceita `ocr` e a fila do OCR ganha carimbo próprio (22/11/2026)

Contrato primeiro: os casos CA01 entraram vermelhos (3 falhas na rota: `readDocumentId` com `ocr`, `ocr` sem número, `ocr` sem número nem série passavam com 200) e só depois o código.

**Rota do robô** (`PATCH /trips/:id/documents/:documentId/proof/review/automatic`, `canhoto-review.routes.ts`): o corpo virou a união de duas formas `.strict()`. A do código de barras (ou leitura vazia) não mudou. A do OCR é `{ readSource: 'ocr', readNumber: string (1–9), readSeries: string (1–3) | null, readDocumentId: null }`: número obrigatório e `readDocumentId` proibido (qualquer uuid é 400; a chave continua obrigatória e `null`, para o worker mandar o mesmo formato de corpo das duas passadas). A permissão (`trip.canhoto-auto-review`) não mudou; a rota de gente não mudou. `resolveAutomaticVerdict` **não foi tocado**: o contrato prende que `ocr` ⇒ `pending`, sem origem nem instante, e que sobre veredito humano é `unchanged`. A trilha `trip.canhoto-review.automatic` é a mesma do código de barras (ator do serviço, sem número, série nem origem).

**Migration** `20261122182415_trip_canhoto_ocr_attempt` (aditiva): `trip_delivery_proofs.canhoto_ocr_attempted_at` (anulável, sem default, sem backfill) e o índice parcial `trip_delivery_proofs_canhoto_ocr_pending_idx (created_at) WHERE canhoto_review = 'pending' and canhoto_read_source is null and canhoto_ocr_attempted_at is null` (literais, sem `kind`, sem `canhoto_read_attempted_at`: as ~470 provas já carimbadas pelo código de barras entram na fila). `rollback.sql` tira índice e coluna e confere o journal. A recaptura zera o carimbo novo (`buildCanhotoReviewReset`, contrato que exige toda coluna `canhoto*` no zeramento). **Para a T4:** a consulta da fila do worker precisa repetir esses literais, e o espelho do schema do worker (`delivery-proof-processing.schema.ts`) ainda não tem a coluna.

| Prova                                                       | Comando                                                                                                                | Resultado                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Contratos da conferência (rota, decisão, caso de uso, CA01) | `bun --env-file=../../.env.test test ./test/canhoto-review.contract.test.ts`                                           | 128 pass, 0 fail            |
| Suíte de contrato da API inteira                            | `bun run test` (api)                                                                                                   | 15732 pass, 35 skip, 0 fail |
| Migration + rollback + plano do índice contra Postgres 16   | `bun run db:test` (= `make migration-test`)                                                                            | 296 pass, 0 fail            |
| Integração do canhoto contra Postgres (2 casos OCR novos)   | `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivery-proof-canhoto-review.integration.ts` | 15 pass, 0 fail             |
| Lint, typecheck, prettier                                   | `bun run lint`, `bun run typecheck` (api), `bunx prettier --check .` (raiz)                                            | limpos                      |

## T3 — `canhotoMismatch` derivado no comprovante (22/11/2026)

Duas partes, em dois PRs, na ordem da ADR-0081 §9: o painel tolerante primeiro (PR #947), depois a API.

**Contrato (RF5).** `GET /trips/:id/documents/:documentId/proof` e `GET /trips/:id/delivery-proofs` levam, só na prova `pending` com leitura que diverge da própria nota:

```ts
canhotoMismatch?: {
  kind: 'other_document' | 'other_series'
  readNumber: string // normalizado, sem zero à esquerda
  readSeries: string | null
  matchedDocument: null | {
    nfeDocumentId: string
    number: string
    series: string
    status: 'authorized' | 'cancelled' | 'denied' | 'unsigned'
    sameTrip: boolean
    tripId: string | null // vínculo vivo da NF X (o desta viagem, se houver)
    tripDocumentId: string | null // alvo do "Mover para a NF X" (T5b)
    canhotoApproved: boolean // Q4 (aprovada pelo Anderson): a NF X já tem canhoto aprovado
  }
}
```

Ausente (nunca `null`) quando não há alerta. Nada é gravado: o alerta é derivado na leitura (`canhoto-mismatch.query.ts` + `canhoto-mismatch.policy.ts`).

**Decisões tomadas na implementação.**

- Compara por número **exato** sem zero à esquerda ("000172195" = 172195); a série só alerta quando lida e diferente (`other_series`).
- Vale para qualquer origem da leitura (`ocr` ou `barcode`): o alerta diz "o número lido não é o desta nota", o que é verdade nas duas.
- **Qual NF X citar**: o número de NF-e se repete entre emitentes, então a ordem é mesma viagem → mesmo emitente da nota da prova (posições 7–20 da chave de acesso) → candidata única. Empate que sobra é `matchedDocument: null` ("parece ser de outra nota", com o número lido): citar a nota errada custa mais do que não citar.
- Busca sempre pelo `companyId` da prova, nas três tabelas da subconsulta de duplicidade também.
- Custo: +0 consultas quando nenhuma prova da leitura diverge; +1 (todas as provas juntas) quando alguma diverge. A busca por `ltrim(number,'0')` não tem índice próprio; só roda com divergência. Medir em staging (T6) antes de propor índice.

**Testes.**

- Contrato API `test/trip-delivery-proof/canhoto-mismatch.contract.ts`: os cinco casos da D4 (CA04), a escolha da nota (mesma viagem, emitente, única, empate, série, duplicidade) e a publicação (só pendente, ausente nunca `null`). `bun test` da API: 15733 pass, 0 fail (35 skip, os de Postgres).
- Integração `test/integration/canhoto-mismatch.integration.ts` contra Postgres 16 local (7 casos, 7 pass): o caso 931988/172195 na mesma viagem, NF de outra empresa nunca citada, mesma viagem vence outra viagem, citação fora da viagem com o vínculo vivo, duplicidade (Q4), sem alerta quando confere/sem leitura/aprovada, e `other_series`. **Mutação medida**: sem `eq(nfeDocuments.companyId, ...)` o caso de outra empresa reprova. Vizinhos re-rodados no mesmo banco: `delivery-proofs-by-trip`, `driver-delivery-proof-read`, `delivery-proof-canhoto-review`, `trip-proof-pdf-end-to-end` (33 pass no total).
- Isolamento por texto: `test/trip-schema/tenant-safety.contract.ts` § "canhoto mismatch query tenant safety".
- `test/canhoto-review/no-gate.contract.ts`: `canhoto-mismatch.query.ts` entra na lista de quem lê o veredito, só para **mostrar** a duplicidade (nada é barrado).
- Painel: `test/trip/delivery-proof-canhoto-mismatch.contract.ts` (guarda tolerante nas duas leituras, malformado sai sozinho, paridade de tipos e chaves com a política da API). `bun run test` do painel: 8987 + 1497 pass, 0 fail.

⚠️ **Publicação em produção (T7):** a promoção `staging → main` leva painel e API no mesmo run, e o `deploy.yml` sobe a API antes do painel. Na janela, o painel antigo descartaria só o comprovante pendente com alerta. Para não ter janela, o painel vai num PR à frente, ou a janela é aceita.
