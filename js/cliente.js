/* =====================================================================
   Página do Cliente — acompanhamento público da retirada
   ---------------------------------------------------------------------
   Endereço: index.html#acompanhar-CODIGO  (não exige login)
   Mostra só as etapas que interessam ao cliente e avisa quando o
   pedido fica pronto (aviso na tela, som e notificação do navegador).
   ===================================================================== */
window.DT = window.DT || {};

DT.cliente = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS;
  let root, codigoAtual = null, timer = null, ultimoPronto = null, audioCtx = null, avisosAtivos = false;
  let agAtual = null, unidadeAtual = '', semConexao = false, carregado = false;
  const nuvem = () => DT.db.modoNuvem();
  const tituloBase = 'Acompanhe sua retirada · Drive Thru';

  /* ---------- etapas vistas pelo cliente ---------- */
  function ts(ag, status) {
    const h = (ag.historico || []).find(x => x.status === status);
    return h ? h.ts : null;
  }
  function etapas(ag) {
    const prep = DT.ag.prepAtual(ag);
    const ordem = DT.FLUXO_PREPARACAO;
    const nivel = ordem.indexOf(prep);
    const concluido = ag.status === S.CONCLUIDO || ag.status === S.ENTREGUE;
    return [
      { titulo: 'Retirada agendada', desc: 'Data e horário confirmados pelo vendedor.', feito: true, quando: ag.criadoEm },
      { titulo: 'Pedido em separação', desc: 'Nossa equipe está separando os seus produtos.', feito: nivel >= 1, quando: ts(ag, S.EM_PREPARACAO) },
      { titulo: 'Conferido e faturado', desc: 'Produtos conferidos e nota fiscal emitida.', feito: nivel >= 4, quando: ts(ag, S.FATURADO) },
      { titulo: 'Pronto para retirada', desc: 'Seu pedido já está separado aguardando você.', feito: nivel >= 5, quando: ts(ag, S.PRONTO) },
      { titulo: 'Retirada concluída', desc: 'Mercadoria entregue no seu veículo.', feito: concluido, quando: ag.entrega || null }
    ];
  }

  /* ---------- mensagem principal conforme a situação ---------- */
  function situacao(ag) {
    const prep = DT.ag.prepAtual(ag);
    const quando = U.fmtData(ag.data) + ' às ' + ag.hora;
    if (ag.status === S.CANCELADO) return { tom: 'red', icone: 'ban', titulo: 'Retirada cancelada', texto: 'Este agendamento foi cancelado. Se tiver dúvidas, fale com o seu vendedor.' };
    if (ag.status === S.NAO_COMPARECEU) return { tom: 'red', icone: 'clock', titulo: 'Horário encerrado', texto: 'O horário de ' + quando + ' passou sem a retirada. Fale com o seu vendedor para agendar um novo horário.' };
    if (ag.status === S.CONCLUIDO || ag.status === S.ENTREGUE) return { tom: 'done', icone: 'check', titulo: 'Retirada concluída', texto: 'Obrigado pela preferência! Pedido entregue em ' + U.fmtDataHora(ag.entrega) + '.' };
    if ([S.CHEGOU, S.EM_ATENDIMENTO, S.CARREGANDO].indexOf(ag.status) >= 0) {
      return { tom: 'navy', icone: 'truck', titulo: ag.status === S.CARREGANDO ? 'Carregando seu veículo' : 'Você chegou!',
        texto: ag.doca ? 'Dirija-se à ' + ag.doca + '. Nossa equipe já está atendendo você.' : 'Aguarde, nossa equipe vai chamar você para a doca de retirada.' };
    }
    if (prep === S.PRONTO) return { tom: 'green', icone: 'check', titulo: 'Seu pedido está pronto!', texto: 'Pode vir retirar no Drive Thru no horário agendado: ' + quando + '.' };
    if (DT.FLUXO_PREPARACAO.indexOf(prep) >= 1) return { tom: 'amber', icone: 'box', titulo: 'Pedido em preparação', texto: 'Estamos separando e conferindo os seus produtos. Avisaremos aqui quando estiver pronto.' };
    return { tom: 'blue', icone: 'calendar', titulo: 'Retirada agendada', texto: 'Seu horário está reservado. A preparação começa antes da sua chegada.' };
  }

  /* ---------- aviso de pedido pronto ---------- */
  function bip() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22, 0.44].forEach((d, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = [880, 1175, 1568][i];
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + d + 0.2);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.22);
      });
    } catch (e) { /* sem som disponível */ }
  }
  let piscar = null;
  function avisarPronto(ag) {
    bip();
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* ignora */ }
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Seu pedido está pronto!', { body: 'Pedido ' + ag.pedido.numero + ' — retire no Drive Thru às ' + ag.hora + '.', tag: 'dt-' + codigoAtual });
      }
    } catch (e) { /* ignora */ }
    clearInterval(piscar);
    let n = 0;
    piscar = setInterval(() => {
      document.title = (n++ % 2 === 0) ? '✅ Pedido pronto!' : tituloBase;
      if (n > 20 || document.hasFocus()) { clearInterval(piscar); document.title = tituloBase; }
    }, 1000);
  }
  async function ativarAvisos() {
    avisosAtivos = true;
    // o clique libera o som no navegador
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') await audioCtx.resume(); } catch (e) { /* ignora */ }
    let msg = 'Pronto! Mantenha esta página aberta: tocaremos um aviso quando o pedido estiver pronto.';
    try {
      if ('Notification' in window) {
        const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (p === 'granted') msg = 'Avisos ativados. Você receberá uma notificação quando o pedido estiver pronto.';
      }
    } catch (e) { /* navegador não permite notificações */ }
    desenhar();
    ui.toast(msg);
  }

  /* ---------- telas ---------- */
  function casca(conteudo) {
    return '<div class="cli">' +
      '<header class="cli-top"><div class="brand-mark"><div class="logo">' + ui.icon('truck') + '</div><div><b>Drive Thru</b><span>' + esc(DT.APP.subtitulo) + '</span></div></div></header>' +
      '<main class="cli-main">' + conteudo + '</main>' +
      '<footer class="cli-foot">' + esc(unidadeAtual || DT.DEFAULT_SETTINGS.unidade) + ' · Esta página se atualiza sozinha.</footer>' +
      '</div>';
  }

  function telaBusca(erro) {
    root.innerHTML = casca(
      '<section class="cli-card"><span class="eyebrow">Acompanhe sua retirada</span><h1 class="cli-h1">Onde está meu pedido?</h1>' +
      '<p class="muted">Use o link enviado pelo vendedor ou informe os dados abaixo.</p>' +
      (erro ? ui.notice('crit', esc(erro)) : '') +
      '<form id="cli-f" class="stack" novalidate>' +
        '<div class="field"><label for="cli-cod">Código de acompanhamento</label><input id="cli-cod" class="input big" autocomplete="off" placeholder="Ex.: K7P2QX9M" maxlength="10" style="text-transform:uppercase"></div>' +
        '<div class="cli-ou"><span>ou</span></div>' +
        '<div class="fields-2"><div class="field"><label for="cli-ped">Nº do pedido</label><input id="cli-ped" class="input mono" inputmode="numeric" placeholder="123456"></div>' +
        '<div class="field"><label for="cli-tel">4 últimos dígitos do telefone</label><input id="cli-tel" class="input mono" inputmode="numeric" maxlength="4" placeholder="4321"></div></div>' +
        '<button type="submit" class="btn primary lg block">' + ui.icon('search') + 'Acompanhar</button>' +
      '</form></section>');
    root.querySelector('#cli-f').addEventListener('submit', async e => {
      e.preventDefault();
      const cod = root.querySelector('#cli-cod').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const ped = root.querySelector('#cli-ped').value, tel = root.querySelector('#cli-tel').value;
      const naoAchou = 'Não encontramos um agendamento com esses dados. Confira e tente novamente, ou fale com o seu vendedor.';
      if (cod) { location.hash = '#acompanhar-' + cod; return; }
      if (nuvem()) {
        const btn = root.querySelector('#cli-f button[type=submit]');
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Buscando…';
        let achado = null;
        try { achado = await DT.nuvem.acompanharPorPedido(ped, tel); }
        catch (err) { telaBusca('Não foi possível consultar agora. Verifique a internet e tente novamente.'); return; }
        if (!achado) { telaBusca(naoAchou); return; }
        location.hash = '#acompanhar-' + achado;
        return;
      }
      const ag = DT.ag.porPedidoTelefone(ped, tel);
      if (!ag) { telaBusca(naoAchou); return; }
      location.hash = '#acompanhar-' + DT.ag.codigo(ag);
    });
  }

  /* Busca os dados do agendamento (servidor no modo nuvem, memória no modo local) */
  async function atualizar() {
    const cod = codigoAtual;
    if (!cod) { agAtual = null; desenhar(); return; }
    if (nuvem()) {
      try {
        const r = await DT.nuvem.acompanhar(cod);
        if (cod !== codigoAtual) return;       // o cliente mudou de pedido enquanto buscava
        agAtual = r || null;
        if (r && r.unidade) unidadeAtual = r.unidade;
        semConexao = false;
      } catch (e) {
        semConexao = true;
        if (!carregado) { root.innerHTML = casca(ui.notice('warn', 'Não foi possível conectar ao servidor. Verifique a internet; tentaremos de novo automaticamente.')); return; }
      }
    } else {
      agAtual = DT.ag.porCodigo(cod);
      unidadeAtual = DT.db.settings().unidade;
    }
    carregado = true;
    desenhar();
  }

  function desenhar() {
    const ag = agAtual;
    if (!ag) { telaBusca(codigoAtual ? 'Link de acompanhamento inválido ou expirado.' : null); return; }
    const sit = situacao(ag);
    const et = etapas(ag);
    const atual = et.reduce((m, e, i) => e.feito ? i : m, 0);
    const encerrado = [S.CANCELADO, S.NAO_COMPARECEU].indexOf(ag.status) >= 0;
    const pronto = DT.ag.prepAtual(ag) === S.PRONTO && DT.STATUS_GRUPOS.ativosPreChegada.indexOf(ag.status) >= 0;
    const reag = ag.reagendamentos && ag.reagendamentos.length ? ag.reagendamentos[ag.reagendamentos.length - 1] : null;
    const podeAvisar = !encerrado && DT.ag.prepAtual(ag) !== S.PRONTO && ag.status !== S.CONCLUIDO;

    root.innerHTML = casca(
      '<section class="cli-hero tone-' + sit.tom + (pronto ? ' cli-pronto' : '') + '" role="status" aria-live="polite">' +
        '<div class="cli-hero-ic">' + ui.icon(sit.icone) + '</div>' +
        '<div><h1 class="cli-h1">' + esc(sit.titulo) + '</h1><p>' + esc(sit.texto) + '</p></div>' +
      '</section>' +
      '<section class="cli-card">' +
        '<div class="cli-resumo">' +
          '<div><span>Pedido</span><b class="mono">' + esc(ag.pedido.numero) + '</b></div>' +
          '<div><span>Data · ' + U.diaSemana(ag.data).split('-')[0].slice(0, 3) + '</span><b class="mono">' + U.fmtData(ag.data).slice(0, 5) + '</b></div>' +
          '<div><span>Horário</span><b class="mono">' + ag.hora + '</b></div>' +
        '</div>' +
        '<p class="muted" style="margin-top:10px">' + esc(ag.pedido.cliente) + ' · ' + esc(ag.pedido.qtdItens) + ' itens</p>' +
        (reag && !encerrado ? ui.notice('info', 'Horário alterado de ' + U.fmtData(reag.deData).slice(0, 5) + ' ' + reag.deHora + ' para <b>' + U.fmtData(ag.data).slice(0, 5) + ' ' + ag.hora + '</b>.') : '') +
      '</section>' +
      (encerrado ? '' :
      '<section class="cli-card"><h2 class="cli-h2">Andamento</h2><ol class="cli-steps">' + et.map((e, i) =>
        '<li class="' + (e.feito ? 'feito' : '') + (i === atual && i < et.length - 1 ? ' atual' : '') + '">' +
          '<span class="cli-dot">' + (e.feito ? ui.icon('check') : '') + '</span>' +
          '<div><b>' + esc(e.titulo) + '</b>' + (e.feito && e.quando ? '<span class="cli-when mono">' + U.fmtHora(e.quando) + (U.dataISO(new Date(e.quando)) !== U.dataISO() ? ' · ' + U.fmtData(U.dataISO(new Date(e.quando))).slice(0, 5) : '') + '</span>' : '') +
          '<p>' + esc(e.desc) + '</p></div></li>').join('') + '</ol></section>') +
      (podeAvisar ? '<section class="cli-card cli-avisos">' + (avisosAtivos ?
          ui.notice('ok', '<b>Avisos ativados.</b> Mantenha esta página aberta; avisaremos com som e notificação quando o pedido estiver pronto.') :
          '<div class="row between"><div><b>Quer ser avisado?</b><p class="muted">Ative para receber um alerta quando o pedido ficar pronto.</p></div>' +
          '<button type="button" class="btn primary" id="cli-avisar">' + ui.icon('alert') + 'Avise-me</button></div>') + '</section>' : '') +
      (!encerrado && ag.status !== S.CONCLUIDO ? '<section class="cli-card"><h2 class="cli-h2">Como retirar</h2><ol class="cli-como">' +
        '<li>Venha no horário agendado até a área do <b>Drive Thru</b>.</li>' +
        '<li>Informe o número do pedido <b class="mono">' + esc(ag.pedido.numero) + '</b> ou mostre esta página.</li>' +
        '<li>Confira os produtos na doca; nossa equipe faz o carregamento.</li></ol>' +
        '<p class="subtle">Código de acompanhamento: <b class="mono">' + DT.ag.codigo(ag) + '</b> · ' + (semConexao ? 'sem conexão, tentando de novo' : 'atualizado às ' + U.horaHM()) + '</p></section>' : '')
    );
    const b = root.querySelector('#cli-avisar');
    if (b) b.addEventListener('click', ativarAvisos);

    // dispara o aviso só na transição para "pronto" com a página aberta
    if (ultimoPronto === false && pronto) avisarPronto(ag);
    ultimoPronto = pronto;
  }

  function render(container, codigo) {
    root = container;
    document.title = tituloBase;
    if (codigo !== codigoAtual) { codigoAtual = codigo; ultimoPronto = null; agAtual = null; carregado = false; }
    clearInterval(timer);
    if (codigoAtual && nuvem() && !carregado) root.innerHTML = casca('<div class="cli-card"><div class="row"><span class="spinner"></span>Buscando o seu pedido…</div></div>');
    atualizar();
    if (codigoAtual) timer = setInterval(atualizar, nuvem() ? 10000 : 15000);
  }
  function sair() { clearInterval(timer); clearInterval(piscar); codigoAtual = null; }

  // outra aba (ex.: a Logística no mesmo computador) alterou os dados: atualiza na hora
  window.addEventListener('storage', e => { if (!nuvem() && codigoAtual && root && e.key && e.key.indexOf(DT.APP.storagePrefix) === 0) atualizar(); });

  return { render, sair, etapas, situacao };
})();
