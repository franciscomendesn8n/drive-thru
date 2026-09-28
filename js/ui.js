/* =====================================================================
   Componentes de interface reutilizáveis
   ===================================================================== */
window.DT = window.DT || {};

DT.ui = (function () {
  const U = DT.util;
  const esc = U.esc;

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    truck: '<path d="M1 4h14v12H1zM15 8h4.5l3.5 3.5V16h-8z"/><circle cx="5.5" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    timeline: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    id: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2M15 12h2M7 16h10"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    car: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M5 12h14"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>',
    nav: '<path d="M3 11 22 2l-9 19-2-8z"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>'
  };
  function icon(nome, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[nome] || ICONS.info) + '</svg>';
  }

  function tone(status) { return DT.STATUS_TONE[status] || 'neutral'; }
  function badge(status) {
    return '<span class="badge tone-' + tone(status) + '">' + esc(status) + '</span>';
  }
  function alertChips(ag) {
    return DT.kpi.alertas(ag).map(a => '<span class="alert-chip ' + a.nivel + '">' + (a.nivel === 'crit' ? '●' : '▲') + ' ' + esc(a.texto) + '</span>').join('');
  }
  function tag(numero, link) {
    if (link === false) return '<span class="tag">' + esc(numero) + '</span>';
    return '<button type="button" class="tag" data-goto-pedido="' + esc(numero) + '" title="Ver linha do tempo">' + esc(numero) + '</button>';
  }
  function iniciais(nome) {
    return String(nome || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }
  function empty(msg, ic) {
    return '<div class="empty">' + icon(ic || 'list') + '<div>' + esc(msg) + '</div></div>';
  }
  function notice(tipo, html, ic) {
    const i = ic || ({ info: 'info', warn: 'alert', crit: 'alert', ok: 'check' })[tipo];
    return '<div class="notice ' + tipo + '">' + icon(i) + '<div>' + html + '</div></div>';
  }

  /* Dados do pedido vindos do ERP */
  function pedidoKV(p, ag) {
    const itens = [
      ['Nº do pedido', '<span class="mono">' + esc(p.numero) + '</span>'],
      ['Nº da nota fiscal', p.notaFiscal ? '<span class="mono">' + esc(p.notaFiscal) + '</span>' : '<span class="muted">Não emitida</span>'],
      ['Data / hora do pedido', U.fmtData(p.dataPedido) + ' ' + esc(p.horaPedido)],
      ['Cliente', esc(p.cliente)],
      ['Qtd. de itens', '<span class="mono">' + esc(p.qtdItens) + '</span> <span class="subtle">(' + (p.itens || []).length + ' linhas)</span>'],
      ['Valor do pedido', '<span class="mono">' + U.fmtMoeda(p.valor) + '</span>'],
      ['Situação do pedido', esc(p.situacao)],
      ['Forma de pagamento', esc(p.formaPagamento)],
      ['Vendedor', esc(p.vendedor)],
      ['Status de faturamento', esc(p.statusFaturamento)],
      ['Status de preparação', ag ? esc(DT.ag.prepAtual(ag)) : esc(p.statusPreparacao || 'Não iniciado')],
      ['Drive Thru', p.elegivelDriveThru ? '<span style="color:var(--ok);font-weight:600">Elegível</span>' : '<span style="color:var(--crit);font-weight:600">Não elegível</span>']
    ];
    return '<dl class="kv">' + itens.map(i => '<div><dt>' + i[0] + '</dt><dd>' + i[1] + '</dd></div>').join('') + '</dl>';
  }
  function itensPedido(p) {
    if (!p.itens || !p.itens.length) return '';
    return '<table class="items-list"><tbody>' + p.itens.map(i =>
      '<tr><td><span class="mono subtle">' + esc(i.sku) + '</span> ' + esc(i.descricao) + '</td><td>' + esc(i.qtd) + ' ' + esc(i.un) + '</td></tr>').join('') + '</tbody></table>';
  }

  function funcionariosOptions(selecionado, setor) {
    const lista = DT.db.funcionarios().filter(f => f.ativo && (!setor || f.setor === setor));
    return '<option value="">Selecione…</option>' + lista.map(f =>
      '<option value="' + esc(f.nome) + '"' + (f.nome === selecionado ? ' selected' : '') + '>' + esc(f.nome) + ' — ' + esc(f.funcao) + '</option>').join('');
  }
  function options(lista, selecionado, vazio) {
    return (vazio !== undefined ? '<option value="">' + esc(vazio) + '</option>' : '') + lista.map(o => {
      const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(selecionado) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }

  /* --------------------------- Toast --------------------------- */
  function toast(msg, tipo) {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (tipo || 'ok');
    t.innerHTML = icon(tipo === 'err' ? 'alert' : tipo === 'warn' ? 'alert' : 'check') + '<div>' + esc(msg) + '</div>';
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => t.remove(), tipo === 'err' ? 6000 : 3600);
  }

  /* --------------------------- Modal --------------------------- */
  function modal(opts) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<div class="modal-head"><h3>' + esc(opts.title) + '</h3><button type="button" class="icon-btn" data-close aria-label="Fechar">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + opts.body + '</div>' +
      (opts.actions && opts.actions.length ? '<div class="modal-foot">' + opts.actions.map((a, i) =>
        '<button type="button" class="btn ' + (a.cls || '') + '" data-act="' + i + '">' + (a.icon ? icon(a.icon) : '') + esc(a.label) + '</button>').join('') + '</div>' : '') +
      '</div>';
    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-close]')) { close(); return; }
      const b = e.target.closest('[data-act]');
      if (b) {
        const a = opts.actions[Number(b.dataset.act)];
        if (!a.onClick) { close(); return; }
        const r = a.onClick(back.querySelector('.modal'), close);
        if (r !== false) close();
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    const primeiro = back.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
    if (primeiro) setTimeout(() => primeiro.focus(), 30);
    if (opts.onOpen) opts.onOpen(back.querySelector('.modal'), close);
    return { close, root: back };
  }

  /* Confirmação com motivo opcional (substitui confirm/prompt nativos) */
  function confirmar(opts) {
    return new Promise(resolve => {
      const body = '<p>' + opts.mensagem + '</p>' + (opts.pedirMotivo ?
        '<div class="field"><label for="cf-motivo">' + esc(opts.labelMotivo || 'Motivo') + '</label><textarea id="cf-motivo" class="textarea" placeholder="' + esc(opts.placeholder || 'Descreva o motivo') + '"></textarea></div>' : '');
      let resolvido = false;
      const m = modal({
        title: opts.titulo, body: body,
        actions: [
          { label: 'Voltar', cls: 'ghost', onClick: () => { resolvido = true; resolve({ ok: false }); } },
          { label: opts.ok || 'Confirmar', cls: opts.perigo ? 'danger' : 'primary', onClick: (root) => {
            const motivo = opts.pedirMotivo ? root.querySelector('#cf-motivo').value.trim() : '';
            if (opts.pedirMotivo && !motivo) { toast('Informe o motivo para continuar.', 'warn'); return false; }
            resolvido = true; resolve({ ok: true, motivo: motivo });
          }}
        ]
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.root)) { obs.disconnect(); if (!resolvido) resolve({ ok: false }); } });
      obs.observe(document.body, { childList: true });
    });
  }

  /* Download de CSV (funciona abrindo o app localmente) + cópia como alternativa */
  function baixarCSV(nome, conteudo) {
    try {
      const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      return true;
    } catch (e) { return false; }
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto; document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* QR Code em SVG (biblioteca local js/vendor/qrcode.js) */
  function qrSVG(texto) {
    try {
      if (typeof window.qrcode !== 'function') return '';
      const q = window.qrcode(0, 'M');
      q.addData(texto);
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) { return ''; }
  }

  return { qrSVG, icon, tone, badge, alertChips, tag, iniciais, empty, notice, pedidoKV, itensPedido,
    funcionariosOptions, options, toast, modal, confirmar, baixarCSV, copiar, esc };
})();
