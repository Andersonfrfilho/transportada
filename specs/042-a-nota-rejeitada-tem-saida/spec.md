# Feature 042 — A nota rejeitada tem saída

> Nasce de um caso real em produção, em 17/08/2026: o operador selecionou 16 notas de Ribeirão Preto,
> emitiu, a prefeitura rejeitou — e as mesmas 16 notas **nunca mais** puderam ser selecionadas. Elas
> continuam aparecendo na listagem, o que faz o defeito parecer intermitente: a tela mostra, a
> seleção recusa.

## Problema

Uma NFS-e rejeitada é um documento que **nunca existiu fiscalmente** — a prefeitura recusou o pedido.
Mas o código a trata como se ela tivesse existência: os vínculos com as notas de origem ficam de pé
para sempre, e nenhuma ação as solta.

A cadeia, medida em produção (fatura `111e44f5…75cd`, `total=16 canceladas=0`):

1. **O vínculo não é solto na rejeição.** `nfse_service_invoice_documents.cancelled_at` continua nulo.
2. **A seleção bloqueia por vínculo, sem olhar o status da fatura.** `buildActiveInvoiceLinkFilters`
   filtra só `isNull(cancelledAt)`; as 16 caem em `NFSE_DOCUMENT_ALREADY_LINKED`. A listagem não usa
   esse filtro — por isso elas aparecem na tela.
3. **Cancelar é proibido.** `nfse-invoice-state.policy.ts:52` dá `notAuthorized` para `rejected`, e com
   razão: não se cancela o que não foi autorizado. Só que o cancelamento era o único caminho que
   soltava vínculo.
4. **Reemitir não existe.** A política já prevê `rejected → issuing` (`nfse-invoice-state.policy.ts:36`)
   e o write-back do worker já aceita `inFlight` vindo de `rejected` e de `failed`
   (`nfse-write-back.policy.ts:43`). Mas `checkNfseInvoiceTransition` só é chamado pelo caso de uso de
   cancelamento — **a tabela de `issue` não tem consumidor**. É desenho escrito e nunca ligado.
5. **Reenviar a mensagem também não resolve.** `isSettledNfseIssuanceStatus` trata `rejected` como
   liquidada, e o consumidor recusa a reentrega.

E o banco fecha a última porta: existe índice parcial único

```sql
nfse_service_invoice_documents_active_nfe_unique
  on (company_id, nfe_document_id) where cancelled_at is null
```

então **corrigir só o filtro de leitura não bastaria** — o `INSERT` da fatura nova estouraria o índice.
A liberação tem de ser escrita, não filtrada.

**O dano passa da NFS-e.** `buildActiveNfseLinkFilters` (lado do CT-e,
`cte-batches/infrastructure/cte-batch-selection.query.ts:100`) tem exatamente a mesma forma. As 16
notas também não entram em lote de CT-e. Estão fora dos dois caminhos, sem ação de operador que as
devolva.

`failed` — tentativas esgotadas — tem o mesmo destino pelo mesmo motivo: terminal, sem existência
fiscal, e prendendo as notas.

## Objetivo

Dar duas saídas explícitas ao operador diante de uma nota `rejected` ou `failed`, como **dois botões**
na tela, porque as duas resolvem casos diferentes:

- **Reemitir** — a seleção está certa e quem falhou foi outra coisa (código nosso, indisponibilidade
  da prefeitura, um campo fiscal que a prefeitura recusou). Abre nova tentativa e mantém os vínculos,
  reaproveitando o payload congelado — com a opção de **corrigir os campos fiscais antes de enviar**.
- **Descartar** — o payload é que está errado, ou o operador quer refazer a seleção. Solta os
  vínculos, devolve as notas para a seleção de NFS-e **e** de CT-e, e encerra a fatura.

O operador escolhe. Nada acontece sozinho na rejeição: liberar vínculo automaticamente tiraria a
opção de reemitir — outra fatura poderia tomar as notas no intervalo.

## Decisões de desenho

**Um status novo, `discarded`.** Não dá para reusar `cancelled`: cancelada é a nota que a prefeitura
autorizou e depois cancelou, e ela tem existência fiscal e documento arquivado. Descartada é a que
nunca existiu. Confundir as duas apagaria a diferença no relatório e no write-back.

**As duas ações são escrita da API, não do worker.** O descarte reusa o seam que o cancelamento já
usa (`buildInvoiceLinkReleaseFilters` + `releaseInvoiceDocuments`, `drizzle-nfse-invoice.repository.ts:543`);
a reemissão reusa a máquina de tentativa + outbox que a criação já monta. Consequência boa: **o worker
não ganha uma nona cópia de schema** — ele não precisa enxergar `nfse_service_invoice_documents`.

**Os filtros de seleção não mudam.** Descartar carimba `cancelled_at`, e é exatamente isso que
`buildActiveInvoiceLinkFilters` e `buildActiveNfseLinkFilters` já leem. Zero mudança de query, zero
risco de regressão de isolamento multiempresa.

**As 16 notas presas hoje não precisam de migration de dados.** Com o botão Descartar no ar, o
operador clica e elas voltam. Correção de dado por ação de produto é auditável por natureza — tem
ator, alvo e trilha; `UPDATE` manual em produção não tem nada disso.

## Reemitir com correção

Rejeição de prefeitura quase sempre aponta um **campo fiscal**, não a seleção — o caso que originou
esta feature foi `Por favor informe o campo "Exigibilidade ISS"`. Obrigar o operador a descartar e
refazer a seleção de 16 notas para trocar um código é castigo desproporcional ao erro.

O payload congelado tem duas origens, e elas têm riscos opostos:

| Campo                         | Origem                                           | Editável | Por quê                                                                            |
| ----------------------------- | ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------- |
| `description` (discriminação) | texto composto na emissão                        | ✅       | texto livre; é onde o `{{periodo}}` já entrou                                      |
| `cnaeCode`                    | perfil de emissão                                | ✅       | configuração fiscal                                                                |
| `serviceListItem`             | perfil                                           | ✅       | configuração fiscal                                                                |
| `municipalTaxationCode`       | perfil                                           | ✅       | configuração fiscal                                                                |
| `nbsCode`                     | perfil                                           | ✅       | configuração fiscal                                                                |
| `municipalityIbgeCode`        | perfil                                           | ✅       | configuração fiscal                                                                |
| `issExigibility`              | perfil                                           | ✅       | **foi esta que a prefeitura recusou em 17/08**                                     |
| `issWithheld`                 | perfil                                           | ✅       | configuração fiscal                                                                |
| `issRate`                     | perfil, via projeção                             | ✅       | alíquota errada é recusa comum — mas **`issAmount` é recalculado**, nunca digitado |
| `serviceAmount`               | `composeCharge` sobre as notas × regra congelada | ❌       | digitar faria a nota afirmar valor que não bate com as notas que ela diz cobrir    |
| `issAmount`                   | `serviceAmount × issRate`                        | ❌       | derivado; muda só por consequência da alíquota                                     |
| `taker`                       | papel do perfil aplicado às notas                | ❌       | trocar o tomador é emitir para outra pessoa, não corrigir                          |
| `documents[]`                 | a seleção                                        | ❌       | outra seleção é outra nota — o caminho é Descartar                                 |

**A correção mora no payload da tentativa, não no perfil e não em coluna nova.**
`nfse_issuance_payloads` tem `unique (company_id, attempt_id)` — uma linha por tentativa. A tentativa
nova nasce com `payload anterior + correção` e `payload_sha256` novo. Consequência: **a edição não
precisa de migration nenhuma**, e comparar as duas linhas mostra exatamente o que mudou.

**Duas escritas voltam para a fatura**, porque a tela não pode discordar do que foi transmitido:
`description`, e `iss_amount` quando a alíquota mudou. Nada mais.

**A correção não altera o perfil de emissão.** Ela vale para aquela emissão. Se o erro é de cadastro,
o operador corrige o perfil depois — mas a nota em curso não pode ficar esperando por outra tela.

## Comportamento esperado

| Status da fatura         | Reemitir               | Descartar                               |
| ------------------------ | ---------------------- | --------------------------------------- |
| `requested`              | ❌ em voo              | ❌ em voo                               |
| `issuing`                | ❌ em voo              | ❌ em voo                               |
| `pending_authorization`  | ❌ aguarda prefeitura  | ❌ aguarda prefeitura                   |
| `authorized`             | ❌ já autorizada       | ❌ já autorizada (o caminho é cancelar) |
| `cancellation_requested` | ❌ cancelamento em voo | ❌ cancelamento em voo                  |
| `cancelled`              | ❌ encerrada           | ❌ encerrada                            |
| **`rejected`**           | ✅ → `issuing`         | ✅ → `discarded`                        |
| **`failed`**             | ✅ → `issuing`         | ✅ → `discarded`                        |
| `discarded`              | ❌ encerrada           | ❌ encerrada                            |

Depois do descarte, as notas de origem voltam a ser selecionáveis **nos dois caminhos** — nova NFS-e e
lote de CT-e.

## Fora do escopo

- Liberar vínculo automaticamente na rejeição. Foi considerado e recusado: tiraria a reemissão.
- Reemitir mudando valor do serviço, valor do ISS, tomador ou seleção de notas. Esses quatro são
  **derivados** da seleção — editá-los à mão quebraria a correspondência entre a NFS-e e as notas que
  ela declara cobrir. Para mudar qualquer um deles o caminho é Descartar e emitir de novo.
- Corrigir o perfil de emissão pela tela de reemissão. A correção vale para aquela nota; o cadastro se
  arruma na tela de perfis.
- Retentativa automática de rejeição. Rejeição é resposta da prefeitura, não falha de transporte;
  repetir o mesmo payload repetiria a mesma recusa.
- Mudar `NFSE_TRANSITION_BLOCK.notAuthorized` no cancelamento. Continua certo.

## Critérios de aceite

1. `POST /nfse-service-invoices/{id}/reissue` **sem corpo** sobre fatura `rejected` ou `failed` responde
   `202`, leva a fatura para `issuing`, cria tentativa nova com `attempt_number` incrementado e payload
   copiado da anterior, e grava linha de outbox.
2. A mesma rota sobre qualquer outro status responde erro de transição, com o código da política.
3. A mesma rota **com corpo de correção** grava o payload da tentativa nova com os campos corrigidos e
   `payload_sha256` diferente do anterior; a linha de payload da tentativa anterior fica intacta.
4. O corpo é `strict()`: mandar `serviceAmount`, `issAmount`, `taker` ou `documents` responde `400`.
5. Corrigir `issRate` recalcula `issAmount` como `serviceAmount × issRate` no payload **e** na fatura;
   corrigir `description` reescreve a `description` da fatura. Nenhum outro campo da fatura muda.
6. `POST /nfse-service-invoices/{id}/discard` sobre fatura `rejected` ou `failed` responde `202`, leva a
   fatura para `discarded` e carimba `cancelled_at` em **todos** os vínculos dela, na mesma transação.
7. Depois do descarte, as mesmas notas passam na seleção de NFS-e (sem `NFSE_DOCUMENT_ALREADY_LINKED`)
   e na seleção de lote de CT-e.
8. Nenhuma das duas rotas atravessa empresa: contrato de isolamento cobre as duas.
9. O write-back do worker recusa qualquer transição que caia sobre `discarded`.
10. A tela da fatura mostra **Reemitir** e **Descartar** apenas quando o status permite, cada um com
    ícone do design system; o descarte pede confirmação por ser irreversível, e a reemissão abre um
    formulário com os campos corrigíveis já preenchidos com o que foi transmitido — os derivados
    aparecem, somente-leitura, para o operador conferir o que **não** vai mudar.
