# Feature 253 — O relatório de viagens sai em planilha, uma linha por nota

## Problema e resultado

Hoje `/trips` só cancela e encerra em lote. Quem precisa levar a situação das viagens para uma
reunião ou para o cliente monta a planilha à mão. O resultado: o operador marca viagens (ou só
filtra), clica **Exportar relatório** e recebe um `.xlsx` com timbre da empresa, **uma linha por
nota**, pintado pela situação da viagem.

## Decisões do usuário (2026-10-07)

- A exportação vale para as viagens **selecionadas**; sem seleção, vale para o que o **filtro atual**
  mostra.
- Os filtros do relatório incluem **nota** e **contratante** e **imitam os filtros da aba de notas**
  (`NfeDocumentFilterPanel`).
- Cores da linha: **branco** = no barracão · **roxo** = em rota · **verde** = finalizada ·
  **verde-água** = devolução total.
- A exportação também fica disponível na **tela de notas**, para quem prefere exportar por lá (2026-10-07).
- Há API nova (o que existe não traz nota, contratante e situação da nota na mesma resposta).

## Decisões por delegação

- **Situação da linha** (função pura, uma só, na API; o front só pinta):
  `cancelled` → fora do relatório · `awaiting_crew, draft, route_planned, separating, loading` →
  `warehouse` (branco) · `dispatched, in_transit, on_delivery_route` → `on_route` (roxo) ·
  `completed` com ao menos uma nota entregue → `finished` (verde) · `completed` com **todas** as
  notas `returned` → `total_return` (verde-água). Listas vêm de `trip-state.policy.ts`
  (`TRIP_ON_ROAD_STATUSES` etc.), nunca copiadas.
- **Nota liberada** (`trip_documents.released_at` preenchido) **não** entra: já não pertence à viagem.
  A conta de "todas devolvidas" também a ignora.
- **Contratante** = emitente da nota casado em `contractors` por `tax_id` (ADR-0048, spec 248). Nota
  sem contratante cadastrado sai com o nome do emitente e entra no filtro por "Sem cadastro".
- **Filtros no servidor**, não em memória: o relatório pode passar de uma página. Campos: busca por
  número/série/chave, contratante (múltiplo), cidade e UF do destinatário (múltiplo), valor com
  operador (`eq|neq|gt|gte|lt|lte`), situação da nota (`separation_status`, múltiplo) — mais os filtros
  de viagem que já existem (status, veículo, motorista, período, canhoto pendente).
- **Teto de 5 000 linhas** por exportação; acima, 422 `TRIP_REPORT_TOO_LARGE` dizendo o teto.
- **Permissão**: `fleet.read` ou `trip.report-on-behalf` (a mesma do `GET /trips`); a coluna de valor
  só com `trip.financials`.

## Requisitos

- **RF1** `GET /trip-document-report` devolve, por nota de viagem, os campos: viagem (id, situação),
  nota (número, série, chave), contratante, destinatário (nome, cidade, UF), valor, situação da nota,
  datas de entrega/devolução, motivo da devolução. Cursor e `limit` até 100 por página.
- **RF2** Aceita `tripIdIn` (até 100) **ou** os filtros; se vierem os dois, os dois valem (E).
  Chave desconhecida é 400; todos os erros de validação juntos (`apis.md`).
- **RF3** A situação (`warehouse|on_route|finished|total_return`) é calculada pelo servidor numa função
  pura e vem em cada linha.
- **RF4** O painel de `/trips` ganha os filtros de nota e contratante, com os mesmos primitivos e
  rótulos da aba de notas (`MultiSelect`, `SearchableSelect`, `Select`), e pílulas no
  `FilterPills`.
- **RF5** O botão **Exportar relatório** fica na barra de lote (com seleção) e na barra de filtros
  (sem seleção, exporta o filtro). O arquivo sai por `useSpreadsheetExport` (timbre, logo, quem
  exportou); o front busca todas as páginas até o teto e mostra progresso.
- **RF6** O layout de planilha aceita **cor por linha** (`rowTone` opcional) sem quebrar quem já usa
  zebra; linha com tom ignora a zebra. Tons: branco `#FFFFFF`, roxo `#E4D7F5`, verde `#CDEBD3`,
  verde-água `#CFF1EE`, texto sempre escuro (contraste ≥ 4,5:1 conferido).
- **RF7** A planilha traz uma **legenda** das quatro cores logo abaixo do título.
- **RF9** A aba de notas (NF-e) também exporta o mesmo relatório: com notas selecionadas, só elas;
  sem seleção, o que o filtro atual da aba mostra. Mesmo endpoint, mesma planilha e mesmas cores;
  o botão é o mesmo componente. Nota que **não está em viagem** não entra (sem situação de viagem para
  pintar) e o aviso diz quantas ficaram de fora.
- **RF10** Segundo relatório, **Exportar canhotos (PDF)**: um `.pdf` A4 em retrato com **quantos canhotos
  couberem em cada página** (fluxo, não número fixo), na ordem das notas. Cada item é um bloco com as
  informações da nota numa faixa no alto (número, série, contratante, destinatário, cidade/UF, valor só
  com `trip.financials`, viagem e situação, situação da nota, data de entrega ou devolução e motivo) e,
  abaixo dela, a **imagem do canhoto na horizontal, 100% da largura útil**, com 5 a 7 cm de altura
  conforme a proporção da foto. Um bloco nunca é cortado entre duas páginas: se não cabe no que sobrou,
  vai inteiro para a seguinte. Na prática, imagens de ~5 cm rendem 3 blocos por página e de ~7 cm, 2.
  Cabeçalho com o timbre da empresa e rodapé "Página X de Y" e quem exportou. Mesmo escopo e filtros do
  RF5/RF9 (selecionadas, senão filtradas), nos botões de viagens e de notas.
- **RF11** Só o canhoto (`kind = photo`) entra; assinatura e fotos de carga ficam de fora. Nota sem
  canhoto ganha um bloco de aviso ("Canhoto não anexado") com as informações dela e a mesma altura, para o PDF
  fechar com a lista de notas. Nota com mais de um canhoto (reentrega) ocupa um bloco por canhoto,
  do mais antigo ao mais novo, marcadas "1 de 2", "2 de 2". CPF/telefone fora das páginas.
- **RF12** O PDF é gerado no servidor em streaming com `pdfkit` (já na API), lendo o objeto original
  do bucket privado; bucket e chave nunca saem. Imagem é ajustada à largura útil sem distorcer; se a proporção passar de 6 cm de altura, limita-se a 7 cm e centraliza; se for menor que 5 cm, mantém a proporção (nunca estica). Foto girada (vertical) é rotacionada 90° para ficar horizontal, usando a orientação EXIF quando houver. Teto de **200 canhotos** por PDF; acima, 422 `TRIP_PROOF_REPORT_TOO_LARGE` informando o
  teto. Mesma permissão do `GET /trips/:id/delivery-proofs`.
- **RF8** Tudo em i18n (pt-BR e en, acentuado), sem PII em log; CPF/telefone fora das colunas.

## Fora do escopo

- Imagens dentro do `.xlsx` (o arquivo incharia): as imagens vão no PDF, a planilha segue só com dados.
- Assinatura e fotos de carga no PDF; ZIP de imagens (pode virar spec futura).
- Exportar PDF ou CSV; agendar envio por e-mail; relatório financeiro por viagem.
- Mudar a lista de viagens ou os filtros da aba de notas (esta ganha só o botão de exportar; o painel de
  viagens ganha os filtros novos).
- Estado novo de viagem para devolução total — ela é **derivada**, não gravada.
