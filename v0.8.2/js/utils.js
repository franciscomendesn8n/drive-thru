/* =====================================================================
   Utilitários: datas, formatação, hash de senha, CSV
   ===================================================================== */
window.DT = window.DT || {};

DT.util = (function () {
  const pad = n => String(n).padStart(2, '0');

  /* Data local no formato YYYY-MM-DD */
  function dataISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function horaHM(d) {
    d = d || new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /* Converte 'YYYY-MM-DD' + 'HH:MM' em Date local */
  function toDate(data, hora) {
    const [y, m, dd] = data.split('-').map(Number);
    const [h, mi] = (hora || '00:00').split(':').map(Number);
    return new Date(y, m - 1, dd, h, mi, 0, 0);
  }
  function minutos(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
  }
  function hmDeMinutos(total) {
    return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  }
  function addDias(dataStr, n) {
    const d = toDate(dataStr, '12:00');
    d.setDate(d.getDate() + n);
    return dataISO(d);
  }
  function fmtData(dataStr) {
    if (!dataStr) return '—';
    const [y, m, d] = dataStr.slice(0, 10).split('-');
    return d + '/' + m + '/' + y;
  }
  function fmtDataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return fmtData(dataISO(d)) + ' ' + horaHM(d);
  }
  function fmtHora(iso) {
    if (!iso) return '—';
    return horaHM(new Date(iso));
  }
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  function diaSemana(dataStr) {
    return DIAS[toDate(dataStr, '12:00').getDay()];
  }
  function fmtMoeda(v) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  /* Diferença em minutos entre dois ISO/Date (b - a) */
  function difMin(a, b) {
    if (!a || !b) return null;
    return Math.round((new Date(b) - new Date(a)) / 60000);
  }
  function fmtDuracao(min) {
    if (min === null || min === undefined || isNaN(min)) return '—';
    const sinal = min < 0 ? '-' : '';
    const m = Math.abs(Math.round(min));
    if (m < 60) return sinal + m + ' min';
    return sinal + Math.floor(m / 60) + 'h' + pad(m % 60);
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function media(arr) {
    const v = arr.filter(x => x !== null && x !== undefined && !isNaN(x));
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }

  /* SHA-256 em JS puro (funciona inclusive abrindo o arquivo direto, sem servidor).
     Obs.: em produção a autenticação deve ser feita no servidor. */
  function sha256(ascii) {
    function rrot(v, a) { return (v >>> a) | (v << (32 - a)); }
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    const hash = [], k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii = unescape(encodeURIComponent(ascii));
    const bitLen = ascii.length * 8;
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((bitLen / maxWord) | 0);
    words[words.length] = (bitLen);
    let h = hash.slice(0, 8);
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = h;
      h = h.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = h[0], e = h[4];
        const temp1 = h[7] + (rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25)) + ((e & h[5]) ^ ((~e) & h[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rrot(w15, 7) ^ rrot(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rrot(w2, 17) ^ rrot(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(temp1 + temp2) | 0].concat(h);
        h[4] = (h[4] + temp1) | 0;
        h.length = 8;
      }
      for (let i = 0; i < 8; i++) h[i] = (h[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (h[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    void asciiBitLength;
    return result;
  }
  function hashSenha(login, senha) {
    return sha256('dt::' + String(login).toLowerCase() + '::' + senha);
  }

  function toCSV(colunas, linhas) {
    const q = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const out = [colunas.map(c => q(c.label)).join(';')];
    linhas.forEach(l => out.push(colunas.map(c => q(typeof c.csv === 'function' ? c.csv(l) : l[c.key])).join(';')));
    return '﻿' + out.join('\n');
  }

  /* Gerador pseudoaleatório determinístico (dados de demonstração) */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Valida a senha pela regra de DT.SENHA. Retorna a mensagem de erro ou null. */
  function validarSenha(senha) {
    const r = DT.SENHA || { minimo: 8, simbolos: '' };
    const falta = [];
    senha = String(senha || '');
    if (senha.length < r.minimo) falta.push('pelo menos ' + r.minimo + ' caracteres');
    if (!/[a-z]/.test(senha)) falta.push('uma letra minúscula');
    if (!/[A-Z]/.test(senha)) falta.push('uma letra maiúscula');
    if (!/[0-9]/.test(senha)) falta.push('um número');
    if (!senha.split('').some(ch => r.simbolos.indexOf(ch) >= 0)) falta.push('um símbolo (ex.: ! @ # $ %)');
    return falta.length ? 'A senha precisa ter ' + falta.join(', ') + '.' : null;
  }

  return { validarSenha, pad, dataISO, horaHM, toDate, minutos, hmDeMinutos, addDias, fmtData, fmtDataHora, fmtHora, diaSemana,
    fmtMoeda, difMin, fmtDuracao, uid, esc, media, sha256, hashSenha, toCSV, rng };
})();
