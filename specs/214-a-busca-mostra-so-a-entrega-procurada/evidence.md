# Evidência — Spec 214

Nada executado ainda. As seções abaixo nascem vazias e são preenchidas **por task**, com comando,
saída e arquivo:linha. Relatório de agente não é evidência: conferir o efeito, não a mensagem.

## T0.1 👤 — Aceite da ADR-0090 (revisão 2)

- [ ] status da ADR mudado para "aceita", com data e citação do usuário
- [x] **Q1 fechada em 2026-09-26 pelo usuário: os dois documentos descem, CNPJ e CPF.** Contrariou o §3
      original desta ADR, que descia só o CNPJ. Texto que ele leu e escolheu: _"Como você pediu: buscar
      por CPF também funciona. Em troca, o CPF de cada destinatário pessoa física da viagem passa a
      ficar guardado no celular (o snapshot fica em IndexedDB por até 24 h para funcionar sem rede) — e
      isso entra no `docs/SECURITY.md` como ampliação do que se compartilha."_
- [x] **Q4 fechada em 2026-09-26 pelo usuário: gravado no disco.** Texto que ele leu e escolheu: _"O
      documento entra no snapshot em disco. Buscar por CPF funciona no meio do nada, sem sinal, que é o
      cenário real do motorista. Em troca, o número fica no aparelho por até 24 h (menos, se a viagem
      fechar antes) e um telefone desbloqueado nas mãos erradas o entrega a quem souber abrir as
      ferramentas do navegador."_ A alternativa "só em memória" foi descartada: busca por CPF passaria a
      exigir sinal.
- [ ] as seis travas de §3.3 apresentadas; as cinco que são obrigação da spec estão em T2.7 e T3.10
- [ ] **nenhuma pergunta pendente no aceite** — a T0.1 confirma a ADR inteira, já decidida

## T0.2 — Premissas e medição

### As 19 premissas do `plan.md`, conferidas em `origin/staging`

| #   | Confere? | Arquivo:linha em `origin/staging` | Observação |
| --- | -------- | --------------------------------- | ---------- |
| 1   |          |                                   |            |
| 2   |          |                                   |            |
| 3   |          |                                   |            |
| 4   |          |                                   |            |
| 5   |          |                                   |            |
| 6   |          |                                   |            |
| 7   |          |                                   |            |
| 8   |          |                                   |            |
| 9   |          |                                   |            |
| 10  |          |                                   |            |
| 11  |          |                                   |            |
| 12  |          |                                   |            |
| 13  |          |                                   |            |
| 14  |          |                                   |            |
| 15  |          |                                   |            |
| 16  |          |                                   |            |
| 17  |          |                                   |            |
| 18  |          |                                   |            |
| 19  |          |                                   |            |

### Notas por viagem, medido em `staging` (leitura só)

| Métrica          | Valor |
| ---------------- | ----- |
| máximo           |       |
| mediana          |       |
| p95              |       |
| paradas (máximo) |       |

## Fase 1 — API

### T1.1 — Contrato do mapper (vermelho antes)

```text
(comando e saída)
```

### T1.2 / T1.3 — Campos e mapper (verde depois)

⚠️ Sem condição de `recipientIsCompany` no mapper. PF traz CPF, PJ traz CNPJ.

```text
bun --env-file=../../.env.test test --timeout 120000
bun --env-file=../../.env.test run test:integration
```

- [ ] o comentário de `find-current-driver-trip.use-case.ts:49-53` foi reescrito (o documento sai, PF e
      PJ, e o custo está no `docs/SECURITY.md`)
- [ ] destinatário PF traz o **CPF**; destinatário PJ traz o **CNPJ**
- [ ] `recipientTaxId` é `null` só quando não há participante destinatário com documento

### T1.4 — `me-trip.routes.ts` sem mudança (premissa 8)

### T1.6 — Nada na API loga o documento

Motivo medido em 2026-09-26: `DEFAULT_REDACTED_KEYS` do `@adatechnology/logger` tem `cpf`/`cnpj` mas
**não** `taxid`; `createApiLogger` (`main.ts:1373-1381`) não passa `extraKeys`.

- [ ] contrato de fonte verde
- [ ] registrado que o conserto durável (`taxid` na lista do pacote) é em `adatechnology-packages`

### T1.5 — Gates e commit

- [ ] sem migration (registrar por que `make migration-test` não se aplica)
- [ ] SHA do commit:

## Fase 2 — Serviço de busca

### T2.1 / T2.2 — Contratos (vermelho antes)

- [ ] linha de import de `trip-search` no entrypoint `test/driver-trip.contract.test.ts`
- [ ] linha de import de `trip-search-visibility` no entrypoint
- [ ] os dois rodados **por nome**, vermelho registrado

### T2.3 / T2.4 — Implementação (verde depois)

### T2.5 — Custo medido

| Cenário                      | Notas | Tempo por tecla | Orçamento |
| ---------------------------- | ----- | --------------- | --------- |
| mediana medida na T0.2       |       |                 | ≤ 16 ms   |
| p95 medido na T0.2           |       |                 | ≤ 16 ms   |
| teto de schema (200 paradas) |       |                 | ≤ 16 ms   |

- [ ] índice construído uma vez por snapshot (contador de normalizações)
- [ ] se estourou: `startTransition` aplicado (**nunca** paginar nem servidor)

### T2.7 — As duas travas novas do snapshot (F12)

- [ ] P37 — contrato que enumera os campos de dado pessoal admitidos e reprova campo não declarado
- [ ] P38 — varredura no boot remove registro vencido de **qualquer** dono

### T2.6 — Gates e commit

## Fase 3 — Tela

### T3.1 — Paridade de locale

### T3.2 / T3.3 / T3.4 / T3.5 / T3.6 — Componentes

- [ ] E18-E22: a parada corrente nunca sai, com todas as notas, fora da contagem
- [ ] F23: progresso idêntico com e sem busca
- [ ] F24: `documentsPending` conta a parada inteira
- [ ] D16: snapshot não mutado (comparação profunda)

### T3.7 — `touch-target.contract.ts` verde

### T3.8 — G32: limpar não altera outro estado

### T3.10 — O documento casa e não escapa

- [ ] P35 — cartão sem o documento em texto, `title`, `aria-label` ou `data-*`
- [ ] P36 — `recipientTaxId` fora de `DriverFieldReport`, `QueuedAttachment`,
      `localStorage`/`sessionStorage`, `console.*`, log e beacon
- [ ] P39 — `service-worker.contract.ts` verde: nenhuma `runtimeCaching`, cliente com `cache: 'no-store'`

### T3.9 — Gates e commit

## Fase 4 — Preview, design, revisão

### T4.1 👤 — Prints do preview

Quatro estados, em 375 e 768. ⚠️ Registrar de qual árvore o Vite servia.

- [ ] sem busca
- [ ] com busca casando
- [ ] sem resultado nenhum
- [ ] a parada a caminho aparecendo apesar da busca

### T4.2 — Revisão de design

### T4.3 — Revisão de código

### T4.4 — Publicação

- [ ] `bunx prettier --write` nos `.md`
- [ ] `git fetch && git rebase origin/staging && bun install --frozen-lockfile && <gates> && git push origin HEAD:staging`
- [ ] ordem: API → app

### T4.5 — O que fica para as specs irmãs

- [ ] **192** — a trava de reordenação com busca ligada (ADR-0090 §7), com `search.reorderBlocked` já
      traduzida por esta spec
- [ ] **206** — trocar `findCurrentStop` por `resolveEnRouteStopId` em F6, numa linha
- [ ] **197** — `recipientNames[]` e o título da parada entram **no mesmo** casador de ADR-0090 §4
- [ ] **`adatechnology-packages`** — `taxid` em `DEFAULT_REDACTED_KEYS` do `@adatechnology/logger`, com
      bump e publicação (ADR-0090 §3.4)
- [ ] **`docs/SECURITY.md`** — os três itens de "o que falta" do achado novo: criptografia em repouso, a
      chave `taxid` no logger, e a retenção no aparelho nunca mais aberto
