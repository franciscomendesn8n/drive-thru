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
  /* compartilhamento da localização a caminho do Drive Thru */
  const rast = { ativo: false, watchId: null, ultimoEnvio: 0, ultimaEnviada: null, ultimaPos: null, erro: null, aviso: null, wake: null, enviados: 0, timer: null, enviando: false };
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

  /* ---------- "Estou a caminho": localização compartilhada ---------- */
  function rastreioCfg(ag) {
    if (nuvem()) {
      const r = ag.rastreio || {};
      return { ativo: r.ativo !== false, cd: r.cd && isFinite(r.cd.lat) ? { lat: Number(r.cd.lat), lng: Number(r.cd.lng) } : null, compartilhando: !!r.compartilhando };
    }
    const cfg = DT.db.settings();
    return { ativo: cfg.rastreioAtivo !== false, cd: cfg.localCD || null, compartilhando: DT.rastreio.compartilhando(ag.id) };
  }
  function podeRastrear(ag) {
    return rastreioCfg(ag).ativo && DT.STATUS_GRUPOS.ativosPreChegada.indexOf(ag.status) >= 0 && ag.data === U.dataISO();
  }
  async function pedirTelaLigada() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') rast.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* não suportado */ }
  }
  function soltarTela() { try { if (rast.wake) rast.wake.release(); } catch (e) { /* ignora */ } rast.wake = null; }

  function iniciarRastreio() {
    rast.erro = null; rast.aviso = null;
    if (!('geolocation' in navigator)) { rast.erro = 'Este navegador não informa a localização. Tente pelo Chrome ou Safari do celular.'; desenhar(); return; }
    if (!window.isSecureContext) { rast.erro = 'A localização só funciona em endereço seguro (https).'; desenhar(); return; }
    rast.ativo = true; rast.ultimoEnvio = 0; rast.ultimaEnviada = null; rast.enviados = 0;
    desenhar();
    rast.watchId = navigator.geolocation.watchPosition(aoReceberPosicao, aoFalharPosicao, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    clearInterval(rast.timer);
    rast.timer = setInterval(processarPosicao, 4000);   // o GPS parado pode ficar sem novos eventos
    pedirTelaLigada();
  }
  function pararRastreio(avisarServidor, aviso, semDesenhar) {
    if (rast.watchId != null) { try { navigator.geolocation.clearWatch(rast.watchId); } catch (e) { /* ignora */ } }
    clearInterval(rast.timer);
    rast.watchId = null; rast.ativo = false; rast.ultimaPos = null; rast.enviando = false;
    soltarTela();
    if (aviso !== undefined) rast.aviso = aviso;
    const cod = codigoAtual;
    if (avisarServidor && cod) {
      DT.rastreio.parar(cod).then(() => {
        if (agAtual && agAtual.rastreio) agAtual.rastreio.compartilhando = false;
        if (!semDesenhar && root && agAtual && codigoAtual === cod) desenhar();
      }, () => {});
    }
    if (!semDesenhar && root && agAtual) desenhar();
  }
  async function aoReceberPosicao(p) {
    if (!rast.ativo) return;
    const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy || 0),
      velocidade: p.coords.speed == null || isNaN(p.coords.speed) ? null : p.coords.speed,
      rumo: p.coords.heading == null || isNaN(p.coords.heading) ? null : p.coords.heading };
    rast.ultimaPos = pos;
    processarPosicao();
  }
  /* Decide se envia agora: primeira posição, a cada 15 s, ou antes se andou mais de 100 m */
  async function processarPosicao() {
    const pos = rast.ultimaPos;
    if (!rast.ativo || !pos || rast.enviando) return;
    const agora = Date.now();
    const moveu = rast.ultimaEnviada ? DT.rastreio.distanciaKm(rast.ultimaEnviada, pos) : 1;
    const enviar = !rast.ultimaEnviada || agora - rast.ultimoEnvio >= 15000 || (moveu > 0.1 && agora - rast.ultimoEnvio >= 4000);
    if (!enviar) { desenharRastreio(); return; }
    rast.ultimoEnvio = agora;
    rast.enviando = true;
    try {
      const r = await DT.rastreio.enviar(codigoAtual, pos, false);
      if (r && r.ok === false) {
        if (r.erro === 'encerrado') pararRastreio(false, 'Sua chegada já foi registrada. Obrigado!');
        else if (r.erro === 'outro_dia') pararRastreio(false, 'O compartilhamento só funciona no dia da retirada.');
        else rast.erro = 'Não foi possível enviar a localização agora.';
      } else {
        rast.erro = null;
        rast.ultimaEnviada = pos;
        rast.enviados++;
        if (rast.enviados === 1) { atualizar(); return; }   // mostra o novo status "a caminho"
      }
    } catch (e) {
      rast.erro = 'Sem conexão com a internet. Continuaremos tentando.';
    } finally { rast.enviando = false; }
    desenharRastreio();
  }
  function aoFalharPosicao(e) {
    if (e && e.code === 1) {
      pararRastreio(false);
      rast.erro = 'Você não permitiu o acesso à localização. Para compartilhar, libere a localização deste site nas configurações do navegador e toque de novo em "Estou a caminho".';
      desenhar();
      return;
    }
    rast.erro = 'Sinal de GPS fraco. Continuaremos tentando.';
    desenharRastreio();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && rast.ativo) { pedirTelaLigada(); rast.ultimoEnvio = 0; }
  });

  function cardRastreio(ag) {
    if (!podeRastrear(ag)) return '';
    const cfg = rastreioCfg(ag);
    const prep = DT.ag.prepAtual(ag);
    let corpo;
    if (rast.ativo) {
      const pos = rast.ultimaPos;
      const dist = cfg.cd && pos ? DT.rastreio.distanciaKm(pos, cfg.cd) : null;
      const eta = dist == null ? null : DT.rastreio.etaMin(dist, { velocidade: pos.velocidade, trilha: [] });
      corpo = '<div class="cli-rast-on"><span class="cli-pulse">' + ui.icon('nav') + '</span><div><b>Compartilhando sua localização</b>' +
          '<p>' + (!pos ? 'Obtendo a sua posição…' : dist == null ? 'Nossa equipe está acompanhando a sua chegada.' :
            'Você está a <b>' + DT.rastreio.fmtKm(dist) + '</b> do Drive Thru' + (eta ? ' · chegada em <b>' + DT.rastreio.fmtEta(eta) + '</b>' : ' · <b>chegando!</b>')) + '</p></div></div>' +
        ui.notice('info', 'Deixe <b>esta página aberta na tela</b> durante o trajeto. Se bloquear o celular ou trocar de aplicativo, a atualização para até você voltar.', 'info') +
        (rast.erro ? ui.notice('warn', esc(rast.erro)) : '') +
        '<button type="button" class="btn ghost block" id="cli-parar">' + ui.icon('stop') + 'Parar de compartilhar</button>';
    } else {
      corpo = (cfg.compartilhando ?
          '<div><b>O compartilhamento foi interrompido</b><p class="muted">A página foi fechada ou recarregada. Toque abaixo para continuar enviando a sua localização.</p></div>' :
          '<div><b>Está vindo retirar?</b><p class="muted">Toque em "Estou a caminho" para a nossa equipe acompanhar a sua chegada e deixar tudo pronto na doca.</p></div>') +
        (prep !== S.PRONTO ? ui.notice('warn', 'Seu pedido ainda está em preparação. Se puder, saia quando ele estiver pronto.') : '') +
        (rast.aviso ? ui.notice('ok', esc(rast.aviso)) : '') +
        (rast.erro ? ui.notice('crit', esc(rast.erro)) : '') +
        '<button type="button" class="btn primary lg block" id="cli-caminho">' + ui.icon('nav') + (cfg.compartilhando ? 'Continuar compartilhando' : 'Estou a caminho') + '</button>' +
        (cfg.compartilhando ? '<button type="button" class="btn link sm" id="cli-encerrar">Não quero mais compartilhar</button>' : '') +
        '<p class="subtle cli-priv">' + ui.icon('lock') + '<span>Sua localização é usada só durante o trajeto até o Drive Thru e só pela nossa equipe. O compartilhamento para quando você chega (check-in) ou toca em "Parar", e a localização é apagada.</span></p>';
    }
    return '<section class="cli-card cli-rast' + (rast.ativo ? ' on' : '') + '" id="cli-rast">' + corpo + '</section>';
  }
  function ligarRastreio() {
    const b = root.querySelector('#cli-caminho');
    if (b) b.addEventListener('click', iniciarRastreio);
    const p = root.querySelector('#cli-parar');
    if (p) p.addEventListener('click', () => pararRastreio(true, 'Compartilhamento encerrado. Sua localização foi apagada.'));
    const e = root.querySelector('#cli-encerrar');
    if (e) e.addEventListener('click', () => pararRastreio(true, 'Compartilhamento encerrado. Sua localização foi apagada.'));
  }
  /* Atualiza só o quadro da localização (sem redesenhar a página inteira) */
  function desenharRastreio() {
    const box = root && root.querySelector('#cli-rast');
    if (!box || !agAtual) { if (root && agAtual) desenhar(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = cardRastreio(agAtual);
    if (tmp.firstChild) { box.replaceWith(tmp.firstChild); ligarRastreio(); }
    else box.remove();
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
    if (ag && rast.ativo && !podeRastrear(ag)) {
      const chegou = DT.STATUS_GRUPOS.ativosPreChegada.indexOf(ag.status) < 0;
      pararRastreio(false, chegou ? 'Você chegou! O compartilhamento da localização foi encerrado.' : undefined);
      return;
    }
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
      (encerrado ? '' : cardRastreio(ag)) +
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
    ligarRastreio();

    // dispara o aviso só na transição para "pronto" com a página aberta
    if (ultimoPronto === false && pronto) avisarPronto(ag);
    ultimoPronto = pronto;
  }

  function render(container, codigo) {
    root = container;
    document.title = tituloBase;
    if (codigo !== codigoAtual) { if (rast.ativo) pararRastreio(true, undefined, true); rast.erro = null; rast.aviso = null; codigoAtual = codigo; ultimoPronto = null; agAtual = null; carregado = false; }
    clearInterval(timer);
    if (codigoAtual && nuvem() && !carregado) root.innerHTML = casca('<div class="cli-card"><div class="row"><span class="spinner"></span>Buscando o seu pedido…</div></div>');
    atualizar();
    if (codigoAtual) timer = setInterval(atualizar, nuvem() ? 10000 : 15000);
  }
  function sair() { if (rast.ativo) pararRastreio(true, undefined, true); clearInterval(timer); clearInterval(piscar); codigoAtual = null; }

  // outra aba (ex.: a Logística no mesmo computador) alterou os dados: atualiza na hora
  window.addEventListener('storage', e => { if (!nuvem() && codigoAtual && root && e.key && e.key.indexOf(DT.APP.storagePrefix) === 0) atualizar(); });

  return { render, sair, etapas, situacao };
})();
