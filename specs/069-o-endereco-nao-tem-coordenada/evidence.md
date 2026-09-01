# Evidências

## Fase 0 — O adendo, antes do código

### T001 ✅ 2026-09-01 — Adendo na ADR-0044 §3

`docs/adr/0044-o-roteiro-se-sugere-sozinho.md` ganhou a linha `Emendada em 2026-09-01` no cabeçalho
(l. 9) e a seção `## Adendo 2026-09-01 — o CEP é o degrau primário, e o provedor pago é escalada`
(l. 218), no mesmo formato do adendo da ADR-0039.

O que o adendo fecha:

- **por que a ordem escrita na §3 não é a implementada** — as duas medições de 2026-09-01 contra a
  BrasilAPI (a coordenada já chega no corpo que `postal-code.gateway.ts` descarta; resolve em cidade
  de onze mil habitantes). Quando a §3 foi escrita, o degrau gratuito era teórico;
- a escada de três degraus, **sem gatilho automático**, e o registro de que a escalada automática por
  colisão foi avaliada e recusada por gastar sem decisão;
- o que da §3 **continua valendo**: armazenamento permanente, `place_id` `not null`, a exceção de
  licença (sobre muito menos linhas), a ordenação da cascata, o pino manual vencendo tudo, e `city`
  fora da otimização;
- a recusa renovada de hospedar geocodificador, com o motivo ao lado da §2 porque contradiz a
  intuição de quem a leu — matriz lida milhares de vezes por sugestão contra geocodificação uma vez
  por endereço novo;
- **o risco novo que a §3 não tinha**: a coordenada do CEP ignora o número, e a marca é a mitigação
  e o instrumento de medida;
- o caso do CEP geral, com o `street` ausente como discriminador em vez do sufixo `-000`;
- onde cada degrau roda, e por que a marca na API não contraria a §7.

**Verificação:** `bunx prettier --check docs/adr/0044-o-roteiro-se-sugere-sozinho.md` → verde.

## Fase A — O fio e o degrau de graça

### T002 ✅ 2026-09-01 — A cascata mudou de app

⚠️ **A task corrigiu o próprio plano.** Ele mandava partir `geocoding-precision.policy.ts` por
consumidor; ao executar, duas medições no código mostraram que isso estava errado:

- `geocodeAddresses` **não chama** `shouldReplaceStored` — a cascata só grava o que está ausente da
  base, nunca substitui. Só o teste as via juntas.
- Com o degrau 2 na API, quem precisa de `toGeocodingPrecision` é o gateway pago, que mora lá.

Partir como estava escrito deixaria o ranking `rooftop > street > postal_code > city` **duplicado nas
duas apps** — a cópia por valor que diverge em silêncio. `plan.md` foi corrigido antes da execução.

O que ficou:

| peça                            | destino                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `geocodeAddresses` (cascata)    | worker — `src/routing/application/geocode-address.use-case.ts` |
| `shouldReplaceStored`           | API — migrou para `domain/geocoding-precision.policy.ts`       |
| `geocoding-precision.policy.ts` | API, inteira                                                   |
| tipos da porta                  | ambas (declaração, não regra)                                  |

`routing.schema.ts` do worker ganhou `source`, `external_place_id` e os três carimbos — ele deixou de
só ler a tabela e passou a escrevê-la. Os dois vocabulários de precisão/origem entraram como **tipo**,
não como catálogo em tempo de execução: quem valida são os CHECKs que a API migra.

Testes separados junto: a cascata foi para `worker/test/routing/geocode-address.contract.ts`, a
precedência para `api/test/routing-domain/stored-precedence.contract.ts`, e os três entrypoints
foram religados.

**Verificação:**

```
bun run --cwd apps/worker-transportada typecheck   → verde
bun run --cwd apps/api-transportada typecheck      → verde
bun run --cwd apps/worker-transportada test        → 821 pass / 0 fail (72 arquivos)
bun run --cwd apps/api-transportada test           → 3818 pass / 23 skip / 0 fail (151 arquivos)
```
