# ADR-0065 — O IP do cliente vem do salto conhecido, nunca do começo da cadeia

- **Status:** aceita
- **Data:** 2026-09-14
- **Origem:** revisão de segurança da spec 146 (`docs/SECURITY.md`, entrada de 2026-09-14)

## Contexto

`resolveClientIp` pegava o **primeiro** endereço de `x-forwarded-for`. Proxy anexa ao **fim** da
cadeia; o começo é o que o cliente escreveu. Todo rate limit por IP das rotas anônimas
(`defineAnonymousRoute` com `rateLimit`) era contornável trocando o cabeçalho a cada requisição, e
cada chave falsa abria um balde novo no `Map` do limitador — que só varria baldes expirados, então
crescia sem teto dentro da janela.

## Topologia medida (2026-09-14)

| Host                                          | DNS                                             | Resposta                                                           |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `api.fernandes-transportadora.com.br`         | CNAME `mrg272l0.up.railway.app` → `69.46.46.90` | `server: railway-hikari`, `x-railway-edge: gru1`, **sem `cf-ray`** |
| `api.staging.fernandes-transportadora.com.br` | CNAME `sacpzi6e.up.railway.app` → `69.46.46.91` | idem                                                               |

A zona tem NS da Cloudflare (`kinsley`/`cartman`), mas os registros estão **só em DNS** (nuvem
cinza): nenhuma requisição passa pelo proxy da Cloudflare. Além disso o domínio `*.up.railway.app`
alcança o serviço direto, então nem ligar a nuvem laranja tornaria a Cloudflare **obrigatória**.

Existe **um** salto confiável: o edge do Railway. A documentação dele
(`networking/public-networking/specs-and-limits`) declara `X-Real-IP` como o IP remoto do cliente;
o comportamento em `X-Forwarded-For` não é documentado.

**O edge sobrescreve o `X-Real-IP` que o cliente manda — medido.** Quatorze `GET
/public/cnpj-info?cnpj=invalido` contra staging (limite de 12 por 10 minutos, conferido antes do
parse, então o 400 não tem efeito colateral e mesmo assim conta), cada um com um `X-Real-IP` forjado
diferente (`203.0.113.1` a `.14`) e sem `X-Forwarded-For` — o caminho em que o código anterior já
lia `x-real-ip`. Resultado: 400 do 1º ao 12º, **429 no 13º e no 14º**. Se o cabeçalho forjado
chegasse à API, cada requisição teria balde próprio e o 429 nunca viria.

## Decisão

1. O IP do cliente sai **só** do cabeçalho que o proxy conhecido escreve, escolhido por
   `CLIENT_IP_SOURCE` (validado em `environment.schema.ts`):
   - `x-real-ip` — **padrão**, a topologia medida;
   - `cf-connecting-ip` — só quando a Cloudflare com proxy for **obrigatória** (origem fechada a
     ela); em qualquer outra topologia é texto livre do cliente;
   - `x-forwarded-for` — para proxy que anexa à cadeia, contando `TRUSTED_PROXY_HOPS` (1–10)
     endereços do **fim**. Cadeia mais curta que os saltos declarados é ausência.
2. Valor ausente ou que não é endereço IP (`node:net` `isIP`) vira `unknown`: todo esse tráfego
   divide **um** balde — erra para limitar a mais, nunca a menos.
3. O limitador ganha teto (`DEFAULT_MAX_ENTRIES` = 50 000). Cheio, varre expirados — cada balde pela
   **própria** janela, porque a do chamador apagava balde vivo de rota com janela mais longa — e,
   se ainda cheio, despeja o mais antigo. Recusar chave nova negaria a rota a todo cliente novo;
   despejar só zera o contador de alguém, e com a chave vinda do edge isso exige IPs de verdade.

## Consequências

- Nenhuma variável nova precisa ser declarada no Railway: o padrão é o medido.
- A sobrescrita do `X-Real-IP` pelo edge é o que sustenta a decisão, e ela é **comportamento
  medido, não contrato documentado**. Depois do deploy, repetir a receita acima contra a rota
  anônima com `X-Forwarded-For` rotativo **e** `X-Real-IP` rotativo; o 429 tem de vir igual.
- Ligar a nuvem laranja **sem** trocar `CLIENT_IP_SOURCE` faz o `x-real-ip` virar IP da Cloudflare:
  clientes passam a dividir poucos baldes (limite a mais, não bypass). Quem ligar o proxy troca a
  variável **e** fecha a origem à Cloudflare na mesma mudança.
- O limitador continua em memória por processo: não soma entre réplicas (hoje `replicas: 1`).
