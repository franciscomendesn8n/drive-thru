/* =====================================================================
   Telas de Gestão: Dashboard operacional, Relatórios e Auditoria
   ===================================================================== */
window.DT = window.DT || {};
DT.views = DT.views || {};

/* ============================ DASHBOARD ============================ */
DT.views.dashboard = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS;
  const view = { titulo: 'Dashboard operacional', eyebrow: 'Acompanhamento em tempo real', aoVivo: true, data: null };
  let el;

  view.render = function (c) { el = c; if (!view.data) view.data = U.dataISO(); desenhar(); };
  view.refresh = function () { desenhar(); };

  function gauge(pct, ocup, total) {
    const r = 48, c = 2 * Math.PI * r;
    return '<div class="gauge"><svg viewBox="0 0 120 120" role="img" aria-label="Ocupação de ' + pct + '%">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" class="gauge-track" stroke-width="12"/>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" class="gauge-val" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - Math.min(pct, 100) / 100)).toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
      '<text x="60" y="68" text-anchor="middle" font-size="28">' + pct + '%</text></svg>' +
      '<div class="stack" style="gap:4px"><b class="mono" style="font-size:22px">' + ocup + ' / ' + total + '</b><span class="muted">janelas ocupadas no dia</span>' +
      '<span class="subtle">' + DT.db.settings().pedidosPorJanela + ' pedido(s) por janela de ' + DT.db.settings().intervaloMin + ' min</span></div></div>';
  }

  function desenhar() {
    const data = view.data;
    const r = DT.kpi.resumoDia(data);
    const ags = DT.db.agendamentos().filter(a => a.data === data).sort((a, b) => a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0);
    const agora = new Date();
    const alertas = [];
    ags.forEach(a => DT.kpi.alertas(a, agora).forEach(x => alertas.push({ ag: a, al: x })));
    const peso = { crit: 0, warn: 1, info: 2 };
    alertas.sort((a, b) => peso[a.al.nivel] - peso[b.al.nivel] || (a.ag.hora < b.ag.hora ? -1 : 1));
    const concl = ags.filter(a => a.status === S.CONCLUIDO).map(DT.kpi.tempos);
    const med = k => U.media(concl.map(t => t[k]));
    const mapa = DT.agenda.mapaDia(data);
    const porHora = {};
    mapa.forEach(j => { const h = j.hora.slice(0, 2); porHora[h] = porHora[h] || { cap: 0, oc: 0 }; porHora[h].cap += j.capacidade; porHora[h].oc += Math.min(j.ocupados, j.capacidade); });

    const kpis = [
      ['Agendados', r.agendados, 'c-blue', 'no dia'],
      ['Aguardando preparação', r.aguardandoPreparacao, 'c-amber', 'não prontos'],
      ['Prontos', r.prontos, 'c-green', 'para retirada'],
      ['Clientes aguardados', r.aguardados, 'c-cyan', 'ainda não chegaram'],
      ['Já chegaram', r.chegaram, 'c-cyan', 'check-ins'],
      ['Em atendimento', r.emAtendimento, 'c-navy', 'no local'],
      ['Concluídos', r.concluidos, 'c-done', 'retiradas'],
      ['Atrasados', r.atrasados, 'c-red' + (r.atrasados ? ' alarm' : ''), 'precisam de atenção'],
      ['Cancelados', r.cancelados, 'c-neutral', 'no dia'],
      ['Não compareceram', r.naoCompareceu, 'c-red', 'ausências']
    ];

    el.innerHTML =
      '<div class="page-intro"><div class="row"><div class="field"><label for="db-data">Data</label><input type="date" id="db-data" class="input" value="' + data + '" style="width:170px"></div>' +
        '<span class="subtle" style="align-self:end;padding-bottom:10px">Atualiza sozinho a cada 30 s · ' + U.horaHM(agora) + '</span></div></div>' +
      '<div class="kpis">' + kpis.map(k => '<div class="kpi ' + k[2] + '"><b>' + k[1] + '</b><span>' + k[0] + '</span><small>' + k[3] + '</small></div>').join('') + '</div>' +
      '<div class="grid-main-side">' +
        '<section class="card"><div class="card-head"><h3>Agenda do dia</h3><span class="spacer"></span>' + (DT.auth.pode('agenda.ver') ? '<a class="btn ghost sm" href="#agenda">Abrir agenda</a>' : '') + '</div>' +
          '<div class="table-wrap"><table class="table"><thead><tr><th>Hora</th><th>Pedido</th><th>Cliente</th><th>Status</th><th>Alertas</th></tr></thead><tbody>' +
          (ags.length ? ags.map(a => '<tr class="clickable" data-ag="' + a.id + '"><td class="time">' + a.hora + '</td><td>' + ui.tag(a.pedido.numero) + '</td><td>' + esc(a.pedido.cliente) + '</td><td>' + ui.badge(a.status) + '</td><td><div class="row" style="gap:4px">' + ui.alertChips(a) + '</div></td></tr>').join('')
            : '<tr><td colspan="5">' + ui.empty('Nenhum agendamento nesta data.', 'calendar') + '</td></tr>') +
          '</tbody></table></div></section>' +
        '<div class="stack">' +
          '<section class="card"><div class="card-head"><h3>Utilização das janelas</h3></div><div class="card-body">' + gauge(r.ocupacaoPct, r.janelasOcupadas, r.capacidadeTotal) + '</div></section>' +
          '<section class="card"><div class="card-head"><h3>Alertas operacionais</h3><span class="spacer"></span><span class="subtle">' + alertas.length + '</span></div>' +
            '<div class="alert-list">' + (alertas.length ? alertas.slice(0, 12).map(x => alertaHTML(x.ag, x.al)).join('') : ui.empty('Nenhuma situação exige atenção agora.', 'check')) + '</div></section>' +
        '</div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<section class="card"><div class="card-head"><h3>Tempos das retiradas concluídas</h3></div><div class="card-body">' +
          '<div class="big-time"><div><span>Espera média</span><b>' + U.fmtDuracao(med('espera')) + '</b></div><div><span>Atendimento médio</span><b>' + U.fmtDuracao(med('atendimento')) + '</b></div>' +
          '<div><span>Tempo total médio</span><b>' + U.fmtDuracao(med('total')) + '</b></div><div><span>Chegada x agendado</span><b>' + (med('pontualidade') > 0 ? '+' : '') + U.fmtDuracao(med('pontualidade')) + '</b></div></div>' +
          '<p class="subtle">Espera = início do atendimento − chegada · Atendimento = entrega − início · Total = entrega − chegada · Chegada x agendado: positivo = atraso do cliente.</p>' +
        '</div></section>' +
        '<section class="card"><div class="card-head"><h3>Ocupação por hora</h3></div><div class="card-body"><div class="bars">' +
          (Object.keys(porHora).length ? Object.keys(porHora).sort().map(h => {
            const p = porHora[h]; const pct = p.cap ? Math.round(p.oc / p.cap * 100) : 0;
            return '<div class="bar-row"><span class="mono">' + h + ':00</span><div class="bar-track"><div class="bar-fill' + (pct >= 100 ? ' alt' : '') + '" style="width:' + pct + '%"></div></div><span class="mono subtle" style="text-align:right">' + p.oc + '/' + p.cap + '</span></div>';
          }).join('') : ui.empty('Sem janelas nesta data.', 'chart')) +
        '</div></div></section>' +
      '</div>';

    el.querySelector('#db-data').addEventListener('change', e => { view.data = e.target.value || U.dataISO(); desenhar(); });
    el.querySelectorAll('tr[data-ag]').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('[data-goto-pedido]')) return; DT.acoes.detalhe(DT.db.agendamentoPorId(tr.dataset.ag), () => desenhar()); }));
    el.querySelectorAll('[data-alerta]').forEach(b => b.addEventListener('click', () => acaoAlerta(b.dataset.alerta, b.dataset.id)));
  }

  function alertaHTML(ag, al) {
    let botao = '';
    if (al.tipo === 'noshow' && (DT.auth.pode('checkin.registrar') || DT.auth.pode('agendamento.alterar'))) botao = '<button type="button" class="btn ghost sm" data-alerta="noshow" data-id="' + ag.id + '">Registrar ausência</button>';
    else if ((al.tipo === 'critica' || al.tipo === 'pendente' || al.tipo === 'aguardandoPrep') && DT.auth.pode('preparacao.alterar')) botao = '<button type="button" class="btn ghost sm" data-alerta="prep" data-id="' + ag.id + '">Ver preparação</button>';
    else if (al.tipo === 'clienteAtrasado' && DT.auth.pode('checkin.registrar')) botao = '<button type="button" class="btn ghost sm" data-alerta="checkin" data-id="' + ag.id + '">Check-in</button>';
    return '<div class="alert-item"><span class="sev ' + al.nivel + '"></span><div class="txt"><b>' + esc(al.texto) + '</b><span><span class="mono">' + ag.hora + '</span> · ' + esc(ag.pedido.numero) + ' · ' + esc(ag.pedido.cliente) + ' · ' + esc(ag.status) + '</span></div>' + botao + '</div>';
  }
  function acaoAlerta(tipo, id) {
    const ag = DT.db.agendamentoPorId(id);
    if (tipo === 'noshow') DT.acoes.naoCompareceu(ag, () => desenhar());
    if (tipo === 'prep') { DT.views.preparacao.data = ag.data; DT.app.ir('preparacao'); }
    if (tipo === 'checkin') DT.app.ir('checkin', ag.id);
  }

  return view;
})();

/* ============================ RELATÓRIOS ============================ */
DT.views.relatorios = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS;
  const view = { titulo: 'Relatórios', eyebrow: 'Indicadores e exportação' };
  let el;
  const filtros = { tipo: 'agendamentos', de: null, ate: null, pedido: '', cliente: '', vendedor: '', carregamento: '', status: '', hora: '', doca: '', situacao: '' };

  const TIPOS = [
    { id: 'agendamentos', label: 'Agendamentos', icon: 'calendar' },
    { id: 'concluidas', label: 'Retiradas concluídas', icon: 'check' },
    { id: 'atrasos', label: 'Atrasos', icon: 'clock' },
    { id: 'naocompareceu', label: 'Clientes que não compareceram', icon: 'user' },
    { id: 'tempomedio', label: 'Tempo médio de atendimento', icon: 'timeline' },
    { id: 'produtividade', label: 'Produtividade da equipe', icon: 'users' },
    { id: 'janelas', label: 'Utilização das janelas', icon: 'grid' }
  ];

  function situacao(ag) {
    if (ag.status === S.CANCELADO) return 'Cancelado';
    if (ag.status === S.NAO_COMPARECEU) return 'Não compareceu';
    if (!ag.chegada) return 'Pendente';
    const tol = DT.db.settings().toleranciaMin;
    const p = DT.kpi.tempos(ag).pontualidade;
    return p < -tol ? 'Antecipado' : p > tol ? 'Atrasado' : 'No horário';
  }

  view.render = function (c) {
    el = c;
    if (!filtros.de) { filtros.ate = U.dataISO(); filtros.de = U.addDias(filtros.ate, -7); }
    desenhar();
  };

  function base() {
    const f = filtros;
    return DT.db.agendamentos().filter(a => a.data >= f.de && a.data <= f.ate)
      .filter(a => !f.pedido || a.pedido.numero.indexOf(f.pedido) >= 0)
      .filter(a => !f.cliente || a.pedido.cliente.toLowerCase().indexOf(f.cliente.toLowerCase()) >= 0)
      .filter(a => !f.vendedor || a.responsavel === f.vendedor || a.pedido.vendedor === f.vendedor)
      .filter(a => !f.carregamento || a.respCarregamento === f.carregamento)
      .filter(a => !f.status || a.status === f.status)
      .filter(a => !f.hora || a.hora === f.hora)
      .filter(a => !f.doca || a.doca === f.doca)
      .filter(a => !f.situacao || situacao(a) === f.situacao)
      .sort((a, b) => (a.data + a.hora) < (b.data + b.hora) ? -1 : 1);
  }

  const dur = v => U.fmtDuracao(v);
  const durCSV = v => v === null || v === undefined ? '' : Math.round(v);

  function montar() {
    const ags = base();
    const T = DT.kpi.tempos;
    const tipo = filtros.tipo;
    let colunas = [], linhas = [], resumo = [], barras = null;

    if (tipo === 'agendamentos') {
      linhas = ags;
      colunas = [
        { label: 'Data', html: a => U.fmtData(a.data), csv: a => U.fmtData(a.data) },
        { label: 'Hora', html: a => '<span class="time">' + a.hora + '</span>', csv: a => a.hora },
        { label: 'Pedido', html: a => ui.tag(a.pedido.numero), csv: a => a.pedido.numero },
        { label: 'Cliente', html: a => esc(a.pedido.cliente), csv: a => a.pedido.cliente },
        { label: 'Responsável', html: a => esc(a.responsavel), csv: a => a.responsavel },
        { label: 'Status', html: a => ui.badge(a.status), csv: a => a.status },
        { label: 'Situação', html: a => esc(situacao(a)), csv: situacao },
        { label: 'Criado em', html: a => '<span class="subtle">' + U.fmtDataHora(a.criadoEm) + '</span>', csv: a => U.fmtDataHora(a.criadoEm) }
      ];
      resumo = [['Agendamentos', ags.length], ['Concluídos', ags.filter(a => a.status === S.CONCLUIDO).length], ['Cancelados', ags.filter(a => a.status === S.CANCELADO).length], ['Reagendados', ags.filter(a => a.reagendamentos && a.reagendamentos.length).length]];
    }
    if (tipo === 'concluidas' || tipo === 'atrasos') {
      const tol = DT.db.settings().toleranciaMin;
      linhas = tipo === 'concluidas' ? ags.filter(a => a.status === S.CONCLUIDO) : ags.filter(a => a.chegada && (T(a).pontualidade > tol || (T(a).espera || 0) > tol));
      colunas = [
        { label: 'Data', html: a => U.fmtData(a.data), csv: a => U.fmtData(a.data) },
        { label: 'Agendado', html: a => '<span class="time">' + a.hora + '</span>', csv: a => a.hora },
        { label: 'Pedido', html: a => ui.tag(a.pedido.numero), csv: a => a.pedido.numero },
        { label: 'Cliente', html: a => esc(a.pedido.cliente), csv: a => a.pedido.cliente },
        { label: 'Chegada', html: a => '<span class="mono">' + U.fmtHora(a.chegada) + '</span>', csv: a => U.fmtHora(a.chegada) },
        { label: 'Chegada x agendado', r: true, html: a => { const p = T(a).pontualidade; return '<span class="mono" style="color:' + (p > tol ? 'var(--crit)' : 'inherit') + '">' + (p > 0 ? '+' : '') + dur(p) + '</span>'; }, csv: a => durCSV(T(a).pontualidade) },
        { label: 'Espera', r: true, html: a => '<span class="mono">' + dur(T(a).espera) + '</span>', csv: a => durCSV(T(a).espera) },
        { label: 'Atendimento', r: true, html: a => '<span class="mono">' + dur(T(a).atendimento) + '</span>', csv: a => durCSV(T(a).atendimento) },
        { label: 'Total', r: true, html: a => '<span class="mono">' + dur(T(a).total) + '</span>', csv: a => durCSV(T(a).total) },
        { label: 'Doca', html: a => esc(a.doca || '—'), csv: a => a.doca || '' },
        { label: 'Carregamento', html: a => esc(a.respCarregamento || '—'), csv: a => a.respCarregamento || '' }
      ];
      resumo = [['Registros', linhas.length], ['Espera média', dur(U.media(linhas.map(a => T(a).espera)))], ['Atendimento médio', dur(U.media(linhas.map(a => T(a).atendimento)))], ['Atraso médio', dur(U.media(linhas.map(a => T(a).pontualidade)))]];
      if (tipo === 'atrasos') {
        const ph = {};
        linhas.forEach(a => { ph[a.hora] = (ph[a.hora] || 0) + 1; });
        const max = Math.max(1, ...Object.values(ph));
        barras = { titulo: 'Onde ocorrem os atrasos (por horário agendado)', itens: Object.keys(ph).sort().map(h => ({ rot: h, val: ph[h], pct: ph[h] / max * 100, txt: ph[h] + '', cls: 'crit' })) };
      }
    }
    if (tipo === 'naocompareceu') {
      linhas = ags.filter(a => a.status === S.NAO_COMPARECEU);
      colunas = [
        { label: 'Data', html: a => U.fmtData(a.data), csv: a => U.fmtData(a.data) },
        { label: 'Hora', html: a => '<span class="time">' + a.hora + '</span>', csv: a => a.hora },
        { label: 'Pedido', html: a => ui.tag(a.pedido.numero), csv: a => a.pedido.numero },
        { label: 'Cliente', html: a => esc(a.pedido.cliente), csv: a => a.pedido.cliente },
        { label: 'Telefone', html: a => '<span class="mono">' + esc(a.pedido.telefone) + '</span>', csv: a => a.pedido.telefone },
        { label: 'Vendedor', html: a => esc(a.responsavel), csv: a => a.responsavel },
        { label: 'Valor', r: true, html: a => '<span class="mono">' + U.fmtMoeda(a.pedido.valor) + '</span>', csv: a => a.pedido.valor }
      ];
      const tot = ags.filter(a => a.status !== S.CANCELADO).length;
      resumo = [['Não compareceram', linhas.length], ['Agendamentos válidos', tot], ['Taxa de ausência', tot ? Math.round(linhas.length / tot * 100) + '%' : '—']];
    }
    if (tipo === 'tempomedio') {
      const dias = {};
      ags.filter(a => a.status === S.CONCLUIDO).forEach(a => { (dias[a.data] = dias[a.data] || []).push(T(a)); });
      linhas = Object.keys(dias).sort().map(d => ({
        data: d, qtd: dias[d].length,
        espera: U.media(dias[d].map(t => t.espera)), atendimento: U.media(dias[d].map(t => t.atendimento)),
        total: U.media(dias[d].map(t => t.total)), pont: U.media(dias[d].map(t => t.pontualidade))
      }));
      colunas = [
        { label: 'Data', html: l => U.fmtData(l.data) + ' <span class="subtle">' + U.diaSemana(l.data) + '</span>', csv: l => U.fmtData(l.data) },
        { label: 'Retiradas', r: true, html: l => '<span class="mono">' + l.qtd + '</span>', csv: l => l.qtd },
        { label: 'Espera média', r: true, html: l => '<span class="mono">' + dur(l.espera) + '</span>', csv: l => durCSV(l.espera) },
        { label: 'Atendimento médio', r: true, html: l => '<span class="mono">' + dur(l.atendimento) + '</span>', csv: l => durCSV(l.atendimento) },
        { label: 'Total médio', r: true, html: l => '<span class="mono">' + dur(l.total) + '</span>', csv: l => durCSV(l.total) },
        { label: 'Chegada x agendado', r: true, html: l => '<span class="mono">' + (l.pont > 0 ? '+' : '') + dur(l.pont) + '</span>', csv: l => durCSV(l.pont) }
      ];
      const todos = ags.filter(a => a.status === S.CONCLUIDO).map(T);
      resumo = [['Retiradas', todos.length], ['Espera média', dur(U.media(todos.map(t => t.espera)))], ['Atendimento médio', dur(U.media(todos.map(t => t.atendimento)))], ['Total médio', dur(U.media(todos.map(t => t.total)))]];
      const max = Math.max(1, ...linhas.map(l => l.atendimento || 0));
      barras = { titulo: 'Atendimento médio por dia', itens: linhas.map(l => ({ rot: U.fmtData(l.data).slice(0, 5), pct: (l.atendimento || 0) / max * 100, txt: dur(l.atendimento) })) };
    }
    if (tipo === 'produtividade') {
      const p = {};
      ags.filter(a => a.status === S.CONCLUIDO).forEach(a => {
        const k = a.respCarregamento || 'Não informado';
        p[k] = p[k] || { nome: k, qtd: 0, itens: 0, tempos: [], atend: 0 };
        p[k].qtd++; p[k].itens += Number(a.pedido.qtdItens) || 0; p[k].tempos.push(T(a).atendimento);
      });
      ags.filter(a => a.respAtendimento).forEach(a => { const k = a.respAtendimento; p[k] = p[k] || { nome: k, qtd: 0, itens: 0, tempos: [], atend: 0 }; p[k].atend++; });
      linhas = Object.values(p).sort((a, b) => b.qtd - a.qtd);
      colunas = [
        { label: 'Funcionário', html: l => esc(l.nome), csv: l => l.nome },
        { label: 'Carregamentos', r: true, html: l => '<span class="mono">' + l.qtd + '</span>', csv: l => l.qtd },
        { label: 'Atendimentos (doca)', r: true, html: l => '<span class="mono">' + l.atend + '</span>', csv: l => l.atend },
        { label: 'Itens carregados', r: true, html: l => '<span class="mono">' + l.itens + '</span>', csv: l => l.itens },
        { label: 'Tempo médio de atendimento', r: true, html: l => '<span class="mono">' + dur(U.media(l.tempos)) + '</span>', csv: l => durCSV(U.media(l.tempos)) }
      ];
      resumo = [['Funcionários', linhas.length], ['Carregamentos', linhas.reduce((s, l) => s + l.qtd, 0)]];
      const max = Math.max(1, ...linhas.map(l => l.qtd));
      barras = { titulo: 'Carregamentos por funcionário', itens: linhas.filter(l => l.qtd).map(l => ({ rot: l.nome.split(' ')[0], pct: l.qtd / max * 100, txt: String(l.qtd), cls: 'ok' })) };
    }
    if (tipo === 'janelas') {
      const cap = DT.agenda.capacidade();
      const h = {};
      let d = filtros.de;
      while (d <= filtros.ate) {
        DT.agenda.horariosDoDia(d).forEach(x => { h[x] = h[x] || { hora: x, ofertadas: 0, ocupadas: 0, noshow: 0, canc: 0 }; h[x].ofertadas += cap; });
        d = U.addDias(d, 1);
      }
      ags.forEach(a => {
        h[a.hora] = h[a.hora] || { hora: a.hora, ofertadas: 0, ocupadas: 0, noshow: 0, canc: 0 };
        if (DT.STATUS_GRUPOS.ocupamJanela.indexOf(a.status) >= 0) h[a.hora].ocupadas++;
        if (a.status === S.NAO_COMPARECEU) h[a.hora].noshow++;
        if (a.status === S.CANCELADO) h[a.hora].canc++;
      });
      linhas = Object.values(h).filter(l => !filtros.hora || l.hora === filtros.hora).sort((a, b) => a.hora < b.hora ? -1 : 1);
      linhas.forEach(l => { l.pct = l.ofertadas ? Math.round(l.ocupadas / l.ofertadas * 100) : 0; });
      colunas = [
        { label: 'Janela', html: l => '<span class="time">' + l.hora + '</span>', csv: l => l.hora },
        { label: 'Vagas ofertadas', r: true, html: l => '<span class="mono">' + l.ofertadas + '</span>', csv: l => l.ofertadas },
        { label: 'Ocupadas', r: true, html: l => '<span class="mono">' + l.ocupadas + '</span>', csv: l => l.ocupadas },
        { label: 'Ocupação', r: true, html: l => '<span class="mono">' + l.pct + '%</span>', csv: l => l.pct },
        { label: 'Não compareceram', r: true, html: l => '<span class="mono">' + l.noshow + '</span>', csv: l => l.noshow },
        { label: 'Cancelados', r: true, html: l => '<span class="mono">' + l.canc + '</span>', csv: l => l.canc }
      ];
      const of = linhas.reduce((s, l) => s + l.ofertadas, 0), oc = linhas.reduce((s, l) => s + l.ocupadas, 0);
      resumo = [['Vagas ofertadas', of], ['Ocupadas', oc], ['Taxa de ocupação', of ? Math.round(oc / of * 100) + '%' : '—'], ['Mais procurada', linhas.slice().sort((a, b) => b.pct - a.pct)[0] ? linhas.slice().sort((a, b) => b.pct - a.pct)[0].hora : '—']];
      barras = { titulo: 'Ocupação por janela', itens: linhas.map(l => ({ rot: l.hora, pct: l.pct, txt: l.pct + '%', cls: l.pct >= 90 ? 'alt' : '' })) };
    }
    return { colunas, linhas, resumo, barras };
  }

  function desenhar() {
    const f = filtros;
    const todos = DT.db.agendamentos();
    const vendedores = [...new Set(todos.map(a => a.responsavel))].sort();
    const carreg = [...new Set(todos.map(a => a.respCarregamento).filter(Boolean))].sort();
    const horas = [...new Set(todos.map(a => a.hora))].sort();
    const statusLista = Object.values(S).filter(s => ['Pedido realizado', 'Aguardando agendamento'].indexOf(s) < 0);
    const res = montar();
    const tipo = TIPOS.find(t => t.id === f.tipo);

    el.innerHTML =
      '<div class="grid-side-main">' +
        '<section class="card"><div class="card-head"><h3>Relatórios disponíveis</h3></div><div class="card-body" style="padding:10px"><div class="report-list">' +
          TIPOS.map(t => '<button type="button" class="report-link' + (t.id === f.tipo ? ' active' : '') + '" data-tipo="' + t.id + '">' + ui.icon(t.icon) + esc(t.label) + '</button>').join('') +
        '</div></div></section>' +
        '<div class="stack">' +
          '<section class="card"><div class="card-head"><h3>Filtros</h3><span class="spacer"></span><button type="button" class="btn link sm" id="rl-limpar">Limpar filtros</button></div><form id="rl-f" class="card-body" novalidate><div class="filters">' +
            '<div class="field"><label for="rl-de">De</label><input type="date" id="rl-de" class="input" value="' + f.de + '"></div>' +
            '<div class="field"><label for="rl-ate">Até</label><input type="date" id="rl-ate" class="input" value="' + f.ate + '"></div>' +
            '<div class="field"><label for="rl-ped">Pedido</label><input id="rl-ped" class="input" value="' + esc(f.pedido) + '" placeholder="Nº"></div>' +
            '<div class="field"><label for="rl-cli">Cliente</label><input id="rl-cli" class="input" value="' + esc(f.cliente) + '" placeholder="Nome"></div>' +
            '<div class="field"><label for="rl-ven">Vendedor</label><select id="rl-ven" class="select">' + ui.options(vendedores, f.vendedor, 'Todos') + '</select></div>' +
            '<div class="field"><label for="rl-car">Resp. carregamento</label><select id="rl-car" class="select">' + ui.options(carreg, f.carregamento, 'Todos') + '</select></div>' +
            '<div class="field"><label for="rl-st">Status</label><select id="rl-st" class="select">' + ui.options(statusLista, f.status, 'Todos') + '</select></div>' +
            '<div class="field"><label for="rl-hr">Horário</label><select id="rl-hr" class="select">' + ui.options(horas, f.hora, 'Todos') + '</select></div>' +
            '<div class="field"><label for="rl-dc">Doca</label><select id="rl-dc" class="select">' + ui.options(DT.db.settings().docas, f.doca, 'Todas') + '</select></div>' +
            '<div class="field"><label for="rl-sit">Situação do atendimento</label><select id="rl-sit" class="select">' + ui.options(['No horário', 'Antecipado', 'Atrasado', 'Pendente', 'Não compareceu', 'Cancelado'], f.situacao, 'Todas') + '</select></div>' +
            '<button type="submit" class="btn primary">' + ui.icon('chart') + 'Gerar relatório</button>' +
          '</div></form></section>' +
          '<section class="card"><div class="card-head rl-head"><div class="stack" style="gap:2px"><h3>' + esc(tipo.label) + '</h3><span class="subtle">' + U.fmtData(f.de) + ' a ' + U.fmtData(f.ate) + '</span></div><span class="spacer"></span><div class="row rl-acoes" style="gap:8px;flex-wrap:wrap">' +
            '<button type="button" class="btn ghost sm" id="rl-copiar">' + ui.icon('copy', 'icon-sm') + 'Copiar</button>' +
            '<button type="button" class="btn ghost sm" id="rl-csv">' + ui.icon('download', 'icon-sm') + 'Exportar CSV</button>' +
            '<button type="button" class="btn primary sm" id="rl-pdf">' + ui.icon('download', 'icon-sm') + 'Exportar PDF</button></div></div>' +
            '<div class="card-body"><div class="stat-strip">' + res.resumo.map(r => '<div class="stat"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' +
            (res.barras && res.barras.itens.length ? '<div class="stack" style="gap:8px"><span class="label">' + esc(res.barras.titulo) + '</span><div class="bars">' + res.barras.itens.map(b =>
              '<div class="bar-row"><span class="mono">' + esc(b.rot) + '</span><div class="bar-track"><div class="bar-fill ' + (b.cls || '') + '" style="width:' + Math.max(2, b.pct) + '%"></div></div><span class="mono subtle" style="text-align:right">' + esc(b.txt) + '</span></div>').join('') + '</div></div>' : '') +
            '</div>' +
            '<div class="table-wrap"><table class="table"><thead><tr>' + res.colunas.map(c => '<th' + (c.r ? ' class="r"' : '') + '>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
            (res.linhas.length ? res.linhas.slice(0, 500).map(l => '<tr>' + res.colunas.map(c => '<td' + (c.r ? ' class="r"' : '') + '>' + c.html(l) + '</td>').join('') + '</tr>').join('') :
              '<tr><td colspan="' + res.colunas.length + '">' + ui.empty('Nenhum registro para os filtros escolhidos.', 'chart') + '</td></tr>') +
            '</tbody></table></div>' +
            (res.linhas.length > 500 ? '<div class="card-foot"><span class="subtle">Mostrando 500 de ' + res.linhas.length + ' linhas. A exportação inclui todas.</span></div>' : '') +
          '</section>' +
        '</div>' +
      '</div>';

    el.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => { filtros.tipo = b.dataset.tipo; desenhar(); }));
    el.querySelector('#rl-f').addEventListener('submit', e => {
      e.preventDefault();
      const v = id => el.querySelector(id).value.trim();
      Object.assign(filtros, { de: v('#rl-de') || filtros.de, ate: v('#rl-ate') || filtros.ate, pedido: v('#rl-ped').replace(/\D/g, ''), cliente: v('#rl-cli'), vendedor: v('#rl-ven'),
        carregamento: v('#rl-car'), status: v('#rl-st'), hora: v('#rl-hr'), doca: v('#rl-dc'), situacao: v('#rl-sit') });
      if (filtros.de > filtros.ate) { const t = filtros.de; filtros.de = filtros.ate; filtros.ate = t; }
      desenhar();
    });
    el.querySelector('#rl-limpar').addEventListener('click', () => {
      Object.assign(filtros, { ate: U.dataISO(), de: U.addDias(U.dataISO(), -7), pedido: '', cliente: '', vendedor: '', carregamento: '', status: '', hora: '', doca: '', situacao: '' });
      desenhar();
    });
    const csv = () => U.toCSV(res.colunas.map(c => ({ label: c.label, csv: c.csv })), res.linhas);
    el.querySelector('#rl-csv').addEventListener('click', () => {
      const ok = ui.baixarCSV('drive-thru_' + filtros.tipo + '_' + filtros.de + '_' + filtros.ate + '.csv', csv());
      ui.toast(ok ? 'Arquivo CSV gerado.' : 'Não foi possível baixar o arquivo aqui. Use "Copiar".', ok ? 'ok' : 'warn');
    });
    el.querySelector('#rl-pdf').addEventListener('click', async ev => {
      const btn = ev.currentTarget;
      if (!DT.relatorioPDF || !DT.relatorioPDF.disponivel()) { ui.toast('Gerador de PDF indisponível. Recarregue a página.', 'warn'); return; }
      const u = DT.auth.usuarioAtual();
      btn.disabled = true;
      try {
        await DT.relatorioPDF.gerar({
          tipo: f.tipo, titulo: tipo.label, periodo: U.fmtData(f.de) + ' a ' + U.fmtData(f.ate),
          filtros: [['Pedido', f.pedido], ['Cliente', f.cliente], ['Vendedor', f.vendedor], ['Resp. carregamento', f.carregamento], ['Status', f.status],
            ['Horário', f.hora], ['Doca', f.doca], ['Situação', f.situacao]],
          resumo: res.resumo, barras: res.barras, colunas: res.colunas, linhas: res.linhas,
          usuario: u ? u.nome : '', unidade: DT.db.settings().unidade,
          arquivo: 'drive-thru_' + f.tipo + '_' + f.de + '_' + f.ate + '.pdf'
        });
        ui.toast('Arquivo PDF gerado.', 'ok');
      } catch (e) {
        console.error(e);
        ui.toast('Não foi possível gerar o PDF.', 'err');
      } finally { btn.disabled = false; }
    });
    el.querySelector('#rl-copiar').addEventListener('click', async () => {
      const txt = csv().replace(/^﻿/, '').replace(/;/g, '\t');
      const ok = await ui.copiar(txt);
      ui.toast(ok ? 'Tabela copiada. Cole no Excel.' : 'Não foi possível copiar.', ok ? 'ok' : 'warn');
    });
  }

  return view;
})();

/* ============================ AUDITORIA ============================ */
DT.views.auditoria = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc;
  const view = { titulo: 'Auditoria', eyebrow: 'Rastreabilidade de todas as alterações' };
  let el;
  const f = { usuario: '', acao: '', ref: '', limite: 200 };

  view.render = function (c) { el = c; desenhar(); };

  function desenhar() {
    const todos = DT.db.auditoria().slice().reverse();
    const usuarios = [...new Set(todos.map(a => a.usuario))].sort();
    const acoes = [...new Set(todos.map(a => a.acao))].sort();
    const lista = todos.filter(a => (!f.usuario || a.usuario === f.usuario) && (!f.acao || a.acao === f.acao) && (!f.ref || String(a.referencia).indexOf(f.ref) >= 0));
    el.innerHTML =
      '<div class="page-intro"><p>Toda alteração relevante fica registrada com usuário, data, hora, ação, informação anterior e nova. Os registros não podem ser apagados.</p></div>' +
      '<section class="card"><div class="card-body"><div class="filters">' +
        '<div class="field"><label for="au-u">Usuário</label><select id="au-u" class="select">' + ui.options(usuarios, f.usuario, 'Todos') + '</select></div>' +
        '<div class="field"><label for="au-a">Ação</label><select id="au-a" class="select">' + ui.options(acoes, f.acao, 'Todas') + '</select></div>' +
        '<div class="field"><label for="au-r">Pedido / referência</label><input id="au-r" class="input" value="' + esc(f.ref) + '" placeholder="Ex.: 123456"></div>' +
      '</div></div></section>' +
      '<section class="card"><div class="card-head"><h3>Registros</h3><span class="subtle">' + lista.length + '</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Data / hora</th><th>Usuário</th><th>Ação</th><th>Referência</th><th>De</th><th>Para</th></tr></thead><tbody>' +
        (lista.length ? lista.slice(0, f.limite).map(a => '<tr><td class="mono" style="white-space:nowrap">' + U.fmtDataHora(a.ts) + '</td><td>' + esc(a.usuario) + '</td><td><b>' + esc(a.acao) + '</b><div class="subtle">' + esc(a.entidade) + '</div></td>' +
          '<td>' + (/^\d{5,}$/.test(a.referencia) ? ui.tag(a.referencia) : esc(a.referencia)) + '</td><td class="subtle">' + esc(a.antes || '—') + '</td><td>' + esc(a.depois || '—') + '</td></tr>').join('') :
          '<tr><td colspan="6">' + ui.empty('Nenhum registro encontrado.', 'shield') + '</td></tr>') +
      '</tbody></table></div>' + (lista.length > f.limite ? '<div class="card-foot"><button type="button" class="btn ghost" id="au-mais">Mostrar mais</button></div>' : '') + '</section>';
    el.querySelector('#au-u').addEventListener('change', e => { f.usuario = e.target.value; desenhar(); });
    el.querySelector('#au-a').addEventListener('change', e => { f.acao = e.target.value; desenhar(); });
    el.querySelector('#au-r').addEventListener('change', e => { f.ref = e.target.value.trim(); desenhar(); });
    const m = el.querySelector('#au-mais'); if (m) m.addEventListener('click', () => { f.limite += 200; desenhar(); });
  }

  return view;
})();
