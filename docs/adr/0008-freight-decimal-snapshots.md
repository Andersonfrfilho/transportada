# ADR 0008 — Motor decimal e snapshots de cálculo de frete

Data: 2026-07-22
Status: Proposto

## Contexto

O MVP precisa calcular frete a partir de NF-e importadas antes da criação de
lotes e emissão de CT-e. A regra inicial é percentual sobre o valor total da
NF-e, mas esse percentual não pode ficar fixo no código e cada empresa precisa
configurar sua própria regra com vigência.

Valores monetários e percentuais impactam faturamento e documentos fiscais
futuros. Portanto, o cálculo precisa ser reproduzível mesmo depois de alterações
na configuração.

## Decisão

Implementaremos um módulo de frete separado de CT-e, fiscal provider e lote de
emissão.

A regra inicial suportada será `PERCENTAGE_OF_INVOICE_TOTAL`, com percentual,
valor mínimo e valor máximo opcionais. Regras terão versões imutáveis. Cada
cálculo persistido salvará snapshot completo da versão aplicada, incluindo base,
percentual, mínimo, máximo, ajustes, política de arredondamento e total.

Dinheiro será persistido como `numeric(19,4)` e trafegará em DTOs como string
decimal canônica. Percentual será persistido como decimal de precisão fixa,
inicialmente compatível com `numeric(9,6)`, e também trafegará como string. O
motor de cálculo não usará `number` binário para dinheiro ou percentual.

A seleção da regra vigente usará a data de emissão da NF-e, empresa, status
ativo, tipo, vigência, prioridade e desempate determinístico. Regras ativas de
mesma empresa, tipo e prioridade não poderão ter vigência sobreposta.

## Consequências

- Alterar uma regra futura não muda cálculos históricos.
- O cálculo fica testável sem HTTP, banco, SEFAZ, CT-e ou XML fiscal.
- O banco precisa de constraints tenant-scoped para versão, vigência,
  idempotência e relacionamento com NF-e.
- A próxima feature de lotes poderá reutilizar snapshots existentes ou criar
  novos snapshots de aprovação sem recalcular silenciosamente histórico.
- Regras mais avançadas por peso, volume, KM, região e cliente poderão entrar
  como novos tipos ou filtros sem quebrar snapshots percentuais atuais.

## Alternativas consideradas

### Usar `number` e arredondar no fim

Rejeitada. Ponto flutuante binário é inadequado para dinheiro e poderia gerar
centavos inconsistentes em faturamento, auditoria e emissão fiscal futura.

### Guardar apenas referência da regra

Rejeitada. Alterações posteriores na regra mudariam a interpretação de cálculos
históricos e tornariam auditoria/reprocessamento inseguros.

### Calcular somente dentro do lote CT-e

Rejeitada para o MVP atual. O usuário precisa simular e validar o frete antes de
aprovar lotes. O lote CT-e deve consumir uma capacidade já testada, não criar o
motor monetário junto com emissão fiscal.

## Gates

- Contract do motor decimal cobre percentual 3,5%, mínimo, máximo,
  arredondamento e entradas inválidas.
- Contract de schema cobre versões, vigência, sobreposição, idempotência e FKs
  compostas por empresa.
- Contract de aplicação prova que alteração posterior de regra não altera
  snapshot histórico.
- Revisão Sol é obrigatória antes de iniciar lote/CT-e.
