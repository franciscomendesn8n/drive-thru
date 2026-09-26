# Drive Thru — Agendamento e Controle de Retiradas

Aplicativo web (HTML + CSS + JavaScript puro) para controlar a retirada de pedidos pelo Drive Thru,
do agendamento feito pelo Comercial até a entrega da mercadoria no veículo do cliente.

## Como abrir

Não precisa instalar nada. Abra o arquivo `index.html` no navegador (Chrome, Edge ou Firefox).

Para publicar na rede da empresa, copie a pasta inteira para qualquer servidor web (IIS, Apache, Nginx)
ou rode localmente:

```bash
python -m http.server 8080
# depois acesse http://localhost:8080
```

## Usuários de teste

| Perfil        | Usuário          | Senha    |
|---------------|------------------|----------|
| Administrador | `admin`          | `admin123` |
| Comercial     | `joao.silva`     | `123456` |
| Comercial     | `fernanda.rocha` | `123456` |
| Logística     | `ana.santos`     | `123456` |
| Logística     | `carlos.lima`    | `123456` |
| Gestor        | `gestor`         | `123456` |

## Pedidos de teste (ERP simulado)

| Pedido            | Situação                                  |
|-------------------|-------------------------------------------|
| 123456, 123789, 124001, 125300–125320 | Livres para agendar |
| 123101 a 123116   | Já agendados hoje (vários status)         |
| 125900 / 125901 / 125902 | Não elegíveis (motivos diferentes) |
| 999999            | Inexistente                               |

Na primeira abertura o sistema gera 14 dias de histórico e a agenda de hoje com base no horário atual,
para que dashboard, alertas e relatórios já tenham dados. Em **Configurações** é possível recriar os
dados de demonstração ou apagar os agendamentos e começar a operação real.

## Telas

| Tela | Perfil | O que faz |
|---|---|---|
| Login | todos | Usuário e senha; o menu é montado pelas permissões do perfil |
| Novo agendamento | Comercial | Digita o pedido → dados do ERP → escolhe data e janela → confirmação |
| Agenda de retiradas | todos | Agenda visual por janela, vagas, status, alertas, reagendar/cancelar |
| Preparação | Logística | Agendado → Em preparação → Separado → Conferido → Faturado → Pronto |
| Check-in | Logística | Chegada do cliente com horário automático (manual só com permissão) |
| Atendimento | Logística | Doca, responsáveis, início do atendimento e do carregamento |
| Entrega | Logística | Hora da entrega automática, responsável, encerramento |
| Acompanhar pedido | todos | Linha do tempo completa do pedido e reagendamentos |
| Dashboard | Logística, Gestor | 10 indicadores, agenda do dia, ocupação, alertas, tempos médios |
| Relatórios | Gestor | 7 relatórios com filtros, exportação CSV e cópia para Excel |
| Auditoria | Gestor | Quem fez o quê, quando, valor anterior e novo |
| Usuários e perfis | Admin | Usuários, senhas e matriz de permissões por perfil |
| Funcionários | Admin | Cadastro com foto (recorte e compressão automáticos); lista usada nos campos de responsável |
| Configurações | Admin | Horários, intervalo, vagas por janela, veículos simultâneos, regras de alerta, docas |

## Página do cliente (acompanhamento)

Após o agendamento, o comprovante mostra um **link** e um **QR Code** para o cliente
(`index.html#acompanhar-CODIGO`). A página não exige login e mostra só as etapas:
agendada → em separação → conferido e faturado → pronto para retirada → concluída.

- Atualiza sozinha (a cada 15 s e na hora, se a equipe usar o mesmo computador).
- Botão **Avise-me**: toca um som e envia notificação do navegador quando o pedido fica pronto.
- Também é possível consultar em `index.html#acompanhar` com nº do pedido + 4 últimos dígitos do telefone.
- O código não revela o número do pedido; o QR Code é gerado localmente (`js/vendor/qrcode.js`, licença MIT).
- Em produção, o link precisa apontar para um servidor acessível pela internet, e o aviso pode ir também por WhatsApp/SMS.

## Regras implementadas

- Antecedência mínima de 1 hora (configurável).
- Capacidade por janela configurável (padrão: 20 janelas de 30 min, 1 pedido por janela = 2/hora).
- Janela lotada → mostra os próximos horários livres.
- Pedido inexistente, já agendado (mostra data, hora, status e quem agendou) e não elegível.
- Atendimento só inicia com o pedido **pronto** (separado, conferido e faturado).
- Limite de veículos simultâneos e bloqueio de doca ocupada.
- Reagendamento libera a janela anterior, exige motivo e mantém o histórico.
- Cancelamento exige motivo; nada é apagado.
- Alertas: preparação pendente, preparação crítica, cliente adiantado, atendimento atrasado,
  cliente atrasado, não comparecimento, cliente aguardando pedido não pronto.
- Tempos: espera, atendimento, total e chegada x agendado.

## Estrutura

```
index.html
css/style.css            tema claro/escuro, componentes, responsivo
js/config.js             parâmetros padrão, status, permissões, menu, ERP_CONFIG
js/utils.js              datas, formatação, hash de senha, CSV
js/storage.js            camada de dados (hoje: localStorage) e sessão
js/erp.js                integração com ERP (hoje: base simulada)
js/services.js           regras de negócio, alertas e indicadores
js/seed.js               usuários iniciais e dados de demonstração
js/ui.js                 ícones, modais, toasts, componentes
js/views-*.js            telas por área (comercial, operação, gestão, admin)
js/app.js                login, layout, rotas, atualização automática
```

## Próximos passos para produção

1. **Banco de dados e API**: trocar `js/storage.js` por chamadas a uma API (as telas não mudam).
   Hoje os dados ficam no navegador de cada computador, então **não são compartilhados** entre usuários.
2. **ERP**: em `js/config.js` mudar `DT.ERP_CONFIG.modo` para `'api'`, informar `baseUrl` e ajustar
   `DT.ERP.mapear()` em `js/erp.js` ao formato de retorno do ERP.
3. **Autenticação no servidor**: o login atual é de protótipo (hash no navegador). Em produção,
   validar senha no servidor ou integrar com o AD/SSO da empresa.
4. Visão futura prevista: QR Code no comprovante e check-in, notificação ao cliente, painel TV na doca.
