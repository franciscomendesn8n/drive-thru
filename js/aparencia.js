/* =====================================================================
   Aparência (layout personalizável)
   ---------------------------------------------------------------------
   Logo da empresa, cores do menu lateral, cor dos botões, cores e textos
   da tela de login. Ajustado pelo Administrador em Configurações.
   • Gravado em dt_config (chave 'aparencia') e sincronizado em tempo real.
   • Lido também sem login (função pública dt_aparencia), porque a tela de
     login e a página do cliente aparecem antes de qualquer acesso.
   • Uma cópia fica no navegador para a tela já abrir com o visual certo.
   ===================================================================== */
window.DT = window.DT || {};

DT.aparencia = (function () {
  const CACHE = DT.APP.storagePrefix + 'aparencia_cache';
  const PADRAO = {
    logo: null,                              // null = logo padrão do projeto (img/logo-condor.png)
    menuFundo: '#303A42',
    menuTexto: '#D3D8DD',
    menuDestaque: '#AB0F14',
    botao: '#1C5EC4',
    loginFundo: '#303A42',
    loginDestaque: '#AB0F14',
    loginTitulo: 'Agendamento e controle da',
    loginTituloDestaque: 'retirada',
    loginTexto: 'Do pedido agendado pelo Comercial até a mercadoria carregada no veículo do cliente, com cada etapa registrada.',
    loginEtapas: true,
    loginCardTitulo: 'Entrar no sistema',
    loginCardTexto: 'Use seu usuário e senha. O menu é liberado conforme o seu perfil.'
  };
  const CORES = ['menuFundo', 'menuTexto', 'menuDestaque', 'botao', 'loginFundo', 'loginDestaque'];
  const LIMITES = { loginTitulo: 60, loginTituloDestaque: 30, loginTexto: 220, loginCardTitulo: 40, loginCardTexto: 160 };
  let publico = null;                        // lido do servidor sem login

  /* ---------------------------- cores ---------------------------- */
  function hexOk(h) { return typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h); }
  function rgb(h) { return [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)); }
  function hex(r) { return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function misturar(a, b, k) { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * k)); }
  function luminancia(h) {
    return rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  function contraste(a, b) { const l1 = luminancia(a), l2 = luminancia(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function escuro(h) { return luminancia(h) < 0.32; }
  /* texto legível sobre uma cor: branco ou grafite */
  function textoSobre(h) { return contraste(h, '#FFFFFF') >= contraste(h, '#14181C') ? '#FFFFFF' : '#14181C'; }

  /* ---------------------------- dados ---------------------------- */
  function lerCache() { try { const v = localStorage.getItem(CACHE); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function gravarCache(a) { try { localStorage.setItem(CACHE, JSON.stringify(a)); } catch (e) { /* armazenamento cheio ou bloqueado */ } }
  function limpo(a) {
    const out = Object.assign({}, PADRAO);
    if (!a || typeof a !== 'object') return out;
    Object.keys(PADRAO).forEach(k => {
      const v = a[k];
      if (v === undefined || v === null || v === '') return;
      if (CORES.indexOf(k) >= 0) { if (hexOk(v)) out[k] = v.toUpperCase(); return; }
      if (k === 'logo') { if (/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v) && v.length < 900000) out.logo = v; return; }
      if (k === 'loginEtapas') { out.loginEtapas = v !== false; return; }
      out[k] = String(v).slice(0, LIMITES[k] || 200);
    });
    return out;
  }
  function salva() { return (DT.db && DT.db.get('aparencia')) || publico || lerCache(); }
  function atual() { return limpo(salva()); }
  function logo(a) { a = a || atual(); return a.logo || DT.APP.empresa.logo; }

  /* ---------------------------- aplicar ---------------------------- */
  function variaveis(a) {
    const mf = a.menuFundo, md = a.menuDestaque, bt = a.botao, lf = a.loginFundo, ld = a.loginDestaque;
    const v = {
      '--nav': mf,
      '--nav-2': escuro(mf) ? misturar(mf, '#FFFFFF', 0.1) : misturar(mf, '#000000', 0.07),
      '--nav-ink': a.menuTexto,
      '--nav-ink-strong': escuro(mf) ? '#FFFFFF' : '#14181C',
      '--nav-muted': escuro(mf) ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.45)',
      '--nav-line': escuro(mf) ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
      '--brand': md,
      '--brand-ink': textoSobre(md),
      '--login-bg': lf,
      '--login-ink': escuro(lf) ? '#D3D8DD' : '#3B4650',
      '--login-ink-strong': escuro(lf) ? '#FFFFFF' : '#14181C',
      '--login-line': escuro(lf) ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.14)',
      '--login-brand': ld,
      '--login-brand-ink': textoSobre(ld)
    };
    if (bt !== PADRAO.botao) {   // cor dos botões personalizada (vale no tema claro e no escuro)
      v['--accent'] = bt;
      v['--accent-hover'] = escuro(bt) ? misturar(bt, '#FFFFFF', 0.14) : misturar(bt, '#000000', 0.12);
      v['--accent-ink'] = textoSobre(bt);
      v['--accent-soft'] = 'color-mix(in srgb, ' + bt + ' 14%, var(--surface))';
    }
    return v;
  }
  let aplicadas = [];
  function aplicar(a) {
    if (!a) { const s = DT.db && DT.db.get('aparencia'); if (s) gravarCache(s); }
    a = a ? limpo(a) : atual();
    const st = document.documentElement.style;
    aplicadas.forEach(k => st.removeProperty(k));
    const v = variaveis(a);
    Object.keys(v).forEach(k => st.setProperty(k, v[k]));
    aplicadas = Object.keys(v);
    document.querySelectorAll('img[data-logo-empresa]').forEach(i => { if (i.getAttribute('src') !== logo(a)) i.src = logo(a); });
    return a;
  }

  /* Sem login: lê a aparência pública no servidor (modo nuvem) */
  async function carregarPublico() {
    if (!(DT.db.modoNuvem() && DT.nuvem && DT.nuvem.aparenciaPublica)) return;
    try {
      const r = await Promise.race([DT.nuvem.aparenciaPublica(), new Promise(res => setTimeout(() => res(undefined), 4000))]);
      if (r !== undefined) { publico = r || {}; gravarCache(publico); aplicar(); }
    } catch (e) { /* sem conexão: segue com a cópia local */ }
  }

  function salvar(a) {
    const antes = atual();
    const novo = limpo(a);
    const guardar = {};
    Object.keys(PADRAO).forEach(k => { if (JSON.stringify(novo[k]) !== JSON.stringify(PADRAO[k])) guardar[k] = novo[k]; });
    DT.db.set('aparencia', guardar);
    publico = guardar; gravarCache(guardar);
    aplicar(novo);
    const mud = Object.keys(PADRAO).filter(k => JSON.stringify(antes[k]) !== JSON.stringify(novo[k]));
    const nomes = { logo: 'logo', menuFundo: 'fundo do menu', menuTexto: 'texto do menu', menuDestaque: 'destaque do menu', botao: 'cor dos botões',
      loginFundo: 'fundo do login', loginDestaque: 'destaque do login', loginTitulo: 'título do login', loginTituloDestaque: 'palavra em destaque',
      loginTexto: 'texto do login', loginEtapas: 'etapas no login', loginCardTitulo: 'título do acesso', loginCardTexto: 'texto do acesso' };
    if (mud.length) DT.audit.registrar('Alterou aparência (layout)', 'Configuração', 'aparencia', null, mud.map(k => nomes[k]).join(', '));
    return mud.length;
  }

  /* ---------------------------- logo ---------------------------- */
  /* Reduz a imagem (até 640 x 240 px) e devolve PNG em base64, mantendo a transparência */
  function prepararLogo(arquivo) {
    return new Promise((resolve, reject) => {
      if (!arquivo || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) { reject(new Error('Use uma imagem PNG, JPG, WEBP ou SVG.')); return; }
      if (arquivo.size > 5 * 1024 * 1024) { reject(new Error('Imagem muito grande (máximo de 5 MB).')); return; }
      const leitor = new FileReader();
      leitor.onload = () => {
        const img = new Image();
        img.onload = () => {
          const w0 = img.naturalWidth || 640, h0 = img.naturalHeight || 240;
          const k = Math.min(1, 640 / w0, 240 / h0);
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/png');
          if (url.length > 900000) { reject(new Error('A logo ficou grande demais depois de ajustada. Tente uma imagem mais simples.')); return; }
          resolve(url);
        };
        img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
        img.src = leitor.result;
      };
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.readAsDataURL(arquivo);
    });
  }

  /* ---------------------------- seção em Configurações ---------------------------- */
  function montarConfig(box) {
    const ui = DT.ui, esc = DT.util.esc;
    let rasc = atual();
    const cor = (id, rot, val, dica) => '<div class="field ap-cor"><label for="' + id + '">' + rot + '</label>' +
      '<div class="ap-cor-row"><input type="color" id="' + id + '" value="' + val + '"><input class="input mono" data-hex="' + id + '" value="' + val + '" maxlength="7" spellcheck="false" aria-label="' + rot + ' (código)"></div>' +
      (dica ? '<span class="hint">' + dica + '</span>' : '') + '</div>';
    const txt = (id, rot, val, max, area) => '<div class="field"><label for="' + id + '">' + rot + '</label>' +
      (area ? '<textarea id="' + id + '" class="textarea" maxlength="' + max + '" rows="3">' + esc(val) + '</textarea>' : '<input id="' + id + '" class="input" maxlength="' + max + '" value="' + esc(val) + '">') + '</div>';

    function desenhar() {
      box.innerHTML =
        '<section class="card" id="ap-card"><div class="card-head"><h3>Aparência (layout)</h3><span class="spacer"></span><span class="subtle">Logo, cores e textos da tela de login</span></div>' +
        '<div class="card-body ap-grid">' +
          '<div class="stack">' +
            '<div class="ap-bloco"><h4>Logo da empresa</h4>' +
              '<div class="ap-logo-row"><div class="ap-logo-prev" id="ap-logo-prev"><img data-logo-empresa alt="Logo atual" src="' + esc(logo(rasc)) + '"></div>' +
              '<div class="stack" style="gap:8px"><label class="btn ghost sm" for="ap-logo-in" style="cursor:pointer">' + ui.icon('download') + 'Escolher logo</label>' +
                '<input type="file" id="ap-logo-in" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>' +
                '<button type="button" class="btn ghost sm" id="ap-logo-padrao"' + (rasc.logo ? '' : ' disabled') + '>Usar logo padrão</button></div></div>' +
              '<span class="hint">PNG com fundo transparente fica melhor. A logo aparece no menu, no login, na página do cliente e nos PDFs. Como o menu costuma ser escuro, prefira a versão clara (branca) da logo.</span>' +
              '<div id="ap-logo-msg"></div></div>' +
            '<div class="ap-bloco"><h4>Menu lateral</h4><div class="fields-3">' +
              cor('ap-mf', 'Fundo', rasc.menuFundo) + cor('ap-mt', 'Texto', rasc.menuTexto) + cor('ap-md', 'Destaque', rasc.menuDestaque, 'Item ativo e contadores') +
            '</div><div id="ap-av-menu"></div></div>' +
            '<div class="ap-bloco"><h4>Botões</h4><div class="fields-3">' + cor('ap-bt', 'Cor dos botões', rasc.botao, 'O texto (branco ou escuro) é escolhido automaticamente') + '</div></div>' +
            '<div class="ap-bloco"><h4>Tela de login — cores</h4><div class="fields-3">' +
              cor('ap-lf', 'Fundo da apresentação', rasc.loginFundo) + cor('ap-ld', 'Destaque', rasc.loginDestaque, 'Palavra em destaque, faixa e números') +
            '</div>' +
              '<label class="row" style="gap:8px;margin-top:4px"><input type="checkbox" id="ap-etapas"' + (rasc.loginEtapas ? ' checked' : '') + '> Mostrar as 8 etapas do processo</label><div id="ap-av-login"></div></div>' +
            '<div class="ap-bloco"><h4>Tela de login — textos</h4><div class="fields-2">' +
              txt('ap-t1', 'Título', rasc.loginTitulo, LIMITES.loginTitulo) + txt('ap-t2', 'Palavra em destaque (fim do título)', rasc.loginTituloDestaque, LIMITES.loginTituloDestaque) + '</div>' +
              txt('ap-t3', 'Texto de apresentação', rasc.loginTexto, LIMITES.loginTexto, true) +
              '<div class="fields-2">' + txt('ap-t4', 'Título do quadro de acesso', rasc.loginCardTitulo, LIMITES.loginCardTitulo) + txt('ap-t5', 'Texto do quadro de acesso', rasc.loginCardTexto, LIMITES.loginCardTexto) + '</div></div>' +
          '</div>' +
          '<div class="ap-prev-col"><span class="eyebrow">Prévia da tela de login</span><div class="ap-prev" id="ap-prev"></div>' +
            '<span class="eyebrow" style="margin-top:14px">Prévia do menu e dos botões</span><div class="ap-prev-menu" id="ap-prev-menu"></div>' +
            '<p class="subtle">As cores do menu e dos botões já aparecem no sistema enquanto você ajusta. Se sair sem salvar, voltam ao que estava.</p></div>' +
        '</div>' +
        '<div class="card-body row end" style="border-top:1px solid var(--line)">' +
          '<button type="button" class="btn ghost" id="ap-reset">Restaurar padrão Condor</button>' +
          '<button type="button" class="btn primary lg" id="ap-salvar">' + ui.icon('check') + 'Salvar aparência</button></div></section>';
      ligar(); previa();
    }

    function ler() {
      const q = s => box.querySelector(s);
      return Object.assign({}, rasc, {
        menuFundo: q('#ap-mf').value, menuTexto: q('#ap-mt').value, menuDestaque: q('#ap-md').value, botao: q('#ap-bt').value,
        loginFundo: q('#ap-lf').value, loginDestaque: q('#ap-ld').value, loginEtapas: q('#ap-etapas').checked,
        loginTitulo: q('#ap-t1').value.trim(), loginTituloDestaque: q('#ap-t2').value.trim(), loginTexto: q('#ap-t3').value.trim(),
        loginCardTitulo: q('#ap-t4').value.trim(), loginCardTexto: q('#ap-t5').value.trim()
      });
    }
    function previa() {
      rasc = limpo(ler());
      aplicar(rasc);
      const a = rasc;
      box.querySelector('#ap-prev').innerHTML =
        '<div class="ap-mini-login"><div class="ap-mini-brand" style="background:' + a.loginFundo + ';color:' + (escuro(a.loginFundo) ? '#D3D8DD' : '#3B4650') + '">' +
          '<img src="' + esc(logo(a)) + '" alt="">' +
          '<b style="color:' + (escuro(a.loginFundo) ? '#fff' : '#14181C') + '">' + esc(a.loginTitulo) + ' <em style="background:' + a.loginDestaque + ';color:' + textoSobre(a.loginDestaque) + '">' + esc(a.loginTituloDestaque) + '</em></b>' +
          '<p>' + esc(a.loginTexto) + '</p>' +
          (a.loginEtapas ? '<div class="ap-mini-steps">' + [1, 2, 3, 4].map(n => '<i><s style="background:' + a.loginDestaque + ';color:' + textoSobre(a.loginDestaque) + '">0' + n + '</s></i>').join('') + '</div>' : '') +
          '<span class="ap-mini-stripe" style="background:repeating-linear-gradient(-45deg,' + a.loginDestaque + ' 0 8px,transparent 8px 16px)"></span></div>' +
        '<div class="ap-mini-panel"><b>' + esc(a.loginCardTitulo) + '</b><p>' + esc(a.loginCardTexto) + '</p><i></i><i></i><span style="background:' + a.botao + ';color:' + textoSobre(a.botao) + '">Entrar</span></div></div>';
      box.querySelector('#ap-prev-menu').innerHTML =
        '<div class="ap-mini-side" style="background:' + a.menuFundo + ';color:' + a.menuTexto + '"><img src="' + esc(logo(a)) + '" alt="">' +
          '<span class="on" style="box-shadow:inset 3px 0 0 ' + a.menuDestaque + ';background:' + (escuro(a.menuFundo) ? misturar(a.menuFundo, '#FFFFFF', 0.1) : misturar(a.menuFundo, '#000000', 0.07)) + ';color:' + (escuro(a.menuFundo) ? '#fff' : '#14181C') + '">Novo agendamento <s style="background:' + a.menuDestaque + ';color:' + textoSobre(a.menuDestaque) + '">3</s></span>' +
          '<span>Agenda de retiradas</span><span>Dashboard</span></div>' +
        '<div class="ap-mini-btns"><span style="background:' + a.botao + ';color:' + textoSobre(a.botao) + '">Confirmar agendamento</span><span class="gh" style="color:' + a.botao + ';border-color:' + a.botao + '">Ver agenda</span></div>';
      // avisos de legibilidade
      const av = [];
      if (contraste(a.menuTexto, a.menuFundo) < 4.5) av.push('O texto do menu tem pouco contraste com o fundo e pode ficar difícil de ler.');
      if (contraste(textoSobre(a.botao), a.botao) < 4.5) av.push('A cor dos botões tem pouco contraste com o texto.');
      box.querySelector('#ap-av-menu').innerHTML = av.length ? ui.notice('warn', av.map(esc).join('<br>')) : '';
      box.querySelector('#ap-av-login').innerHTML = (!escuro(a.loginFundo) || !escuro(a.menuFundo)) ?
        ui.notice('info', 'Fundo claro: uma logo branca pode não aparecer. Use uma logo escura (ou colorida) ou escolha um fundo escuro.') : '';
      const pad = box.querySelector('#ap-logo-padrao'); if (pad) pad.disabled = !a.logo;
    }
    function ligar() {
      box.querySelectorAll('input[type=color]').forEach(c => c.addEventListener('input', () => {
        const t = box.querySelector('[data-hex="' + c.id + '"]'); if (t) t.value = c.value.toUpperCase(); previa();
      }));
      box.querySelectorAll('[data-hex]').forEach(t => t.addEventListener('input', () => {
        const v = t.value.trim(); const ok = /^#?[0-9a-fA-F]{6}$/.test(v);
        t.classList.toggle('invalido', !ok);
        if (ok) { box.querySelector('#' + t.dataset.hex).value = (v[0] === '#' ? v : '#' + v).toLowerCase(); previa(); }
      }));
      box.querySelectorAll('#ap-t1,#ap-t2,#ap-t3,#ap-t4,#ap-t5,#ap-etapas').forEach(i => i.addEventListener('input', previa));
      box.querySelector('#ap-etapas').addEventListener('change', previa);
      box.querySelector('#ap-logo-in').addEventListener('change', async e => {
        const f = e.target.files[0]; e.target.value = '';
        const msg = box.querySelector('#ap-logo-msg');
        try { rasc.logo = await prepararLogo(f); msg.innerHTML = ''; box.querySelector('#ap-logo-prev img').src = rasc.logo; previa(); }
        catch (err) { msg.innerHTML = ui.notice('crit', esc(err.message)); }
      });
      box.querySelector('#ap-logo-padrao').addEventListener('click', () => { rasc.logo = null; box.querySelector('#ap-logo-prev img').src = logo(rasc); previa(); });
      box.querySelector('#ap-reset').addEventListener('click', async () => {
        const r = await ui.confirmar({ titulo: 'Restaurar padrão', mensagem: 'Logo, cores e textos voltam ao padrão Condor. A alteração só vale depois de salvar.', ok: 'Restaurar' });
        if (!r.ok) return;
        rasc = Object.assign({}, PADRAO); desenhar();
      });
      box.querySelector('#ap-salvar').addEventListener('click', () => {
        const a = limpo(ler());
        if (!a.loginTitulo || !a.loginCardTitulo) { ui.toast('Preencha o título do login e o título do quadro de acesso.', 'warn'); return; }
        const n = salvar(a);
        ui.toast(n ? 'Aparência salva. Todos os usuários verão o novo layout.' : 'Nenhuma alteração para salvar.', n ? 'ok' : 'warn');
        rasc = atual(); desenhar();
      });
    }
    desenhar();
  }

  // ao abrir: aplica o que estiver guardado (cópia local ou dados já carregados)
  aplicar();

  return { PADRAO, atual, logo, aplicar, salvar, carregarPublico, montarConfig, prepararLogo, contraste, textoSobre, limpo };
})();
