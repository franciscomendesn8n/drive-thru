/* =====================================================================
   DRIVE THRU — Assistente de integração com o ERP (em Configurações)
   ---------------------------------------------------------------------
   6 passos: Conexão · Credencial · Resposta do ERP · Campos (de-para) ·
   Regras · Testar e ativar.
   • A configuração (sem segredos) fica em dt_config, chave 'erp'.
   • A credencial vai direto para o cofre do servidor (função dt-erp) e
     nunca volta para o navegador.
   • A consulta ao ERP é sempre feita pelo servidor (função dt-erp).
   ===================================================================== */
DT.erpConfig = (function () {
  const N = () => DT.erpNucleo;
  const PASSOS = ['Conexão', 'Credencial', 'Resposta do ERP', 'Campos (de-para)', 'Regras', 'Testar e ativar'];
  const AUTH = [
    { value: 'nenhuma', label: 'Sem autenticação' },
    { value: 'apikey', label: 'Chave de API (cabeçalho)' },
    { value: 'bearer', label: 'Token (Bearer)' },
    { value: 'basic', label: 'Usuário e senha (Basic)' }
  ];
  /* Nomes comuns em ERPs, para a sugestão automática do de-para */
  const SINONIMOS = {
    numero: ['numero', 'num', 'nro', 'nr', 'nr_pedido', 'num_pedido', 'numeropedido', 'pedido', 'nrpedido', 'id_pedido', 'cod_pedido', 'codigo', 'id'],
    dataPedido: ['dt_emissao', 'data_emissao', 'dataemissao', 'emissao', 'data_pedido', 'datapedido', 'data', 'dt_pedido', 'created_at', 'datahora'],
    horaPedido: ['hora', 'hora_pedido', 'hr_emissao', 'hora_emissao'],
    cliente: ['razao_social', 'razaosocial', 'nome_cliente', 'cliente_nome', 'nomecliente', 'cliente', 'nome'],
    telefone: ['telefone', 'fone', 'celular', 'whatsapp', 'tel', 'telefone1'],
    valor: ['valor_total', 'valortotal', 'vl_total', 'total', 'valor', 'vlr_total'],
    vendedor: ['vendedor_nome', 'nome_vendedor', 'vendedor', 'representante'],
    formaPagamento: ['condicao_pagamento', 'forma_pagamento', 'formapagamento', 'pagamento', 'cond_pagto', 'condpagto'],
    situacao: ['situacao', 'status', 'status_pedido', 'sit'],
    notaFiscal: ['nota_fiscal', 'notafiscal', 'nf', 'numero_nf', 'nr_nf', 'nfe'],
    statusFaturamento: ['status_faturamento', 'faturado', 'situacao_faturamento'],
    tipoEntrega: ['tipo_entrega', 'tipoentrega', 'entrega', 'modalidade', 'tipo_frete'],
    elegivel: ['drive_thru', 'drivethru', 'libera_drive_thru', 'elegivel']
  };
  const SIN_ITENS = {
    lista: ['itens', 'items', 'produtos', 'linhas', 'detalhes'],
    sku: ['cod_produto', 'codigo_produto', 'sku', 'codigo', 'cod', 'produto_id', 'id_produto'],
    descricao: ['descricao', 'desc', 'nome', 'produto', 'descricao_produto'],
    qtd: ['qtde', 'quantidade', 'qtd', 'qty', 'quant'],
    un: ['unidade', 'un', 'und', 'unid', 'unidade_medida'],
    ean: ['ean', 'ean13', 'gtin', 'codigo_barras', 'cod_barras', 'codbarras', 'barcode']
  };

  function vazio() {
    return { ativo: false, url: '', auth: 'apikey', cabecalho: 'X-API-Key', timeoutMs: 8000, raiz: '',
      campos: {}, itens: { lista: '', sku: '', descricao: '', qtd: '', un: '', ean: '' },
      regras: { situacoesBloqueadas: 'CANCELADO, BLOQUEADO', tiposEntregaAceitos: '', faturadoValores: 'FATURADO' } };
  }
  const copia = o => JSON.parse(JSON.stringify(o));
  function salva() { return DT.db.get('erp') || null; }
  function ativa() { const c = salva(); return !!(c && c.ativo && c.url); }
  /* Usado pela tela de agendamento: a consulta vai para o ERP real? */
  function emUso() { return ativa() && DT.db.modoNuvem(); }

  /* Caminhos de objetos/listas (para "onde está o pedido") */
  function caminhosObjetos(obj, prefixo, out, prof) {
    out = out || []; prefixo = prefixo || ''; prof = prof || 0;
    if (prof > 4 || !obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) { if (obj.length && typeof obj[0] === 'object') caminhosObjetos(obj[0], prefixo ? prefixo + '.0' : '0', out, prof + 1); return out; }
    Object.keys(obj).forEach(k => {
      const v = obj[k], c = prefixo ? prefixo + '.' + k : k;
      if (v && typeof v === 'object') {
        out.push({ caminho: c, tipo: Array.isArray(v) ? 'lista' : 'objeto', qtd: Array.isArray(v) ? v.length : Object.keys(v).length });
        caminhosObjetos(v, c, out, prof + 1);
      }
    });
    return out;
  }
  /* Sugere onde está o pedido: desce por envelopes (data, resultado[0], pedido…) até achar o nível com vários campos simples */
  function detectarRaiz(obj) {
    const partes = []; let atual = obj;
    for (let i = 0; i < 6; i++) {
      if (Array.isArray(atual)) { if (!atual.length || !atual[0] || typeof atual[0] !== 'object') break; partes.push('0'); atual = atual[0]; continue; }
      if (!atual || typeof atual !== 'object') break;
      const ks = Object.keys(atual);
      if (ks.filter(k => atual[k] === null || typeof atual[k] !== 'object').length >= 4) break;
      const env = ks.filter(k => atual[k] && typeof atual[k] === 'object');
      if (env.length !== 1) break;
      partes.push(env[0]); atual = atual[env[0]];
    }
    return partes.join('.').replace(/(^|\.)0$/, '');
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

  function montar(box) {
    const ui = DT.ui, esc = DT.util.esc, U = DT.util;
    const nuvem = DT.db.modoNuvem();
    let rasc = Object.assign(vazio(), copia(salva() || {}));
    rasc.campos = Object.assign({}, rasc.campos); rasc.itens = Object.assign(vazio().itens, rasc.itens || {}); rasc.regras = Object.assign(vazio().regras, rasc.regras || {});
    let passo = 0;
    let amostra = null;          // resposta (JSON) usada para montar o de-para
    let origemAmostra = '';
    let cred = { carregado: false, definida: false, atualizadaEm: null };
    let teste = null;            // último teste online { ok, pedido, avisos, erro, numero, assinatura }
    let demoPreenchido = false;
    let ocupado = false;

    const assinatura = () => JSON.stringify([rasc.url, rasc.auth, rasc.cabecalho, rasc.timeoutMs, rasc.raiz, rasc.campos, rasc.itens, rasc.regras]);
    const testeValido = () => teste && teste.ok && teste.assinatura === assinatura();
    const raizObj = () => {
      if (!amostra) return null;
      let r = N().obter(amostra, rasc.raiz || '');
      if (Array.isArray(r)) r = r[0];
      return r && typeof r === 'object' ? r : null;
    };
    const itensLista = () => { const r = raizObj(); const l = r && rasc.itens.lista ? N().obter(r, rasc.itens.lista) : null; return Array.isArray(l) ? l : null; };

    async function carregarCredencial() {
      if (!nuvem) return;
      try { const r = await DT.nuvem.erpAcao('statusCredencial'); cred = { carregado: true, definida: !!r.definida, atualizadaEm: r.atualizadaEm || null }; }
      catch (e) { cred = { carregado: true, definida: false, atualizadaEm: null, erro: e.message }; }
      if (passo === 1 || passo === 0) desenhar();
    }

    function cabecalho() {
      const s = salva();
      const estado = s && s.ativo ? (nuvem ? '<span class="tag sim">ERP ativo</span>' : '<span class="tag">ERP ativo (só no modo nuvem)</span>') : '<span class="tag">Base de demonstração</span>';
      return '<div class="card-head"><h3>Integração com o ERP</h3><span class="spacer"></span><span class="subtle">Pedidos consultados em: </span>' + estado + '</div>';
    }
    function trilha() {
      return '<div class="erp-passos" role="tablist">' + PASSOS.map((p, i) =>
        '<button type="button" role="tab" class="erp-passo' + (i === passo ? ' cur' : '') + (i < passo ? ' done' : '') + '" data-passo="' + i + '" aria-selected="' + (i === passo) + '"><b>' + (i + 1) + '</b><span>' + p + '</span></button>').join('') + '</div>';
    }
    function rodape() {
      return '<div class="row between erp-nav">' +
        (passo > 0 ? '<button type="button" class="btn ghost" data-ir="' + (passo - 1) + '">' + ui.icon('back') + 'Voltar</button>' : '<span></span>') +
        (passo < PASSOS.length - 1 ? '<button type="button" class="btn primary" data-ir="' + (passo + 1) + '">Próximo: ' + PASSOS[passo + 1] + ui.icon('arrow') + '</button>' : '<span></span>') +
        '</div>';
    }
    const semNuvem = msg => '<div class="notice warn">' + ui.icon('alert') + '<div>' + msg + '</div></div>';

    /* ----------------------------- Passo 1 ----------------------------- */
    function p1() {
      return '<div class="stack">' +
        '<p class="muted">Informe o endereço da API do ERP que devolve <b>um pedido de venda</b>. Use <span class="mono">{numero}</span> onde entra o número do pedido. ' +
        'A consulta é feita pelo servidor do Drive Thru — o endereço precisa ser <b>HTTPS</b> e acessível pela internet (se o ERP estiver só na rede interna, a TI publica um serviço intermediário).</p>' +
        '<div class="field"><label for="erp-url">Endereço da consulta do pedido</label><input id="erp-url" class="input mono" value="' + esc(rasc.url) + '" placeholder="https://erp.suaempresa.com.br/api/pedidos/{numero}" spellcheck="false">' +
          '<span class="hint" id="erp-url-ex">' + exemploUrl() + '</span></div>' +
        '<div class="fields-3">' +
          '<div class="field"><label for="erp-auth">Autenticação</label><select id="erp-auth" class="select">' + ui.options(AUTH, rasc.auth) + '</select></div>' +
          '<div class="field" id="erp-cab-box"' + (rasc.auth === 'apikey' ? '' : ' hidden') + '><label for="erp-cab">Nome do cabeçalho da chave</label><input id="erp-cab" class="input mono" value="' + esc(rasc.cabecalho || 'X-API-Key') + '"></div>' +
          '<div class="field"><label for="erp-to">Tempo máximo de resposta (s)</label><input id="erp-to" type="number" min="2" max="30" class="input" value="' + Math.round((rasc.timeoutMs || 8000) / 1000) + '"></div>' +
        '</div>' +
        '<div class="notice info">' + ui.icon('info') + '<div><b>Quer ver funcionando antes de ligar o ERP real?</b> Preencha tudo com o <b>ERP de demonstração</b> — uma API de teste, com outro formato de dados, já publicada no servidor.' +
          '<div class="row wrap" style="margin-top:8px"><button type="button" class="btn sm erp-quebra" id="erp-demo">' + ui.icon('play') + 'Preencher com o ERP de demonstração</button></div></div></div>' +
      '</div>';
    }
    function exemploUrl() {
      if (!rasc.url) return 'Exemplo: https://erp.suaempresa.com.br/api/pedidos/{numero}';
      const u = N().montarUrl({ url: rasc.url.split('{SUPABASE}').join(DT.SUPABASE.url || '') }, '130004');
      return 'Para o pedido 130004 será consultado: <span class="mono">' + esc(u) + '</span>';
    }

    /* ----------------------------- Passo 2 ----------------------------- */
    function p2() {
      if (rasc.auth === 'nenhuma') return '<div class="notice ok">' + ui.icon('check') + '<div>A conexão foi configurada <b>sem autenticação</b>; não é preciso guardar credencial. Siga para o próximo passo.</div></div>';
      const tipo = { apikey: 'a chave de API', bearer: 'o token', basic: 'usuário e senha no formato usuario:senha' }[rasc.auth];
      let status;
      if (!nuvem) status = semNuvem('A credencial só pode ser guardada no <b>modo nuvem</b> (servidor). Neste modo local você ainda pode montar o de-para com um exemplo de resposta colado.');
      else if (!cred.carregado) status = '<p class="muted"><span class="spinner"></span> Verificando o cofre…</p>';
      else if (cred.erro) status = '<div class="notice crit">' + ui.icon('alert') + '<div>' + esc(cred.erro) + '</div></div>';
      else status = cred.definida
        ? '<div class="notice ok">' + ui.icon('lock') + '<div>Há uma credencial guardada no cofre' + (cred.atualizadaEm ? ' (atualizada em ' + esc(U.fmtDataHora(cred.atualizadaEm)) + ')' : '') + '. Por segurança ela não é exibida.</div></div>'
        : '<div class="notice warn">' + ui.icon('key') + '<div>Nenhuma credencial guardada ainda.</div></div>';
      return '<div class="stack">' +
        '<p class="muted">Informe ' + tipo + ' fornecido pela TI ou pelo fornecedor do ERP. Ela é guardada <b>criptografada no cofre do servidor</b>, usada só pela consulta de pedidos e <b>nunca volta para a tela</b>. Para trocar, basta guardar uma nova.</p>' +
        status +
        (nuvem ? '<div class="field"><label for="erp-cred">' + (cred.definida ? 'Nova credencial' : 'Credencial') + '</label><input id="erp-cred" type="password" class="input mono" autocomplete="new-password" spellcheck="false" placeholder="' + (rasc.auth === 'basic' ? 'usuario:senha' : 'cole aqui') + '"></div>' +
          '<div class="row wrap"><button type="button" class="btn primary" id="erp-cred-salvar">' + ui.icon('lock') + 'Guardar no cofre</button>' +
          (demoPreenchido || /dt-erp-demo/.test(rasc.url) ? '<button type="button" class="btn ghost" id="erp-cred-demo">' + ui.icon('key') + 'Usar a chave do ERP de demonstração</button>' : '') +
          (cred.definida ? '<button type="button" class="btn ghost" id="erp-cred-remover">' + ui.icon('ban') + 'Remover credencial</button>' : '') + '</div>' : '') +
      '</div>';
    }

    /* ----------------------------- Passo 3 ----------------------------- */
    function p3() {
      const objs = amostra ? caminhosObjetos(amostra) : [];
      const raizOk = !!raizObj();
      return '<div class="stack">' +
        '<p class="muted">Para fazer o de-para, o assistente precisa ver <b>uma resposta real</b> do ERP. Consulte um pedido pelo servidor ou cole um exemplo que a TI tenha enviado.</p>' +
        '<div class="grid-2 erp-dupla">' +
          '<div class="ap-bloco"><h4>Consultar um pedido no ERP</h4>' +
            (nuvem ? '<div class="row"><input id="erp-t-num" class="input mono" inputmode="numeric" placeholder="Nº do pedido" style="max-width:160px" value="' + esc((teste && teste.numero) || '') + '"><button type="button" class="btn primary" id="erp-t-ir">' + ui.icon('search') + 'Consultar</button></div>' +
              '<span class="hint">Usa o endereço e a credencial dos passos 1 e 2.</span>'
              : semNuvem('Disponível no modo nuvem.')) +
          '</div>' +
          '<div class="ap-bloco"><h4>Ou cole um exemplo de resposta (JSON)</h4>' +
            '<textarea id="erp-cola" class="textarea mono" rows="4" placeholder=\'{ "pedido": { "numero": "123", ... } }\'></textarea>' +
            '<div class="row"><button type="button" class="btn" id="erp-cola-ok">' + ui.icon('check') + 'Usar este exemplo</button></div></div>' +
        '</div>' +
        '<div id="erp-t-msg"></div>' +
        (amostra ?
          '<div class="ap-bloco"><h4>Resposta recebida <span class="subtle">(' + esc(origemAmostra) + ')</span></h4>' +
            '<pre class="erp-json">' + esc(JSON.stringify(amostra, null, 2).slice(0, 12000)) + '</pre>' +
            '<div class="field"><label for="erp-raiz">Onde está o pedido nesta resposta?</label><select id="erp-raiz" class="select">' +
              ui.options([{ value: '', label: '(a resposta inteira é o pedido)' }].concat(objs.slice(0, 80).map(o => ({ value: o.caminho, label: o.caminho + (o.tipo === 'lista' ? ' (lista — usa o 1º)' : '') + (/\.0(\.|$)/.test(o.caminho) ? ' (no 1º da lista)' : '') }))), rasc.raiz || '') + '</select>' +
              '<span class="hint">' + (raizOk ? 'O pedido tem ' + Object.keys(raizObj()).length + ' campos neste ponto.' : '<b class="crit-txt">Nenhum pedido neste ponto — escolha outro.</b>') + '</span></div>' +
          '</div>'
          : '<div class="empty">Nenhuma resposta carregada ainda.</div>') +
      '</div>';
    }

    /* ----------------------------- Passo 4 ----------------------------- */
    function p4() {
      const r = raizObj();
      if (!r) return '<div class="notice warn">' + ui.icon('alert') + '<div>Carregue uma resposta do ERP no passo 3 para ver os campos disponíveis. Você também pode digitar os caminhos manualmente.</div></div>' + tabelaCampos(null);
      return tabelaCampos(r);
    }
    function valorCurto(v) {
      if (v === undefined) return '<span class="crit-txt">não encontrado</span>';
      if (v === null) return '<span class="subtle">vazio</span>';
      if (typeof v === 'object') return '<span class="subtle">' + (Array.isArray(v) ? 'lista com ' + v.length : 'objeto') + '</span>';
      return esc(String(v).slice(0, 60));
    }
    function tabelaCampos(r) {
      const cams = r ? N().caminhos(r) : [];
      const listas = cams.filter(c => c.tipo === 'lista');
      const lst = itensLista();
      const camItens = lst && lst[0] && typeof lst[0] === 'object' ? N().caminhos(lst[0]) : [];
      const dl = (id, arr) => '<datalist id="' + id + '">' + arr.map(c => '<option value="' + esc(c.caminho) + '">' + esc(c.exemplo || '') + '</option>').join('') + '</datalist>';
      const linhas = N().CAMPOS.map(([k, rot, obrig, dica]) => {
        const val = rasc.campos[k] || '';
        return '<tr><td><b>' + esc(rot) + '</b>' + (obrig ? ' <span class="crit-txt" title="obrigatório">*</span>' : '') + '<div class="subtle">' + esc(dica) + '</div></td>' +
          '<td><input class="input mono sm" data-campo="' + k + '" list="erp-dl" value="' + esc(val) + '" placeholder="(não usar)" spellcheck="false"></td>' +
          '<td class="erp-val" data-val="' + k + '">' + (r && val ? valorCurto(N().obter(r, val)) : '') + '</td></tr>';
      }).join('');
      const linhasItens = N().ITENS.map(([k, rot]) => {
        const val = rasc.itens[k] || '';
        return '<tr><td><b>' + esc(rot) + '</b></td><td><input class="input mono sm" data-item="' + k + '" list="erp-dl-it" value="' + esc(val) + '" spellcheck="false"></td>' +
          '<td class="erp-val" data-ival="' + k + '">' + (lst && lst[0] && val ? valorCurto(N().obter(lst[0], val)) : '') + '</td></tr>';
      }).join('');
      return '<div class="stack">' +
        '<div class="row between wrap"><p class="muted" style="margin:0">Para cada informação do Drive Thru, escolha o campo correspondente do ERP. A coluna da direita mostra o valor do exemplo carregado.</p>' +
          (r ? '<button type="button" class="btn sm" id="erp-sugerir">' + ui.icon('refresh') + 'Sugerir automaticamente</button>' : '') + '</div>' +
        dl('erp-dl', cams.filter(c => c.tipo !== 'lista')) + dl('erp-dl-lst', listas) + dl('erp-dl-it', camItens) +
        '<div class="table-wrap"><table class="table erp-tab"><thead><tr><th>Drive Thru</th><th>Campo no ERP</th><th>Valor no exemplo</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        '<div class="ap-bloco"><h4>Itens do pedido</h4>' +
          '<div class="field"><label for="erp-it-lista">Lista de itens</label><input id="erp-it-lista" class="input mono" list="erp-dl-lst" value="' + esc(rasc.itens.lista || '') + '" placeholder="ex.: itens" spellcheck="false">' +
            '<span class="hint">' + (lst ? 'Encontrada: ' + lst.length + ' item(ns). Os campos abaixo são de cada item.' : (rasc.itens.lista && r ? '<b class="crit-txt">Lista não encontrada.</b>' : 'Caminho da lista de produtos dentro do pedido.')) + '</span></div>' +
          '<div class="table-wrap"><table class="table erp-tab"><tbody>' + linhasItens + '</tbody></table></div>' +
        '</div>' +
      '</div>';
    }
    function sugerir() {
      const r = raizObj(); if (!r) return 0;
      const cams = N().caminhos(r);
      const achar = (lista, cs) => {
        for (const s of lista) { const c = cs.find(x => usados.indexOf(x.caminho) < 0 && norm(x.caminho.split('.').pop()) === norm(s)); if (c) return c.caminho; }
        for (const s of lista) { if (norm(s).length < 5) continue; const c = cs.find(x => usados.indexOf(x.caminho) < 0 && norm(x.caminho.split('.').pop()).indexOf(norm(s)) >= 0); if (c) return c.caminho; }
        return '';
      };
      let n = 0;
      const usados = Object.keys(rasc.campos).map(k => rasc.campos[k]).filter(Boolean);
      const folhas = cams.filter(c => c.tipo !== 'lista');
      // cliente e vendedor: preferir subcampos "nome"/"razao_social" dentro de objetos homônimos
      Object.keys(SINONIMOS).forEach(k => {
        if (rasc.campos[k]) return;
        let v = '';
        if (k === 'cliente' || k === 'vendedor') {
          const dentro = folhas.filter(c => norm(c.caminho).indexOf(k) === 0 && /(nome|razao)/.test(norm(c.caminho.split('.').pop())));
          if (dentro.length) v = (dentro.find(c => /razao/.test(norm(c.caminho))) || dentro[0]).caminho;
        }
        if (!v && k === 'telefone') { const t = folhas.find(c => /(telefone|fone|celular)/.test(norm(c.caminho))); if (t) v = t.caminho; }
        if (!v && k !== 'statusFaturamento' && k !== 'elegivel' && k !== 'horaPedido') v = achar(SINONIMOS[k], folhas.filter(c => !/^itens?\b|\.0\./.test(c.caminho)));
        if (!v && (k === 'statusFaturamento' || k === 'elegivel')) { const t = folhas.find(c => SINONIMOS[k].some(s => norm(c.caminho.split('.').pop()) === norm(s))); if (t) v = t.caminho; }
        if (v) { rasc.campos[k] = v; usados.push(v); n++; }
      });
      if (!rasc.itens.lista) { const l = achar(SIN_ITENS.lista, cams.filter(c => c.tipo === 'lista')); if (l) { rasc.itens.lista = l; n++; } }
      const lst = itensLista();
      if (lst && lst[0] && typeof lst[0] === 'object') {
        const ci = N().caminhos(lst[0]).filter(c => c.tipo !== 'lista');
        ['sku', 'descricao', 'qtd', 'un', 'ean'].forEach(k => { if (!rasc.itens[k]) { const v = achar(SIN_ITENS[k], ci); if (v) { rasc.itens[k] = v; n++; } } });
      }
      return n;
    }

    /* ----------------------------- Passo 5 ----------------------------- */
    function p5() {
      const r = raizObj();
      const ex = k => r && rasc.campos[k] ? N().obter(r, rasc.campos[k]) : undefined;
      const exemplo = (k, rot) => { const v = ex(k); return v !== undefined && v !== null && typeof v !== 'object' ? '<span class="hint">No exemplo carregado, ' + rot + ' = <b class="mono">' + esc(String(v)) + '</b></span>' : ''; };
      return '<div class="stack">' +
        '<p class="muted">Defina quando um pedido <b>não pode</b> ser agendado no Drive Thru. Separe os valores por vírgula (maiúsculas/minúsculas não importam).</p>' +
        '<div class="field"><label for="erp-r-sit">Situações que bloqueiam o agendamento</label><input id="erp-r-sit" class="input" value="' + esc(rasc.regras.situacoesBloqueadas || '') + '" placeholder="CANCELADO, BLOQUEADO">' +
          (rasc.campos.situacao ? exemplo('situacao', 'a situação') : '<span class="hint crit-txt">Configure o campo "Situação do pedido" no passo 4.</span>') + '</div>' +
        '<div class="field"><label for="erp-r-tipo">Tipos de entrega aceitos no Drive Thru</label><input id="erp-r-tipo" class="input" value="' + esc(rasc.regras.tiposEntregaAceitos || '') + '" placeholder="RETIRA">' +
          '<span class="hint">Vazio = aceita qualquer tipo. ' + (rasc.campos.tipoEntrega ? '' : 'Só vale se o campo "Tipo de entrega" estiver configurado.') + '</span>' + exemplo('tipoEntrega', 'o tipo de entrega') + '</div>' +
        '<div class="field"><label for="erp-r-fat">Valores que indicam pedido faturado</label><input id="erp-r-fat" class="input" value="' + esc(rasc.regras.faturadoValores || '') + '" placeholder="FATURADO">' +
          '<span class="hint">Usado com o campo "Status de faturamento". Sem esse campo, o pedido é considerado faturado quando tem nota fiscal.</span>' + exemplo('statusFaturamento', 'o status de faturamento') + '</div>' +
        (rasc.campos.elegivel ? '<div class="notice info">' + ui.icon('info') + '<div>O campo <span class="mono">' + esc(rasc.campos.elegivel) + '</span> também é usado: valor "não" (N, NAO, FALSE, 0) bloqueia o pedido.</div></div>' : '') +
      '</div>';
    }

    /* ----------------------------- Passo 6 ----------------------------- */
    const kv = itens => '<dl class="kv">' + itens.map(i => '<div><dt>' + i[0] + '</dt><dd>' + i[1] + '</dd></div>').join('') + '</dl>';
    function cartaoPedido(p, avisos, titulo) {
      if (!p) return '';
      const itens = (p.itens || []).slice(0, 8);
      return '<div class="ap-bloco"><h4>' + titulo + '</h4>' +
        (p.elegivelDriveThru ? '<div class="notice ok">' + ui.icon('check') + '<div>Pedido <b>liberado</b> para agendamento no Drive Thru.</div></div>'
          : '<div class="notice warn">' + ui.icon('ban') + '<div><b>Bloqueado:</b> ' + esc(p.motivoInelegivel || '') + '</div></div>') +
        kv([['Pedido', '<span class="mono">' + esc(p.numero) + '</span>'], ['Data / hora', esc((p.dataPedido ? U.fmtData(p.dataPedido) : '—') + (p.horaPedido ? ' ' + p.horaPedido : ''))], ['Cliente', esc(p.cliente || '—')],
          ['Telefone', esc(p.telefone || '—')], ['Vendedor', esc(p.vendedor || '—')], ['Pagamento', esc(p.formaPagamento || '—')],
          ['Valor', p.valor != null ? esc(U.fmtMoeda(p.valor)) : '—'], ['Situação', esc(p.situacao || '—')], ['Faturamento', esc(p.statusFaturamento + (p.notaFiscal ? ' · NF ' + p.notaFiscal : ''))]]) +
        (itens.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Código</th><th>Descrição</th><th class="num">Qtd</th><th>Un</th></tr></thead><tbody>' +
          itens.map(i => '<tr><td class="mono">' + esc(i.sku) + '</td><td>' + esc(i.descricao) + '</td><td class="num">' + esc(String(i.qtd)) + '</td><td>' + esc(i.un) + '</td></tr>').join('') +
          ((p.itens || []).length > 8 ? '<tr><td colspan="4" class="subtle">+ ' + (p.itens.length - 8) + ' item(ns)</td></tr>' : '') + '</tbody></table></div>' : '<p class="subtle">Nenhum item lido.</p>') +
        (avisos && avisos.length ? '<div class="notice warn">' + ui.icon('alert') + '<div><b>Atenção:</b><ul class="erp-avisos">' + avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></div></div>' : '') +
      '</div>';
    }
    function p6() {
      const s = salva();
      const local = amostra ? N().mapear(amostra, rasc, '') : null;
      const ok = testeValido();
      return '<div class="stack">' +
        (local && !(ok && teste.encontrado) ? cartaoPedido(local.pedido, local.avisos, 'Prévia com o exemplo carregado') : '') +
        '<div class="ap-bloco"><h4>Teste final no ERP</h4>' +
          (nuvem ? '<p class="muted">Consulte um pedido real pelo servidor, já com o de-para e as regras. A ativação só é liberada depois de um teste bem-sucedido.</p>' +
            '<div class="row"><input id="erp-f-num" class="input mono" inputmode="numeric" placeholder="Nº do pedido" style="max-width:160px" value="' + esc((teste && teste.numero) || '') + '"><button type="button" class="btn primary" id="erp-f-ir">' + ui.icon('search') + 'Testar no ERP</button></div>'
            : semNuvem('O teste no ERP e a ativação exigem o modo nuvem.')) +
          '<div id="erp-f-res">' + (teste && teste.assinatura === assinatura() ? resultadoTeste() : '') + '</div>' +
        '</div>' +
        '<div class="ap-bloco"><h4>Salvar e ativar</h4>' +
          '<p class="muted">' + (s && s.ativo ? 'Situação atual: <b>o agendamento consulta o ERP</b>.' : 'Situação atual: <b>o agendamento usa a base de demonstração</b> (pedidos 130001 a 130013).') +
          ' Ao ativar o ERP, só são encontrados pedidos que existem no ERP configurado.</p>' +
          '<div class="row wrap">' +
            '<button type="button" class="btn" id="erp-salvar">' + ui.icon('check') + 'Salvar configuração</button>' +
            '<button type="button" class="btn success" id="erp-ativar"' + (ok && nuvem ? '' : ' disabled title="Faça um teste bem-sucedido no ERP primeiro"') + '>' + ui.icon('play') + (s && s.ativo ? 'Salvar e manter ativo' : 'Salvar e ativar o ERP') + '</button>' +
            (s && s.ativo ? '<button type="button" class="btn ghost" id="erp-desativar">' + ui.icon('stop') + 'Desativar (voltar à base de demonstração)</button>' : '') +
          '</div>' +
          (s && s.atualizadoEm ? '<span class="hint">Última alteração: ' + esc(new Date(s.atualizadoEm).toLocaleString('pt-BR')) + (s.atualizadoPor ? ' por ' + esc(s.atualizadoPor) : '') + (s.testadoEm ? ' · último teste ok: ' + esc(new Date(s.testadoEm).toLocaleString('pt-BR')) : '') + '</span>' : '') +
        '</div>' +
      '</div>';
    }
    function resultadoTeste() {
      if (!teste) return '';
      if (teste.erro) return '<div class="notice crit">' + ui.icon('alert') + '<div>' + esc(teste.erro) + '</div></div>';
      if (!teste.encontrado) return '<div class="notice warn">' + ui.icon('search') + '<div>O ERP respondeu, mas o pedido <b>' + esc(teste.numero) + '</b> não foi encontrado' + (teste.avisos && teste.avisos.length ? ' (' + esc(teste.avisos.join(' ')) + ')' : '') + '.</div></div>';
      return cartaoPedido(teste.pedido, teste.avisos, 'Resultado do teste no ERP — pedido ' + esc(teste.numero));
    }

    /* ----------------------------- ações ----------------------------- */
    async function testarOnline(numero, alvoMsg, aoTerminar) {
      numero = String(numero || '').replace(/\D/g, '');
      if (!numero) { ui.toast('Informe o número de um pedido que exista no ERP.', 'warn'); return; }
      if (!rasc.url) { ui.toast('Informe o endereço do ERP no passo 1.', 'warn'); return; }
      if (ocupado) return;
      ocupado = true;
      const alvo = box.querySelector(alvoMsg);
      if (alvo) alvo.innerHTML = '<p class="muted"><span class="spinner"></span> Consultando o ERP pelo servidor…</p>';
      try {
        const r = await DT.nuvem.erpAcao('testar', { numero: numero, config: paraSalvar(rasc.ativo) });
        teste = { ok: !!(r.ok && r.encontrado), encontrado: !!r.encontrado, erro: r.erro || null, pedido: r.pedido || null, avisos: r.avisos || [], numero: numero, assinatura: assinatura() };
        if (r.bruto) { try { amostra = JSON.parse(r.bruto); origemAmostra = 'pedido ' + numero + ' consultado no ERP'; } catch (e) { /* não JSON */ } }
      } catch (e) {
        teste = { ok: false, erro: e.message, numero: numero, assinatura: assinatura() };
      }
      ocupado = false;
      aoTerminar();
    }
    function paraSalvar(ativo) {
      const c = copia(rasc);
      c.ativo = !!ativo;
      c.url = String(c.url || '').trim();
      Object.keys(c.campos).forEach(k => { c.campos[k] = String(c.campos[k] || '').trim(); if (!c.campos[k]) delete c.campos[k]; });
      Object.keys(c.itens).forEach(k => { c.itens[k] = String(c.itens[k] || '').trim(); });
      delete c.atualizadoEm; delete c.atualizadoPor; delete c.testadoEm;
      return c;
    }
    function validar() {
      const falta = [];
      if (!/^https:\/\//i.test(rasc.url) && rasc.url.indexOf('{SUPABASE}') !== 0) falta.push('endereço HTTPS do ERP (passo 1)');
      N().CAMPOS.forEach(([k, rot, obrig]) => { if (obrig && k !== 'numero' && !rasc.campos[k]) falta.push('campo "' + rot + '" (passo 4)'); });
      if (!rasc.itens.lista) falta.push('lista de itens (passo 4)');
      return falta;
    }
    function gravar(ativo) {
      const antes = salva();
      const c = paraSalvar(ativo);
      const u = DT.auth && DT.auth.usuarioAtual ? DT.auth.usuarioAtual() : null;
      c.atualizadoEm = new Date().toISOString();
      c.atualizadoPor = u ? u.nome : '';
      c.testadoEm = testeValido() ? new Date().toISOString() : (antes && antes.testadoEm) || null;
      DT.db.set('erp', c);
      const descr = x => !x ? 'não configurado' : (x.ativo ? 'ativo' : 'inativo') + ' · ' + (x.url || '');
      DT.audit.registrar(ativo && !(antes && antes.ativo) ? 'Ativou integração com o ERP' : (!ativo && antes && antes.ativo) ? 'Desativou integração com o ERP' : 'Alterou integração com o ERP',
        'Configuração', 'erp', descr(antes), descr(c));
      rasc.ativo = c.ativo;
    }

    /* ----------------------------- desenho ----------------------------- */
    function desenhar() {
      const corpo = [p1, p2, p3, p4, p5, p6][passo]();
      box.innerHTML = '<section class="card" id="erp-card">' + cabecalho() + '<div class="card-body stack">' + trilha() +
        '<div class="erp-corpo"><h4 class="erp-tit">' + (passo + 1) + '. ' + PASSOS[passo] + '</h4>' + corpo + '</div>' + rodape() + '</div></section>';
      ligar();
    }
    function ir(n) { passo = Math.max(0, Math.min(PASSOS.length - 1, n)); desenhar(); const c = box.querySelector('#erp-card'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }

    function ligar() {
      const q = s => box.querySelector(s);
      box.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => ir(Number(b.dataset.passo))));
      box.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => ir(Number(b.dataset.ir))));

      if (passo === 0) {
        q('#erp-url').addEventListener('input', e => { rasc.url = e.target.value.trim(); q('#erp-url-ex').innerHTML = exemploUrl(); });
        q('#erp-auth').addEventListener('change', e => { rasc.auth = e.target.value; q('#erp-cab-box').hidden = rasc.auth !== 'apikey'; });
        q('#erp-cab').addEventListener('input', e => { rasc.cabecalho = e.target.value.trim() || 'X-API-Key'; });
        q('#erp-to').addEventListener('input', e => { rasc.timeoutMs = Math.min(30, Math.max(2, Number(e.target.value) || 8)) * 1000; });
        q('#erp-demo').addEventListener('click', async () => {
          if (rasc.url && !/dt-erp-demo/.test(rasc.url)) {
            const r = await ui.confirmar({ titulo: 'Preencher com o ERP de demonstração', mensagem: 'O endereço, o de-para e as regras deste assistente serão substituídos pelos do ERP de demonstração (só no rascunho, até você salvar).', ok: 'Preencher' });
            if (!r.ok) return;
          }
          const d = copia(N().DEMO); delete d.chave;
          rasc = Object.assign(vazio(), d, { ativo: rasc.ativo });
          demoPreenchido = true; teste = null;
          ui.toast('Preenchido com o ERP de demonstração. Próximo passo: guardar a chave de demonstração.');
          ir(1);
        });
      }
      if (passo === 1 && nuvem && rasc.auth !== 'nenhuma') {
        const guardar = async (valor, msgOk) => {
          if (ocupado) return; ocupado = true;
          try { await DT.nuvem.erpAcao('salvarCredencial', { credencial: valor }); ui.toast(msgOk); teste = null; }
          catch (e) { ui.toast(e.message, 'warn'); }
          ocupado = false; cred.carregado = false; desenhar(); carregarCredencial();
        };
        const sv = q('#erp-cred-salvar');
        if (sv) sv.addEventListener('click', () => { const v = q('#erp-cred').value; if (!v.trim()) { ui.toast('Digite a credencial.', 'warn'); return; } guardar(v.trim(), 'Credencial guardada no cofre do servidor.'); });
        const dm = q('#erp-cred-demo');
        if (dm) dm.addEventListener('click', () => guardar(N().DEMO.chave, 'Chave do ERP de demonstração guardada no cofre.'));
        const rm = q('#erp-cred-remover');
        if (rm) rm.addEventListener('click', async () => {
          const r = await ui.confirmar({ titulo: 'Remover credencial', perigo: true, ok: 'Remover', mensagem: 'A credencial do ERP será apagada do cofre. Se a integração estiver ativa, as consultas de pedidos vão falhar até uma nova ser guardada.' });
          if (r.ok) guardar('', 'Credencial removida.');
        });
      }
      if (passo === 2) {
        const tb = q('#erp-t-ir');
        if (tb) {
          const num = q('#erp-t-num');
          num.addEventListener('keydown', e => { if (e.key === 'Enter') tb.click(); });
          tb.addEventListener('click', () => testarOnline(num.value, '#erp-t-msg', () => {
            desenhar();
            if (teste && teste.erro) q('#erp-t-msg').innerHTML = '<div class="notice crit">' + ui.icon('alert') + '<div>' + esc(teste.erro) + '</div></div>';
            else if (teste && !amostra) q('#erp-t-msg').innerHTML = '<div class="notice warn">' + ui.icon('search') + '<div>O ERP não devolveu dados para o pedido ' + esc(teste.numero) + '. Tente outro número.</div></div>';
            else if (teste && !teste.encontrado && teste.numero) q('#erp-t-msg').innerHTML = '<div class="notice warn">' + ui.icon('search') + '<div>Pedido ' + esc(teste.numero) + ' não encontrado no ERP.</div></div>';
          }));
        }
        q('#erp-cola-ok').addEventListener('click', () => {
          const t = q('#erp-cola').value.trim();
          if (!t) { ui.toast('Cole o JSON de resposta do ERP.', 'warn'); return; }
          try { amostra = JSON.parse(t); } catch (e) { ui.toast('O texto colado não é um JSON válido.', 'warn'); return; }
          origemAmostra = 'exemplo colado';
          if (!rasc.raiz) rasc.raiz = detectarRaiz(amostra);
          desenhar();
        });
        const rz = q('#erp-raiz');
        if (rz) rz.addEventListener('change', e => { rasc.raiz = e.target.value; desenhar(); });
      }
      if (passo === 3) {
        const r = raizObj();
        box.querySelectorAll('[data-campo]').forEach(i => i.addEventListener('input', () => {
          rasc.campos[i.dataset.campo] = i.value.trim();
          const cel = box.querySelector('[data-val="' + i.dataset.campo + '"]');
          if (cel) cel.innerHTML = r && i.value.trim() ? valorCurto(N().obter(r, i.value.trim())) : '';
        }));
        box.querySelectorAll('[data-item]').forEach(i => i.addEventListener('input', () => {
          rasc.itens[i.dataset.item] = i.value.trim();
          const lst = itensLista(), cel = box.querySelector('[data-ival="' + i.dataset.item + '"]');
          if (cel) cel.innerHTML = lst && lst[0] && i.value.trim() ? valorCurto(N().obter(lst[0], i.value.trim())) : '';
        }));
        q('#erp-it-lista').addEventListener('change', e => { rasc.itens.lista = e.target.value.trim(); desenhar(); });
        const sg = q('#erp-sugerir');
        if (sg) sg.addEventListener('click', () => { const n = sugerir(); desenhar(); ui.toast(n ? n + ' campo(s) sugerido(s). Confira a coluna "Valor no exemplo".' : 'Nenhuma sugestão nova — os campos já estão preenchidos ou não foram reconhecidos.', n ? 'ok' : 'warn'); });
      }
      if (passo === 4) {
        q('#erp-r-sit').addEventListener('input', e => { rasc.regras.situacoesBloqueadas = e.target.value; });
        q('#erp-r-tipo').addEventListener('input', e => { rasc.regras.tiposEntregaAceitos = e.target.value; });
        q('#erp-r-fat').addEventListener('input', e => { rasc.regras.faturadoValores = e.target.value; });
      }
      if (passo === 5) {
        const fb = q('#erp-f-ir');
        if (fb) {
          const num = q('#erp-f-num');
          num.addEventListener('keydown', e => { if (e.key === 'Enter') fb.click(); });
          fb.addEventListener('click', () => testarOnline(num.value, '#erp-f-res', desenhar));
        }
        q('#erp-salvar').addEventListener('click', () => {
          const falta = validar();
          if (falta.length) { ui.toast('Falta configurar: ' + falta.join(', ') + '.', 'warn', 8000); return; }
          const s = salva();
          if (s && s.ativo && !testeValido()) { ui.toast('A integração está ativa: teste a nova configuração no ERP e use "Salvar e manter ativo".', 'warn', 8000); return; }
          gravar(s ? !!s.ativo : false);
          ui.toast('Configuração do ERP salva' + (salva().ativo ? '.' : ' (ainda inativa — o agendamento continua na base de demonstração).'));
          desenhar();
        });
        q('#erp-ativar').addEventListener('click', async () => {
          if (!testeValido()) { ui.toast('Faça um teste bem-sucedido no ERP primeiro.', 'warn'); return; }
          const falta = validar();
          if (falta.length) { ui.toast('Falta configurar: ' + falta.join(', ') + '.', 'warn', 8000); return; }
          const s = salva();
          if (!(s && s.ativo)) {
            const r = await ui.confirmar({ titulo: 'Ativar integração com o ERP', ok: 'Ativar', mensagem: 'A partir de agora, o "Novo agendamento" consulta os pedidos direto no ERP configurado, para todos os usuários. Os pedidos da base de demonstração deixam de ser encontrados.' });
            if (!r.ok) return;
          }
          gravar(true);
          ui.toast('Integração com o ERP ativa. O agendamento já consulta o ERP.');
          desenhar();
        });
        const ds = q('#erp-desativar');
        if (ds) ds.addEventListener('click', async () => {
          const r = await ui.confirmar({ titulo: 'Desativar integração', ok: 'Desativar', mensagem: 'O agendamento volta a usar a base de demonstração. A configuração e a credencial ficam guardadas para reativar depois.' });
          if (!r.ok) return;
          const sv = salva(); rasc = Object.assign(rasc, { ativo: false });
          DT.db.set('erp', Object.assign({}, sv, { ativo: false, atualizadoEm: new Date().toISOString() }));
          DT.audit.registrar('Desativou integração com o ERP', 'Configuração', 'erp', 'ativo', 'inativo');
          ui.toast('Integração desativada. O agendamento voltou à base de demonstração.');
          desenhar();
        });
      }
    }

    desenhar();
    if (nuvem) carregarCredencial();
  }

  return { montar, ativa, emUso, salva };
})();
