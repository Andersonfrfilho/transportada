# 061 — a viagem fecha a conta · evidência

> As dez tasks estão fechadas. **Duas coisas que a spec pede não entraram**, e são a primeira coisa a
> ler: a margem por **contratante** (D5) e o **painel por cliente** que dependia dela. O que falta e
> por quê está no fim.

## O que ficou de pé

| Task | O que entrou                                                                     |
| ---- | ---------------------------------------------------------------------------------- |
| T001 | ADR-0049, e as três cláusulas em aberto respondidas                              |
| T002 | resultado congelado, parcelas, custo avulso, modelo de pagamento, regime federal |
| T003 | o custo do motorista — tabela de região por classe, e o fixo que é do período    |
| T004 | o imposto que desce da receita: ICMS do payload, federais da configuração        |
| T005 | o congelamento, e o recálculo com motivo e versão                                |
| T006 | rotas do resultado, do recálculo e do custo avulso                               |
| T007 | o acumulado por período, veículo e motorista, com a folha do período             |
| T008 | o painel da conta na viagem                                                      |
| T009 | o workspace de resultados                                                        |
| T010 | o ciclo inteiro contra Postgres                                                  |

## O que rodou

| Comando                                                | Resultado                      |
| ------------------------------------------------------ | ------------------------------ |
| `make migration-test`                                  | **86** testes, 0 falhas        |
| `bun run --cwd apps/api-transportada test`             | **3507** contratos, 0 falhas   |
| `bun run --cwd apps/api-transportada test:integration` | **167** testes contra Postgres |
| `bun run --cwd apps/frontend-transportada test`        | **2066** contratos, 0 falhas   |
| `typecheck` + `lint` + `format:check` + `build`        | limpos                         |

## Como cada decisão está travada

| Decisão                                       | Como ela está travada                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Receita é o CT-e autorizado                   | o E2E monta CT-e autorizado com encargos e confere 2.000,00 medidos, sem previsão no meio            |
| O agregado sai da tabela de região            | contrato do custo de motorista **e** o E2E, que cruza zona com a classe do veículo (spec 038)        |
| Salário não é rateado por viagem              | contrato: tripulação assalariada sai `period` com zero; mista soma o agregado e marca a lacuna       |
| ICMS vem do payload congelado                 | E2E lê `payload -> icms ->> vICMS`; CST isento vira zero **medido** pelo `coalesce`                  |
| PIS/COFINS sem regime é desconhecido          | contrato próprio, e o E2E declara o regime para exercitar o outro lado (2.000 × 3,65% = 73,00)       |
| O congelado não muda com o cadastro           | o E2E sobe o diesel 50% **depois** e confere que o resultado não se mexe                             |
| Recalcular exige motivo, e a versão fica       | CHECK no banco, contrato no caso de uso, e o E2E gerando a versão 2 com custo diferente              |
| Uma versão viva por viagem                     | índice parcial, e o acumulado conta a viagem **uma vez** no E2E                                      |
| A folha desce do total, uma vez                | contrato do acumulado: ela não entra nos grupos, e quinzena conta dois fechamentos por mês           |
| Só admin e finance veem margem                | contrato nomeando os **seis** papéis que recebem recusa, `operator` incluído                         |

## Dois defeitos que os testes acharam

1. **O ICMS voltava vazio.** A subconsulta correlacionada não resolvia, e a parcela ficava `missing`
   em toda viagem — a margem sairia sem o maior imposto do frete. Virou consulta própria com mapa por
   nota, o mesmo padrão dos volumes e do manifesto na viagem do motorista.
2. **`operator` tinha `trip.financials`.** Não era defeito de código, e sim uma decisão anterior que
   o dono do produto reverteu nesta spec: quem monta viagem passou a não ver mais margem nem o que se
   paga ao agregado. A remoção quebrou dois contratos, que é exatamente o que eles existem para fazer.

## O que ficou de fora

1. **Margem por contratante (D5) não existe.** Agrupar por contratante exige atribuir receita por
   **documento** — cada nota tem um emitente —, e o resultado congelado guarda só os totais da viagem.
   Fazê-lo pediria uma tabela de linhas por documento no congelado, que é migration nova e decisão de
   modelo. Período, veículo e motorista entregam o que decide o dia a dia; o contratante fica
   registrado aqui como o próximo passo, com o motivo.
2. **O painel por cliente (P3) não existe** — ele dependia da atribuição acima e do tempo medido de
   atendimento, que é a D6 da 060 e continua sendo consulta, não tela.
3. **A exportação do acumulado não existe.** A tela mostra e soma; baixar CSV/PDF ficou de fora.
4. **O congelamento não é automático.** Ele acontece pela rota de recálculo, não na transição a
   `completed` — e isso é **desvio declarado do RF-2**, não esquecimento: a conta lê uma dúzia de
   tabelas, e prendê-la na transação de escrita da entrega seguraria o pedido do motorista em 3G. O
   gancho na transição entra quando houver fila para ele (o mesmo trilho da sugestão de taxa da 060).
5. **O lançamento de pedágio não tem tela.** A rota existe (`POST /trips/:id/costs`, `trip.manage`) e
   o E2E a exercita; o botão na viagem ficou para quando alguém pedir.
6. **`assumptions` é gravado vazio pela rota de recálculo.** O campo existe, o congelamento aceita o
   que recebe, e o E2E grava premissa de verdade — mas a rota ainda não monta o objeto com preço de
   combustível, distância e alíquotas. Sem isso o congelado é auditável no número, não na premissa.

## Auditoria de segurança (§15 do `code-standart.md`)

- Valor pago a motorista nunca em log, e nunca em payload que o papel `driver` alcança: a rota de
  resultado recusa `driver`, `aggregate`, `separator`, `operator` e `fiscal`, com teste nominal.
- Toda alteração de resultado congelado guarda ator, motivo e versão — e a versão anterior fica.
- Nenhuma soma de dinheiro em ponto flutuante em nenhum ponto do caminho: `numeric(19,4)` no banco,
  inteiro escalado no domínio, texto na tela.
- Filtro de tenant exercitado contra Postgres nas consultas novas.
