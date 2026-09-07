# Plano técnico

## Contexto e premissas

Mudança de andaime de teste: **nenhum arquivo de `src/` entra**. O que muda é como as 38
integrações da `api-transportada` resolvem o banco e o que acontece quando não o acham.

A premissa que sustenta o desenho é a medição da spec: a decisão de pular está tomada **33 vezes**,
e quatro arquivos já discordam do resto lançando erro. Não há divergência de intenção a resolver —
há uma cópia que deixou quatro pontas soltas. O conserto é dar um dono à decisão, não escolher
entre dois comportamentos.

⚠️ **Falhar cedo é diferente de falhar dentro do teste.** Os quatro que hoje lançam o fazem
_dentro_ do corpo, então o Bun os reporta como teste vermelho — melhor que o silêncio, mas ainda
gasta o boot da suíte inteira e mistura defeito de ambiente com defeito de código. O guard novo
roda na carga do módulo, antes de qualquer `describe`.

## Arquitetura e arquivos afetados

**Novo** — `apps/api-transportada/test/fixtures/integration-database.fixture.ts`:

- `resolveIntegrationDatabaseUrl()` — lê `API_TEST_DATABASE_URL ?? DATABASE_URL`, preservando a
  precedência de hoje; **lança** com mensagem acionável quando nenhuma existe.
- `testWithPostgres` — reexportado como o `test` normal. Depois do guard, ele nunca mais é
  `test.skip`, e o nome fica porque trocá-lo em 35 arquivos é churn sem ganho.
- `testWithObjectStorage` — o pulo que **continua**, isolado aqui para ficar visível ao lado do que
  deixou de existir.

**Alterados** — os 38 `test/integration/*.integration.ts`: sai a cópia de `const databaseUrl` e a
linha do ternário, entra o import. Nos quatro que lançam (`server`, `auth-me`, `tenant-context`,
`authentication-repository`), sai também o `throw` interno, que passa a ser redundante.

**Alterado** — `Makefile`: alvo `api-integration` no molde de `worker-integration:269`.

**Novo** — `apps/api-transportada/test/integration-scaffold/…` + entrypoint no `package.json`: o
contrato do RF6.

## Contratos/API/eventos

Nenhum. Não há rota, envelope nem payload nesta feature.

O contrato **de teste** (RF6) é por texto de fonte, no molde dos que o repositório já usa para
cópia por valor: varre `test/integration/*.integration.ts` por glob e falha se algum ler
`process.env` para banco ou declarar o próprio ternário de skip. Glob e não lista fechada — arquivo
novo precisa entrar na varredura sozinho, senão a regra nasce vencida.

⚠️ O contrato tem de afirmar **as duas metades**: que o pulo por banco sumiu **e** que o pulo por
MinIO continua. Cobrar só a primeira transforma "removi o skip" em verde mesmo se alguém apagar o
pulo legítimo junto.

## Dados, migration e rollback

Nada. Sem schema, sem migration.

## Segurança e tenant

Fora de alcance — nenhum caminho de request muda. A única superfície sensível é a mensagem de erro
do guard, que nomeia **variáveis e comando**, nunca o valor da URL: `DATABASE_URL` carrega
credencial, e mensagem de teste vaza para log de CI.

## Idempotência e concorrência

Não se aplica. Nota lateral: os 7 timeouts medidos são contenção entre integrações no mesmo
Postgres — problema real, **fora do escopo** (spec § Fora do escopo), e esta mudança não o piora
nem o alivia.

## Observabilidade

A saída da suíte é a superfície. Duas exigências:

1. A falha do guard sai **uma vez**, no boot, e não 38 vezes.
2. O pulo do MinIO se anuncia. Hoje `test.skip` do Bun já imprime `(skip)`; o que falta é a razão,
   e ela vai numa linha só na carga do módulo.

## Estratégia de testes

TDD, e a ordem importa porque o alvo é o próprio andaime:

1. **Contrato do RF6 primeiro**, vermelho contra os 33 arquivos de hoje. Ele é o que impede a
   regressão voltar por arquivo novo.
2. **Guard**, com teste próprio nos três estados: só `API_TEST_DATABASE_URL`, só `DATABASE_URL`,
   nenhuma das duas.
3. **Migração dos 38**, com o contrato virando verde por construção.
4. **Prova de ponta**: a suíte sem env sai ≠ 0 sem executar teste; com env dá os mesmos 196.

⚠️ O passo 4 é o único que prova a spec. Contrato verde com a suíte ainda pulando em silêncio é
exatamente o defeito que estamos consertando, um nível acima — e seria irônico fechar assim.

## Riscos

- **O passe nos 33 arquivos é mecânico e amplo.** Risco de conflito com qualquer sessão que toque
  integração. Mitigação: worktree próprio (`make worktree`) e publicar cedo.
- **`make api-integration` pode divergir do `ci.yml`.** Hoje o CI monta o comando inline; se o alvo
  fizer diferente, o gate local deixa de provar o do CI. Mitigação: o `ci.yml` passa a chamar o
  alvo, em vez de repetir as linhas.
- **As duas dúvidas em aberto.** A do MinIO **bloqueia o RF5** — sem ela não dá para escrever a
  metade do contrato que afirma o pulo legítimo. A do `make check` decide só o último critério de
  aceite e não trava a implementação.
- **Timeout sob carga (os 7).** Ao tornar a suíte obrigatória, esses flakes passam a doer mais.
  Não são desta spec, mas a probabilidade de alguém tropeçar neles sobe — vale abrir a investigação
  em paralelo.
