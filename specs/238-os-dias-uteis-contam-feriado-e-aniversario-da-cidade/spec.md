# Feature 238 — os dias úteis contam feriado e aniversário da cidade

> **Estado:** rascunho com dúvidas abertas. **Primeira da fila** (236 e 237 dependem dela).
> Decisão do usuário (2026-10-03): o prazo de entrega conta em **dias úteis, incluindo feriados e o
> aniversário das cidades**.

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
- **RF2 — Feriados nacionais no backend:** fixos + Sexta-feira Santa (por Páscoa). **Carnaval e Corpus
  Christi não são feriado nacional por lei** (ponto facultativo): entram como feriado só quando cadastrados
  pelo operador [D1].
- **RF3 — Recorrência no município:** `municipal_holidays` ganha `recurrence` (`once` | `yearly`) e `kind`
  (`holiday` | `city_anniversary`); `yearly` guarda mês e dia. Migration **aditiva**, com `rollback.sql`; linhas
  atuais viram `once` sem mudar comportamento. A leitura expande `yearly` para o ano pedido (29/02 só em ano
  bissexto, regra registrada).
- **RF4 — Feriado estadual:** `state_holidays` (`company_id`, `state_code`, data ou mês/dia, nome),
  cadastrável. Sem seed automático de estados.
- **RF5 — Sábado:** configuração da empresa `saturday_is_business_day` (padrão `false`) [D2].
- **RF6 — Resolução por cidade:** o calendário de uma cidade = nacionais ∪ estaduais (UF do IBGE) ∪
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
- Feriado duplicado (mesma cidade, mesma data): idempotente (unique existente).
- Ano muito distante (>5 anos): a expansão é limitada e o excesso vira erro tipado.

## Critérios de aceite

- **CA1** `addBusinessDays(2026-10-09 sexta, 3, cidade)` pula o fim de semana e um feriado municipal que cai
  na terça seguinte (caso de contrato em tabela).
- **CA2** Aniversário `yearly` vale em 2026 e 2027 sem recadastro; `once` só no ano gravado.
- **CA3** Migration sobe e desce; `db:generate` = `no_changes`; linhas antigas continuam valendo.
- **CA4** Rotas validam, recusam campo desconhecido (400) e nunca aceitam `companyId` do corpo.
- **CA5** A tela cadastra, edita e remove; o print nos dois temas e em 375/768/1280 px é aprovado.
- **CA6** Mutação: tirar a expansão anual, contar sábado, ignorar a UF, duplicar o feriado em fim de semana
  — cada uma derruba um teste.

## Dúvidas

**[NEEDS CLARIFICATION: D1 — Carnaval e Corpus Christi]** Hoje o painel os trata como feriado. Por lei são
ponto facultativo. _Recomendo_ só contar quando a empresa os cadastrar (nacional = fixos + Sexta-feira
Santa). Confirma?

**[NEEDS CLARIFICATION: D2 — sábado é dia útil?]** _Recomendo não_ (segunda a sexta), configurável por
empresa. Para esse contratante, sábado conta?

**[NEEDS CLARIFICATION: D3 — de qual cidade é o feriado?]** _Recomendo a cidade do destinatário de cada
nota_ (o prazo é para entregar lá). Se o contrato do contratante conta pelo município **onde a carga é
recebida**, o calendário usado é o da cidade de recebimento.
