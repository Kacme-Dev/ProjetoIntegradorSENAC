/**
 * ServGo! — script.js REFATORADO
 * ================================
 * Camada de dados preparada para migração ao banco de dados.
 * Todas as operações de leitura/escrita usam o objeto DB abaixo.
 * Ao integrar com um backend real, substitua os métodos por fetch().
 */

document.addEventListener('DOMContentLoaded', function () {

    // =========================================================
    // CAMADA DE DADOS — preparada para migração a Banco de Dados
    // =========================================================
    var DB = {
        get: function (chave) {
            try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; }
        },
        set: function (chave, valor) {
            try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; }
        },
        remove: function (chave) { localStorage.removeItem(chave); },
        listar: function (prefixo) {
            var resultado = {};
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.startsWith(prefixo)) {
                    try { resultado[k] = JSON.parse(localStorage.getItem(k)); } catch (e) {}
                }
            }
            return resultado;
        }
    };

    // =========================================================
    // HELPERS DE USUÁRIOS
    // =========================================================
    var USUARIOS_KEY = 'usuariosCadastrados';

    function obterUsuariosCadastrados() { return DB.get(USUARIOS_KEY) || {}; }
    function salvarUsuariosCadastrados(u) { DB.set(USUARIOS_KEY, u); }

    function obterUsuarioLogado() {
        return DB.get('usuarioLogado');
    }
    function salvarUsuarioLogado(email, nome, tipo) {
        DB.set('usuarioLogado', { email: email, nome: nome, tipo: tipo });
    }
    function deslogarUsuario() {
        DB.remove('usuarioLogado');
        window.location.href = '/index.html';
    }

    // =========================================================
    // NAVEGAÇÃO — helpers de caminho
    // =========================================================
    function obterPrefixoRaiz() {
        var p = window.location.pathname;
        return (p.includes('/paginasSite/') || p.includes('/paginasPrestador/') || p.includes('/paginasCliente/'))
            ? '../' : '';
    }

    function irParaPaginasPrestador(arq) {
        var p = window.location.pathname;
        if (p.includes('/paginasPrestador/')) window.location.href = arq;
        else if (p.includes('/paginasSite/') || p.includes('/paginasCliente/')) window.location.href = '../paginasPrestador/' + arq;
        else window.location.href = 'paginasPrestador/' + arq;
    }

    // =========================================================
    // SISTEMA DE NOTIFICAÇÕES
    // =========================================================
    var SG_NOTIF_PREFIX = 'sgNotificacoes_';
    function sgObterNotificacoes(email) { if (!email) return []; return DB.get(SG_NOTIF_PREFIX + email) || []; }
    function sgSalvarNotificacoes(email, arr) { if (email) DB.set(SG_NOTIF_PREFIX + email, arr); }
    function sgCriarNotificacao(emailDestino, tipo, dados) {
        if (!emailDestino) return;
        var lista = sgObterNotificacoes(emailDestino);
        lista.push({ id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), tipo: tipo, lida: false, timestamp: new Date().toISOString(), dados: dados || {} });
        sgSalvarNotificacoes(emailDestino, lista);
    }
    function sgMarcarTodasLidas(email) {
        var lista = sgObterNotificacoes(email);
        lista.forEach(function (n) { n.lida = true; });
        sgSalvarNotificacoes(email, lista);
    }

    // =========================================================
    // AGENDAMENTOS — helpers compartilhados
    // =========================================================
    function obterAgendamentosPrestador(emailPrest) {
        var chave = 'agendamentos_' + emailPrest;
        var raw = DB.get(chave);
        if (!raw && emailPrest === 'prestador@servgo.com') raw = DB.get('prestAgendamentos');
        return raw || [];
    }
    function salvarAgendamentosPrestador(emailPrest, ags) {
        DB.set('agendamentos_' + emailPrest, ags);
        if (emailPrest === 'prestador@servgo.com') DB.set('prestAgendamentos', ags);
    }
    function _atualizarStatusClienteAgendamento(agId, emailCliente, novoStatus) {
        if (!emailCliente || !agId) return;
        var cliAgs = DB.get('clienteAgendamentos_' + emailCliente) || [];
        var idx = cliAgs.findIndex(function (a) { return a.id === agId; });
        if (idx >= 0) { cliAgs[idx].status = novoStatus; cliAgs[idx].atualizadoEm = new Date().toISOString(); DB.set('clienteAgendamentos_' + emailCliente, cliAgs); }
    }

    // =========================================================
    // HOTSITE STORE — helpers
    // =========================================================
    var HOTSITE_KEY = 'hotsitePrestadorDados';
    function obterStorePrestadores() { return DB.get(HOTSITE_KEY) || {}; }
    function obterDadosPrestador(email) { return obterStorePrestadores()[email] || null; }

    // =========================================================
    // AVALIAÇÕES — helpers
    // =========================================================
    var AVAL_FEITAS_PREST_KEY = 'avaliacoesFeitasPrestador';
    var AVAL_RECEBIDAS_PREST_KEY = 'avaliacoesRecebidasPrestador';

    function obterAvaliacoesFeitasPrestador(emailPrest) { return (DB.get(AVAL_FEITAS_PREST_KEY) || {})[emailPrest] || []; }
    function salvarAvaliacoesFeitasPrestador(emailPrest, arr) {
        var store = DB.get(AVAL_FEITAS_PREST_KEY) || {};
        store[emailPrest] = arr;
        DB.set(AVAL_FEITAS_PREST_KEY, store);
    }
    function obterAvaliacoesRecebidasPrestador(emailPrest) { return (DB.get(AVAL_RECEBIDAS_PREST_KEY) || {})[emailPrest] || []; }
    function salvarAvaliacoesRecebidasPrestador(emailPrest, arr) {
        var store = DB.get(AVAL_RECEBIDAS_PREST_KEY) || {};
        store[emailPrest] = arr;
        DB.set(AVAL_RECEBIDAS_PREST_KEY, store);
    }

    // =========================================================
    // SAUDAÇÃO — TODAS AS PÁGINAS
    // =========================================================
    function inicializarNavbarSaudacao() {
        var span = document.querySelector('.navbar-logada-info');
        if (!span) return;
        var usu = obterUsuarioLogado();
        if (usu && usu.nome) span.textContent = 'Olá, ' + usu.nome + '!';
    }

    // =========================================================
    // BOTÃO VOLTAR — ícone de seta + "Voltar" abaixo
    // =========================================================
    function inicializarBotaoVoltar() {
        var candidatos = document.querySelectorAll('#btn-voltar, [data-action="voltar"]');
        candidatos.forEach(function (btn) {
            if (btn.dataset.voltarBound === '1') return;
            btn.dataset.voltarBound = '1';
            // Transforma visual: seta + "Voltar"
            btn.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;line-height:1.1;"><i class="bi bi-arrow-left-circle" style="font-size:1.4rem;"></i><span style="font-size:0.65rem;font-weight:600;margin-top:1px;">Voltar</span></div>';
            btn.style.cssText += '; padding:4px 10px; border:1.5px solid var(--borda,#dee2e6); background:transparent;';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                if (window.history.length > 1) window.history.back();
                else { var fb = btn.getAttribute('data-voltar-fallback'); window.location.href = fb || '/index.html'; }
            });
        });
    }

    // =========================================================
    // SIDEBAR — Adicionar "Sair" no fundo + responsiva
    // =========================================================
    function inicializarSidebarPrestador() {
        var sidebar = document.querySelector('.prest-sidebar');
        if (!sidebar) return;
        var ul = sidebar.querySelector('ul');
        if (!ul) return;
        // Adiciona item Sair dinamicamente se não existir no HTML estático
        if (!sidebar.querySelector('.sidebar-sair')) {
            var liSair = document.createElement('li');
            liSair.className = 'sidebar-sair';
            liSair.innerHTML = '<a href="/index.html" id="sidebar-btn-sair"><i class="bi bi-box-arrow-right"></i> Sair</a>';
            ul.appendChild(liSair);
        }
        // Sempre conecta o listener de logout (seja HTML estático ou dinâmico)
        var btnSair = sidebar.querySelector('#sidebar-btn-sair, .sidebar-sair a');
        if (btnSair && !btnSair.dataset.logoutBound) {
            btnSair.dataset.logoutBound = '1';
            btnSair.addEventListener('click', function () { DB.remove('usuarioLogado'); });
        }
        // Remove botão Sair do navbar se existir
        document.querySelectorAll('a.btn-danger, a.btn.btn-danger').forEach(function (a) {
            if (a.href && (a.href.includes('index.html') || a.textContent.trim() === 'Sair')) {
                var li = a.closest('li');
                if (li) li.remove(); else a.remove();
            }
        });
    }

    function inicializarSidebarResponsiva() {
        var sidebar = document.querySelector('.prest-sidebar, .cli-sidebar');
        if (!sidebar) return;
        // Toggle com btn-voltar (reaproveitado) ou botão próprio
        var btnToggle = document.getElementById('sidebar-toggle');
        if (btnToggle) {
            btnToggle.addEventListener('click', function () { sidebar.classList.toggle('prest-sidebar-show'); });
        }
    }

    // =========================================================
    // HOME (index.html)
    // =========================================================
    function inicializarHome() {
        var frases = ["Agende sua consulta médica aqui.", "Encontre o especialista de saúde ideal.", "Busque clínicas e exames disponíveis.", "Descubra salões e serviços de beleza.", "Procure por manicure, cabelo ou estética.", "Confira as últimas tendências em beleza.", "Precisa de um eletricista ou encanador?", "Orçamento rápido para reformas e reparos.", "Serviços de manutenção predial e civil.", "Soluções em software e desenvolvimento.", "Apoio técnico para problemas de TI.", "Busque por cibersegurança e infraestrutura.", "Sugestões de passeios e entretenimento.", "Onde se divertir neste fim de semana?", "Encontre eventos, shows e atividades.", "Descubra restaurantes e deliverys.", "Cardápios, pratos e culinárias diversas.", "Onde comer hoje? Pesquise aqui!"];
        var campo = document.getElementById('campoBusca') || document.querySelector('.input-group input.form-control[aria-label="Busca"]');
        if (!campo) return;
        campo.placeholder = frases[Math.floor(Math.random() * frases.length)];
        setInterval(function () { campo.placeholder = frases[Math.floor(Math.random() * frases.length)]; }, 3000);
    }

    // =========================================================
    // CADASTRO
    // =========================================================
    function inicializarCadastro() {
        var prestCard = document.getElementById('prestador-card-completo');
        var cliCard = document.getElementById('cliente-card-completo');
        if (!prestCard && !cliCard) return;

        var prestEscolha = document.getElementById('prestador-escolha');
        var prestForm = document.getElementById('prestador-form');
        var cliEscolha = document.getElementById('cliente-escolha');
        var cliForm = document.getElementById('cliente-form');

        var prestCol = prestCard ? prestCard.closest('.col-md-6') : null;
        var cliCol = cliCard ? cliCard.closest('.col-md-6') : null;
        var row = prestCol ? prestCol.closest('.row') : null;

        function abrirForm(tipo) {
            if (tipo === 'prestador') {
                if (prestEscolha) prestEscolha.style.display = 'none';
                if (prestForm) { prestForm.style.display = 'block'; prestForm.classList.add('ativo'); }
                if (cliCol) cliCol.style.display = 'none';
                if (prestCol) { prestCol.classList.replace('col-md-6', 'col-md-8'); }
                if (row) row.classList.add('justify-content-center');
            } else {
                if (cliEscolha) cliEscolha.style.display = 'none';
                if (cliForm) { cliForm.style.display = 'block'; cliForm.classList.add('ativo'); }
                if (prestCol) prestCol.style.display = 'none';
                if (cliCol) { cliCol.classList.replace('col-md-6', 'col-md-8'); }
                if (row) row.classList.add('justify-content-center');
            }
        }

        if (prestEscolha) prestEscolha.addEventListener('click', function () { abrirForm('prestador'); });
        if (cliEscolha) cliEscolha.addEventListener('click', function () { abrirForm('cliente'); });

        var formPrest = document.getElementById('form-prestador-real');
        var formCli = document.getElementById('form-cliente-real');

        if (formPrest) {
            formPrest.addEventListener('submit', function (e) {
                e.preventDefault();
                var nome = document.getElementById('nome-prestador').value.trim();
                var email = document.getElementById('email-prestador').value.trim().toLowerCase();
                var senha = document.getElementById('senha-prestador').value;
                var repita = document.getElementById('senha-prestador-repita').value;
                if (senha !== repita) { alert('As senhas não coincidem.'); return; }
                var usuarios = obterUsuariosCadastrados();
                usuarios[email] = { nome: nome, senha: senha, tipo: 'prestador' };
                salvarUsuariosCadastrados(usuarios);
                window.location.href = 'login.html?cadastro=sucesso';
            });
        }
        if (formCli) {
            formCli.addEventListener('submit', function (e) {
                e.preventDefault();
                var nome = document.getElementById('nome-cliente').value.trim();
                var email = document.getElementById('email-cliente').value.trim().toLowerCase();
                var senha = document.getElementById('senha-cliente').value;
                var repita = document.getElementById('senha-cliente-repita').value;
                if (senha !== repita) { alert('As senhas não coincidem.'); return; }
                var usuarios = obterUsuariosCadastrados();
                usuarios[email] = { nome: nome, senha: senha, tipo: 'cliente' };
                salvarUsuariosCadastrados(usuarios);
                window.location.href = 'login.html?cadastro=sucesso';
            });
        }
    }

    // =========================================================
    // LOGIN
    // =========================================================
    function inicializarLogin() {
        var formLogin = document.getElementById('form-login');
        if (!formLogin) return;

        var emailInput = document.getElementById('email-login');
        var senhaInput = document.getElementById('senha-login');
        var alertaOk = document.getElementById('alerta-cadastro-sucesso');
        var alertaErro = document.getElementById('alerta-login-erro');

        var params = new URLSearchParams(window.location.search);
        if (params.get('cadastro') === 'sucesso' && alertaOk) {
            alertaOk.innerHTML = '<div class="alert alert-success alert-dismissible fade show text-center" role="alert"><strong>Parabéns!</strong> Seu cadastro foi concluído. Faça login abaixo!<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
            history.replaceState(null, '', window.location.pathname);
        }

        inicializarLinkEsqueciSenha();

        var fixos = {
            'prestador@servgo.com': { senha: 'senha123', tipo: 'prestador', nome: 'Prestador Demo' },
            'cliente@servgo.com': { senha: 'senha456', tipo: 'cliente', nome: 'Cliente Demo' },
            'admin@servgo.com': { senha: 'admin', tipo: 'admin', nome: 'Administrador' }
        };

        formLogin.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = emailInput.value.trim().toLowerCase();
            var senha = senhaInput.value.trim();
            if (alertaErro) alertaErro.innerHTML = '';

            if (fixos[email] && fixos[email].senha === senha) {
                salvarUsuarioLogado(email, fixos[email].nome, fixos[email].tipo);
                redirecionarPorTipo(fixos[email].tipo);
                return;
            }
            var cad = obterUsuariosCadastrados();
            if (cad[email] && cad[email].senha === senha) {
                salvarUsuarioLogado(email, cad[email].nome, cad[email].tipo);
                redirecionarPorTipo(cad[email].tipo);
                return;
            }
            if (alertaErro) alertaErro.innerHTML = '<div class="alert alert-danger fade show text-center" role="alert">E-mail e/ou senha incorretos.</div>';
            senhaInput.value = '';
        });
    }

    function inicializarLinkEsqueciSenha() {
        var link = document.querySelector('a[href="esqueci-senha.html"]');
        if (!link) return;
        var modalEl = document.getElementById('modalAlterarSenha');
        if (!modalEl) { modalEl = criarModalAlterarSenha(); document.body.appendChild(modalEl); }
        link.addEventListener('click', function (e) {
            e.preventDefault();
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        });
        var btnSalvar = modalEl.querySelector('#btn-salvar-senha-login');
        if (btnSalvar && !btnSalvar.dataset.bound) {
            btnSalvar.dataset.bound = '1';
            btnSalvar.addEventListener('click', function () { processarAlteracaoSenhaLogin(modalEl); });
        }
    }

    function criarModalAlterarSenha() {
        var m = document.createElement('div');
        m.className = 'modal fade'; m.id = 'modalAlterarSenha'; m.setAttribute('tabindex', '-1');
        m.innerHTML = '<div class="modal-dialog"><div class="modal-content"><div class="modal-header" style="background:#2B2B2B;color:#fff;"><h5 class="modal-title"><i class="bi bi-lock me-2"></i>Alterar Senha</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><div class="mb-3"><label class="form-label fw-bold">E-mail cadastrado:</label><input type="email" class="form-control" id="email-recuperar" placeholder="seu@email.com"></div><hr><div class="mb-3"><label class="form-label fw-bold">Nova Senha:</label><input type="password" class="form-control" id="nova-senha-login"><small class="text-muted">Mín. 8 caracteres, letras, números e especiais.</small></div><div class="mb-3"><label class="form-label fw-bold">Repita a Nova Senha:</label><input type="password" class="form-control" id="repita-nova-senha-login"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-primary" id="btn-salvar-senha-login"><i class="bi bi-floppy me-1"></i>Salvar</button></div></div></div>';
        return m;
    }

    function processarAlteracaoSenhaLogin(modalEl) {
        var email = (document.getElementById('email-recuperar').value || '').trim().toLowerCase();
        var nova = document.getElementById('nova-senha-login').value;
        var repita = document.getElementById('repita-nova-senha-login').value;
        if (!email) { alert('Informe o e-mail cadastrado.'); return; }
        var rx = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
        if (!rx.test(nova)) { alert('A nova senha deve ter mínimo 8 caracteres com letras, números e especiais.'); return; }
        if (nova !== repita) { alert('As senhas não coincidem.'); return; }
        var usuarios = obterUsuariosCadastrados();
        if (!usuarios[email]) { alert('E-mail não encontrado.'); return; }
        usuarios[email].senha = nova;
        salvarUsuariosCadastrados(usuarios);
        alert('Senha atualizada! Faça login com a nova senha.');
        ['email-recuperar', 'nova-senha-login', 'repita-nova-senha-login'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        bootstrap.Modal.getInstance(modalEl).hide();
    }

    function redirecionarPorTipo(tipo) {
        switch (tipo) {
            case 'admin': window.location.href = 'dashboardAdmin.html'; break;
            case 'prestador': window.location.href = '../indexPrestador.html'; break;
            case 'cliente': window.location.href = '../paginasCliente/clienteAreaExclusiva.html'; break;
            default: window.location.href = '../index.html';
        }
    }

    // =========================================================
    // ALTERAR SENHA GERAL (modal em páginas logadas)
    // =========================================================
    function inicializarAlterarSenhaGeral() {
        var btnSalvar = document.getElementById('btn-salvar-senha-geral');
        if (!btnSalvar) return;
        btnSalvar.addEventListener('click', function () {
            var usu = obterUsuarioLogado();
            if (!usu) { alert('Faça login novamente.'); return; }
            var email = (usu.email || '').toLowerCase();
            var usuarios = obterUsuariosCadastrados();
            var dados = usuarios[email];
            var senhaAtual = (document.getElementById('senha-atual-geral') || {}).value || '';
            var nova = (document.getElementById('nova-senha-geral') || {}).value || '';
            var repita = (document.getElementById('repita-nova-senha-geral') || {}).value || '';
            if (!dados || senhaAtual !== dados.senha) { alert('Senha atual incorreta!'); return; }
            var rx = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
            if (!rx.test(nova)) { alert('A nova senha deve ter mínimo 8 caracteres com letras, números e especiais.'); return; }
            if (nova !== repita) { alert('As novas senhas não coincidem.'); return; }
            dados.senha = nova;
            usuarios[email] = dados;
            salvarUsuariosCadastrados(usuarios);
            alert('Senha atualizada com sucesso!');
            ['senha-atual-geral', 'nova-senha-geral', 'repita-nova-senha-geral'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
            var modalEl = document.getElementById('modalAlterarSenha');
            if (modalEl) { var inst = bootstrap.Modal.getInstance(modalEl); if (inst) inst.hide(); }
        });
    }

    // =========================================================
    // NAVBAR PRESTADOR — "Meu Perfil" dropdown no indexPrestador
    // =========================================================
    function inicializarNavbarPrestador() {
        var isNestado = window.location.pathname.includes('/paginasPrestador/') ||
            window.location.pathname.includes('/paginasCliente/') ||
            window.location.pathname.includes('/paginasSite/');
        var isIndexPrest = window.location.pathname.includes('indexPrestador');
        var isPrestPage = isNestado || isIndexPrest;
        if (!isPrestPage) return;

        var usu = obterUsuarioLogado();
        if (!usu || usu.tipo !== 'prestador') return;

        // Atualiza saudação
        var span = document.querySelector('.navbar-logada-info');
        if (span) span.textContent = 'Olá, ' + usu.nome + '!';

        // Remove botão Sair do navbar
        document.querySelectorAll('a.btn-danger, .navbar-nav a.btn-danger').forEach(function (a) {
            if (a.textContent.trim() === 'Sair' || (a.href && a.href.includes('index.html') && a.classList.contains('btn-danger'))) {
                var li = a.closest('li'); if (li) li.remove(); else a.remove();
            }
        });

        // No indexPrestador: não há sidebar — adiciona dropdown "Meu Perfil"
        if (isIndexPrest) {
            _criarDropdownMeuPerfil(usu);
        } else {
            // Nas demais páginas: adicionar Sair ao sidebar via inicializarSidebarPrestador
            inicializarSidebarPrestador();
        }
    }

    function _criarDropdownMeuPerfil(usu) {
        var span = document.querySelector('.navbar-logada-info');
        if (!span) return;
        if (document.getElementById('prest-perfil-toggle')) return; // já criado

        span.style.cssText += '; position:relative; display:inline-flex; flex-direction:column; align-items:center; cursor:default;';

        var toggle = document.createElement('a');
        toggle.id = 'prest-perfil-toggle';
        toggle.href = '#';
        toggle.style.cssText = 'font-size:0.72rem; color:var(--azul-principal,#146ADB); text-decoration:underline; cursor:pointer; white-space:nowrap;';
        toggle.innerHTML = '<i class="bi bi-chevron-down" id="prest-chevron" style="font-size:.65rem;"></i> Meu Perfil';

        var dropdown = document.createElement('div');
        dropdown.id = 'prest-perfil-dropdown';
        dropdown.style.cssText = 'display:none; position:absolute; top:calc(100% + 4px); left:50%; transform:translateX(-50%); min-width:230px; background:var(--fundo-card,#fff); border:1.5px solid var(--borda,#dee2e6); border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,.13); z-index:1055; padding:6px 0;';

        var base = '/paginasPrestador/';
        var links = [
            { href: base + 'prestadorAreaExclusiva.html', icon: 'bi-house-door', text: 'Área Exclusiva' },
            { href: base + 'prestadorServicosAgendados.html', icon: 'bi-calendar-check', text: 'Meus Agendamentos' },
            { href: base + 'prestadorConfigurarAgenda.html', icon: 'bi-calendar3', text: 'Gerenciar Agenda' },
            { href: base + 'prestadorHotsiteAdm.html', icon: 'bi-globe', text: 'Meu Hot Site' },
            { href: base + 'prestadorAvaliacoesFeitas.html', icon: 'bi-star', text: 'Avaliações Feitas' },
            { href: base + 'prestadorAvaliacoesRecebidas.html', icon: 'bi-star-half', text: 'Avaliações Recebidas' },
            { href: base + 'dashboardPrestador.html', icon: 'bi-grid-1x2', text: 'Dashboard' },
            { href: base + 'prestadorContato.html', icon: 'bi-chat-text', text: 'Suporte/Contato' }
        ];

        links.forEach(function (item) {
            var a = document.createElement('a');
            a.href = item.href;
            a.style.cssText = 'display:block; padding:7px 16px; color:var(--texto-principal,#212529); text-decoration:none; font-size:.88rem;';
            a.innerHTML = '<i class="bi ' + item.icon + ' me-2" style="color:#146ADB;"></i>' + item.text;
            a.addEventListener('mouseover', function () { a.style.background = '#f0f4ff'; });
            a.addEventListener('mouseout', function () { a.style.background = ''; });
            dropdown.appendChild(a);
        });

        var hr = document.createElement('div');
        hr.style.cssText = 'border-top:1px solid var(--borda,#dee2e6); margin:6px 0;';
        dropdown.appendChild(hr);

        var sair = document.createElement('a');
        sair.href = '/index.html';
        sair.style.cssText = 'display:block; padding:7px 16px; color:#dc3545; text-decoration:none; font-size:.88rem; font-weight:600;';
        sair.innerHTML = '<i class="bi bi-box-arrow-right me-2"></i>Sair';
        sair.addEventListener('click', function () { DB.remove('usuarioLogado'); });
        dropdown.appendChild(sair);

        span.appendChild(toggle);
        span.appendChild(dropdown);

        var aberto = false;
        toggle.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            aberto = !aberto;
            dropdown.style.display = aberto ? 'block' : 'none';
            var ch = document.getElementById('prest-chevron');
            if (ch) ch.className = 'bi ' + (aberto ? 'bi-chevron-up' : 'bi-chevron-down');
        });
        document.addEventListener('click', function (e) {
            if (!span.contains(e.target)) {
                aberto = false; dropdown.style.display = 'none';
                var ch = document.getElementById('prest-chevron');
                if (ch) ch.className = 'bi bi-chevron-down';
            }
        });
    }

    // =========================================================
    // ÁREA EXCLUSIVA DO PRESTADOR (prestadorAreaExclusiva.html)
    // =========================================================
    function inicializarPrestadorAreaExclusiva() {
        var pMain = document.querySelector('.prest-main');
        if (!pMain || !document.querySelector('.prest-stat-grid')) return;
        // Evitar rodar em outras páginas que também têm prest-main
        if (document.getElementById('agenda-lista')) return;

        var usu = obterUsuarioLogado();
        if (!usu || usu.tipo !== 'prestador') return;
        var emailPrest = usu.email;

        var ags = obterAgendamentosPrestador(emailPrest);
        var agora = new Date();

        // — Próximo agendamento confirmado —
        var proximos = ags.filter(function (a) { return a.status === 'confirmado' && new Date(a.data + 'T' + (a.horario || '').split(' - ')[0]) > agora; });
        proximos.sort(function (a, b) { return a.data > b.data ? 1 : -1; });
        var proximo = proximos[0];
        var tituloEl = document.getElementById('prest-proximo-titulo');
        var infoEl = document.querySelector('.prest-stat-card.destaque-amarelo .prest-stat-info.amarelo');
        if (tituloEl) tituloEl.textContent = proximo ? proximo.servico : 'Nenhum agendamento';
        if (infoEl) {
            infoEl.innerHTML = '<i class="bi bi-clock"></i> ' + (proximo ? (_formatarDiaLabel(proximo.data) + ' às ' + (proximo.horario || '').split(' - ')[0]) : '—');
            // Remove link com cursor pointer (apenas exibição)
            var linkProx = infoEl.querySelector('a');
            if (linkProx) { linkProx.style.cursor = 'default'; linkProx.style.pointerEvents = 'none'; linkProx.style.textDecoration = 'none'; }
        }

        // — Avaliação Média —
        var avsRecebidas = obterAvaliacoesRecebidasPrestador(emailPrest);
        var avsConcluidas = avsRecebidas.filter(function (a) { return a.nota && a.nota > 0; });
        var media = 0;
        if (avsConcluidas.length > 0) { media = avsConcluidas.reduce(function (s, a) { return s + a.nota; }, 0) / avsConcluidas.length; }
        var cardAzul = document.querySelector('.prest-stat-card.destaque-azul');
        if (cardAzul) {
            var valorEl = cardAzul.querySelector('.prest-stat-valor');
            var infoAzul = cardAzul.querySelector('.prest-stat-info.azul');
            if (valorEl) valorEl.innerHTML = media.toFixed(1) + ' <span style="font-size:1rem;color:var(--texto-muted);">/ 5.0</span>';
            if (infoAzul) infoAzul.innerHTML = '<i class="bi bi-star-fill"></i> Baseado em ' + avsConcluidas.length + ' avaliação(ões)';
        }

        // — Próximos Agendamentos em Fila —
        var qtdFila = proximos.length;
        var qtdEl = document.getElementById('prest-qtd-msgs-nao-lidas');
        if (qtdEl) qtdEl.textContent = qtdFila;
        // Desativar link "Ver todas"
        var linkVer = document.getElementById('link-ver-msgs-prest');
        if (linkVer) { linkVer.style.pointerEvents = 'none'; linkVer.style.textDecoration = 'none'; linkVer.style.cursor = 'default'; }

        // — Histórico: mostrar SOMENTE concluídos —
        var listaHistorico = document.getElementById('prest-historico-lista');
        if (listaHistorico) {
            var itens = listaHistorico.querySelectorAll('.prest-historico-item');
            itens.forEach(function (li) {
                var badge = li.querySelector('.prest-badge');
                if (!badge || !badge.classList.contains('concluido')) li.style.display = 'none';
            });
        }

        // — Barra de notificações —
        _inicializarBarraNotifPrestAreaExclusiva(emailPrest);

        // — Modais de avaliar / editar no histórico —
        _inicializarHistoricoAcoesPrestador(emailPrest);
    }

    function _formatarDiaLabel(dataISO) {
        if (!dataISO) return '—';
        var diasS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        var meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        var d = new Date(dataISO + 'T12:00:00');
        var hj = new Date(); hj.setHours(0, 0, 0, 0);
        var diff = Math.round((d - hj) / 86400000);
        if (diff === 0) return 'Hoje';
        if (diff === 1) return 'Amanhã';
        return diasS[d.getDay()] + ', ' + String(d.getDate()).padStart(2, '0') + '/' + meses[d.getMonth()];
    }

    function _inicializarBarraNotifPrestAreaExclusiva(emailPrest) {
        var barraExistente = document.getElementById('sg-notif-barra-prest');
        if (!barraExistente) return; // mantém o HTML já presente

        function renderBarra() {
            var notifs = sgObterNotificacoes(emailPrest).filter(function (n) { return !n.lida; });
            var qtdAg = notifs.filter(function (n) { return n.tipo === 'agendamento'; }).length;
            if (qtdAg === 0) { barraExistente.innerHTML = ''; return; }
            barraExistente.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 16px;background:#fffbe6;border:1.5px solid #FFC300;border-radius:10px;"><i class="bi bi-bell-fill" style="color:#e6a800;font-size:1.2rem;"></i><strong style="color:#7a5800;">Novas notificações:</strong><button type="button" id="btn-notif-prest-ag" class="btn btn-warning btn-sm" style="font-size:.83rem;"><i class="bi bi-calendar-plus me-1"></i>' + qtdAg + ' nova(s) solicitação(ões) de agendamento</button></div>';
            var btnAg = document.getElementById('btn-notif-prest-ag');
            if (btnAg) {
                btnAg.addEventListener('click', function () {
                    window.location.href = '/paginasPrestador/prestadorServicosAgendados.html?aba=pendentes';
                });
            }
        }
        renderBarra();
        setInterval(renderBarra, 5000);
    }

    function _inicializarHistoricoAcoesPrestador(emailPrest) {
        var lista = document.getElementById('prest-historico-lista');
        if (!lista) return;

        var AVAL_KEY = 'avaliacoesFeitasPrestAdm_' + emailPrest;
        function obterAvals() { return DB.get(AVAL_KEY) || []; }
        function salvarAvals(arr) { DB.set(AVAL_KEY, arr); }

        function initEstrelas(container, hiddenInput) {
            if (!container || !hiddenInput) return;
            var stars = container.querySelectorAll('i');
            stars.forEach(function (s, idx) {
                s.addEventListener('click', function () {
                    hiddenInput.value = idx + 1;
                    stars.forEach(function (st, i) { st.className = i <= idx ? 'bi bi-star-fill filled' : 'bi bi-star'; st.style.color = i <= idx ? '#ffc107' : '#ccc'; });
                });
                s.addEventListener('mouseover', function () { stars.forEach(function (st, i) { st.style.color = i <= idx ? '#ffc107' : '#ccc'; }); });
                s.addEventListener('mouseout', function () { var cur = parseInt(hiddenInput.value) || 0; stars.forEach(function (st, i) { st.style.color = i < cur ? '#ffc107' : '#ccc'; }); });
            });
        }
        function renderEstrelas(container, hiddenInput, nota) {
            var stars = container.querySelectorAll('i');
            stars.forEach(function (s, i) { s.className = i < nota ? 'bi bi-star-fill filled' : 'bi bi-star'; s.style.color = i < nota ? '#ffc107' : '#ccc'; });
            hiddenInput.value = nota;
        }

        var modalAv = document.getElementById('modalPrestAvaliar');
        var modalEd = document.getElementById('modalPrestEditar');
        var starsAv = document.getElementById('modal-prest-estrelas');
        var notaAv = document.getElementById('modal-prest-nota-valor');
        var starsEd = document.getElementById('modal-prest-editar-estrelas');
        var notaEd = document.getElementById('modal-prest-editar-nota-valor');
        initEstrelas(starsAv, notaAv);
        initEstrelas(starsEd, notaEd);

        var pedidoAtual = null;

        // Avaliar
        lista.addEventListener('click', function (e) {
            var btnAv = e.target.closest('.btn-prest-avaliar');
            var btnEd = e.target.closest('.btn-prest-editar');
            var btnEx = e.target.closest('.btn-prest-excluir');

            if (btnAv) {
                var li = btnAv.closest('.prest-historico-item');
                pedidoAtual = li.dataset.pedidoId;
                var infoEl = document.getElementById('modal-prest-avaliar-info');
                if (infoEl) infoEl.innerHTML = '<strong>Serviço:</strong> ' + li.dataset.servico + ' | <strong>Cliente:</strong> ' + li.dataset.cliente;
                renderEstrelas(starsAv, notaAv, 0);
                document.getElementById('modal-prest-comentario').value = '';
                if (modalAv) bootstrap.Modal.getOrCreateInstance(modalAv).show();
            }
            if (btnEd) {
                var liEd = btnEd.closest('.prest-historico-item');
                pedidoAtual = liEd.dataset.pedidoId;
                var avAtual = obterAvals().find(function (a) { return a.pedidoId === pedidoAtual; });
                var infoEdEl = document.getElementById('modal-prest-editar-info');
                if (infoEdEl) infoEdEl.innerHTML = '<strong>Serviço:</strong> ' + liEd.dataset.servico + ' | <strong>Cliente:</strong> ' + liEd.dataset.cliente;
                renderEstrelas(starsEd, notaEd, avAtual ? avAtual.nota : 0);
                var comentEdEl = document.getElementById('modal-prest-editar-comentario');
                if (comentEdEl) comentEdEl.value = avAtual ? avAtual.comentario : '';
                if (modalEd) bootstrap.Modal.getOrCreateInstance(modalEd).show();
            }
            if (btnEx) {
                var liEx = btnEx.closest('.prest-historico-item');
                if (!confirm('Excluir este item do histórico?')) return;
                var avsEx = obterAvals().filter(function (a) { return a.pedidoId !== liEx.dataset.pedidoId; });
                salvarAvals(avsEx);
                liEx.remove();
                alert('Excluído com sucesso!');
            }
        });

        var btnSalvarAv = document.getElementById('btn-prest-salvar-avaliacao');
        if (btnSalvarAv) {
            btnSalvarAv.addEventListener('click', function () {
                var nota = parseInt(notaAv.value) || 0;
                var coment = (document.getElementById('modal-prest-comentario') || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; }
                if (!coment.trim()) { alert('Escreva um comentário.'); return; }
                var avs = obterAvals();
                var idx = avs.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                var nova = { pedidoId: pedidoAtual, nota: nota, comentario: coment, data: new Date().toLocaleDateString('pt-BR') };
                if (idx >= 0) avs[idx] = nova; else avs.push(nova);
                salvarAvals(avs);
                bootstrap.Modal.getInstance(modalAv).hide();
                alert('Avaliação salva!');
            });
        }

        var btnSalvarEd = document.getElementById('btn-prest-salvar-edicao');
        if (btnSalvarEd) {
            btnSalvarEd.addEventListener('click', function () {
                var nota = parseInt(notaEd.value) || 0;
                var coment = (document.getElementById('modal-prest-editar-comentario') || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; }
                if (!coment.trim()) { alert('Escreva um comentário.'); return; }
                var avs = obterAvals();
                var idx = avs.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                if (idx >= 0) { avs[idx].nota = nota; avs[idx].comentario = coment; salvarAvals(avs); }
                bootstrap.Modal.getInstance(modalEd).hide();
                alert('Avaliação atualizada!');
            });
        }
    }

    // =========================================================
    // SERVIÇOS AGENDADOS (prestadorServicosAgendados.html)
    // =========================================================
    function inicializarPrestadorServicosAgendados() {
        var listaEl = document.getElementById('agenda-lista');
        if (!listaEl) return;

        var usu = obterUsuarioLogado();
        if (!usu || usu.tipo !== 'prestador') return;
        var emailPrest = usu.email;

        var abaAtiva = 'proximos';
        var agendamentos = obterAgendamentosPrestador(emailPrest);
        var agendamentoAtualId = null;

        // Verifica param de URL (aba)
        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('aba')) abaAtiva = urlParams.get('aba');

        function salvarAgs() { salvarAgendamentosPrestador(emailPrest, agendamentos); }

        // Helpers de data
        var agora = new Date();
        function isProximo(ag) {
            if (ag.status !== 'confirmado') return false;
            var dt = new Date(ag.data + 'T' + (ag.horario || '08:00').split(' - ')[0]);
            return dt > agora;
        }
        function isPendente(ag) { return ag.status === 'pendente'; }
        function isHistorico(ag) { return ag.status === 'concluido' || ag.status === 'cancelado'; }

        function atualizarContadores() {
            var prox = agendamentos.filter(isProximo).length;
            var pend = agendamentos.filter(isPendente).length;
            var hist = agendamentos.filter(isHistorico).length;
            var el = document.getElementById('contador-proximos'); if (el) el.textContent = prox;
            el = document.getElementById('contador-pendentes'); if (el) el.textContent = pend;
            el = document.getElementById('contador-historico'); if (el) el.textContent = hist;
        }

        function renderizarAba(aba) {
            listaEl.innerHTML = '';
            var lista = [];
            if (aba === 'proximos') lista = agendamentos.filter(isProximo);
            if (aba === 'pendentes') lista = agendamentos.filter(isPendente);
            if (aba === 'historico') lista = agendamentos.filter(isHistorico);

            lista.sort(function (a, b) { return a.data > b.data ? 1 : -1; });

            if (lista.length === 0) {
                listaEl.innerHTML = '<li class="agenda-lista-vazia"><i class="bi bi-calendar-x"></i>Nenhum agendamento nesta aba.</li>';
                return;
            }

            lista.forEach(function (ag) {
                var li = document.createElement('li');
                li.className = 'agenda-prest-item';
                li.dataset.agendamentoId = ag.id;

                var statusTag = ag.status === 'confirmado' ? 'confirmado' : ag.status === 'pendente' ? 'pendente' : ag.status === 'cancelado' ? 'cancelado' : 'concluido';
                var statusTexto = ag.status === 'confirmado' ? 'Confirmado' : ag.status === 'pendente' ? 'Pendente' : ag.status === 'cancelado' ? 'Cancelado' : 'Concluído';
                var diaLabel = _formatarDiaLabel(ag.data);
                var horario = ag.horario || '—';

                var botoesHTML = '';
                // Botão Detalhes sempre presente
                botoesHTML += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';

                if (aba === 'proximos') {
                    // SEM chat, SEM cancelar nos próximos
                }
                if (aba === 'pendentes') {
                    botoesHTML += '<a href="#" class="agenda-btn confirmar" data-acao="confirmar" style="background:#198754;color:#fff;"><i class="bi bi-check me-1"></i>Confirmar</a>';
                    botoesHTML += '<a href="#" class="agenda-btn cancelar" data-acao="cancelar"><i class="bi bi-x me-1"></i>Cancelar</a>';
                }
                if (aba === 'historico') {
                    // Só detalhes
                }

                li.innerHTML = '<div><div class="agenda-slot-dia">' + diaLabel + '</div><div class="agenda-slot-tempo">' + horario + '</div></div><div><div class="agenda-cliente-nome">' + (ag.cliente || '—') + '</div><p class="agenda-cliente-servico">Serviço: ' + (ag.servico || '—') + '</p><p class="agenda-cliente-local"><i class="bi bi-geo-alt me-1"></i>' + (ag.endereco || '') + '</p></div><div class="agenda-status-area"><span class="agenda-status-tag ' + statusTag + '">' + statusTexto + '</span><div class="agenda-botoes">' + botoesHTML + '</div></div>';
                listaEl.appendChild(li);
            });

            // Delegação de eventos
            listaEl.addEventListener('click', function (e) {
                var btn = e.target.closest('.agenda-btn');
                if (!btn) return;
                e.preventDefault();
                var li = btn.closest('.agenda-prest-item');
                var agId = li ? li.dataset.agendamentoId : null;
                var ag = agendamentos.find(function (a) { return a.id === agId; });
                if (!ag) return;
                var acao = btn.dataset.acao;
                if (acao === 'detalhes') _abrirModalDetalhes(ag, emailPrest, agendamentos, salvarAgs);
                if (acao === 'confirmar') _confirmarAgendamento(ag, agendamentos, salvarAgs, function () { renderizarAba(abaAtiva); atualizarContadores(); });
                if (acao === 'cancelar') _abrirModalCancelar(ag, agendamentos, salvarAgs, function () { renderizarAba(abaAtiva); atualizarContadores(); });
            }, { once: false });
        }

        // Abas
        document.querySelectorAll('.agenda-prest-abas a[data-aba]').forEach(function (tab) {
            if (tab.dataset.aba === abaAtiva) { tab.classList.add('agenda-aba-ativa'); }
            else { tab.classList.remove('agenda-aba-ativa'); }
            tab.addEventListener('click', function (e) {
                e.preventDefault();
                abaAtiva = tab.dataset.aba;
                document.querySelectorAll('.agenda-prest-abas a[data-aba]').forEach(function (t) { t.classList.remove('agenda-aba-ativa'); });
                tab.classList.add('agenda-aba-ativa');
                // Filtro período apenas no histórico
                var filtroEl = document.getElementById('agenda-filtro-periodo');
                if (filtroEl) filtroEl.style.display = abaAtiva === 'historico' ? '' : 'none';
                renderizarAba(abaAtiva);
            });
        });

        // Filtro histórico
        var btnFiltrar = document.getElementById('btn-filtrar-historico');
        var btnLimparFiltro = document.getElementById('btn-limpar-filtro');
        if (btnFiltrar) {
            btnFiltrar.addEventListener('click', function () {
                var ini = (document.getElementById('filtro-data-inicio') || {}).value || '';
                var fim = (document.getElementById('filtro-data-fim') || {}).value || '';
                listaEl.innerHTML = '';
                var lista = agendamentos.filter(isHistorico).filter(function (a) {
                    if (ini && a.data < ini) return false;
                    if (fim && a.data > fim) return false;
                    return true;
                });
                lista.sort(function (a, b) { return a.data > b.data ? 1 : -1; });
                if (lista.length === 0) { listaEl.innerHTML = '<li class="agenda-lista-vazia"><i class="bi bi-calendar-x"></i>Nenhum resultado.</li>'; return; }
                lista.forEach(function (ag) { /* reaproveitamos a lógica de renderização */ });
                renderizarAba('historico'); // simplificado
            });
        }
        if (btnLimparFiltro) {
            btnLimparFiltro.addEventListener('click', function () {
                ['filtro-data-inicio', 'filtro-data-fim'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
                renderizarAba('historico');
            });
        }

        atualizarContadores();
        renderizarAba(abaAtiva);
    }

    function _confirmarAgendamento(ag, agendamentos, salvarAgs, callback) {
        var idx = agendamentos.findIndex(function (a) { return a.id === ag.id; });
        if (idx < 0) return;
        agendamentos[idx].status = 'confirmado';
        salvarAgs();
        if (ag.clienteEmail) {
            _atualizarStatusClienteAgendamento(ag.id, ag.clienteEmail, 'confirmado');
            sgCriarNotificacao(ag.clienteEmail, 'confirmacao', { servico: ag.servico, prestadorNome: ag.prestador || '' });
        }
        exibirToast('Agendamento confirmado com sucesso!');
        if (callback) callback();
    }

    function _abrirModalCancelar(ag, agendamentos, salvarAgs, callback) {
        var modalEl = document.getElementById('modalCancelarAgendamento');
        if (!modalEl) return;
        var infoBox = document.getElementById('modal-cancelar-info-agendamento');
        if (infoBox) infoBox.innerHTML = '<strong>Cliente:</strong> ' + (ag.cliente || '—') + ' | <strong>Serviço:</strong> ' + (ag.servico || '—') + ' | <strong>Data:</strong> ' + (ag.data || '—');
        // Limpa rádios
        document.querySelectorAll('input[name="motivo-cancelamento"]').forEach(function (r) { r.checked = false; });
        var obsEl = document.getElementById('motivo-observacao'); if (obsEl) obsEl.value = '';
        var inst = bootstrap.Modal.getOrCreateInstance(modalEl); inst.show();
        var btnConf = document.getElementById('btn-confirmar-cancelamento');
        if (btnConf) {
            var novo = btnConf.cloneNode(true);
            btnConf.parentNode.replaceChild(novo, btnConf);
            novo.addEventListener('click', function () {
                var radios = document.querySelectorAll('input[name="motivo-cancelamento"]');
                var motivo = '';
                radios.forEach(function (r) { if (r.checked) motivo = r.value; });
                if (!motivo) { alert('Selecione um motivo de cancelamento.'); return; }
                var obs = (document.getElementById('motivo-observacao') || {}).value || '';
                var idx = agendamentos.findIndex(function (a) { return a.id === ag.id; });
                if (idx >= 0) { agendamentos[idx].status = 'cancelado'; agendamentos[idx].motivoCancelamento = motivo + (obs ? ' — ' + obs : ''); salvarAgs(); }
                if (ag.clienteEmail) {
                    _atualizarStatusClienteAgendamento(ag.id, ag.clienteEmail, 'cancelado');
                    sgCriarNotificacao(ag.clienteEmail, 'cancelamento', { servico: ag.servico, motivo: motivo });
                }
                inst.hide();
                exibirToast('Agendamento cancelado.');
                if (callback) callback();
            });
        }
    }

    function _abrirModalDetalhes(ag, emailPrest, agendamentos, salvarAgs) {
        var modalEl = document.getElementById('modalDetalhesAgendamento');
        if (!modalEl) return;
        var corpo = document.getElementById('modal-detalhes-corpo');
        if (!corpo) return;

        var lembretes = ag.lembretes || [];
        var obs = ag.observacoes || '';
        var valor = ag.valor || 0;
        var pagamento = ag.formaPagamento || '';

        corpo.innerHTML =
            '<div class="agenda-detalhe-secao"><h6><i class="bi bi-person-circle me-1"></i>Dados do Cliente</h6>' +
            '<div class="agenda-detalhe-grid"><div><strong>Nome</strong><span>' + (ag.cliente || '—') + '</span></div><div><strong>Telefone</strong><span>' + (ag.telefone || '—') + '</span></div></div></div>' +
            '<div class="agenda-detalhe-secao"><h6><i class="bi bi-calendar-event me-1"></i>Serviço Agendado</h6>' +
            '<div class="agenda-detalhe-grid">' +
            '<div><strong>Serviço</strong><span>' + (ag.servico || '—') + '</span></div>' +
            '<div><strong>Status</strong><span><span class="agenda-status-tag ' + ag.status + '">' + ag.status + '</span></span></div>' +
            '<div><strong>Data</strong><span>' + (ag.data || '—') + '</span></div>' +
            '<div><strong>Horário</strong><span>' + (ag.horario || '—') + '</span></div>' +
            '<div style="grid-column:1/-1"><strong>Endereço</strong><span><i class="bi bi-geo-alt me-1"></i>' + (ag.endereco || '—') + '</span></div>' +
            '<div><strong>Valor (R$)</strong><span><input type="number" id="det-valor" class="form-control form-control-sm" value="' + valor + '" min="0" step="0.01" style="max-width:120px;"></span></div>' +
            '<div><strong>Forma de Pagamento</strong><span><select id="det-pagamento" class="form-select form-select-sm" style="max-width:150px;"><option value="">Selecione</option><option value="PIX"' + (pagamento === 'PIX' ? ' selected' : '') + '>PIX</option><option value="Cartão"' + (pagamento === 'Cartão' ? ' selected' : '') + '>Cartão</option><option value="Dinheiro"' + (pagamento === 'Dinheiro' ? ' selected' : '') + '>Dinheiro</option></select></span></div>' +
            '</div></div>' +
            '<div class="agenda-detalhe-secao" id="secao-lembretes"><h6><i class="bi bi-bell me-1"></i>Lembretes <small class="text-muted fw-normal">(editável)</small></h6>' +
            '<div id="agenda-lembretes-lista">' + lembretes.map(function (l, i) {
                return '<div class="agenda-lembrete-edit-row" style="display:flex;gap:6px;margin-bottom:6px;"><input type="text" class="form-control form-control-sm agenda-lembrete-input" value="' + _escaparHtml(l) + '" style="flex:1;"><button type="button" class="btn btn-sm btn-outline-danger agenda-lembrete-del" data-idx="' + i + '" title="Remover"><i class="bi bi-trash"></i></button></div>';
            }).join('') +
            '</div><button type="button" class="btn btn-sm btn-outline-secondary mt-1" id="btn-add-lembrete"><i class="bi bi-plus-circle me-1"></i>Adicionar Lembrete</button></div>' +
            '<div class="agenda-detalhe-secao"><h6><i class="bi bi-chat-left-text me-1"></i>Observações <small class="text-muted fw-normal">(editável)</small></h6>' +
            '<textarea id="agenda-obs-textarea" class="form-control form-control-sm" rows="3" style="resize:vertical;">' + _escaparHtml(obs) + '</textarea></div>' +
            '<div class="mt-3 text-end"><button type="button" class="btn btn-warning btn-sm" id="btn-salvar-detalhes"><i class="bi bi-floppy me-1"></i>Salvar Detalhes</button></div>';

        // Lembretes: adicionar / remover
        corpo.querySelector('#btn-add-lembrete').addEventListener('click', function () {
            var lDiv = corpo.querySelector('#agenda-lembretes-lista');
            var idx = lDiv.querySelectorAll('.agenda-lembrete-edit-row').length;
            var row = document.createElement('div');
            row.className = 'agenda-lembrete-edit-row';
            row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
            row.innerHTML = '<input type="text" class="form-control form-control-sm agenda-lembrete-input" style="flex:1;"><button type="button" class="btn btn-sm btn-outline-danger agenda-lembrete-del" data-idx="' + idx + '" title="Remover"><i class="bi bi-trash"></i></button>';
            lDiv.appendChild(row);
        });
        corpo.addEventListener('click', function (e) {
            var btnDel = e.target.closest('.agenda-lembrete-del');
            if (btnDel) btnDel.closest('.agenda-lembrete-edit-row').remove();
        });

        // Salvar
        corpo.querySelector('#btn-salvar-detalhes').addEventListener('click', function () {
            var idx = agendamentos.findIndex(function (a) { return a.id === ag.id; });
            if (idx < 0) return;
            agendamentos[idx].valor = parseFloat((document.getElementById('det-valor') || {}).value) || 0;
            agendamentos[idx].formaPagamento = (document.getElementById('det-pagamento') || {}).value || '';
            agendamentos[idx].observacoes = (document.getElementById('agenda-obs-textarea') || {}).value || '';
            agendamentos[idx].lembretes = Array.from(corpo.querySelectorAll('.agenda-lembrete-input')).map(function (inp) { return inp.value.trim(); }).filter(Boolean);
            salvarAgs();
            exibirToast('Detalhes salvos!');
        });

        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    function _escaparHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // =========================================================
    // AVALIAÇÕES FEITAS (prestadorAvaliacoesFeitas.html)
    // =========================================================
    function inicializarAvaliacoesFeitasPrestador() {
        var container = document.getElementById('container-prest-avaliacoes-feitas');
        if (!container) return;

        var usu = obterUsuarioLogado();
        if (!usu) return;
        var emailPrest = usu.email;

        // Remove barra de notificações
        var notif = document.getElementById('sg-notif-barra-prest');
        if (notif) notif.remove();

        function obterAvs() { return obterAvaliacoesFeitasPrestador(emailPrest); }
        function salvarAvs(arr) { salvarAvaliacoesFeitasPrestador(emailPrest, arr); }

        var modalEl = document.getElementById('modalPrestEditarFeita');
        var starsEl = document.getElementById('modal-prest-editar-feita-estrelas');
        var notaEl = document.getElementById('modal-prest-editar-feita-nota-valor');
        var comentEl = document.getElementById('modal-prest-editar-feita-comentario');
        var infoEl = document.getElementById('modal-prest-editar-feita-info');
        var btnSalvar = document.getElementById('btn-prest-salvar-edicao-feita');
        var pedidoAtual = null;

        function initEstrelas(container, hidden) {
            if (!container || !hidden) return;
            var stars = container.querySelectorAll('i');
            stars.forEach(function (s, i) {
                s.addEventListener('click', function () { hidden.value = i + 1; stars.forEach(function (st, j) { st.className = j <= i ? 'bi bi-star-fill filled' : 'bi bi-star'; st.style.color = j <= i ? '#ffc107' : '#ccc'; }); });
                s.addEventListener('mouseover', function () { stars.forEach(function (st, j) { st.style.color = j <= i ? '#ffc107' : '#ccc'; }); });
                s.addEventListener('mouseout', function () { var cur = parseInt(hidden.value) || 0; stars.forEach(function (st, j) { st.style.color = j < cur ? '#ffc107' : '#ccc'; }); });
            });
        }
        function renderEstrelas(cont, hidden, nota) {
            if (!cont || !hidden) return;
            var stars = cont.querySelectorAll('i');
            stars.forEach(function (s, i) { s.className = i < nota ? 'bi bi-star-fill filled' : 'bi bi-star'; s.style.color = i < nota ? '#ffc107' : '#ccc'; });
            hidden.value = nota;
        }
        initEstrelas(starsEl, notaEl);

        function renderizarLista() {
            var avs = obterAvs();
            var botaoBloco = container.querySelector('.d-flex.justify-content-center');
            container.querySelectorAll('.review-card-prestador-feita').forEach(function (c) { c.remove(); });
            container.querySelectorAll('#prest-feita-header, #prest-feita-msg-vazia').forEach(function (c) { c.remove(); });

            var hdr = document.createElement('div');
            hdr.id = 'prest-feita-header';
            hdr.style.cssText = 'font-size:1rem;font-weight:700;color:#146ADB;padding-bottom:8px;border-bottom:2px solid #146ADB;margin-bottom:12px;';
            hdr.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107;"></i>Avaliações que Fiz aos Clientes';
            container.insertBefore(hdr, botaoBloco || null);

            if (avs.length === 0) {
                var msg = document.createElement('div');
                msg.id = 'prest-feita-msg-vazia';
                msg.className = 'text-center text-muted py-4';
                msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Nenhuma avaliação realizada ainda.';
                container.insertBefore(msg, botaoBloco || null);
                return;
            }

            avs.slice().reverse().forEach(function (av) {
                var stars = Array.from({ length: 5 }, function (_, i) { return i < av.nota ? '<i class="bi bi-star-fill" style="color:#ffc107;"></i>' : '<i class="bi bi-star" style="color:#ccc;"></i>'; }).join('');
                var card = document.createElement('div');
                card.className = 'review-card-reverse review-card-prestador-feita';
                card.dataset.avId = av.id;
                card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0">Cliente: ' + (av.cliente || '—') + ' (' + (av.servico || '') + ')</h5><span class="text-muted"><small>' + (av.data || '') + '</small></span></div><div class="rating">' + stars + '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6></div><p class="review-text">"' + av.comentario + '"</p><div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-warning btn-prest-feita-editar" data-id="' + av.id + '"><i class="bi bi-pencil-square me-1"></i>Editar</button><button type="button" class="btn btn-danger btn-prest-feita-excluir" data-id="' + av.id + '"><i class="bi bi-trash me-1"></i>Excluir</button></div>';
                container.insertBefore(card, botaoBloco || null);
            });
        }

        container.addEventListener('click', function (e) {
            var btnEd = e.target.closest('.btn-prest-feita-editar');
            var btnEx = e.target.closest('.btn-prest-feita-excluir');
            if (btnEd) {
                var id = btnEd.dataset.id;
                var av = obterAvs().find(function (a) { return a.id === id; });
                if (!av) return;
                pedidoAtual = id;
                if (infoEl) infoEl.innerHTML = '<strong>Cliente:</strong> ' + av.cliente + ' | <strong>Serviço:</strong> ' + av.servico;
                renderEstrelas(starsEl, notaEl, av.nota);
                if (comentEl) comentEl.value = av.comentario;
                if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
            if (btnEx) {
                var idEx = btnEx.dataset.id;
                if (!confirm('Excluir esta avaliação?')) return;
                salvarAvs(obterAvs().filter(function (a) { return a.id !== idEx; }));
                renderizarLista();
                alert('Excluída!');
            }
        });

        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                var nota = parseInt((notaEl || {}).value) || 0;
                var coment = (comentEl || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; }
                if (!coment.trim()) { alert('Escreva um comentário.'); return; }
                var avs = obterAvs();
                var idx = avs.findIndex(function (a) { return a.id === pedidoAtual; });
                if (idx >= 0) { avs[idx].nota = nota; avs[idx].comentario = coment; salvarAvs(avs); }
                if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
                renderizarLista();
                alert('Atualizada!');
            });
        }

        renderizarLista();
    }

    // =========================================================
    // AVALIAÇÕES RECEBIDAS (prestadorAvaliacoesRecebidas.html)
    // =========================================================
    function inicializarAvaliacoesRecebidasPrestador() {
        var container = document.getElementById('container-prest-avaliacoes-recebidas');
        if (!container) return;

        var usu = obterUsuarioLogado();
        if (!usu) return;
        var emailPrest = usu.email;

        var notif = document.getElementById('sg-notif-barra-prest');
        if (notif) notif.remove();

        // Semear dados demo se vazio
        var avs = obterAvaliacoesRecebidasPrestador(emailPrest);
        if (avs.length === 0) {
            avs = [
                { id: 'rec-p1', cliente: 'Maria da Silva', servico: 'Troca de Válvula', nota: 5, comentario: 'Excelente trabalho! Muito rápido e eficiente.', data: '01/04/2026' },
                { id: 'rec-p2', cliente: 'Pedro Souza', servico: 'Reparo na Porta', nota: 4, comentario: 'Bom serviço, recomendo.', data: '15/03/2026' }
            ];
            salvarAvaliacoesRecebidasPrestador(emailPrest, avs);
        }

        function renderizarLista() {
            var botaoBloco = container.querySelector('.d-flex.justify-content-center');
            container.querySelectorAll('.review-card-prest-recebida').forEach(function (c) { c.remove(); });
            container.querySelectorAll('#prest-rec-header, #prest-rec-msg').forEach(function (c) { c.remove(); });

            var avsAtual = obterAvaliacoesRecebidasPrestador(emailPrest);
            var hdr = document.createElement('div');
            hdr.id = 'prest-rec-header';
            hdr.style.cssText = 'font-size:1rem;font-weight:700;color:#146ADB;padding-bottom:8px;border-bottom:2px solid #146ADB;margin-bottom:12px;';
            hdr.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107;"></i>Avaliações Recebidas dos Clientes';
            container.insertBefore(hdr, botaoBloco || null);

            if (avsAtual.length === 0) {
                var msg = document.createElement('div'); msg.id = 'prest-rec-msg'; msg.className = 'text-center text-muted py-4';
                msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Nenhuma avaliação recebida ainda.';
                container.insertBefore(msg, botaoBloco || null);
                return;
            }
            avsAtual.slice().reverse().forEach(function (av) {
                var stars = Array.from({ length: 5 }, function (_, i) { return i < av.nota ? '<i class="bi bi-star-fill" style="color:#ffc107;"></i>' : '<i class="bi bi-star" style="color:#ccc;"></i>'; }).join('');
                var card = document.createElement('div');
                card.className = 'review-card-reverse review-card-prest-recebida';
                card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0">Cliente: ' + av.cliente + ' (' + av.servico + ')</h5><span class="text-muted"><small>' + av.data + '</small></span></div><div class="rating">' + stars + '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6></div><p class="review-text">"' + av.comentario + '"</p>';
                container.insertBefore(card, botaoBloco || null);
            });
        }
        renderizarLista();
    }

    // =========================================================
    // HOTSITE ADM (prestadorHotsiteAdm.html)
    // =========================================================
    function inicializarHotsitePrestador() {
        var inputCnpj = document.getElementById('adm-cnpj');
        if (!inputCnpj) return;

        var usu = obterUsuarioLogado();
        if (!usu) return;
        var emailLogado = usu.email;
        var usuarios = obterUsuariosCadastrados();
        var dadosUsu = usuarios[emailLogado] || {};

        // Remove barra de notificações
        var notifBarra = document.getElementById('sg-notif-barra-prest');
        if (notifBarra) notifBarra.remove();

        var inputNome = document.getElementById('adm-nome');
        var inputCategoria = document.getElementById('adm-categoria');
        var inputCidade = document.getElementById('adm-cidade');
        var inputDescricao = document.getElementById('adm-descricao');
        var inputEndereco = document.getElementById('adm-endereco');
        var inputEmail = document.getElementById('adm-email');
        var inputTel = document.getElementById('adm-tel');
        var inputAvatar = document.getElementById('adm-galeria');
        var btnSalvar = document.getElementById('btn-salvar-hotsite');
        var btnLimpar = document.getElementById('btn-limpar-hotsite');
        var btnCancelar = document.querySelector('[href="prestadorAreaExclusiva.html"].conf-btn-voltar, #btn-cancelar-hotsite, a.conf-btn-voltar');
        var avatarDiv = document.querySelector('.hotsite-avatar');

        var dadosSalvos = {};
        var store = obterStorePrestadores();
        if (store[emailLogado]) dadosSalvos = store[emailLogado];

        // Preenche nome e email (readonly)
        if (inputNome) { inputNome.value = dadosUsu.nome || usu.nome || ''; inputNome.readOnly = true; }
        if (inputEmail) { inputEmail.value = emailLogado; inputEmail.readOnly = true; }

        // Preenche campos salvos
        if (inputCnpj) inputCnpj.value = dadosSalvos.cnpj || '';
        if (inputCategoria && dadosSalvos.categoria) inputCategoria.value = dadosSalvos.categoria;
        if (inputCidade) inputCidade.value = dadosSalvos.cidade || '';
        if (inputDescricao) inputDescricao.value = dadosSalvos.descricao || '';
        if (inputEndereco) inputEndereco.value = dadosSalvos.endereco || '';
        if (inputTel) inputTel.value = dadosSalvos.tel || '';

        // Avatar
        function aplicarAvatar(src) {
            if (!avatarDiv) return;
            if (src) {
                avatarDiv.style.backgroundImage = 'url(' + src + ')';
                avatarDiv.style.backgroundSize = 'cover';
                avatarDiv.style.backgroundPosition = 'center';
                avatarDiv.textContent = '';
                avatarDiv.dataset.base64 = src;
            } else {
                avatarDiv.style.backgroundImage = '';
                var partes = ((inputNome && inputNome.value) || usu.nome || 'US').trim().split(/\s+/);
                var ini = partes.length >= 2 ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase() : (partes[0] || 'US').substring(0, 2).toUpperCase();
                avatarDiv.textContent = ini;
                delete avatarDiv.dataset.base64;
            }
        }
        aplicarAvatar(dadosSalvos.foto || null);

        if (inputAvatar) {
            inputAvatar.addEventListener('change', function (e) {
                var f = e.target.files[0];
                if (!f || !f.type.startsWith('image/')) return;
                var r = new FileReader();
                r.onload = function (ev) { aplicarAvatar(ev.target.result); };
                r.readAsDataURL(f);
            });
        }
        // Clicar no avatar abre file input
        if (avatarDiv && inputAvatar) {
            avatarDiv.style.cursor = 'pointer';
            avatarDiv.title = 'Clique para alterar foto';
            avatarDiv.addEventListener('click', function () { inputAvatar.click(); });
        }

        // Galeria de 10 slots (9 imagens + 1 vídeo)
        var galeriaDados = (dadosSalvos.galeria && dadosSalvos.galeria.length >= 10) ? dadosSalvos.galeria : new Array(10).fill(null);

        function renderizarGaleria() {
            var thumbs = document.querySelectorAll('#galeria-thumbs .hotsiteadm-thumb-preview');
            thumbs.forEach(function (thumb) {
                var slot = parseInt(thumb.dataset.slot);
                var dado = galeriaDados[slot];
                thumb.innerHTML = '';
                thumb.style.position = 'relative';

                if (dado) {
                    var isVideo = dado.startsWith('data:video') || dado.includes('/video/');
                    if (isVideo) {
                        var vid = document.createElement('video');
                        vid.src = dado; vid.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
                        vid.muted = true; vid.setAttribute('playsinline', '');
                        thumb.appendChild(vid);
                    } else {
                        var img = document.createElement('img');
                        img.src = dado; img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
                        thumb.appendChild(img);
                    }
                    var btnX = document.createElement('button');
                    btnX.type = 'button'; btnX.className = 'btn-galeria-excluir';
                    btnX.dataset.slot = slot;
                    btnX.style.cssText = 'position:absolute;top:4px;right:4px;background:#dc3545;color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:13px;line-height:1;cursor:pointer;';
                    btnX.innerHTML = '&times;';
                    btnX.addEventListener('click', function (e) { e.stopPropagation(); galeriaDados[slot] = null; renderizarGaleria(); });
                    thumb.appendChild(btnX);
                } else {
                    var label = slot === 9 ? '<i class="bi bi-play-circle"></i> Vídeo' : '<i class="bi bi-image"></i> Foto ' + (slot + 1);
                    thumb.innerHTML = label;
                    thumb.style.display = 'flex'; thumb.style.alignItems = 'center'; thumb.style.justifyContent = 'center'; thumb.style.gap = '4px'; thumb.style.color = '#6c757d'; thumb.style.fontSize = '.85rem';
                }

                // Clique no card abre file input para esse slot
                thumb.style.cursor = 'pointer';
                thumb.addEventListener('click', function (e) {
                    if (e.target.classList.contains('btn-galeria-excluir')) return;
                    var input = document.createElement('input');
                    input.type = 'file';
                    input.accept = slot === 9 ? 'video/*' : 'image/*';
                    input.addEventListener('change', function () {
                        var file = input.files[0]; if (!file) return;
                        var reader = new FileReader();
                        reader.onload = function (ev) { galeriaDados[slot] = ev.target.result; renderizarGaleria(); };
                        reader.readAsDataURL(file);
                    });
                    input.click();
                });
            });

            // Garante 10 slots no DOM se necessário
            var galContainer = document.getElementById('galeria-thumbs');
            if (galContainer && galContainer.querySelectorAll('.hotsiteadm-thumb-preview').length < 10) {
                for (var s = galContainer.querySelectorAll('.hotsiteadm-thumb-preview').length; s < 10; s++) {
                    var newThumb = document.createElement('div');
                    newThumb.className = 'hotsiteadm-thumb-preview';
                    newThumb.dataset.slot = s;
                    galContainer.appendChild(newThumb);
                }
                renderizarGaleria(); // re-renderiza com slots completos
            }
        }
        renderizarGaleria();

        // Remove botão de upload múltiplo (substituído pelos cards)
        var inputGaleriaMultipla = document.getElementById('adm-galeria-nova');
        if (inputGaleriaMultipla) { var parent = inputGaleriaMultipla.parentNode; if (parent) parent.removeChild(inputGaleriaMultipla); }

        // Contador de descrição
        var contador = document.getElementById('adm-descricao-contador');
        if (inputDescricao && contador) {
            function atualizarContador() { contador.textContent = inputDescricao.value.length + ' / 2000'; }
            inputDescricao.addEventListener('input', atualizarContador);
            atualizarContador();
        }

        // Preview ao vivo
        function atualizarPreview() {
            var nomeEl = document.querySelector('.hotsite-nome'); if (nomeEl && inputNome) nomeEl.textContent = inputNome.value;
            var descEl = document.querySelector('.hotsite-desc'); if (descEl && inputDescricao) descEl.textContent = inputDescricao.value;
            var atendeEl = document.querySelector('.hotsite-atende'); if (atendeEl && inputCidade) atendeEl.innerHTML = '<i class="bi bi-geo-alt-fill me-1"></i> Atende em: ' + (inputCidade.value || '—');
            var emailPrev = document.getElementById('hotsite-preview-email'); if (emailPrev && inputEmail) emailPrev.innerHTML = '<i class="bi bi-envelope me-1"></i> ' + (inputEmail.value || '—');
            var telPrev = document.getElementById('hotsite-preview-tel'); if (telPrev && inputTel) telPrev.innerHTML = '<i class="bi bi-telephone me-1"></i> ' + (inputTel.value || '—');
        }
        [inputNome, inputCidade, inputDescricao, inputTel].forEach(function (el) { if (el) el.addEventListener('input', atualizarPreview); });
        atualizarPreview();

        // Disponibilidade de agenda (somente visualização, sem cursor carregando)
        var slotEl = document.getElementById('hotsite-preview-proximo-slot');
        if (slotEl) {
            slotEl.style.cursor = 'default'; slotEl.style.pointerEvents = 'none';
            var ags = obterAgendamentosPrestador(emailLogado);
            var ocupados = {};
            ags.forEach(function (a) { if (a.status === 'cancelado') return; var ini = (a.horario || '').split(' - ')[0]; if (ini && a.data) ocupados[a.data + ' ' + ini] = true; });
            var agora = new Date();
            var encontrado = false;
            for (var d = 0; d < 30 && !encontrado; d++) {
                var dia = new Date(agora); dia.setDate(agora.getDate() + d);
                if (dia.getDay() === 0 || dia.getDay() === 6) continue;
                var dataStr = dia.toISOString().substring(0, 10);
                for (var h = 8; h < 18; h++) {
                    if (d === 0 && h <= agora.getHours()) continue;
                    var hor = String(h).padStart(2, '0') + ':00';
                    if (!ocupados[dataStr + ' ' + hor]) { slotEl.textContent = _formatarDiaLabel(dataStr) + ' às ' + hor; encontrado = true; break; }
                }
            }
            if (!encontrado) slotEl.textContent = 'Sem disponibilidade nos próximos 30 dias';
        }

        // Contatos preview
        var contactEl = document.querySelector('.hotsite-contato-preview');
        if (contactEl && inputEmail && inputTel) {
            contactEl.innerHTML = '<p><i class="bi bi-envelope me-1"></i>' + inputEmail.value + '&nbsp;&nbsp;<i class="bi bi-telephone me-1"></i>' + inputTel.value + '</p>';
        }

        // Últimas 3 avaliações recebidas
        var depDiv = document.querySelector('.hotsite-depoimento');
        if (depDiv) {
            var avsRec = obterAvaliacoesRecebidasPrestador(emailLogado).slice(-3).reverse();
            if (avsRec.length > 0) {
                depDiv.innerHTML = avsRec.map(function (av) {
                    var stars = Array.from({ length: 5 }, function (_, i) { return i < av.nota ? '<i class="bi bi-star-fill" style="color:#ffc107;"></i>' : '<i class="bi bi-star" style="color:#ccc;"></i>'; }).join('');
                    return '<div style="padding:10px;border-radius:8px;background:#f8f9fa;margin-bottom:8px;"><div>' + stars + '</div><p style="font-size:.85rem;margin:4px 0 0;">"' + _escaparHtml(av.comentario) + '"</p><small class="text-muted">— ' + av.cliente + '</small></div>';
                }).join('');
            } else {
                depDiv.innerHTML = '<p class="text-muted" style="font-size:.85rem;">Nenhuma avaliação recebida ainda.</p>';
            }
        }

        // Máscara CPF/CNPJ
        if (inputCnpj) {
            inputCnpj.setAttribute('maxlength', '18');
            inputCnpj.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, '');
                if (v.length > 14) v = v.substring(0, 14);
                if (v.length <= 11) { v = v.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2'); }
                else { v = v.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); }
                e.target.value = v;
            });
        }

        // Campos obrigatórios com asterisco
        var obrigatorios = [
            { el: inputCnpj, label: 'CPF/CNPJ' }, { el: inputCategoria, label: 'Categoria Principal' },
            { el: inputCidade, label: 'Atende em' }, { el: inputEndereco, label: 'Endereço do Prestador' }, { el: inputTel, label: 'Telefone' }
        ];
        obrigatorios.forEach(function (c) {
            if (!c.el) return;
            var grupo = c.el.closest('.hotsiteadm-grupo, .mb-3, .form-group');
            if (!grupo) return;
            var lbl = grupo.querySelector('label');
            if (lbl && !lbl.innerHTML.includes('*')) lbl.innerHTML += ' <span style="color:#dc3545;">*</span>';
        });

        // Salvar & Publicar
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                var invalidos = obrigatorios.filter(function (c) {
                    if (!c.el) return false;
                    var val = c.el.tagName === 'SELECT' ? c.el.value : (c.el.value || '').trim();
                    return !val;
                }).map(function (c) { return c.label; });
                if (invalidos.length > 0) { alert('Campos obrigatórios:\n\n• ' + invalidos.join('\n• ')); return; }

                var dadosSalvar = {
                    nome: inputNome ? inputNome.value : '', email: emailLogado,
                    cnpj: inputCnpj ? inputCnpj.value : '',
                    categoria: inputCategoria ? inputCategoria.value : '',
                    cidade: inputCidade ? inputCidade.value : '',
                    descricao: inputDescricao ? inputDescricao.value : '',
                    endereco: inputEndereco ? inputEndereco.value : '',
                    tel: inputTel ? inputTel.value : '',
                    foto: (avatarDiv && avatarDiv.dataset.base64) || dadosSalvos.foto || '',
                    galeria: galeriaDados
                };
                var storeAtual = obterStorePrestadores();
                storeAtual[emailLogado] = dadosSalvar;
                DB.set(HOTSITE_KEY, storeAtual);
                alert('Hot Site salvo e publicado com sucesso!');
            });
        }

        // Limpar (exceto galeria)
        if (btnLimpar) {
            btnLimpar.addEventListener('click', function () {
                if (inputCnpj) inputCnpj.value = '';
                if (inputCategoria) inputCategoria.value = '';
                if (inputCidade) inputCidade.value = '';
                if (inputDescricao) inputDescricao.value = '';
                if (inputEndereco) inputEndereco.value = '';
                if (inputTel) inputTel.value = '';
                aplicarAvatar(null);
                atualizarPreview();
            });
        }

        // Cancelar → indexPrestador (mantém login)
        if (btnCancelar) {
            btnCancelar.addEventListener('click', function (e) {
                e.preventDefault();
                var path = window.location.pathname;
                window.location.href = '/indexPrestador.html';
            });
        }
    }

    // =========================================================
    // CONFIGURAR AGENDA (prestadorConfigurarAgenda.html)
    // =========================================================
    function inicializarConfigurarAgenda() {
        var confForm = document.querySelector('.prest-main form');
        if (!confForm || !document.getElementById('segunda-inicio')) return;

        var usu = obterUsuarioLogado();
        var emailPrest = (usu && usu.tipo === 'prestador') ? usu.email : 'prestador@servgo.com';
        var CONF_KEY = 'agendaConfig_' + emailPrest;

        // Remove barra de notificações e botão Voltar
        var notif = document.getElementById('sg-notif-barra-prest');
        if (notif) notif.remove();
        var btnVoltarConf = confForm.querySelector('.conf-btn-voltar, [data-action="voltar"]');
        if (btnVoltarConf) { var pvb = btnVoltarConf.closest('div') || btnVoltarConf; pvb.remove(); }

        // Habilitar domingo
        var domingoRow = Array.from(confForm.querySelectorAll('.conf-dias-grid')).find(function (row) { var lbl = row.querySelector('label, .conf-fechado-label'); return lbl && lbl.textContent.toLowerCase().includes('domingo'); });
        if (domingoRow) {
            var domCbk = domingoRow.querySelector('input[type="checkbox"]');
            if (domCbk) { domCbk.disabled = false; }
            var fechadoLabel = domingoRow.querySelector('.conf-fechado-label');
            if (fechadoLabel) { fechadoLabel.className = 'conf-dias-label'; fechadoLabel.textContent = 'Domingo'; }
            if (domingoRow.querySelectorAll('input[type="time"]').length === 0) {
                var iniDom = document.createElement('input'); iniDom.type = 'time'; iniDom.className = 'conf-time-input'; iniDom.id = 'domingo-inicio'; iniDom.value = '08:00'; iniDom.disabled = true;
                var fimDom = document.createElement('input'); fimDom.type = 'time'; fimDom.className = 'conf-time-input'; fimDom.id = 'domingo-fim'; fimDom.value = '12:00'; fimDom.disabled = true;
                var cbkWrap = domingoRow.querySelector('.conf-checkbox-wrap');
                domingoRow.insertBefore(iniDom, cbkWrap); domingoRow.insertBefore(fimDom, cbkWrap);
            }
            if (domCbk) {
                domCbk.addEventListener('change', function () {
                    var ini = document.getElementById('domingo-inicio'); var fim = document.getElementById('domingo-fim');
                    if (ini) ini.disabled = !domCbk.checked; if (fim) fim.disabled = !domCbk.checked;
                });
            }
        }

        // Carregar configurações salvas
        var confSalva = DB.get(CONF_KEY) || {};
        var dias = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
        dias.forEach(function (dia) {
            var ini = document.getElementById(dia + '-inicio'); var fim = document.getElementById(dia + '-fim');
            if (confSalva[dia]) { if (ini) ini.value = confSalva[dia].inicio || ini.value; if (fim) fim.value = confSalva[dia].fim || fim.value; }
        });
        if (confSalva.duracaoServico) { var el = document.getElementById('duracao-servico'); if (el) el.value = confSalva.duracaoServico; }
        if (confSalva.antecedencia) { var el2 = document.getElementById('antecedencia'); if (el2) el2.value = confSalva.antecedencia; }
        if (confSalva.intervalo) { var el3 = document.getElementById('intervalo'); if (el3) el3.value = confSalva.intervalo; }

        // Salvar
        var btnSalvar = confForm.querySelector('.conf-btn-salvar, button[type="submit"]');
        if (btnSalvar) {
            confForm.addEventListener('submit', function (e) { e.preventDefault(); });
            btnSalvar.addEventListener('click', function (e) {
                if (e) e.preventDefault();
                var dados = {};
                dias.forEach(function (dia) {
                    var ini = document.getElementById(dia + '-inicio'); var fim = document.getElementById(dia + '-fim');
                    var rows = confForm.querySelectorAll('.conf-dias-grid');
                    var cbk = null;
                    rows.forEach(function (row) {
                        var lbl = row.querySelector('.conf-dias-label');
                        if (lbl && _normalizar(lbl.textContent).includes(_normalizar(dia))) cbk = row.querySelector('input[type="checkbox"]');
                    });
                    dados[dia] = { inicio: ini ? ini.value : '08:00', fim: fim ? fim.value : '17:00', ativo: cbk ? cbk.checked : true };
                });
                var dur = document.getElementById('duracao-servico'); var ant = document.getElementById('antecedencia'); var intv = document.getElementById('intervalo');
                if (dur) dados.duracaoServico = dur.value; if (ant) dados.antecedencia = ant.value; if (intv) dados.intervalo = intv.value;
                DB.set(CONF_KEY, dados);
                alert('Configurações de agenda salvas!');
            });
        }
    }

    function _normalizar(str) { return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }

    // =========================================================
    // DASHBOARD DO PRESTADOR (dashboardPrestador.html)
    // =========================================================
    function inicializarDashboardPrestador() {
        var relMain = document.querySelector('.relatorio-main');
        if (!relMain) return;

        var usu = obterUsuarioLogado();
        var emailPrest = (usu && usu.tipo === 'prestador') ? usu.email : 'prestador@servgo.com';

        function obterAgs() { return obterAgendamentosPrestador(emailPrest); }
        function formatBRL(v) { return 'R$ ' + (v || 0).toFixed(2).replace('.', ','); }

        // Injetar seletor de período
        var tituloH1 = relMain.querySelector('h1');
        if (tituloH1 && !document.getElementById('dash-periodo-form')) {
            var periodoDiv = document.createElement('div');
            periodoDiv.id = 'dash-periodo-form';
            periodoDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:20px;padding:14px 16px;background:#f0f4ff;border:1.5px solid #c7d9f7;border-radius:8px;';
            periodoDiv.innerHTML = '<div style="flex:1;min-width:140px;"><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:3px;">Data inicial</label><input type="date" id="dash-data-ini" class="form-control form-control-sm"></div><div style="flex:1;min-width:140px;"><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:3px;">Data final</label><input type="date" id="dash-data-fim" class="form-control form-control-sm"></div><div><button type="button" id="btn-dash-filtrar" class="btn btn-warning btn-sm"><i class="bi bi-funnel me-1"></i>Filtrar</button> <button type="button" id="btn-dash-limpar-filtro" class="btn btn-outline-secondary btn-sm ms-1"><i class="bi bi-x me-1"></i>Limpar</button></div><div id="dash-periodo-info" style="width:100%;font-size:.82rem;color:#146ADB;display:none;"></div>';
            tituloH1.insertAdjacentElement('afterend', periodoDiv);
        }

        function calcularStats(ini, fim) {
            var ags = obterAgs();
            if (ini) ags = ags.filter(function (a) { return a.data >= ini; });
            if (fim) ags = ags.filter(function (a) { return a.data <= fim; });
            var concluidos = ags.filter(function (a) { return a.status === 'concluido'; });
            var clientes = {}; concluidos.forEach(function (a) { clientes[a.cliente] = true; });
            var fat = 0; concluidos.forEach(function (a) { fat += parseFloat(a.valor) || 0; });
            var avsRec = obterAvaliacoesRecebidasPrestador(emailPrest);
            var avsPos = avsRec.filter(function (a) { return (a.nota || 0) >= 4; }).length;
            var pct = avsRec.length > 0 ? Math.round((avsPos / avsRec.length) * 100) : 0;
            return { clientes: Object.keys(clientes).length, servicos: concluidos.length, faturamento: fat, pctPos: pct, concluidos: concluidos };
        }

        function atualizarCards(stats) {
            var grid = relMain.querySelector('.grid');
            if (!grid) return;
            var kvs = grid.querySelectorAll('.kv');
            if (kvs[0]) kvs[0].textContent = stats.clientes;
            if (kvs[1]) kvs[1].textContent = stats.servicos;
            if (kvs[2]) kvs[2].textContent = formatBRL(stats.faturamento);
            if (kvs[3]) kvs[3].textContent = stats.pctPos + '%';
        }

        function gerarTabela(concluidos) {
            var cardPlac = relMain.querySelector('.card .placeholder');
            if (!cardPlac) return;
            var cardPai = cardPlac.closest('.card');

            // Botão Imprimir/Exportar
            if (!document.getElementById('btn-dash-imprimir')) {
                var btnGrp = document.createElement('div');
                btnGrp.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;';
                btnGrp.innerHTML = '<strong style="font-size:.88rem;color:var(--texto-muted);">Exportar:</strong><div class="dropdown" style="position:relative;display:inline-block;"><button id="btn-dash-imprimir" class="btn btn-warning btn-sm" type="button"><i class="bi bi-printer me-1"></i>Imprimir <i class="bi bi-caret-down-fill" style="font-size:.7rem;"></i></button><div id="dash-export-menu" style="display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #dee2e6;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,.1);z-index:100;min-width:160px;padding:4px 0;"><a href="#" id="dash-exp-print" style="display:block;padding:7px 14px;font-size:.85rem;text-decoration:none;color:#212529;"><i class="bi bi-printer me-2"></i>Imprimir / PDF</a><a href="#" id="dash-exp-csv" style="display:block;padding:7px 14px;font-size:.85rem;text-decoration:none;color:#212529;"><i class="bi bi-filetype-csv me-2"></i>Exportar CSV</a><a href="#" id="dash-exp-xls" style="display:block;padding:7px 14px;font-size:.85rem;text-decoration:none;color:#212529;"><i class="bi bi-file-earmark-excel me-2"></i>Exportar Excel</a><a href="#" id="dash-exp-word" style="display:block;padding:7px 14px;font-size:.85rem;text-decoration:none;color:#212529;"><i class="bi bi-file-earmark-word me-2"></i>Exportar Word</a></div></div>';
                cardPai.insertBefore(btnGrp, cardPai.querySelector('h3'));

                document.getElementById('btn-dash-imprimir').addEventListener('click', function (e) { e.stopPropagation(); var m = document.getElementById('dash-export-menu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; });
                document.addEventListener('click', function () { var m = document.getElementById('dash-export-menu'); if (m) m.style.display = 'none'; });
                document.getElementById('dash-exp-print').addEventListener('click', function (e) { e.preventDefault(); window.print(); });
                document.getElementById('dash-exp-csv').addEventListener('click', function (e) {
                    e.preventDefault();
                    var ags = obterAgs().filter(function (a) { return a.status === 'concluido'; });
                    var csv = 'Data,Cliente,Serviço,Valor,Pagamento\n';
                    ags.forEach(function (a) { csv += [a.data, '"' + a.cliente + '"', '"' + a.servico + '"', (a.valor || 0).toFixed(2), '"' + (a.formaPagamento || '') + '"'].join(',') + '\n'; });
                    _download(csv, 'relatorio_servgo.csv', 'text/csv;charset=utf-8;');
                });
                document.getElementById('dash-exp-xls').addEventListener('click', function (e) {
                    e.preventDefault();
                    var ags = obterAgs().filter(function (a) { return a.status === 'concluido'; });
                    var tsv = 'Data\tCliente\tServiço\tValor\tPagamento\n';
                    ags.forEach(function (a) { tsv += [a.data, a.cliente, a.servico, (a.valor || 0).toFixed(2), (a.formaPagamento || '')].join('\t') + '\n'; });
                    _download(tsv, 'relatorio_servgo.xls', 'application/vnd.ms-excel');
                });
                document.getElementById('dash-exp-word').addEventListener('click', function (e) {
                    e.preventDefault();
                    var ags = obterAgs().filter(function (a) { return a.status === 'concluido'; });
                    var html = '<html><head><meta charset="UTF-8"><title>Relatório ServGo!</title></head><body><h1>Relatório de Atendimentos</h1><table border="1" cellpadding="6"><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Pagamento</th></tr>';
                    ags.forEach(function (a) { html += '<tr><td>' + a.data + '</td><td>' + a.cliente + '</td><td>' + a.servico + '</td><td>R$' + (a.valor || 0).toFixed(2) + '</td><td>' + (a.formaPagamento || '') + '</td></tr>'; });
                    html += '</table></body></html>';
                    _download('\ufeff' + html, 'relatorio_servgo.doc', 'application/msword');
                });
            }

            if (concluidos.length === 0) { cardPlac.innerHTML = 'Nenhum atendimento concluído no período.'; return; }
            var tbl = '<div class="table-responsive"><table class="table table-bordered table-hover align-middle" style="font-size:.85rem;"><thead class="table-dark"><tr><th>#</th><th>Data</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Pagamento</th></tr></thead><tbody>';
            concluidos.forEach(function (a, i) { tbl += '<tr><td>' + (i + 1) + '</td><td>' + a.data + '</td><td>' + a.cliente + '</td><td>' + a.servico + '</td><td>' + formatBRL(a.valor) + '</td><td>' + (a.formaPagamento || '—') + '</td></tr>'; });
            tbl += '</tbody></table></div>';
            cardPlac.innerHTML = tbl;
        }

        function _download(conteudo, nome, tipo) {
            var blob = new Blob([conteudo], { type: tipo });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a'); link.href = url; link.download = nome; link.click();
            URL.revokeObjectURL(url);
        }

        function renderizar(ini, fim) { var s = calcularStats(ini, fim); atualizarCards(s); gerarTabela(s.concluidos); }

        var btnFiltrar = document.getElementById('btn-dash-filtrar');
        var btnLimpar = document.getElementById('btn-dash-limpar-filtro');
        if (btnFiltrar) {
            btnFiltrar.addEventListener('click', function () {
                var ini = (document.getElementById('dash-data-ini') || {}).value || '';
                var fim = (document.getElementById('dash-data-fim') || {}).value || '';
                if (ini && fim && ini > fim) { alert('Data inicial não pode ser maior que a final.'); return; }
                var info = document.getElementById('dash-periodo-info');
                if (info) { info.style.display = (ini || fim) ? 'block' : 'none'; info.innerHTML = '<i class="bi bi-funnel-fill me-1"></i>Período: ' + (ini ? ini.split('-').reverse().join('/') : 'início') + ' até ' + (fim ? fim.split('-').reverse().join('/') : 'hoje'); }
                renderizar(ini || null, fim || null);
            });
        }
        if (btnLimpar) {
            btnLimpar.addEventListener('click', function () {
                ['dash-data-ini', 'dash-data-fim'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
                var info = document.getElementById('dash-periodo-info'); if (info) info.style.display = 'none';
                renderizar(null, null);
            });
        }

        renderizar(null, null);
    }

    // =========================================================
    // CONTATO DO PRESTADOR (prestadorContato.html)
    // =========================================================
    function inicializarContatoPrestador() {
        var btnEnviar = document.querySelector('.contato-enviar-btn');
        if (!btnEnviar) return;

        var notif = document.getElementById('sg-notif-barra-prest');
        if (notif) notif.remove();

        // Preenche nome e email do usuário logado
        var usu = obterUsuarioLogado();
        if (usu) {
            var nomeEl = document.getElementById('nome'); var emailEl = document.getElementById('email');
            if (nomeEl && !nomeEl.value) nomeEl.value = usu.nome || '';
            if (emailEl && !emailEl.value) emailEl.value = usu.email || '';
        }

        btnEnviar.addEventListener('click', function () {
            var nome = (document.getElementById('nome') || {}).value || '';
            var email = (document.getElementById('email') || {}).value || '';
            var mensagem = (document.getElementById('mensagem') || {}).value || '';
            if (!nome.trim()) { alert('Informe seu nome.'); return; }
            if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { alert('Informe um e-mail válido.'); return; }
            if (!mensagem.trim()) { alert('Escreva uma mensagem.'); return; }

            // Pronto para enviar ao banco de dados / API
            var contatos = DB.get('contatosMensagens') || [];
            contatos.push({ de: nome, email: email, mensagem: mensagem, data: new Date().toISOString() });
            DB.set('contatosMensagens', contatos);

            alert('Mensagem enviada com sucesso! Entraremos em contato em breve.');
            ['nome', 'email', 'mensagem', 'arquivo'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
        });
    }

    // =========================================================
    // ÁREA DO CLIENTE (clienteAreaExclusiva.html)
    // =========================================================
    function inicializarClienteAreaExclusiva() {
        var pedidosList = document.querySelector('.cli-pedidos-lista');
        if (!pedidosList) return;

        var AVALIACOES_KEY = 'avaliacoesSalvas';
        function obterAvaliacoes() { return DB.get(AVALIACOES_KEY) || []; }
        function salvarAvaliacoes(arr) { DB.set(AVALIACOES_KEY, arr); }
        function obterAvaliacaoPorPedido(pedidoId) { return obterAvaliacoes().find(function (a) { return a.pedidoId === pedidoId; }) || null; }

        var dadosAgendamentos = {
            'pedido-1': { dataHora: '10/04/2026 às 09:00', valor: 150.00 },
            'pedido-2': { dataHora: '05/03/2026 às 08:00', valor: 250.00 },
            'pedido-3': { dataHora: '15/02/2026 às 14:00', valor: 0 }
        };

        function calcularEstatisticas() {
            var itens = pedidosList.querySelectorAll('.cli-pedidos-item');
            var emAberto = 0; var concluidos = 0; var totalPago = 0;
            var pedidosAbertos = []; var pedidosConcluidos = [];
            itens.forEach(function (item) {
                var badge = item.querySelector('.cli-badge');
                var dados = dadosAgendamentos[item.dataset.pedidoId] || { dataHora: 'N/D', valor: 0 };
                if (badge && badge.classList.contains('em-andamento')) { emAberto++; pedidosAbertos.push({ pedidoId: item.dataset.pedidoId, servico: item.dataset.servico, profissional: item.dataset.profissional, dataHora: dados.dataHora }); }
                if (badge && badge.classList.contains('concluido')) { concluidos++; totalPago += dados.valor; pedidosConcluidos.push({ pedidoId: item.dataset.pedidoId, servico: item.dataset.servico, profissional: item.dataset.profissional, dataHora: dados.dataHora, valor: dados.valor }); }
            });
            return { emAberto: emAberto, concluidos: concluidos, totalPago: totalPago, pedidosAbertos: pedidosAbertos, pedidosConcluidos: pedidosConcluidos };
        }

        function atualizarStatCards(stats) {
            var cards = document.querySelectorAll('.cli-stat-card');
            if (cards.length < 3) return;
            var v0 = cards[0].querySelector('.cli-stat-valor'); if (v0) v0.textContent = stats.emAberto;
            var v1 = cards[1].querySelector('.cli-stat-valor'); if (v1) v1.textContent = 'R$ ' + stats.totalPago.toFixed(2).replace('.', ',');
            var v2 = cards[2].querySelector('.cli-stat-valor'); if (v2) v2.textContent = stats.concluidos;
        }

        function criarModal(idModal, titulo, corTitulo, conteudoHTML) {
            var ex = document.getElementById(idModal); if (ex) ex.remove();
            var modal = document.createElement('div');
            modal.className = 'modal fade'; modal.id = idModal; modal.setAttribute('tabindex', '-1');
            modal.innerHTML = '<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header" style="background-color:' + corTitulo + ';color:' + (corTitulo === '#FFC300' ? '#000' : '#fff') + ';"><h5 class="modal-title">' + titulo + '</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">' + conteudoHTML + '</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div></div></div>';
            document.body.appendChild(modal);
            return modal;
        }

        var stats = calcularEstatisticas();
        atualizarStatCards(stats);

        // Links nos stat cards
        var cards = document.querySelectorAll('.cli-stat-card');
        if (cards[0]) { var info0 = cards[0].querySelector('.cli-stat-info'); if (info0) { info0.innerHTML = '<i class="bi bi-hourglass"></i> <a href="#" id="link-aguardando" style="color:inherit;text-decoration:underline;">Aguardando Confirmação</a>'; var linkAg = document.getElementById('link-aguardando'); if (linkAg) linkAg.addEventListener('click', function (e) { e.preventDefault(); _abrirModalAguardandoConf(criarModal); }); } }
        if (cards[1]) { var info1 = cards[1].querySelector('.cli-stat-info'); if (info1) { info1.innerHTML = '<i class="bi bi-currency-dollar"></i> <a href="#" id="link-pagamentos" style="color:inherit;text-decoration:underline;">Ver detalhes</a>'; var linkPag = document.getElementById('link-pagamentos'); if (linkPag) linkPag.addEventListener('click', function (e) { e.preventDefault(); var modal = criarModal('modalPagamentos', '<i class="bi bi-currency-dollar me-2"></i>Pagamentos', '#FFC300', '<p>Total pago: <strong>R$ ' + stats.totalPago.toFixed(2).replace('.', ',') + '</strong></p>'); new bootstrap.Modal(modal).show(); }); } }
        if (cards[2]) { var info2 = cards[2].querySelector('.cli-stat-info'); if (info2) { info2.innerHTML = '<i class="bi bi-patch-check"></i> <a href="#" id="link-historico" style="color:inherit;text-decoration:underline;">Ver Histórico</a>'; var linkHist = document.getElementById('link-historico'); if (linkHist) linkHist.addEventListener('click', function (e) { e.preventDefault(); var conteudo = stats.pedidosConcluidos.length === 0 ? '<p class="text-muted">Nenhum concluído.</p>' : '<table class="table"><thead><tr><th>#</th><th>Serviço</th><th>Prestador</th><th>Valor</th></tr></thead><tbody>' + stats.pedidosConcluidos.map(function (p, i) { return '<tr><td>' + (i + 1) + '</td><td>' + p.servico + '</td><td>' + p.profissional + '</td><td>R$' + p.valor.toFixed(2).replace('.', ',') + '</td></tr>'; }).join('') + '</tbody></table>'; var modal = criarModal('modalHistorico', '<i class="bi bi-patch-check me-2"></i>Histórico', '#FFC300', conteudo); new bootstrap.Modal(modal).show(); }); } }

        // Avaliações
        function initEstrelas(cont, hidden) {
            if (!cont || !hidden) return;
            var stars = cont.querySelectorAll('i');
            stars.forEach(function (s, i) {
                s.addEventListener('click', function () { hidden.value = i + 1; stars.forEach(function (st, j) { st.className = j <= i ? 'bi bi-star-fill filled' : 'bi bi-star'; st.style.color = j <= i ? '#ffc107' : '#ccc'; }); });
                s.addEventListener('mouseover', function () { stars.forEach(function (st, j) { st.style.color = j <= i ? '#ffc107' : '#ccc'; }); });
                s.addEventListener('mouseout', function () { var cur = parseInt(hidden.value) || 0; stars.forEach(function (st, j) { st.style.color = j < cur ? '#ffc107' : '#ccc'; }); });
            });
        }
        function renderEstrelas(cont, hidden, nota) { if (!cont || !hidden) return; var stars = cont.querySelectorAll('i'); stars.forEach(function (s, i) { s.className = i < nota ? 'bi bi-star-fill filled' : 'bi bi-star'; s.style.color = i < nota ? '#ffc107' : '#ccc'; }); hidden.value = nota; }

        var starsAv = document.getElementById('modal-estrelas'); var notaAv = document.getElementById('modal-nota-valor');
        var starsEd = document.getElementById('modal-editar-estrelas'); var notaEd = document.getElementById('modal-editar-nota-valor');
        initEstrelas(starsAv, notaAv); initEstrelas(starsEd, notaEd);
        var pedidoAtual = null;

        pedidosList.querySelectorAll('.btn-avaliar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.cli-pedidos-item'); pedidoAtual = item.dataset.pedidoId;
                var info = document.getElementById('modal-prestador-info'); if (info) info.innerHTML = '<strong>Serviço:</strong> ' + item.dataset.servico + ' | <strong>Prestador:</strong> ' + item.dataset.profissional;
                renderEstrelas(starsAv, notaAv, 0); var coment = document.getElementById('modal-comentario'); if (coment) coment.value = '';
                var m = document.getElementById('modalAvaliar'); if (m) new bootstrap.Modal(m).show();
            });
        });

        var btnSalvarAv = document.getElementById('btn-salvar-avaliacao');
        if (btnSalvarAv) {
            btnSalvarAv.addEventListener('click', function () {
                var nota = parseInt((notaAv || {}).value) || 0; var coment = (document.getElementById('modal-comentario') || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; } if (!coment.trim()) { alert('Escreva um comentário.'); return; }
                var item = pedidosList.querySelector('[data-pedido-id="' + pedidoAtual + '"]');
                var avs = obterAvaliacoes(); var idx = avs.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                var usu = obterUsuarioLogado();
                var nova = { id: pedidoAtual + '_' + Date.now(), pedidoId: pedidoAtual, servico: item.dataset.servico, profissional: item.dataset.profissional, nota: nota, comentario: coment, data: new Date().toLocaleDateString('pt-BR'), clienteNome: usu ? usu.nome : 'Cliente' };
                if (idx >= 0) avs[idx] = nova; else avs.push(nova);
                salvarAvaliacoes(avs);
                var m = document.getElementById('modalAvaliar'); if (m) { var inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); }
                alert('Avaliação salva!');
            });
        }

        pedidosList.querySelectorAll('.btn-editar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.cli-pedidos-item'); var pedidoId = item.dataset.pedidoId;
                var av = obterAvaliacaoPorPedido(pedidoId);
                if (!av) { alert('Nenhuma avaliação para editar. Use "Avaliar".'); return; }
                pedidoAtual = pedidoId;
                var info = document.getElementById('modal-editar-info'); if (info) info.innerHTML = '<strong>Serviço:</strong> ' + av.servico + ' | <strong>Prestador:</strong> ' + av.profissional;
                renderEstrelas(starsEd, notaEd, av.nota); var coment = document.getElementById('modal-editar-comentario'); if (coment) coment.value = av.comentario;
                var m = document.getElementById('modalEditar'); if (m) new bootstrap.Modal(m).show();
            });
        });

        var btnSalvarEd = document.getElementById('btn-salvar-edicao');
        if (btnSalvarEd) {
            btnSalvarEd.addEventListener('click', function () {
                var nota = parseInt((notaEd || {}).value) || 0; var coment = (document.getElementById('modal-editar-comentario') || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; } if (!coment.trim()) { alert('Escreva um comentário.'); return; }
                var avs = obterAvaliacoes(); var idx = avs.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                if (idx >= 0) { avs[idx].nota = nota; avs[idx].comentario = coment; salvarAvaliacoes(avs); }
                var m = document.getElementById('modalEditar'); if (m) { var inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); }
                alert('Avaliação atualizada!');
            });
        }

        pedidosList.querySelectorAll('.btn-excluir').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.cli-pedidos-item'); var pedidoId = item.dataset.pedidoId;
                var av = obterAvaliacaoPorPedido(pedidoId); if (!av) { alert('Nenhuma avaliação para excluir.'); return; }
                if (!confirm('Excluir a avaliação?')) return;
                salvarAvaliacoes(obterAvaliacoes().filter(function (a) { return a.pedidoId !== pedidoId; }));
                alert('Excluída!');
            });
        });
    }

    function _abrirModalAguardandoConf(criarModal) {
        var usu = obterUsuarioLogado();
        var emailCli = usu ? usu.email : '';
        var ags = DB.get('clienteAgendamentos_' + emailCli) || [];
        var html = ags.length === 0 ? '<p class="text-muted text-center py-3">Nenhuma solicitação registrada.</p>' :
            '<div class="table-responsive"><table class="table table-bordered"><thead class="table-dark"><tr><th>#</th><th>Serviço</th><th>Prestador</th><th>Data</th><th>Status</th></tr></thead><tbody>' +
            ags.map(function (ag, i) {
                var statusMap = { pendente: { cor: '#0d6efd', texto: 'Aguardando' }, confirmado: { cor: '#198754', texto: 'Confirmado' }, cancelado: { cor: '#dc3545', texto: 'Cancelado' } };
                var st = statusMap[ag.status] || { cor: '#6c757d', texto: ag.status || '—' };
                return '<tr><td>' + (i + 1) + '</td><td>' + (ag.servico || '—') + '</td><td>' + (ag.nomePrestador || '—') + '</td><td>' + (ag.data || '—') + '</td><td><span class="badge" style="background:' + st.cor + ';">' + st.texto + '</span></td></tr>';
            }).join('') + '</tbody></table></div>';
        var modal = criarModal('modalAguardando', '<i class="bi bi-hourglass me-2"></i>Meus Agendamentos', '#FFC300', html);
        new bootstrap.Modal(modal).show();
    }

    // =========================================================
    // AVALIAÇÕES FEITAS (clienteAvaliacoesFeitas.html)
    // =========================================================
    function inicializarAvaliacoesFeitas() {
        var container = document.getElementById('container-avaliacoes-feitas');
        if (!container) return;
        var AVALIACOES_KEY = 'avaliacoesSalvas';
        function obterAvs() { return DB.get(AVALIACOES_KEY) || []; }
        function salvarAvs(arr) { DB.set(AVALIACOES_KEY, arr); }

        var modalEl = document.getElementById('modalEditarFeita');
        var starsEl = document.getElementById('modal-editar-feita-estrelas');
        var notaEl = document.getElementById('modal-editar-feita-nota-valor');
        var comentEl = document.getElementById('modal-editar-feita-comentario');
        var infoEl = document.getElementById('modal-editar-feita-info');
        var btnSalvar = document.getElementById('btn-salvar-edicao-feita');
        var pedidoAtual = null;

        function initEstrelas(c, h) { if (!c || !h) return; var stars = c.querySelectorAll('i'); stars.forEach(function (s, i) { s.addEventListener('click', function () { h.value = i + 1; stars.forEach(function (st, j) { st.className = j <= i ? 'bi bi-star-fill filled' : 'bi bi-star'; st.style.color = j <= i ? '#ffc107' : '#ccc'; }); }); s.addEventListener('mouseover', function () { stars.forEach(function (st, j) { st.style.color = j <= i ? '#ffc107' : '#ccc'; }); }); s.addEventListener('mouseout', function () { var cur = parseInt(h.value) || 0; stars.forEach(function (st, j) { st.style.color = j < cur ? '#ffc107' : '#ccc'; }); }); }); }
        function renderE(c, h, n) { if (!c || !h) return; var stars = c.querySelectorAll('i'); stars.forEach(function (s, i) { s.className = i < n ? 'bi bi-star-fill filled' : 'bi bi-star'; s.style.color = i < n ? '#ffc107' : '#ccc'; }); h.value = n; }
        initEstrelas(starsEl, notaEl);

        function renderizarLista() {
            container.querySelectorAll('.review-card-reverse[data-pedido-id]').forEach(function (c) { c.remove(); });
            container.querySelectorAll('#hdr-av-feitas, #msg-av-feitas').forEach(function (c) { c.remove(); });
            var avs = obterAvs();
            var botao = container.querySelector('.d-flex.justify-content-center');
            var hdr = document.createElement('div'); hdr.id = 'hdr-av-feitas'; hdr.style.cssText = 'font-size:1rem;font-weight:700;color:#146ADB;padding-bottom:8px;border-bottom:2px solid #146ADB;margin-bottom:12px;'; hdr.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107;"></i>Minhas Avaliações Realizadas';
            container.insertBefore(hdr, botao || null);
            if (avs.length === 0) { var msg = document.createElement('div'); msg.id = 'msg-av-feitas'; msg.className = 'text-center text-muted py-4'; msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Nenhuma avaliação ainda.'; container.insertBefore(msg, botao || null); return; }
            avs.slice().reverse().forEach(function (av) {
                var stars = Array.from({ length: 5 }, function (_, i) { return i < av.nota ? '<i class="bi bi-star-fill" style="color:#ffc107;"></i>' : '<i class="bi bi-star" style="color:#ccc;"></i>'; }).join('');
                var card = document.createElement('div'); card.className = 'review-card-reverse'; card.dataset.pedidoId = av.pedidoId;
                card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0">Prestador: ' + (av.profissional || av.profissional || '—') + ' (' + (av.servico || '') + ')</h5><span class="text-muted"><small>' + av.data + '</small></span></div><div class="rating">' + stars + '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6></div><p class="review-text">"' + av.comentario + '"</p><div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-warning btn-editar-feita" data-pedido-id="' + av.pedidoId + '"><i class="bi bi-pencil-square me-1"></i>Editar</button><button type="button" class="btn btn-danger btn-excluir-feita" data-pedido-id="' + av.pedidoId + '"><i class="bi bi-trash me-1"></i>Excluir</button></div>';
                container.insertBefore(card, botao || null);
            });
        }

        container.addEventListener('click', function (e) {
            var btnEd = e.target.closest('.btn-editar-feita'); var btnEx = e.target.closest('.btn-excluir-feita');
            if (btnEd) {
                var pid = btnEd.dataset.pedidoId; var av = obterAvs().find(function (a) { return a.pedidoId === pid; }); if (!av) return;
                pedidoAtual = pid; if (infoEl) infoEl.innerHTML = '<strong>Serviço:</strong> ' + av.servico + ' | <strong>Prestador:</strong> ' + av.profissional;
                renderE(starsEl, notaEl, av.nota); if (comentEl) comentEl.value = av.comentario;
                if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
            if (btnEx) { var pidEx = btnEx.dataset.pedidoId; if (!confirm('Excluir?')) return; salvarAvs(obterAvs().filter(function (a) { return a.pedidoId !== pidEx; })); renderizarLista(); alert('Excluída!'); }
        });

        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                var nota = parseInt((notaEl || {}).value) || 0; var coment = (comentEl || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; } if (!coment.trim()) { alert('Escreva um comentário.'); return; }
                var avs = obterAvs(); var idx = avs.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                if (idx >= 0) { avs[idx].nota = nota; avs[idx].comentario = coment; salvarAvs(avs); }
                if (modalEl) { var inst = bootstrap.Modal.getInstance(modalEl); if (inst) inst.hide(); }
                renderizarLista(); alert('Atualizada!');
            });
        }
        renderizarLista();
    }

    // =========================================================
    // AVALIAÇÕES RECEBIDAS (clienteAvaliacoesRecebidas.html)
    // =========================================================
    function inicializarAvaliacoesRecebidas() {
        var container = document.getElementById('container-avaliacoes-recebidas');
        if (!container) return;
        var KEY = 'avaliacoesRecebidasDoCliente';
        var atual = DB.get(KEY);
        if (!atual) {
            DB.set(KEY, [
                { id: 'rec-1', prestador: 'Maria P.', servico: 'Pintura', nota: 5, comentario: 'Cliente educado e respeitoso.', data: '01/01/2023' },
                { id: 'rec-2', prestador: 'Pedro S.', servico: 'Montador de Móveis', nota: 3, comentario: 'Serviço concluído, mas o ambiente foi péssimo.', data: '01/01/2023' }
            ]);
        }
        function renderizarLista() {
            container.querySelectorAll('.review-card-reverse[data-recebida-id]').forEach(function (c) { c.remove(); });
            container.querySelectorAll('#hdr-av-rec, #msg-av-rec').forEach(function (c) { c.remove(); });
            var avs = DB.get(KEY) || [];
            var botao = container.querySelector('.d-flex.justify-content-center');
            var hdr = document.createElement('div'); hdr.id = 'hdr-av-rec'; hdr.style.cssText = 'font-size:1rem;font-weight:700;color:#146ADB;padding-bottom:8px;border-bottom:2px solid #146ADB;margin-bottom:12px;'; hdr.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107;"></i>Avaliações Recebidas dos Prestadores';
            container.insertBefore(hdr, botao || null);
            if (avs.length === 0) { var msg = document.createElement('div'); msg.id = 'msg-av-rec'; msg.className = 'text-center text-muted py-4'; msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Nenhuma avaliação recebida.'; container.insertBefore(msg, botao || null); return; }
            avs.slice().reverse().forEach(function (av) {
                var stars = Array.from({ length: 5 }, function (_, i) { return i < av.nota ? '<i class="bi bi-star-fill" style="color:#ffc107;"></i>' : '<i class="bi bi-star" style="color:#ccc;"></i>'; }).join('');
                var card = document.createElement('div'); card.className = 'review-card-reverse'; card.dataset.recebidaId = av.id;
                card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0">Prestador: ' + av.prestador + ' (' + av.servico + ')</h5><span class="text-muted"><small>' + av.data + '</small></span></div><div class="rating">' + stars + '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6></div><p class="review-text">"' + av.comentario + '"</p>';
                container.insertBefore(card, botao || null);
            });
        }
        renderizarLista();
    }

    // =========================================================
    // PERFIL DO CLIENTE
    // =========================================================
    function inicializarPerfilCliente() {
        var inputNome = document.getElementById('adm-nome');
        if (!inputNome || document.getElementById('adm-cnpj')) return; // evita conflito com hotsite

        var usu = obterUsuarioLogado();
        var emailLogado = usu ? usu.email : '';
        var usuarios = obterUsuariosCadastrados();
        var dadosUsu = usuarios[emailLogado] || {};
        var avatarDiv = document.querySelector('.hotsite-avatar');

        var inputEmail = document.getElementById('adm-email');
        var inputCpf = document.getElementById('adm-cpf');
        var inputCidade = document.getElementById('adm-cidade');
        var inputEndereco = document.getElementById('adm-endereco');
        var inputTel = document.getElementById('adm-tel');
        var inputFoto = document.getElementById('adm-foto');
        var btnSalvar = document.getElementById('btn-salvar-perfil');
        var btnLimpar = document.getElementById('btn-limpar-perfil');

        inputNome.value = dadosUsu.nome || (usu ? usu.nome : '');
        if (inputEmail) { inputEmail.value = emailLogado; inputEmail.setAttribute('readonly', 'true'); }
        if (dadosUsu.perfil) {
            if (inputCpf) inputCpf.value = dadosUsu.perfil.cpf || '';
            if (inputCidade) inputCidade.value = dadosUsu.perfil.cidade || '';
            if (inputEndereco) inputEndereco.value = dadosUsu.perfil.endereco || '';
            if (inputTel) inputTel.value = dadosUsu.perfil.tel || '';
            if (dadosUsu.perfil.foto && avatarDiv) { avatarDiv.style.backgroundImage = 'url(' + dadosUsu.perfil.foto + ')'; avatarDiv.style.backgroundSize = 'cover'; avatarDiv.textContent = ''; avatarDiv.dataset.base64 = dadosUsu.perfil.foto; }
            else if (avatarDiv) avatarDiv.textContent = inputNome.value.substring(0, 2).toUpperCase();
        } else { if (avatarDiv) avatarDiv.textContent = inputNome.value.substring(0, 2).toUpperCase(); }

        if (inputFoto) { inputFoto.addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function (ev) { if (avatarDiv) { avatarDiv.style.backgroundImage = 'url(' + ev.target.result + ')'; avatarDiv.style.backgroundSize = 'cover'; avatarDiv.textContent = ''; avatarDiv.dataset.base64 = ev.target.result; } }; r.readAsDataURL(f); }); }

        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                dadosUsu.nome = inputNome.value;
                if (usu) { usu.nome = inputNome.value; DB.set('usuarioLogado', usu); }
                dadosUsu.perfil = { cpf: inputCpf ? inputCpf.value : '', cidade: inputCidade ? inputCidade.value : '', endereco: inputEndereco ? inputEndereco.value : '', tel: inputTel ? inputTel.value : '', foto: (avatarDiv && avatarDiv.dataset.base64) || '' };
                usuarios[emailLogado] = dadosUsu;
                salvarUsuariosCadastrados(usuarios);
                alert('Perfil salvo!'); window.location.reload();
            });
        }
        if (btnLimpar) {
            btnLimpar.addEventListener('click', function () {
                if (inputCpf) inputCpf.value = ''; if (inputCidade) inputCidade.value = ''; if (inputEndereco) inputEndereco.value = ''; if (inputTel) inputTel.value = ''; if (inputFoto) inputFoto.value = '';
                if (avatarDiv) { avatarDiv.style.backgroundImage = ''; avatarDiv.textContent = inputNome.value.substring(0, 2).toUpperCase(); delete avatarDiv.dataset.base64; }
            });
        }

        var btnSalvarSenha = document.getElementById('btn-salvar-senha');
        if (btnSalvarSenha) {
            btnSalvarSenha.addEventListener('click', function () {
                var atual = (document.getElementById('senha-atual') || {}).value || '';
                var nova = (document.getElementById('nova-senha') || {}).value || '';
                var repita = (document.getElementById('repita-nova-senha') || {}).value || '';
                if (atual !== dadosUsu.senha) { alert('Senha atual incorreta!'); return; }
                var rx = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
                if (!rx.test(nova)) { alert('A nova senha deve ter mínimo 8 caracteres com letras, números e especiais.'); return; }
                if (nova !== repita) { alert('As senhas não coincidem.'); return; }
                dadosUsu.senha = nova; usuarios[emailLogado] = dadosUsu; salvarUsuariosCadastrados(usuarios);
                alert('Senha atualizada!');
                ['senha-atual', 'nova-senha', 'repita-nova-senha'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
                var m = document.getElementById('modalAlterarSenha'); if (m) { var inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); }
            });
        }
    }

    // =========================================================
    // AGENDAR SERVIÇOS (clienteAgendarServicos.html)
    // =========================================================
    function inicializarAgendarServicos() {
        var mainAgendar = document.querySelector('.agendar-main');
        if (!mainAgendar) return;

        var usu = obterUsuarioLogado();
        var estaLogado = usu && (usu.tipo === 'cliente' || usu.tipo === 'admin');

        var selects = mainAgendar.querySelectorAll('.agendar-select');
        var selectTipo = selects[0]; var selectPrestador = selects[1];
        var blocos = mainAgendar.querySelectorAll('.agendar-info-bloco');
        var blocoHorario = blocos[0]; var blocoContato = blocos[1];
        var btnAgendar = mainAgendar.querySelector('.cta');
        var linkHotsite = mainAgendar.querySelector('.agendar-link');
        if (!selectTipo || !selectPrestador) return;

        // Semear prestadores demo
        _semearPrestadoresDemo();

        function obterPrestadoresDoTipo(tipo) {
            var store = obterStorePrestadores();
            return Object.keys(store).map(function (e) { return Object.assign({}, store[e], { email: e }); }).filter(function (p) { return p.nome && p.categoria === tipo; });
        }
        function obterTipos() {
            var store = obterStorePrestadores(); var tipos = [];
            Object.values(store).forEach(function (p) { if (p.categoria && !tipos.includes(p.categoria)) tipos.push(p.categoria); });
            return tipos.sort();
        }

        function proximoHorario(emailPrest) {
            var ags = obterAgendamentosPrestador(emailPrest);
            var ocupados = {};
            ags.forEach(function (a) { if (a.status === 'cancelado') return; var ini = (a.horario || '').split(' - ')[0]; if (ini && a.data) ocupados[a.data + ' ' + ini] = true; });
            var agora = new Date();
            for (var d = 0; d < 30; d++) {
                var dia = new Date(agora); dia.setDate(agora.getDate() + d);
                if (dia.getDay() === 0 || dia.getDay() === 6) continue;
                var dataStr = dia.toISOString().substring(0, 10);
                for (var h = 8; h < 18; h++) {
                    if (d === 0 && h <= agora.getHours()) continue;
                    var hor = String(h).padStart(2, '0') + ':00';
                    if (!ocupados[dataStr + ' ' + hor]) return { data: dataStr, horario: hor, label: _formatarDiaLabel(dataStr) + ' às ' + hor };
                }
            }
            return null;
        }

        var slotAtual = null;

        function preencherTipos() {
            selectTipo.innerHTML = '<option value="">-- Tipo de Serviço --</option>';
            obterTipos().forEach(function (t) { var opt = document.createElement('option'); opt.value = t; opt.textContent = t; selectTipo.appendChild(opt); });
        }
        function preencherPrestadores(tipo) {
            selectPrestador.innerHTML = '<option value="">-- Selecione um Prestador --</option>';
            obterPrestadoresDoTipo(tipo).forEach(function (p) { var opt = document.createElement('option'); opt.value = p.email; opt.textContent = p.nome; selectPrestador.appendChild(opt); });
        }
        function atualizarInfoPrestador(email) {
            slotAtual = null;
            if (!email) { if (blocoHorario) blocoHorario.innerHTML = ''; if (blocoContato) blocoContato.innerHTML = ''; return; }
            var dados = obterStorePrestadores()[email] || {};
            slotAtual = proximoHorario(email);
            if (blocoHorario) blocoHorario.innerHTML = slotAtual ? '<strong>' + slotAtual.label + '</strong>' : '<em>Sem disponibilidade.</em>';
            if (blocoContato) blocoContato.innerHTML = '<i class="bi bi-telephone me-1"></i>' + (dados.tel || '—') + '<br><i class="bi bi-envelope me-1"></i>' + (dados.email || email);
        }

        selectTipo.addEventListener('change', function () { preencherPrestadores(selectTipo.value); atualizarInfoPrestador(''); });
        selectPrestador.addEventListener('change', function () { atualizarInfoPrestador(selectPrestador.value); });

        if (btnAgendar) {
            btnAgendar.addEventListener('click', function () {
                if (!estaLogado) { _modalLoginNecessario(); return; }
                if (!selectPrestador.value) { alert('Selecione um prestador.'); return; }
                if (!slotAtual) { alert('Sem horários disponíveis.'); return; }
                var ags = obterAgendamentosPrestador(selectPrestador.value);
                var ocupado = ags.some(function (a) { return a.status !== 'cancelado' && a.data === slotAtual.data && (a.horario || '').split(' - ')[0] === slotAtual.horario; });
                if (ocupado) { alert('Horário já ocupado. Atualizando disponibilidade...'); atualizarInfoPrestador(selectPrestador.value); return; }
                var novoId = 'ag-cli-' + Date.now();
                var fimH = String(parseInt(slotAtual.horario.split(':')[0]) + 1).padStart(2, '0') + ':00';
                ags.push({ id: novoId, status: 'pendente', data: slotAtual.data, horario: slotAtual.horario + ' - ' + fimH, cliente: usu.nome, clienteEmail: usu.email, servico: selectTipo.value || 'Serviço', observacoes: '', lembretes: [], valor: 0, formaPagamento: '' });
                salvarAgendamentosPrestador(selectPrestador.value, ags);
                var cliAgs = DB.get('clienteAgendamentos_' + usu.email) || [];
                var store = obterStorePrestadores(); var nomePrest = (store[selectPrestador.value] || {}).nome || selectPrestador.value;
                cliAgs.push({ id: novoId, emailPrestador: selectPrestador.value, nomePrestador: nomePrest, servico: selectTipo.value, data: slotAtual.data, horario: slotAtual.horario + ' - ' + fimH, status: 'pendente', criadoEm: new Date().toISOString() });
                DB.set('clienteAgendamentos_' + usu.email, cliAgs);
                sgCriarNotificacao(selectPrestador.value, 'agendamento', { agendamentoId: novoId, clienteNome: usu.nome, clienteEmail: usu.email, servico: selectTipo.value, data: slotAtual.data, label: slotAtual.label });
                alert('Agendamento solicitado!\nPrestador: ' + nomePrest + '\nHorário: ' + slotAtual.label + '\n\nAguarde confirmação.');
                atualizarInfoPrestador(selectPrestador.value);
            });
        }

        if (linkHotsite) {
            linkHotsite.addEventListener('click', function (e) {
                e.preventDefault();
                if (!estaLogado) { _modalLoginNecessario(); return; }
                if (!selectPrestador.value) { alert('Selecione um prestador.'); return; }
                window.location.href = '/paginasPrestador/prestadorHotsite.html?prestador=' + encodeURIComponent(selectPrestador.value);
            });
        }

        preencherTipos();
        var params = new URLSearchParams(window.location.search);
        var prestParam = params.get('prestador');
        if (prestParam) {
            var dadosPre = obterStorePrestadores()[prestParam];
            if (dadosPre && dadosPre.categoria) { selectTipo.value = dadosPre.categoria; preencherPrestadores(dadosPre.categoria); selectPrestador.value = prestParam; atualizarInfoPrestador(prestParam); }
        }
    }

    function _semearPrestadoresDemo() {
        var store = obterStorePrestadores();
        if (Object.keys(store).length > 0) return;
        var demos = [
            { email: 'prestador@servgo.com', nome: 'Prestador Demo', categoria: 'Manutenção Predial', cidade: 'Presidente Prudente, SP', tel: '(18) 99123-4567', descricao: 'Especializado em montagem de móveis, reparos elétricos e hidráulicos.', cnpj: '', endereco: 'Rua das Flores, 100 - Centro', foto: '' },
            { email: 'saude@servgo.com', nome: 'Dra. Ana Lima', categoria: 'Saúde', cidade: 'Presidente Prudente, SP', tel: '(18) 99234-5678', descricao: 'Clínica geral e nutrição.', cnpj: '', endereco: 'Av. Manoel Goulart, 200', foto: '' },
            { email: 'beleza@servgo.com', nome: 'Studio Beleza & Cia', categoria: 'Beleza', cidade: 'Presidente Prudente, SP', tel: '(18) 98765-4321', descricao: 'Salão completo.', cnpj: '', endereco: 'Rua Coronel José Soares Marcondes, 45', foto: '' }
        ];
        var usuarios = obterUsuariosCadastrados();
        demos.forEach(function (d) {
            store[d.email] = { nome: d.nome, email: d.email, cnpj: d.cnpj, categoria: d.categoria, cidade: d.cidade, descricao: d.descricao, endereco: d.endereco, tel: d.tel, foto: d.foto };
            if (!usuarios[d.email]) usuarios[d.email] = { nome: d.nome, senha: 'Demo@123', tipo: 'prestador' };
        });
        DB.set(HOTSITE_KEY, store);
        salvarUsuariosCadastrados(usuarios);
    }

    function _modalLoginNecessario() {
        var loginUrl = '/paginasSite/login.html';
        var id = 'modalLoginNec'; var ex = document.getElementById(id); if (ex) ex.remove();
        var modal = document.createElement('div'); modal.className = 'modal fade'; modal.id = id; modal.setAttribute('tabindex', '-1');
        modal.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header" style="background:#FFC300;color:#000;"><h5 class="modal-title"><i class="bi bi-lock me-2"></i>Acesso Restrito</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><p>Para continuar, você precisa estar logado.</p></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button><a href="' + loginUrl + '" class="btn btn-warning"><i class="bi bi-box-arrow-in-right me-1"></i>Fazer Login</a></div></div></div>';
        document.body.appendChild(modal); new bootstrap.Modal(modal).show();
    }

    // =========================================================
    // HOTSITE PÚBLICO (prestadorHotsite.html — visão do cliente)
    // Usa IDs reais do HTML: hs-avatar, hs-nome, hs-meta,
    // hs-atende, hs-desc, hs-email, hs-tel, hs-galeria
    // =========================================================
    function inicializarHotsitePublico() {
        var hsAvatar = document.getElementById('hs-avatar');
        var admCnpj = document.getElementById('adm-cnpj');
        if (!hsAvatar || admCnpj) return; // só roda na página pública

        var usu = obterUsuarioLogado();
        var estaLogado = usu && (usu.tipo === 'cliente' || usu.tipo === 'admin');

        var params = new URLSearchParams(window.location.search);
        var emailPrest = params.get('prestador') || '';

        // Fallback: se não veio por query param, tenta o prestador logado (demo)
        if (!emailPrest) {
            var logado = obterUsuarioLogado();
            if (logado && logado.tipo === 'prestador') emailPrest = logado.email;
        }
        if (!emailPrest) {
            var store = obterStorePrestadores();
            var keys = Object.keys(store);
            if (keys.length) emailPrest = keys[0];
        }

        var dados = emailPrest ? obterDadosPrestador(emailPrest) : null;

        if (dados) {
            // Avatar
            if (dados.foto) {
                hsAvatar.style.backgroundImage = 'url(' + dados.foto + ')';
                hsAvatar.style.backgroundSize = 'cover';
                hsAvatar.style.backgroundPosition = 'center';
                hsAvatar.textContent = '';
            } else {
                var pNome = (dados.nome || 'PR').trim().split(/\s+/);
                hsAvatar.textContent = (pNome.length >= 2 ? pNome[0][0] + pNome[pNome.length - 1][0] : (pNome[0] || 'PR').substring(0, 2)).toUpperCase();
            }

            // Nome
            var nomeEl = document.getElementById('hs-nome');
            if (nomeEl) nomeEl.textContent = dados.nome || '';

            // Meta (categoria + avaliações)
            var metaEl = document.getElementById('hs-meta');
            var avsRec = obterAvaliacoesRecebidasPrestador(emailPrest);
            var mediaAv = 0;
            if (avsRec.length > 0) mediaAv = avsRec.reduce(function (s, a) { return s + (a.nota || 0); }, 0) / avsRec.length;
            if (metaEl) {
                var starsH = Array.from({ length: 5 }, function (_, i) {
                    return i < Math.round(mediaAv) ? '★' : '☆';
                }).join('');
                metaEl.innerHTML = (dados.categoria || 'Atividade') + ' &nbsp;·&nbsp; <span style="color:#ffc107;">' + starsH + '</span> &nbsp;' + mediaAv.toFixed(1) + ' &nbsp;·&nbsp; ' + avsRec.length + ' avaliação(ões)';
            }

            // Atende em
            var atendeEl = document.getElementById('hs-atende');
            if (atendeEl) atendeEl.innerHTML = '<i class="bi bi-geo-alt-fill me-1"></i> Atende em: ' + (dados.cidade || '—');

            // Descrição
            var descEl = document.getElementById('hs-desc');
            if (descEl) descEl.textContent = dados.descricao || '';

            // Contatos
            var emailEl = document.getElementById('hs-email');
            if (emailEl) emailEl.textContent = dados.email || emailPrest || '—';
            var telEl = document.getElementById('hs-tel');
            if (telEl) telEl.textContent = dados.tel || '—';

            // Galeria (10 slots)
            var galeriaEl = document.getElementById('hs-galeria');
            if (galeriaEl && dados.galeria && dados.galeria.length > 0) {
                var thumbs = galeriaEl.querySelectorAll('.hotsite-thumb');
                dados.galeria.forEach(function (item, idx) {
                    if (!item || idx >= thumbs.length) return;
                    var thumb = thumbs[idx];
                    var isVid = item.startsWith('data:video') || item.includes('/video/');
                    thumb.innerHTML = '';
                    thumb.style.overflow = 'hidden';
                    var el = isVid ? document.createElement('video') : document.createElement('img');
                    el.src = item;
                    el.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
                    if (isVid) { el.muted = true; el.setAttribute('playsinline', ''); el.controls = true; }
                    thumb.appendChild(el);
                });
            }

            // Avaliações (últimas 3 recebidas)
            var depEl = document.querySelector('.hotsite-depoimento');
            if (depEl) {
                var ult3 = avsRec.slice(-3).reverse();
                depEl.innerHTML = ult3.length > 0 ? ult3.map(function (av) {
                    var stars = Array.from({ length: 5 }, function (_, i) { return i < av.nota ? '<i class="bi bi-star-fill" style="color:#ffc107;"></i>' : '<i class="bi bi-star" style="color:#ccc;"></i>'; }).join('');
                    return '<div style="padding:10px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;"><div>' + stars + '</div><p style="font-size:.85rem;margin:4px 0 0;">"' + _escaparHtml(av.comentario) + '"</p><small class="text-muted">— ' + _escaparHtml(av.cliente) + '</small></div>';
                }).join('') : '<p class="text-muted" style="font-size:.85rem;">Nenhuma avaliação recebida ainda.</p>';
            }

            // Próximo horário disponível
            var slotEl = document.getElementById('hotsite-preview-proximo-slot');
            if (slotEl) {
                slotEl.style.cursor = 'default'; slotEl.style.pointerEvents = 'none';
                var ags = obterAgendamentosPrestador(emailPrest);
                var ocupados = {};
                ags.forEach(function (a) { if (a.status === 'cancelado') return; var ini = (a.horario || '').split(' - ')[0]; if (ini && a.data) ocupados[a.data + ' ' + ini] = true; });
                var agora = new Date(); var encontrado = false;
                for (var d = 0; d < 30 && !encontrado; d++) {
                    var dia = new Date(agora); dia.setDate(agora.getDate() + d);
                    if (dia.getDay() === 0 || dia.getDay() === 6) continue;
                    var dataStr = dia.toISOString().substring(0, 10);
                    for (var hh = 8; hh < 18; hh++) {
                        if (d === 0 && hh <= agora.getHours()) continue;
                        var horS = String(hh).padStart(2, '0') + ':00';
                        if (!ocupados[dataStr + ' ' + horS]) { slotEl.textContent = _formatarDiaLabel(dataStr) + ' às ' + horS; encontrado = true; break; }
                    }
                }
                if (!encontrado) slotEl.textContent = 'Sem disponibilidade nos próximos 30 dias';
            }
        }

        // Botão Agendar Serviço
        var btnAgendar = document.querySelector('.cta-agendar');
        if (btnAgendar) {
            btnAgendar.addEventListener('click', function (e) {
                e.preventDefault();
                if (!estaLogado) { _modalLoginHotsite(); return; }
                var url = '/paginasCliente/clienteAgendarServicos.html';
                if (emailPrest) url += '?prestador=' + encodeURIComponent(emailPrest);
                window.location.href = url;
            });
        }
    }

    function _modalLoginHotsite() {
        var id = 'modalLoginHotsite'; var ex = document.getElementById(id); if (ex) ex.remove();
        var modal = document.createElement('div'); modal.className = 'modal fade'; modal.id = id; modal.setAttribute('tabindex', '-1');
        modal.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header" style="background:#FFC300;color:#000;"><h5 class="modal-title"><i class="bi bi-lock me-2"></i>Acesso Restrito</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><p>Para agendar, faça login primeiro.</p></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button><a href="/paginasSite/login.html" class="btn btn-warning"><i class="bi bi-box-arrow-in-right me-1"></i>Fazer Login</a></div></div></div>';
        document.body.appendChild(modal); new bootstrap.Modal(modal).show();
    }

    // =========================================================
    // NOTIFICAÇÕES — área exclusiva do prestador
    // =========================================================
    function inicializarNotificacoesDashboardPrestador() {
        // Gerenciado em inicializarPrestadorAreaExclusiva
    }

    function inicializarNotificacoesDashboardCliente() {
        var mainEl = document.querySelector('.cli-main');
        if (!mainEl || !document.querySelector('.cli-pedidos-lista')) return;
        var usu = obterUsuarioLogado(); if (!usu) return;
        var emailCli = usu.email;
        var notifs = sgObterNotificacoes(emailCli).filter(function (n) { return !n.lida; });
        if (notifs.length === 0) return;
        var barra = document.createElement('div');
        barra.id = 'sg-notif-barra-cli'; barra.style.cssText = 'margin-bottom:16px;';
        barra.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 16px;background:#e8f4fd;border:1.5px solid #146ADB;border-radius:10px;"><i class="bi bi-bell-fill" style="color:#146ADB;font-size:1.2rem;"></i><strong style="color:#0d3d78;">Você tem ' + notifs.length + ' nova(s) notificação(ões)</strong><button type="button" class="btn btn-outline-secondary btn-sm" id="btn-notif-cli-marcar-lidas">Marcar como lidas</button></div>';
        mainEl.insertBefore(barra, mainEl.firstChild);
        var btnMarcar = document.getElementById('btn-notif-cli-marcar-lidas');
        if (btnMarcar) btnMarcar.addEventListener('click', function () { sgMarcarTodasLidas(emailCli); barra.remove(); });
    }

    // =========================================================
    // TOAST — notificação visual
    // =========================================================
    function exibirToast(mensagem) {
        var toastEl = document.getElementById('toastNotificacao');
        var msgEl = document.getElementById('toast-mensagem');
        if (!toastEl) return;
        if (msgEl) msgEl.textContent = mensagem;
        var t = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3000 });
        t.show();
    }

    // =========================================================
    // INICIALIZAÇÃO GERAL
    // =========================================================
    inicializarNavbarSaudacao();
    inicializarNavbarPrestador();
    inicializarHome();
    inicializarCadastro();
    inicializarLogin();
    inicializarClienteAreaExclusiva();
    inicializarPrestadorAreaExclusiva();
    inicializarPrestadorServicosAgendados();
    inicializarAvaliacoesFeitas();       // cliente
    inicializarAvaliacoesRecebidas();    // cliente
    inicializarAvaliacoesFeitasPrestador();
    inicializarAvaliacoesRecebidasPrestador();
    inicializarBotaoVoltar();
    inicializarPerfilCliente();
    inicializarHotsitePrestador();
    inicializarAlterarSenhaGeral();
    inicializarSidebarResponsiva();
    inicializarAgendarServicos();
    inicializarHotsitePublico();
    inicializarNotificacoesDashboardPrestador();
    inicializarNotificacoesDashboardCliente();
    inicializarConfigurarAgenda();
    inicializarDashboardPrestador();
    inicializarContatoPrestador();
});
