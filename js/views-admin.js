/* =====================================================================
   Telas de Administração: Usuários e perfis · Funcionários · Configurações
   ===================================================================== */
window.DT = window.DT || {};
DT.views = DT.views || {};

/* ========================= USUÁRIOS E PERFIS ========================= */
DT.views.usuarios = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc;
  const view = { titulo: 'Usuários e perfis', eyebrow: 'Administração', aba: 'usuarios' };
  let el;

  view.render = function (c) { el = c; desenhar(); };

  function desenhar() {
    el.innerHTML = '<div class="tabs"><button type="button" class="tab' + (view.aba === 'usuarios' ? ' active' : '') + '" data-aba="usuarios">Usuários</button>' +
      '<button type="button" class="tab' + (view.aba === 'perfis' ? ' active' : '') + '" data-aba="perfis">Permissões por perfil</button></div><div id="us-conteudo"></div>';
    el.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => { view.aba = b.dataset.aba; desenhar(); }));
    if (view.aba === 'usuarios') usuarios(); else perfis();
  }

  function usuarios() {
    const perfisDef = DT.db.perfis();
    const lista = DT.db.users();
    const c = el.querySelector('#us-conteudo');
    c.innerHTML = '<section class="card"><div class="card-head"><h3>Usuários do sistema</h3><span class="spacer"></span><button type="button" class="btn primary sm" id="us-novo">' + ui.icon('plus', 'icon-sm') + 'Novo usuário</button></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th class="r">Ações</th></tr></thead><tbody>' +
      lista.map(u => '<tr><td><div class="row"><div class="avatar" style="width:28px;height:28px;font-size:11px">' + esc(ui.iniciais(u.nome)) + '</div><div><b>' + esc(u.nome) + '</b><div class="subtle">' + esc(u.email || '') + '</div></div></div></td>' +
        '<td class="mono">' + esc(u.login) + '</td><td>' + esc((perfisDef[u.perfil] || {}).nome || u.perfil) + '</td>' +
        '<td>' + (u.ativo ? '<span class="badge tone-green">Ativo</span>' : '<span class="badge tone-neutral">Inativo</span>') + '</td>' +
        '<td class="subtle">' + (u.ultimoAcesso ? U.fmtDataHora(u.ultimoAcesso) : 'nunca') + '</td>' +
        '<td class="r"><button type="button" class="btn ghost sm" data-edit="' + u.id + '">' + ui.icon('edit', 'icon-sm') + 'Editar</button></td></tr>').join('') +
      '</tbody></table></div></section>';
    c.querySelector('#us-novo').addEventListener('click', () => editar(null));
    c.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editar(b.dataset.edit)));
  }

  function editar(id) {
    const lista = DT.db.users();
    const u = id ? lista.find(x => x.id === id) : null;
    const eu = DT.auth.usuarioAtual();
    const perfisDef = DT.db.perfis();
    ui.modal({
      title: u ? 'Editar usuário' : 'Novo usuário',
      body: '<div class="fields-2">' +
        '<div class="field"><label for="uf-nome">Nome completo</label><input id="uf-nome" class="input" value="' + esc(u ? u.nome : '') + '"></div>' +
        '<div class="field"><label for="uf-login">Usuário (login)</label><input id="uf-login" class="input mono" value="' + esc(u ? u.login : '') + '"' + (u ? ' readonly' : '') + ' placeholder="nome.sobrenome"></div>' +
        '<div class="field"><label for="uf-email">E-mail</label><input id="uf-email" type="email" class="input" value="' + esc(u ? u.email || '' : '') + '"></div>' +
        '<div class="field"><label for="uf-perfil">Perfil</label><select id="uf-perfil" class="select"' + (u && u.id === eu.id ? ' disabled' : '') + '>' + ui.options(Object.keys(perfisDef).map(k => ({ value: k, label: perfisDef[k].nome })), u ? u.perfil : 'comercial') + '</select></div>' +
        '<div class="field"><label for="uf-senha">' + (u ? 'Nova senha <span class="subtle">(deixe vazio para manter)</span>' : 'Senha inicial') + '</label><input id="uf-senha" type="password" class="input" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="mín. ' + DT.SENHA.minimo + ' caracteres, Aa, 1 e símbolo"><span class="hint">Mínimo de ' + DT.SENHA.minimo + ' caracteres, com letra minúscula, maiúscula, número e símbolo.</span></div>' +
        '<div class="field"><label for="uf-senha2">Repita a senha</label><input id="uf-senha2" type="password" class="input" autocomplete="new-password" data-lpignore="true" data-1p-ignore></div>' +
        '<div class="field"><span class="label">Situação</span><label class="check" style="min-height:40px"><input type="checkbox" id="uf-ativo"' + (!u || u.ativo ? ' checked' : '') + (u && u.id === eu.id ? ' disabled' : '') + '> Usuário ativo</label></div>' +
        '</div><p class="subtle">Usuários não são excluídos para preservar o histórico; desative quando necessário.</p>',
      actions: [
        { label: 'Voltar', cls: 'ghost' },
        { label: 'Salvar', cls: 'primary', onClick: root => {
          const v = s => root.querySelector(s).value.trim();
          const nome = v('#uf-nome'), login = v('#uf-login').toLowerCase(), senha = root.querySelector('#uf-senha').value;
          if (!nome || !login) { ui.toast('Informe nome e usuário.', 'warn'); return false; }
          if (!/^[a-z0-9._-]{3,}$/.test(login)) { ui.toast('O usuário deve ter ao menos 3 caracteres (letras, números, ponto, hífen).', 'warn'); return false; }
          if (!u && lista.some(x => x.login === login)) { ui.toast('Já existe um usuário com esse login.', 'warn'); return false; }
          if (senha !== root.querySelector('#uf-senha2').value) { ui.toast('As duas senhas digitadas não são iguais. Digite de novo.', 'warn'); return false; }
          if (!u || senha) {
            const erroSenha = U.validarSenha(senha);
            if (erroSenha) { ui.toast(erroSenha, 'warn'); return false; }
          }
          const dados = { nome: nome, email: v('#uf-email'), perfil: root.querySelector('#uf-perfil').value, ativo: root.querySelector('#uf-ativo').checked };
          if (DT.db.modoNuvem()) {
            // Na nuvem, usuários e senhas são gravados pela função segura do servidor
            const btn = root.querySelector('.modal-foot .btn.primary');
            btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Salvando…';
            const pedido = u ? Object.assign({ acao: 'atualizar', id: u.id, senha: senha || undefined }, dados)
                             : Object.assign({ acao: 'criar', login: login, senha: senha }, dados);
            DT.nuvem.gerenciarUsuario(pedido).then(() => {
              DT.audit.registrar(u ? 'Alterou usuário' : 'Criou usuário', 'Usuário', u ? u.login : login,
                u ? u.perfil + (u.ativo ? '/ativo' : '/inativo') : null,
                dados.perfil + (dados.ativo ? '/ativo' : '/inativo') + (senha && u ? ' + senha redefinida' : ''));
              document.querySelectorAll('.modal-back').forEach(m => m.remove());
              ui.toast('Usuário salvo.');
              desenhar();
            }).catch(err => {
              btn.disabled = false; btn.textContent = 'Salvar';
              ui.toast(err.message || 'Não foi possível salvar o usuário.', 'err');
            });
            return false;
          }
          if (u) {
            const antes = u.perfil + (u.ativo ? '/ativo' : '/inativo');
            if (u.id === eu.id) { dados.perfil = u.perfil; dados.ativo = true; }
            Object.assign(u, dados);
            if (senha) u.senhaHash = U.hashSenha(u.login, senha);
            DT.db.set('users', lista);
            DT.audit.registrar('Alterou usuário', 'Usuário', u.login, antes, u.perfil + (u.ativo ? '/ativo' : '/inativo') + (senha ? ' + senha redefinida' : ''));
          } else {
            lista.push(Object.assign({ id: U.uid('usr'), login: login, senhaHash: U.hashSenha(login, senha), criadoEm: new Date().toISOString(), ultimoAcesso: null }, dados));
            DT.db.set('users', lista);
            DT.audit.registrar('Criou usuário', 'Usuário', login, null, dados.perfil);
          }
          ui.toast('Usuário salvo.');
          desenhar();
        }}
      ]
    });
  }

  function perfis() {
    const p = DT.db.perfis();
    const chaves = Object.keys(p);
    const c = el.querySelector('#us-conteudo');
    c.innerHTML = '<section class="card"><div class="card-head"><h3>Permissões por perfil</h3><span class="spacer"></span><button type="button" class="btn ghost sm" id="pf-padrao">Restaurar padrão</button><button type="button" class="btn primary sm" id="pf-salvar">Salvar permissões</button></div>' +
      '<div class="table-wrap"><table class="table perm-table"><thead><tr><th>Permissão</th>' + chaves.map(k => '<th>' + esc(p[k].nome) + '</th>').join('') + '</tr></thead><tbody>' +
      Object.keys(DT.PERMISSOES).map(perm => '<tr><td>' + esc(DT.PERMISSOES[perm]) + '<div class="subtle mono">' + perm + '</div></td>' + chaves.map(k =>
        '<td><input type="checkbox" aria-label="' + esc(p[k].nome + ': ' + DT.PERMISSOES[perm]) + '" data-perfil="' + k + '" data-perm="' + perm + '"' + (p[k].permissoes.indexOf(perm) >= 0 ? ' checked' : '') +
        (k === 'admin' && (perm === 'usuarios.gerenciar') ? ' disabled' : '') + '></td>').join('') + '</tr>').join('') +
      '</tbody></table></div></section>';
    c.querySelector('#pf-salvar').addEventListener('click', () => {
      const novo = DT.db.perfis();
      chaves.forEach(k => { novo[k].permissoes = []; });
      c.querySelectorAll('[data-perm]').forEach(i => { if (i.checked || i.disabled) novo[i.dataset.perfil].permissoes.push(i.dataset.perm); });
      const resumo = chaves.map(k => novo[k].nome + ': ' + novo[k].permissoes.length).join(' · ');
      DT.db.set('perfis', novo);
      DT.audit.registrar('Alterou permissões', 'Perfis', 'Matriz de permissões', null, resumo);
      ui.toast('Permissões salvas. Os menus já refletem a mudança.');
      DT.app.montarMenu();
    });
    c.querySelector('#pf-padrao').addEventListener('click', async () => {
      const r = await ui.confirmar({ titulo: 'Restaurar permissões padrão', mensagem: 'As permissões de todos os perfis voltam ao padrão do projeto.', ok: 'Restaurar' });
      if (!r.ok) return;
      DT.db.set('perfis', JSON.parse(JSON.stringify(DT.DEFAULT_PERFIS)));
      DT.audit.registrar('Restaurou permissões padrão', 'Perfis', 'Matriz de permissões', null, null);
      ui.toast('Permissões restauradas.');
      DT.app.montarMenu(); perfis();
    });
  }

  return view;
})();

/* ============================ FUNCIONÁRIOS ============================ */
DT.views.funcionarios = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc;
  const view = { titulo: 'Funcionários', eyebrow: 'Administração · Listas de responsáveis' };
  let el;
  const TAM_FOTO = 256;            // lado da foto salva (px)
  const MAX_ARQUIVO = 10 * 1024 * 1024;

  view.render = function (c) { el = c; desenhar(); };

  /* Foto ou iniciais do funcionário */
  function foto(f, cls) {
    if (f && f.foto) return '<img class="emp-photo ' + (cls || '') + '" src="' + f.foto + '" alt="Foto de ' + esc(f.nome) + '">';
    return '<span class="emp-photo emp-initials ' + (cls || '') + '" aria-hidden="true">' + esc(ui.iniciais(f ? f.nome : '')) + '</span>';
  }

  /* Lê a imagem, recorta no centro em formato quadrado e comprime em JPEG */
  function processarImagem(arquivo) {
    return new Promise((resolve, reject) => {
      if (!arquivo) { reject(new Error('Nenhum arquivo selecionado.')); return; }
      if (!/^image\//.test(arquivo.type)) { reject(new Error('Escolha um arquivo de imagem (JPG, PNG ou WEBP).')); return; }
      if (arquivo.size > MAX_ARQUIVO) { reject(new Error('A imagem tem mais de 10 MB. Escolha uma foto menor.')); return; }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagem não suportado.'));
        img.onload = () => {
          const lado = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - lado) / 2, sy = (img.naturalHeight - lado) / 2;
          const c = document.createElement('canvas');
          c.width = c.height = TAM_FOTO;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, TAM_FOTO, TAM_FOTO);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, lado, lado, 0, 0, TAM_FOTO, TAM_FOTO);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  function desenhar() {
    const lista = DT.db.funcionarios();
    const semFoto = lista.filter(f => f.ativo && !f.foto).length;
    el.innerHTML = '<div class="page-intro"><p>Os funcionários cadastrados aqui aparecem nas listas de responsável pelo atendimento, carregamento e agendamento, evitando digitação manual.</p></div>' +
      '<section class="card"><div class="card-head"><h3>Funcionários</h3>' + (semFoto ? '<span class="subtle">' + semFoto + ' ativo(s) sem foto</span>' : '') + '<span class="spacer"></span><button type="button" class="btn primary sm" id="fn-novo">' + ui.icon('plus', 'icon-sm') + 'Novo funcionário</button></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Função</th><th>Setor</th><th>Situação</th><th class="r">Ações</th></tr></thead><tbody>' +
      lista.map(f => '<tr><td><div class="row" style="flex-wrap:nowrap">' + foto(f) + '<b>' + esc(f.nome) + '</b></div></td><td>' + esc(f.funcao) + '</td><td>' + esc(f.setor) + '</td><td>' + (f.ativo ? '<span class="badge tone-green">Ativo</span>' : '<span class="badge tone-neutral">Inativo</span>') + '</td>' +
        '<td class="r"><button type="button" class="btn ghost sm" data-edit="' + f.id + '">' + ui.icon('edit', 'icon-sm') + 'Editar</button></td></tr>').join('') +
      '</tbody></table></div></section>';
    el.querySelector('#fn-novo').addEventListener('click', () => editar(null));
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editar(b.dataset.edit)));
  }

  function editar(id) {
    const lista = DT.db.funcionarios();
    const f = id ? lista.find(x => x.id === id) : null;
    let fotoAtual = f ? f.foto || null : null;

    function desenharFoto(root) {
      const nome = root.querySelector('#ff-nome').value.trim() || (f ? f.nome : '');
      root.querySelector('#ff-foto-prev').innerHTML = foto({ nome: nome, foto: fotoAtual }, 'emp-photo-lg');
      root.querySelector('#ff-foto-rem').hidden = !fotoAtual;
      root.querySelector('#ff-foto-btn-txt').textContent = fotoAtual ? 'Trocar foto' : 'Escolher foto';
    }
    async function receber(root, arquivo) {
      const aviso = root.querySelector('#ff-foto-msg');
      aviso.textContent = 'Processando imagem…';
      try {
        fotoAtual = await processarImagem(arquivo);
        aviso.textContent = 'Foto ajustada para ' + TAM_FOTO + '×' + TAM_FOTO + ' px. Clique em Salvar para gravar.';
      } catch (e) {
        aviso.textContent = e.message;
        ui.toast(e.message, 'warn');
      }
      desenharFoto(root);
    }

    ui.modal({
      title: f ? 'Editar funcionário' : 'Novo funcionário',
      body:
        '<div class="emp-photo-field">' +
          '<div id="ff-foto-prev" class="emp-drop" title="Arraste uma foto aqui"></div>' +
          '<div class="stack" style="gap:8px">' +
            '<span class="label">Foto do funcionário</span>' +
            '<div class="row">' +
              '<label class="btn ghost sm" for="ff-foto-in">' + ui.icon('user', 'icon-sm') + '<span id="ff-foto-btn-txt">Escolher foto</span></label>' +
              '<input type="file" id="ff-foto-in" accept="image/*" class="sr-only">' +
              '<button type="button" class="btn danger sm" id="ff-foto-rem" hidden>' + ui.icon('x', 'icon-sm') + 'Remover</button>' +
            '</div>' +
            '<span class="subtle" id="ff-foto-msg">JPG, PNG ou WEBP. A foto é recortada no centro e reduzida automaticamente. Também é possível arrastar a imagem para o círculo.</span>' +
          '</div>' +
        '</div>' +
        '<div class="fields-2"><div class="field"><label for="ff-nome">Nome</label><input id="ff-nome" class="input" value="' + esc(f ? f.nome : '') + '"></div>' +
        '<div class="field"><label for="ff-funcao">Função</label><input id="ff-funcao" class="input" value="' + esc(f ? f.funcao : '') + '" placeholder="Ex.: Conferente"></div>' +
        '<div class="field"><label for="ff-setor">Setor</label><select id="ff-setor" class="select">' + ui.options(['Logística', 'Comercial'], f ? f.setor : 'Logística') + '</select></div>' +
        '<div class="field"><span class="label">Situação</span><label class="check" style="min-height:40px"><input type="checkbox" id="ff-ativo"' + (!f || f.ativo ? ' checked' : '') + '> Ativo</label></div></div>',
      onOpen: root => {
        desenharFoto(root);
        root.querySelector('#ff-nome').addEventListener('input', () => { if (!fotoAtual) desenharFoto(root); });
        const input = root.querySelector('#ff-foto-in');
        input.addEventListener('change', () => { if (input.files[0]) receber(root, input.files[0]); input.value = ''; });
        root.querySelector('#ff-foto-rem').addEventListener('click', () => {
          fotoAtual = null;
          root.querySelector('#ff-foto-msg').textContent = 'Foto removida. Clique em Salvar para confirmar.';
          desenharFoto(root);
        });
        const drop = root.querySelector('#ff-foto-prev');
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', e => { const arq = e.dataTransfer.files && e.dataTransfer.files[0]; if (arq) receber(root, arq); });
      },
      actions: [
        { label: 'Voltar', cls: 'ghost' },
        { label: 'Salvar', cls: 'primary', onClick: root => {
          const nome = root.querySelector('#ff-nome').value.trim();
          if (!nome) { ui.toast('Informe o nome.', 'warn'); return false; }
          const dados = { nome: nome, funcao: root.querySelector('#ff-funcao').value.trim() || '—', setor: root.querySelector('#ff-setor').value, ativo: root.querySelector('#ff-ativo').checked, foto: fotoAtual };
          const fotoAntes = f ? !!f.foto : false;
          const fotoMudou = f ? f.foto !== fotoAtual : !!fotoAtual;
          if (f) { Object.assign(f, dados); DT.audit.registrar('Alterou funcionário', 'Funcionário', nome, null, dados.funcao + ' / ' + (dados.ativo ? 'ativo' : 'inativo')); }
          else { lista.push(Object.assign({ id: U.uid('fun') }, dados)); DT.audit.registrar('Cadastrou funcionário', 'Funcionário', nome, null, dados.funcao + ' / ' + dados.setor + (fotoAtual ? ' / com foto' : '')); }
          if (f && fotoMudou) DT.audit.registrar(fotoAtual ? (fotoAntes ? 'Trocou foto do funcionário' : 'Incluiu foto do funcionário') : 'Removeu foto do funcionário', 'Funcionário', nome, fotoAntes ? 'com foto' : 'sem foto', fotoAtual ? 'com foto' : 'sem foto');
          DT.db.set('funcionarios', lista);
          if (!DT.db.estaPersistindo()) ui.toast('Armazenamento indisponível: a foto vale só nesta sessão.', 'warn');
          else ui.toast('Funcionário salvo.');
          desenhar();
        }}
      ]
    });
  }

  return view;
})();

/* ============================ CONFIGURAÇÕES ============================ */
DT.views.config = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc;
  const view = { titulo: 'Configurações', eyebrow: 'Administração · Parâmetros operacionais' };
  let el;
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ROTULOS = {
    horaInicio: 'Horário inicial', horaFim: 'Horário final', intervaloMin: 'Intervalo entre horários', pedidosPorJanela: 'Pedidos por janela',
    maxVeiculosSimultaneos: 'Veículos simultâneos', antecedenciaMinMin: 'Antecedência mínima', diasFuncionamento: 'Dias de funcionamento',
    diasAgendaAFrente: 'Dias de agenda aberta', toleranciaMin: 'Tolerância', noShowMin: 'Prazo para não comparecimento',
    preparacaoCriticaMin: 'Aviso de preparação crítica', limiteItens: 'Limite de itens', docas: 'Docas', unidade: 'Unidade',
    lgpdModo: 'Exibição do termo LGPD', lgpdEncarregado: 'Encarregado de Dados (DPO)',
    rastreioAtivo: 'Localização do cliente a caminho', raioChegadaKm: 'Raio do alerta de chegada (km)'
  };

  view.render = function (c) { el = c; desenhar(); };

  function previa(cfg) {
    const ini = U.minutos(cfg.horaInicio), fim = U.minutos(cfg.horaFim), passo = Number(cfg.intervaloMin) || 30;
    const janelas = fim > ini ? Math.floor((fim - ini) / passo) : 0;
    const porHora = (60 / passo) * (Number(cfg.pedidosPorJanela) || 1);
    return '<b class="mono">' + janelas + '</b> janelas por dia · <b class="mono">' + (janelas * (Number(cfg.pedidosPorJanela) || 1)) + '</b> atendimentos/dia · <b class="mono">' + (Math.round(porHora * 10) / 10) + '</b> por hora';
  }

  function desenhar() {
    const cfg = DT.db.settings();
    el.innerHTML =
      '<div class="page-intro"><p>A capacidade da agenda não fica fixa no código. Ajuste aqui após a avaliação dos primeiros 30 dias de operação.</p></div>' +
      '<form id="cf-form" novalidate class="stack">' +
      '<div class="grid-2">' +
        '<section class="card"><div class="card-head"><h3>Janelas de atendimento</h3></div><div class="card-body">' +
          '<div class="fields-2">' +
            '<div class="field"><label for="cf-ini">Horário inicial</label><input type="time" id="cf-ini" class="input" value="' + cfg.horaInicio + '"></div>' +
            '<div class="field"><label for="cf-fim">Horário final</label><input type="time" id="cf-fim" class="input" value="' + cfg.horaFim + '"></div>' +
            '<div class="field"><label for="cf-int">Intervalo entre horários (min)</label><input type="number" min="10" max="240" step="5" id="cf-int" class="input" value="' + cfg.intervaloMin + '"></div>' +
            '<div class="field"><label for="cf-ppj">Pedidos por janela</label><input type="number" min="1" max="20" id="cf-ppj" class="input" value="' + cfg.pedidosPorJanela + '"></div>' +
            '<div class="field"><label for="cf-vs">Máx. veículos simultâneos</label><input type="number" min="1" max="20" id="cf-vs" class="input" value="' + cfg.maxVeiculosSimultaneos + '"></div>' +
            '<div class="field"><label for="cf-ant">Antecedência mínima (min)</label><input type="number" min="0" max="1440" step="5" id="cf-ant" class="input" value="' + cfg.antecedenciaMinMin + '"></div>' +
          '</div>' +
          '<div class="field"><span class="label">Dias de funcionamento</span><div class="row">' + DIAS.map((d, i) =>
            '<label class="check"><input type="checkbox" data-dia="' + i + '"' + (cfg.diasFuncionamento.indexOf(i) >= 0 ? ' checked' : '') + '> ' + d + '</label>').join('') + '</div></div>' +
          '<div class="notice info">' + ui.icon('info') + '<div id="cf-previa">' + previa(cfg) + '</div></div>' +
        '</div></section>' +
        '<section class="card"><div class="card-head"><h3>Regras e alertas</h3></div><div class="card-body">' +
          '<div class="fields-2">' +
            '<div class="field"><label for="cf-dias">Dias de agenda aberta à frente</label><input type="number" min="1" max="60" id="cf-dias" class="input" value="' + cfg.diasAgendaAFrente + '"></div>' +
            '<div class="field"><label for="cf-tol">Tolerância de chegada (min)</label><input type="number" min="0" max="120" id="cf-tol" class="input" value="' + cfg.toleranciaMin + '"><span class="hint">Define chegada antecipada/atrasada.</span></div>' +
            '<div class="field"><label for="cf-ns">Alerta de não comparecimento (min)</label><input type="number" min="5" max="240" id="cf-ns" class="input" value="' + cfg.noShowMin + '"><span class="hint">Após o horário agendado.</span></div>' +
            '<div class="field"><label for="cf-pc">Preparação crítica (min)</label><input type="number" min="5" max="240" id="cf-pc" class="input" value="' + cfg.preparacaoCriticaMin + '"><span class="hint">Faltando esse tempo e o pedido não estiver pronto.</span></div>' +
            '<div class="field"><label for="cf-lim">Limite de itens por pedido</label><input type="number" min="0" id="cf-lim" class="input" value="' + cfg.limiteItens + '"><span class="hint">0 = sem limite.</span></div>' +
            '<div class="field"><label for="cf-un">Unidade</label><input id="cf-un" class="input" value="' + esc(cfg.unidade) + '"></div>' +
            '<div class="field"><label for="cf-lgpd">Termo LGPD após o login</label><select id="cf-lgpd" class="select">' +
              ui.options([{ value: 'cada_login', label: 'Exibir a cada login' }, { value: 'uma_vez', label: 'Exibir uma vez (e quando o termo mudar)' }], cfg.lgpdModo || 'cada_login') + '</select>' +
              '<span class="hint">Versão atual do termo: ' + esc(DT.LGPD.versao) + ' · <button type="button" class="btn link sm" id="cf-lgpd-ver" style="padding:0">ver termo</button></span></div>' +
            '<div class="field"><label for="cf-dpo">Contato do Encarregado de Dados (DPO)</label><input id="cf-dpo" class="input" value="' + esc(cfg.lgpdEncarregado || '') + '" placeholder="Ex.: Nome — dpo@empresa.com.br"><span class="hint">Aparece no termo LGPD.</span></div>' +
            '<div class="field"><label for="cf-rast">Cliente compartilha a localização a caminho</label><select id="cf-rast" class="select">' +
              ui.options([{ value: 'sim', label: 'Permitir (botão "Estou a caminho")' }, { value: 'nao', label: 'Desativado' }], cfg.rastreioAtivo === false ? 'nao' : 'sim') + '</select>' +
              '<span class="hint">Local do CD: ' + (cfg.localCD ? '<span class="mono">' + cfg.localCD.lat.toFixed(5) + ', ' + cfg.localCD.lng.toFixed(5) + '</span>' : '<b>não definido</b>') + ' · <a href="#mapa">definir no Mapa de chegadas</a></span></div>' +
            '<div class="field"><label for="cf-raio">Alerta "cliente chegando" (km)</label><input type="number" min="0.3" max="30" step="0.1" id="cf-raio" class="input" value="' + (cfg.raioChegadaKm || 2) + '"><span class="hint">A equipe é avisada quando o cliente entra nesse raio.</span></div>' +
          '</div>' +
          '<div class="field"><label for="cf-docas">Docas do Drive Thru (uma por linha)</label><textarea id="cf-docas" class="textarea">' + esc(cfg.docas.join('\n')) + '</textarea></div>' +
        '</div></section>' +
      '</div>' +
      '<div class="row end"><button type="button" class="btn ghost" id="cf-reset">Restaurar padrão do projeto</button><button type="submit" class="btn primary lg">' + ui.icon('check') + 'Salvar configurações</button></div>' +
      '</form>' +
      '<div id="cf-aparencia"></div>' +
      '<section class="card"><div class="card-head"><h3>Dados do sistema</h3></div><div class="card-body">' +
        (DT.db.modoNuvem() ? '<p class="muted">Os dados ficam no banco de dados na nuvem (Supabase) e são compartilhados por todos os usuários, em tempo real.</p>' :
          '<p class="muted">Nesta versão os dados ficam salvos neste navegador' + (DT.db.estaPersistindo() ? '' : ' (o armazenamento está bloqueado: os dados valem só para esta sessão)') + '. A integração com banco de dados e ERP substitui essa camada sem mudar as telas.</p>') +
        '<div class="row"><button type="button" class="btn ghost" id="cf-demo">' + ui.icon('refresh') + 'Recriar dados de demonstração</button>' +
        '<button type="button" class="btn danger" id="cf-limpar">' + ui.icon('ban') + 'Começar operação real (apagar agendamentos)</button></div>' +
      '</div></section>';

    DT.aparencia.montarConfig(el.querySelector('#cf-aparencia'));
    const f = el.querySelector('#cf-form');
    const ler = () => ({
      horaInicio: f.querySelector('#cf-ini').value, horaFim: f.querySelector('#cf-fim').value,
      intervaloMin: Number(f.querySelector('#cf-int').value), pedidosPorJanela: Number(f.querySelector('#cf-ppj').value),
      maxVeiculosSimultaneos: Number(f.querySelector('#cf-vs').value), antecedenciaMinMin: Number(f.querySelector('#cf-ant').value),
      diasFuncionamento: Array.from(f.querySelectorAll('[data-dia]')).filter(i => i.checked).map(i => Number(i.dataset.dia)),
      diasAgendaAFrente: Number(f.querySelector('#cf-dias').value), toleranciaMin: Number(f.querySelector('#cf-tol').value),
      noShowMin: Number(f.querySelector('#cf-ns').value), preparacaoCriticaMin: Number(f.querySelector('#cf-pc').value),
      limiteItens: Number(f.querySelector('#cf-lim').value) || 0, unidade: f.querySelector('#cf-un').value.trim() || cfg.unidade,
      lgpdModo: f.querySelector('#cf-lgpd').value, lgpdEncarregado: f.querySelector('#cf-dpo').value.trim(),
      rastreioAtivo: f.querySelector('#cf-rast').value !== 'nao', raioChegadaKm: Math.min(30, Math.max(0.3, Number(f.querySelector('#cf-raio').value) || 2)),
      docas: f.querySelector('#cf-docas').value.split('\n').map(s => s.trim()).filter(Boolean)
    });
    el.querySelector('#cf-lgpd-ver').addEventListener('click', () => DT.lgpd.visualizar());
    f.addEventListener('input', () => { try { el.querySelector('#cf-previa').innerHTML = previa(ler()); } catch (e) { /* campos incompletos */ } });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const n = ler();
      if (!n.horaInicio || !n.horaFim || U.minutos(n.horaFim) <= U.minutos(n.horaInicio)) { ui.toast('O horário final deve ser depois do inicial.', 'warn'); return; }
      if (!(n.intervaloMin >= 10 && n.intervaloMin <= 240)) { ui.toast('Intervalo deve ficar entre 10 e 240 minutos.', 'warn'); return; }
      if (!(n.pedidosPorJanela >= 1)) { ui.toast('Informe ao menos 1 pedido por janela.', 'warn'); return; }
      if (!(n.maxVeiculosSimultaneos >= 1)) { ui.toast('Informe ao menos 1 veículo simultâneo.', 'warn'); return; }
      if (!n.diasFuncionamento.length) { ui.toast('Selecione ao menos um dia de funcionamento.', 'warn'); return; }
      if (!n.docas.length) { ui.toast('Cadastre ao menos uma doca.', 'warn'); return; }
      const antes = DT.db.settings();
      const mudou = Object.keys(n).filter(k => JSON.stringify(antes[k]) !== JSON.stringify(n[k]));
      if (!mudou.length) { ui.toast('Nenhuma alteração para salvar.', 'warn'); return; }
      DT.db.set('settings', Object.assign({}, antes, n));
      mudou.forEach(k => {
        const fmt = v => Array.isArray(v) ? (k === 'diasFuncionamento' ? v.map(i => DIAS[i]).join(', ') : v.join(', ')) : String(v);
        DT.audit.registrar('Alterou parâmetro: ' + (ROTULOS[k] || k), 'Configuração', k, fmt(antes[k]), fmt(n[k]));
      });
      ui.toast('Configurações salvas. A agenda já usa os novos parâmetros.');
      desenhar();
    });
    el.querySelector('#cf-reset').addEventListener('click', async () => {
      const r = await ui.confirmar({ titulo: 'Restaurar padrão', mensagem: 'Os parâmetros voltam ao padrão inicial do projeto (20 janelas, 2 atendimentos por hora).', ok: 'Restaurar' });
      if (!r.ok) return;
      DT.db.set('settings', Object.assign(JSON.parse(JSON.stringify(DT.DEFAULT_SETTINGS)), { localCD: DT.db.settings().localCD || null }));
      DT.audit.registrar('Restaurou parâmetros padrão', 'Configuração', 'Todos', null, null);
      ui.toast('Parâmetros restaurados.'); desenhar();
    });
    el.querySelector('#cf-demo').addEventListener('click', async () => {
      const r = await ui.confirmar({ titulo: 'Recriar dados de demonstração', perigo: true, ok: 'Recriar', mensagem: DT.db.modoNuvem() ? 'Agendamentos, funcionários, configurações e auditoria do servidor serão substituídos por dados de demonstração novos, para todos os usuários. Os usuários e senhas são mantidos.' : 'Todos os dados deste navegador (agendamentos, usuários, configurações e auditoria) serão substituídos por dados de demonstração novos. Você precisará entrar novamente.' });
      if (!r.ok) return;
      DT.seed.executar(true);
      if (DT.db.modoNuvem()) {
        await DT.nuvem.enviar();
        ui.toast('Dados de demonstração recriados no servidor.');
        DT.app.render();
        return;
      }
      DT.session.clear();
      history.replaceState(null, '', location.pathname + location.search);
      DT.app.render();
    });
    el.querySelector('#cf-limpar').addEventListener('click', async () => {
      const r = await ui.confirmar({ titulo: 'Começar operação real', perigo: true, ok: 'Apagar agendamentos', pedirMotivo: true, labelMotivo: 'Digite APAGAR para confirmar',
        mensagem: 'Remove todos os agendamentos e a auditoria de demonstração. Usuários, funcionários e configurações são mantidos.' });
      if (!r.ok) return;
      if (r.motivo.toUpperCase() !== 'APAGAR') { ui.toast('Confirmação incorreta. Nada foi apagado.', 'warn'); return; }
      DT.seed.limparOperacao();
      DT.audit.registrar('Iniciou operação real (dados de demonstração removidos)', 'Sistema', '', null, null);
      ui.toast('Agendamentos removidos. Sistema pronto para a operação.');
      DT.app.montarMenu();
    });
  }

  return view;
})();
