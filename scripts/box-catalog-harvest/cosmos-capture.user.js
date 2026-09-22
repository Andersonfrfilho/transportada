// ==UserScript==
// @name         TransportAdA — captura assistida de caixa
// @namespace    transportada
// @version      1.2.0
// @description  Cosmos: lê a caixa na página que VOCÊ abriu. Outros sites: selecione a medida e aperte Alt+C (caixa) ou Alt+U (unidade).
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @connect      127.0.0.1
// ==/UserScript==

// Copyright (c) 2026 Anderson — Ada Technology. Licença: proprietária.
// Não navega sozinho: todo avanço e toda captura fora do Cosmos é um clique ou atalho seu.

;(function captureCarton() {
  'use strict'

  const SERVER_URL = 'http://127.0.0.1:53999'
  const COSMOS_PRODUCT_PATH = /^https:\/\/cosmos\.bluesoft\.com\.br\/produtos\//
  const TOKEN_KEY = 'captureToken'
  const FALLBACK_KEY = 'fallbackTarget'
  const MAX_SNIPPET_LENGTH = 4000
  const EDGE_PATTERN = /(comprimento|largura|altura|profundidade)\s*:?\s*([\d.,]+)\s*(mm|cm|m)\b/gi
  const TRIPLE_PATTERN = /([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*(mm|cm|m)\b/i
  const WEIGHT_PATTERN = /peso\s*bruto\s*:?\s*([\d.,]+)\s*(kg|g)\b/i
  const UNIT_WEIGHT_PATTERN = /(?:peso(?:\s*(?:bruto|l[ií]quido))?\s*:?\s*)?([\d.,]+)\s*(kg|g)\b/i
  const CAPTURE_KINDS = {
    carton: { key: 'KeyC', label: 'caixa', shortcut: 'Alt+C' },
    unit: { key: 'KeyU', label: 'unidade (o produto na prateleira)', shortcut: 'Alt+U' },
  }
  const QUANTITY_PATTERN = /(?:quantidade|unidades)(?:\s*(?:na|por)\s*caixa)?\s*:?\s*(\d+)/i
  const CARTON_GTIN_PATTERN = /\b([1-8]\d{13})\b/

  const isCosmosProductPage = COSMOS_PRODUCT_PATH.test(window.location.href)

  if (isCosmosProductPage) {
    GM_registerMenuCommand('Configurar token do servidor local', () => {
      const token = prompt('Token impresso pelo assisted-capture-server:')
      if (token) GM_setValue(TOKEN_KEY, token.trim())
    })
  }

  function requestServer(method, path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: `${SERVER_URL}${path}`,
        headers: {
          'Content-Type': 'application/json',
          'X-Capture-Token': GM_getValue(TOKEN_KEY, ''),
        },
        data: body ? JSON.stringify(body) : undefined,
        onload: (response) => resolve(JSON.parse(response.responseText)),
        onerror: () => reject(new Error('servidor local fora do ar')),
      })
    })
  }

  function findCartonSection(text) {
    const start = text.search(/caixa|embalagem|dados log[ií]sticos/i)
    return start === -1 ? '' : text.slice(start, start + MAX_SNIPPET_LENGTH)
  }

  function extractEdges(text) {
    const edges = {}
    for (const match of text.matchAll(EDGE_PATTERN)) {
      const name = match[1].toLowerCase()
      if (!edges[name]) edges[name] = { value: match[2], unit: match[3].toLowerCase() }
    }
    if (Object.keys(edges).length >= 3) return edges
    const triple = text.match(TRIPLE_PATTERN)
    if (!triple) return edges
    const unit = triple[4].toLowerCase()
    return {
      lado1: { value: triple[1], unit },
      lado2: { value: triple[2], unit },
      lado3: { value: triple[3], unit },
    }
  }

  function extractCarton(text) {
    const weight = text.match(WEIGHT_PATTERN)
    const quantity = text.match(QUANTITY_PATTERN)
    const cartonGtin = text.match(CARTON_GTIN_PATTERN)
    return {
      edges: extractEdges(text),
      grossWeight: weight ? { value: weight[1], unit: weight[2].toLowerCase() } : undefined,
      unitsPerCarton: quantity ? Number(quantity[1]) : undefined,
      cartonGtin: cartonGtin ? cartonGtin[1] : undefined,
    }
  }

  /** Spec 163: a unidade vai em `unitEdges`/`unitGrossWeight` — nunca no lugar da caixa. */
  function extractUnit(text) {
    const weight = text.match(UNIT_WEIGHT_PATTERN)
    return {
      edges: {},
      unitEdges: extractEdges(text),
      unitGrossWeight: weight ? { value: weight[1], unit: weight[2].toLowerCase() } : undefined,
    }
  }

  function createButton(label, onClick) {
    const button = document.createElement('button')
    button.textContent = label
    button.style.cssText = 'margin:8px 6px 0 0;padding:4px 10px;cursor:pointer'
    button.addEventListener('click', onClick)
    return button
  }

  function renderPanel(lines, buttons = []) {
    document.getElementById('transportada-capture-panel')?.remove()
    const panel = document.createElement('div')
    panel.id = 'transportada-capture-panel'
    panel.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#111;color:#fff;' +
      'padding:12px 14px;border-radius:8px;font:13px/1.4 system-ui;max-width:360px;box-shadow:0 4px 16px #0006'
    const text = document.createElement('div')
    text.innerText = lines.join('\n')
    panel.appendChild(text)
    for (const button of buttons) panel.appendChild(button)
    document.body.appendChild(panel)
  }

  function bindNextShortcut(nextUrl) {
    if (!nextUrl) return
    document.addEventListener('keydown', (event) => {
      if (event.altKey && event.code === 'KeyN') window.location.href = nextUrl
    })
  }

  function openSearch(query) {
    GM_openInTab(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { active: true })
  }

  function describeEdges(edges) {
    return Object.entries(edges).map(([name, edge]) => `${name}: ${edge.value} ${edge.unit}`)
  }

  function renderFallback(captured, next, productName) {
    GM_setValue(FALLBACK_KEY, {
      cartonGtin: captured.cartonGtin,
      unitGtin: captured.unitGtin,
      nextUrl: next.url,
    })
    const nameQuery = productName ? `"${productName}" ` : ''
    renderPanel(
      [
        'Cosmos sem a medida da caixa.',
        'Ache a medida em outro site, selecione o texto e aperte Alt+C lá.',
        'Só achou a medida do produto (unidade)? Selecione e aperte Alt+U.',
        `Restam ${next.remaining ?? 0}`,
      ],
      [
        createButton('Buscar GTIN', () =>
          openSearch(`"${captured.unitGtin}" OR "${captured.cartonGtin}" caixa dimensões`),
        ),
        createButton('Buscar ficha logística', () =>
          openSearch(`${nameQuery}ficha logística caixa lastro camada`),
        ),
        ...(next.url
          ? [createButton('Pular (Alt+N)', () => (window.location.href = next.url))]
          : []),
      ],
    )
  }

  async function runCosmosCapture() {
    if (document.title.includes('Just a moment')) return
    const unitGtin = window.location.pathname.split('/').filter(Boolean).pop()
    const text = document.body.innerText
    const isNotFound = /produto n[aã]o encontrado|p[aá]gina n[aã]o encontrada/i.test(text)
    const section = findCartonSection(text)
    const extracted = extractCarton(section)
    const edgeCount = Object.keys(extracted.edges).length
    const status = isNotFound ? 'not_found' : edgeCount >= 3 ? 'found' : 'no_dimensions'

    try {
      const next = await requestServer('POST', '/capture', {
        unitGtin,
        status,
        pageUrl: window.location.href.split('?')[0],
        extracted,
        snippet: section,
      })
      if (next.error)
        return renderPanel([
          `Erro do servidor: ${next.error}`,
          'Token configurado no menu do Tampermonkey?',
        ])
      bindNextShortcut(next.url)
      if (next.ignored)
        return renderPanel([
          'Produto fora da fila — nada gravado.',
          `Restam ${next.remaining ?? 0}`,
        ])
      if (status !== 'found')
        return renderFallback(next.captured, next, document.querySelector('h1')?.innerText?.trim())
      renderPanel(
        [`Gravado: ${status}`, ...describeEdges(extracted.edges), `Restam ${next.remaining ?? 0}`],
        next.url ? [createButton('Próximo (Alt+N)', () => (window.location.href = next.url))] : [],
      )
    } catch (error) {
      renderPanel([
        String(error.message),
        'Rode: bun scripts/box-catalog-harvest/assisted-capture-server.ts',
      ])
    }
  }

  async function captureSelection(kind) {
    const { label, shortcut } = CAPTURE_KINDS[kind]
    const target = GM_getValue(FALLBACK_KEY, undefined)
    if (!target)
      return renderPanel(['Nenhum produto aguardando medida. Comece pela fila do Cosmos.'])
    const selection = String(window.getSelection() ?? '').trim()
    if (!selection)
      return renderPanel([
        `Selecione o texto com as medidas da ${label} e aperte ${shortcut} de novo.`,
      ])
    const extracted = kind === 'unit' ? extractUnit(selection) : extractCarton(selection)
    const capturedEdges = kind === 'unit' ? extracted.unitEdges : extracted.edges
    if (Object.keys(capturedEdges).length < 3) {
      return renderPanel([
        'Não achei 3 medidas na seleção.',
        'Ex.: "47,4 x 24,7 x 24,0 cm" ou Comprimento/Largura/Altura.',
      ])
    }
    try {
      const next = await requestServer('POST', '/capture-manual', {
        cartonGtin: target.cartonGtin,
        kind,
        pageUrl: window.location.href,
        extracted,
        snippet: selection,
      })
      if (next.error) return renderPanel([`Erro do servidor: ${next.error}`])
      // A unidade não resolve a caixa: o produto segue aguardando a medida dela (Alt+C).
      if (kind === 'carton') GM_setValue(FALLBACK_KEY, undefined)
      bindNextShortcut(target.nextUrl)
      renderPanel(
        [
          `Gravada a ${label} de ${target.cartonGtin} (fonte: ${window.location.hostname})`,
          ...describeEdges(capturedEdges),
        ],
        target.nextUrl
          ? [
              createButton(
                'Voltar para a fila (Alt+N)',
                () => (window.location.href = target.nextUrl),
              ),
            ]
          : [],
      )
    } catch (error) {
      renderPanel([String(error.message)])
    }
  }

  document.addEventListener('keydown', (event) => {
    if (!event.altKey) return
    if (event.code === CAPTURE_KINDS.carton.key) captureSelection('carton')
    if (event.code === CAPTURE_KINDS.unit.key) captureSelection('unit')
  })

  if (isCosmosProductPage) runCosmosCapture()
})()
