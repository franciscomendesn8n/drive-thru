/* =====================================================================
   DRIVE THRU — Exportação dos relatórios em PDF
   Gera o arquivo direto no navegador (jsPDF + AutoTable, em js/vendor),
   com cabeçalho da empresa (logo Condor), período, filtros aplicados,
   indicadores-resumo, gráfico de barras e a tabela completa.
   ===================================================================== */
window.DT = window.DT || {};

DT.relatorioPDF = (function () {
  /* Cores da identidade (logo Condor) */
  const COR = {
    grafite: [48, 58, 66],       // #303A42 — cinza oficial: faixa do cabeçalho / cabeçalho da tabela
    vermelho: [171, 15, 20],     // #AB0F14 — vermelho oficial da logo
    tinta: [30, 32, 38],
    tinta2: [92, 97, 108],
    tinta3: [138, 143, 153],
    linha: [222, 224, 229],
    zebra: [246, 246, 248],
    card: [247, 247, 249],
    ok: [30, 138, 76],
    alerta: [184, 106, 0]
  };

  /* O que cada seção mede — aparece logo abaixo do título no PDF */
  const DESCRICAO = {
    agendamentos: 'Todos os agendamentos do período, com responsável, status e situação do atendimento em relação ao horário marcado.',
    concluidas: 'Retiradas finalizadas: horário de chegada, espera, tempo de atendimento, doca utilizada e responsável pelo carregamento.',
    atrasos: 'Clientes que chegaram após o horário agendado além da tolerância configurada, e em quais janelas os atrasos se concentram.',
    naocompareceu: 'Agendamentos em que o cliente não compareceu, com contato para retorno do Comercial e a taxa de ausência do período.',
    tempomedio: 'Médias diárias de espera, atendimento e tempo total das retiradas concluídas.',
    produtividade: 'Carregamentos, atendimentos em doca, itens carregados e tempo médio por funcionário da Logística.',
    janelas: 'Vagas ofertadas e ocupadas por janela de horário, com ausências e cancelamentos — base para ajustar a capacidade.'
  };

  let logoCache = null;

  function jsPDFDisponivel() {
    return !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable);
  }

  /* Carrega a logo (mesma origem) e devolve { data, w, h } em PNG base64 */
  function carregarLogo() {
    const src = DT.aparencia ? DT.aparencia.logo() : DT.APP.empresa.logo;
    if (logoCache && logoCache.src === src) return Promise.resolve(logoCache);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          logoCache = { src: src, data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
          resolve(logoCache);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /* Texto limpo a partir do HTML da célula (badges, tags, durações formatadas) */
  const tmp = document.createElement('div');
  function texto(html) {
    tmp.innerHTML = html === null || html === undefined ? '' : String(html);
    return (tmp.textContent || '').replace(/ | /g, ' ').replace(/\s+/g, ' ').trim();
  }
  const limpo = v => texto(U().esc(v === null || v === undefined ? '' : String(v)));
  function U() { return DT.util; }

  function agora() {
    const d = new Date();
    return U().fmtData(U().dataISO(d)) + ' às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* Faixa escura com a logo — completa na 1ª página, compacta nas demais */
  function cabecalho(doc, o, logo, completo) {
    const W = doc.internal.pageSize.getWidth();
    const H = completo ? 30 : 16;
    doc.setFillColor.apply(doc, COR.grafite); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor.apply(doc, COR.vermelho); doc.rect(0, H, W, 1.4, 'F');

    const lh = completo ? 15 : 8.5;
    if (logo) doc.addImage(logo.data, 'PNG', 14, (H - lh) / 2, lh * logo.w / logo.h, lh, 'logo-condor', 'FAST');
    else { doc.setFont('helvetica', 'bold'); doc.setFontSize(completo ? 20 : 13); doc.setTextColor(255, 255, 255); doc.text(DT.APP.empresa.nome.toUpperCase(), 14, H / 2 + 2.5); }

    doc.setTextColor(255, 255, 255);
    if (completo) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(211, 216, 221);
      doc.text('RELATÓRIO DRIVE THRU · AGENDAMENTO DE RETIRADA', W - 14, 10, { align: 'right', charSpace: 0.3 });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
      doc.text(o.titulo, W - 14, 18, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(211, 216, 221);
      doc.text('Período: ' + o.periodo, W - 14, 24, { align: 'right' });
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(o.titulo, W - 14, 7.5, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(211, 216, 221);
      doc.text(o.periodo + ' (continuação)', W - 14, 12, { align: 'right' });
    }
    return H + 1.4;
  }

  function rodape(doc, pagina) {
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setDrawColor.apply(doc, COR.linha); doc.setLineWidth(0.3); doc.line(14, H - 12, W - 14, H - 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, COR.tinta3);
    doc.text(DT.APP.empresa.nome + ' — ' + DT.APP.empresa.slogan + ' · Drive Thru v' + DT.APP.versao, 14, H - 7.5);
    doc.text('Página ' + pagina + ' de {total_paginas}', W - 14, H - 7.5, { align: 'right' });
  }

  /* Linha de indicadores (cartões) */
  function resumo(doc, itens, y) {
    if (!itens || !itens.length) return y;
    const W = doc.internal.pageSize.getWidth();
    const gap = 4, n = itens.length, w = (W - 28 - gap * (n - 1)) / n, h = 17;
    itens.forEach((r, i) => {
      const x = 14 + i * (w + gap);
      doc.setFillColor.apply(doc, COR.card); doc.setDrawColor.apply(doc, COR.linha); doc.setLineWidth(0.2);
      doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');
      doc.setFillColor.apply(doc, COR.vermelho); doc.rect(x, y, 1.2, h, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, COR.tinta2);
      doc.text(doc.splitTextToSize(limpo(r[0]).toUpperCase(), w - 7)[0], x + 4.5, y + 6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor.apply(doc, COR.tinta);
      doc.text(limpo(r[1]), x + 4.5, y + 13.5);
    });
    return y + h + 7;
  }

  /* Gráfico de barras horizontais (mesmos dados da tela) */
  function barras(doc, b, y, topoPagina) {
    if (!b || !b.itens || !b.itens.length) return y;
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const itens = b.itens.slice(0, 24);
    const alt = 5.2, rotW = 22, valW = 18;
    if (y + 9 + itens.length * alt > H - 20) { doc.addPage(); y = topoPagina(); }
    titulo(doc, b.titulo, y); y += 6;
    const x0 = 14 + rotW, trilho = W - 28 - rotW - valW;
    itens.forEach((it, i) => {
      const yy = y + i * alt;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, COR.tinta2);
      doc.text(limpo(it.rot), 14, yy + 3.4);
      doc.setFillColor(236, 237, 240); doc.roundedRect(x0, yy + 0.8, trilho, 3.2, 0.8, 0.8, 'F');
      const cor = it.cls === 'crit' || it.cls === 'alt' ? COR.vermelho : it.cls === 'ok' ? COR.ok : COR.grafite;
      doc.setFillColor.apply(doc, cor);
      doc.roundedRect(x0, yy + 0.8, Math.max(1, trilho * Math.min(100, it.pct || 0) / 100), 3.2, 0.8, 0.8, 'F');
      doc.setTextColor.apply(doc, COR.tinta);
      doc.text(limpo(it.txt), W - 14, yy + 3.4, { align: 'right' });
    });
    if (b.itens.length > itens.length) {
      doc.setFontSize(7.5); doc.setTextColor.apply(doc, COR.tinta3);
      doc.text('Exibindo ' + itens.length + ' de ' + b.itens.length + ' itens no gráfico; a tabela abaixo traz todos.', 14, y + itens.length * alt + 3);
      y += 4;
    }
    return y + itens.length * alt + 6;
  }

  function titulo(doc, t, y) {
    doc.setFillColor.apply(doc, COR.vermelho); doc.rect(14, y - 3.2, 1.2, 4.2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, COR.tinta);
    doc.text(limpo(t), 17.5, y);
  }

  /**
   * o = { tipo, titulo, periodo, filtros: [[rótulo, valor]], resumo, barras, colunas, linhas, usuario, unidade, arquivo }
   */
  async function gerar(o) {
    if (!jsPDFDisponivel()) throw new Error('Biblioteca de PDF não carregada.');
    const logo = await carregarLogo();
    const paisagem = o.colunas.length > 6;
    const doc = new window.jspdf.jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: o.titulo + ' — ' + o.periodo, subject: 'Relatório Drive Thru', author: DT.APP.empresa.nome, creator: 'Drive Thru v' + DT.APP.versao });
    const W = doc.internal.pageSize.getWidth();
    const topoContinuacao = () => cabecalho(doc, o, logo, false) + 7;

    let y = cabecalho(doc, o, logo, true) + 8;

    /* Descrição da seção */
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, COR.tinta2);
    const desc = doc.splitTextToSize(DESCRICAO[o.tipo] || '', W - 28);
    doc.text(desc, 14, y); y += desc.length * 4.2 + 2;

    /* Metadados: emissão e filtros */
    doc.setFontSize(8); doc.setTextColor.apply(doc, COR.tinta3);
    const meta = ['Emitido em ' + agora(), o.usuario ? 'por ' + o.usuario : '', o.unidade ? 'Unidade: ' + o.unidade : ''].filter(Boolean).join('  ·  ');
    doc.text(meta, 14, y); y += 4.2;
    const filtros = (o.filtros || []).filter(f => f[1]).map(f => f[0] + ': ' + f[1]).join('  ·  ');
    const fl = doc.splitTextToSize('Filtros: ' + (filtros || 'nenhum (todos os registros do período)'), W - 28);
    doc.text(fl, 14, y); y += fl.length * 4 + 5;

    y = resumo(doc, o.resumo, y);
    y = barras(doc, o.barras, y, topoContinuacao);

    /* Tabela completa */
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = topoContinuacao(); }
    titulo(doc, 'Detalhamento (' + o.linhas.length + ' registro' + (o.linhas.length === 1 ? '' : 's') + ')', y);
    y += 4;

    const head = [o.colunas.map(c => c.label)];
    const body = o.linhas.map(l => o.colunas.map(c => texto(c.html(l))));
    const estilosColuna = {};
    o.colunas.forEach((c, i) => { if (c.r) estilosColuna[i] = { halign: 'right' }; });

    doc.autoTable({
      head, body, startY: y,
      margin: { left: 14, right: 14, top: 26, bottom: 18 },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: paisagem ? 7.8 : 8.5, cellPadding: { top: 2, bottom: 2, left: 2.2, right: 2.2 }, textColor: COR.tinta, lineColor: COR.linha, lineWidth: { bottom: 0.15 }, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: COR.grafite, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: paisagem ? 7.5 : 8, lineWidth: 0 },
      alternateRowStyles: { fillColor: COR.zebra },
      columnStyles: estilosColuna,
      didParseCell: d => {
        if (d.section === 'head' && o.colunas[d.column.index] && o.colunas[d.column.index].r) d.cell.styles.halign = 'right';
        if (d.section !== 'body') return;
        const rot = o.colunas[d.column.index].label, v = String(d.cell.raw || '');
        if ((rot === 'Situação' && v === 'Atrasado') || (rot === 'Chegada x agendado' && /^\+/.test(v) && o.tipo !== 'tempomedio')) { d.cell.styles.textColor = COR.vermelho; d.cell.styles.fontStyle = 'bold'; }
        if (rot === 'Situação' && v === 'No horário') d.cell.styles.textColor = COR.ok;
        if (rot === 'Ocupação' && parseInt(v, 10) >= 90) { d.cell.styles.textColor = COR.vermelho; d.cell.styles.fontStyle = 'bold'; }
      },
      didDrawPage: () => {
        if (doc.internal.getCurrentPageInfo().pageNumber > 1) cabecalho(doc, o, logo, false);
      }
    });

    if (!o.linhas.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor.apply(doc, COR.tinta3);
      doc.text('Nenhum registro para os filtros escolhidos.', 14, doc.lastAutoTable.finalY + 7);
    }

    /* Rodapé em todas as páginas */
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) { doc.setPage(p); rodape(doc, p); }
    doc.putTotalPages('{total_paginas}');

    doc.save(o.arquivo);
    return true;
  }

  return { gerar, disponivel: jsPDFDisponivel };
})();
