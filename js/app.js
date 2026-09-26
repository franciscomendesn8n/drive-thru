/* =====================================================================
   Aplicação: login, layout, navegação e atualização automática
   ===================================================================== */
window.DT = window.DT || {};
DT.views = DT.views || {};

DT.app = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc;
  let rotaAtual = null;
  let timerRelogio = null, timerRefresh = null;

  /* ------------------------------ Tema ------------------------------ */
  function aplicarTema() {
    let t = null;
    try { t = localStorage.getItem(DT.APP.storagePrefix + 'tema'); } catch (e) { t = null; }
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function alternarTema() {
    const atual = document.documentElement.getAttribute('data-theme');
    const escuro = atual ? atual === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const novo = escuro ? 'light' : 'dark';
    try { localStorage.setItem(DT.APP.storagePrefix + 'tema', novo); } catch (e) { /* ignora */ }
    document.documentElement.setAttribute('data-theme', novo);
  }

  /* ------------------------------ Login ------------------------------ */
  function telaLogin(erro) {
    const root = document.getElementById('app');
    const passos = [['Venda', 'Comercial'], ['Agendamento', 'Comercial'], ['Preparação', 'Logística'], ['Conferência', 'Logística'],
      ['Faturamento', 'Logística'], ['Chegada', 'Cliente'], ['Carregamento', 'Logística'], ['Entrega', 'Finalização']];
    root.innerHTML =
      '<div class="login">' +
        '<section class="login-brand">' +
          '<div class="brand-mark"><div class="logo">' + ui.icon('truck') + '</div><div><b>Drive Thru</b><span>' + esc(DT.APP.subtitulo) + '</span></div></div>' +
          '<h1>Agendamento e controle da <em>retirada</em></h1>' +
          '<p class="lead">Do pedido agendado pelo Comercial até a mercadoria carregada no veículo do cliente, com cada etapa registrada.</p>' +
          '<div class="flow">' + passos.map((p, i) => '<div class="flow-step"><b>' + String(i + 1).padStart(2, '0') + '</b><span>' + p[0] + '</span><small>' + p[1] + '</small></div>').join('') + '</div>' +
        '</section>' +
        '<section class="login-panel">' +
          '<div class="login-card">' +
            '<div class="stack" style="gap:4px"><span class="eyebrow">Acesso restrito</span><h2 style="font-size:28px">Entrar no sistema</h2><p class="muted">Use seu usuário e senha. O menu é liberado conforme o seu perfil.</p></div>' +
            (erro ? ui.notice('crit', esc(erro)) : '') +
            '<form id="form-login" autocomplete="on" novalidate>' +
              '<div class="field"><label for="lg-user">Usuário</label><input id="lg-user" class="input" name="username" autocomplete="username" placeholder="Digite seu usuário" required></div>' +
              '<div class="field"><label for="lg-pass">Senha</label><input id="lg-pass" class="input" type="password" name="password" autocomplete="current-password" placeholder="Digite sua senha" required></div>' +
              '<button class="btn primary lg block" type="submit">' + ui.icon('lock') + 'Entrar</button>' +
            '</form>' +
            '<div class="demo-users"><div class="row between"><span class="eyebrow">Usuários de teste</span><span class="subtle">clique para preencher</span></div>' +
              '<div class="demo-grid">' + DT.seed.USUARIOS.map(u =>
                '<button type="button" class="demo-user" data-l="' + esc(u.login) + '" data-s="' + esc(u.senha) + '"><b>' + esc(DT.DEFAULT_PERFIS[u.perfil].nome) + ' · ' + esc(u.nome.split(' ')[0]) + '</b><span>' + esc(u.login) + ' / ' + esc(u.senha) + '</span></button>').join('') +
              '</div></div>' +
            '<p class="subtle">Versão ' + DT.APP.versao + ' · protótipo com dados de demonstração</p>' +
          '</div>' +
        '</section>' +
      '</div>';
    const f = document.getElementById('form-login');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      const usuario = f.username.value;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>' + (DT.db.modoNuvem() ? 'Conectando ao servidor…' : 'Entrando…');
      let r;
      try { r = await DT.auth.login(usuario, f.password.value); }
      catch (err) { r = { ok: false, erro: 'Falha ao entrar: ' + (err.message || err) }; }
      if (!r.ok) { telaLogin(r.erro); document.getElementById('lg-user').value = usuario; return; }
      await prepararDemonstracao();
      history.replaceState(null, '', location.pathname + location.search);
      iniciar();
      if (r.senhaFraca) setTimeout(() => abrirTrocaSenha(true), 300);
    });
    root.querySelectorAll('.demo-user').forEach(b => b.addEventListener('click', () => {
      f.username.value = b.dataset.l; f.password.value = b.dataset.s; f.querySelector('button[type=submit]').focus();
    }));
    setTimeout(() => { const i = document.getElementById('lg-user'); if (i && !i.value) i.focus(); }, 30);
  }

  /* ------------------------------ Troca de senha ------------------------------ */
  function abrirTrocaSenha(aviso) {
    const r = DT.SENHA;
    ui.modal({
      title: 'Trocar minha senha',
      body: (aviso ? ui.notice('warn', '<b>Sua senha não atende às regras de segurança.</b> Troque agora para continuar protegido.') : '') +
        '<div class="field"><label for="ts-atual">Senha atual</label><input id="ts-atual" type="password" class="input" autocomplete="current-password"></div>' +
        '<div class="field"><label for="ts-nova">Nova senha</label><input id="ts-nova" type="password" class="input" autocomplete="new-password">' +
          '<span class="hint">Mínimo de ' + r.minimo + ' caracteres, com letra minúscula, maiúscula, número e símbolo (ex.: ! @ # $ %). Não use a mesma senha de outros sites.</span></div>' +
        '<div class="field"><label for="ts-conf">Repita a nova senha</label><input id="ts-conf" type="password" class="input" autocomplete="new-password"></div>' +
        '<div id="ts-erro"></div>',
      actions: [
        { label: aviso ? 'Lembrar depois' : 'Voltar', cls: 'ghost' },
        { label: 'Trocar senha', cls: 'primary', icon: 'key', onClick: root => {
          const atual = root.querySelector('#ts-atual').value, nova = root.querySelector('#ts-nova').value, conf = root.querySelector('#ts-conf').value;
          const box = root.querySelector('#ts-erro');
          const erro = !atual ? 'Informe a senha atual.' : nova !== conf ? 'A confirmação não é igual à nova senha.' : U.validarSenha(nova);
          if (erro) { box.innerHTML = ui.notice('crit', esc(erro)); return false; }
          const btn = root.querySelector('.modal-foot .btn.primary');
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Trocando…';
          DT.auth.trocarMinhaSenha(atual, nova).then(res => {
            if (!res.ok) {
              box.innerHTML = ui.notice('crit', esc(res.erro));
              btn.disabled = false; btn.innerHTML = ui.icon('key') + 'Trocar senha';
              return;
            }
            document.querySelectorAll('.modal-back').forEach(m => m.remove());
            ui.toast('Senha trocada com sucesso.');
          });
          return false;
        }}
      ]
    });
  }

  /* ------------------------------ Layout ------------------------------ */
  function menuPermitido() {
    return DT.MENU.map(g => ({ grupo: g.grupo, itens: g.itens.filter(i => DT.auth.pode(i.perm)) })).filter(g => g.itens.length);
  }
  function rotaInicial(u) {
    const pref = { comercial: 'agendar', logistica: 'dashboard', gestor: 'dashboard', admin: 'dashboard' }[u.perfil];
    const itens = menuPermitido().flatMap(g => g.itens);
    if (itens.find(i => i.id === pref)) return pref;
    return itens.length ? itens[0].id : null;
  }
  function contadores() {
    const hoje = U.dataISO();
    const ags = DT.db.agendamentos();
    const S = DT.STATUS, G = DT.STATUS_GRUPOS;
    return {
      preparacao: ags.filter(a => a.data === hoje && G.finalizados.indexOf(a.status) < 0 && DT.ag.prepAtual(a) !== S.PRONTO).length,
      checkin: ags.filter(a => a.data === hoje && G.ativosPreChegada.indexOf(a.status) >= 0).length,
      atendimento: ags.filter(a => a.status === S.CHEGOU).length,
      entrega: ags.filter(a => a.status === S.EM_ATENDIMENTO || a.status === S.CARREGANDO).length
    };
  }
  function montarShell() {
    const u = DT.auth.usuarioAtual();
    const root = document.getElementById('app');
    root.innerHTML =
      '<div class="shell" id="shell">' +
        '<aside class="sidebar" id="sidebar" aria-label="Menu principal">' +
          '<div class="brand-mark"><div class="logo">' + ui.icon('truck') + '</div><div><b>Drive Thru</b><span>' + esc(DT.APP.subtitulo) + '</span></div></div>' +
          '<nav id="nav"></nav>' +
          '<div class="sidebar-foot"><span>' + esc(DT.db.settings().unidade) + '</span><span>v' + DT.APP.versao + (DT.db.estaPersistindo() ? '' : ' · dados só nesta sessão') + '</span>' +
            (DT.db.modoNuvem() ? '<span id="nuvem-status" class="nuvem-status" data-s="' + DT.nuvem.statusAtual() + '">Nuvem: sincronizado</span>' : '<span class="nuvem-status" data-s="local">Modo local (dados neste navegador)</span>') + '</div>' +
        '</aside>' +
        '<div class="main">' +
          '<header class="topbar">' +
            '<button type="button" class="icon-btn menu-btn" id="btn-menu" aria-label="Abrir menu">' + ui.icon('menu') + '</button>' +
            '<div class="topbar-title"><span class="eyebrow" id="tb-eyebrow"></span><h1 id="tb-title"></h1></div>' +
            '<div class="topbar-right">' +
              '<div class="clock"><b id="clk-h"></b><span id="clk-d"></span></div>' +
              '<button type="button" class="icon-btn" id="btn-tema" aria-label="Alternar tema claro/escuro" title="Tema claro/escuro">' + ui.icon('moon') + '</button>' +
              '<div class="user-chip"><div class="avatar">' + esc(ui.iniciais(u.nome)) + '</div><div class="who"><b>' + esc(u.nome) + '</b><span>' + esc(u.perfilNome) + '</span></div>' +
                '<button type="button" class="icon-btn" id="btn-senha" aria-label="Trocar minha senha" title="Trocar minha senha" style="width:32px;height:32px;border:0;background:none">' + ui.icon('key') + '</button>' +
                '<button type="button" class="icon-btn" id="btn-sair" aria-label="Sair" title="Sair" style="width:32px;height:32px;border:0;background:none">' + ui.icon('logout') + '</button></div>' +
            '</div>' +
          '</header>' +
          '<main class="content" id="view"></main>' +
        '</div>' +
      '</div>';
    document.getElementById('btn-sair').addEventListener('click', async () => {
      parar();
      try { await DT.auth.logout(); } catch (e) { /* segue para o login */ }
      history.replaceState(null, '', location.pathname + location.search);
      telaLogin();
    });
    document.getElementById('btn-tema').addEventListener('click', alternarTema);
    document.getElementById('btn-senha').addEventListener('click', () => abrirTrocaSenha(false));
    document.getElementById('btn-menu').addEventListener('click', () => document.getElementById('shell').classList.toggle('nav-open'));
    document.getElementById('shell').addEventListener('click', e => {
      const sh = document.getElementById('shell');
      if (!sh) return;   // a tela já foi trocada (ex.: saiu do sistema)
      if (sh.classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('#btn-menu')) sh.classList.remove('nav-open');
    });
    relogio();
    timerRelogio = setInterval(relogio, 1000);
  }
  function montarMenu() {
    const c = contadores();
    const nav = document.getElementById('nav');
    if (!nav) return;
    nav.innerHTML = menuPermitido().map(g =>
      '<div class="nav-group"><h4>' + esc(g.grupo) + '</h4>' + g.itens.map(i =>
        '<a class="nav-link' + (rotaAtual && rotaAtual.id === i.id ? ' active' : '') + '" href="#' + i.id + '">' + ui.icon(i.icon) + '<span>' + esc(i.label) + '</span>' +
        (c[i.id] ? '<span class="count">' + c[i.id] + '</span>' : '') + '</a>').join('') + '</div>').join('');
  }
  function relogio() {
    const h = document.getElementById('clk-h'), d = document.getElementById('clk-d');
    if (!h) return;
    const agora = new Date();
    h.textContent = U.horaHM(agora) + ':' + U.pad(agora.getSeconds());
    d.textContent = U.fmtData(U.dataISO(agora)) + ' · ' + U.diaSemana(U.dataISO(agora));
  }

  /* ------------------------------ Rotas ------------------------------ */
  function lerRota() {
    const h = (location.hash || '').replace(/^#/, '');
    const partes = h.split('/');
    return { id: partes[0] || '', param: partes.slice(1).join('/') || '' };
  }
  function ir(id, param) {
    const alvo = '#' + id + (param ? '/' + param : '');
    if (location.hash === alvo) render(); else location.hash = alvo;
  }
  function render() {
    const u = DT.auth.usuarioAtual();
    if (!u) { parar(); telaLogin(); return; }
    let r = lerRota();
    const todos = DT.MENU.flatMap(g => g.itens);
    let item = todos.find(i => i.id === r.id);
    if (!item || !DT.auth.pode(item.perm) || !DT.views[r.id]) {
      const ini = rotaInicial(u);
      if (!ini) { document.getElementById('view').innerHTML = ui.empty('Seu perfil não possui telas liberadas. Procure o administrador.', 'lock'); return; }
      if (r.id && item && !DT.auth.pode(item.perm)) ui.toast('Seu perfil não tem acesso a essa tela.', 'warn');
      history.replaceState(null, '', '#' + ini);
      r = { id: ini, param: '' };
      item = todos.find(i => i.id === ini);
    }
    rotaAtual = r;
    const v = DT.views[r.id];
    document.getElementById('tb-title').textContent = item.label;
    document.getElementById('tb-eyebrow').textContent = v.eyebrow || '';
    document.title = (v.titulo || 'Drive Thru') + ' · Drive Thru';
    const el = document.getElementById('view');
    el.innerHTML = '';
    v.render(el, r.param);
    document.getElementById('shell').classList.remove('nav-open');
    montarMenu();
    window.scrollTo(0, 0);
  }
  /* Atualiza telas "ao vivo" sem atrapalhar quem está digitando */
  function atualizarAoVivo() {
    montarMenu();
    if (!rotaAtual) return;
    const v = DT.views[rotaAtual.id];
    if (!v || !v.aoVivo) return;
    if (document.querySelector('.modal-back')) return;
    const ativo = document.activeElement;
    if (ativo && /INPUT|SELECT|TEXTAREA/.test(ativo.tagName)) return;
    if (v.refresh) v.refresh(); else render();
  }

  function parar() {
    clearInterval(timerRelogio); clearInterval(timerRefresh);
    timerRelogio = timerRefresh = null;
  }
  /* Página pública do cliente: #acompanhar ou #acompanhar-CODIGO */
  function rotaCliente() {
    const m = (location.hash || '').match(/^#acompanhar(?:-([A-Za-z0-9]+))?$/);
    return m ? (m[1] || '') : null;
  }
  function mostrarCliente(cod) {
    parar();
    rotaAtual = null;
    DT.cliente.render(document.getElementById('app'), cod.toUpperCase());
    window.scrollTo(0, 0);
  }

  function iniciar() {
    parar();
    const cod = rotaCliente();
    if (cod !== null) { mostrarCliente(cod); return; }
    DT.cliente.sair();
    if (!DT.auth.usuarioAtual()) { telaLogin(); return; }
    montarShell();
    render();
    timerRefresh = setInterval(atualizarAoVivo, 30000);
  }

  function telaCarregando(msg) {
    document.getElementById('app').innerHTML = '<div class="carregando"><div class="brand-mark"><div class="logo">' + ui.icon('truck') + '</div><div><b>Drive Thru</b><span>' + esc(DT.APP.subtitulo) + '</span></div></div>' +
      '<div class="row" style="gap:10px"><span class="spinner"></span><span>' + esc(msg) + '</span></div></div>';
  }

  /* Base vazia na nuvem: o primeiro administrador a entrar carrega a demonstração */
  async function prepararDemonstracao() {
    if (!DT.db.modoNuvem()) return;
    const u = DT.auth.usuarioAtual();
    if (DT.db.meta().seeded || !u || !DT.auth.pode('config.alterar')) return;
    telaCarregando('Primeiro acesso: preparando dados de demonstração…');
    DT.seed.executar(true);
    await DT.nuvem.enviar();
    ui.toast('Dados de demonstração carregados no servidor.');
  }

  async function boot() {
    aplicarTema();
    if (DT.db.modoNuvem()) {
      DT.nuvem.aoMudar(atualizarPorMudanca);
      const cod = rotaCliente();
      if (cod === null) telaCarregando('Conectando ao servidor…');
      try {
        await DT.nuvem.iniciar();
        if (cod === null && DT.nuvem.temSessao()) {
          const r = await DT.nuvem.prepararSessao();
          if (!r.ok) ui.toast(r.erro, 'err');
          else await prepararDemonstracao();
        }
      } catch (e) {
        console.error(e);
        if (cod === null) { telaLogin('Não foi possível conectar ao servidor. Verifique a internet e tente novamente.'); ligarEventos(); return; }
      }
    } else {
      DT.seed.executar(false);
    }
    ligarEventos();
    iniciar();
  }

  /* Alguém alterou dados em outro aparelho: atualiza menu e telas "ao vivo" */
  function atualizarPorMudanca() {
    if (!document.getElementById('view') || !DT.auth.usuarioAtual()) return;
    atualizarAoVivo();
  }

  let eventosLigados = false;
  function ligarEventos() {
    if (eventosLigados) return;
    eventosLigados = true;
    window.addEventListener('hashchange', () => {
      const cod = rotaCliente();
      if (cod !== null) { mostrarCliente(cod); return; }
      if (!document.getElementById('view')) {  // saiu da página do cliente
        if (DT.db.modoNuvem() && DT.nuvem.temSessao() && !DT.db.users().length) {
          telaCarregando('Carregando dados…');
          DT.nuvem.prepararSessao().then(iniciar, iniciar);
          return;
        }
        iniciar(); return;
      }
      if (DT.auth.usuarioAtual()) render();
    });
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-goto-pedido]');
      if (t) { e.preventDefault(); e.stopPropagation(); ir('pedido', t.dataset.gotoPedido); }
    });
  }

  return { boot, ir, render, montarMenu, rotaAtual: () => rotaAtual };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', DT.app.boot);
else DT.app.boot();
