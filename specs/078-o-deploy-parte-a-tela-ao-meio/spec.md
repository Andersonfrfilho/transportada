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
consequência e sobrevive a qualquer descompasso. ⚠️ **Descartada na execução** — ver D1: a rejeição
de chave a mais é defesa contra vazamento de token, identidade de tenant e XML fiscal, com catorze
testes cobrando. Afrouxá-la troca indisponibilidade por vazamento.

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

- **D1 — ⚠️ Decidido, revertido, e decidido de novo: é ATOMICIDADE, não tolerância.**

  **A primeira decisão foi tolerância, e estava errada.** O raciocínio era: `hasExactKeys` reprova
  chave ausente (proteção alta), tipo errado (alta) e chave desconhecida a mais — e esta última,
  argumentei, "não protege nada, porque por definição o cliente não a usa".

  **Falso.** A implementação bateu em catorze testes existentes, e os nomes deles dizem o que a
  rejeição de chave a mais realmente faz:
  - `rejects tenant identity and extra fields in settings responses`
  - `keeps the trip dto strict, free of tenant or xml fields`
  - **`recusa um resumo de credencial que traga o token de volta`**
  - `rejects an option carrying a field beyond the three the dialog needs`

  Não é guarda de contrato: é **defesa em profundidade contra vazamento**. Se a API algum dia
  devolver token, identidade de tenant ou XML fiscal — por defeito, por refactor, por rota errada —
  o cliente **recusa** em vez de guardar, renderizar ou mandar adiante. A `security.md` §8 pede
  exatamente isso ("nenhum token ou dado confidencial em estado global acessível pelo console"), e a
  guarda é a última linha antes disso.

  Tolerar chave a mais desarma essa linha em **doze arquivos de uma vez**, para consertar um
  descompasso de deploy. É trocar uma classe de indisponibilidade por uma classe de vazamento — e
  as duas não têm o mesmo peso.

  **Fica atomicidade:** as apps de cliente e a API sobem juntas quando o commit toca qualquer uma
  delas. Custa pipeline em commit de documentação, e é o preço de manter a guarda estrita.

- **D2 — A atomicidade não cobre rollback, e isso fica escrito em vez de escondido.**
  API antiga com frontend novo tem o campo **ausente**, e ausente reprova — corretamente. Nenhuma
  das duas saídas resolve esse sentido; o que resolve é disciplina de escrita: **campo
  recém-acrescentado nasce opcional no cliente** até a API que o serve estar garantidamente no ar.
  Isso entra como contrato, não como recomendação.

- **D3 — ⚠️ `hasExactKeys` está copiado em doze arquivos, e a extração fica FORA desta spec.**
  Medido. Com a semântica preservada, a extração é faxina — valiosa, e sem relação com o defeito
  que originou a spec. Juntá-la aqui misturaria um refactor de doze arquivos com uma mudança de
  pipeline, e é assim que uma reverte a outra. Spec própria.

## Dúvidas

Nenhuma bloqueante. A escolha entre atomicidade e tolerância foi fechada na D1.
