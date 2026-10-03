# Feature 236 — o contratante tem prazo de entrega

> **Número:** nasceu como 235, mas duas outras sessões já usam o 235 em worktrees (`235-a-correcao-da-ocorrencia-ganha-tela`
> e `235-o-ajudante-e-um-perfil`, sem push). Conferir `origin/staging` de novo antes de publicar.
> **Estado:** rascunho com **dúvidas abertas** (fim do arquivo). Sem prompt de execução até serem respondidas.

## Problema e resultado

Cada contratante dá um prazo diferente para a transportadora entregar o que ele manda: para alguns são
**três dias** (pedido do usuário em 2026-10-03). Hoje o sistema não tem esse conceito.

O que o código tem de mais parecido não serve (mapa feito na sessão da spec 234):

- `cte_emission_profiles.delivery_days` é gravado e editado, mas **nenhuma regra o lê**; é do perfil fiscal,
  não do contratante (spec 012 queria `dPrev = emissão + N`; o builder emite o dia da emissão).
- `delivery_client_windows` (spec 060) é a **hora que o destinatário recebe**, não o prazo do contratante.
- `company_delivery_proof_settings.missing_after_hours` (24 h) é o prazo do **comprovante**, não o da
  mercadoria, e só existe no nível geral da empresa.
- A nota do motorista mede só a foto do comprovante (ADR-0070 §5, spec 159); atraso de entrega ficou
  explicitamente fora e "aberto para outros motivos depois".
- **Não existe tela de contratante.** `/clientes` lista `delivery_clients` (destinatários); `contractors`
  só aparece em seletores e na aba de e-mail. `closingPeriod` e `reportEmail` nunca foram editáveis por tela,
  embora `PATCH /contractors/:id` já os aceite.

O resultado desta feature: **o contratante tem uma ficha onde se cadastra o prazo de entrega em dias**, e o
painel mostra, em cada nota daquele contratante, até quando ela deve ser entregue e se está no prazo.

## Fora do escopo

- **Nota do motorista.** O prazo de entrega não pesa na nota (ADR-0070 §5, spec 159). Pesar exige decisão e
  motivo de penalidade novos — não aqui. [Dúvida D3]
- **Prazo do comprovante por contratante** (`missingAfterHours`). É outro prazo, toca a nota e hoje três
  chamadores resolvem a config em duas camadas (escrita do comprovante, `proof-pending.query.ts`, nota),
  não em três. Spec própria. [Dúvida D4]
- **Bloquear ou recusar entrega** por prazo vencido: nunca (ADR-0070 §1, spec 193 — a entrega do
  motorista é sempre aceita).
- **Padrão geral da empresa** para o prazo. O pedido é por contratante; "sem prazo" é ausência de regra
  (ADR-0048: ausência é ausência), não um valor-padrão escondido.
- App do motorista e portal do contratante exibirem o prazo (o portal tem payload mínimo guardado por
  contrato — spec 063 — e mostrar prazo ali é decisão de segurança).
- `cte_emission_profiles.delivery_days`/`dPrev` do CT-e: não mexer; só registrar que continuam sem relação.
- Contratante sem cadastro (`contractorId = null`): a nota não ganha prazo; nunca se cria contratante "por
  parecer" (já decidido em `trip-occurrence-feed.use-case.ts`).

## Histórias priorizadas

### P1 — Cadastrar o prazo do contratante

**Given** um contratante vindo da importação de NF-e, sem prazo **When** o operador abre a ficha dele em
"Contratantes" e informa 3 dias **Then** o prazo fica gravado, volta no `GET /contractors` e some com
"Limpar" (campo vazio = sem prazo).

### P2 — Ver o prazo na nota

**Given** uma nota cujo emitente é um contratante com prazo de 3 dias **When** o operador abre a viagem
**Then** a nota mostra "vence em 2 dias" / "vence hoje" / "vencida há 1 dia" e, depois de entregue,
"entregue no prazo" ou "entregue com 1 dia de atraso" — sem alterar nada na entrega nem na nota do
motorista.

### P2 — Página de Contratantes

**Given** o operador em `/clientes` **When** abre a aba "Contratantes" **Then** vê a lista (nome, CNPJ,
prazo, status) com busca e edita na ficha: prazo, período de fechamento, e-mail do relatório, observações
e status — o que o `PATCH /contractors/:id` já aceita.

### P3 — Nota sem contratante cadastrado

**Given** uma nota cujo emitente não está em `contractors` **Then** nenhum prazo é mostrado e nada quebra.

## Requisitos funcionais

- **RF1 — Coluna.** `contractors.delivery_deadline_days` (`smallint`, nulo = sem prazo), `CHECK` de 1 a 60.
  Migration **aditiva**, com `rollback.sql`, snapshot do Drizzle e `db:generate` = `no_changes`. A cópia
  reduzida do worker (`apps/worker-transportada/src/database/delivery-client.schema.ts`) **não** ganha a
  coluna (ele não a lê).
- **RF2 — API.** `GET /contractors`, `GET /contractors/:id` e `by-tax-id` devolvem `deliveryDeadlineDays`
  (`number | null`); `POST` e `PATCH /contractors/:id` o aceitam (`.strict()`, inteiro 1..60 ou `null`).
  Mesma permissão do `PATCH` atual. `companyId` do contexto, nunca do corpo.
- **RF3 — Guardas de chave exata do painel.** Atualizar as três cópias que conferem as chaves do agregado
  (`delivery-clients/shared/contractorContacts.types.ts` `CONTRACTOR_KEYS`,
  `trip/shared/contractorSummary.service.ts`, `extra-charges/shared/extraChargesResponse.validation.ts`),
  senão `GET /contractors` é rejeitado nos seletores. Contrato que falha se uma chave nova do agregado
  não estiver nas três.
- **RF4 — Prazo derivado, nunca gravado.** `deliveryDueAt = âncora + deliveryDeadlineDays` calculado na
  leitura por **política de domínio pura** (`delivery-deadline.policy.ts`), no fuso da empresa. A âncora é a
  definida em [D1]. O prazo muda quando a ficha muda (nada a reprocessar).
- **RF5 — Estado da nota.** `open` (dentro do prazo), `due_today`, `overdue`, `delivered_on_time`,
  `delivered_late`, `not_applicable` (sem contratante ou sem prazo). A entrega usa o **momento da entrega da
  spec 234** (`deliveredMomentSql`), nunca a chegada ao servidor; sem entrega, o relógio do servidor.
- **RF6 — Leitura por nota.** O detalhe da viagem no painel recebe, por documento, `deliveryDeadline:
{ dueAt, state, daysLate? } | null`. O join emitente → `contractors` já existe
  (`drizzle-current-driver-trip.repository.ts`); reaproveitar o ponto único de resolução, **sem** criar mais
  um resolvedor paralelo.
- **RF7 — Aba "Contratantes"** em `/clientes` (`DeliveryClientTabId`), com os componentes do design system do
  painel e a ficha no mesmo padrão da ficha de cliente (`DeliveryClientForm`). Locale pt-BR e en,
  acessível por teclado, sem scroll horizontal em 375 px.
- **RF8 — Selo na nota.** Um selo no padrão de `tripDocumentProofBadges.service.ts`: mesma estrutura e
  tokens, nunca texto cru; contraste conferido nos temas do painel.
- **RF9 — Última tarefa:** revisão de design e usabilidade com print (web.md §15).

## Requisitos não funcionais

- Nenhum PII em log; sem N+1 (o prazo sai no mesmo join que já traz `contractorId`).
- A política é pura e testada com relógio injetado (sem `Date.now()` solto), incluindo virada de dia no fuso
  da empresa e horário de verão histórico.
- Compatível para trás: contratante sem prazo e cliente que não conhece o campo seguem como hoje.

## Casos extremos e falhas

- Prazo 1: vence no dia seguinte à âncora; âncora às 23:59 não vira "vence hoje" por erro de fuso.
- Nota entregue **antes** de o prazo ser cadastrado ou alterado: o estado é recalculado com o prazo de hoje
  (decisão: o prazo é da ficha atual, não do momento da entrega). [Dúvida D5]
- Nota devolvida (`returned`): `not_applicable` (não houve entrega a medir).
- Nota cancelada/removida da viagem: `not_applicable`.
- Contratante inativo: o prazo ainda vale para notas já existentes.
- `contractorId = null` ou emitente sem `tax_id`: `not_applicable`.

## Critérios de aceite

- **CA1** Migration sobe e desce (`make migration-test`); `db:generate` = `no_changes`.
- **CA2** `PATCH /contractors/:id` com `deliveryDeadlineDays: 3` grava; com `null` limpa; com `0`, `61` ou
  `1.5` devolve 400 com o campo nomeado; chave desconhecida continua 400 (`.strict()`).
- **CA3** Contrato do domínio: tabela de casos de `delivery-deadline.policy.ts` (âncora, prazo, agora,
  entrega) → estado, incluindo fuso, prazo 1, entrega no dia do vencimento e devolvida.
- **CA4** Integração contra Postgres: viagem com notas de dois contratantes (um com prazo, um sem) devolve
  prazo só na nota do primeiro; nota sem contratante devolve `null`.
- **CA5** O painel lista, edita e limpa o prazo na ficha; a nota mostra o selo nos dois temas; smoke cobre.
- **CA6** Mutação: tirar a âncora certa, trocar o fuso, inverter `<`/`<=` no vencimento, ignorar
  `returned` — cada uma derruba pelo menos um teste.
- **CA7** Nenhuma mudança em nota do motorista, bloqueio de entrega, `missingAfterHours` ou CT-e (contrato
  de não-regressão: `computeDriverScore` com os mesmos números de antes).

## Dúvidas

**[NEEDS CLARIFICATION: D1 — de quando conta o prazo?]** Nenhum evento hoje é comparado a prazo algum.
Opções: **(a)** emissão da NF-e (`nfe_documents.issued_at`, vem do XML, existe sempre, auditável);
**(b)** chegada da nota ao sistema (importação); **(c)** carregamento/saída (`trip_documents.loaded_at`,
só existe depois de o operador carregar). _Recomendo (a)_: é a única data presente em toda nota sem
depender de operador. Se "os três dias" do contratante contam da **coleta/recebimento da carga**, é (c) e a
nota sem carregamento fica sem prazo — diga qual é a regra do contrato.

**[NEEDS CLARIFICATION: D2 — dias corridos ou úteis?]** _Recomendo corridos_ (sem calendário de feriados
por contratante). Úteis exigiriam feriados nacionais/municipais (a tabela `municipal_holidays` existe, mas
é do destinatário).

**[NEEDS CLARIFICATION: D3 — o que acontece quando vence?]** _Recomendo só informar_ (selo e filtro no
painel), sem pontos na nota do motorista e sem bloqueio. Pesar na nota é outra decisão (ADR-0070 §5) e
penalizaria o motorista por atraso que pode ser do despacho.

**[NEEDS CLARIFICATION: D4 — "os três dias" são também o prazo do comprovante?]** Hoje o comprovante
tem 24 h (`missingAfterHours`) para todos. Se para esse contratante o motorista também pode mandar a foto em
até três dias, é uma configuração **por contratante** do prazo do comprovante — spec separada, porque toca a
nota e exige corrigir antes os três chamadores que resolvem em duas camadas.

**[NEEDS CLARIFICATION: D5 — prazo novo vale para notas antigas?]** Por ser derivado, vale (recalcula com a
ficha atual). _Recomendo manter_; congelar o prazo por nota exigiria gravar o prazo na importação.
