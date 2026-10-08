# Feature 238 — os dias úteis contam feriado e aniversário da cidade

> **Emenda (2026-10-07):** o item "Importar feriados de fonte pública … nunca carga automática" do **Fora do escopo**
> foi revogado para a FeriadosAPI pelo **ADR-0100** (spec 252). O CSV manual (P3) continua fora. O texto abaixo fica
> como registro histórico.

> **Estado:** pronta para execução (sem dúvidas bloqueantes). **Primeira da fila** (236 e 237 dependem dela).
> Decisão do usuário (2026-10-03): o prazo de entrega conta em **dias úteis, incluindo feriados e o
> aniversário das cidades**, e **já existe um calendário com feriados** no produto: esta spec o **reaproveita**
> (hoje só no painel) e o leva ao backend.

## Problema e resultado

O prazo de entrega de alguns contratantes é em dias úteis (spec 236). O backend **não sabe contar dia útil**:
não há `addBusinessDays`/`isBusinessDay` em `apps/*/src`, nem biblioteca de feriados. O que existe:

- `municipal_holidays` (`delivery-client.schema.ts`): `company_id`, `city_ibge_code`, `holiday_on` (data
  absoluta, **sem recorrência**), `name`. Só API (`GET/POST /municipal-holidays`, `DELETE`), **sem tela**;
  lida só pelo solver de rotas (janela de recebimento do cliente). ADR-0048 §3: alimentado à mão, nenhuma
  fonte pública de feriado municipal é confiável.
- Feriado nacional **só no frontend** (`brazilianHoliday.service.ts`: fixos + Carnaval, Sexta-feira Santa,
  Corpus Christi por Páscoa). Sem feriado estadual, sem versão no backend.
- "Aniversário da cidade" não é conceito (o `name` é texto livre e a data é absoluta, então não repete).

O resultado: **uma política de domínio que conta dias úteis por cidade** (nacional + estadual + municipal,
com aniversário da cidade), e uma **tela para cadastrar os feriados** que hoje só entram pela API.

## Fora do escopo

- O prazo de entrega em si (236) e a chegada da carga (237) — esta spec só entrega o calendário.
- Importar feriados de fonte pública (ADR-0048 §3: não há fonte municipal confiável). Pode haver um
  **modelo CSV de importação** manual (P3), nunca carga automática.
- Fuso por contratante; usa-se o da empresa.
- Mudar como o solver de rotas usa `municipal_holidays` hoje (continua lendo a mesma tabela; a data
  recorrente passa a ser materializada por ano — ver RF3 — sem mudar o contrato do solver).

## Histórias priorizadas

### P1 — Contar dias úteis

**Given** uma data e uma cidade (código IBGE) **When** o sistema soma 3 dias úteis **Then** pula sábado,
domingo e os feriados que valem naquela cidade (nacional, do estado e do município, incluindo o aniversário
dela), e devolve a data resultante.

### P1 — Cadastrar feriado e aniversário da cidade

**Given** o operador em Configurações **When** cadastra "Aniversário de Campinas, 14/07, todo ano" **Then**
a data passa a valer todo ano, sem recadastrar.

### P2 — Ver o calendário

**Given** uma cidade **When** o operador abre o calendário do mês **Then** vê o que conta como não útil e por
quê (nacional/estadual/municipal/aniversário).

### P3 — Modelo CSV de feriados

Importar uma lista de feriados municipais de um CSV (modelo baixável), revisando antes de gravar.

## Requisitos funcionais

- **RF1 — Política pura** `business-calendar.policy.ts` (domínio, sem I/O): `isBusinessDay`,
  `addBusinessDays`, `countBusinessDays`, recebendo o conjunto de feriados e o fuso por parâmetro. Relógio
  nunca implícito.
- **RF2 — Feriados nacionais no backend:** a mesma lista do calendário que o painel já usa
  (`brazilianHoliday.service.ts`: fixos + Carnaval, Sexta-feira Santa, Corpus Christi por Páscoa), **sem
  mudar o comportamento que a equipe já usa** (decisão do usuário: "temos um calendário já com feriados").
  Um contrato de **paridade** garante que painel e backend dão o mesmo resultado para os mesmos anos.
- **RF3 — Regra "todo ano" em tabela própria; `municipal_holidays` só com datas fixas** (ADR-0096 §Modelo de
  dados, forma B1): `municipal_holiday_rules` (`company_id`, `city_ibge_code`, `month`, `day`, `kind`
  `holiday`|`city_anniversary`, `name`, `materialized_through_year`) guarda **só** as regras "todo ano".
  `municipal_holidays` (tabela já publicada, lida pelo roteirizador por `holiday_on`) continua guardando **só datas
  fixas** e ganha duas colunas: `kind` (padrão `holiday`) e `source_rule_id` (nulo = digitada à mão; preenchido =
  gerada por uma regra, apagada em cascata com ela, FK composta `(company_id, source_rule_id)`). Migration
  **aditiva**, com `rollback.sql`, sem INSERT nem backfill: as linhas atuais viram `holiday` sem origem e nada muda
  para o roteirizador. Ao gravar a regra, a rota (T1.3) gera as datas dos próximos **10 anos** (29/02 só nos bissextos),
  **sem rotina agendada**; a tela avisa até que ano a regra foi gerada e oferece a ação idempotente "gerar próximos
  anos", que avança `materialized_through_year`. A política (T1.1) segue recebendo regras `once` e `yearly`.
- **RF4 — Feriado estadual:** `state_holidays` (`company_id`, `state_ibge_code`, `recurrence` `once`|`yearly`,
  `holiday_on` ou `month`+`day`, `name`), cadastrável, com dois únicos parciais (um por forma) e CHECK de forma. Não é
  materializado: o roteiro não lê feriado estadual, a política expande o `yearly`. Sem seed automático de estados.
- **RF5 — Sábado:** `company_business_calendar_settings` (uma linha por empresa; `saturday_is_business_day`, sem
  linha = `false`: segunda a sexta); premissa revogável pelo operador.
- **RF6 — Resolução por cidade** (a cidade é a do destino físico, resolvida por quem chama com
  `resolvePhysicalDestination` — ADR-0096): o calendário de uma cidade = nacionais ∪ estaduais (UF do IBGE) ∪
  municipais daquela cidade. A UF sai dos dois primeiros dígitos do código IBGE.
- **RF7 — Tela** em Configurações: lista, cria, edita e remove feriado municipal/estadual e aniversário
  (hoje só API), com locale pt-BR/en, tabela com filtros múltiplos e ordenação (web.md §7).
- **RF8 — Rotas:** `GET/POST/PATCH/DELETE` de feriados municipais e estaduais, `settings.manage`,
  Zod `.strict()`, `companyId` do contexto. Documentação OpenAPI gerada das rotas.
- **RF9 — Última tarefa:** revisão de design e usabilidade com print (web.md §15).

## Requisitos não funcionais

- Tabela de casos do domínio cobrindo: virada de mês/ano, feriado em sábado/domingo (não conta duas vezes),
  feriado em cidades diferentes, aniversário em ano bissexto, 0 dia útil, fuso da empresa.
- Sem N+1: o calendário de um conjunto de cidades se carrega em uma consulta por ano.
- Compatível para trás: o solver de rotas continua recebendo as datas como hoje.

## Casos extremos e falhas

- Cidade sem nenhum feriado cadastrado: só nacionais + estaduais; "ausência é ausência" (ADR-0048).
- Código IBGE inválido ou sem UF: a política recusa (erro tipado), nunca assume um calendário.
- Feriado duplicado (mesma cidade, mesma data): idempotente (unique existente). Regra duplicada (mesma cidade, mesmo
  dia) é recusada pelo unique da regra; a data gerada que colide com uma digitada à mão é ignorada, não sobrescrita.
- Ano muito distante (>5 anos): a expansão é limitada e o excesso vira erro tipado.

## Critérios de aceite

- **CA1** `addBusinessDays(2026-10-09 sexta, 3, Campinas)` pula o fim de semana, o feriado nacional da segunda
  (12/10, Nossa Senhora Aparecida) e um feriado municipal na terça (13/10), e devolve **2026-10-16** (sexta) —
  sem o municipal (São Paulo), **2026-10-15**. Caso de contrato em tabela, linhas 1 e 2. _(Corrigido na T1.1: a
  redação anterior esquecia que 12/10 é feriado nacional e levava a 15/10; evidence.md § T1.1.)_
- **CA2** Aniversário `yearly` vale em 2026 e 2027 sem recadastro; `once` só no ano gravado.
- **CA3** Migration sobe e desce; `db:generate` = `no_changes`; linhas antigas continuam valendo; no rollback as
  datas materializadas **ficam** em `municipal_holidays` como datas fixas comuns (o roteiro as respeita) e só o que é
  novo some.
- **CA4** Rotas validam, recusam campo desconhecido (400) e nunca aceitam `companyId` do corpo.
- **CA5** A tela cadastra, edita e remove; o print nos dois temas e em 375/768/1280 px é aprovado.
- **CA6** Mutação: tirar a expansão anual, contar sábado, ignorar a UF, duplicar o feriado em fim de semana
  — cada uma derruba um teste.

## Dúvidas

Nenhuma bloqueante. Premissas adotadas (revogáveis, sem travar a execução): **sábado não é dia útil**
(configurável por empresa) e **a cidade do feriado é sempre onde a carga será entregue**, o destino físico de `resolvePhysicalDestination` (decidido pelo usuário em 2026-10-06; antes constava "a do destinatário"), e **o feriado anual é guardado como regra e vira uma data fixa por ano, materializada na escrita da regra (10 anos, sem rotina agendada)**, para o roteirizador não mudar (ADR-0096);
Carnaval e Corpus Christi seguem como feriado, **como o calendário atual do painel já faz**.
