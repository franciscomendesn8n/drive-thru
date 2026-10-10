/* =====================================================================
   DRIVE THRU — Painel de TV (#painel)
   Tela para a TV da área de espera: chama o cliente para a doca,
   mostra quem aguarda e os próximos horários. Atualiza sozinha.
   ===================================================================== */
window.DT = window.DT || {};
DT.views = DT.views || {};

DT.views.painel = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS, G = DT.STATUS_GRUPOS;
  const view = { titulo: 'Painel de TV', eyebrow: 'Operação · Chamada de clientes', aoVivo: true };
  let el, timer = null, som = false, ctxAudio = null, chamadosVistos = null;

  view.render = function (c) {
    el = c; chamadosVistos = null;
    desenhar();
    clearInterval(timer);
    timer = setInterval(() => { if (ativo()) desenhar(); else parar(); }, 15000);
  };
  view.refresh = function () { if (ativo()) desenhar(); };

  /* O container #view é o mesmo para todas as telas: o painel só se
     redesenha enquanto a rota for #painel (senão "sequestrava" a outra tela). */
  function ativo() { return !!el && el.isConnected && /^#painel(\/|$)/.test(location.hash); }
  function parar() { clearInterval(timer); timer = null; sairTela(); }

  function cfg() { return DT.db.settings(); }
  function nome(ag) {
    const m = cfg().painelNome || 'primeiro', n = String(ag.pedido.cliente || '').trim();
    if (m === 'pedido') return 'Pedido ' + ag.pedido.numero;
    if (m === 'completo') return n;
    const p = n.split(/\s+/);
    return p[0] + (p[1] && p[1].length <= 3 && p[2] ? ' ' + p[1] + ' ' + p[2] : p[1] ? ' ' + p[1].charAt(0) + '.' : '');
  }
  function placa(ag) {
    if (cfg().painelPlaca === false) return '';
    const p = ag.veiculo && ag.veiculo.placa;
    return p ? '<span class="pn-placa">' + esc(p) + '</span>' : '';
  }
  function dados() {
    const hoje = U.dataISO(), agora = Date.now(), lim = (Number(cfg().painelChamadaMin) || 5) * 60000;
    const doDia = DT.db.agendamentos().filter(a => a.data === hoje);
    const emAt = doDia.filter(a => a.status === S.EM_ATENDIMENTO || a.status === S.CARREGANDO);
    const chamando = emAt.filter(a => a.inicioAtendimento && agora - new Date(a.inicioAtendimento).getTime() <= lim)
      .sort((a, b) => b.inicioAtendimento.localeCompare(a.inicioAtendimento));
    const naDoca = emAt.filter(a => chamando.indexOf(a) < 0).sort((a, b) => (a.doca || '').localeCompare(b.doca || ''));
    const aguardando = doDia.filter(a => a.status === S.CHEGOU).sort((a, b) => (a.chegada || '').localeCompare(b.chegada || ''));
    const proximos = doDia.filter(a => G.ativosPreChegada.indexOf(a.status) >= 0).sort((a, b) => a.hora.localeCompare(b.hora));
    const prontos = proximos.filter(a => DT.ag.prepAtual(a) === S.PRONTO).length;
    return { chamando, naDoca, aguardando, proximos, prontos };
  }
  function desenhar() {
    const d = dados();
    const ids = d.chamando.map(a => a.id + '|' + a.inicioAtendimento);
    if (chamadosVistos && ids.some(i => chamadosVistos.indexOf(i) < 0)) tocar();
    chamadosVistos = ids;
    const s = cfg();
    el.innerHTML =
      '<div class="pn" id="pn">' +
        '<div class="pn-topo"><div class="row"><img data-logo-empresa src="' + esc(DT.aparencia.logo()) + '" alt="" class="pn-logo"><div><b class="pn-tit">Drive Thru</b><span class="pn-sub">' + esc(s.unidade || '') + '</span></div></div>' +
          '<div class="row pn-ctl"><button type="button" class="btn ghost sm" id="pn-som">' + ui.icon('play', 'icon-sm') + (som ? 'Som ligado' : 'Ativar som') + '</button>' +
          '<button type="button" class="btn sm pn-btn-tela" id="pn-tela" title="Atalho: duplo clique no painel">' + ui.icon('tv', 'icon-sm') + (telaCheia() ? 'Sair da tela cheia' : 'Tela cheia') + '</button></div>' +
          '<div class="pn-hora mono">' + U.horaHM() + '</div></div>' +
        '<div class="pn-grid">' +
          '<section class="pn-chamada">' +
            '<h2>Chamando</h2>' +
            (d.chamando.length ? d.chamando.slice(0, 3).map((a, i) =>
              '<div class="pn-call' + (i === 0 ? ' pn-novo' : '') + '"><div class="pn-call-n">' + esc(nome(a)) + placa(a) + '</div>' +
              '<div class="pn-call-d"><span>Dirija-se à</span><b>' + esc(a.doca || 'doca') + '</b></div></div>').join('')
              : '<div class="pn-vazio">Aguarde a chamada nesta tela.</div>') +
            (d.naDoca.length ? '<h3>Em atendimento</h3><div class="pn-lista">' + d.naDoca.map(a =>
              '<div class="pn-li"><span>' + esc(nome(a)) + placa(a) + '</span><b>' + esc(a.doca || '') + '</b></div>').join('') + '</div>' : '') +
          '</section>' +
          '<section class="pn-col">' +
            '<h3>Aguardando chamada <span class="pn-cnt">' + d.aguardando.length + '</span></h3><div class="pn-lista">' +
            (d.aguardando.length ? d.aguardando.slice(0, 8).map(a =>
              '<div class="pn-li"><span>' + esc(nome(a)) + placa(a) + '</span><small>chegou ' + U.fmtHora(a.chegada) + '</small></div>').join('') : '<div class="pn-vazio sm">Ninguém aguardando.</div>') + '</div>' +
            '<h3>Próximos horários <span class="pn-cnt">' + d.proximos.length + '</span></h3><div class="pn-lista">' +
            (d.proximos.length ? d.proximos.slice(0, 8).map(a =>
              '<div class="pn-li"><span><b class="mono">' + esc(a.hora) + '</b> ' + esc(nome(a)) + '</span>' + (DT.ag.prepAtual(a) === S.PRONTO ? '<em class="pn-ok">Pronto</em>' : '<small>em preparação</small>') + '</div>').join('') : '<div class="pn-vazio sm">Sem outros horários hoje.</div>') + '</div>' +
            '<div class="pn-rodape">' + d.prontos + ' pedido(s) pronto(s) aguardando o cliente</div>' +
          '</section>' +
        '</div>' +
        (telaCheia() ? '<button type="button" class="pn-sair" id="pn-sair">' + ui.icon('x', 'icon-sm') + 'Sair da tela cheia <small>(Esc)</small></button>' : '') +
      '</div>';
    el.querySelector('#pn-som').addEventListener('click', () => { som = !som; if (som) { prepararAudio(); tocar(); } desenhar(); });
    el.querySelector('#pn-tela').addEventListener('click', alternarTela);
    const bs = el.querySelector('#pn-sair'); if (bs) bs.addEventListener('click', () => { sairTela(); desenhar(); });
    el.querySelector('#pn').addEventListener('dblclick', e => { if (!e.target.closest('button')) alternarTela(); });
  }

  /* Em tela cheia os controles somem após alguns segundos parados e
     voltam ao mexer o mouse ou tocar na tela (a TV fica limpa). */
  let ocioso = null;
  function acordar() {
    if (!telaCheia()) return;
    document.body.classList.remove('pn-ocioso');
    clearTimeout(ocioso);
    ocioso = setTimeout(() => { if (telaCheia()) document.body.classList.add('pn-ocioso'); }, 4000);
  }
  ['mousemove', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, acordar, { passive: true }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && telaCheia() && ativo()) { sairTela(); desenhar(); } });
  function telaCheia() { return document.body.classList.contains('modo-painel'); }
  function alternarTela() {
    if (telaCheia()) { sairTela(); }
    else {
      document.body.classList.add('modo-painel');
      try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* sem suporte */ }
      acordar();
    }
    desenhar();
  }
  function sairTela() {
    clearTimeout(ocioso);
    document.body.classList.remove('modo-painel', 'pn-ocioso');
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ok */ }
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && telaCheia()) { document.body.classList.remove('modo-painel'); if (ativo()) desenhar(); } });
  window.addEventListener('hashchange', () => { if (!/^#painel(\/|$)/.test(location.hash)) parar(); });

  function prepararAudio() {
    try { ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)(); if (ctxAudio.state === 'suspended') ctxAudio.resume(); } catch (e) { ctxAudio = null; }
  }
  function tocar() {
    if (!som || !ctxAudio) return;
    try {
      const t0 = ctxAudio.currentTime;
      [[660, 0], [880, .28], [660, .56]].forEach(([f, ini]) => {
        const o = ctxAudio.createOscillator(), g = ctxAudio.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t0 + ini); g.gain.exponentialRampToValueAtTime(0.35, t0 + ini + .03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ini + .25);
        o.connect(g); g.connect(ctxAudio.destination); o.start(t0 + ini); o.stop(t0 + ini + .27);
      });
    } catch (e) { /* sem áudio */ }
  }
  return view;
})();
