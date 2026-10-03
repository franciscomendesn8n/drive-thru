/* =====================================================================
   Núcleo da integração com o ERP (sem dependências)
   ---------------------------------------------------------------------
   Usado no navegador (assistente em Configurações, teste com exemplo
   colado) e na função de servidor dt-erp (cópia em
   supabase/functions/dt-erp/erp-nucleo.js — manter as duas iguais).
   • lê um campo por "caminho" (ex.: cliente.nome, itens.0.codigo)
   • traduz a resposta do ERP para o formato de pedido do Drive Thru
   • aplica as regras de elegibilidade configuradas
   ===================================================================== */
(function (raiz) {
  'use strict';

  /* Campos do pedido no Drive Thru: [chave, rótulo, obrigatório, dica] */
  const CAMPOS = [
    ['numero', 'Número do pedido', true, 'Nº do pedido de venda'],
    ['dataPedido', 'Data do pedido', true, 'Data (ou data e hora) de emissão'],
    ['horaPedido', 'Hora do pedido', false, 'Só se vier separada da data'],
    ['cliente', 'Cliente', true, 'Nome ou razão social'],
    ['telefone', 'Telefone do cliente', true, 'Usado na consulta do cliente sem o link'],
    ['valor', 'Valor total', false, 'Total do pedido'],
    ['vendedor', 'Vendedor', false, 'Nome do vendedor'],
    ['formaPagamento', 'Forma de pagamento', false, 'Condição / forma de pagamento'],
    ['situacao', 'Situação do pedido', true, 'Aprovado, cancelado, bloqueado…'],
    ['notaFiscal', 'Nota fiscal', false, 'Nº da NF, quando emitida'],
    ['statusFaturamento', 'Status de faturamento', false, 'Se vazio, usa a nota fiscal'],
    ['tipoEntrega', 'Tipo de entrega', false, 'Retira, entrega…'],
    ['elegivel', 'Liberado para Drive Thru', false, 'Campo sim/não, se o ERP tiver']
  ];
  const ITENS = [['sku', 'Código do produto'], ['descricao', 'Descrição'], ['qtd', 'Quantidade'], ['un', 'Unidade'], ['ean', 'Código de barras (EAN)']];
  /* EAN-13 de demonstração a partir do código do produto (789 + código + dígito verificador) */
  function eanDe(sku) {
    const base = ('789' + String(sku || '').replace(/\D/g, '').padStart(9, '0')).slice(-12).padStart(12, '0');
    let soma = 0;
    for (let i = 0; i < 12; i++) soma += Number(base[i]) * (i % 2 ? 3 : 1);
    return base + ((10 - soma % 10) % 10);
  }

  function obter(obj, caminho) {
    if (caminho == null || caminho === '') return obj;
    const partes = String(caminho).split('.').map(s => s.trim()).filter(Boolean);
    let v = obj;
    for (const p of partes) {
      if (v == null) return undefined;
      if (Array.isArray(v) && /^\d+$/.test(p)) v = v[Number(p)];
      else if (typeof v === 'object') v = v[p];
      else return undefined;
    }
    return v;
  }

  /* Lista os caminhos de um JSON (para sugerir no de-para) */
  function caminhos(obj, prefixo, out, prof) {
    out = out || []; prefixo = prefixo || ''; prof = prof || 0;
    if (prof > 6 || out.length > 400) return out;
    if (Array.isArray(obj)) {
      if (prefixo) out.push({ caminho: prefixo, tipo: 'lista', exemplo: obj.length + ' item(ns)' });
      if (obj.length && typeof obj[0] === 'object') caminhos(obj[0], prefixo ? prefixo + '.0' : '0', out, prof + 1);
      return out;
    }
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(k => {
        const c = prefixo ? prefixo + '.' + k : k, v = obj[k];
        if (v && typeof v === 'object') caminhos(v, c, out, prof + 1);
        else out.push({ caminho: c, tipo: typeof v, exemplo: v === null ? 'null' : String(v).slice(0, 60) });
      });
    }
    return out;
  }

  const txt = v => v == null ? '' : String(v).trim();
  const lista = s => (Array.isArray(s) ? s : String(s || '').split(/[,;\n]/)).map(x => String(x).trim().toUpperCase()).filter(Boolean);
  function numero(v) {
    if (typeof v === 'number') return v;
    let s = txt(v).replace(/[^\d,.-]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = Number(s); return isFinite(n) ? n : null;
  }
  const pad = n => String(n).padStart(2, '0');
  /* Datas: 2026-10-03, 2026-10-03T09:30:00(-03:00), 03/10/2026 [09:30], 20261003 */
  function dataHora(v) {
    const s = txt(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (m) return { data: m[1] + '-' + m[2] + '-' + m[3], hora: m[4] ? m[4] + ':' + m[5] : '' };
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (m) return { data: m[3] + '-' + m[2] + '-' + m[1], hora: m[4] ? m[4] + ':' + m[5] : '' };
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return { data: m[1] + '-' + m[2] + '-' + m[3], hora: '' };
    if (typeof v === 'number' && v > 1e11) { const d = new Date(v); return { data: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), hora: pad(d.getHours()) + ':' + pad(d.getMinutes()) }; }
    return { data: '', hora: '' };
  }
  function hora(v) { const m = txt(v).match(/(\d{1,2}):(\d{2})/); return m ? pad(m[1]) + ':' + m[2] : ''; }
  function simNao(v) {
    if (typeof v === 'boolean') return v;
    const s = txt(v).toUpperCase();
    if (!s) return null;
    if (['S', 'SIM', 'Y', 'YES', 'TRUE', '1', 'T', 'V'].indexOf(s) >= 0) return true;
    if (['N', 'NAO', 'NÃO', 'NO', 'FALSE', '0', 'F'].indexOf(s) >= 0) return false;
    return null;
  }

  /* Raiz do pedido dentro da resposta (ex.: "data", "pedido", "result.0") */
  function raizPedido(resposta, cfg) {
    let r = obter(resposta, cfg.raiz || '');
    if (Array.isArray(r)) r = r.length ? r[0] : null;
    return r && typeof r === 'object' ? r : null;
  }

  /* Resposta do ERP → pedido do Drive Thru. Devolve { pedido, avisos } ou { pedido: null } */
  function mapear(resposta, cfg, numeroPedido) {
    cfg = cfg || {};
    const c = cfg.campos || {}, it = cfg.itens || {}, rg = cfg.regras || {};
    const r = raizPedido(resposta, cfg);
    if (!r) return { pedido: null, avisos: ['Pedido não encontrado na resposta (confira "onde está o pedido").'] };
    const avisos = [];
    const v = k => { if (!c[k]) return undefined; const x = obter(r, c[k]); if (x === undefined) avisos.push('Campo "' + rotulo(k) + '" não encontrado em "' + c[k] + '".'); return x; };
    const dh = dataHora(v('dataPedido'));
    const hp = c.horaPedido ? hora(v('horaPedido')) : dh.hora;
    const nf = txt(v('notaFiscal')) || null;
    let fat;
    if (c.statusFaturamento) fat = lista(rg.faturadoValores || 'FATURADO').indexOf(txt(v('statusFaturamento')).toUpperCase()) >= 0;
    else fat = !!nf;
    // itens
    let itensErp = it.lista ? obter(r, it.lista) : [];
    if (it.lista && !Array.isArray(itensErp)) { avisos.push('Lista de itens não encontrada em "' + it.lista + '".'); itensErp = []; }
    const itens = (itensErp || []).map(i => ({
      sku: txt(obter(i, it.sku)), descricao: txt(obter(i, it.descricao)), qtd: numero(obter(i, it.qtd)) || 0, un: txt(obter(i, it.un)), ean: it.ean ? txt(obter(i, it.ean)) : ''
    }));
    const situacao = txt(v('situacao'));
    const tipoEntrega = txt(v('tipoEntrega'));
    const pedido = {
      numero: txt(v('numero')) || String(numeroPedido || ''),
      notaFiscal: nf,
      dataPedido: dh.data,
      horaPedido: hp,
      cliente: txt(v('cliente')),
      telefone: txt(v('telefone')),
      qtdItens: itens.reduce((a, b) => a + (b.qtd || 0), 0),
      valor: numero(v('valor')),
      vendedor: txt(v('vendedor')),
      formaPagamento: txt(v('formaPagamento')),
      situacao: situacao,
      statusFaturamento: fat ? 'Faturado' : 'Não faturado',
      statusPreparacao: 'Não iniciado',
      tipoEntrega: tipoEntrega,
      itens: itens,
      origem: 'erp'
    };
    // elegibilidade (regras configuradas)
    const motivos = [];
    if (situacao && lista(rg.situacoesBloqueadas).indexOf(situacao.toUpperCase()) >= 0) motivos.push('Pedido com situação "' + situacao + '" no ERP.');
    const aceitos = lista(rg.tiposEntregaAceitos);
    if (c.tipoEntrega && aceitos.length && aceitos.indexOf(tipoEntrega.toUpperCase()) < 0) motivos.push('Tipo de entrega "' + (tipoEntrega || 'não informado') + '" não é retirada pelo Drive Thru.');
    if (c.elegivel && simNao(v('elegivel')) === false) motivos.push('Pedido não liberado para o Drive Thru no ERP.');
    pedido.elegivelDriveThru = motivos.length === 0;
    pedido.motivoInelegivel = motivos.length ? motivos.join(' ') : null;
    CAMPOS.forEach(([k, rot, obrig]) => { if (obrig && !c[k] && k !== 'numero') avisos.push('Campo obrigatório "' + rot + '" sem caminho configurado.'); });
    if (!pedido.dataPedido && c.dataPedido) avisos.push('Data do pedido em formato não reconhecido.');
    return { pedido: pedido, avisos: avisos.filter((x, i, a) => a.indexOf(x) === i) };
  }
  function rotulo(k) { const f = CAMPOS.find(x => x[0] === k); return f ? f[1] : k; }

  function montarUrl(cfg, numeroPedido) {
    const n = encodeURIComponent(String(numeroPedido).replace(/\D/g, ''));
    const u = String(cfg.url || '');
    return u.indexOf('{numero}') >= 0 ? u.split('{numero}').join(n) : u.replace(/\/?$/, '/') + n;
  }
  /* Cabeçalhos de autenticação (a credencial só existe no servidor) */
  function cabecalhos(cfg, credencial) {
    const h = { Accept: 'application/json' };
    if (!credencial) return h;
    if (cfg.auth === 'bearer') h.Authorization = 'Bearer ' + credencial;
    else if (cfg.auth === 'basic') h.Authorization = 'Basic ' + (typeof btoa === 'function' ? btoa(credencial) : credencial);
    else if (cfg.auth === 'apikey') h[cfg.cabecalho || 'X-API-Key'] = credencial;
    return h;
  }

  /* Preenchimento do "ERP de demonstração" (função dt-erp-demo) */
  const DEMO = {
    url: '{SUPABASE}/functions/v1/dt-erp-demo/pedidos/{numero}',
    auth: 'apikey', cabecalho: 'X-API-Key', timeoutMs: 8000, raiz: 'data',
    campos: { numero: 'nr_pedido', dataPedido: 'dt_emissao', horaPedido: '', cliente: 'cliente.razao_social', telefone: 'cliente.telefone',
      valor: 'valor_total', vendedor: 'vendedor.nome', formaPagamento: 'condicao_pagamento', situacao: 'situacao', notaFiscal: 'nota_fiscal',
      statusFaturamento: 'situacao', tipoEntrega: 'tipo_entrega', elegivel: '' },
    itens: { lista: 'itens', sku: 'cod_produto', descricao: 'descricao', qtd: 'qtde', un: 'unidade', ean: 'ean' },
    regras: { situacoesBloqueadas: 'CANCELADO, BLOQUEADO', tiposEntregaAceitos: 'RETIRA', faturadoValores: 'FATURADO' },
    chave: 'demo-condor-2026'
  };

  const api = { CAMPOS, ITENS, DEMO, eanDe, obter, caminhos, mapear, montarUrl, cabecalhos, dataHora, numero, simNao };
  raiz.DT_ERP_NUCLEO = api;
  if (typeof window !== 'undefined') { window.DT = window.DT || {}; window.DT.erpNucleo = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
