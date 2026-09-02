# Feature 078 — O deploy parte a tela ao meio

## Problema e resultado

Em 2026-09-02, staging ficou com **API nova e frontend velho**, e o detalhe da viagem parou de
abrir: _"Não foi possível carregar as viagens"_. Nenhum erro no servidor, nenhum 500, nenhum log.
A API respondia `200` com o corpo certo.

A cadeia, medida:

1. O deploy que trazia o código do frontend **falhou no gate** (um smoke quebrado), e os jobs
   `deploy-*` foram pulados — comportamento correto de um gate.
2. O commit seguinte, com o corretivo, passou verde — mas tocava só `test/` e `specs/`, e o filtro
   de caminho do workflow **pulou `deploy-frontend`**.
3. Resultado: `deploy-api` correu num run, `deploy-frontend` em nenhum. As duas apps ficaram em
   versões diferentes.

E aí o detalhe que transforma inconsistência em **queda**: o cliente valida o corpo com
`hasExactKeys`. Campo novo que a API passou a devolver e o frontend antigo não conhece **reprova a
validação inteira** — não é um campo ignorado, é a tela sem dado nenhum.

Ao fim desta feature, uma das duas coisas é verdade — e a spec escolhe qual: ou as duas apps sobem
juntas, ou o cliente tolera o campo que não conhece.

## As duas saídas, e por que a escolha não é óbvia

**Deploy atômico.** `deploy-frontend` e `deploy-api` sobem sempre juntos quando o commit toca
qualquer um dos dois — ou nenhum sobe. Conserta a causa, custa tempo de pipeline em commit que só
mexe em documentação, e **não protege** contra rollback parcial nem contra o intervalo em que uma
app já subiu e a outra não.

**Cliente tolerante.** O guard aceita chave desconhecida e valida só o que conhece. Conserta a
consequência, e sobrevive a qualquer descompasso — inclusive ao rollback. ⚠️ Mas `hasExactKeys`
**existe de propósito**: ele pega campo renomeado, campo que sumiu do contrato e resposta de rota
errada. Afrouxá-lo troca uma classe de defeito por outra.

⚠️ **A spec precisa decidir, não fazer as duas por precaução.** Fazer as duas dá a sensação de
segurança e esconde qual delas está sustentando o sistema no dia em que uma falhar.

## Fora do escopo

- **Versionar a API** (`/v2`). Resolve de verdade e é ordem de grandeza maior; o produto tem uma
  instalação por transportadora e as duas apps sobem do mesmo commit.
- **Feature flag por campo.** Mesma objeção, mais encanamento.
- **O smoke que falhou.** Ele fez o trabalho dele — pegou uma regressão real. A spec não mexe nele.

## Histórias priorizadas

### P1 — O descompasso não derruba a tela

**Given** API e frontend em versões diferentes
**When** o corpo traz campo que o cliente não conhece
**Then** a tela carrega com o que ela conhece, e o campo desconhecido é ignorado — ou o descompasso
não acontece, conforme a decisão da spec.

### P2 — O contrato continua pegando o que ele pegava

**Given** um campo que **sumiu** do corpo, ou foi renomeado
**When** o cliente valida
**Then** ele reprova — a proteção que `hasExactKeys` dá não pode ser perdida na troca.

### P3 — O descompasso é visível

**Given** frontend e API de versões diferentes no ar
**When** alguém olha
**Then** dá para saber, sem abrir o bundle e procurar uma string — que foi como este defeito acabou
sendo diagnosticado.

## Requisitos funcionais

- **RF1** — A decisão entre as duas saídas é tomada por escrito, com o motivo, antes do código.
- **RF2** — Se for tolerância: chave desconhecida é ignorada; chave **ausente** ou de tipo errado
  continua reprovando; e há teste para os dois lados.
- **RF3** — Se for atomicidade: o filtro de caminho passa a tratar API e frontend como uma unidade,
  e há teste do workflow que reprova a configuração que permite subir um sem o outro.
- **RF4** — P3 vale nas duas: o frontend expõe a versão que serviu o bundle, e a API a dela.

## Requisitos não funcionais

- **RNF1** — Nada de versão em query string nem em log com dado de request.
- **RNF2** — O que for decidido vale para **as três apps de cliente** (`frontend-transportada`,
  `frontend-client`, `frontend-landing`), ou a spec diz por que não.

## Casos extremos e falhas

- **Rollback da API com frontend novo** — o inverso do caso medido, e o que a atomicidade **não**
  cobre.
- **Campo renomeado** — é o caso que `hasExactKeys` pega hoje e não pode deixar de pegar.
- **Deploy parcial por falha de um dos jobs** — um sobe, o outro erra.

## Critérios de aceite

- **CA1** — Decisão registrada com o motivo. (RF1)
- **CA2** — Campo desconhecido não derruba a tela, **ou** as duas apps não sobem separadas. (P1)
- **CA3** — Campo ausente continua reprovando. (P2/RF2)
- **CA4** — A versão de cada app é observável. (P3/RF4)

## Decisões

- **D1 — ✅ Decidido em 2026-09-02: tolerância, e não atomicidade.**

  O argumento decisivo apareceu ao separar **o que a guarda protege**. `hasExactKeys` reprova três
  coisas, e elas não valem o mesmo:

  | caso                          | valor da proteção                                       |
  | ----------------------------- | ------------------------------------------------------- |
  | chave **ausente**             | alto — é contrato quebrado, e a tela usaria `undefined` |
  | chave de **tipo errado**      | alto — mesma razão                                      |
  | chave **desconhecida a mais** | ⚠️ **nenhum** — por definição o cliente não a usa       |

  A chave a mais é a **única** que causa a queda, e é a única que não protege nada: o cliente
  ignoraria o campo de qualquer forma. Tolerá-la não afrouxa a guarda, **remove o que ela tinha de
  inútil** — as duas proteções que pagam continuam de pé.

  A objeção plausível seria "chave a mais pode indicar resposta da rota errada". Não sobrevive: a
  resposta de outra rota **também** teria chaves faltando, e isso continua reprovando.

  Atomicidade fica de fora porque conserta menos por mais: custa pipeline em todo commit de
  documentação, e **não cobre rollback** — API antiga com frontend novo é o caso inverso, e ali
  atomicidade não ajuda em nada.

- **D2 — A tolerância sozinha não cobre o sentido inverso, e por isso vem com uma disciplina.**
  Frontend novo com API antiga tem o campo **ausente**, não a mais — e ausente continua reprovando,
  como deve. A saída não é afrouxar isso: é o cliente tratar **campo recém-acrescentado como
  opcional** até a API que o serve estar garantidamente no ar.

  Sem essa metade, a spec conserta um sentido e deixa o outro — e o outro é justamente o do
  rollback, que é quando a operação está pior.

- **D3 — ⚠️ `hasExactKeys` está copiado em doze arquivos de validação.**
  Medido: doze cópias, uma por módulo. A mudança de semântica em doze lugares é o mesmo defeito
  doze vezes se for feita à mão, então ela vem com a extração para um lugar só — que é o que a
  regra de strings repetidas do `code-standart.md` §16 já pedia.

- **D4 — A decisão anterior, em aberto, está preservada abaixo como registro do que se pesou.** As duas são defensáveis, resolvem coisas diferentes (causa contra consequência) e têm
  custos opostos. Escolher no meio da implementação produziria as duas metades mal feitas.

  O que já se sabe, medido, para alimentar a escolha:
  - o descompasso aconteceu **uma vez em um dia** de trabalho normal, sem ninguém errar;
  - o filtro de caminho está certo para o caso comum (commit de documentação não precisa
    reconstruir seis apps);
  - `hasExactKeys` já pagou por si: ele é o motivo de a regressão do smoke ter sido óbvia.

- **D2 — O sintoma é mudo, e isso é metade do problema.** A tela disse "Não foi possível carregar
  as viagens", a API respondeu `200`, e o log ficou limpo. Diagnosticar exigiu comparar o bundle
  servido com o corpo da resposta. Qualquer que seja a saída escolhida, **a P3 entra junto** — sem
  ela, o próximo descompasso custa a mesma investigação.

## Dúvidas

Nenhuma bloqueante. A escolha entre atomicidade e tolerância foi fechada na D1.
