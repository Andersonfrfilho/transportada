# Feature 074 — A sugestão nasce e desaparece

## Problema e resultado

`POST /route-suggestions/multi-vehicle` responde **500 em toda chamada**. Não em alguma;
em toda. O recurso que a spec 058 entregou — dar um punhado de notas e uma frota e receber
as viagens propostas — **nunca funcionou uma vez sequer**.

A causa está em três linhas de
`routing/infrastructure/drizzle-multi-vehicle-suggestion.repository.ts`:

```ts
const suggestions = createDrizzleRouteSuggestionRepository(database)   // conexão de fora
...
return database.transaction(async (transaction) => {
  // três inserts, todos em `transaction` — corretos
  const created = await suggestions.find({ … })     // lê pela conexão de fora
  if (created === null) throw new Error('multi vehicle suggestion vanished after insert')
```

A releitura sai por **outra conexão**. A linha recém-inserida ainda não commitou, então ela é
invisível ali: `find` devolve `null` **sempre**, o `Error` dispara **sempre**, a transação volta
atrás e o cliente recebe 500. O comentário logo acima diz _"a sugestão, o pool e a frota nascem na
mesma transação"_ — a intenção estava certa; a leitura ficou de fora dela.

O resultado desta feature: a criação da sugestão multiveículo **funciona**, e um teste contra
Postgres de verdade impede que ela volte a não funcionar.

### Por que ninguém viu

Três coisas se somaram, e vale nomear as três porque cada uma volta a acontecer sozinha:

1. **Não há uso.** `route_suggestions` está **zerada em produção** — nem multiveículo, nem por
   viagem. Zero linha, zero reclamação: o defeito é invisível porque o recurso nunca foi
   exercitado por ninguém.
2. **O teste de integração começa depois do passo quebrado.**
   `test/integration/multi-vehicle-suggestion.integration.ts` existe, roda contra Postgres real e
   está na lista do `package.json` — mas exercita só `useCase.accept(...)`. A sugestão que ele
   aceita é semeada por `insert` direto (linha 287), então **`create` nunca é chamado**. O caminho
   coberto funciona; o descoberto é o único que falha.

   Isso é mais estreito, e mais instrutivo, que "faltava teste": o teste existe e é bom. O que
   faltou foi cobrir o **primeiro** passo do fluxo, e semear por SQL é justamente o que torna essa
   lacuna confortável de deixar aberta.

3. **A mensagem foi descartada.** `"multi vehicle suggestion vanished after insert"` apontava o
   defeito por extenso, e morreu no caminho: a tela diz _"Não foi possível distribuir as notas
   agora"_, a API diz `INTERNAL_ERROR`, e **o log grava só `errorName: "Error"`** — sem mensagem,
   sem pilha. Achar um defeito de uma linha custou log de servidor e leitura de código.

## Fora do escopo

- **O resto do fluxo multiveículo.** Aceite, distribuição pelo solver, criação das viagens: nada
  disso foi exercitado, porque tudo morre antes. Testá-los é trabalho seguinte, com esta spec de
  pé.
- **A tela.** A mensagem que o operador lê continua genérica de propósito (`security.md` §3: nada
  de detalhe interno na resposta). O que muda é o que o **log do servidor** guarda.
- **A raiz `/` que renderiza tela diferente por pessoa**, a coluna "Veículo" imprimindo UUID, e o
  endereço de desvio que não é geocodificado na hora. Achados da mesma sessão, specs próprias.

## Histórias priorizadas

### P1 — A sugestão multiveículo é criada

**Given** um pool de notas e uma frota de veículos de tração
**When** o operador manda distribuir
**Then** a sugestão, o pool e a frota são gravados na mesma transação, e a resposta é a sugestão
criada — não 500.

### P2 — O log diz o que aconteceu

**Given** um erro desconhecido em qualquer rota
**When** ele chega ao filtro de exceção
**Then** o log de servidor carrega a **mensagem** do erro, além do nome — nunca o corpo da
resposta ao cliente, que segue genérico.

## Requisitos funcionais

- **RF1** — A releitura pós-inserção acontece **dentro da mesma transação** dos inserts.
- **RF2** — A criação continua atômica: sugestão, pool e frota, ou nada. Sugestão sem pool é
  sugestão que o worker pega, não acha nota e conclui `ready` com zero paradas — indistinguível,
  na tela, de "não havia o que roteirizar".
- **RF3** — O `Error` genérico dá lugar a erro tipado do domínio, para que um defeito interno
  deixe de ser indistinguível de uma falha de banco.
- **RF4** — O filtro de exceção global registra `message` junto de `errorName`.

## Requisitos não funcionais

- **RNF1** — O teste que prova a RF1 roda contra **Postgres de verdade**, com transação real.
  Dublê de repositório não reprova este código, e um teste que não reprova é ruído.
- **RNF2** — Nenhum dado pessoal em log (`security.md` §1). A mensagem de erro é do código, não do
  dado: mensagem que interpole endereço, CPF ou corpo de nota é violação, não melhoria.
- **RNF3** — A resposta ao cliente não muda: `INTERNAL_ERROR` sem detalhe interno.

## Casos extremos e falhas

- **Pool com nota já vinculada a outra viagem** — recusa de negócio (409), e ela precisa continuar
  chegando como 409 depois da correção, não como 500.
- **Veículo que não traciona** — idem.
- **Pool vazio / frota vazia** — barrado antes, na fronteira.
- **Duas criações concorrentes** — cada uma na sua transação; a correção não introduz corrida.

## Critérios de aceite

- **CA1** — `create` devolve a sugestão gravada, com pool e frota, contra Postgres real. (P1/RF1)
- **CA2** — Falha no meio da criação não deixa sugestão sem pool. (RF2)
- **CA3** — Nota já em viagem continua respondendo 409, não 500. (Casos extremos)
- **CA4** — O erro interno é tipado, não `Error` cru. (RF3)
- **CA5** — O log de erro desconhecido carrega a mensagem. (P2/RF4)
- **CA6** — Nenhum campo de dado pessoal aparece em log. (RNF2)

## Decisões

- **D1 — A correção é mover a construção do repositório para dentro da transação**, não replicar a
  consulta à mão. O `find` já existe, já é testado e já monta o registro; duplicá-lo aqui criaria
  a segunda definição de "como se lê uma sugestão", livre para divergir.
- **D2 — O teste é de integração, e é o entregável principal.** A linha corrigida é trivial; o que
  impede a volta do defeito é o teste contra banco real. Sem ele, esta spec seria um `git revert`
  esperando acontecer.
- **D3 — A mensagem entra no log, não na resposta.** O que o cliente lê continua genérico; o que
  o servidor guarda passa a ser suficiente para diagnosticar sem ler código.

## Dúvidas

Nenhuma bloqueante.
