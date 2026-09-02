# Evidência — 075

## Fase A — A cubagem da nota (T002–T005, 2026-09-02)

**T002** `test/cargo-volume/cargo-volume.contract.ts`, escrito primeiro e falhando
(`Cannot find module cargo-volume.policy`). Sete casos: `quantidade × fator` com origem
`estimated`; **a origem tem um valor só** (afirmado por `Object.values`, para o dia em que alguém
acrescentar `declarado` sem o campo que o produz); sem fator ⇒ `null`; sem quantidade ⇒ `null`;
quantidade zero ⇒ `null`; fator zero ⇒ `null`; um volume vale um fator; e a multiplicação em
decimal sem erro binário.

**T003** `src/nfe-documents/domain/cargo-volume.policy.ts`, espelhando `cargo-weight.policy.ts` —
escala em `bigint`, `divideHalfUp`, `formatScaledDecimal`. Escala 6, contra 4 do peso: 0,05 m³
precisa de casas que o peso não precisa.

**T004** `drizzle/20260902140000_cargo_volume_factors/`, com `rollback.sql`.

⚠️ Dois tropeços, os dois de paridade — e os dois pegos por contrato que já existia:

1. `test/database-migration/static-migration.contract.ts` lista os diretórios de migration **por
   extenso**. O meu não estava lá, e o contrato reprovou. É exatamente o padrão que a skill
   `contrato-de-paridade` descreve.
2. O `rollback.sql` apagava a linha do journal por `hash`; a coluna é `name`. As migrations vizinhas
   ainda conferem `ROW_COUNT = 1` e levantam exceção se não for — copiei isso também, porque um
   rollback que apaga zero linhas silenciosamente deixa a migration marcada como aplicada sobre uma
   tabela que não existe mais.

```
make migration-test   90 pass · 0 fail   (aplica, restringe, volta e reaplica)
```

**T005** Porta, repositório, três casos de uso e rotas em `settings.manage` / escopo `company`,
ligados no `main.ts`. `PUT`/`GET`/`DELETE` em `/company-settings/cargo-volume-factors`.

**Desligar é apagar a linha, nunca gravar zero** — o CHECK do banco recusa zero, e o schema Zod
recusa antes. É a mesma decisão da ADR-0052 para massa, com uma diferença: lá o nulo mora na
coluna; aqui mora na **ausência da linha**, porque a chave é composta com a espécie.

Contrato de isolamento em `test/cargo-volume/tenant-safety.contract.ts`: `company_id` obrigatório
com FK restritiva, **chave `(company_id, species)`** — fosse só `species`, o `onConflictDoUpdate` de
uma empresa sobrescreveria o fator da outra —, CHECK presente, e varredura por texto de fonte
afirmando que toda consulta filtra por empresa.

```
bun test ./test/cargo-volume.contract.test.ts   11 pass · 0 fail
bun test (API)                                  3926 pass · 23 skip · 0 fail
```
