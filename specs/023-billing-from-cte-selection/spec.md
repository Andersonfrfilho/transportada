# Feature 023 — Faturar a partir da seleção de CT-es e refazer a tela de faturamento

## Problema e resultado

O operador trabalha na tela **CT-es da empresa**: é lá que ele acha o CT-e por número, filtra, ordena,
seleciona em massa e vê a soma da seleção. De lá ele já transmite e já exporta XML (feature 022). Mas
para faturar exatamente aqueles CT-es ele precisa sair, ir para **Faturamento** e reencontrar os mesmos
documentos numa tabela que não tem número de lote, não tem data de autorização, não tem documento do
tomador, não ordena, não pagina e cujos filtros de data são **campo de texto livre** — inclusive o
`batchId`, que só aceita UUID digitado à mão. A tela ainda tem uma caixa de texto pedindo o **UUID cru**
da fatura para consultar, cancelar e baixar documento, o que só funciona para quem acabou de criar a
fatura na mesma sessão.

O resultado é que a ação de faturar está longe de onde a decisão de faturar acontece, e a tela que
deveria receber essa decisão é a menos usável do produto — sendo que o padrão obrigatório de tabela
(`docs/frontend/data-tables.md`) já está implementado duas vezes no repositório (Notas e CT-es) e a
própria aba "Faturas geradas", ao lado, já o cumpre.

**Resultado esperado:** com CT-es autorizados selecionados, a barra de seleção oferece **Gerar fatura**;
um modal mostra o que será faturado agrupado por tomador, o que ficou de fora e por quê, pede o
vencimento e cria as faturas. E a tela `/billing` passa a ser irmã da tela de Notas: mesma anatomia de
tabela, mesmos controles recolhidos, mesmo seletor de período, com lote, autorização e documento do
tomador visíveis — sem nenhuma caixa de UUID.

## Fora de escopo

- Mudar a regra de **tomador único por fatura**, a numeração sequencial, o cálculo do total ou o
  cancelamento. Continuam exatamente como estão.
- Mudar o layout ou o conteúdo do PDF da fatura (feature 022, fase C).
- Faturar CT-e que não esteja `authorized`, faturar por lote inteiro sem passar pelos CT-es, ou faturar
  CT-e já vinculado a outra fatura.
- Campo `observations` da fatura — segue como follow-up de 022, não entra aqui.
- Boleto, baixa de pagamento, régua de inadimplência, NFS-e.
- Reescrever a tabela da aba "Faturas geradas": ela já cumpre o contrato; só recebe o painel de detalhe
  que herda da caixa de UUID removida.

## Decisões tomadas

| Questão                           | Decisão                                                                                                                          | Consequência                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde nasce a fatura               | Botão **Gerar fatura** na barra de seleção da tabela de CT-es, abrindo modal                                                     | Zero navegação para o caminho comum. A tela `/billing` continua existindo para quem quer garimpar elegíveis sem seleção prévia.                      |
| Seleção com tomadores diferentes  | O modal agrupa por `customerDocument`: N tomadores → N faturas, uma requisição por grupo, mesmo vencimento                       | `assertSingleCustomer` rejeita seleção mista em bloco. Agrupar é a única forma de honrar a regra sem mentir para o operador nem inventar regra nova. |
| Quem decide elegibilidade         | `POST /billing/invoices/preview` novo, espelhando o preview de emissão de CT-e                                                   | "Já faturado" só o banco sabe; o cliente nunca decide isso. O modal mostra a verdade do servidor antes de qualquer escrita.                          |
| O que o preview devolve           | Grupos por tomador (com soma decimal e ids) + bloqueados com motivo estável                                                      | Mesma anatomia do modal de emissão de CT-e, que o operador já conhece.                                                                               |
| Motivos de bloqueio               | `not_found`, `not_authorized`, `already_invoiced`, `missing_customer`                                                            | Códigos estáveis na API, texto no locale. Nada de mensagem montada no servidor.                                                                      |
| Qual identificador trafega        | `fiscalDocumentId` do item da tabela (é o `cteId` do faturamento)                                                                | Item sem documento fiscal nem chega à API: é bloqueado localmente como `not_authorized`.                                                             |
| Seleção que atravessa páginas     | O mapa acumulado por item passa a guardar `fiscalDocumentId` e `status`, além dos valores                                        | A soma da seleção já sobrevive à paginação; a ação de faturar passa a sobreviver também, sem refetch.                                                |
| Falha no meio de N grupos         | Uma requisição por grupo, com `Idempotency-Key` própria; o modal reporta resultado por grupo                                     | Tomador com problema não derruba os outros. Repetir o confirmar não duplica fatura.                                                                  |
| Tabela de elegíveis de `/billing` | Refeita no contrato de `docs/frontend/data-tables.md`, espelhando a tabela **Notas**                                             | É regra do repositório e é o pedido do usuário. A aba vizinha já é a prova de que o padrão cabe no módulo.                                           |
| Colunas da tabela de elegíveis    | CT-e · tomador · documento do tomador · lote · autorização · valor                                                               | A API já devolve `batchId`, `customerDocument` e `issuedAt` — a tela jogava fora.                                                                    |
| Filtro de período                 | `DateRangePicker` do design system, o mesmo da tela de Notas                                                                     | Acaba o par de `input type=text` para data.                                                                                                          |
| Filtros que faltam na API         | `GET /billing/eligible-ctes` ganha `cteNumberIn`, `batchIdIn` e `customerName` (contém)                                          | Permite "Cliente ▾" e "Lote ▾" como filtro de verdade em vez de UUID digitado. `In` e o campo exato do mesmo domínio juntos = `400`.                 |
| Ordenação                         | Ordena a página carregada, no cliente, como a tabela de CT-es faz hoje                                                           | O endpoint pagina por cursor sobre keyset fixo; ordenar no servidor exigiria trocar o cursor, o que está fora do escopo. Registrado como limitação.  |
| Consulta de fatura por UUID       | Sai da tela. A aba "Faturas geradas" ganha painel de detalhe ao selecionar a linha (dados, documentos e cancelamento com motivo) | Remover a caixa não pode remover o cancelamento; ele muda de lugar, não desaparece.                                                                  |
| Chave de preferência de colunas   | `billing.eligible.columns.v1`                                                                                                    | Versionada, como as outras duas tabelas.                                                                                                             |

## Critérios de aceite

**Faturar a partir da seleção de CT-es**

- Com CT-es selecionados e permissão `billing.create`, a barra de seleção mostra **Gerar fatura** com a
  contagem de CT-es faturáveis; sem permissão, a ação não aparece.
- CT-e selecionado sem documento fiscal ou com status diferente de `authorized` é bloqueado antes da
  chamada, com motivo visível no modal.
- O modal lista um bloco por tomador com quantidade e soma decimal, e um bloco de bloqueados agrupado por
  motivo; pede o vencimento e só habilita confirmar com vencimento preenchido e ao menos um grupo.
- Confirmar cria uma fatura por tomador, cada uma com sua chave de idempotência; o modal mostra o
  resultado por grupo e o erro por código quando um grupo falha, sem desfazer os que deram certo.
- Depois de confirmar, a listagem de CT-es e a de faturas são invalidadas — CT-e faturado não volta a
  aparecer como elegível.

**Tela de faturamento**

- A aba "Gerar fatura" tem tabela com as seis colunas acima, cabeçalho ordenável com indicador de
  direção, zebra, checkbox por linha e "selecionar todas", contador de resultados e paginação por cursor
  com volta.
- Filtros e organização de colunas ficam em controles recolhidos com `aria-expanded` e pastilha de
  contagem; período usa o seletor de datas do design system; existe modo avançado com grupos E/OU
  aninhados e botão de limpar tudo que só aparece quando há algo aplicado.
- Ordem e visibilidade de colunas persistem em `localStorage` sob `billing.eligible.columns.v1` e
  sobrevivem a valor corrompido ou `localStorage` indisponível.
- A soma da seleção usa `sumScaledAmounts` e não zera ao paginar.
- Nenhum `<select>` nativo, nenhum texto fora do locale, nenhum hex/px mágico; o container respeita
  `--layout-width` e os campos respeitam os tokens de altura/padding.
- A caixa de UUID da fatura não existe mais; selecionar uma linha na aba "Faturas geradas" abre o painel
  com dados da fatura, documentos e cancelamento com motivo (mínimo 3 caracteres, exige `billing.cancel`).

**API**

- `POST /billing/invoices/preview` aceita de 1 a 100 ids, rejeita lista vazia, id repetido e id fora do
  formato com `400`; exige `billing.create`; id de outra empresa volta como bloqueado `not_found`, nunca
  como grupo.
- `GET /billing/eligible-ctes` aceita `cteNumberIn`, `batchIdIn` e `customerName`, rejeita chave fora da
  allowlist, chave repetida, lista vazia, lista acima do teto e `In` combinado com o campo exato do mesmo
  domínio.

**Transversais**

- Toda query nova ou alterada recebe `companyId` do contexto autenticado e tem teste de isolamento de
  tenant em `test/*-schema/tenant-safety.contract.ts`.
- Dinheiro em `Decimal`/`numeric` e em string decimal no cliente, somado com `BigInt`.
- Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em teste,
  fixture, log ou evidência.
