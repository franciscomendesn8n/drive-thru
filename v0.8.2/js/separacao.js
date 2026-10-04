/* =====================================================================
   DRIVE THRU — Modo de separação e conferência
   ---------------------------------------------------------------------
   O Administrador escolhe, em Configurações, como as etapas
   "Em preparação → Separado → Conferido" são registradas:
     manual  · pela tela Preparação (como sempre foi)
     erp     · lidas do ERP/WMS (o coletor continua no sistema da empresa)
     coletor · no Modo coletor, bipando o pedido e cada produto
     bipe    · no Modo coletor, cada bipe do pedido avança uma etapa
   A escolha fica em dt_config (chave 'separacao') e vale para todos.
   Somente o perfil Administrador pode trocar (o servidor também confere).
   ===================================================================== */
DT.separacao = (function () {
  const S = DT.STATUS;
  const ETAPAS_COLETOR = [S.EM_PREPARACAO, S.SEPARADO, S.CONFERIDO];
  const ETAPAS_ERP = [S.EM_PREPARACAO, S.SEPARADO, S.CONFERIDO, S.FATURADO, S.PRONTO];
  const MODOS = [
    { id: 'manual', titulo: 'Manual (como hoje)', icone: 'box',
      desc: 'A equipe avança cada etapa na tela Preparação, clicando nos botões.',
      muda: 'Nada muda: é o funcionamento atual.' },
    { id: 'erp', titulo: 'Status vindo do ERP / WMS', icone: 'refresh',
      desc: 'O coletor continua no sistema da empresa. O Drive Thru lê no ERP, a cada minuto, em que etapa cada pedido do dia está.',
      muda: 'Na Preparação, as etapas vindas do ERP deixam de ter botão e mostram "Aguarda ERP". Exige a integração com o ERP ativa.' },
    { id: 'coletor', titulo: 'Coletor — conferência item a item', icone: 'scan',
      desc: 'No Modo coletor, o operador bipa o pedido e cada produto, na separação e de novo na conferência. O sistema avisa produto errado ou quantidade a mais.',
      muda: 'Aparece o menu "Modo coletor". Separado e Conferido só são registrados pelo coletor; faturamento e liberação continuam na Preparação.' },
    { id: 'bipe', titulo: 'Coletor — bipe do pedido', icone: 'scan',
      desc: 'No Modo coletor, cada bipe do código do pedido avança uma etapa: início da separação, separado e conferido. Sem conferência item a item.',
      muda: 'Aparece o menu "Modo coletor". Bipes repetidos em poucos segundos são ignorados e o último bipe pode ser desfeito.' }
  ];
  const ERP_DEMO = { campo: 'status_separacao', valores: { 'Em preparação': 'EM SEPARACAO', 'Separado': 'SEPARADO', 'Conferido': 'CONFERIDO', 'Faturado': 'FATURADO', 'Pronto para retirada': '' } };
  const PADRAO = { modo: 'manual', exigirConferenteDiferente: false, permitirDivergencia: true, intervaloBipeSeg: 10,
    erp: { campo: '', valores: { 'Em preparação': '', 'Separado': '', 'Conferido': '', 'Faturado': '', 'Pronto para retirada': '' } } };

  const copia = o => JSON.parse(JSON.stringify(o));
  function config() {
    const c = Object.assign(copia(PADRAO), DT.db.get('separacao') || {});
    c.erp = Object.assign(copia(PADRAO.erp), c.erp || {});
    c.erp.valores = Object.assign(copia(PADRAO.erp.valores), c.erp.valores || {});
    return c;
  }
  function modo() { const m = config().modo; return MODOS.some(x => x.id === m) ? m : 'manual'; }
  function infoModo(id) { return MODOS.find(m => m.id === (id || modo())) || MODOS[0]; }
  function usaColetor() { const m = modo(); return m === 'coletor' || m === 'bipe'; }
  const lista = s => String(s || '').split(/[,;\n]/).map(x => x.trim().toUpperCase()).filter(Boolean);

  /* Quem registra esta etapa no modo atual? null = a tela Preparação (manual) */
  function quemRegistra(etapa) {
    const m = modo();
    if ((m === 'coletor' || m === 'bipe') && ETAPAS_COLETOR.indexOf(etapa) >= 0) return 'pelo coletor';
    if (m === 'erp' && ETAPAS_ERP.indexOf(etapa) >= 0 && lista(config().erp.valores[etapa]).length) return 'pelo ERP';
    return null;
  }
  const ehAdmin = () => { const u = DT.auth.usuarioAtual(); return !!(u && u.perfil === 'admin'); };

  /* ---------------- perfis: inclui a permissão do coletor ---------------- */
  function migrarPerfis() {
    const p = DT.db.get('perfis');
    if (!p || p.coletor) return;
    if (!(ehAdmin() || DT.auth.pode('usuarios.gerenciar'))) return;
    const novo = copia(p);
    novo.coletor = copia(DT.DEFAULT_PERFIS.coletor);
    ['logistica', 'admin'].forEach(k => { if (novo[k] && novo[k].permissoes.indexOf('coletor.operar') < 0) novo[k].permissoes.push('coletor.operar'); });
    DT.db.set('perfis', novo);
    DT.audit.registrar('Incluiu permissão do coletor', 'Perfis', 'Operador de coletor', null, 'coletor.operar em Logística e Administrador');
  }

  /* ---------------- modo ERP: sincronismo das etapas ---------------- */
  let timer = null, ultimo = null, ocupado = false;
  async function sincronizar(forcar) {
    if (modo() !== 'erp' || !DT.db.modoNuvem() || !DT.nuvem || !DT.nuvem.erpAcao) return null;
    if (ocupado) return null;
    ocupado = true;
    try {
      const r = await DT.nuvem.erpAcao('sincronizarSeparacao', { forcar: !!forcar });
      if (!r.ignorado) ultimo = { ts: new Date().toISOString(), atualizados: r.atualizados || [], verificados: r.verificados || 0, erros: r.erros || [] };
      return r;
    } catch (e) {
      ultimo = { ts: new Date().toISOString(), erro: e.message, atualizados: [], verificados: 0, erros: [] };
      throw e;
    } finally { ocupado = false; }
  }
  function ultimoSincronismo() { return ultimo; }
  function aoEntrar() {
    migrarPerfis();
    parar();
    timer = setInterval(() => { sincronizar(false).catch(() => {}); }, 60000);
    setTimeout(() => { sincronizar(false).catch(() => {}); }, 3000);
  }
  function parar() { if (timer) clearInterval(timer); timer = null; }

  /* ---------------- salvar (somente Administrador) ---------------- */
  function emAndamento() {
    return DT.db.agendamentos().filter(a => DT.STATUS_GRUPOS.finalizados.indexOf(a.status) < 0 &&
      [S.EM_PREPARACAO, S.SEPARADO, S.CONFERIDO].indexOf(DT.ag.prepAtual(a)) >= 0);
  }
  function salvar(novo) {
    if (!ehAdmin()) return { ok: false, erro: 'Somente o Administrador pode trocar o modo de separação e conferência.' };
    const antes = config();
    const c = Object.assign(copia(PADRAO), novo);
    c.alteradoEm = new Date().toISOString();
    c.alteradoPor = (DT.auth.usuarioAtual() || {}).nome || '';
    DT.db.set('separacao', c);
    const mudouModo = antes.modo !== c.modo;
    DT.audit.registrar(mudouModo ? 'Alterou modo de separação e conferência' : 'Ajustou opções de separação e conferência',
      'Configuração', 'separacao', infoModo(antes.modo).titulo, infoModo(c.modo).titulo);
    if (mudouModo) { ultimo = null; aoEntrar(); }
    return { ok: true, mudouModo: mudouModo };
  }

  /* ---------------- cartão em Configurações ---------------- */
  function montarConfig(box) {
    const ui = DT.ui, esc = DT.util.esc, U = DT.util;
    const admin = ehAdmin();
    let rasc = config();
    let testeMsg = '';

    function desenhar() {
      const atual = config();
      const m = rasc.modo;
      box.innerHTML = '<section class="card" id="sep-card"><div class="card-head"><h3>Separação e conferência</h3><span class="spacer"></span>' +
        '<span class="subtle">Modo em uso: </span><span class="tag sim">' + esc(infoModo(atual.modo).titulo) + '</span></div><div class="card-body stack">' +
        (admin ? '<p class="muted" style="margin:0">Escolha como as etapas <b>Em preparação → Separado → Conferido</b> são registradas. A escolha vale para todos os usuários assim que for salva.</p>'
          : '<div class="notice info">' + ui.icon('lock') + '<div>Somente o <b>Administrador</b> pode trocar o modo de trabalho. Abaixo, o modo em uso.</div></div>') +
        '<div class="sep-modos" role="radiogroup" aria-label="Modo de separação e conferência">' + MODOS.map(o =>
          '<label class="sep-modo' + (m === o.id ? ' sel' : '') + (admin ? '' : ' bloq') + '"><input type="radio" name="sep-modo" value="' + o.id + '"' + (m === o.id ? ' checked' : '') + (admin ? '' : ' disabled') + '>' +
          '<span class="sep-ic">' + ui.icon(o.icone) + '</span><span class="sep-tx"><b>' + esc(o.titulo) + (atual.modo === o.id ? ' <span class="tag">em uso</span>' : '') + '</b>' +
          '<span>' + esc(o.desc) + '</span><span class="subtle">' + esc(o.muda) + '</span></span></label>').join('') + '</div>' +
        opcoes(m) +
        (atual.alteradoEm ? '<span class="hint">Última alteração: ' + esc(U.fmtDataHora(atual.alteradoEm)) + (atual.alteradoPor ? ' por ' + esc(atual.alteradoPor) : '') + '</span>' : '') +
        (admin ? '<div class="row end"><button type="button" class="btn primary lg" id="sep-salvar">' + ui.icon('check') + 'Salvar modo de trabalho</button></div>' : '') +
        '</div></section>';
      ligar();
    }
    function opcoes(m) {
      const dis = admin ? '' : ' disabled';
      if (m === 'coletor') return '<div class="ap-bloco"><h4>Opções da conferência item a item</h4>' +
        '<label class="check"><input type="checkbox" id="sep-difer"' + (rasc.exigirConferenteDiferente ? ' checked' : '') + dis + '> Exigir que a conferência seja feita por outra pessoa (não por quem separou)</label>' +
        '<label class="check"><input type="checkbox" id="sep-diverg"' + (rasc.permitirDivergencia !== false ? ' checked' : '') + dis + '> Permitir finalizar com divergência (falta de produto), informando o motivo</label>' +
        '<span class="hint">Os produtos são reconhecidos pelo código de barras (EAN) ou pelo código do produto. Com o ERP ativo, configure o campo "Código de barras (EAN)" no de-para dos itens.</span></div>';
      if (m === 'bipe') return '<div class="ap-bloco"><h4>Opções do bipe do pedido</h4>' +
        '<div class="field" style="max-width:320px"><label for="sep-int">Ignorar bipe repetido do mesmo pedido por (segundos)</label><input type="number" min="3" max="120" id="sep-int" class="input" value="' + (rasc.intervaloBipeSeg || 10) + '"' + dis + '></div></div>';
      if (m === 'erp') {
        const erpOk = DT.erpConfig && DT.erpConfig.ativa();
        return '<div class="ap-bloco"><h4>Etapas lidas do ERP</h4>' +
          (!DT.db.modoNuvem() ? '<div class="notice warn">' + ui.icon('alert') + '<div>Este modo só funciona com o banco na nuvem (servidor).</div></div>' : '') +
          (!erpOk ? '<div class="notice warn">' + ui.icon('alert') + '<div>A <b>Integração com o ERP</b> não está ativa. Ative-a acima antes de usar este modo.</div></div>' : '') +
          '<p class="muted" style="margin:0">Informe o campo do pedido no ERP que traz a etapa da separação e os valores que correspondem a cada etapa do Drive Thru (separe valores por vírgula). Etapas sem valor continuam na tela Preparação.</p>' +
          '<div class="field"><label for="sep-campo">Campo do status de separação no ERP</label><input id="sep-campo" class="input mono" value="' + esc(rasc.erp.campo) + '" placeholder="ex.: status_separacao" spellcheck="false"' + dis + '></div>' +
          '<div class="fields-2">' + ETAPAS_ERP.map((e, i) => '<div class="field"><label for="sep-v' + i + '">' + esc(e) + '</label><input id="sep-v' + i + '" data-etapa="' + esc(e) + '" class="input mono" value="' + esc(rasc.erp.valores[e] || '') + '" placeholder="' + (e === S.PRONTO ? '(fica na Preparação)' : 'valor no ERP') + '"' + dis + '></div>').join('') + '</div>' +
          (admin ? '<div class="row wrap"><button type="button" class="btn sm" id="sep-demo">' + ui.icon('play') + 'Preencher para o ERP de demonstração</button>' +
            (DT.db.modoNuvem() && erpOk ? '<input id="sep-t-num" class="input mono" inputmode="numeric" placeholder="Nº do pedido" style="max-width:150px"><button type="button" class="btn sm" id="sep-testar">' + ui.icon('search') + 'Ver etapa no ERP</button>' : '') + '</div>' : '') +
          '<div id="sep-t-msg">' + testeMsg + '</div>' +
          '<span class="hint">O sistema consulta o ERP a cada minuto (pedidos do dia) e só avança etapas — nunca volta. Correções continuam possíveis na Preparação.</span></div>';
      }
      return '';
    }
    function lerOpcoes() {
      const q = s => box.querySelector(s);
      if (q('#sep-difer')) rasc.exigirConferenteDiferente = q('#sep-difer').checked;
      if (q('#sep-diverg')) rasc.permitirDivergencia = q('#sep-diverg').checked;
      if (q('#sep-int')) rasc.intervaloBipeSeg = Math.min(120, Math.max(3, Number(q('#sep-int').value) || 10));
      if (q('#sep-campo')) {
        rasc.erp.campo = q('#sep-campo').value.trim();
        box.querySelectorAll('[data-etapa]').forEach(i => { rasc.erp.valores[i.dataset.etapa] = i.value.trim(); });
      }
    }
    function ligar() {
      if (!admin) return;
      box.querySelectorAll('input[name="sep-modo"]').forEach(r => r.addEventListener('change', () => { lerOpcoes(); rasc.modo = r.value; testeMsg = ''; desenhar(); }));
      const dm = box.querySelector('#sep-demo');
      if (dm) dm.addEventListener('click', () => { lerOpcoes(); rasc.erp = copia(ERP_DEMO); desenhar(); });
      const ts = box.querySelector('#sep-testar');
      if (ts) ts.addEventListener('click', async () => {
        lerOpcoes();
        const n = box.querySelector('#sep-t-num').value.replace(/\D/g, '');
        if (!n) { ui.toast('Informe o número de um pedido.', 'warn'); return; }
        if (!rasc.erp.campo) { ui.toast('Informe o campo do status de separação.', 'warn'); return; }
        box.querySelector('#sep-t-msg').innerHTML = '<p class="muted"><span class="spinner"></span> Consultando o ERP…</p>';
        try {
          const r = await DT.nuvem.erpAcao('testar', { numero: n });
          if (r.erro) testeMsg = '<div class="notice crit">' + ui.icon('alert') + '<div>' + esc(r.erro) + '</div></div>';
          else if (!r.encontrado) testeMsg = '<div class="notice warn">' + ui.icon('search') + '<div>Pedido ' + esc(n) + ' não encontrado no ERP.</div></div>';
          else {
            const dados = JSON.parse(r.bruto || 'null'), cfgErp = DT.erpConfig.salva() || {};
            let raiz = DT.erpNucleo.obter(dados, cfgErp.raiz || ''); if (Array.isArray(raiz)) raiz = raiz[0];
            const v = raiz ? DT.erpNucleo.obter(raiz, rasc.erp.campo) : undefined;
            const etapa = v == null ? null : ETAPAS_ERP.slice().reverse().find(e => lista(rasc.erp.valores[e]).indexOf(String(v).trim().toUpperCase()) >= 0);
            testeMsg = v === undefined ? '<div class="notice warn">' + ui.icon('alert') + '<div>O campo <span class="mono">' + esc(rasc.erp.campo) + '</span> não existe no pedido ' + esc(n) + '.</div></div>'
              : '<div class="notice ' + (etapa ? 'ok' : 'info') + '">' + ui.icon(etapa ? 'check' : 'info') + '<div>Pedido ' + esc(n) + ': o ERP informa <b class="mono">' + esc(String(v)) + '</b> → ' + (etapa ? 'etapa <b>' + esc(etapa) + '</b> no Drive Thru.' : 'nenhuma etapa (valor não mapeado).') + '</div></div>';
          }
        } catch (e) { testeMsg = '<div class="notice crit">' + ui.icon('alert') + '<div>' + esc(e.message) + '</div></div>'; }
        desenhar();
      });
      box.querySelector('#sep-salvar').addEventListener('click', async () => {
        lerOpcoes();
        const atual = config();
        if (rasc.modo === 'erp') {
          if (!DT.db.modoNuvem()) { ui.toast('O modo "Status vindo do ERP" exige o banco na nuvem.', 'warn'); return; }
          if (!(DT.erpConfig && DT.erpConfig.ativa())) { ui.toast('Ative a Integração com o ERP antes de escolher este modo.', 'warn', 8000); return; }
          if (!rasc.erp.campo || !ETAPAS_ERP.some(e => lista(rasc.erp.valores[e]).length)) { ui.toast('Informe o campo do status e o valor de ao menos uma etapa.', 'warn'); return; }
        }
        if (JSON.stringify(Object.assign({}, atual, { alteradoEm: 0, alteradoPor: 0 })) === JSON.stringify(Object.assign({}, rasc, { alteradoEm: 0, alteradoPor: 0 }))) { ui.toast('Nenhuma alteração para salvar.', 'warn'); return; }
        if (atual.modo !== rasc.modo) {
          const and = emAndamento();
          const r = await ui.confirmar({ titulo: 'Trocar o modo de trabalho', ok: 'Trocar modo',
            mensagem: 'De <b>' + esc(infoModo(atual.modo).titulo) + '</b> para <b>' + esc(infoModo(rasc.modo).titulo) + '</b>. A mudança vale na hora para todos os usuários.' +
              (and.length ? '<br><br><b>' + and.length + ' pedido(s) estão em separação ou conferência agora</b> (' + and.slice(0, 6).map(a => esc(a.pedido.numero)).join(', ') + (and.length > 6 ? '…' : '') + '). Eles continuam de onde pararam, já no novo modo.' : '<br><br>Nenhum pedido está em separação ou conferência neste momento.') });
          if (!r.ok) return;
        }
        const res = salvar(rasc);
        if (!res.ok) { ui.toast(res.erro, 'err'); return; }
        ui.toast(res.mudouModo ? 'Modo de trabalho alterado para "' + infoModo(rasc.modo).titulo + '".' : 'Opções salvas.');
        DT.app.montarMenu();
        rasc = config(); desenhar();
      });
    }
    desenhar();
  }

  return { MODOS, ETAPAS_COLETOR, ETAPAS_ERP, ERP_DEMO, config, modo, infoModo, usaColetor, quemRegistra, ehAdmin,
    migrarPerfis, sincronizar, ultimoSincronismo, aoEntrar, parar, salvar, emAndamento, montarConfig };
})();
