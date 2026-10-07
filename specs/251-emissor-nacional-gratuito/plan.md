# Plan — Feature 251

## Contexto (a conferir na T0.1 contra origin/staging)

- Pré-requisito: spec 250 em staging (seleção por env, `cTribNac` no perfil, vínculo de nota
  externa). Esta spec **herda** esses contratos; não os redefine.
- `@adatechnology/fiscal-provider` já assina XML e fala mTLS com a SEFAZ (CT-e 4.00, ADR-0013). Se a
  assinatura XMLDSig for reaproveitável, a DPS usa o mesmo caminho; **não importar internals
  `src/sefaz/*`** (CLAUDE.md) — encapsular em gateway da aplicação.
- Cofre A1: ADR-0004 (`@adatechnology/secret-envelope`, AAD por empresa/certificado). Hoje o
  cofre alimenta o CT-e; a NFS-e passaria a ler o mesmo certificado.

## Desenho (provisório até a Fase 0)

```
payload congelado ──► DPS 1.01 (XML) ──► assinar (A1) ──► [GZip+Base64?] ──► POST mTLS ADN
                                                                                 │
        write-back ◄── status pull ◄── GET NFS-e/DPS por chave ◄────────────────┘
```

- `nfse-national.client.ts` no worker (mesma forma de `NotaRpV2Client`: `issue`, `fetchStatus`,
  `cancel`, `fetchDocument`), um `createNationalNfseGateway` e a seleção por env.
- `nDPS` reservado no mesmo padrão da reserva de número do CT-e (transação, sem lacuna lógica).
- Parâmetros do município (alíquota, retenções, regime) lidos da API nacional **no momento da
  congelação do payload**, nunca na hora da transmissão (a reemissão não recalcula).

## Riscos e mitigação

| Risco                                           | Mitigação                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Município não aceita emissão direta             | T0.2 antes de qualquer código; se não aceita, a spec 251 vira ADR "não faremos"           |
| Certificado A1 vencido/senha errada em produção | Verificação de validade no cadastro e alerta de renovação (D-30)                          |
| Assinatura inválida só aparece na prefeitura    | Validar a DPS contra o XSD oficial e a assinatura contra a chave pública antes do POST    |
| Perder a Nota RP como contingência              | `NFSE_PROVIDER_API_VERSION` alternável até a decisão do [NEEDS CLARIFICATION] 3           |
| Homologação diverge de produção                 | Primeira emissão de produção de valor mínimo, aprovação humana, nota cancelada em seguida |
| Dobrar emissão (nota 74 + nova)                 | Reutiliza o vínculo de nota externa da spec 250 (T5.x)                                    |

## Contrato HTTP (API própria)

A definir na Fase 2 (cadastro/renovação do A1 da NFS-e e eventual campo de ambiente no perfil).
O contrato do emissor nacional é do Swagger da produção restrita e entra no `plan.md` na T0.3.
