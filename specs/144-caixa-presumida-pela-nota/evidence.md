# Spec 144 — Evidência

Base: `work/cargo-missing-box` = `origin/staging` + `da30f9a0` + `1ca4b17a`, worktree
`../transportada-wt/cargo-missing-box`. Pré-existente em `staging`: "o Atego de 1417 caixas cabe no
orçamento de 50 ms" falha em ~235–240 ms, medido no checkout intocado.

## 1. Contrato do resíduo (T1 → T2)

**Vermelho** (`65415486`, só o contrato):

```
error: Export named 'resolveDocumentCargoEstimate' not found in module
  '.../src/nfe-documents/domain/cargo-volume.policy.ts'
 0 pass · 1 fail (o arquivo não carrega)
```

**Parecer do `architect` (opus) sobre a D2**, incorporado antes de implementar:

- Retorno **nunca `null`**: `volumeM3`/`source` viram `null` juntos ("nota sem cubagem", o mesmo
  sinal que o par `resolveMeasuredCargoVolume`/`resolveCargoVolume` dava), mas `unmeasuredBoxCount`
  e `estimateSource` existem sempre — a D4 precisa deles justamente quando não há volume.
- `total` reusa `resolveCargoVolume` (bit a bit igual a hoje para nota sem ficha nenhuma);
  `volumeM3` no caminho do resíduo é o **total exato**, nunca Σ das caixas arredondadas.
- Caixa presumida **única por nota** (`divideHalfUp(resíduo, restantes)`); deriva máxima
  `restantes × 0,5 µm³`, ordens de grandeza abaixo do mm do `resolveFallbackBox` e da célula de 5 cm.
- Guarda: caixa que arredonda para `0n` cai na mediana (senão o empacotador desenha caixa degenerada).
- Divisor arredonda para cima a quantidade fracionária sem ficha (`Math.ceil` local);
  `countMeasuredBoxes` fica intocado, porque mudá-lo alteraria o medido das notas com ficha (D6).
- Sem total: a mediana dá tamanho às caixas mas **não** cubagem à nota — a nota continua "sem
  volume", como hoje. Não inventar m³ de nota a partir da mediana.
- Medido acima do total sem mediana: a nota vale o **medido** (hoje saía o total, menor que o
  medido). Caso inalcançável na prática — linha medida implica mediana da empresa — mas é a única
  mudança deliberada de número, e vai na direção "ocupação menor que a real é o que faz alguém
  continuar carregando".
- Deviação consciente do parecer: nota **sem linha nenhuma** com `qVol` continua valendo o total
  por espécie (`estimated`), como hoje; o architect sugeria `null`, o que mudaria o volume de uma
  nota que a spec não cobre.
- Risco a verificar em T4: nota com linha medida + `total` + **sem** mediana sai `partial` em vez
  de `estimated`, e `estimated` vence `partial` na severidade da viagem.

**Verde** (T2, 15 casos — os 9 originais mais os 6 do parecer):

```
bun test ./test/cargo-volume/document-box-estimate.contract.ts
 15 pass · 0 fail · 17 expect() calls

bun run typecheck → sem erros
bun test ./test/cargo-volume.contract.test.ts
 321 pass · 1 fail  (pré-existente: "o Atego de 1417 caixas cabe no orçamento de 50 ms", ~135–185 ms)
bunx prettier --check → All matched files use Prettier code style!
```

## 2. Conservação e m³ fechando com a fatia (T3 → T5)

## 3. G006 — caixas colocadas antes/depois nas viagens reais (T6)

| viagem | antes | depois |
| ------ | ----- | ------ |

## 4. Lista do que falta medir (T7, T8)

## 5. Gate (T10)
