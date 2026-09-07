# Feature 092 — Pular não é passar

## Problema e resultado

A suíte de integração da `api-transportada` **se pula sozinha quando não acha o banco**, e sai
anunciando sucesso. Quem roda `bun run test:integration` sem o `.env` carregado lê `66 pass` e
segue em frente; das 38 integrações, **136 testes não rodaram** — e nada na saída diz que o gate
não foi exercido.

Isso não é hipótese. É o que deixou o `6642de1c` chegar quebrado na staging: a política
`checkTrackingWindow` foi corrigida, o contrato HTTP que a exercita ficou para trás afirmando a
regra abandonada, e **as duas integrações do portal que provariam o caso estavam entre as 136**.
O gate local passou. O CI reprovou. Entre uma coisa e outra houve um commit publicado, uma sessão
de investigação e um segundo commit (`fd258662`) só para consertar o teste.

O resultado desta feature é que **falta de banco vire falha**, não silêncio — e que exista um
comando local que carregue o ambiente, do jeito que o worker já tem.

⚠️ **Isto não é "ligar os testes".** Eles já rodam, e passam. O defeito é a suíte não saber
distinguir _"rodei e passou"_ de _"não rodei"_, e reportar as duas do mesmo jeito. Um gate que não
sabe dizer que não rodou não é um gate.

## O que foi medido

Medido em 07/09/2026, na `api-transportada` desta base, contra o Postgres de teste local:

| medida                                                              | resultado                       |
| ------------------------------------------------------------------- | ------------------------------- |
| Arquivos `*.integration.ts`                                         | 38                              |
| Declaram `testWithPostgres = databaseUrl === undefined ? test.skip` | **35**                          |
| Cópias da resolução de `const databaseUrl`                          | **33** — não há seam            |
| `bun run test:integration` **sem** env                              | 66 pass · **136 skip** · 2 fail |
| `bun run test:integration` **com** env                              | 196 pass · 4 skip · 7 fail      |
| Alvo `make` para a integração da API                                | **não existe**                  |
| Alvo `make worker-integration`                                      | existe, e carrega o env         |
| `make check` inclui integração                                      | **não**                         |

Dois números que explicam o resto:

- **136 → 4.** Os 4 que restam com banco de pé são do `cte-archive-gateway`, que pula por falta de
  MinIO. Esse pulo é legítimo e deve continuar (§ Fora do escopo).
- **35 de 38, com 33 cópias.** A decisão de pular é tomada 33 vezes, em 33 arquivos. O
  comportamento certo **já existe no repositório e é um arquivo só**: `server.integration.ts`
  resolve a URL no topo do módulo e **lança na carga** (`server.integration.ts:18`) — é ele que
  produziu o `1 error` da rodada sem env, e é o modelo a generalizar.

⚠️ **O padrão copiado já vazou por engano.** Em dois arquivos, quatro testes usam `test(` cru em
vez de `testWithPostgres` — `local-identity-seed` (3) e `company-user-listing` (1) — e por isso
correram sem banco e quebraram, enquanto seus vizinhos no mesmo arquivo pulavam. Foi esse escape
que gerou o `1 fail` da rodada sem env. Não é um segundo padrão deliberado: é a prova de que uma
convenção mantida à mão em 33 lugares **não se sustenta**, e de que o vazamento é silencioso nos
dois sentidos — ora se pula o que deveria rodar, ora se roda o que deveria pular.

⚠️ As **7 falhas com env são outra coisa**: timeout de 5s em `fleet-vehicle-repository` e
`fuel-price-repository`, que passam isolados (18 pass, 0 fail). É contenção no Postgres
compartilhado, não defeito, e não é escopo desta spec.

## Fora do escopo

- **Os 7 timeouts sob carga.** Investigação própria: ou o limite de 5s é curto para a suíte
  paralela, ou esses dois arquivos disputam a mesma tabela. Não se conserta junto.
- **O pulo por capacidade opcional.** MinIO no `cte-archive-gateway` e OSRM no worker pulam **de
  propósito** — o comentário em `Makefile:271` já diz por quê: a integração comum não pode exigir
  um dataset de centenas de MB. Esta spec preserva esse pulo; o que ela proíbe é o pulo por falta
  do que é **obrigatório**.
- **`worker-transportada` e `cron-transportada`.** O worker já tem alvo `make` que carrega o env, e
  nenhum dos dois usa o padrão de skip por banco. Nada a fazer ali.
- **A reformatação de 50 `snapshot.json` por `bun run db:test`.** Achado da mesma sessão, defeito
  separado.

## Histórias priorizadas

### P1 — A suíte recusa rodar sem banco

**Given** um ambiente sem `API_TEST_DATABASE_URL` nem `DATABASE_URL`
**When** alguém roda a suíte de integração da API
**Then** ela termina com código diferente de zero **antes** de executar teste algum, e a mensagem
nomeia o comando que carrega o ambiente.

### P2 — Existe um comando local que carrega o ambiente

**Given** a infra local de pé
**When** alguém roda o alvo `make` da integração da API
**Then** o `.env` é carregado como o CI faz, e as 196 rodam.

### P3 — O pulo legítimo continua, e se anuncia

**Given** o MinIO fora do ar
**When** a suíte roda com banco
**Then** os testes de object storage pulam, e a saída **diz que pularam e por quê** — sem que a
suíte passe a mentir sobre cobertura.

## Requisitos funcionais

- **RF1** — A resolução do banco de teste passa a viver em **um lugar só**, consumido pelos 38
  arquivos. As 33 cópias saem.
- **RF2** — Sem banco declarado, esse ponto único **falha**. Falhar é o padrão; pular deixa de ser
  alcançável por ausência de variável obrigatória.
- **RF3** — A mensagem de falha nomeia o comando certo. `"A PostgreSQL test URL is required"` não
  diz a quem a lê o que fazer em seguida.
- **RF4** — Existe `make api-integration`, no molde do `worker-integration`: sobe o que precisa,
  carrega o env, roda.
- **RF5** — O pulo por capacidade opcional (MinIO) continua existindo, declarado numa lista fechada
  e distinguível na saída do pulo por defeito.
- **RF6** — Um contrato falha quando um `*.integration.ts` novo não passa pelo ponto único. Sem
  isso a regra vale só para os 38 de hoje.

## Requisitos não funcionais

- Não aumentar o tempo do CI: ele já carrega o `.env` com `set -a` antes de rodar
  (`ci.yml:112`), e deve continuar verde sem mudança.
- Nenhum teste que hoje passa muda de resultado.
- A mudança é de andaime de teste: nenhum arquivo de `src/` entra.

## Casos extremos e falhas

- **Rodar um arquivo só** (`bun test ./test/integration/x.integration.ts`) sem env: falha igual.
  É o caminho de quem está depurando, e é justamente onde o silêncio engana mais.
- **`API_TEST_DATABASE_URL` presente e `DATABASE_URL` ausente** (e vice-versa): a precedência de
  hoje se mantém; a spec não muda qual vence.
- **Banco declarado mas inalcançável:** já falha hoje, na conexão. Não é caso novo.
- **MinIO ausente com banco presente:** pula os 4, suíte verde, aviso na saída.
- **CI:** carrega o env antes de invocar; o guard nunca dispara lá. Se disparar, é sinal de que o
  `.env` do runner quebrou — e aí falhar é o comportamento desejado.

## Critérios de aceite

- [ ] `bun run --cwd apps/api-transportada test:integration` sem env → **exit ≠ 0**, nenhum teste
      executado, e a mensagem cita `make api-integration`.
- [ ] `make api-integration` com a infra de pé → **196 pass**, os mesmos de hoje.
- [ ] `grep -c "const databaseUrl" test/integration/*.integration.ts` → **0**.
- [ ] `server.integration.ts` passa a usar o ponto único, e o guard dele sai — o comportamento
      dele vira o de todos.
- [ ] Os quatro testes que escaparam do skip (`local-identity-seed` ×3, `company-user-listing` ×1)
      deixam de ser possíveis: com o guard, `test` e `testWithPostgres` passam a ser a mesma coisa.
- [ ] Contrato novo reprova um `*.integration.ts` que resolva o banco por conta própria.
- [ ] `make check` segue sem integração — quem quiser o gate completo roda os dois. (Ver Dúvidas.)
- [ ] CI verde sem alteração no `ci.yml`.

## Dúvidas

- `[NEEDS CLARIFICATION: o pulo do MinIO deve virar falha no CI?]` No runner o `make up` sobe o
  MinIO, então lá a capacidade **existe** e pular esconderia regressão de object storage. Local,
  exigi-la contraria a razão pela qual o pulo foi criado. As opções são (a) manter opcional nos
  dois, (b) exigir quando `CI=true`, ou (c) uma variável explícita de opt-out. Bloqueia o RF5.

- `[NEEDS CLARIFICATION: make check passa a incluir a integração?]` Hoje não inclui, e é por isso
  que "rodei o gate" não quer dizer "rodei as integrações" — a mesma confusão que originou esta
  spec, um nível acima. Incluir exige infra de pé para o gate mais citado do repositório e deixa
  `make check` bem mais lento. Não bloqueia o resto; decide só o último critério de aceite.

## 🤖 Modelo recomendado

| etapa                                             | modelo    |
| ------------------------------------------------- | --------- |
| Desenhar o ponto único e a fronteira falha × pulo | `opus` 🧠 |
| Implementar o guard, o alvo `make` e o contrato   | `sonnet`  |
| Passe mecânico de substituição nos 33 arquivos    | `haiku`   |
