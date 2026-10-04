/* =====================================================================
   Telas da Operação (Logística / Retira):
   Preparação · Check-in · Atendimento · Entrega · Acompanhar pedido
   ===================================================================== */
window.DT = window.DT || {};
DT.views = DT.views || {};

DT.opUI = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS;

  function stepsHTML(ag) {
    const etapas = DT.FLUXO_PREPARACAO;
    const atual = etapas.indexOf(DT.ag.prepAtual(ag));
    const rot = ['Agendado', 'Preparação', 'Separado', 'Conferido', 'Faturado', 'Pronto'];
    return '<div class="steps" aria-label="Etapa de preparação: ' + esc(DT.ag.prepAtual(ag)) + '">' + etapas.map((e, i) =>
      '<div class="step ' + (i < atual ? 'done' : i === atual ? (i === etapas.length - 1 ? 'done' : 'cur') : '') + '"><i></i>' + rot[i] + '</div>').join('') + '</div>';
  }

  function queueItem(ag, sel, extra) {
    return '<button type="button" class="queue-item' + (sel ? ' sel' : '') + '" data-sel="' + ag.id + '">' +
      '<span class="qt">' + ag.hora + '</span>' +
      '<span class="qm"><b>' + esc(ag.pedido.cliente) + '</b><span class="row">' + ui.tag(ag.pedido.numero, false) + ui.badge(ag.status) + ui.alertChips(ag) + (DT.rastreio ? DT.rastreio.chip(ag) : '') + '</span>' +
      (extra ? '<span class="subtle">' + extra + '</span>' : '') + '</span></button>';
  }

  function resumoPedido(ag) {
    return '<div class="row between"><div class="row">' + ui.tag(ag.pedido.numero) + '<h3>' + esc(ag.pedido.cliente) + '</h3></div>' + ui.badge(ag.status) + '</div>' +
      '<div class="row" style="gap:6px">' + ui.alertChips(ag) + '</div>' +
      '<dl class="kv"><div><dt>Horário agendado</dt><dd class="mono">' + U.fmtData(ag.data).slice(0, 5) + ' ' + ag.hora + '</dd></div>' +
      '<div><dt>Nota fiscal</dt><dd class="mono">' + esc(ag.pedido.notaFiscal || '—') + '</dd></div>' +
      '<div><dt>Itens</dt><dd class="mono">' + ag.pedido.qtdItens + '</dd></div>' +
      '<div><dt>Pagamento</dt><dd>' + esc(ag.pedido.formaPagamento) + '</dd></div>' +
      '<div><dt>Contato</dt><dd class="mono">' + esc((ag.veiculo && ag.veiculo.contato) || ag.pedido.telefone || '—') + '</dd></div>' +
      '<div><dt>Vendedor</dt><dd>' + esc(ag.responsavel) + '</dd></div></dl>' +
      (ag.observacao ? ui.notice('info', '<b>Observação do agendamento:</b> ' + esc(ag.observacao)) : '');
  }

  function bindQueue(el, aoSelecionar) {
    el.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => aoSelecionar(b.dataset.sel)));
  }

  /* ---------- Filtro de data das telas de operação ----------
     view.data = null significa "hoje" (acompanha a virada do dia). */
  function dataDe(view) { return view.data || U.dataISO(); }
  function filtroDataHTML(view, pre, stats) {
    const d = dataDe(view), hoje = U.dataISO();
    return '<section class="card"><div class="card-body"><div class="agenda-toolbar">' +
      '<div class="row" style="gap:6px">' +
        '<button type="button" class="icon-btn" data-fd="-1" aria-label="Dia anterior" title="Dia anterior">' + ui.icon('back') + '</button>' +
        '<div class="field"><label class="sr-only" for="' + pre + '-data">Data</label><input type="date" id="' + pre + '-data" class="input" value="' + d + '" style="width:170px"></div>' +
        '<button type="button" class="icon-btn" data-fd="1" aria-label="Próximo dia" title="Próximo dia">' + ui.icon('arrow') + '</button>' +
        (d !== hoje ? '<button type="button" class="btn ghost sm" data-fd="hoje">Hoje</button>' : '') +
      '</div>' +
      '<div class="stat-strip">' +
        '<div class="stat"><span>' + (d === hoje ? 'Hoje · ' : '') + U.diaSemana(d) + '</span><b>' + U.fmtData(d) + '</b></div>' +
        (stats || []).map(x => '<div class="stat"><span>' + esc(x[0]) + '</span><b>' + x[1] + '</b></div>').join('') +
      '</div>' +
    '</div></div></section>';
  }
  function ligarFiltroData(el, view, pre, redesenhar) {
    const definir = d => { view.data = (!d || d === U.dataISO()) ? null : d; view.sel = null; if ('finalizado' in view) view.finalizado = null; redesenhar(); };
    const inp = el.querySelector('#' + pre + '-data');
    if (inp) inp.addEventListener('change', e => definir(e.target.value));
    el.querySelectorAll('[data-fd]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.fd;
      definir(v === 'hoje' ? null : /^\d{4}-/.test(v) ? v : U.addDias(dataDe(view), Number(v)));
    }));
  }
  /* Aviso de itens em andamento com agendamento em outra data (não somem por causa do filtro) */
  function avisoOutrasDatas(lista, d, texto) {
    const outras = lista.filter(a => a.data !== d);
    if (!outras.length) return '';
    const datas = Array.from(new Set(outras.map(a => a.data))).sort();
    return ui.notice('warn', '<b>' + outras.length + ' ' + texto + '</b> com agendamento em outra data. ' +
      datas.slice(0, 4).map(x => '<button type="button" class="btn ghost sm" data-fd="' + x + '">Ver ' + U.fmtData(x).slice(0, 5) + '</button>').join(' '));
  }
  /* Ao abrir a tela: com um agendamento indicado, vai para a data dele; sem, começa em hoje */
  function dataAoAbrir(view, param) {
    if (!param && DT.app.estaVoltando()) return;      // voltando: mantém a data que estava filtrada
    const ag = param ? DT.db.agendamentoPorId(param) : null;
    view.data = ag && ag.data !== U.dataISO() ? ag.data : null;
  }

  return { stepsHTML, queueItem, resumoPedido, bindQueue, dataDe, filtroDataHTML, ligarFiltroData, avisoOutrasDatas, dataAoAbrir };
})();

/* ================================ PREPARAÇÃO ================================ */
DT.views.preparacao = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS, G = DT.STATUS_GRUPOS;
  const view = { titulo: 'Preparação', eyebrow: 'Logística · Separação, conferência e faturamento', aoVivo: true, data: null, mostrarProntos: false };
  let el;
  const ACAO = {
    'Agendado': 'Iniciar preparação', 'Em preparação': 'Marcar separado', 'Separado': 'Marcar conferido',
    'Conferido': 'Registrar faturamento', 'Faturado': 'Liberar para retirada'
  };

  view.render = function (c) { el = c; if (!view.data) view.data = U.dataISO(); desenhar(); };
  view.refresh = function () { desenhar(); };

  function desenhar() {
    const ags = DT.db.agendamentos().filter(a => a.data === view.data && G.finalizados.indexOf(a.status) < 0 && a.status !== S.CANCELADO)
      .filter(a => view.mostrarProntos || DT.ag.prepAtual(a) !== S.PRONTO)
      .sort((a, b) => a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0);
    const todosDia = DT.db.agendamentos().filter(a => a.data === view.data && G.finalizados.indexOf(a.status) < 0);
    const cont = e => todosDia.filter(a => DT.ag.prepAtual(a) === e).length;

    const modo = DT.separacao.modo(), sync = DT.separacao.ultimoSincronismo();
    const avisoModo = modo === 'manual' ? '' :
      '<div class="notice info">' + ui.icon(modo === 'erp' ? 'refresh' : 'scan') + '<div><b>Modo de trabalho: ' + esc(DT.separacao.infoModo().titulo) + '.</b> ' +
        (modo === 'erp' ? 'As etapas mapeadas são atualizadas pelo ERP a cada minuto.' + (sync ? ' Última leitura: ' + U.fmtHora(sync.ts) + (sync.erro ? ' — <b>' + esc(sync.erro) + '</b>' : ' (' + sync.verificados + ' pedido(s) verificados, ' + sync.atualizados.length + ' atualizado(s))') + '.' : '') +
          (DT.db.modoNuvem() ? ' <button type="button" class="btn sm" id="pp-sync">' + ui.icon('refresh', 'icon-sm') + 'Ler o ERP agora</button>' : '')
          : 'Separação e conferência são registradas no <b>Modo coletor</b>; aqui ficam o faturamento e a liberação para retirada.') + '</div></div>';
    el.innerHTML =
      '<div class="page-intro"><p>Pedidos do Drive Thru precisam estar separados, conferidos e faturados antes da chegada do cliente. Avance cada pedido pela sequência abaixo.</p></div>' + avisoModo +
      '<section class="card"><div class="card-body">' +
        '<div class="row" style="align-items:end">' +
          '<div class="field"><label for="pp-data">Data da retirada</label><input type="date" id="pp-data" class="input" value="' + view.data + '" style="width:170px"></div>' +
          '<label class="check" style="margin-bottom:10px"><input type="checkbox" id="pp-prontos"' + (view.mostrarProntos ? ' checked' : '') + '> Mostrar pedidos já prontos</label>' +
        '</div>' +
        '<div class="stat-strip">' + DT.FLUXO_PREPARACAO.map(e => '<div class="stat"><span>' + esc(e) + '</span><b>' + cont(e) + '</b></div>').join('') + '</div>' +
      '</div></section>' +
      '<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Horário</th><th>Pedido</th><th>Cliente</th><th class="r">Itens</th><th style="min-width:360px">Etapa</th><th>Situação</th><th class="r">Ação</th></tr></thead><tbody>' +
      (ags.length ? ags.map(a => {
        const prep = DT.ag.prepAtual(a);
        const prox = DT.ag.proximaEtapa(a);
        return '<tr><td class="time">' + a.hora + '</td><td>' + ui.tag(a.pedido.numero) + '</td>' +
          '<td><b>' + esc(a.pedido.cliente) + '</b><div class="subtle">' + (a.status !== prep ? ui.badge(a.status) : esc(a.pedido.formaPagamento)) + '</div></td>' +
          '<td class="r mono">' + a.pedido.qtdItens + '</td>' +
          '<td>' + DT.opUI.stepsHTML(a) + progressoColeta(a) + '</td>' +
          '<td><div class="row" style="gap:4px">' + (ui.alertChips(a) || '<span class="subtle">No prazo</span>') + '</div></td>' +
          '<td class="r"><div class="row end" style="flex-wrap:nowrap">' +
            '<button type="button" class="btn ghost sm" data-imprimir="' + a.id + '" title="Imprimir romaneio ou etiqueta">' + ui.icon('print', 'icon-sm') + '</button>' +
            (DT.ag.etapaAnterior(a) ? '<button type="button" class="btn ghost sm" data-voltar="' + a.id + '" title="Corrigir: voltar uma etapa">' + ui.icon('back', 'icon-sm') + '</button>' : '') +
            (prox ? (DT.separacao.quemRegistra(prox) ? '<span class="subtle" title="A etapa ' + esc(prox) + ' é registrada ' + esc(DT.separacao.quemRegistra(prox)) + '">' + ui.icon(DT.separacao.quemRegistra(prox) === 'pelo ERP' ? 'refresh' : 'scan', 'icon-sm') + ' Aguarda ' + (DT.separacao.quemRegistra(prox) === 'pelo ERP' ? 'ERP' : 'coletor') + '</span>'
              : '<button type="button" class="btn ' + (prox === S.PRONTO ? 'success' : 'primary') + ' sm" data-avancar="' + a.id + '">' + esc(ACAO[prep] || 'Avançar') + '</button>') : '<span class="subtle">Pronto</span>') +
          '</div></td></tr>';
      }).join('') : '<tr><td colspan="7">' + ui.empty('Nenhum pedido pendente de preparação para esta data.', 'box') + '</td></tr>') +
      '</tbody></table></div></section>';

    el.querySelector('#pp-data').addEventListener('change', e => { view.data = e.target.value || U.dataISO(); desenhar(); });
    el.querySelector('#pp-prontos').addEventListener('change', e => { view.mostrarProntos = e.target.checked; desenhar(); });
    el.querySelectorAll('[data-avancar]').forEach(b => b.addEventListener('click', () => avancar(b.dataset.avancar)));
    el.querySelectorAll('[data-voltar]').forEach(b => b.addEventListener('click', () => voltar(b.dataset.voltar)));
    el.querySelectorAll('[data-imprimir]').forEach(b => b.addEventListener('click', () => { const ag = DT.db.agendamentoPorId(b.dataset.imprimir); if (ag) DT.impressao.escolher(ag); }));
    const sb = el.querySelector('#pp-sync');
    if (sb) sb.addEventListener('click', async () => {
      sb.disabled = true; sb.innerHTML = '<span class="spinner"></span>Lendo o ERP…';
      try { const r = await DT.separacao.sincronizar(true); ui.toast(r && r.ignorado ? 'O ERP acabou de ser lido. Tente de novo em alguns segundos.' : 'ERP lido: ' + ((r && r.atualizados) || []).length + ' pedido(s) atualizado(s).'); }
      catch (e) { ui.toast(e.message, 'err'); }
      desenhar();
    });
  }
  /* Progresso do Modo coletor (item a item) */
  function progressoColeta(a) {
    const c = a.coleta;
    if (!c || !c.fase) return '';
    const div = c.divergencias && c.divergencias.length ? '<b class="crit-txt">' + c.divergencias.length + ' divergência(s) no coletor</b>' : '';
    if ((c.fase !== 'separacao' && c.fase !== 'conferencia') || !a.pedido.itens || !a.pedido.itens.length || c.fase !== ({ 'Agendado': 'separacao', 'Em preparação': 'separacao', 'Separado': 'conferencia' })[DT.ag.prepAtual(a)])
      return div ? '<div class="subtle" style="margin-top:4px">' + ui.icon('alert', 'icon-sm') + ' ' + div + '</div>' : '';
    const total = a.pedido.itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
    const lidos = Object.keys(c[c.fase] || {}).reduce((s, k) => s + (c[c.fase][k] || 0), 0);
    return '<div class="subtle" style="margin-top:4px">' + ui.icon('scan', 'icon-sm') + ' ' + (c.fase === 'conferencia' ? 'Conferência' : 'Separação') + ' no coletor: ' + lidos + '/' + total +
      (div ? ' · ' + div : '') + '</div>';
  }

  function avancar(id) {
    const ag = DT.db.agendamentoPorId(id);
    if (DT.ag.proximaEtapa(ag) === S.FATURADO) { faturar(ag); return; }
    const r = DT.ag.avancarPreparacao(id);
    if (!r.ok) { ui.toast(r.erro, 'err'); return; }
    ui.toast('Pedido ' + ag.pedido.numero + ': ' + r.ag.prep + '.');
    DT.app.montarMenu();
    desenhar();
  }
  function faturar(ag) {
    ui.modal({
      title: 'Registrar faturamento · ' + ag.pedido.numero,
      body: '<p>Confirme o número da nota fiscal emitida para <b>' + esc(ag.pedido.cliente) + '</b>.</p>' +
        '<div class="field"><label for="nf-num">Nº da nota fiscal</label><input id="nf-num" class="input mono" inputmode="numeric" value="' + esc(ag.pedido.notaFiscal || '') + '" placeholder="Ex.: 987654"></div>' +
        '<p class="subtle">Quando houver integração com o sistema fiscal, este número virá automaticamente.</p>',
      actions: [
        { label: 'Voltar', cls: 'ghost' },
        { label: 'Registrar faturamento', cls: 'primary', onClick: root => {
          const nf = root.querySelector('#nf-num').value.replace(/\D/g, '');
          if (!nf) { ui.toast('Informe o número da nota fiscal.', 'warn'); return false; }
          const r = DT.ag.avancarPreparacao(ag.id, { notaFiscal: nf });
          if (!r.ok) { ui.toast(r.erro, 'err'); return false; }
          ui.toast('Pedido ' + ag.pedido.numero + ' faturado — NF ' + nf + '.');
          desenhar();
        }}
      ]
    });
  }
  async function voltar(id) {
    const ag = DT.db.agendamentoPorId(id);
    const r = await ui.confirmar({
      titulo: 'Corrigir etapa', pedirMotivo: true, ok: 'Voltar etapa', labelMotivo: 'Motivo da correção',
      mensagem: 'O pedido <b class="mono">' + esc(ag.pedido.numero) + '</b> volta de <b>' + esc(DT.ag.prepAtual(ag)) + '</b> para <b>' + esc(DT.ag.etapaAnterior(ag)) + '</b>. A correção fica registrada na auditoria.'
    });
    if (!r.ok) return;
    const res = DT.ag.voltarPreparacao(id, r.motivo);
    if (!res.ok) { ui.toast(res.erro, 'err'); return; }
    ui.toast('Etapa corrigida.');
    desenhar();
  }

  return view;
})();

/* ================================ CHECK-IN ================================ */
DT.views.checkin = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS, G = DT.STATUS_GRUPOS;
  const view = { titulo: 'Check-in', eyebrow: 'Logística · Chegada do cliente', aoVivo: true, sel: null, busca: '' };
  let el, timer;

  view.render = function (c, param) { el = c; if (param || !DT.app.estaVoltando()) view.sel = param || null; DT.opUI.dataAoAbrir(view, param); desenhar(); };
  view.refresh = function () { desenhar(); };

  /* QR de chegada: abre direto o agendamento do cliente */
  function chegadaPorQR(cod) {
    const ag = DT.db.agendamentos().find(a => DT.ag.codigo(a) === cod);
    view.busca = '';
    if (!ag) { ui.toast('QR Code não corresponde a nenhum agendamento.', 'err'); desenhar(); return; }
    if (G.ativosPreChegada.indexOf(ag.status) < 0) { ui.toast('Pedido ' + ag.pedido.numero + ': ' + ag.status + '. Não há chegada a registrar.', 'warn', 6000); desenhar(); return; }
    if (ag.data !== U.dataISO()) { ui.toast('Pedido ' + ag.pedido.numero + ' está agendado para ' + U.fmtData(ag.data) + ' às ' + ag.hora + '.', 'warn', 8000); }
    view.data = ag.data; view.sel = ag.id;
    ui.toast('QR lido: pedido ' + ag.pedido.numero + ' · ' + ag.pedido.cliente + '.');
    desenhar();
  }
  function fila() {
    const d = DT.opUI.dataDe(view);
    const b = view.busca.toLowerCase();
    return DT.db.agendamentos().filter(a => a.data === d && G.ativosPreChegada.indexOf(a.status) >= 0)
      .filter(a => !b || a.pedido.numero.indexOf(b) >= 0 || a.pedido.cliente.toLowerCase().indexOf(b) >= 0 || (a.pedido.notaFiscal || '').indexOf(b) >= 0)
      .sort((a, b2) => a.hora < b2.hora ? -1 : 1);
  }

  function desenhar() {
    clearInterval(timer);
    const d = DT.opUI.dataDe(view), hoje = U.dataISO();
    const lista = fila();
    const doDia = DT.db.agendamentos().filter(a => a.data === d);
    const chegadas = doDia.filter(a => a.chegada).sort((a, b) => a.chegada < b.chegada ? -1 : 1);
    const ausentes = doDia.filter(a => a.status === S.NAO_COMPARECEU).length;
    let ag = view.sel ? DT.db.agendamentoPorId(view.sel) : null;
    if (ag && G.ativosPreChegada.indexOf(ag.status) < 0 && ag.status !== S.CHEGOU) ag = null;
    const titulo = d === hoje ? 'Clientes aguardados hoje' : d < hoje ? 'Não registrados em ' + U.fmtData(d).slice(0, 5) : 'Aguardados em ' + U.fmtData(d).slice(0, 5);
    el.innerHTML =
      DT.opUI.filtroDataHTML(view, 'ck', [['Aguardados', lista.length], ['Chegaram', chegadas.length], ['Não compareceram', ausentes]]) +
      '<div class="grid-side-main">' +
        '<div class="stack">' +
          '<section class="card"><div class="card-head"><h3>' + titulo + '</h3><span class="spacer"></span><span class="subtle">' + lista.length + '</span></div>' +
            '<div class="card-body" style="padding-bottom:0"><div class="field"><label for="ck-busca">Localizar agendamento</label><div class="row" style="flex-wrap:nowrap;gap:8px"><input id="ck-busca" class="input" placeholder="Pedido, nota fiscal, cliente ou QR de chegada" value="' + esc(view.busca) + '" style="flex:1">' +
              (DT.leitorQR && DT.leitorQR.disponivel() ? '<button type="button" class="btn ghost" id="ck-qr" title="Ler o QR de chegada com a câmera">' + ui.icon('camera') + 'Ler QR</button>' : '') + '</div>' +
              '<span class="hint">Com o leitor do coletor, bipe o QR da página do cliente direto neste campo.</span></div></div>' +
            '<div class="queue" style="margin-top:12px">' + (lista.length ? lista.map(a => DT.opUI.queueItem(a, ag && a.id === ag.id)).join('') : ui.empty(d < hoje ? 'Todos os clientes deste dia foram registrados.' : 'Nenhum cliente aguardado nesta data.', 'car')) + '</div>' +
          '</section>' +
          '<section class="card"><div class="card-head"><h3>Chegadas registradas</h3><span class="spacer"></span><span class="subtle">' + chegadas.length + '</span></div><div class="queue">' +
            (chegadas.length ? chegadas.map(a => '<div class="queue-item" style="cursor:default"><span class="qt">' + U.fmtHora(a.chegada) + '</span><span class="qm"><b>' + esc(a.pedido.cliente) + '</b><span class="row">' + ui.tag(a.pedido.numero) + ui.badge(a.status) + '<span class="subtle">agendado ' + a.hora + '</span></span></span></div>').join('') : ui.empty('Nenhuma chegada registrada nesta data.', 'pin')) +
          '</div></section>' +
        '</div>' +
        '<section class="card" id="ck-painel">' + (ag ? painel(ag) : '<div class="card-body">' + ui.empty('Selecione um agendamento na lista para registrar a chegada.', 'car') + '</div>') + '</section>' +
      '</div>';
    DT.opUI.ligarFiltroData(el, view, 'ck', desenhar);

    const busca = el.querySelector('#ck-busca');
    busca.addEventListener('input', e => {
      view.busca = e.target.value.trim(); desenhar();
      const b = el.querySelector('#ck-busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length);
    });
    busca.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const cod = DT.leitorQR ? DT.leitorQR.codigoDe(busca.value) : null;
      if (cod) { e.preventDefault(); chegadaPorQR(cod); return; }
      const l = fila(); if (l.length === 1) { view.sel = l[0].id; desenhar(); }
    });
    const bqr = el.querySelector('#ck-qr');
    if (bqr) bqr.addEventListener('click', () => DT.leitorQR.abrir(chegadaPorQR));
    DT.opUI.bindQueue(el, id => { view.sel = id; desenhar(); });
    if (ag) bindPainel(ag);
  }

  function painel(ag) {
    if (ag.status === S.CHEGOU) {
      return '<div class="card-body">' + ui.notice('ok', '<b>Chegada registrada às ' + U.fmtHora(ag.chegada) + '.</b> O cliente aguarda o início do atendimento.') +
        DT.opUI.resumoPedido(ag) + '</div><div class="card-foot">' +
        (DT.auth.pode('atendimento.registrar') ? '<button type="button" class="btn primary lg" id="ck-ir-atend">' + ui.icon('truck') + 'Iniciar atendimento</button>' : '') + '</div>';
    }
    const pronto = DT.ag.prepAtual(ag) === S.PRONTO;
    const slotPassou = new Date() > U.toDate(ag.data, ag.hora);
    if (ag.data !== U.dataISO()) {
      const passado = ag.data < U.dataISO();
      return '<div class="card-body">' + DT.opUI.resumoPedido(ag) +
        ui.notice('warn', 'Este agendamento é para <b>' + U.fmtData(ag.data) + ' às ' + ag.hora + '</b>. A chegada só é registrada no dia agendado. ' +
          (passado ? 'Se o cliente não veio, registre o não comparecimento; se vier hoje, o Comercial precisa reagendar.' : 'Para atender hoje, o Comercial precisa reagendar a retirada.')) + '</div>' +
        (passado ? '<div class="card-foot"><button type="button" class="btn danger" id="ck-noshow">' + ui.icon('ban') + 'Não compareceu</button></div>' : '');
    }
    return '<div class="card-head"><h3>Registrar chegada</h3></div><form id="ck-form" novalidate><div class="card-body">' +
      DT.opUI.resumoPedido(ag) +
      '<div class="big-time"><div><span>Horário agendado</span><b>' + ag.hora + '</b></div><div><span>Horário da chegada</span><b class="live" id="ck-agora">' + U.horaHM() + '</b></div></div>' +
      (pronto ? ui.notice('ok', 'Pedido <b>pronto para retirada</b>.') : ui.notice('warn', 'Atenção: o pedido ainda está na etapa <b>' + esc(DT.ag.prepAtual(ag)) + '</b>. A chegada pode ser registrada, mas o atendimento só inicia com o pedido pronto.')) +
      '<div class="fields-3"><div class="field"><label for="ck-placa">Placa do veículo</label><input id="ck-placa" class="input mono" placeholder="ABC-1234" maxlength="8" style="text-transform:uppercase"></div>' +
      '<div class="field"><label for="ck-mot">Motorista <span class="subtle">(opcional)</span></label><input id="ck-mot" class="input" placeholder="Nome"></div>' +
      '<div class="field"><label for="ck-cont">Contato</label><input id="ck-cont" class="input mono" value="' + esc(ag.pedido.telefone || '') + '"></div></div>' +
      (DT.auth.pode('checkin.horarioManual') ?
        '<details><summary class="label" style="cursor:pointer">Informar horário manualmente (exceção)</summary><div class="fields-2" style="padding-top:10px">' +
        '<div class="field"><label for="ck-hman">Horário da chegada</label><input type="time" id="ck-hman" class="input"></div>' +
        '<div class="field"><label for="ck-mman">Motivo</label><input id="ck-mman" class="input" placeholder="Ex.: sistema fora do ar"></div></div></details>' : '') +
      '</div><div class="card-foot" style="justify-content:space-between">' +
      '<div class="row">' + (ag.status !== S.A_CAMINHO ? '<button type="button" class="btn ghost" id="ck-caminho">' + ui.icon('car') + 'Cliente a caminho</button>' : '') +
      (slotPassou ? '<button type="button" class="btn danger" id="ck-noshow">' + ui.icon('ban') + 'Não compareceu</button>' : '') + '</div>' +
      '<button type="submit" class="btn primary lg">' + ui.icon('pin') + 'Registrar chegada</button></div></form>';
  }

  function bindPainel(ag) {
    const ir = el.querySelector('#ck-ir-atend');
    if (ir) { ir.addEventListener('click', () => DT.app.ir('atendimento', ag.id)); return; }
    if (!el.querySelector('#ck-form')) {
      const nsPassado = el.querySelector('#ck-noshow');
      if (nsPassado) nsPassado.addEventListener('click', () => DT.acoes.naoCompareceu(ag, () => { view.sel = null; desenhar(); DT.app.montarMenu(); }));
      return;
    }
    timer = setInterval(() => { const n = el.querySelector('#ck-agora'); if (n) n.textContent = U.horaHM(); else clearInterval(timer); }, 5000);
    const cam = el.querySelector('#ck-caminho');
    if (cam) cam.addEventListener('click', () => { const r = DT.ag.clienteACaminho(ag.id); if (!r.ok) ui.toast(r.erro, 'err'); else { ui.toast('Cliente a caminho registrado.'); desenhar(); } });
    const ns = el.querySelector('#ck-noshow');
    if (ns) ns.addEventListener('click', () => DT.acoes.naoCompareceu(ag, () => { view.sel = null; desenhar(); DT.app.montarMenu(); }));
    el.querySelector('#ck-form').addEventListener('submit', e => {
      e.preventDefault();
      const hm = el.querySelector('#ck-hman');
      const r = DT.ag.registrarChegada(ag.id, {
        placa: el.querySelector('#ck-placa').value.trim(),
        motorista: el.querySelector('#ck-mot').value.trim(),
        contato: el.querySelector('#ck-cont').value.trim(),
        horaManual: hm && hm.value ? hm.value : null,
        motivoManual: hm ? el.querySelector('#ck-mman').value.trim() : null
      });
      if (!r.ok) { ui.toast(r.erro, 'err'); return; }
      ui.toast('Chegada registrada às ' + U.fmtHora(r.ag.chegada) + '.');
      DT.app.montarMenu();
      desenhar();
    });
  }

  return view;
})();

/* ============================== ATENDIMENTO ============================== */
DT.views.atendimento = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS;
  const view = { titulo: 'Atendimento', eyebrow: 'Logística · Doca e carregamento', aoVivo: true, sel: null };
  let el;

  view.render = function (c, param) { el = c; if (param || !DT.app.estaVoltando()) view.sel = param || null; DT.opUI.dataAoAbrir(view, param); desenhar(); };
  view.refresh = function () { desenhar(); };

  function desenhar() {
    const d = DT.opUI.dataDe(view), hoje = U.dataISO();
    const ags = DT.db.agendamentos();
    // listas completas (as docas e o limite de veículos valem para todas as datas)
    const aguardandoTodos = ags.filter(a => a.status === S.CHEGOU);
    const emAtTodos = ags.filter(a => a.status === S.EM_ATENDIMENTO || a.status === S.CARREGANDO);
    const aguardando = aguardandoTodos.filter(a => a.data === d).sort((a, b) => a.chegada < b.chegada ? -1 : 1);
    const emAt = emAtTodos.filter(a => a.data === d).sort((a, b) => a.inicioAtendimento < b.inicioAtendimento ? -1 : 1);
    const doDia = ags.filter(a => a.data === d);
    const atendidos = doDia.filter(a => a.inicioAtendimento && [S.ENTREGUE, S.CONCLUIDO].indexOf(a.status) >= 0);
    const esperaMedia = U.media(doDia.filter(a => a.inicioAtendimento).map(a => DT.kpi.tempos(a).espera));
    let ag = view.sel ? DT.db.agendamentoPorId(view.sel) : null;
    if (ag && [S.CHEGOU, S.EM_ATENDIMENTO, S.CARREGANDO].indexOf(ag.status) < 0) ag = null;
    if (!ag) ag = aguardando[0] || emAt[0] || null;
    const cfg = DT.db.settings();
    const agora = new Date().toISOString();

    el.innerHTML =
      DT.opUI.filtroDataHTML(view, 'at', [['Aguardando', aguardando.length], ['Em atendimento', emAt.length], ['Atendidos', atendidos.length], ['Espera média', U.fmtDuracao(esperaMedia)]]) +
      DT.opUI.avisoOutrasDatas(aguardandoTodos.concat(emAtTodos), d, 'veículo(s) no local') +
      '<div class="grid-side-main">' +
        '<div class="stack">' +
          '<section class="card"><div class="card-head"><h3>Aguardando atendimento</h3><span class="spacer"></span><span class="subtle">' + aguardando.length + '</span></div>' +
            '<div class="queue">' + (aguardando.length ? aguardando.map(a => DT.opUI.queueItem(a, ag && a.id === ag.id, 'Chegou ' + U.fmtHora(a.chegada) + ' · esperando há ' + U.fmtDuracao(U.difMin(a.chegada, agora)))).join('') : ui.empty('Nenhum cliente aguardando nesta data.', 'car')) + '</div></section>' +
          '<section class="card"><div class="card-head"><h3>Em atendimento</h3><span class="spacer"></span><span class="subtle">' + (d === hoje ? emAtTodos.length + ' de ' + cfg.maxVeiculosSimultaneos + ' veículos' : emAt.length) + '</span></div>' +
            '<div class="queue">' + (emAt.length ? emAt.map(a => DT.opUI.queueItem(a, ag && a.id === ag.id, esc(a.doca) + ' · há ' + U.fmtDuracao(U.difMin(a.inicioAtendimento, agora)))).join('') : ui.empty('Nenhuma doca em uso nesta data.', 'truck')) + '</div></section>' +
          '<section class="card"><div class="card-head"><h3>Atendidos</h3><span class="spacer"></span><span class="subtle">' + atendidos.length + '</span></div><div class="queue">' +
            (atendidos.length ? atendidos.sort((a, b) => a.inicioAtendimento < b.inicioAtendimento ? -1 : 1).map(a => '<div class="queue-item" style="cursor:default"><span class="qt">' + U.fmtHora(a.inicioAtendimento) + '</span><span class="qm"><b>' + esc(a.pedido.cliente) + '</b><span class="row">' + ui.tag(a.pedido.numero) + '<span class="subtle">' + esc(a.doca || '') + ' · espera ' + U.fmtDuracao(DT.kpi.tempos(a).espera) + ' · atendimento ' + U.fmtDuracao(DT.kpi.tempos(a).atendimento) + '</span></span></span></div>').join('') : ui.empty('Nenhum atendimento concluído nesta data.', 'check')) +
          '</div></section>' +
        '</div>' +
        '<section class="card">' + (ag ? painel(ag, emAtTodos) : '<div class="card-body">' + ui.empty('Quando um cliente fizer check-in, ele aparece aqui para iniciar o atendimento.', 'truck') + '</div>') + '</section>' +
      '</div>';
    DT.opUI.ligarFiltroData(el, view, 'at', desenhar);
    DT.opUI.bindQueue(el, id => { view.sel = id; desenhar(); });
    if (ag) bindPainel(ag);
  }

  function painel(ag, emAt) {
    const agora = new Date().toISOString();
    const t = DT.kpi.tempos(ag);
    if (ag.status === S.CHEGOU) {
      const pronto = DT.ag.prepAtual(ag) === S.PRONTO;
      const ocupadas = emAt.map(a => a.doca);
      const docas = DT.db.settings().docas.map(d => ({ value: d, label: d + (ocupadas.indexOf(d) >= 0 ? ' (ocupada)' : '') }));
      const livre = DT.db.settings().docas.find(d => ocupadas.indexOf(d) < 0) || '';
      return '<div class="card-head"><h3>Iniciar atendimento</h3></div><form id="at-form" novalidate><div class="card-body">' +
        DT.opUI.resumoPedido(ag) +
        '<div class="big-time"><div><span>Chegada</span><b>' + U.fmtHora(ag.chegada) + '</b></div><div><span>Início do atendimento</span><b class="live">' + U.horaHM() + '</b></div>' +
        '<div><span>Esperando há</span><b>' + U.fmtDuracao(U.difMin(ag.chegada, agora)) + '</b></div></div>' +
        (pronto ? '' : ui.notice('crit', 'O pedido está em <b>' + esc(DT.ag.prepAtual(ag)) + '</b>. Conclua a preparação (separado, conferido e faturado) antes de iniciar o atendimento.')) +
        '<div class="fields-2">' +
          '<div class="field"><label for="at-doca">Doca / local de atendimento</label><select id="at-doca" class="select">' + ui.options(docas, livre, 'Selecione…') + '</select></div>' +
          '<div class="field"><label for="at-resp">Responsável pelo atendimento</label><select id="at-resp" class="select">' + ui.funcionariosOptions(DT.auth.usuarioAtual().nome, 'Logística') + '</select></div>' +
          '<div class="field"><label for="at-carr">Responsável pelo carregamento</label><select id="at-carr" class="select">' + ui.funcionariosOptions('', 'Logística') + '</select></div>' +
          '<div class="field"><label for="at-veic">Veículo</label><input id="at-veic" class="input mono" readonly value="' + esc((ag.veiculo && ag.veiculo.placa) || 'não informado') + '"></div>' +
        '</div>' +
        '<div class="field"><label for="at-obs">Observações <span class="subtle">(opcional)</span></label><textarea id="at-obs" class="textarea" placeholder="Ex.: carregar com atenção aos materiais frágeis"></textarea></div>' +
        '</div><div class="card-foot"><button type="submit" class="btn primary lg"' + (pronto ? '' : ' disabled') + '>' + ui.icon('truck') + 'Registrar atendimento</button></div></form>';
    }
    // em atendimento / carregamento
    return '<div class="card-head"><h3>' + (ag.status === S.CARREGANDO ? 'Carregamento em andamento' : 'Atendimento em andamento') + '</h3><span class="spacer"></span><span class="badge tone-navy">' + esc(ag.doca) + '</span></div><div class="card-body">' +
      DT.opUI.resumoPedido(ag) +
      '<div class="big-time"><div><span>Chegada</span><b>' + U.fmtHora(ag.chegada) + '</b></div><div><span>Início atendimento</span><b>' + U.fmtHora(ag.inicioAtendimento) + '</b></div>' +
      '<div><span>Tempo de espera</span><b>' + U.fmtDuracao(t.espera) + '</b></div><div><span>Em atendimento há</span><b class="live">' + U.fmtDuracao(U.difMin(ag.inicioAtendimento, agora)) + '</b></div></div>' +
      '<dl class="kv two"><div><dt>Responsável pelo atendimento</dt><dd>' + esc(ag.respAtendimento) + '</dd></div><div><dt>Início do carregamento</dt><dd class="mono">' + U.fmtHora(ag.inicioCarregamento) + '</dd></div></dl>' +
      (ag.obsAtendimento ? ui.notice('info', '<b>Observação:</b> ' + esc(ag.obsAtendimento)) : '') +
      (ag.status === S.EM_ATENDIMENTO ? '<div class="field"><label for="at-carr2">Responsável pelo carregamento</label><select id="at-carr2" class="select">' + ui.funcionariosOptions(ag.respCarregamento, 'Logística') + '</select></div>' : '') +
      '</div><div class="card-foot">' +
      (ag.status === S.EM_ATENDIMENTO ? '<button type="button" class="btn ghost lg" id="at-carregar">' + ui.icon('box') + 'Iniciar carregamento</button>' : '') +
      (DT.auth.pode('entrega.finalizar') ? '<button type="button" class="btn primary lg" id="at-entrega">' + ui.icon('check') + 'Registrar entrega</button>' : '') + '</div>';
  }

  function bindPainel(ag) {
    const f = el.querySelector('#at-form');
    if (f) f.addEventListener('submit', e => {
      e.preventDefault();
      const r = DT.ag.iniciarAtendimento(ag.id, {
        doca: el.querySelector('#at-doca').value,
        respAtendimento: el.querySelector('#at-resp').value,
        respCarregamento: el.querySelector('#at-carr').value,
        observacao: el.querySelector('#at-obs').value.trim()
      });
      if (!r.ok) { ui.toast(r.erro, 'err'); return; }
      ui.toast('Atendimento iniciado na ' + r.ag.doca + '.');
      view.sel = ag.id; DT.app.montarMenu(); desenhar();
    });
    const c = el.querySelector('#at-carregar');
    if (c) c.addEventListener('click', () => {
      const r = DT.ag.iniciarCarregamento(ag.id, el.querySelector('#at-carr2').value);
      if (!r.ok) { ui.toast(r.erro, 'err'); return; }
      ui.toast('Carregamento iniciado.'); desenhar();
    });
    const en = el.querySelector('#at-entrega');
    if (en) en.addEventListener('click', () => DT.app.ir('entrega', ag.id));
  }

  return view;
})();

/* ================================ ENTREGA ================================ */
DT.views.entrega = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS;
  const view = { titulo: 'Entrega', eyebrow: 'Logística · Finalização da retirada', aoVivo: true, sel: null, finalizado: null };
  let el;

  view.render = function (c, param) { el = c; if (param || !DT.app.estaVoltando()) { view.sel = param || null; view.finalizado = null; } DT.opUI.dataAoAbrir(view, param); desenhar(); };
  view.refresh = function () { if (!view.finalizado) desenhar(); };

  function desenhar() {
    const d = DT.opUI.dataDe(view), hoje = U.dataISO();
    const ags = DT.db.agendamentos();
    const emAtTodos = ags.filter(a => a.status === S.EM_ATENDIMENTO || a.status === S.CARREGANDO);
    const emAt = emAtTodos.filter(a => a.data === d).sort((a, b) => a.inicioAtendimento < b.inicioAtendimento ? -1 : 1);
    let ag = view.sel ? DT.db.agendamentoPorId(view.sel) : null;
    if (ag && [S.EM_ATENDIMENTO, S.CARREGANDO].indexOf(ag.status) < 0) ag = null;
    if (!ag && !view.finalizado) ag = emAt[0] || null;
    const concl = ags.filter(a => a.data === d && a.status === S.CONCLUIDO).sort((a, b) => a.entrega < b.entrega ? 1 : -1);
    const atendMedio = U.media(concl.map(a => DT.kpi.tempos(a).atendimento));
    const agora = new Date().toISOString();

    el.innerHTML =
      DT.opUI.filtroDataHTML(view, 'en', [['Em atendimento', emAt.length], ['Concluídas', concl.length], ['Atendimento médio', U.fmtDuracao(atendMedio)]]) +
      DT.opUI.avisoOutrasDatas(emAtTodos, d, 'veículo(s) em atendimento') +
      '<div class="grid-side-main">' +
        '<div class="stack">' +
          '<section class="card"><div class="card-head"><h3>Em atendimento</h3><span class="spacer"></span><span class="subtle">' + emAt.length + '</span></div>' +
            '<div class="queue">' + (emAt.length ? emAt.map(a => DT.opUI.queueItem(a, ag && a.id === ag.id, esc(a.doca) + ' · há ' + U.fmtDuracao(U.difMin(a.inicioAtendimento, agora)))).join('') : ui.empty('Nenhum veículo em atendimento nesta data.', 'truck')) + '</div></section>' +
          '<section class="card"><div class="card-head"><h3>' + (d === hoje ? 'Concluídas hoje' : 'Concluídas em ' + U.fmtData(d).slice(0, 5)) + '</h3><span class="spacer"></span><span class="subtle">' + concl.length + '</span></div><div class="queue">' +
            (concl.length ? concl.map(a => '<div class="queue-item" style="cursor:default"><span class="qt">' + U.fmtHora(a.entrega) + '</span><span class="qm"><b>' + esc(a.pedido.cliente) + '</b><span class="row">' + ui.tag(a.pedido.numero) + '<span class="subtle">' + esc(a.respCarregamento || '') + ' · ' + U.fmtDuracao(DT.kpi.tempos(a).atendimento) + '</span></span></span></div>').join('') : ui.empty('Nenhuma retirada concluída nesta data.', 'check')) +
          '</div></section>' +
        '</div>' +
        '<section class="card">' + (view.finalizado ? resumoFinal(DT.db.agendamentoPorId(view.finalizado)) : ag ? painel(ag) : '<div class="card-body">' + ui.empty('Selecione um veículo em atendimento para registrar a entrega.', 'check') + '</div>') + '</section>' +
      '</div>';
    DT.opUI.ligarFiltroData(el, view, 'en', desenhar);
    DT.opUI.bindQueue(el, id => { view.sel = id; view.finalizado = null; desenhar(); });
    if (view.finalizado) {
      el.querySelector('#en-prox').addEventListener('click', () => { view.finalizado = null; view.sel = null; desenhar(); });
    } else if (ag) bind(ag);
  }

  function painel(ag) {
    const u = DT.auth.usuarioAtual();
    return '<div class="card-head"><h3>Finalização da entrega</h3><span class="spacer"></span><span class="badge tone-navy">' + esc(ag.doca) + '</span></div><form id="en-form" novalidate><div class="card-body">' +
      DT.opUI.resumoPedido(ag) +
      '<div class="big-time"><div><span>Chegada</span><b>' + U.fmtHora(ag.chegada) + '</b></div><div><span>Início atendimento</span><b>' + U.fmtHora(ag.inicioAtendimento) + '</b></div>' +
      '<div><span>Hora da entrega</span><b class="live">' + U.horaHM() + '</b></div></div>' +
      '<div class="fields-2">' +
        '<div class="field"><label for="en-resp">Responsável pelo carregamento / entrega</label><select id="en-resp" class="select">' + ui.funcionariosOptions(ag.respCarregamento, 'Logística') + '</select></div>' +
        '<div class="field"><label for="en-user">Usuário que encerra a operação</label><input id="en-user" class="input" readonly value="' + esc(u.nome) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="en-obs">Observações <span class="subtle">(opcional)</span></label><textarea id="en-obs" class="textarea" placeholder="Ex.: cliente conferiu e retirou sem ressalvas"></textarea></div>' +
      ui.notice('info', 'A hora da entrega é registrada automaticamente ao finalizar.', 'clock') +
      '</div><div class="card-foot"><button type="submit" class="btn success lg">' + ui.icon('check') + 'Finalizar retirada</button></div></form>';
  }

  function resumoFinal(ag) {
    const t = DT.kpi.tempos(ag);
    return '<div class="card-body">' + ui.notice('ok', '<b>Retirada concluída.</b> Pedido ' + esc(ag.pedido.numero) + ' entregue a ' + esc(ag.pedido.cliente) + ' às ' + U.fmtHora(ag.entrega) + '.') +
      '<div class="big-time"><div><span>Tempo de espera</span><b>' + U.fmtDuracao(t.espera) + '</b></div><div><span>Tempo de atendimento</span><b>' + U.fmtDuracao(t.atendimento) + '</b></div>' +
      '<div><span>Tempo total</span><b>' + U.fmtDuracao(t.total) + '</b></div><div><span>Chegada x agendado</span><b>' + (t.pontualidade > 0 ? '+' : '') + U.fmtDuracao(t.pontualidade) + '</b></div></div>' +
      '<dl class="kv"><div><dt>Doca</dt><dd>' + esc(ag.doca) + '</dd></div><div><dt>Carregamento</dt><dd>' + esc(ag.respCarregamento) + '</dd></div><div><dt>Encerrado por</dt><dd>' + esc(ag.encerradoPor) + '</dd></div></dl>' +
      '</div><div class="card-foot"><button type="button" class="btn ghost" data-goto-pedido="' + esc(ag.pedido.numero) + '">' + ui.icon('timeline') + 'Linha do tempo</button><button type="button" class="btn primary" id="en-prox">Próximo veículo</button></div>';
  }

  function bind(ag) {
    el.querySelector('#en-form').addEventListener('submit', e => {
      e.preventDefault();
      const r = DT.ag.finalizar(ag.id, { respCarregamento: el.querySelector('#en-resp').value, observacao: el.querySelector('#en-obs').value.trim() });
      if (!r.ok) { ui.toast(r.erro, 'err'); return; }
      ui.toast('Retirada do pedido ' + ag.pedido.numero + ' concluída.');
      view.finalizado = ag.id; view.sel = null;
      DT.app.montarMenu();
      desenhar();
    });
  }

  return view;
})();

/* =========================== ACOMPANHAR PEDIDO =========================== */
DT.views.pedido = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS, G = DT.STATUS_GRUPOS;
  const view = { titulo: 'Acompanhar pedido', eyebrow: 'Linha do tempo e histórico', aoVivo: true, data: null, busca: '' };
  let el, numero = '', agSel = null;

  view.render = function (c, param) {
    el = c; numero = (param || '').replace(/\D/g, ''); agSel = null;
    // Pelo menu, a lista abre em hoje; ao voltar da linha do tempo, mantém a data e a busca
    if (!numero && !DT.app.estaVoltando()) { view.data = null; view.busca = ''; }
    desenhar();
  };
  view.refresh = function () {
    const b = el && el.querySelector('#pd-busca');
    if (b && document.activeElement === b) return;
    desenhar();
  };

  function desenhar() { if (numero) desenharPedido(); else desenharLista(); }

  /* ---------- Lista do dia (com filtro de data) ---------- */
  function desenharLista() {
    const d = DT.opUI.dataDe(view), hoje = U.dataISO();
    const doDia = DT.db.agendamentos().filter(a => a.data === d);
    const b = view.busca.toLowerCase();
    const lista = doDia.filter(a => !b || a.pedido.numero.indexOf(b) >= 0 || a.pedido.cliente.toLowerCase().indexOf(b) >= 0)
      .sort((x, y) => (x.hora + x.criadoEm) < (y.hora + y.criadoEm) ? -1 : 1);
    const conta = f => doDia.filter(f).length;
    const stats = [
      ['Retiradas', conta(a => a.status !== S.CANCELADO)],
      ['Em andamento', conta(a => G.finalizados.indexOf(a.status) < 0)],
      ['Concluídas', conta(a => a.status === S.CONCLUIDO)],
      ['Canceladas / ausentes', conta(a => a.status === S.CANCELADO || a.status === S.NAO_COMPARECEU)]
    ];
    el.innerHTML =
      DT.opUI.filtroDataHTML(view, 'pd', stats) +
      '<section class="card"><div class="card-body"><form id="pd-f" class="row" style="align-items:end" novalidate>' +
        '<div class="field" style="flex:1 1 240px"><label for="pd-num">Consultar pelo nº do pedido <span class="subtle">(qualquer data)</span></label><input id="pd-num" class="input big" inputmode="numeric" placeholder="Ex.: 123101"></div>' +
        '<button type="submit" class="btn primary lg">' + ui.icon('search') + 'Consultar</button></form></div></section>' +
      '<section class="card"><div class="card-head"><h3>' + (d === hoje ? 'Retiradas de hoje' : 'Retiradas de ' + U.fmtData(d)) + '</h3><span class="spacer"></span>' +
        '<div class="field" style="width:260px;max-width:100%"><label class="sr-only" for="pd-busca">Filtrar a lista</label><input id="pd-busca" class="input" placeholder="Filtrar por cliente ou pedido" value="' + esc(view.busca) + '"></div></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Horário</th><th>Pedido</th><th>Cliente</th><th>Status</th><th>Última alteração</th></tr></thead><tbody>' +
      (lista.length ? lista.map(a => '<tr class="clickable" data-num="' + esc(a.pedido.numero) + '" tabindex="0"><td class="time">' + a.hora + '</td><td>' + ui.tag(a.pedido.numero, false) + '</td><td>' + esc(a.pedido.cliente) + '</td><td>' + ui.badge(a.status) + '</td><td class="subtle">' + U.fmtDataHora(a.alteradoEm) + ' · ' + esc(a.alteradoPor) + '</td></tr>').join('')
        : '<tr><td colspan="5">' + ui.empty(view.busca ? 'Nenhuma retirada encontrada para "' + view.busca + '" nesta data.' : 'Nenhuma retirada agendada nesta data.', 'calendar') + '</td></tr>') +
      '</tbody></table></div></section>';

    DT.opUI.ligarFiltroData(el, view, 'pd', desenhar);
    el.querySelector('#pd-f').addEventListener('submit', e => {
      e.preventDefault();
      const n = el.querySelector('#pd-num').value.replace(/\D/g, '');
      if (n) DT.app.ir('pedido', n);
    });
    const busca = el.querySelector('#pd-busca');
    busca.addEventListener('input', e => {
      view.busca = e.target.value.trim(); desenharLista();
      const nb = el.querySelector('#pd-busca'); nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length);
    });
    el.querySelectorAll('tr[data-num]').forEach(r => {
      r.addEventListener('click', () => DT.app.ir('pedido', r.dataset.num));
      r.addEventListener('keydown', e => { if (e.key === 'Enter') DT.app.ir('pedido', r.dataset.num); });
    });
  }

  /* ---------- Linha do tempo de um pedido ---------- */
  function desenharPedido() {
    const lista = DT.ag.doPedido(numero);
    const ag = lista.find(a => a.id === agSel) || lista[0] || null;
    const ant = DT.app.rotaAnterior();
    const destino = ant && !(ant.id === 'pedido' && ant.param === numero) ? ant : { id: 'pedido', param: '' };
    const rotulo = destino.id === 'pedido' ? (destino.param ? 'Voltar ao pedido ' + destino.param : 'Voltar para a lista') : 'Voltar para ' + DT.app.nomeRota(destino.id);

    el.innerHTML =
      '<section class="card"><div class="card-body"><div class="row between" style="align-items:end">' +
        '<button type="button" class="btn ghost" id="pd-voltar">' + ui.icon('back') + esc(rotulo) + '</button>' +
        '<form id="pd-f" class="row" style="align-items:end;flex:1 1 360px;justify-content:flex-end" novalidate>' +
          '<div class="field" style="flex:1 1 200px;max-width:320px"><label for="pd-num">Nº do pedido</label><input id="pd-num" class="input mono" inputmode="numeric" value="' + esc(numero) + '" placeholder="Ex.: 123101"></div>' +
          '<button type="submit" class="btn primary">' + ui.icon('search') + 'Consultar</button></form>' +
      '</div></div></section>' +
      (!lista.length ? ui.notice('warn', 'Nenhum agendamento encontrado para o pedido <b class="mono">' + esc(numero) + '</b>.' + (DT.auth.pode('agendamento.criar') ? ' <a href="#agendar">Agendar retirada</a>' : '')) : '') +
      (ag ? detalhe(ag, lista) : '');

    el.querySelector('#pd-voltar').addEventListener('click', () => DT.app.voltar(destino));
    el.querySelector('#pd-f').addEventListener('submit', e => {
      e.preventDefault();
      const n = el.querySelector('#pd-num').value.replace(/\D/g, '');
      DT.app.ir('pedido', n);
    });
    el.querySelectorAll('[data-agsel]').forEach(b => b.addEventListener('click', () => { agSel = b.dataset.agsel; desenhar(); }));
    const ac = el.querySelector('#pd-acoes');
    if (ac) ac.addEventListener('click', () => DT.acoes.detalhe(ag, () => desenhar()));
  }

  function detalhe(ag, lista) {
    const t = DT.kpi.tempos(ag);
    const hist = ag.historico.slice().sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    let ultimoDia = null;
    return (lista.length > 1 ? '<div class="tabs">' + lista.map(a => '<button type="button" class="tab' + (a.id === ag.id ? ' active' : '') + '" data-agsel="' + a.id + '">' + U.fmtData(a.data) + ' ' + a.hora + ' · ' + esc(a.status) + '</button>').join('') + '</div>' : '') +
      '<div class="grid-2">' +
        '<section class="card"><div class="card-head"><h3>Linha do tempo</h3><span class="spacer"></span>' + ui.badge(ag.status) + '</div><div class="card-body"><ol class="timeline">' +
        hist.map(h => {
          const d = U.dataISO(new Date(h.ts));
          const mostraDia = d !== ultimoDia; ultimoDia = d;
          const red = [S.CANCELADO, S.NAO_COMPARECEU].indexOf(h.status) >= 0;
          const blue = h.status === S.REAGENDADO || h.status === 'Agendamento criado';
          return '<li><span class="tt">' + U.fmtHora(h.ts) + (mostraDia ? '<span class="td">' + U.fmtData(d).slice(0, 5) + '</span>' : '') + '</span>' +
            '<span class="dot' + (red ? ' red' : blue ? ' blue' : '') + '">' + ui.icon(red ? 'x' : 'check') + '</span>' +
            '<span class="tb"><b>' + esc(h.status) + '</b><span>' + esc(h.desc) + '</span><small>' + esc(h.usuario || '') + '</small></span></li>';
        }).join('') + '</ol></div></section>' +
        '<div class="stack">' +
          '<section class="card"><div class="card-head"><h3>' + esc(ag.pedido.cliente) + '</h3><span class="spacer"></span><button type="button" class="btn ghost sm" id="pd-acoes">Ações</button></div><div class="card-body">' +
            '<div class="row">' + ui.alertChips(ag) + '</div>' +
            '<div class="big-time"><div><span>Retirada</span><b>' + U.fmtData(ag.data).slice(0, 5) + ' ' + ag.hora + '</b></div><div><span>Espera</span><b>' + U.fmtDuracao(t.espera) + '</b></div>' +
            '<div><span>Atendimento</span><b>' + U.fmtDuracao(t.atendimento) + '</b></div><div><span>Total</span><b>' + U.fmtDuracao(t.total) + '</b></div></div>' +
            ui.pedidoKV(ag.pedido, ag) +
            '<dl class="kv"><div><dt>Agendado por</dt><dd>' + esc(ag.criadoPor) + '</dd></div><div><dt>Criado em</dt><dd>' + U.fmtDataHora(ag.criadoEm) + '</dd></div><div><dt>Última alteração</dt><dd>' + U.fmtDataHora(ag.alteradoEm) + '</dd></div>' +
            '<div><dt>Doca</dt><dd>' + esc(ag.doca || '—') + '</dd></div><div><dt>Atendimento</dt><dd>' + esc(ag.respAtendimento || '—') + '</dd></div><div><dt>Carregamento</dt><dd>' + esc(ag.respCarregamento || '—') + '</dd></div></dl>' +
          '</div></section>' +
          (ag.reagendamentos && ag.reagendamentos.length ? '<section class="card"><div class="card-head"><h3>Reagendamentos</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Quando</th><th>De</th><th>Para</th><th>Motivo</th><th>Usuário</th></tr></thead><tbody>' +
            ag.reagendamentos.map(r => '<tr><td class="subtle">' + U.fmtDataHora(r.ts) + '</td><td class="mono">' + U.fmtData(r.deData).slice(0, 5) + ' ' + r.deHora + '</td><td class="mono">' + U.fmtData(r.paraData).slice(0, 5) + ' ' + r.paraHora + '</td><td>' + esc(r.motivo) + '</td><td>' + esc(r.usuario) + '</td></tr>').join('') +
            '</tbody></table></div></section>' : '') +
        '</div>' +
      '</div>';
  }

  return view;
})();
