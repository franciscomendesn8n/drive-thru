"""Teste automático do Drive Thru (modo demonstração, sem servidor).
Roda no GitHub a cada envio: abre o sistema, entra com os perfis de
demonstração e confere as telas principais e as regras de permissão.
Uso local:  pip install playwright && playwright install chromium && python tests/teste_fumaca.py
"""
import datetime, pathlib, sys
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
URL = (RAIZ / 'index.html').as_uri()
TZ = ZoneInfo('America/Sao_Paulo')
falhas = []

def checa(cond, msg):
    print(('OK   ' if cond else 'FALHA') + ' ' + msg)
    if not cond: falhas.append(msg)

def entrar(pg, login, senha=None):
    if senha is None:   # senha da base de demonstração local (lida do próprio sistema)
        senha = pg.evaluate("DT.seed.USUARIOS.find(u=>u.login===%r).senha" % login)
    pg.fill('#lg-user', login); pg.fill('#lg-pass', senha); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    if pg.locator('#lgpd-ciente').count(): pg.check('#lgpd-ciente'); pg.click('#lgpd-ok'); pg.wait_for_timeout(400)

def sair(pg): pg.click('#btn-sair'); pg.wait_for_timeout(400)
def ir(pg, h): pg.evaluate("location.hash=%r" % h); pg.wait_for_timeout(400)

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={'width': 1366, 'height': 900})
    ctx.clock.install(time=datetime.datetime(2026, 10, 5, 10, 0, tzinfo=TZ))   # segunda-feira, 10h
    pg = ctx.new_page(); erros = []
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(500)

    # Usuários da base de demonstração local (não existem no servidor real)
    entrar(pg, 'admin')
    checa(pg.evaluate('DT.APP.versao') >= '0.9.0', 'versão carregada: ' + pg.evaluate('DT.APP.versao'))
    for aba in ['operacao', 'erp', 'separacao', 'avisos', 'aparencia', 'seguranca', 'saude']:
        ir(pg, '#config/' + aba)
        checa(pg.locator('#cf-aba section.card').count() >= 1, 'Configurações › ' + aba)
    for tela in ['agendar', 'agenda', 'preparacao', 'checkin', 'atendimento', 'entrega', 'pedido', 'painel', 'dashboard', 'relatorios', 'auditoria', 'usuarios']:
        ir(pg, '#' + tela)
        checa(pg.evaluate('location.hash').startswith('#' + tela) and pg.locator('#view').inner_html().strip() != '', 'tela ' + tela)
    num = pg.evaluate("DT.db.agendamentos().find(a=>(a.pedido.itens||[]).length>1).pedido.numero")
    html = pg.evaluate("DT.impressao.romaneioHTML(DT.db.agendamentos().find(a=>a.pedido.numero===%r))" % num)
    checa('<svg' in html and num in html, 'romaneio com código de barras')
    ag = pg.evaluate("(()=>{const a=DT.db.agendamentos().find(x=>x.data===DT.util.dataISO()&&DT.STATUS_GRUPOS.ativosPreChegada.includes(x.status));return {id:a.id,link:DT.ag.linkCliente(a)}})()")
    ir(pg, '#checkin'); pg.fill('#ck-busca', ag['link']); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    checa(pg.evaluate('DT.views.checkin.sel') == ag['id'], 'check-in pelo QR do cliente')
    sair(pg)

    # Vendedor: não registra entrega nem altera a preparação
    entrar(pg, 'joao.silva')
    r = pg.evaluate("(()=>{const a=DT.db.agendamentos().find(x=>x.status==='Agendado');return DT.ag.avancarPreparacao(a.id).ok})()")
    checa(r is False, 'vendedor não altera a preparação')
    ir(pg, '#config'); checa(not pg.evaluate('location.hash').startswith('#config'), 'vendedor sem acesso às Configurações')
    sair(pg)

    # Operador de coletor: só vê o que precisa
    entrar(pg, 'marcos.pereira')
    ir(pg, '#painel'); checa(pg.locator('.pn').count() == 0, 'coletor sem acesso ao painel de TV')
    sair(pg)

    # Celular: sem rolagem lateral
    pg.set_viewport_size({'width': 390, 'height': 800}); entrar(pg, 'admin'); ir(pg, '#dashboard')
    checa(pg.evaluate('document.documentElement.scrollWidth') <= 392, 'celular sem rolagem lateral')

    checa(not erros, 'sem erros de JavaScript ' + str(erros[:3]))
    nav.close()

print('\n%d falha(s)' % len(falhas))
sys.exit(1 if falhas else 0)
