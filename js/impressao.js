/* =====================================================================
   DRIVE THRU — Romaneio de separação e etiqueta do pedido
   ---------------------------------------------------------------------
   • Romaneio (A4): itens na ordem da rota do CD (Rua → Prédio → Nível →
     Apartamento), com espaço para marcar separado e conferido.
   • Etiqueta (10 × 15 cm): para colar no palete pronto.
   Os dois trazem o código de barras do pedido (Code 128), que o
   coletor lê, e o QR de chegada do cliente.
   ===================================================================== */
DT.impressao = (function () {
  const U = DT.util, esc = U.esc;

  /* Ordem dos itens: pela rota do CD quando ligada em Configurações */
  const chaveEnd = v => (v ? String(v).padStart(4, '0') : '~~~~');
  function ordemRota(pedido, forcar) {
    const itens = (pedido && pedido.itens) || [];
    const idx = itens.map((_, i) => i);
    if (!(forcar || DT.db.settings().rotaSeparacao !== false)) return idx;
    return idx.sort((a, b) => {
      const ea = DT.ui.enderecoItem(itens[a], pedido), eb = DT.ui.enderecoItem(itens[b], pedido);
      const ka = [ea.rua, ea.predio, ea.nivel, ea.apto].map(chaveEnd).join('|');
      const kb = [eb.rua, eb.predio, eb.nivel, eb.apto].map(chaveEnd).join('|');
      return ka < kb ? -1 : ka > kb ? 1 : a - b;
    });
  }

  function codigoBarras(texto, opts) {
    try {
      if (typeof window.JsBarcode !== 'function') return '<b class="mono">' + esc(texto) + '</b>';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      window.JsBarcode(svg, String(texto), Object.assign({ format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 16, margin: 0, font: 'monospace' }, opts || {}));
      return svg.outerHTML;
    } catch (e) { return '<b class="mono">' + esc(texto) + '</b>'; }
  }
  function linkCliente(ag) { return DT.ag.linkCliente(ag); }

  const CSS_BASE = 'body{font-family:Arial,Helvetica,sans-serif;color:#1f262c;margin:0}' +
    '.mono{font-family:"Courier New",monospace}h1{font-size:18px;margin:0}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #9aa4ae;padding:5px 6px;font-size:12px;text-align:left;vertical-align:top}' +
    'th{background:#eef1f3;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}' +
    '.end{background:#f6f7f8;text-align:center;font-family:"Courier New",monospace;font-weight:bold;font-size:13px}' +
    '.r{text-align:right}.c{text-align:center}.box{width:16px;height:16px;border:1.5px solid #1f262c;display:inline-block}' +
    '.info{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid #9aa4ae;margin:10px 0}' +
    '.info div{padding:6px 8px;border-right:1px solid #d5dbe1;border-bottom:1px solid #d5dbe1}.info span{display:block;font-size:9.5px;text-transform:uppercase;color:#5b6670;letter-spacing:.05em}' +
    '.info b{font-size:13px}.qr svg{width:100%;height:100%}' +
    '@media print{.naoimprime{display:none}}';

  function romaneioHTML(ag) {
    const p = ag.pedido, s = DT.db.settings();
    const ordem = ordemRota(p);
    const logo = DT.aparencia && DT.aparencia.logo ? DT.aparencia.logo() : '';
    const linhas = ordem.map((i, n) => {
      const it = p.itens[i], e = DT.ui.enderecoItem(it, p);
      return '<tr><td class="c">' + (n + 1) + '</td><td class="end">' + esc(e.rua || '—') + '</td><td class="end">' + esc(e.predio || '—') + '</td><td class="end">' + esc(e.nivel || '—') + '</td><td class="end">' + esc(e.apto || '—') + '</td>' +
        '<td class="mono">' + esc(it.sku) + '</td><td>' + esc(it.descricao) + '</td><td class="r"><b>' + esc(it.qtd) + '</b></td><td>' + esc(it.un) + '</td>' +
        '<td class="c"><span class="box"></span></td><td class="c"><span class="box"></span></td></tr>';
    }).join('');
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Romaneio ' + esc(p.numero) + '</title>' +
      '<style>@page{size:A4;margin:12mm}' + CSS_BASE + '.topo{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:3px solid #AB0F14;padding-bottom:8px}' +
      '.topo img{height:38px;background:#303A42;padding:6px 10px;border-radius:6px}.qr{width:92px;height:92px}</style></head><body>' +
      '<div class="topo"><div>' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '<h1 style="margin-top:6px">Romaneio de separação · Drive Thru</h1>' +
        '<div style="font-size:11px;color:#5b6670">' + esc(s.unidade || '') + ' · impresso em ' + U.fmtData(U.dataISO()) + ' ' + U.horaHM() + '</div></div>' +
        '<div style="text-align:center">' + codigoBarras(p.numero) + '</div></div>' +
      '<div style="display:flex;gap:12px;align-items:stretch"><div class="info" style="flex:1">' +
        '<div><span>Pedido</span><b class="mono">' + esc(p.numero) + '</b></div>' +
        '<div><span>Retirada</span><b>' + U.fmtData(ag.data) + ' às ' + esc(ag.hora) + '</b></div>' +
        '<div><span>Doca</span><b>' + esc(ag.doca || '—') + '</b></div>' +
        '<div><span>Cliente</span><b>' + esc(p.cliente) + '</b></div>' +
        '<div><span>Vendedor</span><b>' + esc(p.vendedor || '—') + '</b></div>' +
        '<div><span>Itens</span><b>' + esc(p.qtdItens) + ' (' + (p.itens || []).length + ' linhas)</b></div>' +
      '</div><div class="qr" title="QR de chegada do cliente">' + DT.ui.qrSVG(linkCliente(ag)) + '</div></div>' +
      '<div style="font-size:11px;color:#5b6670;margin-bottom:6px">' + (s.rotaSeparacao !== false ? 'Itens na ordem da rota do CD: Rua → Prédio → Nível → Apartamento.' : 'Itens na ordem do pedido.') + '</div>' +
      '<table><thead><tr><th class="c">#</th><th class="c">Rua</th><th class="c">Pre</th><th class="c">Niv</th><th class="c">Apto</th><th>Código</th><th>Descrição</th><th class="r">Qtd</th><th>Emb.</th><th class="c">Sep.</th><th class="c">Conf.</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
      '<table style="margin-top:18px"><tr><td style="height:44px;width:33%"><span style="font-size:10px;color:#5b6670">SEPARADO POR</span></td><td style="width:33%"><span style="font-size:10px;color:#5b6670">CONFERIDO POR</span></td><td><span style="font-size:10px;color:#5b6670">VOLUMES / OBSERVAÇÕES</span></td></tr></table>' +
      '</body></html>';
  }
  function etiquetaHTML(ag) {
    const p = ag.pedido;
    const nome = String(p.cliente || '').split(' ').slice(0, 3).join(' ');
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta ' + esc(p.numero) + '</title>' +
      '<style>@page{size:100mm 150mm;margin:5mm}' + CSS_BASE + '.et{border:2px solid #1f262c;border-radius:6px;padding:10px;height:136mm;box-sizing:border-box;display:flex;flex-direction:column;gap:8px}' +
      '.faixa{background:#303A42;color:#fff;font-weight:bold;letter-spacing:.2em;text-align:center;padding:6px;border-radius:4px}' +
      '.num{font-size:40px;font-weight:bold;text-align:center;font-family:"Courier New",monospace}.lin{display:flex;justify-content:space-between;font-size:14px;border-top:1px solid #9aa4ae;padding-top:6px}' +
      '.qr{width:70px;height:70px}</style></head><body><div class="et">' +
      '<div class="faixa">DRIVE THRU · RETIRADA</div>' +
      '<div class="num">' + esc(p.numero) + '</div>' +
      '<div style="text-align:center">' + codigoBarras(p.numero, { height: 70, width: 2.4, displayValue: false }) + '</div>' +
      '<div style="font-size:18px;font-weight:bold;text-align:center">' + esc(nome) + '</div>' +
      '<div class="lin"><span>Retirada</span><b>' + U.fmtData(ag.data).slice(0, 5) + ' · ' + esc(ag.hora) + '</b></div>' +
      '<div class="lin"><span>Doca</span><b>' + esc(ag.doca || '__________') + '</b></div>' +
      '<div class="lin"><span>Volumes</span><b>____ de ____</b></div>' +
      '<div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end"><div style="font-size:10px;color:#5b6670">' + esc((p.itens || []).length) + ' linha(s) · ' + esc(p.qtdItens) + ' item(ns)</div><div class="qr">' + DT.ui.qrSVG(linkCliente(ag)) + '</div></div>' +
      '</div></body></html>';
  }

  function imprimir(ag, formato) {
    formato = formato || DT.db.settings().impressaoFormato || 'romaneio';
    const html = formato === 'etiqueta' ? etiquetaHTML(ag) : romaneioHTML(ag);
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { DT.ui.toast('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.', 'warn', 8000); return false; }
    w.document.open();
    w.document.write(html.replace('<head>', '<head><base href="' + esc(location.href.split('#')[0]) + '">'));
    w.document.close();
    const go = () => { try { w.focus(); w.print(); } catch (e) { /* janela fechada */ } };
    if (w.document.readyState === 'complete') setTimeout(go, 300); else w.addEventListener('load', () => setTimeout(go, 200));
    DT.audit.registrar('Imprimiu ' + (formato === 'etiqueta' ? 'etiqueta' : 'romaneio'), 'Agendamento', ag.pedido.numero, null, null);
    return true;
  }
  /* Escolha do formato na hora de imprimir */
  function escolher(ag) {
    const ui = DT.ui, padrao = DT.db.settings().impressaoFormato || 'romaneio';
    ui.modal({
      title: 'Imprimir · pedido ' + ag.pedido.numero,
      body: '<p class="muted">Escolha o que imprimir:</p>',
      actions: [
        { label: 'Voltar', cls: 'ghost' },
        { label: 'Etiqueta 10 × 15', cls: padrao === 'etiqueta' ? 'primary' : '', icon: 'print', onClick: () => { imprimir(ag, 'etiqueta'); } },
        { label: 'Romaneio (A4)', cls: padrao === 'etiqueta' ? '' : 'primary', icon: 'print', onClick: () => { imprimir(ag, 'romaneio'); } }
      ]
    });
  }
  return { ordemRota, codigoBarras, romaneioHTML, etiquetaHTML, imprimir, escolher };
})();
