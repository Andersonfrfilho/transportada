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
