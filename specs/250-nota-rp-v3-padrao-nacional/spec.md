# Feature 250 — A NFS-e passa para a Nota RP v3 (padrão nacional)

## Problema e resultado

Em 06/10/2026 a emissão de NFS-e de Ribeirão Preto passou a falhar com
`NOTA_RP_HTTP_403 — Esta empresa não é válida para esta versão da API. Utilize a versão v3.` O
suporte da Nota RP (Valéria, 07/10/2026) confirmou: **Ribeirão Preto passou ao padrão nacional**, a v2
(ABRASF) segue no ar mas recusa a empresa, e a v3 é o caminho. A documentação pública da v3 ainda diz
o contrário ("exceto Ribeirão Preto") — está desatualizada, não a integração.

A ADR-0029 escolheu a v2 exatamente porque a v3 não atendia o município e deixou escrito: _"quando a
v3 passar a atender RP, a troca é do adaptador, atrás da porta que já existe"_. É isso que esta spec
faz. O desenho assíncrono (outbox → consumidor → write-back → `nfse.status.pull`) **não muda**.

**Resultado:** uma nota de serviço criada, aprovada e reemitida no painel sai pela v3 e chega a
`authorized` com número, data e chave de acesso — sem tocar a nota manual já emitida no portal.

## Fatos medidos (07/10/2026)

- Nota 74, emitida à mão no portal (06/10, R$ 2.601,95, Zaragoza), ficou **aceita** com:
  `cTribNac 160201` · `cTribMun 160101` · `NBS 105011900` · `opSimpNac 3` (ME/EPP) · `tribISSQN 1` ·
  `tpRetISSQN 1` (ISS não retido) · `pAliq 2.00` · `pTotTribSN 2.00` · `dCompet` = dia da emissão.
  Evidência: XML guardado fora do repo (contém certificado), valores transcritos em `evidence.md`.
- O perfil de emissão guarda hoje `municipalTaxationCode = 160107` e `serviceListItem = 1602`: o par
  **ABRASF** válido na v2 (cron-transportada.md, "E215"). No padrão nacional o par aceito é
  `cTribNac 160201` + `cTribMun 160101`.
- A v3 autentica por **três** cabeçalhos: `X-Auth-User-Token`, `X-Auth-CNPJ` e `X-Auth-IM`. A spec 040
  provou que a v2 recusava o `X-Auth-CNPJ` (403 "empresa não migrada para a v3") — o sintoma de
  agora é o inverso. O segredo selado já guarda token e callback; CNPJ e IM já estão em claro na
  credencial. **Não há segredo novo.**
- Emissão v3: `POST /api/v3/nota/emitir` → `{success, id_nota}`; status por
  `GET /api/v3/nota/listar?id_nota=` (`Criada|Enviando|Pendente|Sucesso|Falha|Cancelada`, com
  `numero`, `data_emissao`, `chave_acesso`); `cancelar` só vale para nota com chave de acesso;
  `pdf`/`xml` em base64. Limite: **1 req/s, burst 3**. `flags.hash_pedido` é idempotência por 24 h
  (segundo pedido igual → `409` com o `id_nota` original).
- **Não há sandbox nem preço documentado** (ADR-0035 segue valendo: um ambiente só).

## Decisões do usuário (07/10/2026)

- Regime da transportadora: **Simples Nacional**.
- Fazer a v3 **primeiro**, para corrigir; depois a troca para o emissor nacional gratuito (spec 251).
- O `cTribNac` vem do XML da nota emitida (`160201`).

## Decisões por delegação

- **Seleção v2 × v3 por variável de ambiente** (`NFSE_PROVIDER_API_VERSION`, `v2` | `v3`, padrão `v2`
  até a virada). Distribuição é um deploy por transportadora (ADR-0021): a versão é do ambiente, não
  da linha de dados, e a virada é reversível sem migration.
- `cTribNac` vira **coluna do perfil** (`national_taxation_code`), não derivação do item da LC 116 —
  o desdobro (`01`) não se deduz do item, e a prefeitura recusa par errado.
- `regime` é **omitido** no corpo: a v3 usa o regime cadastrado da empresa.
- `flags.hash_pedido` = `attemptId` (já é único e estável entre reentregas da mesma tentativa).
- `409` de `hash_pedido` repetido vale como **aceito** com o `id_nota` devolvido (replay seguro).
- O webhook usa a **mesma rota anônima** (`/public/nfse-callbacks/:token`): ela só antecipa a consulta,
  então o corpo e o `X-Signature` opcional ficam fora do caminho crítico (ADR-0029 §2 intacto).

## Requisitos

1. Com `NFSE_PROVIDER_API_VERSION=v3`, emitir, consultar, cancelar e baixar PDF/XML usam a v3; com
   `v2`, nada muda (contratos da v2 continuam verdes).
2. O perfil de emissão ganha `national_taxation_code` (6 dígitos), com migration, `rollback.sql`,
   snapshot, campo na aba Configurações e validação. Sem ele, a nota **não** é criada na v3: erro de
   bloqueio com nome (padrão da spec 044), nunca um 422 da prefeitura.
3. O payload congelado leva `nationalTaxationCode`; a reemissão pode corrigi-lo (diálogo e API).
4. O corpo v3 é montado só por renomeação/formatação do payload congelado — nada recalculado
   (regra da reemissão, ADR-0029 §1). A tabela de mapeamento está em `plan.md`.
5. Respeitar 1 req/s por conta: o worker serializa as chamadas à Nota RP.
6. Rejeição da prefeitura passa a ser **logada** com código e mensagem saneada
   (`nfse_issuance_provider_outcome`, já em staging — commit `84824299a`).
7. As duas cópias do cliente (worker e cron, se o cron ainda tiver a sua) mudam juntas.
8. Notas emitidas fora do sistema (como a 74) têm um caminho: **vincular** a nota rejeitada à nota
   manual (número + chave) em vez de reemitir — evita duplicar nota e ISS. Ver `plan.md`, Fase 5.

## Fora do escopo

- Emissor Nacional/ADN gratuito, certificado A1 e mTLS → spec 251.
- Regime Lucro Real/Presumido (PIS/COFINS e IBS/CBS obrigatórios): a transportadora é Simples. O
  adaptador falha com erro nomeado se a Nota RP exigir o grupo, em vez de inventar tributo.
- Emissão em massa pela planilha da Nota RP.
- Homologação: não existe. A primeira emissão real é de valor mínimo e **pede aprovação humana**.

## [NEEDS CLARIFICATION] — a spec não vira prompt de execução até fechar

1. **`tributos_aproximados.aliquota_simples_nacional`.** A v3 exige e documenta mínimo de 4,50%
   (alíquota efetiva do anexo). A nota manual saiu com `pTotTribSN 2.00`. Qual valor vale para a
   transportadora, e a Nota RP aceita 2,00? (Pergunta à Valéria/contato@notarp.com.br.)
2. **`ISS retido pelo tomador`.** O diálogo de reemissão exibia "retido" sem valor visível; a nota
   manual saiu **não retida** (`tpRetISSQN 1`). Confirmar o valor do perfil antes de migrar.
3. **`cTribMun` do perfil.** `160107` (ABRASF) ou `160101` (nacional, aceito na nota 74)? Muda no
   perfil na virada; confirmar com o usuário que nenhuma outra transportadora/CNPJ do perfil depende
   de `160107`.
