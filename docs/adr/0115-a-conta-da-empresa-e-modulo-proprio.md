# ADR-0115 — A conta da empresa é módulo próprio, separado do lançamento da viagem

- **Status:** aceito (Anderson aprovou a spec 325 e os previews em 2026-11-13: "certo pode criar"; pediu no mesmo dia
  que o módulo registre também os pagamentos de motoristas e agregados, ligados às viagens realizadas)
- **Data:** 2026-11-13
- **Contexto:** spec 325 (`specs/325-contas-fixas-e-variaveis/`), task T0.2.
- **Relaciona:** [ADR-0049](0049-a-viagem-fecha-a-conta.md) (a viagem fecha a conta, specs 061/169) e
  [ADR-0066](0066-a-diaria-paga-o-motorista-e-a-zona-fica-de-arquivo.md) (diária × dias, spec 143). Não emenda nenhuma.

## Contexto

O sistema já tem dois lugares onde dinheiro sai da empresa:

- o **lançamento da viagem** (061/169): gasto ou receita avulso preso a uma viagem, com espécie de cadastro
  (`company_entry_kinds`), que entra no resultado da viagem e no lucro por nota (232/259);
- a **parcela do motorista** da viagem (143): `trip_financial_parcels` com `kind = 'driver'`, calculada como diária × dias.

Aluguel, contador, seguro, folha, pneu ou multa não pertencem a viagem nenhuma, e o pagamento do motorista ou do
agregado é feito por período (quinzena ou mês), juntando várias viagens. Nenhum dos dois cabe no lançamento de viagem
sem distorcer o resultado dela. A pergunta desta ADR: a conta da empresa estende o lançamento de viagem (viagem
opcional) ou vira módulo próprio?

## Decisão

### 1. Módulo próprio: Contas (`expenses`)

A conta da empresa é um módulo à parte na API e no painel, com tabelas próprias (`company_expenses`,
`company_expense_categories`, `company_expense_occurrences`), permissões próprias (`expenses.read`, `expenses.manage`)
e item próprio no menu. Ele **não** reaproveita `company_entry_kinds` nem as tabelas de lançamento da viagem, e o
lançamento de viagem não ganha "viagem opcional".

Motivo: o lançamento de viagem é parcela do resultado da viagem (0049). Se ele aceitasse linha sem viagem, toda consulta
de resultado e de lucro por nota teria que lembrar de filtrar essas linhas, para sempre, e um filtro esquecido muda o
lucro de todas as viagens. Separar em tabela própria torna esse erro impossível em vez de improvável.

### 2. A conta tem ocorrências; o que se paga é a ocorrência

Conta (`fixed` ou `variable`) é o cadastro; a ocorrência é o que vence numa competência, com estado `open`, `paid` ou
`canceled` e baixa manual. A fixa gera ocorrências por rotina idempotente no `cron-transportada` (única por conta e
competência); a variável tem exatamente uma. Ocorrência paga é imutável, e mudar a conta vale dali para frente.

### 3. Pagamento de motorista e agregado é uma conta como as outras

O pagamento de motorista ou agregado (pedido do Anderson) entra na **mesma** lista, com a **mesma** baixa: conta da
categoria semeada "Pagamento de motorista/agregado", com `payee_driver_id` apontando para `fleet_drivers` da mesma
empresa. Não existe tabela nem tela separada de "folha do motorista". O rótulo "Motorista" ou "Agregado" é lido de
`payment_model` na hora, nunca copiado para a conta.

### 4. A viagem é lida, nunca somada de novo

A ocorrência de pagamento pode incluir as viagens realizadas do motorista no período
(`company_expense_occurrence_trips`, `unique(trip_id)`: uma viagem é paga uma vez só). O valor de cada viagem é **lido**
da parcela `driver` já calculada pela 143 e guardado como cópia no momento da inclusão, para o pagamento não mudar se a
viagem for recalculada depois.

O módulo Contas **não escreve** em nada da viagem e não entra em nenhum total de custo de viagem. O custo do motorista
continua contado uma vez, no resultado da viagem (0049); a conta só registra **quando e quanto** a empresa pagou.
Somar as duas coisas num mesmo total (um DRE, por exemplo) contaria o motorista em dobro, e fica para spec própria, que
terá de escolher um dos lados.

### 5. Conta com histórico não é apagada

Como as espécies da 169, conta com ocorrência é desativada, não apagada; ocorrência aberta é cancelada com motivo.
Criação, edição, baixa, cancelamento e inclusão ou remoção de viagem no pagamento entram na trilha de operações (010).

## Consequências

- Duas visões de saída de dinheiro convivem: resultado da viagem (custo por competência da viagem) e Contas (o que a
  empresa deve e pagou). Elas respondem perguntas diferentes e não devem ser somadas.
- O resultado da viagem, o lucro por nota (232/259) e o faturamento (009) não mudam em nada.
- Rateio de conta fixa por viagem ou veículo e o DRE ficam fora até haver dado; quando vierem, partem desta separação.
- Um gasto que é da viagem (pedágio, diária extra de ajudante) continua sendo lançado na viagem, não em Contas.

## Alternativas descartadas

| Alternativa                                          | Por que não                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Lançamento de viagem com viagem opcional             | Mistura despesa da empresa no resultado da viagem; todo relatório de lucro precisaria filtrar (item 1)   |
| Reusar `company_entry_kinds` como categoria de conta | A espécie é do lançamento de viagem e tem lado receita; categoria de conta tem outra semântica e semente |
| Tela e tabela separadas para pagamento de motorista  | Duplica baixa, lista e totais; o operador quer ver tudo que vence num lugar só (item 3)                  |
| Ler o valor da viagem ao vivo, sem cópia             | Pagamento já feito mudaria se a viagem fosse recalculada depois                                          |
| Somar o pagamento do motorista ao custo da viagem    | Conta o motorista duas vezes; o custo já está na parcela `driver` da 143                                 |
