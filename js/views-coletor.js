/* =====================================================================
   DRIVE THRU — Modo coletor
   ---------------------------------------------------------------------
   Tela para o coletor de dados (Android com leitor de código de barras).
   O leitor funciona como teclado: "digita" o código e envia Enter.
   • Modo "bipe do pedido": cada bipe avança uma etapa
     (Em preparação → Separado → Conferido).
   • Modo "item a item": bipa o pedido e depois cada produto, na
     separação e de novo na conferência.
   ===================================================================== */
DT.views = DT.views || {};
DT.views.coletor = (function () {
  const U = DT.util, ui = DT.ui, esc = U.esc, S = DT.STATUS, G = DT.STATUS_GRUPOS;
  const view = { titulo: 'Modo coletor', eyebrow: 'Logística · Separação e conferência por bipe', aoVivo: false };
  let el;
  let agId = null;            // pedido aberto (item a item)
  let fb = null;              // último retorno { tipo, titulo, texto }
  let historico = [];         // últimos bipes (bipe do pedido)
  let ultimoBipe = null;      // { numero, ts } para ignorar repetição
  let semTeclado = false;     // esconde o teclado da tela (leitor físico)

  view.render = function (c) { el = c; desenhar(); };
  const naTela = () => el && document.body.contains(el) && /^#coletor/.test(location.hash);
  window.addEventListener('online', () => { if (naTela()) desenhar(); });
  window.addEventListener('offline', () => { if (naTela()) desenhar(); });

  /* ---------------- som e vibração ---------------- */
  let audio = null;
  function som(ok) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const tons = ok ? [[1046, 0, 0.09]] : [[220, 0, 0.18], [220, 0.24, 0.18]];
      tons.forEach(([f, ini, dur]) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = f; o.type = ok ? 'sine' : 'square';
        g.gain.value = 0.12; o.connect(g); g.connect(audio.destination);
        o.start(audio.currentTime + ini); o.stop(audio.currentTime + ini + dur);
      });
    } catch (e) { /* sem áudio */ }
    try { if (navigator.vibrate) navigator.vibrate(ok ? 60 : [120, 80, 120]); } catch (e) { /* sem vibração */ }
  }
  function retorno(tipo, titulo, texto) { fb = { tipo: tipo, titulo: titulo, texto: texto || '' }; som(tipo === 'ok'); }

  const user = () => DT.auth.usuarioAtual() || { id: null, nome: '' };
  const cfg = () => DT.separacao.config();
  const hoje = () => U.dataISO();
  const fases = { separacao: 'Separação', conferencia: 'Conferência' };

  /* ---------------- pedido ---------------- */
  function localizar(numero) {
    const ag = DT.ag.ativoDoPedido(numero);
    if (!ag) return { erro: 'Pedido ' + numero + ' não tem retirada agendada no Drive Thru.' };
    if (G.finalizados.indexOf(ag.status) >= 0) return { erro: 'Pedido ' + numero + ' já está finalizado (' + ag.status + ').' };
    return { ag: ag };
  }
  function infoData(ag) { return ag.data === hoje() ? 'retirada hoje às ' + ag.hora : 'retirada em ' + U.fmtData(ag.data) + ' às ' + ag.hora; }

  /* ---------------- modo: bipe do pedido ---------------- */
  function biparPedido(numero) {
    const l = localizar(numero);
    if (l.erro) { retorno('err', 'Pedido não liberado', l.erro); return; }
    const ag = l.ag, agora = Date.now();
    if (ultimoBipe && ultimoBipe.numero === numero && agora - ultimoBipe.ts < (cfg().intervaloBipeSeg || 10) * 1000) {
      retorno('warn', 'Bipe repetido ignorado', 'O pedido ' + numero + ' acabou de ser bipado. Aguarde alguns segundos para bipar de novo.'); return;
    }
    const prox = DT.ag.proximaEtapa(ag), de = DT.ag.prepAtual(ag);
    if (!prox || DT.separacao.quemRegistra(prox) !== 'pelo coletor') {
      retorno('warn', 'Pedido já conferido', 'O pedido ' + numero + ' está em "' + de + '". Faturamento e liberação são feitos na tela Preparação.'); return;
    }
    const r = DT.ag.avancarPreparacao(ag.id, null, { origem: 'coletor' });
    if (!r.ok) { retorno('err', 'Não registrado', r.erro); return; }
    ultimoBipe = { numero: numero, ts: agora };
    historico.unshift({ agId: ag.id, numero: numero, cliente: ag.pedido.cliente, de: de, para: prox, ts: new Date().toISOString() });
    historico = historico.slice(0, 15);
    retorno('ok', prox === S.EM_PREPARACAO ? 'Separação iniciada' : prox, 'Pedido ' + numero + ' · ' + ag.pedido.cliente + ' · ' + infoData(ag));
  }
  async function desfazer() {
    const h = historico[0];
    if (!h) return;
    const ag = DT.db.agendamentoPorId(h.agId);
    if (!ag || DT.ag.prepAtual(ag) !== h.para) { ui.toast('O pedido já mudou de etapa; não é possível desfazer.', 'warn'); return; }
    if (Date.now() - Date.parse(h.ts) > 120000) { ui.toast('Só é possível desfazer até 2 minutos depois do bipe. Peça a correção na Preparação.', 'warn'); return; }
    const r = DT.ag.voltarPreparacao(ag.id, 'Bipe desfeito no coletor', { origem: 'coletor' });
    if (!r.ok) { ui.toast(r.erro, 'err'); return; }
    historico.shift(); ultimoBipe = null;
    fb = { tipo: 'warn', titulo: 'Bipe desfeito', texto: 'Pedido ' + h.numero + ' voltou para "' + h.de + '".' };
    desenhar();
  }

  /* ---------------- modo: item a item ---------------- */
  function faseDe(ag) {
    const p = DT.ag.prepAtual(ag);
    if (p === S.AGENDADO || p === S.EM_PREPARACAO) return 'separacao';
    if (p === S.SEPARADO) return 'conferencia';
    return null;
  }
  function abrirPedido(numero) {
    const l = localizar(numero);
    if (l.erro) { retorno('err', 'Pedido não liberado', l.erro); return; }
    const ag = l.ag, fase = faseDe(ag);
    if (!fase) { retorno('warn', 'Pedido já conferido', 'O pedido ' + numero + ' está em "' + DT.ag.prepAtual(ag) + '". Faturamento e liberação são feitos na tela Preparação.'); return; }
    const c = ag.coleta = ag.coleta || { separacao: {}, conferencia: {}, divergencias: [] };
    c.separacao = c.separacao || {}; c.conferencia = c.conferencia || {}; c.divergencias = c.divergencias || [];
    if (fase === 'conferencia' && cfg().exigirConferenteDiferente && c.separacaoPor && c.separacaoPor.id === user().id) {
      retorno('err', 'Conferência por outra pessoa', 'Você separou o pedido ' + numero + '. A conferência precisa ser feita por outro operador.'); return;
    }
    c.fase = fase;
    ag.alteradoEm = new Date().toISOString();
    DT.db.salvarAgendamento(ag);          // grava a contagem antes de avançar a etapa
    if (DT.ag.prepAtual(ag) === S.AGENDADO) {
      const r = DT.ag.avancarPreparacao(ag.id, null, { origem: 'coletor' });
      if (!r.ok) { retorno('err', 'Não registrado', r.erro); return; }
    }
    agId = ag.id;
    const itens = (ag.pedido.itens || []).length;
    retorno('ok', fases[fase] + ' do pedido ' + numero, ag.pedido.cliente + ' · ' + itens + ' produto(s) · ' + infoData(ag) + '. Bipe os produtos.');
  }
  const limpa = s => String(s || '').replace(/\s/g, '').toUpperCase();
  const semZeros = s => /^\d+$/.test(s) ? s.replace(/^0+/, '') : s;
  function codigosDoItem(item, pedido) {
    const cs = [item.ean, item.sku];
    if (pedido.origem !== 'erp' && item.sku) cs.push(DT.erpNucleo.eanDe(item.sku));   // base de demonstração
    return cs.map(limpa).filter(Boolean);
  }
  function itemPorCodigo(ag, codigo) {
    const c = semZeros(limpa(codigo));
    return (ag.pedido.itens || []).findIndex(i => codigosDoItem(i, ag.pedido).some(x => semZeros(x) === c));
  }
  function totais(ag) {
    const c = ag.coleta, f = c.fase, itens = ag.pedido.itens || [];
    const lidos = itens.reduce((s, i, k) => s + Math.min(Number(i.qtd) || 0, c[f][k] || 0), 0);
    const total = itens.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
    return { lidos: lidos, total: total, completo: itens.length > 0 && itens.every((i, k) => (c[f][k] || 0) >= (Number(i.qtd) || 0)) };
  }
  function biparItem(ag, idx, qtd) {
    const c = ag.coleta, f = c.fase, item = ag.pedido.itens[idx];
    const atual = c[f][idx] || 0, pedido = Number(item.qtd) || 0;
    if (atual + qtd > pedido) { retorno('err', 'Quantidade acima do pedido', item.descricao + ': já ' + (f === 'separacao' ? 'separados' : 'conferidos') + ' ' + atual + ' de ' + pedido + ' ' + item.un + '. Não some mais.'); return; }
    c[f][idx] = atual + qtd;
    const porChave = f === 'separacao' ? 'separacaoPor' : 'conferenciaPor';
    if (!c[porChave]) c[porChave] = { id: user().id, nome: user().nome, inicio: new Date().toISOString() };
    ag.alteradoEm = new Date().toISOString(); ag.alteradoPor = user().nome;
    DT.db.salvarAgendamento(ag);
    const t = totais(ag);
    if (t.completo) retorno('ok', 'Todos os itens ' + (f === 'separacao' ? 'separados' : 'conferidos'), 'Pedido ' + ag.pedido.numero + ': ' + t.lidos + '/' + t.total + '. Toque em "Finalizar".');
    else retorno('ok', '+' + qtd + ' ' + item.un + ' · ' + item.descricao, (c[f][idx] >= pedido ? 'Item completo. ' : c[f][idx] + ' de ' + pedido + ' ' + item.un + '. ') + 'Pedido: ' + t.lidos + '/' + t.total + '.');
  }
  function finalizar(ag, obs) {
    const f = ag.coleta.fase;
    const r = DT.ag.avancarPreparacao(ag.id, { obs: obs || (f === 'separacao' ? 'separação completa' : 'conferência completa') }, { origem: 'coletor' });
    if (!r.ok) { retorno('err', 'Não registrado', r.erro); return false; }
    const atual = r.ag;                    // objeto gravado pelo avanço (no modo local, uma cópia nova)
    const porChave = f === 'separacao' ? 'separacaoPor' : 'conferenciaPor';
    if (atual.coleta && atual.coleta[porChave]) atual.coleta[porChave].fim = new Date().toISOString();
    if (atual.coleta) atual.coleta.fase = f === 'separacao' ? 'conferencia' : 'concluida';
    DT.db.salvarAgendamento(atual);
    agId = null;
    retorno('ok', f === 'separacao' ? 'Pedido separado' : 'Pedido conferido', 'Pedido ' + atual.pedido.numero + ' → ' + atual.prep + '. Bipe o próximo pedido.');
    return true;
  }
  async function finalizarComDivergencia(ag) {
    const f = ag.coleta.fase, itens = ag.pedido.itens || [];
    const faltas = itens.map((i, k) => ({ sku: i.sku, descricao: i.descricao, pedido: Number(i.qtd) || 0, lido: ag.coleta[f][k] || 0, un: i.un }))
      .filter(x => x.lido < x.pedido);
    const r = await ui.confirmar({ titulo: 'Finalizar com divergência', pedirMotivo: true, labelMotivo: 'Motivo (ex.: falta de estoque)', ok: 'Finalizar com divergência', perigo: true,
      mensagem: 'Itens com diferença no pedido <b class="mono">' + esc(ag.pedido.numero) + '</b>:<ul class="erp-avisos">' +
        faltas.map(x => '<li>' + esc(x.descricao) + ': ' + x.lido + ' de ' + x.pedido + ' ' + esc(x.un) + '</li>').join('') + '</ul>A divergência fica registrada no pedido e na auditoria.' });
    if (!r.ok) { foco(); return; }
    ag = DT.db.agendamentoPorId(ag.id);
    if (!ag || !ag.coleta || ag.coleta.fase !== f) { ui.toast('O pedido mudou enquanto a divergência era registrada. Abra-o de novo.', 'warn'); agId = null; desenhar(); return; }
    ag.coleta.divergencias = ag.coleta.divergencias || [];
    ag.coleta.divergencias.push({ fase: f, ts: new Date().toISOString(), usuario: user().nome, motivo: r.motivo, faltas: faltas });
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Divergência no coletor', 'Agendamento', ag.pedido.numero, null,
      fases[f] + ': ' + faltas.map(x => x.descricao + ' ' + x.lido + '/' + x.pedido).join('; ') + ' — ' + r.motivo);
    finalizar(ag, 'com divergência: ' + r.motivo);
    desenhar();
  }

  /* ---------------- entrada do leitor ---------------- */
  function processar(codigo) {
    codigo = String(codigo || '').trim();
    if (!codigo) return;
    const modo = DT.separacao.modo();
    if (modo === 'bipe') {
      const n = codigo.replace(/\D/g, '');
      if (!n) retorno('err', 'Código não reconhecido', 'Bipe o código de barras do número do pedido.');
      else biparPedido(n);
    } else {
      const ag = agId ? DT.db.agendamentoPorId(agId) : null;
      if (ag && ag.coleta && faseDe(ag) === ag.coleta.fase) {
        const idx = itemPorCodigo(ag, codigo);
        if (idx >= 0) { biparItem(ag, idx, lerQtd()); desenhar(); return; }
        const n = codigo.replace(/\D/g, '');
        if (n === ag.pedido.numero) { retorno('warn', 'Pedido já aberto', 'Bipe os produtos do pedido ' + n + '.'); desenhar(); return; }
        if (n && DT.ag.ativoDoPedido(n)) { abrirPedido(n); desenhar(); return; }
        retorno('err', 'Produto não pertence ao pedido', 'Código ' + codigo + ' não está no pedido ' + ag.pedido.numero + '. Confira o produto.');
      } else {
        agId = null;
        const n = codigo.replace(/\D/g, '');
        if (!n) retorno('err', 'Código não reconhecido', 'Bipe primeiro o código do pedido.');
        else abrirPedido(n);
      }
    }
    desenhar();
  }
  function lerQtd() {
    const q = el.querySelector('#col-qtd');
    const n = q ? Math.floor(Number(q.value)) : 1;
    return n >= 1 && n <= 9999 ? n : 1;
  }
  function foco() {
    const i = el && el.querySelector('#col-cod');
    if (i && !document.querySelector('.modal-back')) i.focus();
  }

  /* ---------------- desenho ---------------- */
  function pendentes() {
    return DT.db.agendamentos().filter(a => a.data === hoje() && G.finalizados.indexOf(a.status) < 0 && a.status !== S.CANCELADO &&
      [S.AGENDADO, S.EM_PREPARACAO, S.SEPARADO].indexOf(DT.ag.prepAtual(a)) >= 0)
      .sort((a, b) => a.hora < b.hora ? -1 : 1);
  }
  function desenhar() {
    if (!el) return;
    const modo = DT.separacao.modo();
    if (!DT.separacao.usaColetor()) { el.innerHTML = ui.empty('O Modo coletor não está em uso. O Administrador escolhe o modo de trabalho em Configurações › Separação e conferência.', 'scan'); return; }
    const itemAItem = modo === 'coletor';
    const ag = itemAItem && agId ? DT.db.agendamentoPorId(agId) : null;
    if (ag && (!ag.coleta || faseDe(ag) !== ag.coleta.fase)) agId = null;
    const aberto = itemAItem && agId ? ag : null;
    const online = navigator.onLine !== false;
    const fila = DT.db.modoNuvem() && DT.nuvem.pendentes ? DT.nuvem.pendentes() : 0;

    el.innerHTML = '<div class="col-wrap">' +
      '<section class="card col-scan"><div class="card-body stack">' +
        '<div class="row between wrap"><span class="tag sim">' + esc(DT.separacao.infoModo().titulo) + '</span>' +
          '<span class="subtle">' + esc(user().nome) + (online ? '' : ' · <b class="crit-txt">sem internet</b>') + (fila ? ' · ' + fila + ' envio(s) pendente(s)' : '') + '</span></div>' +
        (!online ? '<div class="notice warn">' + ui.icon('alert') + '<div>Sem internet. Os bipes ficam guardados neste aparelho e são enviados quando a conexão voltar — <b>não feche esta tela</b>.</div></div>' : '') +
        '<form id="col-form" autocomplete="off" class="col-entrada">' +
          '<div class="field" style="flex:1 1 220px"><label for="col-cod">' + (aberto ? 'Bipe o produto' : 'Bipe o código do pedido') + '</label>' +
            '<input id="col-cod" class="input big mono" autocomplete="off" autocapitalize="off" spellcheck="false"' + (semTeclado ? ' inputmode="none"' : '') + ' placeholder="' + (aberto ? 'código de barras do produto' : 'nº do pedido') + '"></div>' +
          (aberto ? '<div class="field col-qtd"><label for="col-qtd">Qtd</label><input id="col-qtd" class="input big mono" type="number" min="1" max="9999" value="1" inputmode="numeric"></div>' : '') +
          '<div class="row col-botoes"><button type="submit" class="btn primary lg">' + ui.icon('check') + 'OK</button>' +
          '<button type="button" class="btn ghost lg" id="col-tecl" title="' + (semTeclado ? 'Mostrar teclado da tela' : 'Esconder teclado da tela (usar só o leitor)') + '" aria-pressed="' + semTeclado + '">' + ui.icon('edit') + '</button></div>' +
        '</form>' +
        (fb ? '<div class="col-fb ' + fb.tipo + '" role="status" aria-live="assertive"><b>' + esc(fb.titulo) + '</b>' + (fb.texto ? '<span>' + esc(fb.texto) + '</span>' : '') + '</div>'
          : '<div class="col-fb neutro" role="status"><b>Pronto para bipar</b><span>' + (itemAItem ? 'Bipe o pedido e depois cada produto. Para vários iguais, informe a quantidade antes de bipar.' : 'Cada bipe do pedido avança uma etapa: início da separação → separado → conferido.') + '</span></div>') +
        (modo === 'bipe' && historico.length ? '<div class="row"><button type="button" class="btn ghost sm" id="col-desfazer">' + ui.icon('back', 'icon-sm') + 'Desfazer último bipe (' + esc(historico[0].numero) + ')</button></div>' : '') +
      '</div></section>' +
      (aberto ? painelPedido(aberto) : '') +
      (modo === 'bipe' && historico.length ? '<section class="card"><div class="card-head"><h3>Últimos bipes</h3></div><div class="queue">' +
        historico.map(h => '<div class="queue-item" style="cursor:default"><span class="qt">' + U.fmtHora(h.ts) + '</span><span class="qm"><b>' + esc(h.cliente) + '</b><span class="row">' + ui.tag(h.numero, false) + '<span class="subtle">' + esc(h.de) + ' → </span>' + ui.badge(h.para) + '</span></span></div>').join('') + '</div></section>' : '') +
      listaPendentes(itemAItem, aberto) +
    '</div>';
    ligar(aberto);
    foco();
  }
  function painelPedido(ag) {
    const c = ag.coleta, f = c.fase, t = totais(ag), itens = ag.pedido.itens || [];
    const pct = t.total ? Math.round(t.lidos / t.total * 100) : 0;
    const permitirDiv = cfg().permitirDivergencia !== false;
    return '<section class="card"><div class="card-head"><h3>' + fases[f] + ' · pedido <span class="mono">' + esc(ag.pedido.numero) + '</span></h3><span class="spacer"></span><span class="subtle">' + esc(infoData(ag)) + '</span></div>' +
      '<div class="card-body stack">' +
        '<div><b>' + esc(ag.pedido.cliente) + '</b>' + (f === 'conferencia' && c.separacaoPor ? '<div class="subtle">Separado por ' + esc(c.separacaoPor.nome) + '</div>' : '') + '</div>' +
        '<div class="col-prog"><div class="bar-track"><div class="bar-fill' + (t.completo ? ' ok' : '') + '" style="width:' + pct + '%"></div></div><b class="mono">' + t.lidos + '/' + t.total + '</b></div>' +
        (itens.length ? '<div class="col-itens">' + itens.map((i, k) => {
          const lido = c[f][k] || 0, q = Number(i.qtd) || 0, ok = lido >= q;
          return '<div class="col-item' + (ok ? ' ok' : lido ? ' parcial' : '') + '"><span class="col-it-tx"><b>' + esc(i.descricao) + '</b><span class="subtle mono">' + esc(i.sku) + enderecoTxt(i, ag.pedido) + '</span></span>' +
            '<span class="col-it-q mono">' + lido + '<small>/' + q + ' ' + esc(i.un) + '</small></span></div>';
        }).join('') + '</div>' : '<div class="notice warn">' + ui.icon('alert') + '<div>Este pedido não trouxe a lista de produtos. Confira pelo documento e finalize.</div></div>') +
        '<div class="row wrap col-acoes">' +
          '<button type="button" class="btn success lg" id="col-fim"' + (t.completo || !itens.length ? '' : ' disabled') + '>' + ui.icon('check') + 'Finalizar ' + (f === 'separacao' ? 'separação' : 'conferência') + '</button>' +
          (permitirDiv && itens.length && !t.completo ? '<button type="button" class="btn ghost" id="col-div">' + ui.icon('alert') + 'Finalizar com divergência</button>' : '') +
          '<button type="button" class="btn ghost" id="col-zerar">' + ui.icon('refresh') + 'Zerar contagem</button>' +
          '<button type="button" class="btn ghost" id="col-trocar">' + ui.icon('back') + 'Trocar pedido</button>' +
        '</div>' +
      '</div></section>';
  }
  function enderecoTxt(i, p) {
    const e = ui.enderecoItem(i, p);
    return e.rua || e.predio || e.nivel || e.apto ? ' · Rua ' + esc(e.rua || '—') + ' · Pre ' + esc(e.predio || '—') + ' · Niv ' + esc(e.nivel || '—') + ' · Apto ' + esc(e.apto || '—') : '';
  }
  function listaPendentes(itemAItem, aberto) {
    const l = pendentes();
    return '<section class="card"><div class="card-head"><h3>Pedidos de hoje para separar e conferir</h3><span class="spacer"></span><span class="subtle">' + l.length + '</span></div>' +
      '<div class="queue">' + (l.length ? l.map(a => {
        const c = a.coleta, f = c && c.fase && faseDe(a) === c.fase ? c.fase : null;
        let prog = '';
        if (itemAItem && f && a.pedido.itens && a.pedido.itens.length) { const t = totais(a); prog = '<span class="subtle">' + fases[f] + ' ' + t.lidos + '/' + t.total + '</span>'; }
        const tag = itemAItem ? 'button type="button" data-abrir="' + esc(a.pedido.numero) + '"' : 'div';
        return '<' + tag + ' class="queue-item' + (aberto && aberto.id === a.id ? ' sel' : '') + '"' + (itemAItem ? '' : ' style="cursor:default"') + '><span class="qt">' + a.hora + '</span><span class="qm"><b>' + esc(a.pedido.cliente) + '</b><span class="row">' + ui.tag(a.pedido.numero, false) + ui.badge(DT.ag.prepAtual(a)) + prog + '</span></span></' + (itemAItem ? 'button' : 'div') + '>';
      }).join('') : ui.empty('Nenhum pedido de hoje aguardando separação ou conferência.', 'box')) + '</div></section>';
  }
  function ligar(aberto) {
    const q = s => el.querySelector(s);
    q('#col-form').addEventListener('submit', e => { e.preventDefault(); const v = q('#col-cod').value; q('#col-cod').value = ''; processar(v); });
    q('#col-tecl').addEventListener('click', () => { semTeclado = !semTeclado; desenhar(); });
    const dz = q('#col-desfazer'); if (dz) dz.addEventListener('click', desfazer);
    el.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => { abrirPedido(b.dataset.abrir); desenhar(); }));
    if (!aberto) return;
    q('#col-fim').addEventListener('click', () => { finalizar(aberto); desenhar(); });
    const dv = q('#col-div'); if (dv) dv.addEventListener('click', () => finalizarComDivergencia(aberto));
    q('#col-zerar').addEventListener('click', async () => {
      const r = await ui.confirmar({ titulo: 'Zerar contagem', ok: 'Zerar', perigo: true, mensagem: 'A contagem da ' + fases[aberto.coleta.fase].toLowerCase() + ' do pedido <b class="mono">' + esc(aberto.pedido.numero) + '</b> volta a zero.' });
      if (!r.ok) { foco(); return; }
      aberto.coleta[aberto.coleta.fase] = {};
      DT.db.salvarAgendamento(aberto);
      DT.audit.registrar('Zerou contagem no coletor', 'Agendamento', aberto.pedido.numero, null, fases[aberto.coleta.fase]);
      fb = { tipo: 'warn', titulo: 'Contagem zerada', texto: 'Bipe novamente os produtos do pedido ' + aberto.pedido.numero + '.' };
      desenhar();
    });
    q('#col-trocar').addEventListener('click', () => { agId = null; fb = null; desenhar(); });
  }

  return view;
})();
