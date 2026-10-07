# Evidência — Feature 250

## E1 — Rejeição que originou a spec (07/10/2026)

Nota de serviço da Comercial Zaragoza (R$ 2.601,95, 32 NF-e), reemitida pelo painel:
`Última falha: NOTA_RP_HTTP_403 — Esta empresa não é válida para esta versão da API. Utilize a
versão v3.` Três tentativas, estado `Rejeitada`.

Causa anterior, já corrigida (PR #142): a segunda reemissão da mesma nota estourava
`nfse_issuance_attempts_company_invoice_kind_fingerprint_unique` (23505 → 500). O log do resultado da
prefeitura entrou no PR #143.

## E2 — Atendimento da Nota RP (07/10/2026)

Suporte (Valéria): "Sim, ribeirão está utilizando o padrão nacional e o webservice antigo ainda está
ativo"; "pode usar essa V3". Documentação indicada: <https://www.notarp.com.br/docs#overview>. A
documentação v3 ainda diz "exceto Ribeirão Preto" (desatualizada).

## E3 — Nota 74 emitida à mão no portal (06/10/2026 10:43, `ambGer 1`)

Valores transcritos do XML (o arquivo fica fora do repositório: leva certificado):

| Campo                                | Valor                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `cTribNac`                           | `160201` ("Outros serviços de transporte de natureza municipal")              |
| `cTribMun`                           | `160101` ("16.01.01 Transporte de Natureza Municipal")                        |
| `cNBS`                               | `105011900`                                                                   |
| `regTrib`                            | `opSimpNac 3` · `regApTribSN 1` · `regEspTrib 0`                              |
| `tribISSQN` / `tpRetISSQN` / `pAliq` | `1` / `1` (ISS não retido) / `2.00`                                           |
| `totTrib.pTotTribSN`                 | `2.00`                                                                        |
| `dCompet`                            | dia da emissão (`2026-10-06`)                                                 |
| `IBSCBS`                             | `finNFSe 0` · `cIndOp 070101` · `indDest 0` · `CST 000` · `cClassTrib 000001` |
| Tomador                              | CNPJ, endereço completo (Taubaté `3554102`), `fone`                           |
| Valor / ISS                          | `vServ 2601.95` · `vISSQN 52.04`                                              |

Descrição enviada à mão: "Prestação de serviço de transporte rodoviário de cargas em Ribeirão
Preto." (sem a lista das 32 NF-e que o sistema gera).

## E4 — Contrato v3 (swagger.yaml, 100 KB, lido em 07/10/2026)

Rotas: `empresa/*`, `nota/{listar,emitir,cancelar,pdf,xml,remover}`, `dominio/*`. Autenticação:
`X-Auth-User-Token` + `X-Auth-CNPJ` + `X-Auth-IM`. Limite 1 req/s (burst 3). `hash_pedido`:
idempotência por 24 h (`409` com o `id_nota` original). Changelog: 10/08/2026 (webhook assinado,
41 reentregas), 30/07/2026 (`valor_deducoes`), 12/04/2026 (`pis_retido`/`cofins_retido`).

## E5 — Esclarecimentos fechados (T0.3, 07/10/2026)

Respostas do usuário: alíquota de `tributos_aproximados` **2,00%** (igual à nota 74); ISS **não
retido**; `cTribMun` **o do XML (160101)**. Risco aceito: a v3 documenta mínimo de 4,50%. Mitigação:
valor em coluna do perfil e medição na primeira emissão real (T6.2).
