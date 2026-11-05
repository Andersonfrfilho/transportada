# Feature 296 — Contas recorrentes e contas adicionais da empresa

> Rascunho de desenho, escrito antes de qualquer código. Nasce do pedido do Anderson: _"dois
> módulos: um de cadastrar contas recorrentes e contas adicionais, e outro de viagem que necessita
> coletas"_. Este arquivo cobre só o primeiro. A leitura adotada é **contas a pagar da
> transportadora**: despesas fixas que se repetem (recorrentes) e despesas avulsas (adicionais).
> Tudo que depende de confirmação está em § Dúvidas.

## Problema e resultado

Hoje o produto conhece o custo **da viagem** (ADR-0049: combustível, pedágio, diária, impostos) e o
custo **do veículo** (prestação, IPVA, seguro, `monthlyFixedCost`). Não conhece o custo **da
empresa**: aluguel do pátio, contador, rastreador, internet, folha administrativa, energia, parcela
de financiamento que não é de veículo, nem a despesa que aparece uma vez (multa, conserto, taxa).

A ADR-0049 §3 já promete uma "visão por período" que subtrai o que não é da viagem (a parcela
`period`). Essa visão não tem de onde tirar o número. Sem este módulo, "o mês deu lucro?" continua
sendo planilha.

**Resultado:** a pessoa do financeiro cadastra uma conta recorrente uma vez (valor, periodicidade,
vencimento) e o sistema gera sozinho a ocorrência de cada mês; lança contas adicionais avulsas; marca
cada ocorrência como paga; e vê por mês o total previsto, o pago e o atrasado. Esses totais alimentam
a visão por período da ADR-0049.

## Fora do escopo (proposto)

- **Conciliação bancária, boleto de pagamento, pagamento pelo sistema.** O sistema registra que a
  conta foi paga; não paga.
- **Contas a receber.** Já existem em `billing` (faturas).
- **Custo por viagem e por veículo.** Continuam nos seus módulos; conta da empresa não é rateada por
  viagem (mesmo raciocínio da ADR-0049 §3: o divisor só se conhece no fim do período).
- **Plano de contas contábil, centro de custo, NF de entrada.** Categoria simples basta por ora.
- **Folha de pagamento do motorista fixo.** Ver Dúvida 5.

## Modelo proposto

Três conceitos, para não misturar "a regra" com "o que vence":

1. **Categoria de conta** (`company_expense_categories`): nome, ativa. Semeada com um conjunto
   inicial editável (aluguel, energia, internet, contador, seguro, imposto, manutenção, multa, outros).
2. **Conta recorrente** (`company_recurring_expenses`): a regra. Descrição, categoria, valor
   previsto, periodicidade (`monthly`, `bimonthly`, `quarterly`, `semiannual`, `annual`), dia do
   vencimento, data de início, data de fim opcional, fornecedor (texto livre), ativa. Valor pode ser
   **fixo** ou **variável** (energia: o valor real só se sabe na fatura).
3. **Lançamento** (`company_expense_entries`): o que vence/vencerá de fato. Nasce de duas formas:
   - gerado da recorrente, uma linha por competência (`recurring_expense_id` + `competence`
     únicos — idempotente);
   - **conta adicional**: lançada à mão, sem recorrente (`recurring_expense_id` nulo).
   Campos: competência (mês), vencimento, valor previsto, valor pago, data do pagamento, status
   (`open`, `paid`, `canceled`; **atrasado é derivado** de `open` + vencimento < hoje, não é
   coluna), observação, anexo opcional (comprovante, no storage existente).

Regras de domínio:

- Dinheiro em `numeric(19,4)`, como no resto do produto; `companyId` em tudo, com contrato negativo
  de isolamento de tenant.
- **A geração é do cron** (`apps/cron-transportada`), que materializa os lançamentos dos próximos N
  meses (proposta: 3) de cada recorrente ativa, de forma idempotente. Gerar no cron, não ao abrir a
  tela, mantém a tela sem efeito colateral de leitura.
- Editar a recorrente muda **só lançamentos futuros em aberto**; o que já foi pago ou venceu é fato
  e não é reescrito (mesma lógica de "congelar" da ADR-0049 §5).
- Encerrar a recorrente (data de fim ou desativar) cancela os lançamentos futuros em aberto, não os
  pagos.
- Vencimento em dia que não existe no mês (31 em fevereiro) cai no último dia do mês; vencimento em
  dia não útil segue o calendário comercial que já existe (`business-calendar`) — a confirmar
  (Dúvida 4).
- Permissão nova `company.expenses` para `company-admin` e `finance`, e mais ninguém, seguindo o
  precedente de `trip.financials` (ADR-0049 §6). Contract test nomeando cada papel recusado.

## Histórias priorizadas

### P1 — Cadastrar uma conta recorrente

**Given** o financeiro logado **When** cadastra "Aluguel do pátio, R$ 4.500, mensal, vence dia 10,
a partir de nov/2026" **Then** o sistema cria a regra e já mostra os lançamentos de nov, dez e jan
com vencimento no dia 10, status em aberto.

### P1 — Lançar uma conta adicional

**Given** uma multa de R$ 880 que chegou hoje **When** o financeiro lança uma conta adicional com
categoria "multa", vencimento e valor **Then** ela aparece na lista do mês do vencimento, igual aos
lançamentos gerados, marcada como avulsa.

### P1 — Dar baixa

**Given** um lançamento em aberto **When** o financeiro informa valor pago, data e (opcional)
comprovante **Then** o status vira pago; valor pago diferente do previsto é aceito e fica visível
(energia veio mais cara).

### P2 — Ver o mês

**Given** a lista de contas **When** o financeiro filtra por mês **Then** vê previsto, pago e
atrasado do mês, com a tabela no padrão `docs/frontend/data-tables.md` (filtro, ordenação,
paginação, preferências de visão — spec 015).

### P2 — Alimentar a visão por período

**Given** um período fechado **When** a visão por período (ADR-0049 §3) é consultada **Then** o
total de contas pagas e previstas da empresa entra como linha própria, separada do custo das
viagens. (Entrega só o endpoint de totais; a tela do período é outra feature.)

### P3 — Aviso de vencimento

**Given** um lançamento a vencer em 3 dias **When** o cron roda **Then** gera notificação no produto
(spec 034) para quem tem `company.expenses`. Canais WhatsApp/e-mail ficam de fora desta primeira
entrega.

## Requisitos funcionais

- RF1 CRUD de categoria, recorrente e lançamento, todos com `companyId` e auditoria (quem/quando).
- RF2 Geração idempotente de lançamentos pelo cron, com janela configurável.
- RF3 Baixa com valor, data e comprovante opcional; reabrir uma baixa exige motivo e fica na trilha.
- RF4 Cancelar lançamento (não apagar): dinheiro registrado não some.
- RF5 Listagem paginada com filtro por competência, status, categoria, avulsa/recorrente, e totais
  do filtro.
- RF6 Totais por mês para a visão por período.
- RF7 Valor variável: lançamento gerado nasce com o valor previsto da regra e pode ser ajustado
  antes da baixa sem alterar a regra.

## Requisitos não funcionais

- Hexagonal como o resto da API (domain / application / infrastructure / presentation), sem
  framework HTTP, Zod nas bordas, Drizzle com migration **e** rollback (`make migration-test`).
- Migration de expansão apenas; nada existente muda.
- Frontend no painel (`apps/frontend-transportada`), módulo novo `company-expense`; 375 px e tema
  escuro conferidos como nas demais telas.
- Contract tests sem banco e testes de integração com banco, nos dois comandos descritos no
  `CLAUDE.md`.

## Casos extremos e falhas

- Cron roda duas vezes seguidas: nenhum lançamento duplicado (índice único).
- Recorrente editada depois de lançamentos já pagos: pagos intactos.
- Recorrente com início no passado: gera só a partir da janela, não inventa dívida retroativa
  (Dúvida 6).
- Valor zero ou negativo: recusado (crédito/estorno não é conta a pagar).
- Dois usuários dão baixa no mesmo lançamento: o segundo recebe conflito, não sobrescreve.

## Critérios de aceite

- Cadastrar a recorrente do exemplo gera 3 lançamentos corretos, e rodar o cron de novo mantém 3.
- Conta adicional aparece na lista e nos totais do mês.
- Papéis fora de `company-admin`/`finance` recebem 403 nas rotas, com teste por papel.
- Totais do mês batem com a soma dos lançamentos não cancelados.
- `make check` e `make migration-test` verdes.

## Dúvidas

[NEEDS CLARIFICATION: 1 — **Escopo.** "Contas" aqui são contas a pagar da transportadora
(aluguel, contador, multa...)? Ou é outra coisa, como cobranças recorrentes ao cliente ou custos
extras por veículo/motorista?]

[NEEDS CLARIFICATION: 2 — **Quem usa e se há aprovação.** Só o financeiro lança e dá baixa? Existe
alguém que precisa aprovar antes de pagar?]

[NEEDS CLARIFICATION: 3 — **Periodicidades.** Mensal cobre tudo, ou precisa de semanal, quinzenal,
anual, "a cada N dias"? Há contas com parcelas fixas e fim (financiamento em 36x)?]

[NEEDS CLARIFICATION: 4 — **Vencimento em dia não útil.** Antecipa, posterga ou deixa como está?]

[NEEDS CLARIFICATION: 5 — **Folha.** Salário do motorista fixo (ADR-0049 §3) entra aqui como conta
recorrente, ou continua no cadastro do motorista e a visão por período junta as duas fontes?]

[NEEDS CLARIFICATION: 6 — **Histórico.** Ao cadastrar uma recorrente que começou antes do sistema,
gera os meses passados como pagos/em aberto, ou só a partir de hoje?]

[NEEDS CLARIFICATION: 7 — **Vínculo opcional.** Conta adicional pode ser ligada a uma viagem ou
veículo (conserto do caminhão X)? Se sim, ela vira custo `manual` da viagem em vez de despesa da
empresa?]

[NEEDS CLARIFICATION: 8 — **Aviso.** Vencimento avisa só no painel, ou também por WhatsApp/e-mail?]
