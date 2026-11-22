# Feature 344 — Alerta de canhoto de outra nota (rascunho para aprovação)

> Pedido do Anderson em 22/11/2026: quando a foto anexada como canhoto de uma nota é, na verdade, o canhoto de **outra** nota, o sistema alerta o escritório. A leitura é do "Nº / Série" impresso no canhoto. **O OCR só sugere: nunca aprova, nunca recusa** (ADR-0092 §5, spec 220 RF26).
> Caso real: a foto anexada à NF 931988 é o canhoto da NF 172195, série 1.

## Estado de hoje (lido em `origin/staging`, f542017a)

- **O leitor da rotina é só Code128 da chave NF-e.** `trip.canhoto.read` (`apps/worker-transportada/src/canhoto-read/*`, ADR-0092) decodifica o código de barras em `worker_thread`. Medido por outra investigação: leu **0 de ~470** provas em 21 dias; 4 fotos reais testadas em 4 rotações, nenhuma lida — o canhoto é uma tira destacada e o código de barras vem cortado. Resultado: tudo fica `pending`, com `canhoto_read_attempted_at` carimbado e `canhoto_read_source` nulo, sem ninguém para avisar que a foto é de outra nota.
- **O OCR local já existe, mas só no bot.** `apps/worker-transportada/src/canhoto-ocr/*` (PP-OCRv4 em `onnxruntime-web`, spec 294 T4.8, ADR-0113 §5): casa o texto com as **notas abertas de quem mandou a foto** e devolve só veredito (o texto nunca sai da thread). Procura números **conhecidos** (`evaluateCanhotoText`), não lê "o número que está impresso". `CANHOTO_OCR_ENABLED` vem **desligado em produção** (pico de ~740 MB no worker, a medir em staging).
- **O painel já tem uma leitura OCR experimental no navegador** (spec 220, `readSource = 'ocr'`, selo "Experimental", `pendingOcr`), que só roda quando alguém abre o comprovante. Não alerta divergência.
- **O servidor já é quem decide.** `resolveAutomaticCanhotoReview` (`trips/domain/canhoto-review-decision.policy.ts`): `readSource ≠ 'barcode'` → `pending`; nunca `rejected`; sobre veredito humano → `unchanged`. A rota do robô (`PATCH /trips/:id/documents/:documentId/proof/review/automatic`, permissão `trip.canhoto-auto-review`) tem `.strict()` e hoje só admite o que o worker reporta (barcode).
- **Nº e Série já têm coluna**: `canhoto_read_number`, `canhoto_read_series`, `canhoto_read_source` (CHECKs: número e origem andam juntos; série pede número). `nfe_documents.number` existe; a série **[NEEDS CLARIFICATION: T0 confirma se `nfe_documents` guarda a série como coluna própria]**.

## Problema e resultado

Hoje um canhoto trocado só é descoberto por quem abre a foto e confere o número de olho — o que, com ~470 provas pendentes e leitura zerada, nunca acontece em escala. **Resultado:** a rotina lê o Nº/Série impresso; se o número lido **não é o da nota** a que a foto foi anexada, a prova é marcada **"parece ser da NF X"** (ou "parece ser de outra nota", se X não estiver no sistema), a tela mostra o alerta e o maço de aprovação não deixa aprovar essa prova sem uma confirmação deliberada. A decisão continua sendo de gente.

## Fora do escopo

- Aprovar, recusar ou mover a foto para a outra nota sozinho (nada de "corrigir" o vínculo): só alerta. Mover a foto de nota é outra spec.
- Mudar a leitura por código de barras, a política de veredito ou a rota de gente.
- Mensagem automática ao motorista, ao cliente ou à contratante sobre o alerta **[NEEDS CLARIFICATION: Q3]**.
- Ler outros campos do canhoto (data, assinatura, nome de quem recebeu).
- Ligar `CANHOTO_OCR_ENABLED` do **bot** em produção: o OCR desta spec tem flag própria (D6).

## Decisões propostas

- **D1 — OCR só sugere.** O veredito da prova continua `pending`; `resolveAutomaticVerdict` já devolve `pending` para `readSource = 'ocr'`, e esta spec **não toca esse arquivo**, só ganha contrato que prende isso (CA01). Sem origem e sem instante de revisão, como a CHECK exige. Prova já `approved` ou com veredito humano não é relida nem alterada.
- **D2 — Segunda passada da mesma rotina, não rotina nova.** Dentro de `trip.canhoto.read`: código de barras primeiro (não muda); se não leu código, **OCR do Nº/Série**. O worker reaproveita o motor PP-OCRv4 de `canhoto-ocr` (decisão do dono de 05/11: sem modelo pago, só local). Quatro rotações no máximo, parando na primeira que lê um "Nº" ancorado (a tira rasgada é a razão de o código de barras falhar; a rotação é a razão de o OCR de foto de celular falhar).
- **D3 — Ler "o que está impresso", não "casar com o que já conheço".** Nova política de domínio `extractCanhotoIdentity(lines)`: acha o número e a série pelos rótulos do canhoto ("Nº", "NF-e", "SÉRIE"), tolerando o ruído que o `canhoto-ocr` já tolera (`normalizeOcrText`, distância 1). Devolve `{ number, series | null }` ou **nada** — número solto sem rótulo ("17234" no meio do texto) não vale: sem âncora, não alerta (falso alerta custa mais confiança do que um alerta perdido). O texto reconhecido **nunca** sai da thread (ADR-0113 §5.3); só `number`/`series`.
- **D4 — O que é "outra nota".** Com `expected` = número/série da NF a que a prova está anexada:
  | Leitura | Marca |
  | --- | --- |
  | número lido = esperado, série lida = esperada ou ausente | nenhuma (confere; segue `pending` normal) |
  | número lido ≠ esperado | **outra nota**; se existir nota da **mesma empresa** com esse número (e série, se lida), "parece ser da NF X" (a da mesma viagem é preferida e citada como tal) |
  | número igual, série lida ≠ esperada | outra nota (mesmo número, série diferente é outra nota fiscal) |
  | nada ancorado | sem leitura: o comportamento de hoje (`pending`, sem alerta) |
  O alerta é **derivado** (`readNumber/readSeries` ≠ os da nota), não uma coluna: não há segundo estado para divergir do primeiro. A busca da nota X é sempre **por `companyId` da prova** (nunca do payload) e por consulta no servidor, na leitura da prova; não grava `read_document_id` para OCR.
- **D5 — O número lido passa pela mesma rota do robô**, com `readSource: 'ocr'`, e a rota continua sem `action` (`.strict()`). A permissão `trip.canhoto-auto-review` não muda; muda o que ela aceita: `readSource: 'ocr'` com `readNumber` obrigatório e `readDocumentId` **proibido**. Trilha por prova (`trip.canhoto-review.automatic`, ADR-0092 §7) vale também para a leitura OCR, **sem número de nota na trilha** (sem PII). Contrato de que o robô com `ocr` **jamais** chega a `approved`.
- **D6 — Flag e orçamento próprios.** `CANHOTO_NUMBER_OCR_ENABLED` (padrão desligado, `.env.example`, schema de env, `docs/spec/railway.md` se for variável de serviço). Lote pequeno por ciclo (a medir; ponto de partida **5 provas/ciclo**, estimado de ~30 s cada), teto de bytes e pixels do `canhoto-ocr` (12 MB / 40 MP) e o mesmo prazo/fila (`busy` não carimba tentativa). Memória do worker medida em staging **antes** de ligar em produção (T6).
- **D7 — Coluna de tentativa própria.** `canhoto_ocr_attempted_at` (migration + rollback + índice parcial). Não reaproveita `canhoto_read_attempted_at`: as ~470 provas já carimbadas pela passada de código de barras **não** seriam lidas por OCR nunca. Fila do OCR: `canhoto_review = 'pending' AND canhoto_read_source IS NULL AND canhoto_ocr_attempted_at IS NULL`, excluindo viagem cancelada e nota liberada (mesmos cortes da §5 da ADR-0092). Carimba quando a leitura **terminou** sem Nº ancorado; falha de infraestrutura (objeto ausente, teto, timeout, `busy`, API fora) não carimba. Recaptura (RF30 da 220) cria prova nova, coluna nula.
- **D8 — O que o escritório vê.**
  1. **Comprovante (painel):** faixa de alerta no estado `pending`: "Parece ser da NF 172195 (série 1)" / "Parece ser de outra nota (lida: 172195 série 1)", com o selo "Experimental" que o OCR já tem e link para a outra nota quando ela existe. Componentes e tokens do design system, igual a `pendingOcr`.
  2. **Maço de aprovação (`TripCanhotoBatchDialog`):** prova sinalizada **não entra** em "aprovar todas"; aprovar exige clique deliberado na própria prova, com o alerta à vista ("Aprovar mesmo assim"). Nada de bloquear a entrega, a viagem ou a baixa (RF30 da 220: conferência, não portão).
  3. **Aba/contagem de pendências de canhoto** ganha o filtro "parece de outra nota" **[NEEDS CLARIFICATION: Q2 — filtro só no maço ou também na lista de pendências?]**.
     Sem texto livre, sem foto reescrita; textos em pt-BR/en nos `.locale.json`, paridade nas três apps que mostram o estado do canhoto (painel, app do motorista **só leitura se mostrar**, portal do contratante **não mostra**) com contrato de paridade.

## Histórias priorizadas

### P1 — O escritório vê que a foto é de outra nota

**Given** a prova da NF 931988 com a foto do canhoto da NF 172195 série 1, **When** a rotina lê o Nº/Série por OCR, **Then** a prova segue `pending`, grava `readSource = 'ocr'`, número 172195 e série 1, e o painel mostra "Parece ser da NF 172195 (série 1)".

### P1 — Máquina nunca decide

**Given** qualquer leitura OCR (confere, diverge ou não lê), **When** a API a recebe do robô, **Then** o veredito nunca é `approved` nem `rejected`, e veredito humano anterior fica intacto (`unchanged`).

### P2 — O maço não aprova às cegas o que está sinalizado

**Given** um maço com uma prova sinalizada, **When** a pessoa usa "aprovar todas", **Then** a sinalizada fica de fora e é aprovada só por clique próprio, com o alerta na tela.

### P2 — Canhoto que não deu para ler não vira alarme

**Given** foto sem Nº ancorado (tira rasgada, foto escura), **When** o OCR termina sem leitura, **Then** não há alerta, a tentativa é carimbada e a prova não volta à fila.

### P3 — Passado entra sem trabalho manual

**Given** as ~470 provas já pendentes com `canhoto_read_attempted_at`, **When** a flag é ligada, **Then** a fila do OCR as lê aos poucos (lote por ciclo), sem script de backfill.

## Requisitos funcionais

- **RF1** — Política `extractCanhotoIdentity` (worker, domínio puro): número e série por rótulo; devolve nada sem âncora; ignora zeros à esquerda; nunca devolve o texto.
- **RF2** — Segunda passada OCR em `trip.canhoto.read`, atrás de `CANHOTO_NUMBER_OCR_ENABLED`, só para prova sem código de barras lido, com o motor de `canhoto-ocr`, até quatro rotações, lote e orçamento próprios.
- **RF3** — Rota do robô aceita `readSource: 'ocr'` (número obrigatório, série opcional, `readDocumentId` proibido); `resolveAutomaticVerdict` fica intacto; teste de contrato de que `ocr` ⇒ `pending`, e de que sobre veredito humano é `unchanged`.
- **RF4** — Migration `canhoto_ocr_attempted_at` + índice parcial da fila OCR + rollback (`make migration-test`), e atualização do contrato `canhoto-read-queue.assertion.ts`.
- **RF5** — A API deriva e devolve no detalhe da prova `canhotoMismatch`: `{ kind: 'other_document' | 'other_series', readNumber, readSeries | null, matchedDocument | null }`; `matchedDocument` só da **mesma empresa** (preferindo a mesma viagem). Prova `approved`, `rejected` ou sem leitura → ausente.
- **RF6** — Painel: faixa de alerta no comprovante e no maço; "aprovar todas" exclui as sinalizadas; aprovação individual com o alerta à vista. Só componentes padrão do design system.
- **RF7** — Trilha `trip.canhoto-review.automatic` por prova também para a leitura OCR (ator = serviço, sem número de nota, sem texto lido).
- **RF8** — Observabilidade: contadores do ciclo (`ocrRead`, `ocrNoAnchor`, `ocrMismatch`, `ocrBusy`) no resultado do job; nunca o texto.
- **RF9** — Documentação: ADR novo (revisa o §3 da ADR-0092 "OCR fica no navegador" — a regra de que OCR não aprova **permanece**; muda só quem lê), `apps/worker-transportada/CLAUDE.md`, `apps/api-transportada/CLAUDE.md`, runbook de produção (flag, medição de memória, como desligar).

## Requisitos não funcionais

- Texto reconhecido não é logado nem persistido (nem em Sentry); só número e série. Dado de cliente (as fotos de teste) **não** entra no repositório; fixtures de teste são sintéticas.
- Worker: teto de memória medido (D6); `busy` e timeout nunca derrubam o ciclo; o ciclo termina sempre `succeeded` (ADR-0092 §6).
- Isolamento por `companyId` da prova em toda consulta (leitura da fila, busca da nota X, exibição).
- Sem `float` para nada financeiro (não se aplica); `exactOptionalPropertyTypes`, imports `.js`, testes com lista explícita no `package.json`.

## Casos extremos e falhas

| Caso                                                           | Comportamento                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Foto só da DANFE inteira (não é tira)                          | lê o Nº ancorado da DANFE; confere ou diverge como qualquer outro                                                                  |
| Foto de canhoto com **dois** números ancorados (Nº e "Pedido") | só o rótulo "Nº"/"NF-e" vale; ambíguo ⇒ nada ancorado, sem alerta                                                                  |
| Série não lida, número ≠ esperado                              | alerta por número; "(série não lida)"                                                                                              |
| Número lido é de nota **cancelada** ou de outra empresa        | citada só se da mesma empresa; cancelada é citada com o estado                                                                     |
| NF X da mesma viagem **já tem** canhoto aprovado               | alerta mostra a duplicidade ("NF 172195 já tem canhoto") — **[NEEDS CLARIFICATION: Q4]**                                           |
| Prova recapturada depois do alerta                             | nova prova, fila nova, alerta antigo some com a prova antiga                                                                       |
| OCR lê "1721 95" por ruído (um dígito errado)                  | distância 1 **não** vale aqui: leitura aproximada de número livre geraria alerta falso; só leitura exata do número ancorado alerta |
| Pessoa aprova a prova sinalizada                               | veredito humano grava como hoje; o alerta some (prova deixa de ser `pending`)                                                      |
| Flag desligada                                                 | nenhum OCR roda; a rotina é idêntica à de hoje                                                                                     |
| Worker sem memória / motor indisponível                        | `busy`/falha de infra: não carimba, tenta no ciclo seguinte; Sentry só em 401/403/400 como hoje                                    |

## Critérios de aceite

- **CA01** — Contrato (API): leitura `ocr` do robô nunca produz `approved`/`rejected`; com veredito humano ⇒ `unchanged`; `.strict()` continua recusando `action`; `readDocumentId` com `ocr` ⇒ 400.
- **CA02** — Contrato (worker): `extractCanhotoIdentity` sobre linhas sintéticas de canhoto (Nº/Série em várias ordens, ruído, dois rótulos, sem rótulo) ⇒ número/série ou nada, e **nunca** o texto.
- **CA03** — Integração (worker): prova da NF A com canhoto sintético da NF B ⇒ `pending`, leitura B gravada, tentativa OCR carimbada; canhoto sem número ⇒ tentativa carimbada, sem alerta; falha de infra ⇒ não carimba.
- **CA04** — Detalhe da prova devolve `canhotoMismatch` correto para os cinco casos da D4, sempre dentro da empresa.
- **CA05** — Painel: alerta no comprovante e no maço; "aprovar todas" não inclui a sinalizada; tema claro/escuro e desktop/celular conferidos contra outra tela; aprovado pelo revisor independente.
- **CA06** — Staging: as 4 fotos reais de teste (que ficam na máquina do Anderson) e o caso da NF 931988/172195 reproduzidos, com taxa de leitura medida e memória do worker registradas em `evidence.md`; **só então** a flag é proposta para produção.

## Dúvidas

- **Q1 [NEEDS CLARIFICATION]** — O OCR lê bem a tira? O spike da 294 foi sobre canhoto **inteiro** e casamento com número conhecido; ler o número livre da tira rasgada em 4 rotações **não foi medido**. T0 mede nas 4 fotos reais e o resultado pode derrubar a abordagem (plano B: pedir o recorte/foto melhor ao motorista pelo bot, fora desta spec). **Recomendo aprovar a spec já com a T0 como portão**: se a leitura for menor que o mínimo combinado (proposta: ≥ 3 das 4 fotos com Nº correto), paro e volto com o relato antes de gastar T1–T5.
- **Q2 [NEEDS CLARIFICATION]** — Filtro "parece de outra nota" também na lista de pendências de canhoto, ou só no maço e no comprovante (recomendo: só nos dois primeiros; o filtro vem depois se houver uso).
- **Q3 [NEEDS CLARIFICATION]** — Avisar o motorista pelo bot ("essa foto parece da NF X") ou só o escritório? Recomendo **só o escritório** nesta spec (o bot pergunta ao motorista só quando a foto chega na hora, e isso é a RF23 da 294).
- **Q4 [NEEDS CLARIFICATION]** — Se a NF X (a de que o canhoto parece ser) já tem canhoto aprovado, mostrar "duplicidade" no alerta? Recomendo sim, é consulta barata e responde "e agora, onde está a foto da NF 931988?".
- **Q5 [NEEDS CLARIFICATION]** — Orçamento de memória do worker em produção: o bot pediu ~740 MB de pico e ficou desligado. Ligar `CANHOTO_NUMBER_OCR_ENABLED` em produção pede aumento do serviço do worker ou lote de 1? Decidir com a medição da T6, não antes.
