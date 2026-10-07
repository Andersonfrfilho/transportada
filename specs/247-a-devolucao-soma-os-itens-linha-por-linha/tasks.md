# Tasks

> Pré-condição: as specs 241 e 246 em `origin/staging` (conferido em 2026-10-06, `687473e1f`:
> `items_mode`, `note_mode`, `signature_mode`, mínimos, `company_occurrence_type_moments`, aba Tipos).
> Decisões D1–D12 em `plan.md`. Nenhuma task trata tipo por nome (spec § "Tudo é configuração do
> tipo").

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`. Na API, contrato e integração são **dois comandos** e nenhum cobre o
outro; a integração exige `--env-file=../../.env.test`. Teste novo só roda se entrar na lista
explícita do `package.json` da app.

## Fase 0 — Conferência

> 🤖 Modelo: `haiku`

- [ ] **T0.1** Conferir em `origin/staging` que os fatos do `plan.md` § Contexto continuam (arquivo e
      linha); divergência vira nota em `evidence.md` antes de codar. Medir a distância da branch
      para `origin/staging` (`git rev-list --count`).
- [ ] **T0.2** Consulta só-leitura em **staging** (não produção): quantos tipos têm
      `email_template_key` não nulo **e** `emails_contractor = true` (os que hoje perdem o e-mail à
      contratante, RF2). Produção: só com autorização do usuário — parada.

## Fase 1 — Painel e app tolerantes (etapa 1 da ADR-0081 §9)

> 🤖 Modelo: `haiku`

- [ ] **T1.1** `frontend-transportada` `tripResponse.validation.ts`: aceitar como opcionais
      `referenceNumberMode`, `referenceNumberLabel`, `declaredAmountMode`, `declaredAmountScope`,
      `declaredAmountLabel`, `emailItemLineTemplate`, e nas exceções os dois modos; contrato que
      prova que um tipo **com** e **sem** as chaves é aceito.
- [ ] **T1.2** `frontend-driver`: a validação do snapshot aceita `products` opcional por nota e os
      campos novos do tipo efetivo; contrato idem.

## Fase 2 — O dado (etapa 2)

> 🤖 Modelo: `sonnet` (T2.2 é 🧠 — `opus`, validar com `architect` antes)

- [x] **T2.1** Constante `OCCURRENCE_DECLARED_AMOUNT_SCOPES` em `trip-occurrence.constant.ts`.
- [x] **T2.2** 🧠 Schema e migration do `plan.md` § Modelo de dados: colunas do tipo com default,
      colunas nulas nas exceções, colunas da ocorrência e dos produtos, CHECKs geradas das
      constantes (nomes ≤ 63), CHECK `declared_amount_items`. `rollback.sql` que só derruba o que
      esta spec cria. `db:generate`; `make migration-test` verde.
- [x] **T2.3** Integração da migration (`test/integration/occurrence-declared-amount.integration.ts`,
      na lista do `package.json`): tipo semeado antes recebe os defaults; exceção recebe nulo; CHECKs
      recusam `declared_amount_scope='item'` com `items_mode='off'`, valor negativo, número inválido.
- [x] **T2.4** Mutações da T2.3, cada uma vermelha registrada: (1) default `'optional'` em
      `declared_amount_mode`; (2) tirar a CHECK `declared_amount_items`; (3) default não nulo na
      exceção.

## Fase 3 — Cálculo e modelo de e-mail (domínio)

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Contrato **antes**: `test/trip-occurrence/occurrence-amount.contract.ts` com a tabela
      de casos (CA02), formatação de valor e quantidade, valor pago vencendo, nulo caindo no `vProd`.
- [x] **T3.2** `occurrence-amount.policy.ts` em `bigint`, sem `Number`/`parseFloat`.
- [x] **T3.3** Mutações da T3.1 registradas: truncar em vez de meio para cima; somar antes de
      arredondar; trocar `bigint` por `Number` (o caso `3 × 19,995` fica vermelho).
- [x] **T3.4** Contrato **antes**: `template.contract.ts` ampliado — os dois contextos, `linhasItens`
      com o modelo do SAC (CA01, assunto e corpo exatos, `SPANI` vindo de `contractorName` de
      fixture), linha padrão, teto de 200, `{{` na descrição sai literal, recusas da CA04.
- [x] **T3.5** `occurrence-template.policy.ts`: duas listas, contexto, `linhasItens`,
      `numeroNotaSemSerie`, dinheiro formatado em `valorNota` (D4), `quantidadeItem` da ocorrência
      (D5).
- [x] **T3.6** Mutações da T3.4 registradas: aceitar marcador de linha no corpo; re-renderizar valor
      de item; manter `valorNota` cru.

## Fase 4 — API

> 🤖 Modelo: `sonnet` (T4.4 é 🧠 — `opus`: é onde a exigência efetiva pode divergir do app)

- [x] **T4.1** Cadastro: `occurrence.schema.ts` com os campos e o contexto da linha;
      `save-occurrence-type` sem zerar assunto/corpo (RF2), `422
OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS`; `PUT` sem os campos mantém os gravados. Contrato
      e integração (CA05) **antes**.
- [x] **T4.2** Mutação da CA05: devolver `emailBody: ''` no save; vermelho registrado.
- [x] **T4.3** Rota `POST /company-settings/occurrence-types/email-preview` (`settings.manage`, rate
      limit) com dados de exemplo fixos e a mesma função do envio; contrato de permissão negativa.
- [x] **T4.4** 🧠 Registro do motorista: itens (`productCode`, `quantity`, `declaredAmount?`),
      `referenceNumber?`, `declaredAmount?`; exigência efetiva por `resolveWithOverrides`
      (contratante e destinatário lidos da nota no servidor); `unit_value` lido de `nfe_products`;
      códigos `TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED` e `..._DECLARED_AMOUNT_REQUIRED`.
      Integração CA06 **antes**, incluindo payload com preço forjado (recusado com 400, `.strict()`; o `unit_value` sai sempre da nota) e empresa B.
- [x] **T4.5** **CA03 — só a configuração decide.** Contrato + integração com os quatro tipos do
      `plan.md` § Testes; mutações registradas: `if` pelo nome do tipo; ler o modo do tipo em vez do
      efetivo.
- [x] **T4.6** Snapshot do motorista com produtos por nota (uma consulta por viagem); medir o
      tamanho com a maior nota de staging e registrar.
- [x] **T4.7** `readOccurrenceTemplateValues`, prévia e aviso automático com os valores novos;
      integração do registro ao aviso automático com o modelo do SAC (CA01).
- [x] **T4.8** Correção (240/167): número e valores, `previous_items`; integração.

## Fase 5 — Telas (etapa 3)

> 🤖 Modelo: `sonnet`; T5.5 → `haiku`

- [x] **T5.1** Aba Tipos: linhas "Número do documento do cliente" e "Valor pago" no bloco de
      exigências (mesmo `Select` de três estados, rótulo editável, escopo), exceções com "Igual ao
      tipo". Contrato de componente.
- [ ] **T5.2** Bloco "E-mail à contratante": interruptor `emailsContractor`, assunto, corpo, linha de
      item, marcadores clicáveis por contexto, prévia do servidor com `debounce`, erro de marcador
      desconhecido no campo. "Notificação" vira "Aviso interno" com a dica corrigida.
- [ ] **T5.3** App do motorista: lista de produtos, quantidade, soma da linha, soma geral, valor
      pago (por linha ou ocorrência), número com o rótulo do tipo; botão bloqueado pelo exigido
      (CA07), sem rede; envio pela fila.
- [ ] **T5.4** Correção no painel com número e valores; acerto da 164 com sugestão (RF12).
- [ ] **T5.5** Rótulos de momento e dicas (plan § Rótulos), no controle, no filtro e no resumo;
      contrato que renderiza e procura no controle.

## Fase 6 — Roteiro operacional

> 🤖 Modelo: `haiku`

- [ ] **T6.1** `docs/operacao/tipos-de-ocorrencia-do-sac.md`: roteiro de cadastro **pela tela** dos
      dois tipos com os valores exatos da spec § "Modelos do SAC" (e o que renomear em "Recusa
      parcial"/"Recusa total"). Nada de seed, migration ou script que crie/altere tipo de empresa
      existente. Prettier.

## Fase 7 — Revisão e fechamento

> 🤖 Modelo: `sonnet`; T7.2 → `code-reviewer` `opus`

- [ ] **T7.1** Revisão de design e usabilidade: print em 375, 768 e 1280 da aba Tipos (tipo aberto,
      com e-mail e prévia), do registro no app do motorista e da correção. **Comparar o
      `preview.html` com a tela real, lado a lado**, com os mesmos dados, e registrar em
      `evidence.md` a tabela "elemento → preview → tela real → veredito" (rótulos, ordem, estados
      vazio/erro/desabilitado, soma, contraste, foco, alvos ≥ 44 px, sem estouro de largura).
      Verificação por texto primeiro (`read_page`, geometria, contraste); print só como prova.
- [ ] **T7.2** Passada independente de funcionalidade, usabilidade e design por `code-reviewer`
      (`opus`): configurar o tipo do SAC na tela, registrar no app com dois itens e valor pago, ver o
      e-mail na conversa, corrigir pelo painel. Reprovado com bloqueante/alto → corrige e repete.

      1ª rodada reprovou o app do motorista (A3 + B1); correções em `evidence.md` § "T7.2 — correções da
      revisão: app do motorista". 2ª rodada aprovou com ressalvas; N1/N2/N10 (API) em `evidence.md` §
      "T7.2b — API: requisitos efetivos no detalhe e correção sob o modo do tipo". Falta o painel consumir
      `requirements` e a revisão final.

- [ ] **T7.3** Atualizar `CLAUDE.md` da raiz, `apps/*/CLAUDE.md` tocados e `docs/ai-context/`.
- [ ] **T7.4** Gates: `bun run typecheck`, `make check`, `make migration-test`, integração da API em
      primeiro plano com `--env-file`; depois de `git fetch` + rebase + `bun install
--frozen-lockfile`, `db:generate` = `no_changes`.
- [ ] **T7.5** `evidence.md` consolidado.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/247-a-devolucao-soma-os-itens-linha-por-linha/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Pré-condição: 241 e 246 em origin/staging (items_mode, note_mode, momentos, aba Tipos); se faltar,
pare e avise.
Regra que não se negocia: TUDO é configuração do tipo — nenhum comportamento por nome de tipo ou
constante; "Devolução parcial/total" são linhas criadas na tela. Nenhum seed/migration cria ou altera
tipo de empresa existente.
Decisões D1–D12 do plan.md são fechadas por delegação; não reabrir sem o usuário.
Modelos: Fases 0, 1 e 6 → executor model=haiku · Fases 2, 3, 4, 5 e 7 → executor model=sonnet
(T5.5 → haiku) · T2.2 e T4.4 🧠 → opus, validadas com architect antes de implementar · revisão final
(T7.2) → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Ordem de publicação (ADR-0081 §9): Fase 1 (painel e app tolerantes) antes de banco/API (Fases 2–4),
e só então as telas (Fase 5). A migration tem rollback.sql.
Gates de cada task: typecheck + teste + commit isolado, evidência em evidence.md. Na API contrato e
integração são dois comandos; a integração exige --env-file=../../.env.test; teste novo entra na lista
do package.json. Dinheiro em numeric/bigint, nunca float. Tasks de mutação (T2.4, T3.3, T3.6, T4.2,
T4.5) só fecham com a execução vermelha registrada.
Antes de fechar: T7.1 compara o preview.html com a tela real em 375/768/1280 e registra a tabela de
diferenças; T7.2 passada independente com code-reviewer model=opus; reprovou, corrige e repete.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer leitura ou escrita em produção
(T0.2 em produção), qualquer [NEEDS CLARIFICATION].
```
