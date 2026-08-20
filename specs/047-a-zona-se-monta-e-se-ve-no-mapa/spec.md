# 047 — A zona se monta na tela e se vê no mapa

## Problema

A aba **Regiões** que a 045 entregou é somente leitura. `fleetClient.service.ts` tem
`listFreightRegions` e mais nada: a API ganhou `POST`, `PUT`, `DELETE` e
`POST /freight-regions/import`, todos testados, e **nenhuma tela os chama**.

A consequência é que não existe caminho pelo produto para pôr a tabela de frete lá dentro. A única
porta aberta hoje é `scripts/freight-region-import.py`, rodado por fora, com token de máquina, por
quem tem o repositório na mão. Uma transportadora que compre a instalação não consegue cadastrar a
própria tabela — e a nossa, se errar um preço, precisa de alguém com terminal para corrigir uma
célula.

E há uma segunda metade. Ler 29 rotas e 83 cidades numa tabela não responde à pergunta que o
operador faz de verdade: _essa zona pega até onde?_ Zona é geografia, e uma lista alfabética de
nomes de cidade é a pior forma de ler geografia. Hoje o único jeito de saber que Barretos Zona 3
vizinha Jaboticabal Zona 1 é conhecer o interior de São Paulo de cabeça.

## Objetivo

A empresa monta e corrige a tabela de frete pelo produto — zona por zona, cidade por cidade, preço
por classe — e vê no mapa o desenho do que acabou de montar.

## Decisões

**A cidade entra dos dois jeitos.** Buscar uma a uma na lista do IBGE serve ao ajuste do dia a dia
("faltou Colina nesta zona"); colar uma lista de uma vez serve a montar zona nova, que é quando se
tem dez nomes numa planilha e nenhuma paciência para dez buscas. As duas portas caem no mesmo lugar:
nome canônico do IBGE. O que foi colado e não casou não entra em silêncio — volta na tela como
**não reconhecido**, com o que foi digitado, para a pessoa decidir.

**O mapa não tem `iframe` e não tem tile.** O `ADR-0037`, escrito nesta mesma branch, fecha
`frame-src 'none'` e diz que o `iframe` do mapa era o único do bundle. Este mapa não o reabre: ele é
**SVG desenhado na própria página** a partir da malha municipal que o IBGE publica em GeoJSON
(`/api/v3/malhas/estados/{uf}?intrarregiao=municipio&qualidade=minima` — 310 KB para São Paulo
inteiro, com os 645 municípios). Sem `iframe`, sem servidor de tiles, sem imagem de terceiro: um
`fetch` de geografia pública, e daí em diante é desenho nosso.

Isso também é o que separa este mapa do que a 046 removeu. Lá o que saía do navegador era a
**coordenada da residência de uma pessoa física**, e ia para um `iframe` de terceiro junto do
`Referer` da instalação. Aqui o que sai é uma sigla de UF, e o que volta é o contorno dos municípios
daquele estado. Não há pessoa nenhuma na requisição.

**O município casa por nome canônico, não por código guardado.** A tela já carrega
`/api/ibge/municipios/v1/{uf}` para o seletor de cidade — o mesmo `{codigo_ibge, nome}` que o
formulário do motorista usa. É dessa lista que sai o código para casar com o `codarea` do polígono.
Guardar `ibge_code` em `freight_region_cities` seria mais robusto e custaria migration, mudança no
`citySchema` `.strict()`, mapper, repositório, serializer e parser de importação — para ganhar
robustez em linhas que **vieram do próprio seletor** e portanto casam sempre. Fica de fora: esta
spec não toca na API.

Quem paga o preço dessa escolha é a linha legada, importada do CSV com a grafia do cliente. Ela é
casada por dobra (caixa alta, sem acento, sem pontuação, espaço único) e, se ainda assim não casar,
aparece na tela como **cidade fora do mapa**, nomeada. Sumir do desenho sem aviso seria pior que não
ter desenho.

**Clicar no município edita a zona aberta.** Enquanto uma zona está em edição, clicar num município
do mapa o acrescenta ou o remove dela. É a razão de o mapa estar nesta spec e não em outra: o pedido
foi _tela de preenchimento_, e apontar é a forma natural de preencher geografia. Fora da edição o
mapa é leitura.

**A importação por arquivo continua existindo, e ganha tela.** O CRUD não substitui a carga em
massa: a primeira carga de uma instalação nova são 29 rotas, e ninguém as digita. O seletor de
arquivo entrega os dois CSV como texto para a rota que já existe, e mostra o resumo
`{created, updated, deactivated}` que ela devolve.

**Zerar continua sendo não atender.** A grade de seis classes aceita valor vazio, e vazio não vira
linha de preço — é a mesma regra que o parser de importação aplica (`if (Number(value) === 0)
continue`). A tela diz isso com palavra, não com um zero que parece preço.

## Fora de escopo

- **Qualquer mudança na API.** As cinco rotas de `freight-regions` ficam como a 045 as deixou.
- **Coordenada por cidade no banco.** Sem coluna nova, sem migration.
- **Mapa de rota, rastreamento ou geocerca.** O `ADR-0037` já disse o que isso exigiria — provedor
  contratado, chave e DPA. Aqui é polígono estático de município.
- **Mapa fora da aba Regiões.** O formulário de motorista não ganha mapa nenhum; a 046 o removeu de
  lá por motivo que continua valendo.
- **Histórico de vigência do preço.** Reajuste segue sendo reimportação, como na 045.

## Critérios de aceite

1. A aba **Regiões** cria, edita e apaga zona pelo produto, chamando `POST`, `PUT` e `DELETE
/freight-regions`; `PUT` leva `expectedVersion` e o conflito de versão vira mensagem, não erro
   cru.
2. O formulário de zona tem código, nome, cidades e a grade de seis classes; classe sem valor não
   vira linha de preço.
3. A cidade entra por busca na lista do IBGE **e** por lista colada; o que não casou volta nomeado
   como não reconhecido, e não é gravado.
4. A aba importa os dois CSV por seletor de arquivo e mostra `{created, updated, deactivated}`.
5. O mapa desenha os municípios do estado em SVG, colore por zona, e **não existe `iframe` nem
   `<img>` de terceiro** no caminho — contrato falha se aparecer.
6. Cidade cadastrada que não casa com nenhum polígono aparece na tela como "fora do mapa", nomeada.
7. Com uma zona em edição, clicar num município o acrescenta ou o remove da zona.
8. `https://servicodados.ibge.gov.br` está no `connect-src` da CSP que a 046 T008 publica.
9. Toda a aba é guardada por `settings.manage` para escrever e `fleet.read` para ler, como a 045
   definiu — sem `settings.manage` a aba mostra a tabela e o mapa, e nenhum botão de escrita.
10. Texto pt-BR acentuado nos dois `*.locale.json`; `locale-accents` verde.
11. `make check` verde.

## Riscos

**A malha de São Paulo é 310 KB por estado.** Numa instalação que opere em cinco UFs isso é 1,5 MB
de GeoJSON. O mapa carrega **sob demanda, por estado presente nas zonas**, e a resposta do IBGE é
cacheável pelo service worker do PWA. Se o volume incomodar, o passo seguinte é simplificar o
polígono no cliente, não trocar de fonte.

**O IBGE pode estar fora do ar.** O mapa é acessório: sem malha, a aba continua listando e editando,
e mostra o aviso de que o desenho não carregou. Nenhum caminho de escrita depende dele.

**A dobra de nome pode casar duas cidades homônimas dentro da mesma UF.** Não há homônimo dentro de
uma UF na tabela do IBGE, então a dobra é segura por UF — e é por UF que a malha é carregada. Entre
UFs, `city` já viaja com `state`.
