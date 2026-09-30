# Tasks

Uma task por vez, na ordem. Teste de aceite/contrato **antes** da implementação. Task só fecha com
evidência em `evidence.md` e commit isolado.

⚠️ Arquivo de teste novo entra na **lista explícita** do `package.json` da app — senão não roda.
⚠️ Na API são **dois comandos** e nenhum cobre o outro:
`bun --env-file=../../.env.test test --timeout 120000` (contrato) e
`bun --env-file=../../.env.test run test:integration` (integração).

---

## Fase 1 — A configuração separa as duas fotos

> 🤖 Modelo: `sonnet`

- [x] T1.1 Contrato: `deliveryProofSettingsSchema` aceita `cargo` nos três modos, ausente preserva o
      gravado, inválido é 400 — `apps/api-transportada/test/delivery-proof-settings/*.contract.ts`
- [x] T1.2 Migration aditiva: coluna `cargo` (padrão `off`, CHECK) nas três tabelas —
      `apps/api-transportada/src/database/company-delivery-proof-settings.schema.ts` + migration —
      `make migration-test`
- [x] T1.3 Schema Zod e caso de uso de leitura/escrita passam a carregar `cargo` —
      `src/trips/presentation/delivery-proof-settings.schema.ts` — contrato da T1.1 verde
- [x] T1.4 [P] Contrato da cascata com `cargo` (geral → contratante → destinatário, por inteiro) —
      `apps/frontend-transportada/test/trip/delivery-proof-settings.contract.ts`
- [x] T1.5 Cascata do painel resolve `cargo` — `src/modules/trip/shared/deliveryProofSettings.service.ts`
- [x] T1.6 Tela de configuração com dois campos de foto, rótulos e texto de apoio;
      `canhotoOcrEnabled` amarrado ao do canhoto — componente + `trip.locale.json` (pt-BR **acentuado**)
- [x] T1.7 [P] Contrato: `proofFormPlan` com `cargo` (`rendersCargo`, faltantes) —
      `apps/frontend-driver/test/...`
- [x] T1.8 `proofFormPlan.service.ts` e o campo da foto da mercadoria no `DriverStopCard`
- [x] T1.9 Revisão de design (`web.md` §15): configuração comparada com os painéis vizinhos,
      contraste nos dois estados, **print ao usuário**
- [x] T1.10 `make check` + commit

## Fase 2 — O veredito alcança a foto da mercadoria

> 🤖 Modelo: `sonnet`

- [ ] T2.1 Contrato: `cargo` a 800 m e 2 h atrasado → `late_and_away`; canal `office` →
      `not_required`; `cargo: 'off'` → `not_required` — `test/trip/delivery-proof-punctuality.contract.ts`
- [ ] T2.2 Contrato: duas fotos de `cargo` guardam vereditos independentes; a segunda não altera a
      primeira (`mergeProofPunctuality` continua só para o que substitui)
- [ ] T2.3 Abre o portão em `attach-delivery-proof.use-case.ts:323`, guiado por `settings.cargo`
- [ ] T2.4 `make check` + commit

## Fase 3 — Miniatura dos três tipos

> 🤖 Modelo: `sonnet` (T3.2 é 🧠 — validar o purpose e a retenção com `opus` antes)

- [ ] T3.1 Contrato: miniatura gerada no cliente sai ≤ 128 KiB, lado maior 320 px; falha na geração
      ainda produz o comprovante
- [ ] T3.2 🧠 Migration: `thumbnail_object_id` nullable + purpose `trip_delivery_proof_thumbnail`,
      na mesma retenção e no mesmo lote de expurgo do original (molde 161 RF3) — `make migration-test`
- [ ] T3.3 Geração da miniatura no app do motorista antes de enfileirar, reusando o canvas de
      `occurrencePhotoImage.service.ts`; campo `thumbnail` **opcional** no form
- [ ] T3.4 Geração no assistente de baixa em campo do escritório e na assinatura
- [ ] T3.5 [P] Contrato: `readDeliveryProofs` devolve `thumbnailUrl` quando há e omite quando não
      há; o cursor de listagem **não** gera URL assinada
- [ ] T3.6 `read-delivery-proof.use-case.ts` monta a URL assinada no mesmo lote (RNF01)
- [ ] T3.7 `ProofImage` passa a usar a miniatura, com queda para o original quando ausente
- [ ] T3.8 Contrato de integração da URL assinada — `test/integration/*.integration.ts` +
      **`test:integration`**
- [ ] T3.9 `make check` + commit

## Fase 4 — O painel mostra o que colheu

> 🤖 Modelo: `sonnet`

- [ ] T4.1 Contrato: renderiza "quem recebeu" com o rótulo pt-BR do enumerado; comprovante antigo
      com `null` renderiza sem a linha e sem quebrar
- [ ] T4.2 Contrato: hora da captura e distância legível; sem posição diz "sem localização";
      nenhuma coordenada em texto nem em URL
- [ ] T4.3 Contrato: selos de pontualidade e de registro tardio por imagem
- [ ] T4.4 `TripDeliveryProof.component.tsx` — as três leituras acima, no detalhe **e** na expansão
      por nota (que já existe)
- [ ] T4.5 Rótulos em `trip.locale.json`, acentuados
- [ ] T4.6 Revisão de design + **print ao usuário**
- [ ] T4.7 `make check` + commit

## Fase 5 — O visualizador com próximo e anterior

> 🤖 Modelo: `sonnet`

- [ ] T5.1 Contrato: ordem da galeria (canhoto → mercadoria → assinatura, na ordem da tela); uma
      imagem só não oferece os botões; as pontas param
- [ ] T5.2 `ProofGalleryDialog` — molde do `ProofImageLightbox` do app do motorista (foco preso,
      Esc, `popstate` do Android) sobre `useModalDialog` do painel, com anterior/próxima
- [ ] T5.3 Miniatura clicável; a tela cheia usa o **original**, nunca a miniatura ampliada
- [ ] T5.4 `deliveryProof.open` (`trip.locale.json:466`) ganha consumidor — ou sai
- [ ] T5.5 Teste montado em `test/trip-hooks/*.contract.ts` + `bun run test:hooks`
- [ ] T5.6 Revisão de design em 375 px, 768 px e 1280 px (fullscreen em mobile) + **print**
- [ ] T5.7 `make check` + commit

## Fase 6 — O canhoto ganha veredito

> 🤖 Modelo: `opus` (estado de domínio novo; T6.2 e T6.3 são o núcleo)

- [ ] T6.1 🧠 Contar os canhotos existentes em produção e **decidir com o usuário**: todos viram
      `pending` ou só a partir de uma data de corte — registrar a contagem em `evidence.md`
- [ ] T6.2 🧠 Contrato de integração: canhoto recapturado **zera** a conferência no `ON CONFLICT`
      (não herda "recusado") — `test/integration/` + **`test:integration`**
- [ ] T6.3 🧠 Migration: estado de conferência + ator, instante, motivo, nota, número lido e origem
      da leitura — `make migration-test`
- [ ] T6.4 Contrato: `matched` por código de barras → `approved`; OCR com número certo →
      `pending` com sugestão; ilegível → `pending`; prazo estourado → `pending`
- [ ] T6.5 `canhotoReview.service.ts` no painel — orquestra os serviços existentes (zxing →
      tesseract sob `canhotoOcrEnabled`), fora do caminho de render, prazo de 20 s
- [ ] T6.6 Contrato: aprovação manual exige `trip.manage`, grava ator e instante, gera trilha; o
      resultado automático **nunca** sobrescreve decisão humana
- [ ] T6.7 Contrato: recusa exige motivo; texto livre com CPF, CNPJ, telefone, e-mail ou CEP é
      recusado (**reusar** a guarda da spec 162, não escrever outra)
- [ ] T6.8 `PATCH .../proof/review` + caso de uso, com verificação por objeto (tenant) e trilha
- [ ] T6.9 Canhoto recusado vira pendência de recaptura para o motorista, com o motivo visível
- [ ] T6.10 Contrato: **nenhum veredito** impede confirmar entrega, despachar viagem, emitir CT-e
      ou faturar (CA13)
- [ ] T6.11 Revisão de design + **print ao usuário**
- [ ] T6.12 `make check` + commit

---

## Prompt de execução

```text
/oh-my-claudecode:autopilot Trabalhe no worktree
/Users/anderson.filho/Documents/personal/transportada-wt/comprovante-duas-fotos (branch
work/comprovante-duas-fotos) — a spec não existe no checkout principal. Execute a spec
specs/220-a-mercadoria-e-o-canhoto-nao-sao-a-mesma-foto/ (leia spec.md, plan.md e tasks.md antes
de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fases 1, 2, 3, 4 e 5 → executor model=sonnet · Fase 6 → opus ·
T3.2, T6.1, T6.2 e T6.3 🧠 → validar com architect em opus antes de implementar ·
revisão final → code-reviewer model=opus.
Teste de contrato ANTES da implementação em toda task. Cada task fecha com typecheck + testes +
commit isolado, evidência em evidence.md. Na API rode os DOIS comandos quando a task tocar
test/integration/**: `bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration`. Arquivo de teste novo entra na lista
explícita do package.json da app. Fase que toca banco fecha com `make migration-test`.
Toda fase que toca a tela fecha com revisão de design e print ao usuário (web.md §15).
Pare e pergunte antes de: deploy, migration destrutiva, a decisão de preenchimento retroativo da
T6.1, qualquer [NEEDS CLARIFICATION].
```
