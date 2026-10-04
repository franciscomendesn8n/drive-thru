/* =====================================================================
   Telas do Comercial: Novo agendamento e Agenda de retiradas
   + ações compartilhadas (detalhe, reagendar, cancelar)
   ===================================================================== */
window.DT = window.DT || {};
DT.views = DT.views || {};

/* ---------------- Seletor de data/horário (reutilizável) ---------------- */
DT.slotPicker = function (container, opts) {
  const U = DT.util, ui = DT.ui, esc = U.esc;
  const dias = DT.agenda.diasDisponiveis();
  let data = opts.data && dias.indexOf(opts.data) >= 0 ? opts.data : null;
  let hora = opts.hora || null;
  if (!data) {
    const prox = DT.agenda.proximosDisponiveis(U.dataISO(), null, 1, opts.ignorarId)[0];
    data = prox ? prox.data : dias[0];
  }
  const pre = container.dataset.prefix || 'sp';

  function desenhar() {
    const mapa = data ? DT.agenda.mapaDia(data, opts.ignorarId) : [];
    const min = DT.agenda.minimoPermitido();
    container.innerHTML =
      '<div class="field"><span class="label">Data da retirada</span><div class="days" role="listbox" aria-label="Data da retirada">' + dias.map(d => {
        const dt = U.toDate(d, '12:00');
        return '<button type="button" class="day' + (d === data ? ' sel' : '') + '" data-d="' + d + '" id="' + pre + '-d-' + d + '"><b>' + U.pad(dt.getDate()) + '/' + U.pad(dt.getMonth() + 1) + '</b><span>' +
          (d === U.dataISO() ? 'hoje' : U.diaSemana(d).split('-')[0]) + '</span></button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span class="label">Horário da retirada</span>' +
      (mapa.length ? '<div class="slots">' + mapa.map(j => {
        const livres = j.capacidade - j.ocupados;
        const bloqueio = j.foraAntecedencia ? 'indisponível' : j.lotada ? 'lotada' : livres + (livres === 1 ? ' vaga' : ' vagas');
        const quadros = Array.from({ length: j.capacidade }, (_, i) => '<i class="' + (i < j.ocupados ? 'on' : '') + '"></i>').join('');
        return '<button type="button" class="slot' + (j.hora === hora ? ' sel' : '') + '" data-h="' + j.hora + '" id="' + pre + '-h-' + j.hora.replace(':', '') + '"' +
          (j.lotada || j.foraAntecedencia ? ' disabled' : '') + ' title="' + esc(bloqueio) + '"><b>' + j.hora + '</b><span class="cap">' + quadros + '</span><small>' + bloqueio + '</small></button>';
      }).join('') + '</div>' : ui.empty('Sem janelas de atendimento neste dia.', 'calendar')) +
      '<span class="hint">Primeiro horário permitido agora: <b class="mono">' + U.fmtData(U.dataISO(min)) + ' ' + U.horaHM(min) + '</b> (antecedência mínima de ' + DT.db.settings().antecedenciaMinMin + ' min).</span></div>';
    container.querySelectorAll('.day').forEach(b => b.addEventListener('click', () => {
      data = b.dataset.d; hora = null; desenhar(); if (opts.onChange) opts.onChange(data, hora);
    }));
    container.querySelectorAll('.slot').forEach(b => b.addEventListener('click', () => {
      hora = b.dataset.h; desenhar(); if (opts.onChange) opts.onChange(data, hora);
      const s = container.querySelector('.slot.sel'); if (s) s.focus();
    }));
  }
  desenhar();
  return {
    valor: () => ({ data: data, hora: hora }),
    definir: (d, h) => { data = d; hora = h; desenhar(); if (opts.onChange) opts.onChange(data, hora); },
    redesenhar: desenhar
  };
};

/* ---------------------- Ações compartilhadas ---------------------- */
DT.acoes = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS, G = DT.STATUS_GRUPOS;

  function sugestoesHTML(sug) {
    if (!sug || !sug.length) return '';
    return '<div class="stack" style="gap:6px"><span class="label">Próximos horários disponíveis</span><div class="suggestions">' + sug.map(s =>
      '<button type="button" class="btn ghost sm" data-sug-d="' + s.data + '" data-sug-h="' + s.hora + '"><span class="mono">' + U.fmtData(s.data).slice(0, 5) + ' ' + s.hora + '</span></button>').join('') + '</div></div>';
  }

  function reagendar(ag, aoConcluir) {
    let picker;
    ui.modal({
      title: 'Reagendar pedido ' + ag.pedido.numero,
      wide: true,
      body: ui.notice('info', 'Horário atual: <b>' + U.fmtData(ag.data) + ' às ' + ag.hora + '</b> · ' + esc(ag.pedido.cliente) + '. A janela atual será liberada automaticamente.') +
        '<div id="rg-picker" data-prefix="rg" class="stack"></div><div id="rg-erro"></div>' +
        '<div class="field"><label for="rg-motivo">Motivo do reagendamento</label><textarea id="rg-motivo" class="textarea" placeholder="Ex.: cliente pediu outro horário"></textarea></div>',
      onOpen: root => { picker = DT.slotPicker(root.querySelector('#rg-picker'), { ignorarId: ag.id }); },
      actions: [
        { label: 'Voltar', cls: 'ghost' },
        { label: 'Confirmar reagendamento', cls: 'primary', icon: 'calendar', onClick: root => {
          const v = picker.valor();
          const r = DT.ag.reagendar(ag.id, v.data, v.hora, root.querySelector('#rg-motivo').value);
          if (!r.ok) {
            const box = root.querySelector('#rg-erro');
            box.innerHTML = ui.notice('crit', esc(r.erro)) + sugestoesHTML(r.sugestoes);
            box.querySelectorAll('[data-sug-d]').forEach(b => b.addEventListener('click', () => picker.definir(b.dataset.sugD, b.dataset.sugH)));
            return false;
          }
          ui.toast('Retirada reagendada para ' + U.fmtData(v.data) + ' às ' + v.hora + '.');
          if (aoConcluir) aoConcluir(r.ag);
        }}
      ]
    });
  }

  async function cancelar(ag, aoConcluir) {
    const r = await ui.confirmar({
      titulo: 'Cancelar agendamento', perigo: true, ok: 'Cancelar agendamento', pedirMotivo: true,
      labelMotivo: 'Motivo do cancelamento', placeholder: 'Ex.: cliente optou por entrega',
      mensagem: 'O pedido <b class="mono">' + esc(ag.pedido.numero) + '</b> (' + esc(ag.pedido.cliente) + ') agendado para <b>' + U.fmtData(ag.data) + ' às ' + ag.hora + '</b> será cancelado e a janela ficará livre. O histórico é mantido.'
    });
    if (!r.ok) return;
    const res = DT.ag.cancelar(ag.id, r.motivo);
    if (!res.ok) { ui.toast(res.erro, 'err'); return; }
    ui.toast('Agendamento cancelado. Janela ' + ag.hora + ' liberada.');
    if (aoConcluir) aoConcluir(res.ag);
  }

  async function naoCompareceu(ag, aoConcluir) {
    const r = await ui.confirmar({
      titulo: 'Registrar não comparecimento', perigo: true, ok: 'Registrar',
      mensagem: 'Confirmar que o cliente <b>' + esc(ag.pedido.cliente) + '</b> não compareceu ao horário <b>' + ag.hora + '</b>? A janela será liberada. O pedido pode ser reagendado depois.'
    });
    if (!r.ok) return;
    const res = DT.ag.marcarNaoCompareceu(ag.id);
    if (!res.ok) { ui.toast(res.erro, 'err'); return; }
    ui.toast('Não comparecimento registrado.');
    if (aoConcluir) aoConcluir(res.ag);
  }

  /* Detalhe rápido de um agendamento (usado na agenda e no dashboard) */
  function detalhe(ag, aoAlterar) {
    ag = DT.db.agendamentoPorId(ag.id) || ag;
    const t = DT.kpi.tempos(ag);
    const acoes = [{ label: 'Linha do tempo', cls: 'ghost', icon: 'timeline', onClick: () => { DT.app.ir('pedido', ag.pedido.numero); } },
      { label: 'Página do cliente', cls: 'ghost', icon: 'user', onClick: () => { setTimeout(() => paginaCliente(ag), 0); } }];
    const preChegada = G.ativosPreChegada.indexOf(ag.status) >= 0;
    if (DT.auth.pode('agendamento.alterar') && preChegada) {
      acoes.push({ label: 'Cancelar', cls: 'danger', icon: 'ban', onClick: () => { setTimeout(() => cancelar(ag, aoAlterar), 0); } });
    }
    if (DT.auth.pode('agendamento.alterar') && (preChegada || ag.status === S.NAO_COMPARECEU)) {
      acoes.push({ label: 'Reagendar', cls: 'ghost', icon: 'calendar', onClick: () => { setTimeout(() => reagendar(ag, aoAlterar), 0); } });
    }
    if (DT.auth.pode('checkin.registrar') && preChegada && ag.data === U.dataISO()) {
      acoes.push({ label: 'Registrar chegada', cls: 'primary', icon: 'car', onClick: () => { DT.app.ir('checkin', ag.id); } });
    }
    if (DT.auth.pode('atendimento.registrar') && ag.status === S.CHEGOU) acoes.push({ label: 'Iniciar atendimento', cls: 'primary', icon: 'truck', onClick: () => DT.app.ir('atendimento', ag.id) });
    if (DT.auth.pode('entrega.finalizar') && (ag.status === S.EM_ATENDIMENTO || ag.status === S.CARREGANDO)) acoes.push({ label: 'Registrar entrega', cls: 'primary', icon: 'check', onClick: () => DT.app.ir('entrega', ag.id) });

    ui.modal({
      title: 'Pedido ' + ag.pedido.numero + ' · ' + ag.pedido.cliente,
      wide: true,
      body:
        '<div class="row between"><div class="row">' + ui.badge(ag.status) + ui.alertChips(ag) + '</div><span class="subtle">Agendado por ' + esc(ag.criadoPor) + ' em ' + U.fmtDataHora(ag.criadoEm) + '</span></div>' +
        '<div class="big-time"><div><span>Retirada</span><b>' + U.fmtData(ag.data).slice(0, 5) + ' ' + ag.hora + '</b></div>' +
        '<div><span>Chegada</span><b>' + U.fmtHora(ag.chegada) + '</b></div><div><span>Espera</span><b>' + U.fmtDuracao(t.espera) + '</b></div>' +
        '<div><span>Atendimento</span><b>' + U.fmtDuracao(t.atendimento) + '</b></div></div>' +
        ui.pedidoKV(ag.pedido, ag) +
        (ag.observacao ? ui.notice('info', '<b>Observação:</b> ' + esc(ag.observacao)) : '') +
        (ag.cancelamento ? ui.notice('crit', '<b>Cancelado</b> por ' + esc(ag.cancelamento.usuario) + ' em ' + U.fmtDataHora(ag.cancelamento.ts) + ' — ' + esc(ag.cancelamento.motivo)) : ''),
      actions: acoes
    });
  }

  /* Link + QR Code da página de acompanhamento do cliente */
  function blocoCliente(ag) {
    const link = DT.ag.linkCliente(ag);
    const qr = ui.qrSVG(link);
    return '<div class="cli-share">' +
      (qr ? '<div class="cli-qr" role="img" aria-label="QR Code da página de acompanhamento">' + qr + '</div>' : '') +
      '<div class="stack" style="gap:8px;min-width:0;flex:1">' +
        '<span class="eyebrow">Acompanhamento do cliente</span>' +
        '<p class="muted" style="font-size:13px">O cliente acompanha as etapas e é avisado quando o pedido estiver pronto para retirada.</p>' +
        '<div class="row" style="gap:6px"><span class="subtle">Código</span><b class="mono" style="font-size:16px;letter-spacing:.08em">' + DT.ag.codigo(ag) + '</b></div>' +
        '<input class="input mono cli-link" readonly value="' + esc(link) + '" aria-label="Link de acompanhamento" style="font-size:12px">' +
        '<div class="row"><button type="button" class="btn ghost sm" data-cli-copiar>' + ui.icon('copy', 'icon-sm') + 'Copiar link</button>' +
        '<a class="btn ghost sm" href="#acompanhar-' + DT.ag.codigo(ag) + '">' + ui.icon('arrow', 'icon-sm') + 'Ver como o cliente</a></div>' +
      '</div></div>';
  }
  function ligarBlocoCliente(root, ag) {
    const b = root.querySelector('[data-cli-copiar]');
    if (!b) return;
    b.addEventListener('click', async () => {
      const ok = await ui.copiar(DT.ag.linkCliente(ag));
      if (!ok) { const i = root.querySelector('.cli-link'); if (i) i.select(); }
      ui.toast(ok ? 'Link copiado. Envie ao cliente pelo WhatsApp ou e-mail.' : 'Selecione o link e copie manualmente.', ok ? 'ok' : 'warn');
    });
  }
  function paginaCliente(ag) {
    ui.modal({
      title: 'Página do cliente · pedido ' + ag.pedido.numero,
      body: blocoCliente(ag),
      onOpen: r => ligarBlocoCliente(r, ag),
      actions: [{ label: 'Fechar', cls: 'ghost' }]
    });
  }

  return { reagendar, cancelar, naoCompareceu, detalhe, sugestoesHTML, blocoCliente, ligarBlocoCliente, paginaCliente };
})();

/* ============================ NOVO AGENDAMENTO ============================ */
DT.views.agendar = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc;
  let estado = {};
  let el, picker;

  function render(container, param) {
    el = container;
    estado = { pedido: null, erroBusca: null, existente: null, preSel: null };
    if (param && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(param)) estado.preSel = { data: param.slice(0, 10), hora: param.slice(11) };
    desenhar();
  }

  function desenhar(numeroDigitado) {
    const p = estado.pedido;
    el.innerHTML =
      '<div class="page-intro"><p>Digite o número do pedido. Os dados vêm do ERP automaticamente; você só escolhe a data e o horário da retirada.</p></div>' +
      '<section class="card"><div class="card-body">' +
        '<form id="f-busca" class="row" style="align-items:end" novalidate>' +
          '<div class="field" style="flex:1 1 260px"><label for="ag-num">Nº do pedido</label><input id="ag-num" class="input big" inputmode="numeric" autocomplete="off" placeholder="Ex.: 123456" value="' + esc(numeroDigitado || (p ? p.numero : '')) + '"></div>' +
          '<button class="btn primary lg" type="submit" id="btn-consultar">' + ui.icon('search') + 'Consultar pedido</button>' +
        '</form>' +
        '<p class="subtle">Pedidos de teste: <span class="mono">123456</span>, <span class="mono">123789</span>, <span class="mono">125300</span> a <span class="mono">125320</span> disponíveis · <span class="mono">125900</span> não elegível · <span class="mono">123101</span> já agendado · <span class="mono">999999</span> inexistente.</p>' +
        (estado.erroBusca ? ui.notice('crit', esc(estado.erroBusca)) : '') +
      '</div></section>' +
      '<div id="ag-resultado"></div>';

    const f = el.querySelector('#f-busca');
    f.addEventListener('submit', e => { e.preventDefault(); consultar(el.querySelector('#ag-num').value); });
    if (!p && !estado.erroBusca) setTimeout(() => { const i = el.querySelector('#ag-num'); if (i) i.focus(); }, 20);
    if (p) desenharResultado();
  }

  async function consultar(numero) {
    numero = String(numero || '').replace(/\D/g, '');
    if (!numero) { estado = { preSel: estado.preSel, erroBusca: 'Informe o número do pedido.' }; desenhar(); return; }
    const btn = el.querySelector('#btn-consultar');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Consultando ERP…';
    let pedido = null;
    try { pedido = await DT.ERP.buscarPedido(numero); }
    catch (e) { estado = { preSel: estado.preSel, erroBusca: 'Não foi possível consultar o ERP agora (' + e.message + '). Tente novamente.' }; desenhar(numero); return; }
    if (!pedido) { estado = { preSel: estado.preSel, erroBusca: 'Pedido não localizado. Verifique o número informado.' }; desenhar(numero); return; }
    estado = { pedido: pedido, existente: DT.ag.ativoDoPedido(pedido.numero), preSel: estado.preSel };
    desenhar();
  }

  function desenharResultado() {
    const p = estado.pedido;
    const box = el.querySelector('#ag-resultado');
    const eleg = DT.ag.elegibilidade(p);
    let aviso = '', podeAgendar = true;
    if (!eleg.ok) {
      podeAgendar = false;
      aviso = ui.notice('crit', '<b>Pedido não habilitado para retirada pelo Drive Thru.</b><br>' + esc(eleg.motivo));
    } else if (estado.existente) {
      const a = estado.existente;
      podeAgendar = false;
      aviso = '<div class="notice warn">' + ui.icon('alert') + '<div class="stack" style="gap:8px;flex:1"><b>Este pedido já possui uma retirada agendada.</b>' +
        '<dl class="kv" style="background:var(--surface)"><div><dt>Data</dt><dd>' + U.fmtData(a.data) + '</dd></div><div><dt>Hora</dt><dd class="mono">' + a.hora + '</dd></div><div><dt>Status</dt><dd>' + ui.badge(a.status) + '</dd></div>' +
        '<div><dt>Agendado por</dt><dd>' + esc(a.criadoPor) + '</dd></div><div><dt>Criado em</dt><dd>' + U.fmtDataHora(a.criadoEm) + '</dd></div><div><dt>Última alteração</dt><dd>' + U.fmtDataHora(a.alteradoEm) + '</dd></div></dl>' +
        '<div class="row">' + (DT.auth.pode('agendamento.alterar') && DT.STATUS_GRUPOS.ativosPreChegada.indexOf(a.status) >= 0 ?
          '<button type="button" class="btn primary sm" id="btn-reag">' + ui.icon('calendar', 'icon-sm') + 'Reagendar</button><button type="button" class="btn danger sm" id="btn-canc">' + ui.icon('ban', 'icon-sm') + 'Cancelar</button>' :
          '<span class="subtle">Somente usuários autorizados podem alterar este agendamento.</span>') +
        '<button type="button" class="btn ghost sm" data-goto-pedido="' + esc(p.numero) + '">' + ui.icon('timeline', 'icon-sm') + 'Linha do tempo</button></div></div></div>';
    }

    box.innerHTML =
      '<div class="grid-main-side">' +
        '<section class="card"><div class="card-head"><h2>Dados do pedido</h2><span class="subtle">preenchimento automático · ERP</span></div>' +
          '<div class="card-body">' + ui.pedidoKV(p) +
          '<details><summary class="label" style="cursor:pointer">Itens do pedido (' + (p.itens || []).length + ')</summary><div style="padding-top:8px">' + ui.itensPedido(p) + '</div></details>' +
          aviso + '</div></section>' +
        (podeAgendar ?
        '<section class="card"><div class="card-head"><h2>Dados do agendamento</h2></div>' +
          '<form id="f-ag" novalidate><div class="card-body">' +
            '<div id="ag-picker" data-prefix="ag" class="stack"></div>' +
            '<div class="field"><label for="ag-resp">Responsável pelo agendamento</label><select id="ag-resp" class="select">' + responsaveis() + '</select></div>' +
            '<div class="field"><label for="ag-obs">Observação <span class="subtle">(opcional)</span></label><textarea id="ag-obs" class="textarea" placeholder="Ex.: cliente virá com caminhonete"></textarea></div>' +
            '<div id="ag-erro"></div>' +
            ui.notice('info', 'A retirada deve ser agendada com antecedência mínima de ' + (DT.db.settings().antecedenciaMinMin / 60 === 1 ? '1 hora' : DT.db.settings().antecedenciaMinMin + ' minutos') + '.', 'clock') +
          '</div><div class="card-foot"><button type="submit" class="btn primary lg" id="btn-confirmar">' + ui.icon('check') + 'Confirmar agendamento</button></div></form>' +
        '</section>' : '<div></div>') +
      '</div>';

    const br = box.querySelector('#btn-reag');
    if (br) br.addEventListener('click', () => DT.acoes.reagendar(estado.existente, () => { estado.existente = DT.ag.ativoDoPedido(p.numero); desenharResultado(); }));
    const bc = box.querySelector('#btn-canc');
    if (bc) bc.addEventListener('click', () => DT.acoes.cancelar(estado.existente, () => { estado.existente = DT.ag.ativoDoPedido(p.numero); desenharResultado(); }));

    if (podeAgendar) {
      picker = DT.slotPicker(box.querySelector('#ag-picker'), {
        data: estado.preSel && estado.preSel.data, hora: estado.preSel && estado.preSel.hora,
        onChange: () => { box.querySelector('#ag-erro').innerHTML = ''; }
      });
      box.querySelector('#f-ag').addEventListener('submit', e => { e.preventDefault(); confirmar(); });
    }
  }

  function responsaveis() {
    const u = DT.auth.usuarioAtual();
    const nomes = DT.db.funcionarios().filter(f => f.ativo && f.setor === 'Comercial').map(f => f.nome);
    if (nomes.indexOf(u.nome) < 0) nomes.unshift(u.nome);
    return ui.options(nomes, u.nome);
  }

  function confirmar() {
    const v = picker.valor();
    const r = DT.ag.criar(estado.pedido, {
      data: v.data, hora: v.hora,
      responsavel: el.querySelector('#ag-resp').value,
      observacao: el.querySelector('#ag-obs').value.trim()
    });
    if (!r.ok) {
      const box = el.querySelector('#ag-erro');
      box.innerHTML = ui.notice('crit', esc(r.erro)) + DT.acoes.sugestoesHTML(r.sugestoes);
      box.querySelectorAll('[data-sug-d]').forEach(b => b.addEventListener('click', () => { picker.definir(b.dataset.sugD, b.dataset.sugH); box.innerHTML = ''; }));
      if (r.sugestoes) picker.redesenhar();
      return;
    }
    DT.app.montarMenu();
    confirmacao(r.ag);
  }

  function textoConfirmacao(ag) {
    return 'RETIRADA AGENDADA — DRIVE THRU\n' +
      'Pedido: ' + ag.pedido.numero + '\nCliente: ' + ag.pedido.cliente + '\nNota Fiscal: ' + (ag.pedido.notaFiscal || 'a emitir') +
      '\nData: ' + U.fmtData(ag.data) + '\nHorário: ' + ag.hora + '\nLocal: DRIVE THRU — ' + DT.db.settings().unidade + '\nStatus: AGENDADO' +
      '\n\nAcompanhe a preparação do seu pedido e receba o aviso de "pronto para retirada":\n' + DT.ag.linkCliente(ag) + '\nCódigo: ' + DT.ag.codigo(ag);
  }

  function confirmacao(ag) {
    el.innerHTML =
      '<div class="ticket" role="status">' +
        '<div class="ticket-head">' + ui.icon('check') + '<div><h2>Retirada agendada</h2><span>Pedido pronto para ser preparado pela Logística</span></div></div>' +
        '<div class="ticket-body">' +
          '<div class="ticket-big"><div><span>Data</span><b>' + U.fmtData(ag.data) + '</b></div><div><span>Horário</span><b>' + ag.hora + '</b></div></div>' +
          '<div class="ticket-row"><span>Pedido</span><b class="mono">' + esc(ag.pedido.numero) + '</b></div>' +
          '<div class="ticket-row"><span>Cliente</span><b>' + esc(ag.pedido.cliente) + '</b></div>' +
          '<div class="ticket-row"><span>Nota fiscal</span><b class="mono">' + esc(ag.pedido.notaFiscal || 'a emitir') + '</b></div>' +
          '<div class="ticket-row"><span>Local</span><b>DRIVE THRU</b></div>' +
          '<div class="ticket-row"><span>Status</span><b>' + ui.badge('Agendado') + '</b></div>' +
          '<div class="ticket-row"><span>Agendado por</span><b>' + esc(ag.criadoPor) + ' · ' + U.fmtDataHora(ag.criadoEm) + '</b></div>' +
        '</div>' +
        '<div class="ticket-cut"></div>' +
        DT.acoes.blocoCliente(ag) +
        '<div class="card-foot" style="justify-content:space-between">' +
          '<button type="button" class="btn ghost" id="btn-copiar">' + ui.icon('copy') + 'Copiar para enviar ao cliente</button>' +
          '<div class="row"><button type="button" class="btn ghost" id="btn-agenda">' + ui.icon('calendar') + 'Ver agenda</button>' +
          '<button type="button" class="btn primary" id="btn-novo">' + ui.icon('plus') + 'Novo agendamento</button></div>' +
        '</div>' +
      '</div>';
    DT.acoes.ligarBlocoCliente(el, ag);
    el.querySelector('#btn-novo').addEventListener('click', () => { estado = {}; desenhar(); });
    el.querySelector('#btn-agenda').addEventListener('click', () => { DT.views.agenda.dataSel = ag.data; DT.app.ir('agenda'); });
    el.querySelector('#btn-copiar').addEventListener('click', async () => {
      const ok = await ui.copiar(textoConfirmacao(ag));
      ui.toast(ok ? 'Confirmação copiada. Cole no WhatsApp ou e-mail do cliente.' : 'Não foi possível copiar automaticamente.', ok ? 'ok' : 'warn');
    });
  }

  return { titulo: 'Novo agendamento', eyebrow: 'Comercial', render: render };
})();

/* ============================ AGENDA DE RETIRADAS ============================ */
DT.views.agenda = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS;
  const view = { titulo: 'Agenda de retiradas', eyebrow: 'Comercial · Logística', aoVivo: true, dataSel: null, filtro: 'todos', busca: '' };
  let el;

  view.render = function (container) {
    el = container;
    if (!view.dataSel) view.dataSel = U.dataISO();
    desenhar();
  };
  view.refresh = function () { desenhar(true); };

  function filtrar(ag) {
    const f = view.filtro;
    if (f === 'ativos' && [S.CANCELADO, S.NAO_COMPARECEU].indexOf(ag.status) >= 0) return false;
    if (f === 'pendentes' && DT.ag.prepAtual(ag) === S.PRONTO) return false;
    if (f === 'pendentes' && DT.STATUS_GRUPOS.finalizados.indexOf(ag.status) >= 0) return false;
    if (f === 'alertas' && !DT.kpi.alertas(ag).length) return false;
    if (view.busca) {
      const b = view.busca.toLowerCase();
      if (ag.pedido.numero.indexOf(b) < 0 && ag.pedido.cliente.toLowerCase().indexOf(b) < 0) return false;
    }
    return true;
  }

  function desenhar(manterFoco) {
    const data = view.dataSel;
    const hoje = U.dataISO();
    const agora = new Date();
    const cfg = DT.db.settings();
    const mapa = DT.agenda.mapaDia(data);
    const todos = DT.db.agendamentos().filter(a => a.data === data);
    // horários fora da grade atual (ex.: após mudança de configuração) também aparecem
    const horas = mapa.map(j => j.hora);
    todos.forEach(a => { if (horas.indexOf(a.hora) < 0) horas.push(a.hora); });
    horas.sort();
    const r = DT.kpi.resumoDia(data);
    const podeAgendar = DT.auth.pode('agendamento.criar');

    el.innerHTML =
      '<section class="card"><div class="card-body">' +
        '<div class="agenda-toolbar">' +
          '<div class="row" style="gap:6px"><button type="button" class="icon-btn" id="ag-prev" aria-label="Dia anterior">' + ui.icon('back') + '</button>' +
          '<div class="field"><label class="sr-only" for="ag-data">Data</label><input type="date" id="ag-data" class="input" value="' + data + '" style="width:170px"></div>' +
          '<button type="button" class="icon-btn" id="ag-next" aria-label="Próximo dia">' + ui.icon('arrow') + '</button>' +
          (data !== hoje ? '<button type="button" class="btn ghost sm" id="ag-hoje">Hoje</button>' : '') + '</div>' +
          '<div class="field" style="width:190px"><label for="ag-filtro">Mostrar</label><select id="ag-filtro" class="select">' +
            ui.options([{ value: 'todos', label: 'Todos' }, { value: 'ativos', label: 'Sem cancelados/ausentes' }, { value: 'pendentes', label: 'Preparação pendente' }, { value: 'alertas', label: 'Com alerta' }], view.filtro) + '</select></div>' +
          '<div class="field" style="flex:1 1 200px"><label for="ag-busca">Buscar pedido ou cliente</label><input id="ag-busca" class="input" placeholder="Nº do pedido ou nome" value="' + esc(view.busca) + '"></div>' +
        '</div>' +
        '<div class="stat-strip">' +
          '<div class="stat"><span>' + U.diaSemana(data) + '</span><b>' + U.fmtData(data) + '</b></div>' +
          '<div class="stat"><span>Agendados</span><b>' + r.agendados + '</b></div>' +
          '<div class="stat"><span>Janelas ocupadas</span><b>' + r.janelasOcupadas + ' / ' + r.capacidadeTotal + '</b></div>' +
          '<div class="stat"><span>Ocupação</span><b>' + r.ocupacaoPct + '%</b></div>' +
          '<div class="stat"><span>Concluídos</span><b>' + r.concluidos + '</b></div>' +
          '<div class="stat"><span>Capacidade</span><b>' + cfg.pedidosPorJanela + '/janela · ' + cfg.intervaloMin + ' min</b></div>' +
        '</div>' +
      '</div></section>' +
      '<section class="card">' +
        (horas.length ? '<div class="agenda">' + horas.map(h => {
          const j = mapa.find(x => x.hora === h) || { hora: h, capacidade: 0, ocupados: 0, foraAntecedencia: true, lotada: true };
          const lista = todos.filter(a => a.hora === h).filter(filtrar);
          const inicio = U.toDate(data, h), fim = new Date(inicio.getTime() + cfg.intervaloMin * 60000);
          const agoraAqui = agora >= inicio && agora < fim;
          const passado = fim <= agora;
          const livres = Math.max(0, j.capacidade - j.ocupados);
          const quadros = Array.from({ length: j.capacidade }, (_, i) => '<i class="' + (i < j.ocupados ? 'on' : '') + '"></i>').join('');
          let livresHTML = '';
          if (view.filtro === 'todos' && !view.busca) {
            for (let i = 0; i < livres; i++) {
              const pode = podeAgendar && !j.foraAntecedencia;
              livresHTML += '<button type="button" class="agenda-free" ' + (pode ? 'data-livre="' + data + 'T' + h + '"' : 'disabled') + '>' +
                (pode ? ui.icon('plus', 'icon-sm') + 'Janela livre — agendar' : 'Janela livre') + '</button>';
            }
          }
          return '<div class="agenda-row' + (agoraAqui ? ' now' : '') + (passado ? ' past' : '') + '">' +
            '<div class="agenda-time"><b>' + h + '</b><span class="cap" title="' + j.ocupados + ' de ' + j.capacidade + ' vagas">' + quadros + '</span></div>' +
            '<div class="agenda-slots">' + lista.map(itemHTML).join('') + livresHTML +
            (!lista.length && !livresHTML ? '<span class="subtle" style="align-self:center">—</span>' : '') + '</div></div>';
        }).join('') + '</div>' : ui.empty('Não há atendimento do Drive Thru neste dia.', 'calendar')) +
      '</section>';

    el.querySelector('#ag-data').addEventListener('change', e => { if (e.target.value) { view.dataSel = e.target.value; desenhar(); } });
    el.querySelector('#ag-prev').addEventListener('click', () => { view.dataSel = U.addDias(view.dataSel, -1); desenhar(); });
    el.querySelector('#ag-next').addEventListener('click', () => { view.dataSel = U.addDias(view.dataSel, 1); desenhar(); });
    const bh = el.querySelector('#ag-hoje'); if (bh) bh.addEventListener('click', () => { view.dataSel = U.dataISO(); desenhar(); });
    el.querySelector('#ag-filtro').addEventListener('change', e => { view.filtro = e.target.value; desenhar(); });
    const busca = el.querySelector('#ag-busca');
    busca.addEventListener('input', e => { view.busca = e.target.value.trim(); desenhar(true); const b = el.querySelector('#ag-busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); });
    el.querySelectorAll('[data-ag]').forEach(b => {
      b.addEventListener('click', e => {
        if (e.target.closest('[data-goto-pedido]')) return;
        const ag = DT.db.agendamentoPorId(b.dataset.ag);
        DT.acoes.detalhe(ag, () => desenhar());
      });
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
    });
    el.querySelectorAll('[data-livre]').forEach(b => b.addEventListener('click', () => DT.app.ir('agendar', b.dataset.livre)));
    void manterFoco;
  }

  function itemHTML(ag) {
    const inativo = [S.CANCELADO, S.NAO_COMPARECEU].indexOf(ag.status) >= 0;
    return '<div role="button" tabindex="0" class="agenda-item edge-' + ui.tone(ag.status) + (inativo ? ' muted-item' : '') + '" data-ag="' + ag.id + '">' +
      '<div class="row between"><div class="row">' + ui.tag(ag.pedido.numero) + '<span class="cli">' + esc(ag.pedido.cliente) + '</span></div>' + ui.badge(ag.status) + '</div>' +
      '<div class="row between"><span class="subtle">' + ag.pedido.qtdItens + ' itens · ' + U.fmtMoeda(ag.pedido.valor) + ' · ' + esc(ag.responsavel) + '</span>' +
      '<div class="row" style="gap:4px">' + ui.alertChips(ag) + (ag.reagendamentos && ag.reagendamentos.length ? '<span class="alert-chip info">Reagendado</span>' : '') + '</div></div>' +
      '</div>';
  }

  return view;
})();
