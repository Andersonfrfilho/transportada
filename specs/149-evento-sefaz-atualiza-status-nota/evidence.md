# Spec 149 — Evidência

## T1 — fiscal gate · 2026-09-14

Pacote instalado: `@adatechnology/fiscal-provider@0.3.0-rc.7`
(`apps/worker-transportada/node_modules/@adatechnology/fiscal-provider` →
`node_modules/.bun/@adatechnology+fiscal-provider@0.3.0-rc.7`). Fonte conferida, só leitura, em
`~/Documents/personal/adatechnology-packages/packages/backend/fiscal-provider` (mesma versão `0.3.0-rc.7`).
Nada foi alterado nem publicado no pacote.

O worker não tinha XML de evento em `test/fixtures/` (só `cargo-layout-input.fixture.ts`), então a T1 criou um
fixture sintético no molde do fixture do próprio pacote (`test/fixtures/nfe-xml.fixture.ts` →
`buildNfeEventXml`) e passou pelo `importarNfeXml` **real** do pacote instalado:
`apps/worker-transportada/test/fiscal-provider-event/nfe-event-xml.fixture.ts` e
`apps/worker-transportada/test/fiscal-provider-event/nfe-event-fields.contract.ts` (entrypoint
`test/fiscal-provider-event.contract.test.ts`, incluído na lista `test` do `package.json` do worker).

### O que o pacote entrega

| Dado                         | Entrega?  | Prova                                                                                                                                                                 |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.type` = `tpEvento`    | sim       | `dist/types.d.ts:877` `NfeXmlEvent.type: string`; `dist/index.js:6210` (`parseEvent`, `requireFirstString tpEvento`)                                                  |
| `event.statusCode` = `cStat` | sim\*     | `dist/types.d.ts:884` `statusCode?: string`; `dist/index.js:6251` lê `cStat` **só de `retEvento/infEvento`**                                                          |
| `event.protocol`             | sim\*\*   | `dist/types.d.ts:883` `protocol?: string`; `dist/index.js:6244` — `nProt` do `retEvento`, com fallback para `nProt` do `detEvento`                                    |
| texto da CC-e (`xCorrecao`)  | **não**   | `NfeXmlEvent` (`dist/types.d.ts:877-886`) não tem o campo; `parseEvent` (`dist/index.js:6192-6260`, fonte `src/providers/NfeXmlImporter.service.ts:412-433`) não o lê |
| `DfeItem.situacao` (resNFe)  | sim\*\*\* | `dist/types.d.ts:794-795` (`cSitNFe: '1' \| '2' \| '3'`); `dist/index.js:6783` `situacao = String(resNFe.cSitNFe ?? "")`                                              |

\* Sem `retEvento` no XML (só `<evento>`), `statusCode` vem `undefined` — confirmado no teste. A D2 já trata:
sem `statusCode`, não aplica.

\*\* Sem `retEvento`, o `protocol` cai no `nProt` do `detEvento`, que no cancelamento (`110111`) é o protocolo
de **autorização da NF-e**, não o do registro do evento (teste "evento sem retEvento… nProt do detEvento"). A H2
deve gravar `protocol` só quando houver `statusCode` (ou documentar que, sem `retEvento`, o valor é o da NF-e).

\*\*\* `situacao` do `resNFe` sai de `parseDocZip` (interno, `dist/index.js:6758`), acionado só pela consulta
SOAP da distribuição; não há transporte injetável (`NfeDistribuicaoProvider.fetchSefaz` é privado), então a
prova é estática (tipo + linha do dist), não executada. Com `cSitNFe` ausente o valor é `""` (string vazia,
não `undefined`) — a política da T2 deve tratar `""` como "sem efeito". Na distribuição, o `procEventoNFe`
passa pelo `importarNfeXml` (`nfe-distribution-item.mapper.ts` → `xmlImporter.importXml`), então o
`statusCode` também chega pelo trilho da distribuição; o `parseDocZip` não o lê para `procEventoNFe`, mas o
worker não usa aquele caminho para evento.

### Valores reais do `importarNfeXml` (rc.7) sobre os fixtures

- Cancelamento `110111`, `cStat 135`: `{ accessKey: "35260711222333000181550010000000011000000013",
type: "110111", sequence: "1", statusCode: "135", protocol: "135260000000002" }`.
- Cancelamento por substituição `110112` com `cStat` `136`, `155` e `573`: `statusCode` chega igual ao do XML —
  o pacote não filtra; o filtro `{135,136,155}` da D2 é da aplicação.
- CC-e `110110`, `cStat 135` — objeto completo devolvido:
  `{"accessKey":"35260711222333000181550010000000011000000013","type":"110110","sequence":"1","occurredAt":"2026-07-20T13:00:00-03:00","description":"Carta de Correcao","protocol":"135260000000002","statusCode":"135","reason":"Evento registrado e vinculado a NF-e"}`
  — **sem o texto do `xCorrecao`**.

### Vermelho antes

Primeira versão do contrato afirmava que o evento normalizado da CC-e contém o `xCorrecao`:

```
(fail) fiscal provider event contract (spec 149 T1) > CC-e expõe o texto da correção (xCorrecao) no evento normalizado — D18
 6 pass
 1 fail
Ran 7 tests across 1 file.
```

Como a lacuna é do pacote (e mudá-lo exige aprovação), a asserção virou "ainda não expõe — D18 bloqueada":
quando o pacote passar a entregar o campo, o teste falha e obriga a H2 a gravar o texto.

### Gates

- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (raiz) → exit 0.
- `bun run --cwd apps/worker-transportada test` → **1207 pass, 0 fail**, 86 arquivos; linhas `(fail)`: 0.
  A suíte nova roda na lista (7 testes).
- Integração do worker: não aplicável — a T1 não toca persistência nem banco.
- Prettier `--check` nos arquivos alterados → limpo.

### Decisão pendente com o usuário (D18)

O `statusCode` (D2) e o `situacao` (D3) existem: T2/T3 seguem. O **texto da CC-e não existe** no rc.7 e a
aplicação não pode ler o XML por conta própria. Opções:

1. Mudar o pacote (`NfeXmlEvent.correctionText?: string`, lido de `detEvento/xCorrecao` em `parseEvent`),
   publicar versão nova (ex.: `0.3.0-rc.8`) e atualizar o worker — **exige aprovação para mudar e publicar**.
2. Seguir sem o texto: `nfe_events.correction_text` fica `null` e a tela da H4 mostra só "Carta de correção"
   até o pacote entregar o campo (o teste de lacuna avisa quando).
