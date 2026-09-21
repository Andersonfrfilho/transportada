// ==UserScript==
// @name         TransportAdA — captura assistida de caixa (Cosmos)
// @namespace    transportada
// @version      1.0.0
// @description  Lê a dimensão da caixa na página do Cosmos que VOCÊ abriu e envia ao servidor local.
// @match        https://cosmos.bluesoft.com.br/produtos/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// ==/UserScript==

// Copyright (c) 2026 Anderson — Ada Technology. Licença: proprietária.
// Não navega sozinho: o avanço para o próximo produto é sempre um clique ou Alt+N seu.

;(function captureCosmosCarton() {
  'use strict'

  const SERVER_URL = 'http://127.0.0.1:53999'
  const TOKEN_KEY = 'captureToken'
  const MAX_SNIPPET_LENGTH = 4000
  const EDGE_PATTERN = /(comprimento|largura|altura|profundidade)\s*:?\s*([\d.,]+)\s*(mm|cm|m)\b/gi
  const WEIGHT_PATTERN = /peso\s*bruto\s*:?\s*([\d.,]+)\s*(kg|g)\b/i
  const QUANTITY_PATTERN = /(?:quantidade|unidades)(?:\s*(?:na|por)\s*caixa)?\s*:?\s*(\d+)/i
  const CARTON_GTIN_PATTERN = /\b([1-8]\d{13})\b/

  GM_registerMenuCommand('Configurar token do servidor local', () => {
    const token = prompt('Token impresso pelo assisted-capture-server:')
    if (token) GM_setValue(TOKEN_KEY, token.trim())
  })

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

  function extractCarton(section) {
    const edges = {}
    for (const match of section.matchAll(EDGE_PATTERN)) {
      const name = match[1].toLowerCase()
      if (!edges[name]) edges[name] = { value: match[2], unit: match[3].toLowerCase() }
    }
    const weight = section.match(WEIGHT_PATTERN)
    const quantity = section.match(QUANTITY_PATTERN)
    const cartonGtin = section.match(CARTON_GTIN_PATTERN)
    return {
      edges,
      grossWeight: weight ? { value: weight[1], unit: weight[2].toLowerCase() } : undefined,
      unitsPerCarton: quantity ? Number(quantity[1]) : undefined,
      cartonGtin: cartonGtin ? cartonGtin[1] : undefined,
    }
  }

  function renderPanel(lines, nextUrl) {
    const panel = document.createElement('div')
    panel.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#111;color:#fff;' +
      'padding:12px 14px;border-radius:8px;font:13px/1.4 system-ui;max-width:340px;box-shadow:0 4px 16px #0006'
    panel.innerText = lines.join('\n')
    if (nextUrl) {
      const button = document.createElement('button')
      button.textContent = 'Próximo (Alt+N)'
      button.style.cssText = 'margin-top:8px;display:block;padding:4px 10px;cursor:pointer'
      button.addEventListener('click', () => (window.location.href = nextUrl))
      panel.appendChild(button)
      document.addEventListener('keydown', (event) => {
        if (event.altKey && event.code === 'KeyN') window.location.href = nextUrl
      })
    }
    document.body.appendChild(panel)
  }

  async function run() {
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
      if (next.error) return renderPanel([`Erro do servidor: ${next.error}`])
      const summary = Object.entries(extracted.edges).map(
        ([name, edge]) => `${name}: ${edge.value} ${edge.unit}`,
      )
      renderPanel(
        [
          next.ignored ? 'Produto fora da fila — nada gravado.' : `Gravado: ${status}`,
          ...summary,
          `Restam ${next.remaining ?? 0}`,
        ],
        next.url,
      )
    } catch (error) {
      renderPanel([String(error.message), 'Rode: bun assisted-capture-server.ts'])
    }
  }

  run()
})()
