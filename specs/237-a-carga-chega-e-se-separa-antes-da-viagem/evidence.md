# Evidência — 237

## T4.0 (parcial) — comparação planilha × XML reais (2026-10-03)

Corpos: 346 XMLs (07/07–28/08) e 277 XMLs (23/09 e 25/09, `ID1026570_procNFe_parte1`) do mesmo emitente;
planilhas `FR-24-09` (187 linhas), `FR-28-09` (107), `FR-01-10` (191) e `FR-05-10` (194). Os últimos XMLs
(30/09 e 02/10) não foram fornecidos. **Não é a T4.0 completa**: falta o conjunto inteiro de XMLs.

| Medida                                                 | Resultado                                   |
| ------------------------------------------------------ | ------------------------------------------- |
| `Text001` ou `Company` em algum XML                    | **0** (texto bruto, atributos incluídos)    |
| valor + CEP → 1 nota                                   | FR-24-09 **139/187**; FR-28-09 **96/107**   |
| valor + peso → 1 nota                                  | FR-24-09 **146/187**; FR-28-09 **91/107**   |
| ambíguas (valor + CEP)                                 | 0 e 2                                       |
| desvio do peso (`PESO TOTAL` × `pesoB`)                | **0** (mediana e p90)                       |
| cidade igual nos vínculos                              | 139/139                                     |
| nome do destinatário igual                             | 115/139                                     |
| `NroCarga` ↔ `RouteName`                              | **1:1** (10×10 e 8×8)                       |
| `Company` ↔ CNPJ do destinatário                      | **1:1**, 212 códigos, 0 conflitos           |
| e-mail (25/09 16:33) × emissão das 91 notas vinculadas | **todas depois**: 2,7–4,2 h (mediana 2,9 h) |
| lacres / cargas / notas                                | 3 / 18 / 277                                |

Reprodução: ler `infNFe` de cada XML (`ide/nNF`, `ide/dhEmi`, `total/ICMSTot/vNF`, `dest/enderDest/CEP`,
`transp/vol/pesoB`, `infAdic/infCpl`) e cruzar com a aba `IMPORTAÇÃO` (colunas `C`, `D`, `F`, `H`, `M`). O
resultado completo no banco sai de `consulta-recebimento-vs-xml.sql`.

| soma de valor/peso por `RouteName` × por `NroCarga` | igual ao centavo em **8/10** (24/09) e **7/8** (28/09) |
| NF que junta vários pedidos do mesmo cliente | confirmado: soma por cliente fecha em 13/14, 22/24, 23/25, 10/10 |
| `NroCarga` ou lacre em célula das planilhas | **0** (as duas abas, as quatro planilhas) |

## T1.1 — ADR-0094 e o modelo do perfil (2026-10-03)

- **Número:** `git fetch` + `docs/adr/` de `origin/staging` (última: `0093-o-ajudante-e-um-perfil.md`), dos
  worktrees em `.claude/worktrees/*` e `../transportada-wt/*` e de todas as branches de `origin`: nenhum
  `0094+`. ADR: `docs/adr/0094-o-recebimento-da-carga-antes-da-viagem.md`.
- **Revisão `architect` (opus), passada separada, sem editar arquivo:** veredito **APROVADO COM AJUSTES**.
  Acolhidos:
  - **A1** as regras valem para a chegada que ainda vai nascer (a chegada copia `separation_due_at` e o
    prazo; editar o perfil não refaz chegada aberta); `separation_window_hours` nulo = sem relógio.
  - **A2** `PUT` exige **todas** as chaves (`null` explícito): campo omitido é `400`, para um painel em
    cache não apagar uma coluna futura sem erro; reenviar o corpo do `GET` não audita.
  - **A3** (parcial) o padrão continua expressão (o formato do `infCpl` de outro emitente é desconhecido),
    com a regra mínima da revisão: flag `u`, exatamente um grupo de captura, sem quantificador aninhado,
    sem grupo quantificado com alternação, sem referência para trás, sem lookaround. A troca por rótulo
    ficou registrada como alternativa.
  - **A4** `notes` removido (`contractors.notes` já existe); `preview_sheet_name` 1..31; com prévia ligada
    o mapa exige `routeName`, `value`, `weightKg`; coluna repetida comparada normalizada.
  - **A5** texto: `match_window_days`/`weight_tolerance_percent` são parâmetros do algoritmo (`NOT NULL`),
    não regra do contratante.
  - Módulo novo `src/cargo-receiving/`; `GET` com `fleet.read` (como a leitura do contratante), `PUT`
    com `settings.manage`; caminho `/contractors/:id/receiving-profile` (mesma forma de
    `/contractors/:id/contacts`).
- **Divergências do RF1 da spec (registradas no ADR):** `preview_sender_allowlist` adiado para a Fase 4b
  (depende da D6); `grouping` não vira coluna (rota × cidade é decisão fixa do usuário).
- **Agregado `Contractor` não muda:** o perfil é recurso separado; as guardas de chave exata do painel
  não precisam de alteração.
