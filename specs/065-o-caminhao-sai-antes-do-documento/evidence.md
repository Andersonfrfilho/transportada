# 065 — O caminhão sai antes do documento · evidência

> ⚠️ **Parcial.** O caminho do barracão até o manifesto automático está inteiro e verificado. Faltam
> três coisas, e a primeira é a que o motorista sente: **o DAMDFE não chega até ele**. O que falta
> está no fim, e é a primeira coisa a ler.

## Os dois defeitos que esta spec conserta, e como eles se somavam

A operação real solta o caminhão **antes** de qualquer emissão. Contra isso, o código entregue pela
059 tinha dois buracos que sozinhos pareciam detalhe e juntos travavam a viagem de todo dia:

1. **O portão exigia `dispatched` exato.** A viagem que autoriza o lote já saiu — está `in_transit`
   ou `completed`. O caso mais comum desta transportadora era justamente o recusado.
2. **A prontidão só sabia de CT-e.** Entrega dentro de Ribeirão vira NFS-e e **nunca** terá CT-e:
   ela ficava `no_cte` para sempre. Como a carga mista é a carga normal, uma nota urbana travava a
   viagem inteira — para sempre, sem ninguém entender por quê.

Os dois foram fechados com contrato próprio, e a classificação (`resolveFiscalDocumentKind`) nasceu
com o município de **origem** lido e comparável: trocar a regra pela do par origem→destino, que é a
fiscalmente completa, é uma condição, não uma refatoração.

## O que rodou

| Comando                                                | Resultado                    |
| ------------------------------------------------------ | ---------------------------- |
| `make migration-test`                                  | **86** testes, 0 falhas      |
| `bun run --cwd apps/api-transportada test`             | **3342** contratos, 0 falhas |
| `bun run --cwd apps/api-transportada test:integration` | **152** contra Postgres      |
| `bun run --cwd apps/worker-transportada test`          | **736** contratos, 0 falhas  |
| `make worker-integration`                              | **57** testes, 0 falhas      |
| `bun run --cwd apps/frontend-transportada test`        | **2058** contratos, 0 falhas |
| `typecheck` + `lint` nas quatro apps                   | limpos                       |

## O que cada verificação provou

| Decisão                                              | Como ela está travada                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| O portão aceita a viagem que já saiu                 | contrato por estado: `dispatched`, `in_transit` e `completed` passam; `draft` e `separating` continuam recusados      |
| A nota urbana não trava a viagem                     | prontidão com carga mista: as de CT-e contam, a de NFS-e vira pendência própria e a viagem fica `ready`               |
| Viagem só urbana não pede manifesto                  | `not_applicable` — o botão não aparece, em vez de "incompleta" para sempre                                            |
| Sem município não se chuta o documento               | `city_unknown` **bloqueia**: a nota indecisa pode ser CT-e, e manifestar sem ela seria declarar o que não se sabe     |
| A empresa do serviço não vem de graça                | o cabeçalho só vale para service account, e ainda passa pela membership real; para token de gente ele é **ignorado**  |
| Escopo do crachá é uma rota                          | `mdfe.auto-issue` não é dada a nenhum papel humano, e o contrato do seed local prova isso                             |
| Não se convida um robô                               | `automation` fica fora do CHECK de convite, e a rejeição do contrato de schema foi o que revelou a falta              |
| O gatilho não emite CT-e duas vezes                  | a falha do gatilho **não** volta para a fila: reentregar a mensagem reemitiria o documento fiscal já pago             |
| O segredo não vaza pelo erro                         | a recusa do provedor de identidade sai como código e status, sem corpo — contrato que procura o segredo na mensagem   |

## Uma coisa que a implementação decidiu diferente da spec

O **requisito 6c** pede "romaneio em PDF". O que entrou é **impressão do navegador** com folha de
estilo própria: o título e o "NÃO É DOCUMENTO FISCAL" acima de tudo, o resto da tela escondido, e a
placa só no papel. Gerar PDF no cliente exigiria embarcar um renderizador para um documento que
**não é fiscal** e cuja única finalidade é sair na impressora do barracão. Quem precisar de arquivo
usa "salvar como PDF" do próprio diálogo de impressão. Se o requisito for arquivo anexável por
e-mail, isso é trabalho novo, e é honesto chamá-lo assim.

## O que ficou de fora

1. **O DAMDFE não chega ao motorista (T016, requisito 9).** Quando o manifesto autoriza, o romaneio
   continua sendo o que ele tem na mão. Numa barreira, o romaneio **não vale**: ele diz, com todas
   as letras, que não é documento fiscal. Este é o buraco que custa multa, e é o primeiro a fechar.
2. **Nenhuma notificação (T017, requisito 11).** "Ficou pronta", "emitido" e sobretudo "não consegui
   emitir, e o motivo" não saem. O automático que **recusa** hoje só deixa rastro em log: quem opera
   descobre abrindo a viagem.
3. **Sem E2E da carga mista (T018).** Cada pedaço tem contrato e integração; a costura do barracão
   ao manifesto autorizado não foi exercitada de ponta a ponta.
4. **O evento `cte.authorized.v1` não existe.** A 059 previa evento e consumer; o que entrou é uma
   **chamada direta** do efeito de emissão para a API, decidida na ADR-0047. É mais simples e está
   testada, mas não tem a retentativa que uma fila daria — e por desenho não pode ter, porque
   reentregar a mensagem de emissão reemitiria o CT-e.
5. **A membership sintética do serviço é provisionada à mão** em instalação real. Localmente ela
   nasce no seed; numa transportadora, alguém precisa criá-la por empresa — e é exatamente essa
   lista que limita o estrago de um segredo vazado (ADR-0047 §3).

## Auditoria de segurança (§15 do `code-standart.md`)

- O token do serviço é **cross-tenant** — é o preço escrito na ADR-0047, mitigado por escopo de uma
  rota, membership por empresa e segredo rotacionável.
- Nenhum segredo em log: o erro do token carrega status, nunca corpo.
- Nenhuma chave de acesso nem CNPJ de participante em log no caminho novo.
- O cabeçalho de empresa fora de forma é `403`, não `500` — texto que não é UUID nunca chega ao
  `where` do Postgres.
