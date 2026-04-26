document.addEventListener('DOMContentLoaded', function () {

    const USUARIOS_STORAGE_KEY = 'usuariosCadastrados';

    // =====================================================
    // FUNÇÕES AUXILIARES DE STORAGE
    // =====================================================
    function obterUsuariosCadastrados() {
        return JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || '{}');
    }

    function salvarUsuariosCadastrados(usuarios) {
        localStorage.setItem(USUARIOS_STORAGE_KEY, JSON.stringify(usuarios));
    }

    // =====================================================
    // FUNÇÕES AUXILIARES DE NAVEGAÇÃO
    // =====================================================

    /**
     * Detecta a profundidade da página atual com base no pathname.
     * Retorna o prefixo de caminho relativo necessário para chegar à raiz.
     */
    function obterPrefixoRaiz() {
        const path = window.location.pathname;
        if (path.includes('/paginasSite/') ||
            path.includes('/paginasPrestador/') ||
            path.includes('/paginasCliente/')) {
            return '../';
        }
        return '';
    }

    /**
     * Navega para uma página relativa à raiz do projeto.
     * Funciona independente de qual subpasta o script está sendo executado.
     */
    function irParaRaiz(arquivo) {
        const prefixo = obterPrefixoRaiz();
        window.location.href = prefixo + arquivo;
    }

    /**
     * Navega para uma página dentro de paginasSite/.
     */
    function irParaPaginasSite(arquivo) {
        const path = window.location.pathname;
        if (path.includes('/paginasSite/')) {
            window.location.href = arquivo;
        } else {
            window.location.href = 'paginasSite/' + arquivo;
        }
    }

    /**
     * Navega para uma página dentro de paginasPrestador/.
     */
    function irParaPaginasPrestador(arquivo) {
        const path = window.location.pathname;
        if (path.includes('/paginasPrestador/')) {
            window.location.href = arquivo;
        } else if (path.includes('/paginasSite/') || path.includes('/paginasCliente/')) {
            window.location.href = '../paginasPrestador/' + arquivo;
        } else {
            window.location.href = 'paginasPrestador/' + arquivo;
        }
    }

    /**
     * Navega para uma página dentro de paginasCliente/.
     */
    function irParaPaginasCliente(arquivo) {
        const path = window.location.pathname;
        if (path.includes('/paginasCliente/')) {
            window.location.href = arquivo;
        } else if (path.includes('/paginasSite/') || path.includes('/paginasPrestador/')) {
            window.location.href = '../paginasCliente/' + arquivo;
        } else {
            window.location.href = 'paginasCliente/' + arquivo;
        }
    }

    // =====================================================
    // SAUDAÇÃO NA NAVBAR — TODAS AS PÁGINAS
    // =====================================================
    /**
     * Exibe "Olá, [Nome do Cliente]!" no span .navbar-logada-info
     * em qualquer página que possua esse elemento.
     */
    function inicializarNavbarSaudacao() {
        var spanOla = document.querySelector('.navbar-logada-info');
        if (!spanOla) return;

        try {
            var usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            if (usuarioLogado && usuarioLogado.nome) {
                spanOla.textContent = 'Olá, ' + usuarioLogado.nome + '!';
            }
        } catch (e) { /* mantém texto padrão */ }
    }

    // =====================================================
    // SISTEMA DE NOTIFICAÇÕES (ServGo! — ambos os lados)
    // -----------------------------------------------------
    // Chave: sgNotificacoes_<email>
    // Cada notificação: { id, tipo, lida, timestamp, dados }
    // Tipos: 'agendamento' | 'mensagem' | 'confirmacao' |
    //        'cancelamento' | 'rejeicao'
    // =====================================================
    var SG_NOTIF_PREFIX = 'sgNotificacoes_';

    function sgObterNotificacoes(email) {
        if (!email) return [];
        try { return JSON.parse(localStorage.getItem(SG_NOTIF_PREFIX + email) || '[]'); }
        catch (e) { return []; }
    }
    function sgSalvarNotificacoes(email, arr) {
        if (!email) return;
        try { localStorage.setItem(SG_NOTIF_PREFIX + email, JSON.stringify(arr)); } catch (e) {}
    }
    function sgCriarNotificacao(emailDestino, tipo, dados) {
        if (!emailDestino) return;
        var lista = sgObterNotificacoes(emailDestino);
        lista.push({
            id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            tipo: tipo,
            lida: false,
            timestamp: new Date().toISOString(),
            dados: dados || {}
        });
        sgSalvarNotificacoes(emailDestino, lista);
    }
    function sgContarNaoLidas(email) {
        return sgObterNotificacoes(email).filter(function (n) { return !n.lida; }).length;
    }
    function sgMarcarTodasLidas(email) {
        var lista = sgObterNotificacoes(email);
        lista.forEach(function (n) { n.lida = true; });
        sgSalvarNotificacoes(email, lista);
    }
    function sgMarcarLida(email, id) {
        var lista = sgObterNotificacoes(email);
        var idx = lista.findIndex(function (n) { return n.id === id; });
        if (idx >= 0) { lista[idx].lida = true; sgSalvarNotificacoes(email, lista); }
    }

    // =====================================================
    // HOME (index.html)
    // =====================================================
    function inicializarHome() {
        const frasesPlaceholder = [
            "Agende sua consulta médica aqui.",
            "Encontre o especialista de saúde ideal.",
            "Busque clínicas e exames disponíveis.",
            "Descubra salões e serviços de beleza.",
            "Procure por manicure, cabelo ou estética.",
            "Confira as últimas tendências em beleza.",
            "Precisa de um eletricista ou encanador?",
            "Orçamento rápido para reformas e reparos.",
            "Serviços de manutenção predial e civil.",
            "Soluções em software e desenvolvimento.",
            "Apoio técnico para problemas de TI.",
            "Busque por cibersegurança e infraestrutura.",
            "Sugestões de passeios e entretenimento.",
            "Onde se divertir neste fim de semana?",
            "Encontre eventos, shows e atividades.",
            "Descubra restaurantes e deliverys.",
            "Cardápios, pratos e culinárias diversas.",
            "Onde comer hoje? Pesquise aqui!",
            "Crie sua marca com designers profissionais.",
            "Serviços de design gráfico e web.",
            "Precisa de um novo layout ou identidade visual?",
            "Contrate serviços de vigilância e alarmes.",
            "Busque soluções de segurança patrimonial.",
            "Segurança eletrônica e monitoramento.",
            "Encontre transportadoras e fretes.",
            "Soluções logísticas e de armazenamento.",
            "Cotação de transporte de cargas.",
            "Busque consultoria empresarial e financeira.",
            "Profissionais para orientar seu negócio.",
            "Consultoria jurídica, marketing e mais."
        ];

        const campoBusca =
            document.getElementById('campoBusca') ||
            document.querySelector('.input-group input.form-control[aria-label="Busca"]');

        if (!campoBusca) return;

        function obterFraseRandomica() {
            return frasesPlaceholder[Math.floor(Math.random() * frasesPlaceholder.length)];
        }

        campoBusca.placeholder = obterFraseRandomica();

        setInterval(function () {
            campoBusca.placeholder = obterFraseRandomica();
        }, 3000);
    }

    // =====================================================
    // CADASTRO (paginasSite/cadastro.html)
    // =====================================================
    function inicializarCadastro() {
        const prestadorEscolha = document.getElementById('prestador-escolha');
        const prestadorFormDetalhe = document.getElementById('prestador-form');
        const prestadorCard = document.getElementById('prestador-card-completo');

        const clienteEscolha = document.getElementById('cliente-escolha');
        const clienteFormDetalhe = document.getElementById('cliente-form');
        const clienteCard = document.getElementById('cliente-card-completo');

        // Só executa se estiver na página de cadastro
        if (!prestadorCard && !clienteCard) return;

        const prestadorColuna = prestadorCard ? prestadorCard.closest('.col-md-6') : null;
        const clienteColuna = clienteCard ? clienteCard.closest('.col-md-6') : null;
        const linhaCards = prestadorColuna ? prestadorColuna.closest('.row') : null;

        const formPrestador = document.getElementById('form-prestador-real');
        const formCliente = document.getElementById('form-cliente-real');

        function abrirFormulario(tipo) {
            if (tipo === 'prestador') {
                if (prestadorEscolha) prestadorEscolha.style.display = 'none';
                if (prestadorFormDetalhe) {
                    prestadorFormDetalhe.style.display = 'block';
                    prestadorFormDetalhe.classList.add('ativo');
                }
                if (clienteColuna) clienteColuna.style.display = 'none';
                if (prestadorColuna) {
                    prestadorColuna.classList.remove('col-md-6');
                    prestadorColuna.classList.add('col-md-8');
                }
                if (linhaCards) linhaCards.classList.add('justify-content-center');
                if (prestadorCard) prestadorCard.style.cursor = 'default';
            }

            if (tipo === 'cliente') {
                if (clienteEscolha) clienteEscolha.style.display = 'none';
                if (clienteFormDetalhe) {
                    clienteFormDetalhe.style.display = 'block';
                    clienteFormDetalhe.classList.add('ativo');
                }
                if (prestadorColuna) prestadorColuna.style.display = 'none';
                if (clienteColuna) {
                    clienteColuna.classList.remove('col-md-6');
                    clienteColuna.classList.add('col-md-8');
                }
                if (linhaCards) linhaCards.classList.add('justify-content-center');
                if (clienteCard) clienteCard.style.cursor = 'default';
            }
        }

        if (prestadorEscolha) {
            prestadorEscolha.addEventListener('click', function () {
                abrirFormulario('prestador');
            });
        }

        if (clienteEscolha) {
            clienteEscolha.addEventListener('click', function () {
                abrirFormulario('cliente');
            });
        }

        // Submit: Cadastro de Prestador
        if (formPrestador) {
            formPrestador.addEventListener('submit', function (event) {
                event.preventDefault();

                const nome = document.getElementById('nome-prestador').value.trim();
                const email = document.getElementById('email-prestador').value.trim().toLowerCase();
                const senha = document.getElementById('senha-prestador').value.trim();
                const senhaRepita = document.getElementById('senha-prestador-repita').value.trim();

                if (senha !== senhaRepita) {
                    alert('As senhas não coincidem. Por favor, verifique.');
                    return;
                }

                const usuariosCadastrados = obterUsuariosCadastrados();

                usuariosCadastrados[email] = {
                    nome: nome,
                    senha: senha,
                    tipo: 'prestador'
                };

                salvarUsuariosCadastrados(usuariosCadastrados);

                // Redireciona para login com parâmetro de sucesso
                // Estamos dentro de paginasSite/, então login.html é relativo
                window.location.href = 'login.html?cadastro=sucesso';
            });
        }

        // Submit: Cadastro de Cliente
        if (formCliente) {
            formCliente.addEventListener('submit', function (event) {
                event.preventDefault();

                const nome = document.getElementById('nome-cliente').value.trim();
                const email = document.getElementById('email-cliente').value.trim().toLowerCase();
                const senha = document.getElementById('senha-cliente').value.trim();
                const senhaRepita = document.getElementById('senha-cliente-repita').value.trim();

                if (senha !== senhaRepita) {
                    alert('As senhas não coincidem. Por favor, verifique.');
                    return;
                }

                const usuariosCadastrados = obterUsuariosCadastrados();

                usuariosCadastrados[email] = {
                    nome: nome,
                    senha: senha,
                    tipo: 'cliente'
                };

                salvarUsuariosCadastrados(usuariosCadastrados);

                // Redireciona para login com parâmetro de sucesso
                window.location.href = 'login.html?cadastro=sucesso';
            });
        }
    }

    // =====================================================
    // LOGIN (paginasSite/login.html)
    // =====================================================
    function inicializarLogin() {
        const formLogin = document.getElementById('form-login');

        // Só executa se estiver na página de login
        if (!formLogin) return;

        const emailInput = document.getElementById('email-login');
        const senhaInput = document.getElementById('senha-login');
        const alertaContainer = document.getElementById('alerta-cadastro-sucesso');
        const alertaErroContainer = document.getElementById('alerta-login-erro');

        // Exibe mensagem de sucesso de cadastro se vier com o parâmetro
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('cadastro') === 'sucesso' && alertaContainer) {
            alertaContainer.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show text-center" role="alert">
                    <strong>Parabéns!</strong> Seu cadastro foi concluído. Faça login abaixo para começar!
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            `;
            // Remove o parâmetro da URL sem recarregar a página
            history.replaceState(null, '', window.location.pathname);
        }

        // -----------------------------------------------------------
        // "Esqueci minha senha" -> abre o modal "Alterar Senha"
        // Em vez de navegar para esqueci-senha.html, intercepta o
        // clique no link e exibe o modal #modalAlterarSenha.
        // Se o modal ainda não existir no HTML da página de login,
        // ele é criado dinamicamente aqui.
        // -----------------------------------------------------------
        inicializarLinkEsqueciSenha();

        // Usuários fixos (demo/admin) — mantidos conforme lógica original
        const usuariosFixos = {
            'prestador@servgo.com': { senha: 'senha123', tipo: 'prestador', nome: 'Prestador Demo' },
            'cliente@servgo.com':   { senha: 'senha456', tipo: 'cliente',   nome: 'Cliente Demo'   },
            'admin@servgo.com':     { senha: 'admin',    tipo: 'admin',     nome: 'Administrador'  }
        };

        formLogin.addEventListener('submit', function (event) {
            event.preventDefault();

            const email = emailInput.value.trim().toLowerCase();
            const senha = senhaInput.value.trim();

            // Limpa alerta de erro anterior
            if (alertaErroContainer) {
                alertaErroContainer.innerHTML = '';
            }

            // 1. Verifica usuários fixos
            if (usuariosFixos[email] && usuariosFixos[email].senha === senha) {
                salvarUsuarioLogado(email, usuariosFixos[email].nome, usuariosFixos[email].tipo);
                redirecionarPorTipo(usuariosFixos[email].tipo);
                return;
            }

            // 2. Verifica usuários cadastrados via formulário
            const usuariosCadastrados = obterUsuariosCadastrados();
            if (usuariosCadastrados[email] && usuariosCadastrados[email].senha === senha) {
                salvarUsuarioLogado(email, usuariosCadastrados[email].nome, usuariosCadastrados[email].tipo);
                redirecionarPorTipo(usuariosCadastrados[email].tipo);
                return;
            }

            // 3. Credenciais inválidas
            if (alertaErroContainer) {
                alertaErroContainer.innerHTML = `
                    <div class="alert alert-danger fade show text-center" role="alert">
                        E-mail e/ou senha incorretos. Tente novamente.
                    </div>
                `;
            }

            senhaInput.value = '';
            senhaInput.focus();
        });
    }

    // =====================================================
    // "ESQUECI MINHA SENHA" -> MODAL ALTERAR SENHA (login.html)
    // =====================================================
    /**
     * Localiza o link "Esqueci minha senha" na página de login (que
     * originalmente aponta para esqueci-senha.html) e transforma o
     * clique em abertura do modal "Alterar Senha".
     * Se o modal não existir no HTML da página, é criado dinamicamente.
     */
    function inicializarLinkEsqueciSenha() {
        // Busca o link exatamente como definido no HTML do login
        var linkEsqueci = document.querySelector('a[href="esqueci-senha.html"]');
        if (!linkEsqueci) return;

        // Garante que o modal exista na página
        var modalEl = document.getElementById('modalAlterarSenha');
        if (!modalEl) {
            modalEl = criarModalAlterarSenha();
            document.body.appendChild(modalEl);
        }

        linkEsqueci.addEventListener('click', function (e) {
            e.preventDefault();
            var modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
            modalInstance.show();
        });

        // Liga o botão "Salvar Nova Senha" do modal à lógica de reset
        var btnSalvar = modalEl.querySelector('#btn-salvar-senha-login');
        if (btnSalvar && !btnSalvar.dataset.listenerAdicionado) {
            btnSalvar.dataset.listenerAdicionado = 'true';
            btnSalvar.addEventListener('click', function () {
                processarAlteracaoSenhaLogin(modalEl);
            });
        }
    }

    /**
     * Cria dinamicamente o modal "Alterar Senha" para a página de login.
     * Usa o mesmo visual do modal do clientePerfilAdm, mas com campos
     * adequados ao fluxo de "esqueci minha senha" (e-mail + nova senha).
     */
    function criarModalAlterarSenha() {
        var modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'modalAlterarSenha';
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('aria-labelledby', 'modalAlterarSenhaLabel');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML =
            '<div class="modal-dialog">' +
                '<div class="modal-content">' +
                    '<div class="modal-header" style="background-color: #2B2B2B; color: white;">' +
                        '<h5 class="modal-title" id="modalAlterarSenhaLabel"><i class="bi bi-lock me-2"></i>Alterar Senha</h5>' +
                        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="mb-3">' +
                            '<label for="email-recuperar" class="form-label fw-bold">E-mail cadastrado:</label>' +
                            '<input type="email" class="form-control" id="email-recuperar" placeholder="seu@email.com">' +
                        '</div>' +
                        '<hr>' +
                        '<div class="mb-3">' +
                            '<label for="nova-senha-login" class="form-label fw-bold">Nova Senha:</label>' +
                            '<input type="password" class="form-control" id="nova-senha-login">' +
                            '<small class="text-muted d-block mt-1">Mínimo 8 caracteres, incluindo letras, números e caracteres especiais (Case Sensitive).</small>' +
                        '</div>' +
                        '<div class="mb-3">' +
                            '<label for="repita-nova-senha-login" class="form-label fw-bold">Repita a Nova Senha:</label>' +
                            '<input type="password" class="form-control" id="repita-nova-senha-login">' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>' +
                        '<button type="button" class="btn btn-primary" id="btn-salvar-senha-login"><i class="bi bi-floppy me-1"></i>Salvar Nova Senha</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        return modal;
    }

    /**
     * Processa a alteração de senha no fluxo "esqueci minha senha"
     * (acionado a partir da página de login).
     */
    function processarAlteracaoSenhaLogin(modalEl) {
        var email = (document.getElementById('email-recuperar').value || '').trim().toLowerCase();
        var novaSenha = document.getElementById('nova-senha-login').value;
        var repitaNovaSenha = document.getElementById('repita-nova-senha-login').value;

        if (!email) {
            alert('Por favor, informe o e-mail cadastrado.');
            return;
        }

        // Regex: Mínimo 8 caracteres, contendo letras, números e caracteres especiais
        var regexSenha = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
        if (!regexSenha.test(novaSenha)) {
            alert('A nova senha não atende aos requisitos mínimos!\n\nA senha deve ter pelo menos 8 caracteres e incluir letras, números e caracteres especiais.');
            return;
        }

        if (novaSenha !== repitaNovaSenha) {
            alert('As novas senhas digitadas não coincidem. Tente novamente.');
            return;
        }

        var usuariosCadastrados = obterUsuariosCadastrados();
        if (!usuariosCadastrados[email]) {
            alert('E-mail não encontrado. Verifique se está cadastrado no sistema.');
            return;
        }

        usuariosCadastrados[email].senha = novaSenha;
        salvarUsuariosCadastrados(usuariosCadastrados);

        alert('Senha atualizada com sucesso! Faça login com a nova senha.');

        // Limpa campos e fecha modal
        document.getElementById('email-recuperar').value = '';
        document.getElementById('nova-senha-login').value = '';
        document.getElementById('repita-nova-senha-login').value = '';

        var modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
    }

    /**
     * Redireciona o usuário para a área ADM correta conforme seu tipo.
     * Login ocorre em paginasSite/, por isso os caminhos sobem um nível.
     */
    function redirecionarPorTipo(tipo) {
        switch (tipo) {
            case 'admin':
                // Painel administrativo geral — dentro de paginasSite/
                window.location.href = 'dashboardAdmin.html';
                break;
            case 'prestador':
                // Área exclusiva do prestador — em paginasPrestador/
                window.location.href = '../paginasPrestador/prestadorAreaExclusiva.html';
                break;
            case 'cliente':
                // Área exclusiva do cliente — em paginasCliente/
                window.location.href = '../paginasCliente/clienteAreaExclusiva.html';
                break;
            default:
                // Fallback seguro: volta para home
                window.location.href = '../index.html';
        }
    }

    /**
     * Salva os dados do usuário logado no localStorage.
     */
    function salvarUsuarioLogado(email, nome, tipo) {
        localStorage.setItem('usuarioLogado', JSON.stringify({ email, nome, tipo }));
    }

    // =====================================================
    // ÁREA EXCLUSIVA DO CLIENTE (clienteAreaExclusiva.html)
    // =====================================================
    function inicializarClienteAreaExclusiva() {
        const pedidosList = document.querySelector('.cli-pedidos-lista');
        if (!pedidosList) return;

        const AVALIACOES_KEY = 'avaliacoesSalvas';

        // -----------------------------------------------------------
        // Dados simulados de agendamentos (Data/Hora e valor por pedido)
        // Em um sistema real, esses dados viriam de uma API/banco de dados.
        // -----------------------------------------------------------
        var dadosAgendamentos = {
            'pedido-1': { dataHora: '10/04/2026 às 09:00', valor: 150.00, pago: false },
            'pedido-2': { dataHora: '05/03/2026 às 08:00', valor: 250.00, pago: true  },
            'pedido-3': { dataHora: '15/02/2026 às 14:00', valor: 0,      pago: false }
        };

        // --- Helpers de storage ---
        function obterAvaliacoes() {
            try { return JSON.parse(localStorage.getItem(AVALIACOES_KEY) || '[]'); }
            catch (e) { return []; }
        }
        function salvarAvaliacoes(arr) {
            localStorage.setItem(AVALIACOES_KEY, JSON.stringify(arr));
        }
        function obterAvaliacaoPorPedido(pedidoId) {
            return obterAvaliacoes().find(function (a) { return a.pedidoId === pedidoId; }) || null;
        }

        // -----------------------------------------------------------
        // Lê os pedidos do DOM e calcula os valores dos stat cards
        // -----------------------------------------------------------
        function calcularEstatisticas() {
            var itens = pedidosList.querySelectorAll('.cli-pedidos-item');
            var emAberto = 0;
            var concluidos = 0;
            var totalPago = 0;
            var pedidosAbertos = [];
            var pedidosPagos = [];
            var pedidosConcluidos = [];

            itens.forEach(function (item) {
                var pedidoId     = item.dataset.pedidoId;
                var servico      = item.dataset.servico;
                var profissional = item.dataset.profissional;
                var badge        = item.querySelector('.cli-badge');
                var status       = badge ? badge.textContent.trim() : '';
                var dados        = dadosAgendamentos[pedidoId] || { dataHora: 'N/D', valor: 0, pago: false };

                if (badge && badge.classList.contains('em-andamento')) {
                    emAberto++;
                    pedidosAbertos.push({
                        pedidoId: pedidoId,
                        servico: servico,
                        profissional: profissional,
                        dataHora: dados.dataHora,
                        status: status
                    });
                }

                if (badge && badge.classList.contains('concluido')) {
                    concluidos++;
                    totalPago += dados.valor;
                    pedidosPagos.push({
                        pedidoId: pedidoId,
                        servico: servico,
                        profissional: profissional,
                        dataHora: dados.dataHora,
                        valor: dados.valor,
                        pago: dados.pago
                    });
                    pedidosConcluidos.push({
                        pedidoId: pedidoId,
                        servico: servico,
                        profissional: profissional,
                        dataHora: dados.dataHora,
                        valor: dados.valor
                    });
                }
            });

            return {
                emAberto: emAberto,
                concluidos: concluidos,
                totalPago: totalPago,
                pedidosAbertos: pedidosAbertos,
                pedidosPagos: pedidosPagos,
                pedidosConcluidos: pedidosConcluidos
            };
        }

        // -----------------------------------------------------------
        // Atualiza os valores exibidos nos stat cards
        // -----------------------------------------------------------
        function atualizarStatCards(stats) {
            var statCards = document.querySelectorAll('.cli-stat-card');
            if (!statCards || statCards.length < 3) return;

            // Card 1: Pedidos em Aberto
            var valorAberto = statCards[0].querySelector('.cli-stat-valor');
            if (valorAberto) valorAberto.textContent = stats.emAberto;

            // Card 2: Serviços Pendentes de Pagamento
            var valorPagamento = statCards[1].querySelector('.cli-stat-valor');
            if (valorPagamento) {
                valorPagamento.textContent = 'R$ ' + stats.totalPago.toFixed(2).replace('.', ',');
            }

            // Card 3: Serviços Concluídos (Total)
            var valorConcluidos = statCards[2].querySelector('.cli-stat-valor');
            if (valorConcluidos) valorConcluidos.textContent = stats.concluidos;
        }

        // -----------------------------------------------------------
        // Cria um modal dinamicamente e o adiciona ao DOM
        // -----------------------------------------------------------
        function criarModal(idModal, titulo, corTitulo, conteudoHTML) {
            // Remove modal anterior com mesmo id se existir
            var modalExistente = document.getElementById(idModal);
            if (modalExistente) modalExistente.remove();

            var modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = idModal;
            modal.setAttribute('tabindex', '-1');
            modal.setAttribute('aria-hidden', 'true');
            modal.innerHTML =
                '<div class="modal-dialog modal-lg">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header" style="background-color:' + corTitulo + '; color:' + (corTitulo === '#FFC300' ? '#000' : '#fff') + ';">' +
                            '<h5 class="modal-title">' + titulo + '</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>' +
                        '</div>' +
                        '<div class="modal-body">' + conteudoHTML + '</div>' +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            document.body.appendChild(modal);
            return modal;
        }

        // -----------------------------------------------------------
        // Modal: Aguardando Confirmação — lê dados REAIS do cliente
        // -----------------------------------------------------------
        function abrirModalAguardandoConfirmacao() {
            var emailCliente = '';
            try {
                var usu = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
                if (usu) emailCliente = usu.email || '';
            } catch (e) {}

            var cliKey = 'clienteAgendamentos_' + emailCliente;
            var cliAgs = [];
            try { cliAgs = JSON.parse(localStorage.getItem(cliKey) || '[]'); } catch (e) {}

            // Ordena do mais recente para o mais antigo
            cliAgs.sort(function (a, b) { return (b.criadoEm || '') > (a.criadoEm || '') ? 1 : -1; });

            var conteudo = '';
            if (cliAgs.length === 0) {
                conteudo = '<p class="text-muted text-center py-3"><i class="bi bi-check-circle me-2"></i>Nenhuma solicitação de agendamento registrada.</p>';
            } else {
                conteudo += '<p class="mb-3 text-muted">Suas solicitações de agendamento e respectivos status:</p>';
                conteudo += '<div class="table-responsive"><table class="table table-bordered table-hover align-middle">';
                conteudo += '<thead class="table-dark"><tr>' +
                    '<th>#</th>' +
                    '<th>Serviço</th>' +
                    '<th>Profissional</th>' +
                    '<th>Data / Hora</th>' +
                    '<th>Status</th>' +
                    '</tr></thead><tbody>';

                cliAgs.forEach(function (ag, idx) {
                    // Formata data BR
                    var dataFmt = ag.data
                        ? ag.data.split('-').reverse().join('/') + ' às ' + (ag.horario || '').split(' - ')[0]
                        : '—';

                    var statusMap = {
                        pendente:   { cor: '#0d6efd', texto: 'Aguardando' },
                        confirmado: { cor: '#198754', texto: 'Confirmado' },
                        cancelado:  { cor: '#dc3545', texto: 'Cancelado'  },
                        rejeitado:  { cor: '#fd7e14', texto: 'Rejeitado'  }
                    };
                    var st = statusMap[ag.status] || { cor: '#6c757d', texto: ag.status || '—' };

                    conteudo += '<tr>' +
                        '<td>' + (idx + 1) + '</td>' +
                        '<td>' + (ag.servico || '—') + '</td>' +
                        '<td>' + (ag.nomePrestador || '—') + '</td>' +
                        '<td>' + dataFmt + '</td>' +
                        '<td><span class="badge" style="background-color:' + st.cor + ';">' + st.texto + '</span></td>' +
                        '</tr>';
                });

                conteudo += '</tbody></table></div>';
            }

            var modal = criarModal(
                'modalAguardandoConfirmacao',
                '<i class="bi bi-hourglass me-2"></i>Meus Agendamentos',
                '#FFC300',
                conteudo
            );
            new bootstrap.Modal(modal).show();
        }

        // -----------------------------------------------------------
        // Modal: Ver Detalhes (Pagamentos)
        // -----------------------------------------------------------
        function abrirModalPagamentos(pedidosPagos, totalPago) {
            var conteudo = '';

            if (pedidosPagos.length === 0) {
                conteudo = '<p class="text-muted text-center py-3"><i class="bi bi-info-circle me-2"></i>Nenhum pagamento registrado.</p>';
            } else {
                conteudo += '<p class="mb-3 text-muted">Pagamentos realizados por serviços concluídos:</p>';
                conteudo += '<div class="table-responsive"><table class="table table-bordered table-hover align-middle">';
                conteudo += '<thead class="table-dark"><tr>' +
                    '<th>#</th>' +
                    '<th>Serviço</th>' +
                    '<th>Profissional</th>' +
                    '<th>Data / Hora</th>' +
                    '<th>Valor Pago</th>' +
                    '</tr></thead><tbody>';

                pedidosPagos.forEach(function (p, idx) {
                    conteudo += '<tr>' +
                        '<td>' + (idx + 1) + '</td>' +
                        '<td>' + p.servico + '</td>' +
                        '<td>' + p.profissional + '</td>' +
                        '<td>' + p.dataHora + '</td>' +
                        '<td>R$ ' + p.valor.toFixed(2).replace('.', ',') + '</td>' +
                        '</tr>';
                });

                conteudo += '</tbody></table></div>';
                conteudo +=
                    '<div class="d-flex justify-content-end mt-3">' +
                        '<div class="alert alert-warning mb-0 py-2 px-4" style="font-size:1rem;">' +
                            '<i class="bi bi-currency-dollar me-2"></i>' +
                            '<strong>Total Pago: R$ ' + totalPago.toFixed(2).replace('.', ',') + '</strong>' +
                        '</div>' +
                    '</div>';
            }

            var modal = criarModal(
                'modalPagamentos',
                '<i class="bi bi-currency-dollar me-2"></i>Detalhes dos Pagamentos',
                '#FFC300',
                conteudo
            );
            new bootstrap.Modal(modal).show();
        }

        // -----------------------------------------------------------
        // Modal: Ver Histórico (Serviços Concluídos)
        // -----------------------------------------------------------
        function abrirModalHistorico(pedidosConcluidos) {
            var conteudo = '';

            if (pedidosConcluidos.length === 0) {
                conteudo = '<p class="text-muted text-center py-3"><i class="bi bi-info-circle me-2"></i>Nenhum serviço concluído encontrado.</p>';
            } else {
                conteudo += '<p class="mb-3 text-muted">Histórico completo de serviços concluídos:</p>';
                conteudo += '<div class="table-responsive"><table class="table table-bordered table-hover align-middle">';
                conteudo += '<thead class="table-dark"><tr>' +
                    '<th>#</th>' +
                    '<th>Data / Hora</th>' +
                    '<th>Prestador</th>' +
                    '<th>Tipo de Serviço</th>' +
                    '<th>Valor Pago</th>' +
                    '</tr></thead><tbody>';

                pedidosConcluidos.forEach(function (p, idx) {
                    conteudo += '<tr>' +
                        '<td>' + (idx + 1) + '</td>' +
                        '<td>' + p.dataHora + '</td>' +
                        '<td>' + p.profissional + '</td>' +
                        '<td>' + p.servico + '</td>' +
                        '<td>R$ ' + p.valor.toFixed(2).replace('.', ',') + '</td>' +
                        '</tr>';
                });

                conteudo += '</tbody></table></div>';
            }

            // AJUSTADO: Mesmo padrão do Modal "Detalhes dos Pagamentos" (#FFC300)
            var modal = criarModal(
                'modalHistorico',
                '<i class="bi bi-patch-check me-2"></i>Histórico de Serviços Concluídos',
                '#FFC300',
                conteudo
            );
            new bootstrap.Modal(modal).show();
        }

        // -----------------------------------------------------------
        // Transforma os textos dos stat-info em hiperlinks clicáveis
        // -----------------------------------------------------------
        function configurarLinksStatCards(stats) {
            var statCards = document.querySelectorAll('.cli-stat-card');
            if (!statCards || statCards.length < 3) return;

            // Card 1 — "Aguardando Confirmação"
            var infoAberto = statCards[0].querySelector('.cli-stat-info');
            if (infoAberto) {
                infoAberto.innerHTML =
                    '<i class="bi bi-hourglass"></i> ' +
                    '<a href="#" class="link-stat-info" style="color:inherit; text-decoration:underline; cursor:pointer;" id="link-aguardando-confirmacao">Aguardando Confirmação</a>';

                document.getElementById('link-aguardando-confirmacao').addEventListener('click', function (e) {
                    e.preventDefault();
                    abrirModalAguardandoConfirmacao();
                });
            }

            // Card 2 — "Ver detalhes"
            var infoPagamento = statCards[1].querySelector('.cli-stat-info');
            if (infoPagamento) {
                infoPagamento.innerHTML =
                    '<i class="bi bi-currency-dollar"></i> ' +
                    '<a href="#" class="link-stat-info" style="color:inherit; text-decoration:underline; cursor:pointer;" id="link-ver-detalhes">Ver detalhes</a>';

                document.getElementById('link-ver-detalhes').addEventListener('click', function (e) {
                    e.preventDefault();
                    abrirModalPagamentos(stats.pedidosPagos, stats.totalPago);
                });
            }

            // Card 3 — "Ver Histórico"
            var infoConcluidos = statCards[2].querySelector('.cli-stat-info');
            if (infoConcluidos) {
                infoConcluidos.innerHTML =
                    '<i class="bi bi-patch-check"></i> ' +
                    '<a href="#" class="link-stat-info" style="color:inherit; text-decoration:underline; cursor:pointer;" id="link-ver-historico">Ver Histórico</a>';

                document.getElementById('link-ver-historico').addEventListener('click', function (e) {
                    e.preventDefault();
                    abrirModalHistorico(stats.pedidosConcluidos);
                });
            }
        }

        // -----------------------------------------------------------
        // Executa cálculo, atualiza cards e configura links
        // -----------------------------------------------------------
        var stats = calcularEstatisticas();
        atualizarStatCards(stats);
        configurarLinksStatCards(stats);

        // --- Interação de estrelas ---
        function initStarRating(container, hiddenInput) {
            if (!container || !hiddenInput) return;
            var stars = container.querySelectorAll('i');
            stars.forEach(function (star, index) {
                star.addEventListener('click', function () {
                    var nota = index + 1;
                    hiddenInput.value = nota;
                    stars.forEach(function (s, i) {
                        if (i < nota) {
                            s.classList.remove('bi-star');
                            s.classList.add('bi-star-fill', 'filled');
                            s.style.color = '#ffc107';
                        } else {
                            s.classList.remove('bi-star-fill', 'filled');
                            s.classList.add('bi-star');
                            s.style.color = '#ccc';
                        }
                    });
                });
                star.addEventListener('mouseover', function () {
                    stars.forEach(function (s, i) {
                        s.style.color = i <= index ? '#ffc107' : '#ccc';
                    });
                });
                star.addEventListener('mouseout', function () {
                    var current = parseInt(hiddenInput.value) || 0;
                    stars.forEach(function (s, i) {
                        s.style.color = i < current ? '#ffc107' : '#ccc';
                    });
                });
            });
        }

        function renderizarEstrelas(container, hiddenInput, nota) {
            var stars = container.querySelectorAll('i');
            stars.forEach(function (s, i) {
                if (i < nota) {
                    s.classList.remove('bi-star');
                    s.classList.add('bi-star-fill', 'filled');
                    s.style.color = '#ffc107';
                } else {
                    s.classList.remove('bi-star-fill', 'filled');
                    s.classList.add('bi-star');
                    s.style.color = '#ccc';
                }
            });
            hiddenInput.value = nota;
        }

        function resetarEstrelas(container, hiddenInput) {
            renderizarEstrelas(container, hiddenInput, 0);
        }

        var starsContainer    = document.getElementById('modal-estrelas');
        var notaInput         = document.getElementById('modal-nota-valor');
        var starsEditContainer = document.getElementById('modal-editar-estrelas');
        var notaEditarInput   = document.getElementById('modal-editar-nota-valor');

        initStarRating(starsContainer, notaInput);
        initStarRating(starsEditContainer, notaEditarInput);

        var pedidoAtual = null;

        // --- Botão AVALIAR ---
        pedidosList.querySelectorAll('.btn-avaliar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.cli-pedidos-item');
                pedidoAtual = item.dataset.pedidoId;

                document.getElementById('modal-prestador-info').innerHTML =
                    '<strong>Serviço:</strong> ' + item.dataset.servico +
                    ' &nbsp;|&nbsp; <strong>Profissional:</strong> ' + item.dataset.profissional;

                resetarEstrelas(starsContainer, notaInput);
                document.getElementById('modal-comentario').value = '';

                new bootstrap.Modal(document.getElementById('modalAvaliar')).show();
            });
        });

        // --- Salvar nova avaliação ---
        var btnSalvar = document.getElementById('btn-salvar-avaliacao');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                var nota = parseInt(notaInput.value) || 0;
                var comentario = document.getElementById('modal-comentario').value.trim();

                if (nota === 0) { alert('Por favor, selecione uma nota de 1 a 5!'); return; }
                if (!comentario) { alert('Por favor, escreva um comentário!'); return; }

                var item = pedidosList.querySelector('[data-pedido-id="' + pedidoAtual + '"]');
                var avaliacoes = obterAvaliacoes();
                var idx = avaliacoes.findIndex(function (a) { return a.pedidoId === pedidoAtual; });

                var hoje = new Date();
                var dataFormatada = hoje.toLocaleDateString('pt-BR');

                var usuarioLogado = {};
                try { usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || '{}'); } catch (e) {}

                var novaAvaliacao = {
                    id: pedidoAtual + '_' + Date.now(),
                    pedidoId: pedidoAtual,
                    servico: item.dataset.servico,
                    profissional: item.dataset.profissional,
                    nota: nota,
                    comentario: comentario,
                    data: dataFormatada,
                    clienteNome: usuarioLogado.nome || 'Cliente'
                };

                if (idx >= 0) { avaliacoes[idx] = novaAvaliacao; }
                else { avaliacoes.push(novaAvaliacao); }

                salvarAvaliacoes(avaliacoes);

                bootstrap.Modal.getInstance(document.getElementById('modalAvaliar')).hide();
                alert('Avaliação salva com sucesso! Ela aparecerá na página de Avaliações Realizadas.');
            });
        }

        // --- Botão EDITAR ---
        pedidosList.querySelectorAll('.btn-editar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.cli-pedidos-item');
                var pedidoId = item.dataset.pedidoId;
                var avaliacao = obterAvaliacaoPorPedido(pedidoId);

                if (!avaliacao) {
                    alert('Nenhuma avaliação encontrada para este serviço. Clique em "Avaliar" para criar uma.');
                    return;
                }

                pedidoAtual = pedidoId;
                document.getElementById('modal-editar-info').innerHTML =
                    '<strong>Serviço:</strong> ' + avaliacao.servico +
                    ' &nbsp;|&nbsp; <strong>Profissional:</strong> ' + avaliacao.profissional;

                renderizarEstrelas(starsEditContainer, notaEditarInput, avaliacao.nota);
                document.getElementById('modal-editar-comentario').value = avaliacao.comentario;

                new bootstrap.Modal(document.getElementById('modalEditar')).show();
            });
        });

        // --- Salvar edição ---
        var btnSalvarEdicao = document.getElementById('btn-salvar-edicao');
        if (btnSalvarEdicao) {
            btnSalvarEdicao.addEventListener('click', function () {
                var nota = parseInt(notaEditarInput.value) || 0;
                var comentario = document.getElementById('modal-editar-comentario').value.trim();

                if (nota === 0) { alert('Por favor, selecione uma nota de 1 a 5!'); return; }
                if (!comentario) { alert('Por favor, escreva um comentário!'); return; }

                var avaliacoes = obterAvaliacoes();
                var idx = avaliacoes.findIndex(function (a) { return a.pedidoId === pedidoAtual; });

                if (idx >= 0) {
                    avaliacoes[idx].nota = nota;
                    avaliacoes[idx].comentario = comentario;
                    salvarAvaliacoes(avaliacoes);
                    bootstrap.Modal.getInstance(document.getElementById('modalEditar')).hide();
                    alert('Avaliação atualizada com sucesso!');
                }
            });
        }

        // --- Botão EXCLUIR ---
        pedidosList.querySelectorAll('.btn-excluir').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.cli-pedidos-item');
                var pedidoId = item.dataset.pedidoId;
                var avaliacao = obterAvaliacaoPorPedido(pedidoId);

                if (!avaliacao) {
                    alert('Nenhuma avaliação encontrada para este serviço. Clique em "Avaliar" para criar uma.');
                    return;
                }

                if (confirm('Tem certeza que deseja excluir a avaliação de "' + avaliacao.servico + '"?')) {
                    var avaliacoes = obterAvaliacoes().filter(function (a) { return a.pedidoId !== pedidoId; });
                    salvarAvaliacoes(avaliacoes);
                    alert('Avaliação excluída com sucesso!');
                }
            });
        });

        // =====================================================================
        // CHAT: CLIENTE <-> PRESTADOR (área do cliente)
        // ---------------------------------------------------------------------
        // Espelho da lógica de chat do prestador (inicializarPrestadorServicosAgendados).
        // A ideia é manter UMA conversa por pedido, identificada por (prestadorId + clienteId),
        // persistida em localStorage — assim, o prestador e o cliente enxergam o mesmo histórico
        // de mensagens, cada um a partir do seu próprio ponto de vista ("remetente").
        //
        // Convenções de chave:
        //   prestChatMensagens_<prestadorId>_<clienteId>
        //
        // Como esta área é a do cliente, derivamos o "clienteId" do usuário logado (ou um fallback)
        // e o "prestadorId" do nome do profissional de cada pedido (slugificado) — as mesmas regras
        // usadas no lado do prestador, de modo que ambas as pontas apontem para a mesma chave.
        //
        // Controle de "mensagens não lidas":
        //   Guardamos em prestChatUltimaLeitura_<prestadorId>_<clienteId> o timestamp da última
        //   vez que o cliente abriu a conversa. Uma mensagem do prestador é considerada NÃO LIDA
        //   se sua data for posterior à última leitura do cliente.
        // =====================================================================
        var CHAT_MSGS_PREFIX_CLI      = 'prestChatMensagens_';
        var CHAT_LEITURA_PREFIX_CLI   = 'prestChatUltimaLeituraCli_';

        // Referências DOM do modal de chat do cliente (resolvidas na primeira abertura)
        var cliModalChatEl, cliModalChatInstance, cliChatHistoricoEl, cliChatTextareaEl,
            cliChatInfoEl, cliChatPrestNomeEl, cliChatContadorEl,
            btnCliChatLimpar, btnCliChatEditar, btnCliChatCancelar, btnCliChatEnviar;
        var cliChatPedidoAtual   = null;  // Elemento <li> do pedido selecionado
        var cliChatPrestadorId   = null;  // slug estável do prestador
        var cliChatClienteId     = null;  // id estável do cliente logado
        var cliChatOrigemFoco    = null;  // botão que abriu o modal (retorno de foco)
        var cliChatHandlersRegistrados = false;

        // Gera um slug a partir de uma string qualquer (nome do prestador/cliente)
        function slugificarCli(str) {
            return String(str || '')
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        // Retorna o id estável do cliente logado (fallback: slug do nome, ou "cli-demo")
        function obterClienteIdLogado() {
            var dados = {};
            try { dados = JSON.parse(localStorage.getItem('usuarioLogado') || '{}'); } catch (e) {}
            if (dados && dados.id)    return String(dados.id);
            if (dados && dados.email) return 'cli-' + slugificarCli(dados.email);
            if (dados && dados.nome)  return 'cli-' + slugificarCli(dados.nome);
            return 'cli-demo';
        }

        // Id do prestador a partir do nome exibido no item do pedido
        function obterPrestadorIdDoItem(item) {
            var nome = item.dataset.profissional || '';
            if (!nome || nome === 'N/A') return null;
            // Mesmo formato usado no lado do prestador: o id é essencialmente o slug do nome,
            // prefixado com "prest-" para evitar colisão com outros domínios.
            return 'prest-' + slugificarCli(nome);
        }

        // Chave do localStorage para o histórico da conversa
        function obterChaveChatCli(prestadorId, clienteId) {
            return CHAT_MSGS_PREFIX_CLI + prestadorId + '_' + clienteId;
        }
        // Chave do localStorage para o timestamp da última leitura (pelo cliente)
        function obterChaveLeituraCli(prestadorId, clienteId) {
            return CHAT_LEITURA_PREFIX_CLI + prestadorId + '_' + clienteId;
        }

        // Leitura defensiva do histórico
        function carregarHistoricoChatCli(prestadorId, clienteId) {
            if (!prestadorId || !clienteId) return [];
            try {
                var raw = localStorage.getItem(obterChaveChatCli(prestadorId, clienteId));
                if (!raw) return [];
                var arr = JSON.parse(raw);
                return Array.isArray(arr) ? arr : [];
            } catch (e) {
                console.warn('Histórico de chat (cliente) corrompido — zerando.', e);
                return [];
            }
        }
        function salvarHistoricoChatCli(prestadorId, clienteId, mensagens) {
            try {
                localStorage.setItem(obterChaveChatCli(prestadorId, clienteId), JSON.stringify(mensagens));
            } catch (e) {
                console.error('Não foi possível salvar o histórico de chat:', e);
            }
        }

        // Marca a conversa como lida pelo cliente (agora)
        function marcarConversaComoLidaCli(prestadorId, clienteId) {
            if (!prestadorId || !clienteId) return;
            try {
                localStorage.setItem(obterChaveLeituraCli(prestadorId, clienteId), new Date().toISOString());
            } catch (e) { /* silencioso */ }
        }

        // Conta quantas mensagens do prestador ainda não foram lidas pelo cliente
        function contarNaoLidasNoPedido(prestadorId, clienteId) {
            if (!prestadorId || !clienteId) return 0;
            var ultimaLeitura = null;
            try { ultimaLeitura = localStorage.getItem(obterChaveLeituraCli(prestadorId, clienteId)); } catch (e) {}

            var mensagens = carregarHistoricoChatCli(prestadorId, clienteId);
            return mensagens.filter(function (m) {
                if (m.remetente !== 'prestador') return false; // só contam mensagens DO prestador
                if (!ultimaLeitura) return true;               // nunca leu → tudo é não lida
                return m.data > ultimaLeitura;
            }).length;
        }

        // Formatador simples de hora/data para as bolhas de mensagem
        function formatarHoraChatCli(isoString) {
            var d = new Date(isoString);
            if (isNaN(d.getTime())) return '';
            var hoje = new Date();
            var mesmoDia = d.toDateString() === hoje.toDateString();
            var hh = String(d.getHours()).padStart(2, '0');
            var mm = String(d.getMinutes()).padStart(2, '0');
            if (mesmoDia) return 'Hoje, ' + hh + ':' + mm;
            var dd = String(d.getDate()).padStart(2, '0');
            var mo = String(d.getMonth() + 1).padStart(2, '0');
            return dd + '/' + mo + ' ' + hh + ':' + mm;
        }

        function escaparHtmlCli(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Renderiza o histórico no modal do cliente. As mensagens do cliente aparecem à
        // direita (classe .prest reaproveitada para "sou eu") e as do prestador à esquerda
        // (classe .cliente reaproveitada para "outro"). Apesar dos nomes das classes se
        // referirem ao lado do prestador, isso é apenas um estilo visual: aqui o "remetente
        // do usuário atual" (cliente) ocupa o lado azul/à direita.
        function renderizarHistoricoChatCli(mensagens) {
            if (!cliChatHistoricoEl) return;

            if (!mensagens || mensagens.length === 0) {
                cliChatHistoricoEl.innerHTML =
                    '<div class="agenda-chat-vazio">' +
                        '<i class="bi bi-chat-square-text"></i>' +
                        '<div>Nenhuma mensagem ainda.</div>' +
                        '<small>Envie a primeira mensagem ao prestador.</small>' +
                    '</div>';
                return;
            }

            var html = '';
            mensagens.forEach(function (m) {
                // No modal do cliente, as MINHAS mensagens ficam estilizadas como "prest"
                // (lado direito, azul) e as do outro lado (prestador) como "cliente".
                var classe = (m.remetente === 'cliente') ? 'prest' : 'cliente';
                html +=
                    '<div class="agenda-chat-msg ' + classe + '">' +
                        escaparHtmlCli(m.texto) +
                        '<span class="agenda-chat-msg-hora">' + formatarHoraChatCli(m.data) + '</span>' +
                    '</div>';
            });
            cliChatHistoricoEl.innerHTML = html;
            cliChatHistoricoEl.scrollTop = cliChatHistoricoEl.scrollHeight;
        }

        function atualizarContadorChatCli() {
            if (!cliChatTextareaEl || !cliChatContadorEl) return;
            cliChatContadorEl.textContent = cliChatTextareaEl.value.length;
        }

        // Liga os 4 botões + textarea do modal de chat do cliente (uma única vez)
        function registrarHandlersChatCli() {
            if (cliChatHandlersRegistrados) return;
            cliChatHandlersRegistrados = true;

            // LIMPAR — só zera o rascunho
            btnCliChatLimpar.addEventListener('click', function () {
                if (!cliChatTextareaEl) return;
                cliChatTextareaEl.readOnly = false;
                cliChatTextareaEl.value = '';
                atualizarContadorChatCli();
                cliChatTextareaEl.focus();
            });

            // EDITAR — reabre o campo para digitação
            btnCliChatEditar.addEventListener('click', function () {
                if (!cliChatTextareaEl) return;
                cliChatTextareaEl.readOnly = false;
                cliChatTextareaEl.focus();
                var len = cliChatTextareaEl.value.length;
                try { cliChatTextareaEl.setSelectionRange(len, len); } catch (e) {}
            });

            // CANCELAR — fecha o modal
            btnCliChatCancelar.addEventListener('click', function () {
                if (cliModalChatInstance) cliModalChatInstance.hide();
            });

            // ENVIAR — adiciona mensagem nova e persiste
            btnCliChatEnviar.addEventListener('click', function () {
                if (!cliChatPrestadorId || !cliChatClienteId) return;
                var texto = (cliChatTextareaEl.value || '').trim();
                if (!texto) {
                    alert('Digite uma mensagem antes de enviar.');
                    cliChatTextareaEl.focus();
                    return;
                }

                var msg = {
                    id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    remetente: 'cliente',
                    texto: texto,
                    data: new Date().toISOString(),
                    pedidoId: cliChatPedidoAtual ? cliChatPedidoAtual.dataset.pedidoId : null
                };

                var hist = carregarHistoricoChatCli(cliChatPrestadorId, cliChatClienteId);
                hist.push(msg);
                salvarHistoricoChatCli(cliChatPrestadorId, cliChatClienteId, hist);

                // Notifica o prestador sobre nova mensagem
                // O email do prestador é derivado do CHAT_PREST_ID (que no lado prestador = email)
                // Aqui usamos o prestadorId slug: tentamos reverter para o email via hotsitePrestadorDados
                (function notificarPrestador() {
                    try {
                        var store = JSON.parse(localStorage.getItem('hotsitePrestadorDados') || '{}');
                        var emailPrest = null;
                        // Procura pelo email cujo slug corresponde a cliChatPrestadorId
                        Object.keys(store).forEach(function (em) {
                            var slug = 'prest-' + em.toLowerCase()
                                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                                .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                            if (slug === cliChatPrestadorId) emailPrest = em;
                        });
                        // Fallback: tenta também pelo nome
                        if (!emailPrest) {
                            Object.keys(store).forEach(function (em) {
                                var nslug = 'prest-' + (store[em].nome || '').toLowerCase()
                                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                                    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                                if (nslug === cliChatPrestadorId) emailPrest = em;
                            });
                        }
                        if (emailPrest) {
                            var usu = JSON.parse(localStorage.getItem('usuarioLogado') || '{}');
                            sgCriarNotificacao(emailPrest, 'mensagem', {
                                clienteNome: usu.nome || 'Cliente',
                                clienteEmail: cliChatClienteId,
                                prestadorEmail: emailPrest,
                                preview: texto.substring(0, 80) + (texto.length > 80 ? '…' : ''),
                                clienteId: cliChatClienteId
                            });
                        }
                    } catch (e) { /* silencioso */ }
                })();

                // Como eu acabei de interagir com a conversa, marco TUDO como lido
                marcarConversaComoLidaCli(cliChatPrestadorId, cliChatClienteId);

                renderizarHistoricoChatCli(hist);
                cliChatTextareaEl.value = '';
                atualizarContadorChatCli();
                cliChatTextareaEl.focus();

                // Reavalia badges / aviso de mensagens não lidas
                atualizarIndicadoresMsgsNaoLidas();
            });

            cliChatTextareaEl.addEventListener('input', atualizarContadorChatCli);

            // Atalho Ctrl/Cmd + Enter → envio rápido
            cliChatTextareaEl.addEventListener('keydown', function (e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    btnCliChatEnviar.click();
                }
            });

            // Ao fechar (X, ESC, clique fora, Cancelar), devolve o foco ao botão de origem
            cliModalChatEl.addEventListener('hidden.bs.modal', function () {
                if (cliChatOrigemFoco && typeof cliChatOrigemFoco.focus === 'function') {
                    try { cliChatOrigemFoco.focus(); } catch (e) {}
                }
            });
        }

        // Abre o modal de chat para um determinado item de pedido (<li>)
        function abrirModalChatCli(itemPedido) {
            // Lazy-init do DOM (cachear referências)
            if (!cliModalChatEl) {
                cliModalChatEl      = document.getElementById('modalChatPrestador');
                if (!cliModalChatEl) return;
                cliChatHistoricoEl  = document.getElementById('modal-chat-cli-historico');
                cliChatTextareaEl   = document.getElementById('modal-chat-cli-texto');
                cliChatInfoEl       = document.getElementById('modal-chat-cli-info');
                cliChatPrestNomeEl  = document.getElementById('modal-chat-prestador-nome');
                cliChatContadorEl   = document.getElementById('modal-chat-cli-contador');
                btnCliChatLimpar    = document.getElementById('btn-chat-cli-limpar');
                btnCliChatEditar    = document.getElementById('btn-chat-cli-editar');
                btnCliChatCancelar  = document.getElementById('btn-chat-cli-cancelar');
                btnCliChatEnviar    = document.getElementById('btn-chat-cli-enviar');
                cliModalChatInstance = new bootstrap.Modal(cliModalChatEl);
                registrarHandlersChatCli();
            }

            var prestadorNome = itemPedido.dataset.profissional || 'Prestador';
            if (!prestadorNome || prestadorNome === 'N/A') {
                alert('Este pedido ainda não tem um prestador atribuído — não é possível abrir um chat.');
                return;
            }

            cliChatPedidoAtual  = itemPedido;
            cliChatPrestadorId  = obterPrestadorIdDoItem(itemPedido);
            cliChatClienteId    = obterClienteIdLogado();
            cliChatOrigemFoco   = document.activeElement;

            if (cliChatPrestNomeEl) cliChatPrestNomeEl.textContent = prestadorNome;

            if (cliChatInfoEl) {
                cliChatInfoEl.innerHTML =
                    '<span class="agenda-chat-info-item"><i class="bi bi-person-badge"></i><strong>' +
                        escaparHtmlCli(prestadorNome) + '</strong></span>' +
                    '<span class="agenda-chat-info-item"><i class="bi bi-tools"></i>' +
                        escaparHtmlCli(itemPedido.dataset.servico || '') + '</span>';
            }

            // Carrega o histórico persistido e renderiza
            var historico = carregarHistoricoChatCli(cliChatPrestadorId, cliChatClienteId);

            // --- MODO DEMO ---------------------------------------------------
            // Se for a conversa com Maria Silva (pedido-1) e ainda não houver
            // mensagens salvas, semeamos uma mensagem do prestador simulando uma
            // notificação recebida, para que o usuário consiga "ver" a mensagem
            // não lida sinalizada pelo sininho.
            if (historico.length === 0 &&
                itemPedido.dataset.pedidoId === 'pedido-1' &&
                itemPedido.classList.contains('tem-mensagem-nao-lida')) {
                historico.push({
                    id: 'msg-demo-' + Date.now(),
                    remetente: 'prestador',
                    texto: 'Olá! Estou a caminho do endereço combinado. Posso precisar confirmar o modelo do disjuntor antes de iniciar o serviço.',
                    data: new Date().toISOString(),
                    pedidoId: 'pedido-1'
                });
                salvarHistoricoChatCli(cliChatPrestadorId, cliChatClienteId, historico);
            }
            // ----------------------------------------------------------------

            renderizarHistoricoChatCli(historico);

            // Ao abrir o modal, o cliente está lendo a conversa → marca como lida
            marcarConversaComoLidaCli(cliChatPrestadorId, cliChatClienteId);

            cliChatTextareaEl.readOnly = false;
            cliChatTextareaEl.value = '';
            atualizarContadorChatCli();

            cliModalChatInstance.show();

            // Foco no textarea após o modal estar 100% visível
            cliModalChatEl.addEventListener('shown.bs.modal', function _foco() {
                if (cliChatTextareaEl) cliChatTextareaEl.focus();
            }, { once: true });

            // Ao fechar, recalcula o estado dos indicadores
            cliModalChatEl.addEventListener('hidden.bs.modal', function _recalc() {
                atualizarIndicadoresMsgsNaoLidas();
            }, { once: true });
        }

        // ---------------------------------------------------------------
        // INDICADORES VISUAIS DE MENSAGENS NÃO LIDAS
        // ---------------------------------------------------------------
        // Percorre todos os itens da lista de pedidos e:
        //   • Mostra ou esconde o sininho individual (ao lado de "Avaliar")
        //     conforme existam mensagens não lidas daquela conversa;
        //   • Mostra ou esconde o aviso coletivo ("Você possui mensagens
        //     não lidas") no cabeçalho do card.
        function atualizarIndicadoresMsgsNaoLidas() {
            var itens = pedidosList.querySelectorAll('.cli-pedidos-item');
            var totalNaoLidas = 0;

            itens.forEach(function (item) {
                var prestadorId = obterPrestadorIdDoItem(item);
                var clienteId   = obterClienteIdLogado();
                var qtd = 0;
                if (prestadorId) qtd = contarNaoLidasNoPedido(prestadorId, clienteId);

                var sino = item.querySelector('.cli-msg-sino');

                if (qtd > 0) {
                    item.classList.add('tem-mensagem-nao-lida');
                    totalNaoLidas += qtd;

                    // Se o item ainda não tem sininho no DOM, criamos um on-the-fly.
                    if (!sino) {
                        var acoes = item.querySelector('.cli-pedidos-acoes');
                        if (acoes) {
                            sino = document.createElement('button');
                            sino.type = 'button';
                            sino.className = 'cli-msg-sino';
                            sino.title = 'Mensagens não lidas de ' + (item.dataset.profissional || 'Prestador');
                            sino.setAttribute('aria-label', sino.title);
                            sino.innerHTML = '<i class="bi bi-bell-fill"></i>';
                            // Inserimos como primeiro filho (à esquerda do botão Avaliar)
                            acoes.insertBefore(sino, acoes.firstChild);
                            // Liga o clique do sininho recém-criado
                            sino.addEventListener('click', function () {
                                abrirModalChatCli(item);
                            });
                        }
                    } else {
                        sino.style.display = '';
                    }
                } else {
                    item.classList.remove('tem-mensagem-nao-lida');
                    if (sino) sino.style.display = 'none';
                }
            });

            // Aviso do cabeçalho ("Você possui mensagens não lidas")
            var aviso = document.getElementById('cli-aviso-msgs-nao-lidas');
            if (aviso) aviso.style.display = (totalNaoLidas > 0) ? '' : 'none';
        }

        // Liga cliques nos sininhos que já existem no HTML estático (primeira carga)
        pedidosList.querySelectorAll('.cli-msg-sino').forEach(function (sino) {
            sino.addEventListener('click', function () {
                var item = sino.closest('.cli-pedidos-item');
                if (item) abrirModalChatCli(item);
            });
        });

        // Liga os botões "Chat" de cada pedido
        pedidosList.querySelectorAll('.btn-chat').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.cli-pedidos-item');
                if (item) abrirModalChatCli(item);
            });
        });

        // Estado inicial: reconcilia os indicadores com o localStorage

        // --- SEED DEMO do chat -----------------------------------------------
        // Para fins de demonstração, garantimos que ao abrir a área do cliente
        // pela primeira vez já exista uma mensagem do prestador "Maria Silva"
        // (pedido-1) aguardando leitura. Isso dá corpo ao sininho vermelho e
        // ao aviso "Você possui mensagens não lidas" logo de cara. Rodamos
        // apenas uma vez, controlado por uma flag em localStorage.
        (function semearMensagemDemoDoPrestadorParaCliente() {
            try {
                var FLAG = 'cliChatSeedMsgDemoV1';
                if (localStorage.getItem(FLAG)) return;

                var itemAlvo = pedidosList.querySelector('.cli-pedidos-item[data-pedido-id="pedido-1"]');
                if (!itemAlvo) return;

                var prestadorId = obterPrestadorIdDoItem(itemAlvo);
                var clienteId   = obterClienteIdLogado();
                if (!prestadorId || !clienteId) return;

                var chave = CHAT_MSGS_PREFIX_CLI + prestadorId + '_' + clienteId;
                var existente = [];
                try { existente = JSON.parse(localStorage.getItem(chave) || '[]'); } catch (e) {}

                existente.push({
                    id: 'msg-demo-' + Date.now(),
                    remetente: 'prestador',
                    texto: 'Olá! Estou a caminho do endereço combinado. Posso precisar confirmar o modelo do disjuntor antes de iniciar o serviço.',
                    data: new Date().toISOString(),
                    pedidoId: 'pedido-1'
                });
                localStorage.setItem(chave, JSON.stringify(existente));
                localStorage.setItem(FLAG, '1');
            } catch (e) { /* silencioso — demo não pode quebrar o app */ }
        })();
        // ---------------------------------------------------------------------

        atualizarIndicadoresMsgsNaoLidas();

        // Atualiza periodicamente os indicadores — simula "recebimento de novas mensagens"
        // chegando enquanto o cliente está na página (o prestador pode ter respondido em outra aba).
        setInterval(atualizarIndicadoresMsgsNaoLidas, 5000);
    }

    // =====================================================
    // AVALIAÇÕES FEITAS PELO CLIENTE (clienteAvaliacoesFeitas.html)
    // -----------------------------------------------------
    // Mostra as avaliações que o cliente (usuário logado) fez
    // para os prestadores de serviço, permitindo EDITAR e EXCLUIR.
    // Fonte: localStorage 'avaliacoesSalvas' (mesma chave
    // usada em clienteAreaExclusiva.html).
    // =====================================================
    function inicializarAvaliacoesFeitas() {
        var container = document.getElementById('container-avaliacoes-feitas');
        if (!container) return;

        var AVALIACOES_KEY = 'avaliacoesSalvas';

        function obterAvaliacoes() {
            try { return JSON.parse(localStorage.getItem(AVALIACOES_KEY) || '[]'); }
            catch (e) { return []; }
        }

        function salvarAvaliacoes(arr) {
            localStorage.setItem(AVALIACOES_KEY, JSON.stringify(arr));
        }

        // Referências do modal de edição (presente no HTML da página)
        var modalEditarFeita      = document.getElementById('modalEditarFeita');
        var starsEditarContainer  = document.getElementById('modal-editar-feita-estrelas');
        var notaEditarInput       = document.getElementById('modal-editar-feita-nota-valor');
        var comentarioEditarInput = document.getElementById('modal-editar-feita-comentario');
        var infoEditarDiv         = document.getElementById('modal-editar-feita-info');
        var btnSalvarEdicao       = document.getElementById('btn-salvar-edicao-feita');
        var pedidoIdAtual         = null;

        // --- Interação de estrelas do modal de edição ---
        function initStarRating(containerStars, hiddenInput) {
            if (!containerStars || !hiddenInput) return;
            var stars = containerStars.querySelectorAll('i');
            stars.forEach(function (star, index) {
                star.addEventListener('click', function () {
                    var nota = index + 1;
                    hiddenInput.value = nota;
                    stars.forEach(function (s, i) {
                        if (i < nota) {
                            s.classList.remove('bi-star');
                            s.classList.add('bi-star-fill', 'filled');
                            s.style.color = '#ffc107';
                        } else {
                            s.classList.remove('bi-star-fill', 'filled');
                            s.classList.add('bi-star');
                            s.style.color = '#ccc';
                        }
                    });
                });
                star.addEventListener('mouseover', function () {
                    stars.forEach(function (s, i) {
                        s.style.color = i <= index ? '#ffc107' : '#ccc';
                    });
                });
                star.addEventListener('mouseout', function () {
                    var current = parseInt(hiddenInput.value) || 0;
                    stars.forEach(function (s, i) {
                        s.style.color = i < current ? '#ffc107' : '#ccc';
                    });
                });
            });
        }

        function renderizarEstrelasFixas(containerStars, hiddenInput, nota) {
            if (!containerStars || !hiddenInput) return;
            var stars = containerStars.querySelectorAll('i');
            stars.forEach(function (s, i) {
                if (i < nota) {
                    s.classList.remove('bi-star');
                    s.classList.add('bi-star-fill', 'filled');
                    s.style.color = '#ffc107';
                } else {
                    s.classList.remove('bi-star-fill', 'filled');
                    s.classList.add('bi-star');
                    s.style.color = '#ccc';
                }
            });
            hiddenInput.value = nota;
        }

        initStarRating(starsEditarContainer, notaEditarInput);

        // --- Renderiza a lista de avaliações feitas pelo cliente ---
        function renderizarLista() {
            // Remove cards previamente renderizados (mas mantém o botão
            // "Carregar Mais Avaliações" e header, se houver)
            var cards = container.querySelectorAll('.review-card-reverse[data-pedido-id]');
            cards.forEach(function (c) { c.remove(); });

            // Remove header antigo (para permitir re-render sem duplicar)
            var headerAntigo = container.querySelector('#header-avaliacoes-feitas');
            if (headerAntigo) headerAntigo.remove();

            // Remove mensagem "nenhuma avaliação" antiga
            var msgAntiga = container.querySelector('#msg-sem-avaliacoes-feitas');
            if (msgAntiga) msgAntiga.remove();

            var avaliacoes = obterAvaliacoes();

            // Ponto de inserção: antes do bloco do botão "Carregar Mais"
            var botaoBloco = container.querySelector('.d-flex.justify-content-center');

            // Cabeçalho da seção
            var headerDiv = document.createElement('div');
            headerDiv.id = 'header-avaliacoes-feitas';
            headerDiv.style.cssText = 'font-size:1rem; font-weight:700; color:var(--azul-principal,#146ADB); padding-bottom:8px; border-bottom:2px solid var(--azul-principal,#146ADB); margin-bottom:12px;';
            headerDiv.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107"></i>Minhas Avaliações Realizadas';
            container.insertBefore(headerDiv, botaoBloco || null);

            if (avaliacoes.length === 0) {
                var msg = document.createElement('div');
                msg.id = 'msg-sem-avaliacoes-feitas';
                msg.className = 'text-center text-muted py-4';
                msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Você ainda não realizou nenhuma avaliação.';
                container.insertBefore(msg, botaoBloco || null);
                return;
            }

            // Mais recentes primeiro
            var ordenadas = avaliacoes.slice().reverse();

            ordenadas.forEach(function (av) {
                var stars = '';
                for (var i = 1; i <= 5; i++) {
                    stars += i <= av.nota
                        ? '<i class="bi bi-star-fill filled" style="color:#ffc107"></i>'
                        : '<i class="bi bi-star" style="color:#ccc"></i>';
                }

                var card = document.createElement('div');
                card.className = 'review-card-reverse';
                card.dataset.pedidoId = av.pedidoId;
                card.innerHTML =
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        '<h5 class="mb-0">Prestador: ' + av.profissional + ' (' + av.servico + ')</h5>' +
                        '<span class="text-muted"><small>Data ' + av.data + '</small></span>' +
                    '</div>' +
                    '<div class="rating">' + stars +
                        '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6>' +
                    '</div>' +
                    '<p class="review-text">"' + av.comentario + '"</p>' +
                    '<div class="d-flex gap-2 mt-2">' +
                        '<button type="button" class="btn btn-warning btn-editar-feita" data-pedido-id="' + av.pedidoId + '">' +
                            '<i class="bi bi-pencil-square me-1"></i>Editar' +
                        '</button>' +
                        '<button type="button" class="btn btn-danger btn-excluir-feita" data-pedido-id="' + av.pedidoId + '">' +
                            '<i class="bi bi-trash me-1"></i>Excluir' +
                        '</button>' +
                    '</div>';

                container.insertBefore(card, botaoBloco || null);
            });
        }

        // --- Delegação de eventos: editar e excluir ---
        container.addEventListener('click', function (e) {
            var btnEditar  = e.target.closest('.btn-editar-feita');
            var btnExcluir = e.target.closest('.btn-excluir-feita');

            // EDITAR
            if (btnEditar) {
                var pedidoId = btnEditar.dataset.pedidoId;
                var avaliacoes = obterAvaliacoes();
                var avaliacao = avaliacoes.find(function (a) { return a.pedidoId === pedidoId; });
                if (!avaliacao) {
                    alert('Avaliação não encontrada.');
                    return;
                }

                pedidoIdAtual = pedidoId;
                if (infoEditarDiv) {
                    infoEditarDiv.innerHTML =
                        '<strong>Serviço:</strong> ' + avaliacao.servico +
                        ' &nbsp;|&nbsp; <strong>Prestador:</strong> ' + avaliacao.profissional;
                }
                renderizarEstrelasFixas(starsEditarContainer, notaEditarInput, avaliacao.nota);
                if (comentarioEditarInput) comentarioEditarInput.value = avaliacao.comentario;

                if (modalEditarFeita) {
                    bootstrap.Modal.getOrCreateInstance(modalEditarFeita).show();
                }
                return;
            }

            // EXCLUIR
            if (btnExcluir) {
                var pedidoIdExcluir = btnExcluir.dataset.pedidoId;
                var avaliacoesExc = obterAvaliacoes();
                var alvo = avaliacoesExc.find(function (a) { return a.pedidoId === pedidoIdExcluir; });
                if (!alvo) return;

                if (!confirm('Tem certeza que deseja excluir esta avaliação?')) return;

                var filtradas = avaliacoesExc.filter(function (a) { return a.pedidoId !== pedidoIdExcluir; });
                salvarAvaliacoes(filtradas);
                renderizarLista();
                alert('Avaliação excluída com sucesso!');
            }
        });

        // --- Salvar edição ---
        if (btnSalvarEdicao) {
            btnSalvarEdicao.addEventListener('click', function () {
                var nota = parseInt(notaEditarInput.value) || 0;
                var comentario = comentarioEditarInput.value.trim();

                if (nota === 0) { alert('Por favor, selecione uma nota de 1 a 5!'); return; }
                if (!comentario) { alert('Por favor, escreva um comentário!'); return; }

                var avaliacoes = obterAvaliacoes();
                var idx = avaliacoes.findIndex(function (a) { return a.pedidoId === pedidoIdAtual; });
                if (idx < 0) return;

                avaliacoes[idx].nota = nota;
                avaliacoes[idx].comentario = comentario;
                salvarAvaliacoes(avaliacoes);

                if (modalEditarFeita) {
                    bootstrap.Modal.getInstance(modalEditarFeita).hide();
                }
                renderizarLista();
                alert('Avaliação atualizada com sucesso!');
            });
        }

        renderizarLista();
    }

    // =====================================================
    // AVALIAÇÕES RECEBIDAS PELO CLIENTE (clienteAvaliacoesRecebidas.html)
    // -----------------------------------------------------
    // Mostra as avaliações que os PRESTADORES fizeram para o
    // cliente (usuário logado). NESTA PÁGINA O CLIENTE NÃO
    // PODE EDITAR NEM EXCLUIR — apenas visualizar.
    // Fonte: localStorage 'avaliacoesRecebidasDoCliente'.
    // Se a chave não existir, é populada com dados-semente
    // para fins de demonstração.
    // =====================================================
    function inicializarAvaliacoesRecebidas() {
        var container = document.getElementById('container-avaliacoes-recebidas');
        if (!container) return;

        var AVALIACOES_REC_KEY = 'avaliacoesRecebidasDoCliente';

        // Semeia dados de demonstração se a chave ainda não existir
        (function semearDadosDemo() {
            var atual = localStorage.getItem(AVALIACOES_REC_KEY);
            if (atual !== null) return;

            var demo = [
                {
                    id: 'rec-1',
                    prestador: 'Maria P.',
                    servico: 'Pintura',
                    nota: 5,
                    comentario: 'Cliente educado e respeitoso, super colaborativo e compreensivel.',
                    data: '01/01/2023'
                },
                {
                    id: 'rec-2',
                    prestador: 'Pedro S.',
                    servico: 'Montador de Móveis',
                    nota: 3,
                    comentario: 'Serviço concluído com sucesso, mas o ambiente de trabalho foi péssimo. O cliente foi muito ríspido e me impediu de ir até o meu carro buscar uma ferramenta de trabalho que faltava, o que atrapalhou a fluidez do serviço e gerou uma situação bem desconfortável. Falta de respeito e compreensão com o prestador de serviços.',
                    data: '01/01/2023'
                },
                {
                    id: 'rec-3',
                    prestador: 'Sônia B.',
                    servico: 'Diarista',
                    nota: 4,
                    comentario: 'Cliente muito educado e atencioso.',
                    data: '01/01/2023'
                }
            ];

            localStorage.setItem(AVALIACOES_REC_KEY, JSON.stringify(demo));
        })();

        function obterAvaliacoesRecebidas() {
            try { return JSON.parse(localStorage.getItem(AVALIACOES_REC_KEY) || '[]'); }
            catch (e) { return []; }
        }

        function renderizarLista() {
            // Limpa cards anteriores
            var cards = container.querySelectorAll('.review-card-reverse[data-recebida-id]');
            cards.forEach(function (c) { c.remove(); });

            var headerAntigo = container.querySelector('#header-avaliacoes-recebidas');
            if (headerAntigo) headerAntigo.remove();

            var msgAntiga = container.querySelector('#msg-sem-avaliacoes-recebidas');
            if (msgAntiga) msgAntiga.remove();

            var avaliacoes = obterAvaliacoesRecebidas();
            var botaoBloco = container.querySelector('.d-flex.justify-content-center');

            // Cabeçalho da seção
            var headerDiv = document.createElement('div');
            headerDiv.id = 'header-avaliacoes-recebidas';
            headerDiv.style.cssText = 'font-size:1rem; font-weight:700; color:var(--azul-principal,#146ADB); padding-bottom:8px; border-bottom:2px solid var(--azul-principal,#146ADB); margin-bottom:12px;';
            headerDiv.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107"></i>Avaliações Recebidas dos Prestadores';
            container.insertBefore(headerDiv, botaoBloco || null);

            if (avaliacoes.length === 0) {
                var msg = document.createElement('div');
                msg.id = 'msg-sem-avaliacoes-recebidas';
                msg.className = 'text-center text-muted py-4';
                msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Você ainda não recebeu avaliações de prestadores.';
                container.insertBefore(msg, botaoBloco || null);
                return;
            }

            // Mais recentes primeiro
            var ordenadas = avaliacoes.slice().reverse();

            ordenadas.forEach(function (av) {
                var stars = '';
                for (var i = 1; i <= 5; i++) {
                    stars += i <= av.nota
                        ? '<i class="bi bi-star-fill filled" style="color:#ffc107"></i>'
                        : '<i class="bi bi-star" style="color:#ccc"></i>';
                }

                var card = document.createElement('div');
                card.className = 'review-card-reverse';
                card.dataset.recebidaId = av.id;
                // IMPORTANTE: sem botões de editar/excluir — apenas visualização.
                card.innerHTML =
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        '<h5 class="mb-0">Prestador: ' + av.prestador + ' (' + av.servico + ')</h5>' +
                        '<span class="text-muted"><small>Data ' + av.data + '</small></span>' +
                    '</div>' +
                    '<div class="rating">' + stars +
                        '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6>' +
                    '</div>' +
                    '<p class="review-text">"' + av.comentario + '"</p>';

                container.insertBefore(card, botaoBloco || null);
            });
        }

        renderizarLista();
    }

    // =====================================================
    // BOTÃO VOLTAR — QUALQUER PÁGINA
    // -----------------------------------------------------
    // Captura todos os botões cujo ID seja 'btn-voltar' OU que
    // possuam o atributo data-action="voltar" OU cuja label seja
    // exatamente "Voltar". Ao clicar, retorna à página anterior
    // (window.history.back()). Se não houver histórico, cai em
    // fallback opcional via data-voltar-fallback="url".
    // =====================================================
    function inicializarBotaoVoltar() {
        var candidatos = document.querySelectorAll(
            '#btn-voltar, [data-action="voltar"], button.btn-outline-secondary'
        );

        candidatos.forEach(function (btn) {
            // Restringe a casos em que o texto é realmente "Voltar"
            // OU o próprio botão tem o id/atributo declarado.
            var textoOk = btn.textContent.trim().toLowerCase().indexOf('voltar') !== -1;
            var idOk = btn.id === 'btn-voltar';
            var attrOk = btn.getAttribute('data-action') === 'voltar';
            if (!textoOk && !idOk && !attrOk) return;

            // Evita múltiplos listeners se a função for chamada mais de uma vez
            if (btn.dataset.voltarBound === '1') return;
            btn.dataset.voltarBound = '1';

            btn.addEventListener('click', function (e) {
                e.preventDefault();
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    var fallback = btn.getAttribute('data-voltar-fallback');
                    if (fallback) {
                        window.location.href = fallback;
                    } else {
                        irParaRaiz('index.html');
                    }
                }
            });
        });
    }

    // =====================================================
    // ADMINISTRAÇÃO DE PERFIL DO CLIENTE
    // =====================================================
    function inicializarPerfilCliente() {
        var inputNome = document.getElementById('adm-nome');
        var inputCpf = document.getElementById('adm-cpf');
        var inputCidade = document.getElementById('adm-cidade');
        var inputEndereco = document.getElementById('adm-endereco');
        var inputEmail = document.getElementById('adm-email');
        var inputTel = document.getElementById('adm-tel');
        var inputFoto = document.getElementById('adm-foto');
        var btnSalvarPerfil = document.getElementById('btn-salvar-perfil');
        var btnLimparPerfil = document.getElementById('btn-limpar-perfil');
        var avatarDiv = document.querySelector('.hotsite-avatar');
        var btnSalvarSenha = document.getElementById('btn-salvar-senha');

        // Só inicializa se estiver na tela do perfil
        if (!inputNome) return;

        var usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || '{}');
        var emailLogado = usuarioLogado.email;
        var usuariosCadastrados = obterUsuariosCadastrados();
        var dadosUsuario = usuariosCadastrados[emailLogado] || {};

        // 1. Carrega Nome e E-mail padrão
        inputNome.value = dadosUsuario.nome || usuarioLogado.nome || '';
        inputEmail.value = emailLogado || '';
        inputEmail.setAttribute('readonly', 'true'); // Email geralmente não é alterado aqui

        // Preenche outros campos salvos
        if (dadosUsuario.perfil) {
            inputCpf.value = dadosUsuario.perfil.cpf || '';
            inputCidade.value = dadosUsuario.perfil.cidade || '';
            inputEndereco.value = dadosUsuario.perfil.endereco || '';
            inputTel.value = dadosUsuario.perfil.tel || '';
            
            if (dadosUsuario.perfil.foto) {
                avatarDiv.style.backgroundImage = 'url(' + dadosUsuario.perfil.foto + ')';
                avatarDiv.style.backgroundSize = 'cover';
                avatarDiv.style.backgroundPosition = 'center';
                avatarDiv.textContent = '';
                avatarDiv.dataset.base64 = dadosUsuario.perfil.foto;
            } else {
                avatarDiv.textContent = (inputNome.value.substring(0, 2).toUpperCase() || 'US');
            }
        } else {
            avatarDiv.textContent = (inputNome.value.substring(0, 2).toUpperCase() || 'US');
        }

        // 2. Máscara Automática de CPF
        if (inputCpf) {
            inputCpf.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, "");
                if (v.length <= 11) {
                    v = v.replace(/(\d{3})(\d)/, "$1.$2");
                    v = v.replace(/(\d{3})(\d)/, "$1.$2");
                    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
                }
                e.target.value = v;
            });
        }

        // 3. Atualizar Imagem do Avatar
        if (inputFoto) {
            inputFoto.addEventListener('change', function (e) {
                var file = e.target.files[0];
                if (file) {
                    var reader = new FileReader();
                    reader.onload = function (event) {
                        avatarDiv.style.backgroundImage = 'url(' + event.target.result + ')';
                        avatarDiv.style.backgroundSize = 'cover';
                        avatarDiv.style.backgroundPosition = 'center';
                        avatarDiv.textContent = '';
                        avatarDiv.dataset.base64 = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // 4. Salvar Perfil
        if (btnSalvarPerfil) {
            btnSalvarPerfil.addEventListener('click', function () {
                dadosUsuario.nome = inputNome.value;
                usuarioLogado.nome = inputNome.value;
                localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

                dadosUsuario.perfil = {
                    cpf: inputCpf.value,
                    cidade: inputCidade.value,
                    endereco: inputEndereco.value,
                    tel: inputTel.value,
                    foto: avatarDiv.dataset.base64 || (dadosUsuario.perfil ? dadosUsuario.perfil.foto : '')
                };

                usuariosCadastrados[emailLogado] = dadosUsuario;
                salvarUsuariosCadastrados(usuariosCadastrados);

                alert('Dados do perfil salvos com sucesso!');
                window.location.reload();
            });
        }

        // 5. Botão Limpar (Exclui tudo menos nome e e-mail)
        if (btnLimparPerfil) {
            btnLimparPerfil.addEventListener('click', function () {
                inputCpf.value = '';
                inputCidade.value = '';
                inputEndereco.value = '';
                inputTel.value = '';
                inputFoto.value = '';
                
                avatarDiv.style.backgroundImage = '';
                avatarDiv.textContent = (inputNome.value.substring(0, 2).toUpperCase() || 'US');
                delete avatarDiv.dataset.base64;
            });
        }

        // 6. Alterar Senha (Modal)
        if (btnSalvarSenha) {
            btnSalvarSenha.addEventListener('click', function () {
                var senhaAtual = document.getElementById('senha-atual').value;
                var novaSenha = document.getElementById('nova-senha').value;
                var repitaNovaSenha = document.getElementById('repita-nova-senha').value;

                if (senhaAtual !== dadosUsuario.senha) {
                    alert('A senha atual está incorreta!');
                    return;
                }

                // Regex: Mínimo 8 caracteres, contendo letras, números e caracteres especiais
                var regexSenha = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
                
                if (!regexSenha.test(novaSenha)) {
                    alert('A nova senha não atende aos requisitos mínimos!\n\nA senha deve ter pelo menos 8 caracteres e incluir letras, números e caracteres especiais.');
                    return;
                }

                if (novaSenha !== repitaNovaSenha) {
                    alert('As novas senhas digitadas não coincidem. Tente novamente.');
                    return;
                }

                // Atualiza a senha (É Case Sensitive via a simples atribuição e validação de String padrão)
                dadosUsuario.senha = novaSenha;
                usuariosCadastrados[emailLogado] = dadosUsuario;
                salvarUsuariosCadastrados(usuariosCadastrados);

                alert('Senha atualizada com sucesso!');
                
                // Limpa os campos e fecha o modal
                document.getElementById('senha-atual').value = '';
                document.getElementById('nova-senha').value = '';
                document.getElementById('repita-nova-senha').value = '';
                
                var modalInstance = bootstrap.Modal.getInstance(document.getElementById('modalAlterarSenha'));
                if (modalInstance) {
                    modalInstance.hide();
                }
            });
        }
    }


    // =====================================================
    // ADMINISTRAÇÃO DO HOT SITE DO PRESTADOR
    // (prestadorHotsiteAdm.html)
    // =====================================================
    function inicializarHotsitePrestador() {
        // Só inicializa se estiver na tela do HotSite Adm do Prestador
        // (identificada pela presença do campo CPF/CNPJ específico dessa tela)
        var inputCnpj = document.getElementById('adm-cnpj');
        if (!inputCnpj) return;

        var inputNome = document.getElementById('adm-nome');
        var inputCategoria = document.getElementById('adm-categoria');
        var inputCidade = document.getElementById('adm-cidade');
        var inputDescricao = document.getElementById('adm-descricao');
        var inputEndereco = document.getElementById('adm-endereco');
        var inputEmail = document.getElementById('adm-email');
        var inputTel = document.getElementById('adm-tel');
        var inputGaleria = document.getElementById('adm-galeria');
        var btnSalvar = document.getElementById('btn-salvar-hotsite');
        var btnLimpar = document.getElementById('btn-limpar-hotsite');
        var avatarDiv = document.querySelector('.hotsite-avatar');

        var HOTSITE_STORAGE_KEY = 'hotsitePrestadorDados';

        // Carrega os dados do usuário logado (do cadastro)
        var usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || '{}');
        var emailLogado = usuarioLogado.email || '';
        var usuariosCadastrados = obterUsuariosCadastrados();
        var dadosUsuario = usuariosCadastrados[emailLogado] || {};

        // Carrega dados previamente salvos do hotsite (se existirem)
        var dadosHotsiteSalvos = {};
        try {
            var hotsiteStore = JSON.parse(localStorage.getItem(HOTSITE_STORAGE_KEY) || '{}');
            dadosHotsiteSalvos = hotsiteStore[emailLogado] || {};
        } catch (e) { dadosHotsiteSalvos = {}; }

        // 1. Preenche por padrão os campos do cadastro (nome e e-mail)
        inputNome.value = dadosUsuario.nome || usuarioLogado.nome || '';
        inputEmail.value = emailLogado || '';

        // Preenche demais campos, caso já tenham sido salvos anteriormente
        if (inputCnpj) inputCnpj.value = dadosHotsiteSalvos.cnpj || '';
        if (inputCategoria && dadosHotsiteSalvos.categoria) inputCategoria.value = dadosHotsiteSalvos.categoria;
        if (inputCidade) inputCidade.value = dadosHotsiteSalvos.cidade || '';
        if (inputDescricao) inputDescricao.value = dadosHotsiteSalvos.descricao || '';
        if (inputEndereco) inputEndereco.value = dadosHotsiteSalvos.endereco || '';
        if (inputTel) inputTel.value = dadosHotsiteSalvos.tel || '';

        // Foto salva anteriormente (avatar)
        if (dadosHotsiteSalvos.foto && avatarDiv) {
            avatarDiv.style.backgroundImage = 'url(' + dadosHotsiteSalvos.foto + ')';
            avatarDiv.style.backgroundSize = 'cover';
            avatarDiv.style.backgroundPosition = 'center';
            avatarDiv.textContent = '';
            avatarDiv.dataset.base64 = dadosHotsiteSalvos.foto;
        } else if (avatarDiv && inputNome.value) {
            // Usa as iniciais do nome como placeholder
            var partes = inputNome.value.trim().split(/\s+/);
            var iniciais = '';
            if (partes.length >= 2) {
                iniciais = (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
            } else if (partes.length === 1 && partes[0].length > 0) {
                iniciais = partes[0].substring(0, 2).toUpperCase();
            }
            if (iniciais) avatarDiv.textContent = iniciais;
        }

        // 2. Máscara automática CPF/CNPJ (padrão Brasileiro)
        // Aceita 11 dígitos (CPF: 000.000.000-00) ou 14 dígitos (CNPJ: 00.000.000/0000-00)
        if (inputCnpj) {
            inputCnpj.setAttribute('maxlength', '18'); // 14 dígitos + 4 separadores
            inputCnpj.setAttribute('placeholder', '000.000.000-00 ou 00.000.000/0000-00');

            inputCnpj.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, '');

                // Limita a 14 dígitos (tamanho do CNPJ)
                if (v.length > 14) v = v.substring(0, 14);

                if (v.length <= 11) {
                    // Formatação de CPF: 000.000.000-00
                    v = v.replace(/^(\d{3})(\d)/, '$1.$2');
                    v = v.replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
                    v = v.replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
                } else {
                    // Formatação de CNPJ: 00.000.000/0000-00
                    v = v.replace(/^(\d{2})(\d)/, '$1.$2');
                    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
                    v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
                    v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
                }

                e.target.value = v;
            });
        }

        // 3. Ao selecionar uma imagem em "Gerenciar Galeria",
        //    usar a primeira imagem selecionada como avatar do prestador
        if (inputGaleria && avatarDiv) {
            inputGaleria.addEventListener('change', function (e) {
                var files = e.target.files;
                if (!files || files.length === 0) return;

                // Procura o primeiro arquivo de imagem
                var imagem = null;
                for (var i = 0; i < files.length; i++) {
                    if (files[i].type && files[i].type.indexOf('image/') === 0) {
                        imagem = files[i];
                        break;
                    }
                }
                if (!imagem) return;

                var reader = new FileReader();
                reader.onload = function (event) {
                    avatarDiv.style.backgroundImage = 'url(' + event.target.result + ')';
                    avatarDiv.style.backgroundSize = 'cover';
                    avatarDiv.style.backgroundPosition = 'center';
                    avatarDiv.textContent = '';
                    avatarDiv.dataset.base64 = event.target.result;
                };
                reader.readAsDataURL(imagem);
            });
        }

        // 4. Botão Salvar & Publicar
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                var dadosSalvar = {
                    nome: inputNome.value,
                    email: inputEmail.value,
                    cnpj: inputCnpj ? inputCnpj.value : '',
                    categoria: inputCategoria ? inputCategoria.value : '',
                    cidade: inputCidade ? inputCidade.value : '',
                    descricao: inputDescricao ? inputDescricao.value : '',
                    endereco: inputEndereco ? inputEndereco.value : '',
                    tel: inputTel ? inputTel.value : '',
                    foto: (avatarDiv && avatarDiv.dataset.base64) || dadosHotsiteSalvos.foto || ''
                };

                var store = {};
                try {
                    store = JSON.parse(localStorage.getItem(HOTSITE_STORAGE_KEY) || '{}');
                } catch (e) { store = {}; }

                store[emailLogado] = dadosSalvar;
                localStorage.setItem(HOTSITE_STORAGE_KEY, JSON.stringify(store));

                alert('Dados do Hot Site salvos e publicados com sucesso!');
            });
        }

        // 5. Botão Limpar (limpa tudo, exceto nome e e-mail)
        if (btnLimpar) {
            btnLimpar.addEventListener('click', function () {
                if (inputCnpj) inputCnpj.value = '';
                if (inputCategoria) inputCategoria.value = '';
                if (inputCidade) inputCidade.value = '';
                if (inputDescricao) inputDescricao.value = '';
                if (inputEndereco) inputEndereco.value = '';
                if (inputTel) inputTel.value = '';
                if (inputGaleria) inputGaleria.value = '';

                // Restaura avatar para as iniciais do nome
                if (avatarDiv) {
                    avatarDiv.style.backgroundImage = '';
                    var partes = (inputNome.value || '').trim().split(/\s+/);
                    var iniciais = '';
                    if (partes.length >= 2) {
                        iniciais = (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
                    } else if (partes.length === 1 && partes[0].length > 0) {
                        iniciais = partes[0].substring(0, 2).toUpperCase();
                    }
                    avatarDiv.textContent = iniciais || 'JC';
                    delete avatarDiv.dataset.base64;
                }
            });
        }
    }


    // =====================================================
    // FUNÇÃO: SINCRONIZAR SIDEBAR COM COLLAPSE (RESPONSIVIDADE)
    // -----------------------------------------------------
    // Em telas pequenas, o botão hambúrguer da navbar (que aciona
    // o collapse sobre #navbarNav) também controla a exibição das
    // sidebars — tanto do cliente (.cli-sidebar) quanto do
    // prestador (.prest-sidebar) — unificando o comportamento de
    // responsividade entre menus e sidebar, igual ao index.html.
    // =====================================================
    function inicializarSidebarResponsiva() {
        var navbarNav = document.getElementById('navbarNav');
        if (!navbarNav) return;

        var sidebars = document.querySelectorAll('.cli-sidebar, .prest-sidebar');
        if (!sidebars.length) return;

        navbarNav.addEventListener('show.bs.collapse', function () {
            sidebars.forEach(function (s) {
                s.classList.add('cli-sidebar-show');
                s.classList.add('prest-sidebar-show');
            });
        });

        navbarNav.addEventListener('hide.bs.collapse', function () {
            sidebars.forEach(function (s) {
                s.classList.remove('cli-sidebar-show');
                s.classList.remove('prest-sidebar-show');
            });
        });
    }


    // =====================================================
    // ÁREA EXCLUSIVA DO PRESTADOR (prestadorAreaExclusiva.html)
    // =====================================================
    function inicializarPrestadorAreaExclusiva() {
        var historicoLista = document.getElementById('prest-historico-lista');
        if (!historicoLista) return;

        var AVALIACOES_PREST_KEY = 'avaliacoesPrestadorSalvas';

        function obterAvaliacoes() {
            try { return JSON.parse(localStorage.getItem(AVALIACOES_PREST_KEY) || '[]'); }
            catch (e) { return []; }
        }
        function salvarAvaliacoes(arr) {
            localStorage.setItem(AVALIACOES_PREST_KEY, JSON.stringify(arr));
        }
        function obterAvaliacaoPorPedido(pedidoId) {
            return obterAvaliacoes().find(function (a) { return a.pedidoId === pedidoId; }) || null;
        }

        // --- Modal do próximo agendamento (link "Amanhã, 10:00h") ---
        var linkProximo = document.getElementById('link-proximo-agendamento');
        if (linkProximo) {
            linkProximo.addEventListener('click', function (e) {
                e.preventDefault();
                // Dados simulados do próximo agendamento confirmado
                var proximoAgendamento = {
                    titulo: document.getElementById('prest-proximo-titulo') ? document.getElementById('prest-proximo-titulo').textContent : 'Limpeza de Filtro',
                    dataHora: 'Amanhã, 10:00h',
                    cliente: 'Carlos Mendes',
                    local: 'Rua das Acácias, 45 — Centro',
                    status: 'Confirmado'
                };

                var conteudo =
                    '<table class="table table-bordered align-middle">' +
                    '<tbody>' +
                    '<tr><th>Serviço</th><td>' + proximoAgendamento.titulo + '</td></tr>' +
                    '<tr><th>Data / Hora</th><td>' + proximoAgendamento.dataHora + '</td></tr>' +
                    '<tr><th>Cliente</th><td>' + proximoAgendamento.cliente + '</td></tr>' +
                    '<tr><th>Local</th><td>' + proximoAgendamento.local + '</td></tr>' +
                    '<tr><th>Status</th><td><span class="badge" style="background:#28a745;">' + proximoAgendamento.status + '</span></td></tr>' +
                    '</tbody></table>';

                // Reutiliza a função criarModal se existir, senão cria diretamente
                var idModal = 'modalProximoAgendamento';
                var modalExistente = document.getElementById(idModal);
                if (modalExistente) modalExistente.remove();

                var modal = document.createElement('div');
                modal.className = 'modal fade';
                modal.id = idModal;
                modal.setAttribute('tabindex', '-1');
                modal.setAttribute('aria-hidden', 'true');
                modal.innerHTML =
                    '<div class="modal-dialog">' +
                        '<div class="modal-content">' +
                            '<div class="modal-header" style="background-color:#FFC300; color:#000;">' +
                                '<h5 class="modal-title"><i class="bi bi-calendar-check me-2"></i>Próximo Agendamento Confirmado</h5>' +
                                '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>' +
                            '</div>' +
                            '<div class="modal-body">' + conteudo + '</div>' +
                            '<div class="modal-footer">' +
                                '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>' +
                                '<a href="prestadorServicosAgendados.html" class="btn btn-warning"><i class="bi bi-calendar3 me-1"></i>Ver Todos os Agendamentos</a>' +
                            '</div>' +
                        '</div>' +
                    '</div>';

                document.body.appendChild(modal);
                new bootstrap.Modal(modal).show();
            });
        }

        // --- Interação de estrelas ---
        function initStarRating(container, hiddenInput) {
            if (!container || !hiddenInput) return;
            var stars = container.querySelectorAll('i');
            stars.forEach(function (star, index) {
                star.addEventListener('click', function () {
                    var nota = index + 1;
                    hiddenInput.value = nota;
                    stars.forEach(function (s, i) {
                        if (i < nota) { s.classList.remove('bi-star'); s.classList.add('bi-star-fill', 'filled'); s.style.color = '#ffc107'; }
                        else { s.classList.remove('bi-star-fill', 'filled'); s.classList.add('bi-star'); s.style.color = '#ccc'; }
                    });
                });
                star.addEventListener('mouseover', function () {
                    stars.forEach(function (s, i) { s.style.color = i <= index ? '#ffc107' : '#ccc'; });
                });
                star.addEventListener('mouseout', function () {
                    var current = parseInt(hiddenInput.value) || 0;
                    stars.forEach(function (s, i) { s.style.color = i < current ? '#ffc107' : '#ccc'; });
                });
            });
        }

        function renderizarEstrelas(container, hiddenInput, nota) {
            if (!container || !hiddenInput) return;
            var stars = container.querySelectorAll('i');
            stars.forEach(function (s, i) {
                if (i < nota) { s.classList.remove('bi-star'); s.classList.add('bi-star-fill', 'filled'); s.style.color = '#ffc107'; }
                else { s.classList.remove('bi-star-fill', 'filled'); s.classList.add('bi-star'); s.style.color = '#ccc'; }
            });
            hiddenInput.value = nota;
        }

        var starsAvaliarContainer  = document.getElementById('modal-prest-estrelas');
        var notaAvaliarInput       = document.getElementById('modal-prest-nota-valor');
        var starsEditarContainer   = document.getElementById('modal-prest-editar-estrelas');
        var notaEditarInput        = document.getElementById('modal-prest-editar-nota-valor');

        initStarRating(starsAvaliarContainer, notaAvaliarInput);
        initStarRating(starsEditarContainer, notaEditarInput);

        var pedidoAtual = null;

        // --- Botão AVALIAR ---
        historicoLista.querySelectorAll('.btn-prest-avaliar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.prest-historico-item');
                pedidoAtual = item.dataset.pedidoId;
                var av = obterAvaliacaoPorPedido(pedidoAtual);

                document.getElementById('modal-prest-avaliar-info').innerHTML =
                    '<strong>Serviço:</strong> ' + item.dataset.servico +
                    ' &nbsp;|&nbsp; <strong>Cliente:</strong> ' + item.dataset.cliente;

                if (starsAvaliarContainer) {
                    var stars = starsAvaliarContainer.querySelectorAll('i');
                    stars.forEach(function (s) { s.classList.remove('bi-star-fill','filled'); s.classList.add('bi-star'); s.style.color = '#ccc'; });
                }
                if (notaAvaliarInput) notaAvaliarInput.value = 0;
                var comentarioInput = document.getElementById('modal-prest-comentario');
                if (comentarioInput) comentarioInput.value = av ? av.comentario : '';
                if (av && av.nota) renderizarEstrelas(starsAvaliarContainer, notaAvaliarInput, av.nota);

                new bootstrap.Modal(document.getElementById('modalPrestAvaliar')).show();
            });
        });

        // --- Salvar nova avaliação ---
        var btnSalvar = document.getElementById('btn-prest-salvar-avaliacao');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                var nota = parseInt(notaAvaliarInput.value) || 0;
                var comentario = document.getElementById('modal-prest-comentario').value.trim();
                if (nota === 0) { alert('Por favor, selecione uma nota de 1 a 5!'); return; }
                if (!comentario) { alert('Por favor, escreva um comentário!'); return; }

                var item = historicoLista.querySelector('[data-pedido-id="' + pedidoAtual + '"]');
                var avaliacoes = obterAvaliacoes();
                var idx = avaliacoes.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                var hoje = new Date();
                var novaAv = {
                    id: pedidoAtual + '_' + Date.now(),
                    pedidoId: pedidoAtual,
                    servico: item.dataset.servico,
                    cliente: item.dataset.cliente,
                    nota: nota,
                    comentario: comentario,
                    data: hoje.toLocaleDateString('pt-BR')
                };
                if (idx >= 0) avaliacoes[idx] = novaAv; else avaliacoes.push(novaAv);
                salvarAvaliacoes(avaliacoes);
                bootstrap.Modal.getInstance(document.getElementById('modalPrestAvaliar')).hide();
                alert('Avaliação salva com sucesso!');
            });
        }

        // --- Botão EDITAR ---
        historicoLista.querySelectorAll('.btn-prest-editar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.prest-historico-item');
                pedidoAtual = item.dataset.pedidoId;
                var av = obterAvaliacaoPorPedido(pedidoAtual);
                if (!av) { alert('Nenhuma avaliação encontrada. Clique em "Avaliar" para criar uma.'); return; }

                document.getElementById('modal-prest-editar-info').innerHTML =
                    '<strong>Serviço:</strong> ' + av.servico +
                    ' &nbsp;|&nbsp; <strong>Cliente:</strong> ' + av.cliente;
                renderizarEstrelas(starsEditarContainer, notaEditarInput, av.nota);
                document.getElementById('modal-prest-editar-comentario').value = av.comentario;
                new bootstrap.Modal(document.getElementById('modalPrestEditar')).show();
            });
        });

        // --- Salvar edição ---
        var btnSalvarEdicao = document.getElementById('btn-prest-salvar-edicao');
        if (btnSalvarEdicao) {
            btnSalvarEdicao.addEventListener('click', function () {
                var nota = parseInt(notaEditarInput.value) || 0;
                var comentario = document.getElementById('modal-prest-editar-comentario').value.trim();
                if (nota === 0) { alert('Por favor, selecione uma nota de 1 a 5!'); return; }
                if (!comentario) { alert('Por favor, escreva um comentário!'); return; }
                var avaliacoes = obterAvaliacoes();
                var idx = avaliacoes.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                if (idx >= 0) { avaliacoes[idx].nota = nota; avaliacoes[idx].comentario = comentario; salvarAvaliacoes(avaliacoes); }
                bootstrap.Modal.getInstance(document.getElementById('modalPrestEditar')).hide();
                alert('Avaliação atualizada com sucesso!');
            });
        }

        // --- Botão EXCLUIR ---
        historicoLista.querySelectorAll('.btn-prest-excluir').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.prest-historico-item');
                var pedidoId = item.dataset.pedidoId;
                var av = obterAvaliacaoPorPedido(pedidoId);
                if (!av) { alert('Nenhuma avaliação encontrada para excluir.'); return; }
                if (confirm('Tem certeza que deseja excluir a avaliação de "' + av.servico + '"?')) {
                    var filtradas = obterAvaliacoes().filter(function (a) { return a.pedidoId !== pedidoId; });
                    salvarAvaliacoes(filtradas);
                    alert('Avaliação excluída com sucesso!');
                }
            });
        });
    }


    // =====================================================
    // AVALIAÇÕES FEITAS PELO PRESTADOR
    // (prestadorAvaliacoesFeitas.html)
    // -----------------------------------------------------
    // Mostra as avaliações que o PRESTADOR (usuário logado)
    // fez sobre seus clientes, com permissão de EDITAR e
    // EXCLUIR (mantendo a lógica já implementada na Área
    // Exclusiva do Prestador).
    // Fonte: localStorage 'avaliacoesPrestadorSalvas'.
    // =====================================================
    function inicializarAvaliacoesFeitasPrestador() {
        var container = document.getElementById('container-prest-avaliacoes-feitas');
        if (!container) return;

        var AVALIACOES_PREST_KEY = 'avaliacoesPrestadorSalvas';

        function obterAvaliacoes() {
            try { return JSON.parse(localStorage.getItem(AVALIACOES_PREST_KEY) || '[]'); }
            catch (e) { return []; }
        }
        function salvarAvaliacoes(arr) {
            localStorage.setItem(AVALIACOES_PREST_KEY, JSON.stringify(arr));
        }

        // Referências do modal de edição no HTML
        var modalEditar      = document.getElementById('modalPrestEditarFeita');
        var starsEditar      = document.getElementById('modal-prest-editar-feita-estrelas');
        var notaEditarInput  = document.getElementById('modal-prest-editar-feita-nota-valor');
        var comentarioInput  = document.getElementById('modal-prest-editar-feita-comentario');
        var infoDiv          = document.getElementById('modal-prest-editar-feita-info');
        var btnSalvarEdicao  = document.getElementById('btn-prest-salvar-edicao-feita');
        var pedidoIdAtual    = null;

        function initStarRating(containerStars, hiddenInput) {
            if (!containerStars || !hiddenInput) return;
            var stars = containerStars.querySelectorAll('i');
            stars.forEach(function (star, index) {
                star.addEventListener('click', function () {
                    var nota = index + 1;
                    hiddenInput.value = nota;
                    stars.forEach(function (s, i) {
                        if (i < nota) { s.classList.remove('bi-star'); s.classList.add('bi-star-fill', 'filled'); s.style.color = '#ffc107'; }
                        else { s.classList.remove('bi-star-fill', 'filled'); s.classList.add('bi-star'); s.style.color = '#ccc'; }
                    });
                });
                star.addEventListener('mouseover', function () {
                    stars.forEach(function (s, i) { s.style.color = i <= index ? '#ffc107' : '#ccc'; });
                });
                star.addEventListener('mouseout', function () {
                    var current = parseInt(hiddenInput.value) || 0;
                    stars.forEach(function (s, i) { s.style.color = i < current ? '#ffc107' : '#ccc'; });
                });
            });
        }

        function renderizarEstrelasFixas(containerStars, hiddenInput, nota) {
            if (!containerStars || !hiddenInput) return;
            var stars = containerStars.querySelectorAll('i');
            stars.forEach(function (s, i) {
                if (i < nota) { s.classList.remove('bi-star'); s.classList.add('bi-star-fill', 'filled'); s.style.color = '#ffc107'; }
                else { s.classList.remove('bi-star-fill', 'filled'); s.classList.add('bi-star'); s.style.color = '#ccc'; }
            });
            hiddenInput.value = nota;
        }

        initStarRating(starsEditar, notaEditarInput);

        function renderizarLista() {
            var cards = container.querySelectorAll('.review-card-reverse[data-pedido-id]');
            cards.forEach(function (c) { c.remove(); });

            var headerAntigo = container.querySelector('#header-prest-avaliacoes-feitas');
            if (headerAntigo) headerAntigo.remove();

            var msgAntiga = container.querySelector('#msg-sem-prest-avaliacoes-feitas');
            if (msgAntiga) msgAntiga.remove();

            var avaliacoes = obterAvaliacoes();
            var botaoBloco = container.querySelector('.d-flex.justify-content-center');

            var headerDiv = document.createElement('div');
            headerDiv.id = 'header-prest-avaliacoes-feitas';
            headerDiv.style.cssText = 'font-size:1rem; font-weight:700; color:var(--azul-principal,#146ADB); padding-bottom:8px; border-bottom:2px solid var(--azul-principal,#146ADB); margin-bottom:12px;';
            headerDiv.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107"></i>Minhas Avaliações Realizadas (aos Clientes)';
            container.insertBefore(headerDiv, botaoBloco || null);

            if (avaliacoes.length === 0) {
                var msg = document.createElement('div');
                msg.id = 'msg-sem-prest-avaliacoes-feitas';
                msg.className = 'text-center text-muted py-4';
                msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Você ainda não realizou nenhuma avaliação.';
                container.insertBefore(msg, botaoBloco || null);
                return;
            }

            var ordenadas = avaliacoes.slice().reverse();

            ordenadas.forEach(function (av) {
                var stars = '';
                for (var i = 1; i <= 5; i++) {
                    stars += i <= av.nota
                        ? '<i class="bi bi-star-fill filled" style="color:#ffc107"></i>'
                        : '<i class="bi bi-star" style="color:#ccc"></i>';
                }

                var card = document.createElement('div');
                card.className = 'review-card-reverse';
                card.dataset.pedidoId = av.pedidoId;
                card.innerHTML =
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        '<h5 class="mb-0">Cliente: ' + av.cliente + ' (' + av.servico + ')</h5>' +
                        '<span class="text-muted"><small>Data ' + av.data + '</small></span>' +
                    '</div>' +
                    '<div class="rating">' + stars +
                        '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6>' +
                    '</div>' +
                    '<p class="review-text">"' + av.comentario + '"</p>' +
                    '<button type="button" class="btn btn-danger btn-prest-excluir-feita" data-pedido-id="' + av.pedidoId + '">Excluir Avaliação</button> ' +
                    '<button type="button" class="btn btn-primary btn-prest-editar-feita" data-pedido-id="' + av.pedidoId + '">Editar</button>';

                container.insertBefore(card, botaoBloco || null);
            });
        }

        // Delegação de clique: Editar / Excluir
        container.addEventListener('click', function (e) {
            var btnEditar = e.target.closest('.btn-prest-editar-feita');
            var btnExcluir = e.target.closest('.btn-prest-excluir-feita');

            if (btnEditar) {
                pedidoIdAtual = btnEditar.dataset.pedidoId;
                var av = obterAvaliacoes().find(function (a) { return a.pedidoId === pedidoIdAtual; });
                if (!av) return;

                if (infoDiv) {
                    infoDiv.innerHTML =
                        '<strong>Serviço:</strong> ' + av.servico +
                        ' &nbsp;|&nbsp; <strong>Cliente:</strong> ' + av.cliente;
                }
                renderizarEstrelasFixas(starsEditar, notaEditarInput, av.nota);
                if (comentarioInput) comentarioInput.value = av.comentario;

                if (modalEditar) {
                    bootstrap.Modal.getOrCreateInstance(modalEditar).show();
                }
                return;
            }

            if (btnExcluir) {
                var pedidoIdExcluir = btnExcluir.dataset.pedidoId;
                var avaliacoesExc = obterAvaliacoes();
                var alvo = avaliacoesExc.find(function (a) { return a.pedidoId === pedidoIdExcluir; });
                if (!alvo) return;

                if (!confirm('Tem certeza que deseja excluir esta avaliação?')) return;

                var filtradas = avaliacoesExc.filter(function (a) { return a.pedidoId !== pedidoIdExcluir; });
                salvarAvaliacoes(filtradas);
                renderizarLista();
                alert('Avaliação excluída com sucesso!');
            }
        });

        // Salvar edição
        if (btnSalvarEdicao) {
            btnSalvarEdicao.addEventListener('click', function () {
                var nota = parseInt(notaEditarInput.value) || 0;
                var comentario = (comentarioInput.value || '').trim();

                if (nota === 0) { alert('Por favor, selecione uma nota de 1 a 5!'); return; }
                if (!comentario) { alert('Por favor, escreva um comentário!'); return; }

                var avaliacoes = obterAvaliacoes();
                var idx = avaliacoes.findIndex(function (a) { return a.pedidoId === pedidoIdAtual; });
                if (idx < 0) return;

                avaliacoes[idx].nota = nota;
                avaliacoes[idx].comentario = comentario;
                salvarAvaliacoes(avaliacoes);

                if (modalEditar) bootstrap.Modal.getInstance(modalEditar).hide();
                renderizarLista();
                alert('Avaliação atualizada com sucesso!');
            });
        }

        renderizarLista();
    }


    // =====================================================
    // AVALIAÇÕES RECEBIDAS PELO PRESTADOR
    // (prestadorAvaliacoesRecebidas.html)
    // -----------------------------------------------------
    // Mostra as avaliações que os CLIENTES fizeram sobre o
    // prestador (usuário logado). NESTA PÁGINA O PRESTADOR
    // NÃO PODE EDITAR NEM EXCLUIR — apenas visualizar.
    // Fonte: localStorage 'avaliacoesSalvas' (mesma chave
    // usada pelo cliente para avaliar prestadores), mesclada
    // com uma semente de demonstração.
    // =====================================================
    function inicializarAvaliacoesRecebidasPrestador() {
        var container = document.getElementById('container-prest-avaliacoes-recebidas');
        if (!container) return;

        // As avaliações que o cliente faz são salvas em 'avaliacoesSalvas'
        // (chave existente em inicializarClienteAreaExclusiva/inicializarAvaliacoesFeitas)
        var AVALIACOES_CLIENTE_KEY = 'avaliacoesSalvas';
        // Semente opcional, caso o prestador queira ver exemplos
        var SEMENTE_REC_PREST_KEY  = 'avaliacoesRecebidasPrestadorSemente';

        (function semearSeNecessario() {
            if (localStorage.getItem(SEMENTE_REC_PREST_KEY) !== null) return;
            var demo = [
                {
                    id: 'rec-prest-1',
                    prestador: 'Pedro S.',
                    servico: 'Montador de Móveis',
                    nota: 5,
                    comentario: 'O serviço de jardinagem foi impecável! O Sr. João é muito profissional, pontual e deixou meu jardim maravilhoso. Recomendo 100%!',
                    data: '01/01/2023'
                },
                {
                    id: 'rec-prest-2',
                    prestador: 'Maria P.',
                    servico: 'Pintura',
                    nota: 5,
                    comentario: 'Pintura do apartamento feita com perfeição! A Maria é detalhista, organizada e entregou tudo no prazo combinado. Ótima profissional!',
                    data: '01/01/2023'
                },
                {
                    id: 'rec-prest-3',
                    prestador: 'Marcos',
                    servico: 'Eletricista',
                    nota: 5,
                    comentario: 'Contratei o Marcos para manutenção elétrica. Rápido, honesto e resolveu o problema de forma definitiva. Excelente atendimento!',
                    data: '01/01/2023'
                }
            ];
            localStorage.setItem(SEMENTE_REC_PREST_KEY, JSON.stringify(demo));
        })();

        function obterAvaliacoesRecebidas() {
            var lista = [];
            try {
                // Avaliações reais feitas pelos clientes na Área Exclusiva
                var feitasCli = JSON.parse(localStorage.getItem(AVALIACOES_CLIENTE_KEY) || '[]');
                feitasCli.forEach(function (a) {
                    lista.push({
                        id: a.id || a.pedidoId,
                        prestador: a.profissional || a.cliente || 'Cliente',
                        servico: a.servico || 'Serviço',
                        nota: a.nota,
                        comentario: a.comentario,
                        data: a.data
                    });
                });
            } catch (e) { /* ignora */ }

            try {
                var demo = JSON.parse(localStorage.getItem(SEMENTE_REC_PREST_KEY) || '[]');
                demo.forEach(function (d) { lista.push(d); });
            } catch (e) { /* ignora */ }

            return lista;
        }

        function renderizarLista() {
            // Limpa cards existentes
            var cards = container.querySelectorAll('.review-card-reverse[data-recebida-id]');
            cards.forEach(function (c) { c.remove(); });

            var headerAntigo = container.querySelector('#header-prest-avaliacoes-recebidas');
            if (headerAntigo) headerAntigo.remove();

            var msgAntiga = container.querySelector('#msg-sem-prest-avaliacoes-recebidas');
            if (msgAntiga) msgAntiga.remove();

            var avaliacoes = obterAvaliacoesRecebidas();
            var botaoBloco = container.querySelector('.d-flex.justify-content-center');

            var headerDiv = document.createElement('div');
            headerDiv.id = 'header-prest-avaliacoes-recebidas';
            headerDiv.style.cssText = 'font-size:1rem; font-weight:700; color:var(--azul-principal,#146ADB); padding-bottom:8px; border-bottom:2px solid var(--azul-principal,#146ADB); margin-bottom:12px;';
            headerDiv.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107"></i>Avaliações Recebidas dos Clientes';
            container.insertBefore(headerDiv, botaoBloco || null);

            if (avaliacoes.length === 0) {
                var msg = document.createElement('div');
                msg.id = 'msg-sem-prest-avaliacoes-recebidas';
                msg.className = 'text-center text-muted py-4';
                msg.innerHTML = '<i class="bi bi-info-circle me-2"></i>Você ainda não recebeu avaliações de clientes.';
                container.insertBefore(msg, botaoBloco || null);
                return;
            }

            var ordenadas = avaliacoes.slice().reverse();

            ordenadas.forEach(function (av) {
                var stars = '';
                for (var i = 1; i <= 5; i++) {
                    stars += i <= av.nota
                        ? '<i class="bi bi-star-fill filled" style="color:#ffc107"></i>'
                        : '<i class="bi bi-star" style="color:#ccc"></i>';
                }

                var card = document.createElement('div');
                card.className = 'review-card-reverse';
                card.dataset.recebidaId = av.id;
                // SEM botões de editar/excluir — apenas visualização
                card.innerHTML =
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        '<h5 class="mb-0">Cliente: ' + av.prestador + ' (' + av.servico + ')</h5>' +
                        '<span class="text-muted"><small>Data ' + (av.data || '-') + '</small></span>' +
                    '</div>' +
                    '<div class="rating">' + stars +
                        '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6>' +
                    '</div>' +
                    '<p class="review-text">"' + av.comentario + '"</p>';

                container.insertBefore(card, botaoBloco || null);
            });
        }

        renderizarLista();
    }


    // =========================================================
    // PRESTADOR — SERVIÇOS AGENDADOS (SPA com 3 abas + modais)
    // ---------------------------------------------------------
    // Esta função controla a página prestadorServicosAgendados.html.
    // O que faz:
    //   • Alterna entre as 3 abas via JS (Próximos, Pendentes, Histórico)
    //   • Na aba Histórico, exibe filtro por período (De/Até)
    //   • Modal "Detalhes" mostra lembretes, observações e dados do agendamento
    //   • Modal "Cancelar/Rejeitar" pede motivo (quadro de opções) e
    //     registra: cancelamento + aviso ao cliente + solicitação de reagendamento
    //   • Modal "Ver Nota" mostra a avaliação que o cliente deixou
    //
    // Persistência: localStorage
    //   • 'prestAgendamentos'         — base de agendamentos do prestador
    //   • 'prestAvisosAoCliente'      — avisos/notificações enviadas ao cliente
    //   • 'prestSolicitacoesReagend'  — solicitações de reagendamento criadas
    // =========================================================
    function inicializarPrestadorServicosAgendados() {
        var containerLista = document.getElementById('agenda-lista');
        var containerAbas  = document.getElementById('agenda-abas');
        if (!containerLista || !containerAbas) return;

        // Identifica o prestador logado para usar chave personalizada de agendamentos
        var _usuLogadoPrest = null;
        try { _usuLogadoPrest = JSON.parse(localStorage.getItem('usuarioLogado') || 'null'); } catch (e) {}
        var _emailPrestLogado = (_usuLogadoPrest && _usuLogadoPrest.tipo === 'prestador')
            ? _usuLogadoPrest.email
            : 'prestador@servgo.com';

        var AGENDAMENTOS_KEY  = 'agendamentos_' + _emailPrestLogado;
        var AVISOS_KEY        = 'prestAvisosAoCliente';
        var SOLICITACOES_KEY  = 'prestSolicitacoesReagend';

        // -----------------------------------------------------------------
        // SEED — popula dados de demonstração apenas no 1º acesso
        // (Em produção, esses dados viriam de uma API/banco.)
        // -----------------------------------------------------------------
        function semearAgendamentosSeNecessario() {
            var existente = localStorage.getItem(AGENDAMENTOS_KEY);
            // Migração: se existir dado na chave legada, migra para a chave por email
            if (!existente) {
                var legado = localStorage.getItem('prestAgendamentos');
                if (legado) {
                    localStorage.setItem(AGENDAMENTOS_KEY, legado);
                    existente = legado;
                }
            }
            if (existente) return;

            var hoje = new Date();
            function dataRelativa(diasOffset) {
                var d = new Date(hoje);
                d.setDate(d.getDate() + diasOffset);
                return d.toISOString().substring(0, 10); // YYYY-MM-DD
            }
            function formatarLabelDia(diasOffset) {
                if (diasOffset === 0) return 'Hoje';
                if (diasOffset === 1) return 'Amanhã';
                var d = new Date(hoje);
                d.setDate(d.getDate() + diasOffset);
                var diasSem = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
                var meses  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                return diasSem[d.getDay()] + ', ' + String(d.getDate()).padStart(2,'0') + '/' + meses[d.getMonth()];
            }

            var base = [
                // PRÓXIMOS (confirmados ou agendados no futuro)
                {
                    id: 'ag-001', status: 'confirmado', aba: 'proximos',
                    data: dataRelativa(0),  diaLabel: formatarLabelDia(0),  horario: '14:00 - 17:00',
                    cliente: 'Maria da Silva', telefone: '(18) 99123-4567',
                    servico: 'Montagem de Estante',
                    endereco: 'Rua das Flores, 123 - Centro',
                    valor: 180.00, formaPagamento: 'PIX',
                    observacoes: 'Cliente pediu para trazer parafusos extras. A estante é da Tok&Stok modelo Alfa.',
                    lembretes: [
                        'Levar chave de fenda Phillips + furadeira',
                        'Confirmar presença 1h antes via WhatsApp',
                        'Cliente mora no 3º andar sem elevador'
                    ]
                },
                {
                    id: 'ag-003', status: 'confirmado', aba: 'proximos',
                    data: dataRelativa(3),  diaLabel: formatarLabelDia(3),  horario: '10:00 - 12:00',
                    cliente: 'Ana Lúcia', telefone: '(18) 98876-5432',
                    servico: 'Restauração de Móvel Antigo',
                    endereco: 'Bairro Nobre, 330',
                    valor: 450.00, formaPagamento: 'Dinheiro',
                    observacoes: 'Móvel é da família há 60 anos — cliente pediu muito cuidado.',
                    lembretes: [
                        'Verificar se há tinta específica para madeira de lei',
                        'Levar lixa 220 e verniz fosco'
                    ]
                },
                {
                    id: 'ag-004', status: 'confirmado', aba: 'proximos',
                    data: dataRelativa(5),  diaLabel: formatarLabelDia(5),  horario: '15:00 - 16:30',
                    cliente: 'João Pereira', telefone: '(18) 99555-1010',
                    servico: 'Instalação de Chuveiro Elétrico',
                    endereco: 'Rua Belo Horizonte, 88 - Jardim América',
                    valor: 120.00, formaPagamento: 'Cartão de crédito',
                    observacoes: 'Já tem o chuveiro — só precisa instalar.',
                    lembretes: ['Confirmar bitola do disjuntor antes de ir']
                },
                // PENDENTES (aguardando confirmação do prestador)
                {
                    id: 'ag-002', status: 'pendente', aba: 'pendentes',
                    data: dataRelativa(1),  diaLabel: formatarLabelDia(1),  horario: '09:00 - 11:00',
                    cliente: 'Pedro Souza', telefone: '(18) 97777-2222',
                    servico: 'Pequeno Reparo na Porta',
                    endereco: 'Av. Principal, 500 - Vila Nova',
                    valor: 90.00, formaPagamento: 'PIX',
                    observacoes: 'Porta de madeira empenando — cliente acha que pode ser a dobradiça.',
                    lembretes: ['Levar dobradiças reserva', 'Levar plaina manual']
                },
                // HISTÓRICO (concluídos no passado)
                {
                    id: 'ag-h01', status: 'concluido', aba: 'historico',
                    data: dataRelativa(-8),  diaLabel: formatarLabelDia(-8),  horario: '08:00 - 13:00',
                    cliente: 'Fábio Mello', telefone: '(18) 99111-3344',
                    servico: 'Instalação de Prateleiras (5)',
                    endereco: 'Condomínio Residencial',
                    valor: 280.00, formaPagamento: 'PIX',
                    observacoes: 'Serviço concluído com êxito.',
                    lembretes: [],
                    avaliacao: {
                        nota: 5,
                        comentario: 'Excelente profissional! Pontual, caprichoso e muito simpático. Super indico!',
                        dataAvaliacao: dataRelativa(-7)
                    }
                },
                {
                    id: 'ag-h02', status: 'concluido', aba: 'historico',
                    data: dataRelativa(-15), diaLabel: formatarLabelDia(-15), horario: '14:00 - 16:00',
                    cliente: 'Juliana Ribeiro', telefone: '(18) 98222-5566',
                    servico: 'Troca de Tomadas (3)',
                    endereco: 'Rua Acácia, 17',
                    valor: 95.00, formaPagamento: 'Dinheiro',
                    observacoes: 'Tomadas queimadas após raio.',
                    lembretes: [],
                    avaliacao: {
                        nota: 4,
                        comentario: 'Muito bom atendimento, atrasou uns 15 minutos mas fez um ótimo trabalho.',
                        dataAvaliacao: dataRelativa(-14)
                    }
                },
                {
                    id: 'ag-h03', status: 'concluido', aba: 'historico',
                    data: dataRelativa(-30), diaLabel: formatarLabelDia(-30), horario: '09:00 - 12:00',
                    cliente: 'Roberto Alves', telefone: '(18) 97333-7788',
                    servico: 'Montagem de Guarda-roupa',
                    endereco: 'Av. Brasil, 2400',
                    valor: 220.00, formaPagamento: 'Cartão de crédito',
                    observacoes: 'Guarda-roupa de 6 portas.',
                    lembretes: [],
                    avaliacao: null // ainda não avaliado
                },
                {
                    id: 'ag-h04', status: 'cancelado', aba: 'historico',
                    data: dataRelativa(-45), diaLabel: formatarLabelDia(-45), horario: '10:00 - 11:00',
                    cliente: 'Beatriz Nunes', telefone: '(18) 99444-9090',
                    servico: 'Pintura de Parede Pequena',
                    endereco: 'Rua Central, 77',
                    valor: 0,
                    motivoCancelamento: 'Condições climáticas desfavoráveis',
                    observacoes: 'Cancelado devido à chuva forte no dia.',
                    lembretes: [],
                    avaliacao: null
                }
            ];

            localStorage.setItem(AGENDAMENTOS_KEY, JSON.stringify(base));
        }

        function obterAgendamentos() {
            try { return JSON.parse(localStorage.getItem(AGENDAMENTOS_KEY) || '[]'); }
            catch (e) { return []; }
        }
        function salvarAgendamentos(arr) {
            localStorage.setItem(AGENDAMENTOS_KEY, JSON.stringify(arr));
        }

        function registrarAvisoAoCliente(aviso) {
            var lista = [];
            try { lista = JSON.parse(localStorage.getItem(AVISOS_KEY) || '[]'); } catch (e) {}
            lista.push(aviso);
            localStorage.setItem(AVISOS_KEY, JSON.stringify(lista));
        }
        function registrarSolicitacaoReagendamento(solicitacao) {
            var lista = [];
            try { lista = JSON.parse(localStorage.getItem(SOLICITACOES_KEY) || '[]'); } catch (e) {}
            lista.push(solicitacao);
            localStorage.setItem(SOLICITACOES_KEY, JSON.stringify(lista));
        }

        // -----------------------------------------------------------------
        // RENDERIZAÇÃO
        // -----------------------------------------------------------------
        var abaAtiva = 'proximos';      // 'proximos' | 'pendentes' | 'historico'
        var filtroDataInicio = null;    // string YYYY-MM-DD
        var filtroDataFim    = null;    // string YYYY-MM-DD

        function atualizarContadores() {
            var ags = obterAgendamentos();
            var prox = ags.filter(function (a) { return a.aba === 'proximos';  }).length;
            var pend = ags.filter(function (a) { return a.aba === 'pendentes'; }).length;
            var hist = ags.filter(function (a) { return a.aba === 'historico'; }).length;
            var cProx = document.getElementById('contador-proximos');
            var cPend = document.getElementById('contador-pendentes');
            var cHist = document.getElementById('contador-historico');
            if (cProx) cProx.textContent = prox;
            if (cPend) cPend.textContent = pend;
            if (cHist) cHist.textContent = hist;
        }

        function formatarDataBR(iso) {
            if (!iso) return '';
            var partes = iso.split('-');
            if (partes.length !== 3) return iso;
            return partes[2] + '/' + partes[1] + '/' + partes[0];
        }

        function filtrarAgendamentosDaAba() {
            var ags = obterAgendamentos().filter(function (a) { return a.aba === abaAtiva; });

            // Filtro por período — aplicável SOMENTE no histórico
            if (abaAtiva === 'historico' && (filtroDataInicio || filtroDataFim)) {
                ags = ags.filter(function (a) {
                    if (filtroDataInicio && a.data < filtroDataInicio) return false;
                    if (filtroDataFim    && a.data > filtroDataFim)    return false;
                    return true;
                });
            }

            // Ordena: próximos/pendentes em ordem crescente, histórico em ordem decrescente
            ags.sort(function (a, b) {
                if (abaAtiva === 'historico') return a.data < b.data ? 1 : -1;
                return a.data > b.data ? 1 : -1;
            });

            return ags;
        }

        function renderizarLista() {
            containerLista.innerHTML = '';
            var ags = filtrarAgendamentosDaAba();

            if (ags.length === 0) {
                var vazio = document.createElement('li');
                vazio.className = 'agenda-lista-vazia';
                var mensagem = 'Nenhum agendamento encontrado.';
                if (abaAtiva === 'proximos')  mensagem = 'Você não tem agendamentos futuros no momento.';
                if (abaAtiva === 'pendentes') mensagem = 'Nenhuma solicitação pendente de confirmação.';
                if (abaAtiva === 'historico') {
                    mensagem = (filtroDataInicio || filtroDataFim)
                        ? 'Nenhum agendamento encontrado no período selecionado.'
                        : 'Nenhum serviço no histórico.';
                }
                vazio.innerHTML = '<i class="bi bi-calendar-x"></i>' + mensagem;
                containerLista.appendChild(vazio);
                return;
            }

            ags.forEach(function (ag) { containerLista.appendChild(criarItemLista(ag)); });
        }

        function criarItemLista(ag) {
            var li = document.createElement('li');
            li.className = 'agenda-prest-item';
            li.dataset.agendamentoId = ag.id;

            // Coluna 1: Dia / Horário
            var col1 = document.createElement('div');
            col1.innerHTML =
                '<div class="agenda-slot-dia">'   + (ag.diaLabel || formatarDataBR(ag.data)) + '</div>' +
                '<div class="agenda-slot-tempo">' + ag.horario + '</div>';

            // Coluna 2: Cliente / Serviço / Local
            var col2 = document.createElement('div');
            col2.innerHTML =
                '<div class="agenda-cliente-nome">' + ag.cliente + '</div>' +
                '<p class="agenda-cliente-servico">Serviço: ' + ag.servico + '</p>' +
                '<p class="agenda-cliente-local"><i class="bi bi-geo-alt me-1"></i>' + ag.endereco + '</p>';

            // Coluna 3: Status + botões de ação
            var col3 = document.createElement('div');
            col3.className = 'agenda-status-area';
            col3.innerHTML = construirBotoesStatus(ag);

            li.appendChild(col1);
            li.appendChild(col2);
            li.appendChild(col3);

            // Handlers dos botões (delegação local)
            li.querySelectorAll('[data-acao]').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    var acao = btn.dataset.acao;
                    tratarAcaoAgendamento(acao, ag);
                });
            });

            return li;
        }

        function construirBotoesStatus(ag) {
            var tagClass = 'confirmado';
            var tagTexto = 'Confirmado';
            if (ag.status === 'pendente')  { tagClass = 'pendente';  tagTexto = 'Pendente';  }
            if (ag.status === 'concluido') { tagClass = 'concluido'; tagTexto = 'Concluído'; }
            if (ag.status === 'cancelado') { tagClass = 'cancelado'; tagTexto = 'Cancelado'; }

            var html = '<span class="agenda-status-tag ' + tagClass + '">' + tagTexto + '</span>';
            html += '<div class="agenda-botoes">';

            // Conta mensagens não lidas desta conversa (enviadas pelo cliente).
            // Se houver, acrescentamos um pequeno sininho vermelho ao lado do ícone do chat,
            // indicando que esse agendamento TEM mensagens que o prestador ainda não viu.
            var naoLidas = contarNaoLidasDoCliente(ag);
            var sinoHtml = (naoLidas > 0)
                ? '<span class="agenda-btn-sino" title="' + naoLidas + ' mensagem(ns) não lida(s)">' +
                      '<i class="bi bi-bell-fill"></i>' +
                  '</span>'
                : '';

            if (ag.status === 'confirmado') {
                html += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
                html += '<a href="#" class="agenda-btn chat" data-acao="chat"><i class="bi bi-chat-dots me-1"></i>Mensagens' + sinoHtml + '</a>';
                html += '<a href="#" class="agenda-btn cancelar" data-acao="cancelar"><i class="bi bi-x me-1"></i>Cancelar</a>';
            } else if (ag.status === 'pendente') {
                html += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
                html += '<a href="#" class="agenda-btn chat" data-acao="chat"><i class="bi bi-chat-dots me-1"></i>Mensagens' + sinoHtml + '</a>';
                html += '<a href="#" class="agenda-btn confirmar" data-acao="confirmar"><i class="bi bi-check me-1"></i>Confirmar</a>';
                html += '<a href="#" class="agenda-btn cancelar" data-acao="rejeitar"><i class="bi bi-x me-1"></i>Rejeitar</a>';
            } else if (ag.status === 'concluido') {
                html += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
                html += '<a href="#" class="agenda-btn" data-acao="ver-nota"><i class="bi bi-file-text me-1"></i>Ver Nota</a>';
            } else if (ag.status === 'cancelado') {
                html += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
            }

            html += '</div>';
            return html;
        }

        // ---------------------------------------------------------------
        // CONTAGEM DE MENSAGENS NÃO LIDAS — LADO PRESTADOR
        // ---------------------------------------------------------------
        // Estrutura espelho da lógica da área do cliente. Controlamos aqui
        // quantas mensagens do CLIENTE chegaram após a última vez que o
        // prestador abriu o modal de chat daquela conversa.
        //
        // Convenção de chaves:
        //   prestChatMensagens_<prestadorId>_<clienteId>        → histórico
        //   prestChatUltimaLeituraPrest_<prestadorId>_<clienteId> → última leitura pelo prestador
        var CHAT_LEITURA_PREFIX_PREST = 'prestChatUltimaLeituraPrest_';

        function contarNaoLidasDoCliente(ag) {
            var clienteId = obterClienteIdDoAgendamento(ag);
            if (!clienteId) return 0;

            var chaveHist    = CHAT_MSGS_PREFIX + CHAT_PREST_ID + '_' + clienteId;
            var chaveLeitura = CHAT_LEITURA_PREFIX_PREST + CHAT_PREST_ID + '_' + clienteId;

            var mensagens = [];
            try {
                var raw = localStorage.getItem(chaveHist);
                if (raw) mensagens = JSON.parse(raw) || [];
            } catch (e) { mensagens = []; }

            var ultimaLeitura = null;
            try { ultimaLeitura = localStorage.getItem(chaveLeitura); } catch (e) {}

            return mensagens.filter(function (m) {
                if (m.remetente !== 'cliente') return false; // só contam mensagens DO cliente
                if (!ultimaLeitura) return true;             // nunca leu → tudo é não lida
                return m.data > ultimaLeitura;
            }).length;
        }

        // Marca a conversa desse agendamento como lida pelo prestador (agora)
        function marcarConversaComoLidaPrest(ag) {
            var clienteId = obterClienteIdDoAgendamento(ag);
            if (!clienteId) return;
            try {
                localStorage.setItem(
                    CHAT_LEITURA_PREFIX_PREST + CHAT_PREST_ID + '_' + clienteId,
                    new Date().toISOString()
                );
            } catch (e) { /* silencioso */ }
        }

        // Soma o total de mensagens não lidas em TODAS as conversas. Usado para decidir
        // se o aviso "Você possui mensagens não lidas" é exibido ao lado das abas.
        function totalMsgsNaoLidasPrestador() {
            var ags = obterAgendamentos();
            var total = 0;
            ags.forEach(function (ag) { total += contarNaoLidasDoCliente(ag); });
            return total;
        }

        function atualizarAvisoMsgsNaoLidasPrest() {
            var aviso = document.getElementById('agenda-aviso-msgs-nao-lidas');
            if (!aviso) return;
            aviso.style.display = (totalMsgsNaoLidasPrestador() > 0) ? '' : 'none';
        }

        // -----------------------------------------------------------------
        // TROCA DE ABA
        // -----------------------------------------------------------------
        function ativarAba(nomeAba) {
            abaAtiva = nomeAba;

            containerAbas.querySelectorAll('a[data-aba]').forEach(function (link) {
                var ativa = link.dataset.aba === nomeAba;
                link.classList.toggle('nav-link-active', ativa);
                link.classList.toggle('agenda-aba-ativa', ativa);
            });

            // Mostra/esconde filtro de período (somente no histórico)
            var filtroBox = document.getElementById('agenda-filtro-periodo');
            if (filtroBox) filtroBox.style.display = (nomeAba === 'historico') ? 'block' : 'none';

            renderizarLista();
        }

        containerAbas.querySelectorAll('a[data-aba]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                ativarAba(link.dataset.aba);
            });
        });

        // -----------------------------------------------------------------
        // FILTRO POR PERÍODO (Histórico)
        // -----------------------------------------------------------------
        var btnFiltrar = document.getElementById('btn-filtrar-historico');
        var btnLimpar  = document.getElementById('btn-limpar-filtro');
        var inputInicio = document.getElementById('filtro-data-inicio');
        var inputFim    = document.getElementById('filtro-data-fim');
        var filtroInfo  = document.getElementById('filtro-info-periodo');

        if (btnFiltrar) {
            btnFiltrar.addEventListener('click', function () {
                filtroDataInicio = inputInicio && inputInicio.value ? inputInicio.value : null;
                filtroDataFim    = inputFim    && inputFim.value    ? inputFim.value    : null;

                if (filtroDataInicio && filtroDataFim && filtroDataInicio > filtroDataFim) {
                    alert('A data inicial não pode ser maior que a data final.');
                    return;
                }

                if (filtroInfo) {
                    if (filtroDataInicio || filtroDataFim) {
                        filtroInfo.innerHTML =
                            '<i class="bi bi-funnel-fill me-1"></i>Exibindo agendamentos de ' +
                            (filtroDataInicio ? formatarDataBR(filtroDataInicio) : 'início') +
                            ' até ' +
                            (filtroDataFim    ? formatarDataBR(filtroDataFim)    : 'hoje');
                    } else {
                        filtroInfo.textContent = '';
                    }
                }
                renderizarLista();
            });
        }
        if (btnLimpar) {
            btnLimpar.addEventListener('click', function () {
                filtroDataInicio = null;
                filtroDataFim    = null;
                if (inputInicio) inputInicio.value = '';
                if (inputFim)    inputFim.value    = '';
                if (filtroInfo)  filtroInfo.textContent = '';
                renderizarLista();
            });
        }

        // -----------------------------------------------------------------
        // DESPACHO DE AÇÕES (Detalhes / Cancelar / Rejeitar / Ver Nota / Confirmar)
        // -----------------------------------------------------------------
        function tratarAcaoAgendamento(acao, ag) {
            switch (acao) {
                case 'detalhes':  abrirModalDetalhes(ag); break;
                case 'cancelar':  abrirModalCancelamento(ag, 'cancelar'); break;
                case 'rejeitar':  abrirModalCancelamento(ag, 'rejeitar'); break;
                case 'ver-nota':  abrirModalVerNota(ag);  break;
                case 'confirmar': confirmarAgendamento(ag); break;
                case 'chat':      abrirModalChat(ag); break;
            }
        }

        // -----------------------------------------------------------------
        // MODAL: DETALHES
        // -----------------------------------------------------------------
        function abrirModalDetalhes(ag) {
            var corpo = document.getElementById('modal-detalhes-corpo');
            if (!corpo) return;

            var podEditar = (ag.status === 'confirmado' || ag.status === 'pendente');

            // Lembretes: editáveis se status permitir
            var lembretesHtml = '';
            if (podEditar) {
                var lemItens = (ag.lembretes && ag.lembretes.length > 0)
                    ? ag.lembretes.map(function (l, i) {
                        return '<div class="agenda-lembrete-edit-row" style="display:flex;gap:6px;margin-bottom:6px;">' +
                            '<input type="text" class="form-control form-control-sm agenda-lembrete-input" value="' + l.replace(/"/g,'&quot;') + '" style="flex:1;">' +
                            '<button type="button" class="btn btn-sm btn-outline-danger agenda-lembrete-del" data-idx="' + i + '" title="Remover"><i class="bi bi-trash"></i></button>' +
                        '</div>';
                    }).join('')
                    : '';
                lembretesHtml =
                    '<div id="agenda-lembretes-lista">' + lemItens + '</div>' +
                    '<button type="button" class="btn btn-sm btn-outline-secondary mt-1" id="btn-add-lembrete">' +
                        '<i class="bi bi-plus-circle me-1"></i>Adicionar Lembrete' +
                    '</button>';
            } else {
                lembretesHtml = (ag.lembretes && ag.lembretes.length > 0)
                    ? ag.lembretes.map(function (l) {
                        return '<div class="agenda-detalhe-lembrete"><i class="bi bi-bell me-2"></i>' + l + '</div>';
                    }).join('')
                    : '<em class="text-muted">Nenhum lembrete registrado.</em>';
            }

            // Observações: editáveis se status permitir
            var observacaoHtml = '';
            if (podEditar) {
                observacaoHtml =
                    '<textarea id="agenda-obs-textarea" class="form-control form-control-sm" rows="3" style="resize:vertical;">' +
                    (ag.observacoes || '') + '</textarea>';
            } else {
                observacaoHtml = ag.observacoes
                    ? '<div class="agenda-detalhe-observacao"><i class="bi bi-chat-left-text me-2"></i>' + ag.observacoes + '</div>'
                    : '<em class="text-muted">Sem observações.</em>';
            }

            var statusTag = '<span class="agenda-status-tag ' + ag.status + '">' +
                            ag.status.charAt(0).toUpperCase() + ag.status.slice(1) + '</span>';

            var valorFormatado = (typeof ag.valor === 'number' && ag.valor > 0)
                ? 'R$ ' + ag.valor.toFixed(2).replace('.', ',')
                : '—';

            // Botão Ver Perfil do Cliente
            var btnVerPerfilHtml =
                '<div style="margin-top:8px;">' +
                    '<a href="' + (window.location.pathname.includes('/paginasPrestador/') ? '../' : '') + 'paginasCliente/clientePerfil.html' +
                        (ag.clienteEmail ? '?cliente=' + encodeURIComponent(ag.clienteEmail) : '') +
                        '" class="btn btn-sm btn-outline-info" target="_blank">' +
                        '<i class="bi bi-person-badge me-1"></i>Ver Perfil do Cliente' +
                    '</a>' +
                '</div>';

            corpo.innerHTML =
                '<div class="agenda-detalhe-secao">' +
                    '<h6><i class="bi bi-person-circle me-1"></i>Dados do Cliente</h6>' +
                    '<div class="agenda-detalhe-grid">' +
                        '<div><strong>Nome</strong><span>' + ag.cliente + '</span></div>' +
                        '<div><strong>Telefone</strong><span>' + (ag.telefone || '—') + '</span></div>' +
                    '</div>' +
                    btnVerPerfilHtml +
                '</div>' +
                '<div class="agenda-detalhe-secao">' +
                    '<h6><i class="bi bi-calendar-event me-1"></i>Serviço Agendado</h6>' +
                    '<div class="agenda-detalhe-grid">' +
                        '<div><strong>Serviço</strong><span>' + ag.servico + '</span></div>' +
                        '<div><strong>Status</strong><span>' + statusTag + '</span></div>' +
                        '<div><strong>Data</strong><span>' + formatarDataBR(ag.data) + '</span></div>' +
                        '<div><strong>Horário</strong><span>' + ag.horario + '</span></div>' +
                        '<div style="grid-column: 1/-1;"><strong>Endereço</strong><span><i class="bi bi-geo-alt me-1"></i>' + ag.endereco + '</span></div>' +
                        '<div><strong>Valor</strong><span>' + valorFormatado + '</span></div>' +
                        '<div><strong>Forma de Pagamento</strong><span>' + (ag.formaPagamento || '—') + '</span></div>' +
                    '</div>' +
                '</div>' +
                '<div class="agenda-detalhe-secao" id="secao-lembretes">' +
                    '<h6><i class="bi bi-bell me-1"></i>Lembretes ' +
                    (podEditar ? '<small class="text-muted fw-normal">(editável)</small>' : '') + '</h6>' +
                    lembretesHtml +
                '</div>' +
                '<div class="agenda-detalhe-secao" id="secao-observacoes">' +
                    '<h6><i class="bi bi-chat-left-text me-1"></i>Observações ' +
                    (podEditar ? '<small class="text-muted fw-normal">(editável)</small>' : '') + '</h6>' +
                    observacaoHtml +
                '</div>' +
                (ag.motivoCancelamento
                    ? '<div class="agenda-detalhe-secao">' +
                        '<h6 style="color:#991b1b;"><i class="bi bi-x-circle me-1"></i>Motivo do Cancelamento</h6>' +
                        '<div class="agenda-detalhe-observacao" style="background:#fee2e2; border-left-color:#dc3545;">' + ag.motivoCancelamento + '</div>' +
                      '</div>'
                    : '');

            // Botão Salvar no rodapé do modal (só se editável)
            var modalDetalhes = document.getElementById('modalDetalhesAgendamento');
            var footer = modalDetalhes ? modalDetalhes.querySelector('.modal-footer') : null;
            if (footer) {
                // Remove botão salvar anterior
                var oldSave = footer.querySelector('#btn-salvar-detalhes');
                if (oldSave) oldSave.remove();

                if (podEditar) {
                    var btnSalvar = document.createElement('button');
                    btnSalvar.type = 'button';
                    btnSalvar.className = 'btn btn-primary';
                    btnSalvar.id = 'btn-salvar-detalhes';
                    btnSalvar.innerHTML = '<i class="bi bi-floppy me-1"></i>Salvar Alterações';
                    btnSalvar.addEventListener('click', function () {
                        // Coleta lembretes
                        var inputs = corpo.querySelectorAll('.agenda-lembrete-input');
                        var novosLembretes = [];
                        inputs.forEach(function (inp) {
                            var v = inp.value.trim();
                            if (v) novosLembretes.push(v);
                        });
                        // Coleta observações
                        var obsTA = document.getElementById('agenda-obs-textarea');
                        var novasObs = obsTA ? obsTA.value.trim() : ag.observacoes;

                        // Salva
                        var ags = obterAgendamentos();
                        var idx = ags.findIndex(function (a) { return a.id === ag.id; });
                        if (idx >= 0) {
                            ags[idx].lembretes = novosLembretes;
                            ags[idx].observacoes = novasObs;
                            salvarAgendamentos(ags);
                            ag.lembretes = novosLembretes;
                            ag.observacoes = novasObs;
                        }
                        var inst = bootstrap.Modal.getInstance(modalDetalhes);
                        if (inst) inst.hide();
                        mostrarToast('Detalhes do agendamento atualizados!', 'success');
                        renderizarLista();
                    });
                    footer.insertBefore(btnSalvar, footer.querySelector('button'));
                }
            }

            // Evento: adicionar lembrete
            var btnAddLem = corpo.querySelector('#btn-add-lembrete');
            if (btnAddLem) {
                btnAddLem.addEventListener('click', function () {
                    var lista = corpo.querySelector('#agenda-lembretes-lista');
                    if (!lista) return;
                    var idx2 = lista.querySelectorAll('.agenda-lembrete-edit-row').length;
                    var row = document.createElement('div');
                    row.className = 'agenda-lembrete-edit-row';
                    row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
                    row.innerHTML =
                        '<input type="text" class="form-control form-control-sm agenda-lembrete-input" placeholder="Novo lembrete..." style="flex:1;">' +
                        '<button type="button" class="btn btn-sm btn-outline-danger agenda-lembrete-del" data-idx="' + idx2 + '" title="Remover"><i class="bi bi-trash"></i></button>';
                    lista.appendChild(row);
                    row.querySelector('input').focus();
                });
            }

            // Evento: remover lembrete (delegação)
            corpo.addEventListener('click', function (e) {
                var btnDel = e.target.closest('.agenda-lembrete-del');
                if (btnDel) {
                    var row = btnDel.closest('.agenda-lembrete-edit-row');
                    if (row) row.remove();
                }
            });

            new bootstrap.Modal(document.getElementById('modalDetalhesAgendamento')).show();
        }

        // -----------------------------------------------------------------
        // MODAL: CANCELAR / REJEITAR (mesma interface, textos adaptados)
        // -----------------------------------------------------------------
        var agendamentoEmAcao = null;   // guarda o agendamento atual
        var tipoAcaoAtual     = null;   // 'cancelar' ou 'rejeitar'

        function abrirModalCancelamento(ag, tipo) {
            agendamentoEmAcao = ag;
            tipoAcaoAtual     = tipo;

            var titulo       = document.getElementById('modal-cancelar-titulo');
            var descricao    = document.getElementById('modal-cancelar-descricao');
            var infoBox      = document.getElementById('modal-cancelar-info-agendamento');
            var btnConfirmar = document.getElementById('btn-confirmar-cancelamento');

            if (tipo === 'rejeitar') {
                if (titulo) titulo.innerHTML = '<i class="bi bi-x-octagon me-2"></i>Rejeitar Solicitação';
                if (descricao) descricao.innerHTML =
                    'Selecione abaixo o motivo da rejeição. O cliente será notificado com o motivo ' +
                    'e receberá uma solicitação para reagendar com outra data/horário.';
                if (btnConfirmar) btnConfirmar.innerHTML = '<i class="bi bi-send me-1"></i> Rejeitar e Notificar Cliente';
            } else {
                if (titulo) titulo.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>Cancelar Agendamento';
                if (descricao) descricao.innerHTML =
                    'Selecione abaixo o motivo do cancelamento. O cliente receberá um aviso ' +
                    'com o motivo e uma solicitação de reagendamento.';
                if (btnConfirmar) btnConfirmar.innerHTML = '<i class="bi bi-send me-1"></i> Confirmar e Notificar Cliente';
            }

            if (infoBox) {
                infoBox.innerHTML =
                    '<strong>' + ag.servico + '</strong><br>' +
                    '<i class="bi bi-person me-1"></i>' + ag.cliente + ' &nbsp;·&nbsp; ' +
                    '<i class="bi bi-calendar me-1"></i>' + formatarDataBR(ag.data) + ' ' + ag.horario;
            }

            // Reset campos
            var radios = document.querySelectorAll('input[name="motivo-cancelamento"]');
            radios.forEach(function (r) { r.checked = false; });
            var obs = document.getElementById('motivo-observacao');
            if (obs) obs.value = '';
            var chk = document.getElementById('chk-solicitar-reagendamento');
            if (chk) chk.checked = true;

            new bootstrap.Modal(document.getElementById('modalCancelarAgendamento')).show();
        }

        // Handler: Confirmar cancelamento/rejeição
        var btnConfirmarCancelamento = document.getElementById('btn-confirmar-cancelamento');
        if (btnConfirmarCancelamento) {
            btnConfirmarCancelamento.addEventListener('click', function () {
                if (!agendamentoEmAcao) return;

                var radioSelecionado = document.querySelector('input[name="motivo-cancelamento"]:checked');
                if (!radioSelecionado) {
                    alert('Por favor, selecione um motivo antes de prosseguir.');
                    return;
                }

                var motivo = radioSelecionado.value;
                var observacao = (document.getElementById('motivo-observacao').value || '').trim();

                if (motivo === 'outro' && !observacao) {
                    alert('Você selecionou "Outro motivo". Descreva o motivo no campo de observação.');
                    return;
                }

                var motivoFinal = motivo === 'outro' ? observacao : motivo;
                var observacaoFinal = motivo === 'outro' ? '' : observacao;

                var reagendar = document.getElementById('chk-solicitar-reagendamento');
                var solicitarReagendamento = reagendar ? reagendar.checked : false;

                // 1) Atualiza o agendamento na base: move para histórico como 'cancelado'
                var ags = obterAgendamentos();
                var idx = ags.findIndex(function (a) { return a.id === agendamentoEmAcao.id; });
                if (idx >= 0) {
                    ags[idx].status = 'cancelado';
                    ags[idx].aba    = 'historico';
                    ags[idx].motivoCancelamento = motivoFinal +
                        (observacaoFinal ? ' — ' + observacaoFinal : '');
                    ags[idx].canceladoEm = new Date().toISOString();
                    ags[idx].tipoAcao    = tipoAcaoAtual; // 'cancelar' ou 'rejeitar'
                    salvarAgendamentos(ags);
                }

                // 2) Registra o aviso enviado ao cliente
                registrarAvisoAoCliente({
                    agendamentoId: agendamentoEmAcao.id,
                    cliente: agendamentoEmAcao.cliente,
                    servico: agendamentoEmAcao.servico,
                    data: agendamentoEmAcao.data,
                    horario: agendamentoEmAcao.horario,
                    tipoAcao: tipoAcaoAtual,
                    motivo: motivoFinal,
                    observacao: observacaoFinal,
                    enviadoEm: new Date().toISOString(),
                    mensagem: (tipoAcaoAtual === 'rejeitar'
                        ? 'Sua solicitação de agendamento foi rejeitada. Motivo: '
                        : 'Seu agendamento foi cancelado pelo prestador. Motivo: ') + motivoFinal
                });

                // Atualiza o registro do cliente com o novo status
                if (agendamentoEmAcao.clienteEmail) {
                    _atualizarStatusClienteAgendamento(
                        agendamentoEmAcao.id,
                        agendamentoEmAcao.clienteEmail,
                        tipoAcaoAtual === 'rejeitar' ? 'rejeitado' : 'cancelado'
                    );
                    // Notifica o cliente
                    sgCriarNotificacao(agendamentoEmAcao.clienteEmail,
                        tipoAcaoAtual === 'rejeitar' ? 'rejeicao' : 'cancelamento',
                        {
                            agendamentoId: agendamentoEmAcao.id,
                            servico: agendamentoEmAcao.servico,
                            data: agendamentoEmAcao.data,
                            horario: agendamentoEmAcao.horario,
                            motivo: motivoFinal,
                            prestadorNome: (_usuLogadoPrest && _usuLogadoPrest.nome) || 'Prestador'
                        }
                    );
                }

                // 3) Se marcado, registra a solicitação de reagendamento
                if (solicitarReagendamento) {
                    registrarSolicitacaoReagendamento({
                        agendamentoIdOriginal: agendamentoEmAcao.id,
                        cliente: agendamentoEmAcao.cliente,
                        servico: agendamentoEmAcao.servico,
                        dataOriginal: agendamentoEmAcao.data,
                        horarioOriginal: agendamentoEmAcao.horario,
                        criadaEm: new Date().toISOString(),
                        status: 'aguardando-cliente'
                    });
                }

                // 4) Fecha modal, atualiza UI e avisa o prestador
                var modalEl = document.getElementById('modalCancelarAgendamento');
                var modalInst = bootstrap.Modal.getInstance(modalEl);
                if (modalInst) modalInst.hide();

                atualizarContadores();
                renderizarLista();

                mostrarToast(
                    (tipoAcaoAtual === 'rejeitar' ? 'Solicitação rejeitada' : 'Agendamento cancelado') +
                    '. ' +
                    (solicitarReagendamento
                        ? 'Cliente foi notificado com o motivo e recebeu solicitação de reagendamento.'
                        : 'Cliente foi notificado com o motivo.'),
                    'success'
                );

                agendamentoEmAcao = null;
                tipoAcaoAtual     = null;
            });
        }

        // -----------------------------------------------------------------
        // MODAL: VER NOTA (Avaliação do cliente)
        // -----------------------------------------------------------------
        function abrirModalVerNota(ag) {
            var corpo = document.getElementById('modal-ver-nota-corpo');
            if (!corpo) return;

            if (!ag.avaliacao) {
                corpo.innerHTML =
                    '<div class="agenda-nota-sem-avaliacao">' +
                        '<i class="bi bi-hourglass-split"></i>' +
                        '<p class="mb-0"><strong>O cliente ainda não avaliou este serviço.</strong></p>' +
                        '<small class="text-muted">Quando a avaliação for enviada, ela aparecerá aqui.</small>' +
                    '</div>';
            } else {
                var av = ag.avaliacao;
                var estrelas = '';
                for (var i = 1; i <= 5; i++) {
                    estrelas += (i <= av.nota)
                        ? '<i class="bi bi-star-fill"></i>'
                        : '<i class="bi bi-star" style="color:#d1d5db;"></i>';
                }

                corpo.innerHTML =
                    '<div class="agenda-nota-cabecalho">' +
                        '<div class="agenda-nota-estrelas">' + estrelas + '</div>' +
                        '<div class="agenda-nota-valor">' + av.nota.toFixed(1) + '<small> / 5.0</small></div>' +
                    '</div>' +
                    '<div class="agenda-detalhe-grid mb-3">' +
                        '<div><strong>Cliente</strong><span>' + ag.cliente + '</span></div>' +
                        '<div><strong>Serviço</strong><span>' + ag.servico + '</span></div>' +
                        '<div><strong>Data do Serviço</strong><span>' + formatarDataBR(ag.data) + '</span></div>' +
                        '<div><strong>Avaliado em</strong><span>' + formatarDataBR(av.dataAvaliacao) + '</span></div>' +
                    '</div>' +
                    '<h6 style="font-size:0.8rem; text-transform:uppercase; color:var(--texto-muted); font-weight:700;">' +
                        '<i class="bi bi-chat-quote me-1"></i>Comentário do Cliente' +
                    '</h6>' +
                    '<div class="agenda-nota-comentario">"' + av.comentario + '"</div>';
            }

            new bootstrap.Modal(document.getElementById('modalVerNota')).show();
        }

        // -----------------------------------------------------------------
        // MODAL: CHAT COM O CLIENTE
        // -----------------------------------------------------------------
        // Regras de negócio:
        //   • Cada conversa é SEMPRE exclusiva entre um prestador e um cliente;
        //   • O prestador pode ter várias conversas abertas (uma por cliente que
        //     solicitou agendamento com ele). Cada item da lista abre a conversa
        //     específica daquele cliente, carregada de localStorage;
        //   • A chave de persistência inclui o "prestadorId" (identifica o prestador
        //     logado) e o "clienteId" (derivado do agendamento), garantindo o
        //     isolamento: nenhuma outra pessoa/prestador vê as mensagens;
        //   • Os 4 botões do rodapé têm papéis bem distintos:
        //       - Limpar  → apaga apenas o rascunho (textarea) da nova mensagem
        //       - Editar  → reabre a textarea para digitação (sai do modo só-leitura)
        //                   e devolve o foco ao campo; serve tanto para retomar um
        //                   rascunho quanto para reativar o campo caso o usuário o
        //                   tenha deixado read-only por algum motivo
        //       - Cancelar → fecha o modal (preserva rascunho em memória da sessão
        //                    do modal) e devolve o foco ao botão "Chat" que o abriu
        //       - Enviar   → adiciona a mensagem ao histórico, persiste e limpa o
        //                    rascunho; a mensagem vai SOMENTE para aquele cliente.
        // -----------------------------------------------------------------
        var CHAT_PREST_ID = _emailPrestLogado;          // ID do prestador logado (email)
        var CHAT_MSGS_PREFIX = 'prestChatMensagens_';  // Prefixo das chaves no localStorage

        // Referências DOM do modal (resolvidas na primeira abertura)
        var modalChatEl, modalChatInstance, chatHistoricoEl, chatTextareaEl,
            chatInfoEl, chatClienteNomeEl, chatContadorEl,
            btnChatLimpar, btnChatEditar, btnChatCancelar, btnChatEnviar;
        var chatAgendamentoAtual = null;   // Agendamento (→ cliente) da conversa aberta
        var chatClienteIdAtual   = null;   // ID estável do cliente para localStorage
        var chatOrigemFoco       = null;   // Elemento que abriu o modal (retorno do foco)
        var chatHandlersRegistrados = false; // Garante que bindHandlers só rode uma vez

        // Gera/normaliza um ID estável para o cliente a partir do agendamento.
        // Em produção esse id viria da própria base; aqui, como fallback, usamos
        // "clienteId" do objeto OU derivamos do nome (slug) — o objetivo é
        // identificar UNIVOCAMENTE cada cliente para que o histórico seja carregado
        // sempre a partir da mesma chave, independente do agendamento clicado.
        function obterClienteIdDoAgendamento(ag) {
            if (ag.clienteId) return String(ag.clienteId);
            if (!ag.cliente)  return 'cli-desconhecido';
            return 'cli-' + ag.cliente
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        // Chave do localStorage no formato: prestChatMensagens_<prestadorId>_<clienteId>
        function obterChaveChat(clienteId) {
            return CHAT_MSGS_PREFIX + CHAT_PREST_ID + '_' + clienteId;
        }

        // Leitura segura do histórico (se corromper, zera em vez de quebrar a tela)
        function carregarHistoricoChat(clienteId) {
            try {
                var raw = localStorage.getItem(obterChaveChat(clienteId));
                if (!raw) return [];
                var arr = JSON.parse(raw);
                return Array.isArray(arr) ? arr : [];
            } catch (e) {
                console.warn('Histórico de chat corrompido — zerando.', e);
                return [];
            }
        }

        function salvarHistoricoChat(clienteId, mensagens) {
            try {
                localStorage.setItem(obterChaveChat(clienteId), JSON.stringify(mensagens));
            } catch (e) {
                console.error('Não foi possível salvar o histórico de chat:', e);
            }
        }

        // Formata o carimbo de hora/data de cada mensagem
        function formatarHoraChat(isoString) {
            var d = new Date(isoString);
            if (isNaN(d.getTime())) return '';
            var hoje = new Date();
            var mesmoDia = d.toDateString() === hoje.toDateString();
            var hh = String(d.getHours()).padStart(2, '0');
            var mm = String(d.getMinutes()).padStart(2, '0');
            if (mesmoDia) return 'Hoje, ' + hh + ':' + mm;
            var dd = String(d.getDate()).padStart(2, '0');
            var mo = String(d.getMonth() + 1).padStart(2, '0');
            return dd + '/' + mo + ' ' + hh + ':' + mm;
        }

        // Escape mínimo para não quebrar o innerHTML com conteúdo vindo do usuário
        function escaparHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Renderiza o histórico na área de mensagens e rola até o fim
        function renderizarHistoricoChat(mensagens) {
            if (!chatHistoricoEl) return;

            if (!mensagens || mensagens.length === 0) {
                chatHistoricoEl.innerHTML =
                    '<div class="agenda-chat-vazio">' +
                        '<i class="bi bi-chat-square-text"></i>' +
                        '<div>Nenhuma mensagem ainda.</div>' +
                        '<small>Envie a primeira mensagem ao cliente.</small>' +
                    '</div>';
                return;
            }

            var html = '';
            mensagens.forEach(function (m) {
                var classe = (m.remetente === 'prestador') ? 'prest' : 'cliente';
                html +=
                    '<div class="agenda-chat-msg ' + classe + '">' +
                        escaparHtml(m.texto) +
                        '<span class="agenda-chat-msg-hora">' + formatarHoraChat(m.data) + '</span>' +
                    '</div>';
            });
            chatHistoricoEl.innerHTML = html;
            // Rolar para a última mensagem
            chatHistoricoEl.scrollTop = chatHistoricoEl.scrollHeight;
        }

        // Atualiza o contador de caracteres do textarea
        function atualizarContadorChat() {
            if (!chatTextareaEl || !chatContadorEl) return;
            chatContadorEl.textContent = chatTextareaEl.value.length;
        }

        // Liga os 4 botões do rodapé + textarea (uma única vez)
        function registrarHandlersChat() {
            if (chatHandlersRegistrados) return;
            chatHandlersRegistrados = true;

            // LIMPAR — apaga só o rascunho (a textarea), preservando o histórico
            btnChatLimpar.addEventListener('click', function () {
                if (!chatTextareaEl) return;
                chatTextareaEl.readOnly = false;
                chatTextareaEl.value = '';
                atualizarContadorChat();
                chatTextareaEl.focus();
            });

            // EDITAR — tira o modo somente-leitura (se estiver) e dá foco ao campo.
            // Útil quando o usuário quer retomar um rascunho: basta clicar para
            // continuar a digitar de onde parou.
            btnChatEditar.addEventListener('click', function () {
                if (!chatTextareaEl) return;
                chatTextareaEl.readOnly = false;
                chatTextareaEl.focus();
                // Coloca o cursor no fim do texto (UX: retomar digitação)
                var len = chatTextareaEl.value.length;
                try { chatTextareaEl.setSelectionRange(len, len); } catch (e) {}
            });

            // CANCELAR — fecha o modal e devolve o foco ao ponto de origem
            btnChatCancelar.addEventListener('click', function () {
                if (modalChatInstance) modalChatInstance.hide();
            });

            // ENVIAR — adiciona a mensagem ao histórico e persiste
            btnChatEnviar.addEventListener('click', function () {
                if (!chatAgendamentoAtual || !chatClienteIdAtual) return;

                var texto = (chatTextareaEl.value || '').trim();
                if (!texto) {
                    mostrarToast('Digite uma mensagem antes de enviar.', 'warning');
                    chatTextareaEl.focus();
                    return;
                }

                var msg = {
                    id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    remetente: 'prestador',
                    texto: texto,
                    data: new Date().toISOString(),
                    agendamentoId: chatAgendamentoAtual.id
                };

                var hist = carregarHistoricoChat(chatClienteIdAtual);
                hist.push(msg);
                salvarHistoricoChat(chatClienteIdAtual, hist);

                // Notifica o cliente sobre nova mensagem
                if (chatAgendamentoAtual && chatAgendamentoAtual.clienteEmail) {
                    sgCriarNotificacao(chatAgendamentoAtual.clienteEmail, 'mensagem', {
                        agendamentoId: chatAgendamentoAtual.id,
                        servico: chatAgendamentoAtual.servico,
                        prestadorNome: (_usuLogadoPrest && _usuLogadoPrest.nome) || 'Prestador',
                        prestadorEmail: CHAT_PREST_ID,
                        preview: texto.substring(0, 80) + (texto.length > 80 ? '…' : ''),
                        clienteId: chatClienteIdAtual
                    });
                }

                // Atualiza UI
                renderizarHistoricoChat(hist);
                chatTextareaEl.value = '';
                atualizarContadorChat();
                chatTextareaEl.focus();

                mostrarToast('Mensagem enviada para ' + chatAgendamentoAtual.cliente + '.', 'success');
            });

            // Contador ao digitar
            chatTextareaEl.addEventListener('input', atualizarContadorChat);

            // Atalho: Ctrl/Cmd + Enter → enviar rapidamente
            chatTextareaEl.addEventListener('keydown', function (e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    btnChatEnviar.click();
                }
            });

            // Ao fechar o modal (por qualquer via: X, ESC, clique fora, Cancelar),
            // devolvemos o foco ao botão que originou a abertura — requisito:
            // "retornar ao ponto acessado anteriormente"
            modalChatEl.addEventListener('hidden.bs.modal', function () {
                if (chatOrigemFoco && typeof chatOrigemFoco.focus === 'function') {
                    try { chatOrigemFoco.focus(); } catch (e) {}
                }
            });
        }

        // ABERTURA DO MODAL DE CHAT — função invocada pelo botão "Chat" de cada item
        function abrirModalChat(ag) {
            // Resolve referências do DOM na primeira chamada (cachear)
            if (!modalChatEl) {
                modalChatEl       = document.getElementById('modalChatCliente');
                if (!modalChatEl) return;
                chatHistoricoEl   = document.getElementById('modal-chat-historico');
                chatTextareaEl    = document.getElementById('modal-chat-texto');
                chatInfoEl        = document.getElementById('modal-chat-info-agendamento');
                chatClienteNomeEl = document.getElementById('modal-chat-cliente-nome');
                chatContadorEl    = document.getElementById('modal-chat-contador');
                btnChatLimpar     = document.getElementById('btn-chat-limpar');
                btnChatEditar     = document.getElementById('btn-chat-editar');
                btnChatCancelar   = document.getElementById('btn-chat-cancelar');
                btnChatEnviar     = document.getElementById('btn-chat-enviar');
                modalChatInstance = new bootstrap.Modal(modalChatEl);
                registrarHandlersChat();
            }

            // Armazena o ponto de retorno (botão "Chat" clicado) para devolver o
            // foco ao fechar o modal
            chatOrigemFoco = document.activeElement;

            // Atualiza contexto da conversa
            chatAgendamentoAtual = ag;
            chatClienteIdAtual   = obterClienteIdDoAgendamento(ag);

            // Cabeçalho — nome do cliente
            if (chatClienteNomeEl) chatClienteNomeEl.textContent = ag.cliente || 'Cliente';

            // Faixa de contexto (serviço + data + horário)
            if (chatInfoEl) {
                chatInfoEl.innerHTML =
                    '<span class="agenda-chat-info-item"><i class="bi bi-person-circle"></i><strong>' +
                        escaparHtml(ag.cliente) + '</strong></span>' +
                    '<span class="agenda-chat-info-item"><i class="bi bi-tools"></i>' +
                        escaparHtml(ag.servico) + '</span>' +
                    '<span class="agenda-chat-info-item"><i class="bi bi-calendar-event"></i>' +
                        escaparHtml((ag.diaLabel || formatarDataBR(ag.data)) + ' • ' + ag.horario) + '</span>';
            }

            // Carrega histórico específico do cliente
            var historico = carregarHistoricoChat(chatClienteIdAtual);
            renderizarHistoricoChat(historico);

            // O prestador abriu o modal → qualquer mensagem não lida dessa conversa
            // passa a ser considerada LIDA. Ao fechar, re-renderizamos a lista para
            // que o sininho some.
            marcarConversaComoLidaPrest(ag);

            // Prepara a textarea — começa editável, vazia e com contador zerado
            chatTextareaEl.readOnly = false;
            chatTextareaEl.value = '';
            atualizarContadorChat();

            // Exibe o modal e foca na área de digitação
            modalChatInstance.show();
            // O foco precisa ir para a textarea só depois que o modal estiver
            // 100% visível (o Bootstrap dispara 'shown.bs.modal' nesse momento).
            // Usamos `once: true` para não acumular listeners a cada abertura.
            modalChatEl.addEventListener('shown.bs.modal', function _foco() {
                if (chatTextareaEl) chatTextareaEl.focus();
            }, { once: true });

            // Ao fechar (X, ESC, clique fora, Cancelar), re-renderiza a lista para
            // atualizar o sininho (some depois de lida) e o aviso do topo.
            modalChatEl.addEventListener('hidden.bs.modal', function _recalc() {
                renderizarLista();
                atualizarAvisoMsgsNaoLidasPrest();
            }, { once: true });
        }

        // -----------------------------------------------------------------
        // CONFIRMAR AGENDAMENTO (move de pendente → próximos)
        // -----------------------------------------------------------------
        function confirmarAgendamento(ag) {
            if (!confirm('Confirmar o agendamento de ' + ag.cliente + ' para ' + ag.servico + '?')) return;

            var ags = obterAgendamentos();
            var idx = ags.findIndex(function (a) { return a.id === ag.id; });
            if (idx >= 0) {
                ags[idx].status = 'confirmado';
                ags[idx].aba    = 'proximos';
                ags[idx].confirmadoEm = new Date().toISOString();
                salvarAgendamentos(ags);
            }

            // Atualiza o registro de agendamento do lado do cliente
            if (ag.clienteEmail) {
                _atualizarStatusClienteAgendamento(ag.id, ag.clienteEmail, 'confirmado');
                // Notifica o cliente
                sgCriarNotificacao(ag.clienteEmail, 'confirmacao', {
                    agendamentoId: ag.id,
                    servico: ag.servico,
                    data: ag.data,
                    horario: ag.horario,
                    prestadorNome: (_usuLogadoPrest && _usuLogadoPrest.nome) || 'Prestador'
                });
            }

            atualizarContadores();
            renderizarLista();
            mostrarToast('Agendamento confirmado! O cliente foi notificado.', 'success');
        }

        // -----------------------------------------------------------------
        // TOAST — notificação rápida de sucesso
        // -----------------------------------------------------------------
        function mostrarToast(mensagem, tipo) {
            var el = document.getElementById('toastNotificacao');
            var corpo = document.getElementById('toast-mensagem');
            if (!el || !corpo) { alert(mensagem); return; }

            corpo.textContent = mensagem;
            el.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning');
            if (tipo === 'danger')  el.classList.add('text-bg-danger');
            else if (tipo === 'warning') el.classList.add('text-bg-warning');
            else                    el.classList.add('text-bg-success');

            var toast = bootstrap.Toast.getOrCreateInstance(el, { delay: 4500 });
            toast.show();
        }

        // -----------------------------------------------------------------
        // BOOT
        // -----------------------------------------------------------------
        semearAgendamentosSeNecessario();

        // --- Trata parâmetros de URL (vindos de notificações do dashboard) ---
        (function tratarParamsUrl() {
            var params = new URLSearchParams(window.location.search);
            var abaParam = params.get('aba');
            var agIdParam = params.get('agendamentoId');
            var chatParam = params.get('chat');

            if (abaParam && ['proximos','pendentes','historico'].includes(abaParam)) {
                // Vai ativar essa aba após o boot
                setTimeout(function () { ativarAba(abaParam); }, 100);
            }
            if (agIdParam) {
                // Destaca visualmente o agendamento após render
                setTimeout(function () {
                    var el = containerLista.querySelector('[data-agendamento-id="' + agIdParam + '"]');
                    if (el) {
                        el.style.outline = '3px solid #FFC300';
                        el.style.borderRadius = '8px';
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Abre o modal de detalhes automaticamente
                        var ags2 = obterAgendamentos();
                        var agAlvo = ags2.find(function (a) { return a.id === agIdParam; });
                        if (agAlvo) { setTimeout(function () { abrirModalDetalhes(agAlvo); }, 600); }
                    }
                }, 400);
            }
            if (chatParam) {
                // Abre chat do agendamento especificado
                setTimeout(function () {
                    var ags2 = obterAgendamentos();
                    var agChat = ags2.find(function (a) { return a.id === chatParam; });
                    if (agChat) {
                        // Ativa a aba correta
                        ativarAba(agChat.aba || 'proximos');
                        setTimeout(function () { abrirModalChat(agChat); }, 600);
                    }
                }, 400);
            }
        })();

        // --- SEED DEMO do chat -----------------------------------------------
        // Em modo de demonstração, garantimos que pelo menos uma conversa tenha
        // uma mensagem NOVA vinda do cliente, para que o sininho vermelho e o
        // aviso "Você possui mensagens não lidas" apareçam imediatamente no
        // primeiro acesso (sem exigir que o cliente abra outra aba e mande uma
        // mensagem). Semeamos apenas uma vez (flag em localStorage).
        (function semearMensagemDemoDoCliente() {
            try {
                var FLAG = 'prestChatSeedMsgDemoV1';
                if (localStorage.getItem(FLAG)) return;

                var ags = obterAgendamentos();
                if (!ags.length) return;

                // Escolhemos o primeiro agendamento "próximo" como alvo
                var alvo = ags.find(function (a) { return a.aba === 'proximos'; }) || ags[0];
                if (!alvo) return;

                var clienteId = obterClienteIdDoAgendamento(alvo);
                var chave = CHAT_MSGS_PREFIX + CHAT_PREST_ID + '_' + clienteId;

                var existente = [];
                try { existente = JSON.parse(localStorage.getItem(chave) || '[]'); } catch (e) {}

                existente.push({
                    id: 'msg-demo-' + Date.now(),
                    remetente: 'cliente',
                    texto: 'Olá! Só confirmando se está tudo certo para nosso horário. Precisa de mais alguma informação minha antes?',
                    data: new Date().toISOString(),
                    agendamentoId: alvo.id
                });
                localStorage.setItem(chave, JSON.stringify(existente));
                localStorage.setItem(FLAG, '1');
            } catch (e) { /* silencioso — demo não pode quebrar o app */ }
        })();
        // ---------------------------------------------------------------------

        atualizarContadores();
        atualizarAvisoMsgsNaoLidasPrest(); // sininho no topo
        ativarAba('proximos');

        // Polling leve: recalcula o aviso/sininhos a cada 5s enquanto a página está aberta.
        // Isso dá o efeito de "chegou uma mensagem nova" mesmo que o cliente tenha respondido
        // em outra aba/sessão sem recarregar a página do prestador.
        setInterval(function () {
            atualizarAvisoMsgsNaoLidasPrest();
            // Só re-renderiza a lista se o usuário não estiver com modal aberto,
            // para não interromper interações em andamento.
            var algumModalAberto = document.querySelector('.modal.show');
            if (!algumModalAberto) renderizarLista();
        }, 5000);
    }


    // =====================================================
    // ALTERAR SENHA — PRESTADOR (modal em qualquer página)
    // -----------------------------------------------------
    // Aciona o modal #modalAlterarSenha. Valida:
    //  - Senha atual correta (Case Sensitive)
    //  - Nova senha >= 8 caracteres, com letras, números
    //    e caracteres especiais (Case Sensitive)
    //  - Nova senha e repetição devem coincidir
    // =====================================================
    function inicializarAlterarSenhaGeral() {
        var btnSalvar = document.getElementById('btn-salvar-senha-geral');
        if (!btnSalvar) return;

        btnSalvar.addEventListener('click', function () {
            var usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || '{}');
            var emailLogado = (usuarioLogado.email || '').toLowerCase();

            var usuariosCadastrados = obterUsuariosCadastrados();
            var dadosUsuario = usuariosCadastrados[emailLogado] || null;

            var senhaAtualEl = document.getElementById('senha-atual-geral');
            var novaSenhaEl  = document.getElementById('nova-senha-geral');
            var repitaEl     = document.getElementById('repita-nova-senha-geral');

            var senhaAtual = senhaAtualEl ? senhaAtualEl.value : '';
            var novaSenha  = novaSenhaEl  ? novaSenhaEl.value  : '';
            var repita     = repitaEl     ? repitaEl.value     : '';

            if (!dadosUsuario) {
                alert('Usuário logado não encontrado. Faça login novamente.');
                return;
            }

            // Case Sensitive
            if (senhaAtual !== dadosUsuario.senha) {
                alert('A senha atual está incorreta!');
                return;
            }

            var regexSenha = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
            if (!regexSenha.test(novaSenha)) {
                alert('A nova senha não atende aos requisitos mínimos!\n\nA senha deve ter pelo menos 8 caracteres e incluir letras, números e caracteres especiais.');
                return;
            }

            if (novaSenha !== repita) {
                alert('As novas senhas digitadas não coincidem. Tente novamente.');
                return;
            }

            dadosUsuario.senha = novaSenha;
            usuariosCadastrados[emailLogado] = dadosUsuario;
            salvarUsuariosCadastrados(usuariosCadastrados);

            alert('Senha atualizada com sucesso!');
            if (senhaAtualEl) senhaAtualEl.value = '';
            if (novaSenhaEl)  novaSenhaEl.value  = '';
            if (repitaEl)     repitaEl.value     = '';

            var modalEl = document.getElementById('modalAlterarSenha');
            if (modalEl) {
                var inst = bootstrap.Modal.getInstance(modalEl);
                if (inst) inst.hide();
            }
        });
    }


    // =====================================================
    // HELPER GLOBAL — Atualiza status de agendamento
    // no registro pessoal do cliente (clienteAgendamentos_<email>)
    // Chamado pelo prestador ao confirmar/cancelar/rejeitar.
    // =====================================================
    function _atualizarStatusClienteAgendamento(agId, emailCliente, novoStatus) {
        if (!emailCliente || !agId) return;
        var cliKey = 'clienteAgendamentos_' + emailCliente;
        var cliAgs = [];
        try { cliAgs = JSON.parse(localStorage.getItem(cliKey) || '[]'); } catch (e) {}
        var idx = cliAgs.findIndex(function (a) { return a.id === agId; });
        if (idx >= 0) {
            cliAgs[idx].status = novoStatus;
            cliAgs[idx].atualizadoEm = new Date().toISOString();
            localStorage.setItem(cliKey, JSON.stringify(cliAgs));
        }
    }

    // =====================================================
    // AGENDAR SERVIÇOS
    // clienteAgendarServicos.html (logado) e agendarServicos.html (público)
    // =====================================================
    function inicializarAgendarServicos() {
        var mainAgendar = document.querySelector('.agendar-main');
        if (!mainAgendar) return;

        var HOTSITE_KEY = 'hotsitePrestadorDados';

        // Detecta se o usuário está logado como cliente ou admin
        var usuarioLogado = null;
        try { usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null'); } catch (e) {}
        var estaLogado = usuarioLogado && (usuarioLogado.tipo === 'cliente' || usuarioLogado.tipo === 'admin');

        // Selectboxes, blocos de info e botões
        var selects = mainAgendar.querySelectorAll('.agendar-select');
        var selectTipo      = selects[0];
        var selectPrestador = selects[1];
        var blocos          = mainAgendar.querySelectorAll('.agendar-info-bloco');
        var blocoHorario    = blocos[0];
        var blocoContato    = blocos[1];
        var btnAgendar      = mainAgendar.querySelector('.cta');
        var linkHotsite     = mainAgendar.querySelector('.agendar-link');

        if (!selectTipo || !selectPrestador) return;

        // -----------------------------------------------------------------
        // SEED — cria prestadores de demonstração caso não haja nenhum
        // cadastrado no hotsitePrestadorDados (primeiro acesso ao sistema).
        // -----------------------------------------------------------------
        function semearPrestadoresDemoSeNecessario() {
            var store = {};
            try { store = JSON.parse(localStorage.getItem(HOTSITE_KEY) || '{}'); } catch (e) {}
            if (Object.keys(store).length > 0) return;

            var usuarios = obterUsuariosCadastrados();
            var demos = [
                {
                    email: 'prestador@servgo.com',
                    nome: 'Prestador Demo',
                    categoria: 'Manutenção Predial',
                    cidade: 'Presidente Prudente, SP',
                    tel: '(18) 99123-4567',
                    descricao: 'Especializado em montagem de móveis, reparos elétricos e hidráulicos.',
                    cnpj: '', endereco: 'Rua das Flores, 100 - Centro', foto: ''
                },
                {
                    email: 'saude@servgo.com',
                    nome: 'Dra. Ana Lima',
                    categoria: 'Saúde',
                    cidade: 'Presidente Prudente, SP',
                    tel: '(18) 99234-5678',
                    descricao: 'Clínica geral e nutrição. Atendimento personalizado.',
                    cnpj: '', endereco: 'Av. Manoel Goulart, 200', foto: ''
                },
                {
                    email: 'beleza@servgo.com',
                    nome: 'Studio Beleza & Cia',
                    categoria: 'Beleza',
                    cidade: 'Presidente Prudente, SP',
                    tel: '(18) 98765-4321',
                    descricao: 'Salão completo: cabelo, maquiagem, manicure e pedicure.',
                    cnpj: '', endereco: 'Rua Coronel José Soares Marcondes, 45', foto: ''
                },
                {
                    email: 'ti@servgo.com',
                    nome: 'TechSolutions TI',
                    categoria: 'TI',
                    cidade: 'Presidente Prudente, SP',
                    tel: '(18) 99876-5432',
                    descricao: 'Suporte técnico, redes, desenvolvimento web e segurança digital.',
                    cnpj: '', endereco: 'Rua Tenente Nicolau Maffei, 300', foto: ''
                },
                {
                    email: 'consultoria@servgo.com',
                    nome: 'BizConsult',
                    categoria: 'Consultoria',
                    cidade: 'Presidente Prudente, SP',
                    tel: '(18) 97654-3210',
                    descricao: 'Consultoria empresarial, financeira e jurídica.',
                    cnpj: '', endereco: 'Av. Brasil, 400', foto: ''
                },
                {
                    email: 'design@servgo.com',
                    nome: 'Pixel Studio Design',
                    categoria: 'Design',
                    cidade: 'Presidente Prudente, SP',
                    tel: '(18) 98888-1234',
                    descricao: 'Design gráfico, identidade visual e criação de sites.',
                    cnpj: '', endereco: 'Rua 15 de Novembro, 55', foto: ''
                }
            ];

            demos.forEach(function (d) {
                store[d.email] = {
                    nome: d.nome, email: d.email, cnpj: d.cnpj,
                    categoria: d.categoria, cidade: d.cidade,
                    descricao: d.descricao, endereco: d.endereco,
                    tel: d.tel, foto: d.foto
                };
                if (!usuarios[d.email]) {
                    usuarios[d.email] = { nome: d.nome, senha: 'Demo@123', tipo: 'prestador' };
                }
            });

            localStorage.setItem(HOTSITE_KEY, JSON.stringify(store));
            salvarUsuariosCadastrados(usuarios);
        }

        semearPrestadoresDemoSeNecessario();

        // -----------------------------------------------------------------
        // Helpers de acesso a dados
        // -----------------------------------------------------------------
        function obterStorePrestadores() {
            try { return JSON.parse(localStorage.getItem(HOTSITE_KEY) || '{}'); } catch (e) { return {}; }
        }

        function obterPrestadoresDoTipo(tipo) {
            var store = obterStorePrestadores();
            return Object.keys(store)
                .map(function (email) { return Object.assign({}, store[email], { email: email }); })
                .filter(function (p) { return p.nome && p.categoria === tipo; });
        }

        function obterTiposServico() {
            var store = obterStorePrestadores();
            var tipos = [];
            Object.keys(store).forEach(function (email) {
                var cat = (store[email] || {}).categoria;
                if (cat && tipos.indexOf(cat) === -1) tipos.push(cat);
            });
            return tipos.sort();
        }

        // -----------------------------------------------------------------
        // Cálculo do próximo horário livre da agenda do prestador
        // -----------------------------------------------------------------
        function obterAgendamentosDoPrestador(emailPrestador) {
            var chave = 'agendamentos_' + emailPrestador;
            var raw = localStorage.getItem(chave);
            // Fallback para a chave legada do prestador demo
            if (!raw && emailPrestador === 'prestador@servgo.com') {
                raw = localStorage.getItem('prestAgendamentos');
            }
            try { return JSON.parse(raw || '[]'); } catch (e) { return []; }
        }

        function proximoHorarioDisponivel(emailPrestador) {
            var ags = obterAgendamentosDoPrestador(emailPrestador);

            // Constrói mapa de slots ocupados: "YYYY-MM-DD 09:00" → true
            var ocupados = {};
            ags.forEach(function (a) {
                if (a.status === 'cancelado') return;
                var inicio = (a.horario || '').split(' - ')[0];
                if (inicio && a.data) ocupados[a.data + ' ' + inicio] = true;
            });

            var agora = new Date();
            var diasSem = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            var meses   = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

            for (var d = 0; d < 30; d++) {
                var dia = new Date(agora);
                dia.setDate(agora.getDate() + d);
                var ds = dia.getDay();
                if (ds === 0 || ds === 6) continue; // ignora fim de semana

                var dataStr = dia.toISOString().substring(0, 10);

                for (var h = 8; h < 18; h++) {
                    if (d === 0 && h <= agora.getHours()) continue; // slots passados no dia de hoje
                    var horarioStr = String(h).padStart(2, '0') + ':00';
                    if (!ocupados[dataStr + ' ' + horarioStr]) {
                        var label = '';
                        if (d === 0) label = 'Hoje';
                        else if (d === 1) label = 'Amanhã';
                        else label = diasSem[dia.getDay()] + ', ' +
                                     String(dia.getDate()).padStart(2, '0') + '/' + meses[dia.getMonth()];
                        label += ' às ' + horarioStr;
                        return { data: dataStr, horario: horarioStr, label: label };
                    }
                }
            }
            return null; // sem disponibilidade
        }

        // -----------------------------------------------------------------
        // Reserva um horário na agenda do prestador
        // -----------------------------------------------------------------
        function reservarAgendamento(emailPrestador, slot, tipoServico, nomeCliente, emailCliente) {
            var chave = 'agendamentos_' + emailPrestador;
            var ags = obterAgendamentosDoPrestador(emailPrestador);
            var fimH = String(parseInt(slot.horario.split(':')[0]) + 1).padStart(2, '0') + ':00';
            var novoId = 'ag-cli-' + Date.now();

            // Bloqueia duplo agendamento: verifica se o slot já está ocupado
            var ocupado = ags.some(function (a) {
                if (a.status === 'cancelado') return false;
                var inicioExist = (a.horario || '').split(' - ')[0];
                return a.data === slot.data && inicioExist === slot.horario;
            });
            if (ocupado) {
                alert('Este horário já foi reservado por outro cliente. Por favor, escolha outro.');
                return false;
            }

            ags.push({
                id: novoId,
                status: 'pendente',
                aba: 'pendentes',
                data: slot.data,
                diaLabel: slot.label,
                horario: slot.horario + ' - ' + fimH,
                cliente: nomeCliente || 'Cliente',
                clienteEmail: emailCliente || '',
                servico: tipoServico || 'Serviço',
                endereco: '',
                valor: 0,
                formaPagamento: '',
                observacoes: 'Agendamento solicitado pelo cliente via plataforma.',
                lembretes: []
            });

            localStorage.setItem(chave, JSON.stringify(ags));
            // Mantém sincronizado com a chave legada do prestador demo
            if (emailPrestador === 'prestador@servgo.com') {
                localStorage.setItem('prestAgendamentos', JSON.stringify(ags));
            }

            // Salva registro na lista pessoal do cliente para exibir na sua área
            if (emailCliente) {
                var prestStore = obterStorePrestadores();
                var nomePrest = (prestStore[emailPrestador] || {}).nome || emailPrestador;
                var cliKey = 'clienteAgendamentos_' + emailCliente;
                var cliAgs = [];
                try { cliAgs = JSON.parse(localStorage.getItem(cliKey) || '[]'); } catch (e) {}
                cliAgs.push({
                    id: novoId,
                    emailPrestador: emailPrestador,
                    nomePrestador: nomePrest,
                    servico: tipoServico || 'Serviço',
                    data: slot.data,
                    horario: slot.horario + ' - ' + fimH,
                    diaLabel: slot.label,
                    status: 'pendente',
                    criadoEm: new Date().toISOString()
                });
                localStorage.setItem(cliKey, JSON.stringify(cliAgs));
            }

            // Notifica o prestador sobre nova solicitação de agendamento
            sgCriarNotificacao(emailPrestador, 'agendamento', {
                agendamentoId: novoId,
                clienteNome: nomeCliente || 'Cliente',
                clienteEmail: emailCliente || '',
                servico: tipoServico || 'Serviço',
                data: slot.data,
                horario: slot.horario + ' - ' + fimH,
                label: slot.label
            });

            return novoId;
        }

        // -----------------------------------------------------------------
        // Preenchimento dos selects
        // -----------------------------------------------------------------
        function preencherTipos() {
            var tipos = obterTiposServico();
            selectTipo.innerHTML = '<option value="">-- Selecione o tipo de serviço --</option>';
            tipos.forEach(function (t) {
                var opt = document.createElement('option');
                opt.value = t; opt.textContent = t;
                selectTipo.appendChild(opt);
            });
        }

        function preencherPrestadores(tipo) {
            selectPrestador.innerHTML = '<option value="">-- Selecione um prestador --</option>';
            if (!tipo) return;
            obterPrestadoresDoTipo(tipo).forEach(function (p) {
                var opt = document.createElement('option');
                opt.value = p.email; opt.textContent = p.nome;
                selectPrestador.appendChild(opt);
            });
        }

        // -----------------------------------------------------------------
        // Atualização dos blocos de informação
        // -----------------------------------------------------------------
        var slotAtual = null;

        function atualizarInfoPrestador(emailPrestador) {
            slotAtual = null;
            if (!emailPrestador) {
                if (blocoHorario) blocoHorario.innerHTML = '';
                if (blocoContato) blocoContato.innerHTML = '';
                return;
            }
            var dados = obterStorePrestadores()[emailPrestador] || {};
            slotAtual = proximoHorarioDisponivel(emailPrestador);

            if (blocoHorario) {
                blocoHorario.innerHTML = slotAtual
                    ? '<strong>' + slotAtual.label + '</strong>'
                    : '<em>Nenhuma disponibilidade nos próximos 30 dias.</em>';
            }
            if (blocoContato) {
                blocoContato.innerHTML =
                    '<i class="bi bi-telephone me-1"></i>' + (dados.tel || '—') +
                    '<br><i class="bi bi-envelope me-1"></i>' + (dados.email || emailPrestador);
            }
        }

        // -----------------------------------------------------------------
        // Modal de acesso restrito (usuário não logado)
        // -----------------------------------------------------------------
        function mostrarModalLoginNecessario(acao) {
            var msg = acao === 'hotsite'
                ? 'Para visualizar o Hotsite do prestador, você precisa estar logado.'
                : 'Para solicitar um agendamento, você precisa estar logado.';

            var loginUrl = obterPrefixoRaiz() + 'paginasSite/login.html';

            var id = 'modalLoginNecessarioAgendar';
            var ex = document.getElementById(id);
            if (ex) ex.remove();

            var modal = document.createElement('div');
            modal.className = 'modal fade'; modal.id = id; modal.setAttribute('tabindex', '-1');
            modal.innerHTML =
                '<div class="modal-dialog modal-dialog-centered">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header" style="background-color:#FFC300;color:#000;">' +
                            '<h5 class="modal-title"><i class="bi bi-lock me-2"></i>Acesso Restrito</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
                        '</div>' +
                        '<div class="modal-body"><p class="mb-0">' + msg + '</p></div>' +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>' +
                            '<a href="' + loginUrl + '" class="btn btn-warning"><i class="bi bi-box-arrow-in-right me-1"></i>Fazer Login</a>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(modal);
            new bootstrap.Modal(modal).show();
        }

        // -----------------------------------------------------------------
        // Eventos dos selects
        // -----------------------------------------------------------------
        selectTipo.addEventListener('change', function () {
            preencherPrestadores(selectTipo.value);
            atualizarInfoPrestador('');
            // Reseta o calendário ao trocar tipo
            var inpData = document.getElementById('sg-cal-data');
            if (inpData) { inpData.value = ''; _renderizarSlotsCalendario(''); }
        });

        selectPrestador.addEventListener('change', function () {
            atualizarInfoPrestador(selectPrestador.value);
            // Reseta o calendário ao trocar prestador
            var inpData = document.getElementById('sg-cal-data');
            if (inpData) { inpData.value = ''; _renderizarSlotsCalendario(''); }
        });

        // -----------------------------------------------------------------
        // CALENDÁRIO — escolha de data e horário específicos pelo cliente
        // -----------------------------------------------------------------
        // Guarda o slot escolhido via calendário; quando definido,
        // sobrescreve o "próximo horário livre" na solicitação.
        var _slotEscolhido = null;

        (function injetarCalendario() {
            // Cria o widget logo acima do .card existente
            var card = mainAgendar.querySelector('.card');
            if (!card) return;

            var wrapper = document.createElement('div');
            wrapper.id = 'sg-calendario-wrapper';
            wrapper.style.cssText =
                'margin:18px 0 12px;padding:16px 18px;' +
                'background:#f0f4ff;border:1.5px solid #c7d9f7;border-radius:10px;';
            wrapper.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                    '<i class="bi bi-calendar3" style="color:#146ADB;font-size:1.1rem;"></i>' +
                    '<strong style="font-size:.95rem;color:#1a2b4a;">Escolher data e horário</strong>' +
                    '<span style="font-size:.75rem;color:#6c757d;">(opcional — ou use o próximo horário disponível)</span>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;">' +
                    '<div>' +
                        '<label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:4px;">Data</label>' +
                        '<input type="date" id="sg-cal-data" class="form-control form-control-sm" style="min-width:160px;">' +
                    '</div>' +
                    '<div style="flex:1;min-width:220px;">' +
                        '<label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:4px;">Horário disponível</label>' +
                        '<div id="sg-cal-slots" style="display:flex;flex-wrap:wrap;gap:6px;min-height:32px;">' +
                            '<span id="sg-cal-hint" style="font-size:.8rem;color:#6c757d;">Selecione um prestador e uma data.</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div id="sg-cal-feedback" style="margin-top:8px;font-size:.83rem;"></div>';

            mainAgendar.insertBefore(wrapper, card);

            // Limita input de data: de hoje em diante
            var hoje = new Date();
            var minData = hoje.toISOString().substring(0, 10);
            var inpData = document.getElementById('sg-cal-data');
            if (inpData) inpData.min = minData;

            // Evento: troca de data
            if (inpData) {
                inpData.addEventListener('change', function () {
                    if (!selectPrestador.value) {
                        alert('Selecione um prestador antes de escolher a data.');
                        inpData.value = '';
                        return;
                    }
                    _renderizarSlotsCalendario(inpData.value);
                });
            }
        })();

        function _renderizarSlotsCalendario(dataISO) {
            var slotsEl    = document.getElementById('sg-cal-slots');
            var feedbackEl = document.getElementById('sg-cal-feedback');
            if (!slotsEl) return;

            _slotEscolhido = null;
            if (feedbackEl) feedbackEl.innerHTML = '';

            if (!dataISO) {
                slotsEl.innerHTML = '<span id="sg-cal-hint" style="font-size:.8rem;color:#6c757d;">Selecione um prestador e uma data.</span>';
                // Restaura slotAtual para o próximo livre
                if (selectPrestador.value) atualizarInfoPrestador(selectPrestador.value);
                return;
            }

            // Rejeita finais de semana
            var diaSem = new Date(dataISO + 'T12:00:00').getDay();
            if (diaSem === 0 || diaSem === 6) {
                slotsEl.innerHTML = '<span style="font-size:.82rem;color:#dc3545;"><i class="bi bi-x-circle me-1"></i>Fim de semana — prestador não atende.</span>';
                return;
            }

            // Monta mapa de horários ocupados do prestador
            var ags = obterAgendamentosDoPrestador(selectPrestador.value);
            var ocupados = {};
            ags.forEach(function (a) {
                if (a.status === 'cancelado') return;
                var ini = (a.horario || '').split(' - ')[0];
                if (ini && a.data) ocupados[a.data + ' ' + ini] = true;
            });

            var agora    = new Date();
            var ehHoje   = dataISO === agora.toISOString().substring(0, 10);
            var html     = '';
            var temLivre = false;

            for (var h = 8; h < 18; h++) {
                var hor = String(h).padStart(2, '0') + ':00';
                if (ehHoje && h <= agora.getHours()) continue; // horário passado no dia atual
                var livre = !ocupados[dataISO + ' ' + hor];
                if (livre) temLivre = true;

                html +=
                    '<button type="button" class="sg-slot-btn"' +
                    ' data-hor="' + hor + '" data-data="' + dataISO + '"' +
                    (livre ? '' : ' disabled') +
                    ' style="padding:4px 11px;border-radius:6px;font-size:.79rem;font-weight:600;border:1.5px solid ' +
                    (livre ? '#146ADB' : '#dc3545') + ';color:' +
                    (livre ? '#146ADB' : '#dc3545') + ';background:' +
                    (livre ? '#e8f0fb' : '#fee2e2') + ';cursor:' +
                    (livre ? 'pointer' : 'not-allowed') + ';opacity:' +
                    (livre ? '1' : '.5') + ';">' + hor + '</button>';
            }

            if (!html) {
                slotsEl.innerHTML = '<span style="font-size:.82rem;color:#dc3545;">Nenhum horário disponível.</span>';
                return;
            }
            slotsEl.innerHTML = html;
            if (!temLivre) {
                slotsEl.insertAdjacentHTML('beforeend',
                    '<div style="width:100%;font-size:.82rem;color:#dc3545;margin-top:4px;">Todos os horários desta data estão ocupados.</div>');
            }

            // Listeners nos botões de slot livre
            slotsEl.querySelectorAll('.sg-slot-btn:not([disabled])').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    // Desmarca seleção anterior
                    slotsEl.querySelectorAll('.sg-slot-btn').forEach(function (b) {
                        b.style.background = b.disabled ? '#fee2e2' : '#e8f0fb';
                        b.style.color      = b.disabled ? '#dc3545' : '#146ADB';
                        b.style.boxShadow  = '';
                    });
                    // Marca este como selecionado
                    btn.style.background = '#146ADB';
                    btn.style.color      = '#fff';
                    btn.style.boxShadow  = '0 2px 8px rgba(20,106,219,.35)';

                    var d   = btn.dataset.data;
                    var hor = btn.dataset.hor;
                    var fimH = String(parseInt(hor.split(':')[0]) + 1).padStart(2, '0') + ':00';

                    // Monta label legível
                    var diasNome = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
                    var mesesN   = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                    var dObj     = new Date(d + 'T12:00:00');
                    var hj       = new Date(); hj.setHours(0,0,0,0);
                    var diff     = Math.round((dObj - hj) / 86400000);
                    var label    = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã'
                                 : diasNome[dObj.getDay()] + ', ' + String(dObj.getDate()).padStart(2,'0') + '/' + mesesN[dObj.getMonth()];
                    label += ' às ' + hor;

                    _slotEscolhido = { data: d, horario: hor, label: label };
                    slotAtual = _slotEscolhido; // sobrescreve o próximo livre

                    if (blocoHorario) {
                        blocoHorario.innerHTML = '<strong style="color:#146ADB;"><i class="bi bi-calendar-check me-1"></i>' + label + ' (sua escolha)</strong>';
                    }
                    if (feedbackEl) {
                        feedbackEl.innerHTML = '<i class="bi bi-check-circle-fill me-1" style="color:#198754;"></i><strong style="color:#198754;">Horário selecionado: ' + label + '</strong>';
                    }
                });
            });
        }

        // -----------------------------------------------------------------
        // Botão "Solicitar Agendamento"
        // -----------------------------------------------------------------
        if (btnAgendar) {
            btnAgendar.addEventListener('click', function () {
                if (!estaLogado) { mostrarModalLoginNecessario('agendar'); return; }
                if (!selectPrestador.value) { alert('Por favor, selecione um prestador.'); return; }
                if (!slotAtual) { alert('Não há horários disponíveis para este prestador.'); return; }

                var nomePrestador = selectPrestador.options[selectPrestador.selectedIndex].textContent;
                var resultado = reservarAgendamento(
                    selectPrestador.value,
                    slotAtual,
                    selectTipo.value || 'Serviço',
                    usuarioLogado.nome,
                    usuarioLogado.email
                );

                if (resultado === false) {
                    // Slot foi ocupado entre a seleção e o clique — atualiza a tela
                    atualizarInfoPrestador(selectPrestador.value);
                    var inpD = document.getElementById('sg-cal-data');
                    if (inpD && inpD.value) _renderizarSlotsCalendario(inpD.value);
                    return;
                }

                alert(
                    'Agendamento solicitado com sucesso!\n\n' +
                    'Prestador: ' + nomePrestador + '\n' +
                    'Horário: ' + slotAtual.label + '\n\n' +
                    'Aguarde a confirmação do prestador.'
                );

                // Limpa seleção do calendário e atualiza próximo livre
                _slotEscolhido = null;
                var inpData = document.getElementById('sg-cal-data');
                if (inpData) { inpData.value = ''; _renderizarSlotsCalendario(''); }
                atualizarInfoPrestador(selectPrestador.value);
            });
        }

        // -----------------------------------------------------------------
        // Link "Ver Hotsite"
        // -----------------------------------------------------------------
        if (linkHotsite) {
            linkHotsite.addEventListener('click', function (e) {
                e.preventDefault();

                if (!estaLogado) { mostrarModalLoginNecessario('hotsite'); return; }
                if (!selectPrestador.value) { alert('Por favor, selecione um prestador para ver o Hotsite.'); return; }

                var path = window.location.pathname;
                var base = path.includes('/paginasCliente/') || path.includes('/paginasSite/')
                    ? '../paginasPrestador/'
                    : 'paginasPrestador/';

                window.location.href = base + 'prestadorHotsite.html?prestador=' + encodeURIComponent(selectPrestador.value);
            });
        }

        // -----------------------------------------------------------------
        // Boot: preenche tipos e pré-seleciona via query param (se houver)
        // -----------------------------------------------------------------
        preencherTipos();

        var params = new URLSearchParams(window.location.search);
        var prestadorParam = params.get('prestador');
        if (prestadorParam) {
            var dadosPre = obterStorePrestadores()[prestadorParam];
            if (dadosPre && dadosPre.categoria) {
                selectTipo.value = dadosPre.categoria;
                preencherPrestadores(dadosPre.categoria);
                selectPrestador.value = prestadorParam;
                atualizarInfoPrestador(prestadorParam);
            }
        }
    }


    // =====================================================
    // HOTSITE PÚBLICO DO PRESTADOR (prestadorHotsite.html — visão do cliente)
    // Controla acesso restrito ao botão Agendar e ao chat.
    // =====================================================
    function inicializarHotsitePublico() {
        // Identifica a página pública do hotsite pela presença de #hs-avatar
        // e ausência do campo adm (#adm-cnpj), que pertence à tela de administração.
        var hsAvatar = document.getElementById('hs-avatar');
        var admCnpj  = document.getElementById('adm-cnpj');
        if (!hsAvatar || admCnpj) return;

        var usuarioLogado = null;
        try { usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null'); } catch (e) {}
        var estaLogado = usuarioLogado && (usuarioLogado.tipo === 'cliente' || usuarioLogado.tipo === 'admin');

        var params = new URLSearchParams(window.location.search);
        var emailPrestador = params.get('prestador') || '';

        var btnAgendar  = document.querySelector('.cta-agendar');
        var btnMensagem = document.querySelector('.btn-enviar-msg');

        // -----------------------------------------------------------------
        // Modal de acesso restrito
        // -----------------------------------------------------------------
        function mostrarModalLoginHotsite(acao) {
            var msg = acao === 'mensagem'
                ? 'Para enviar uma mensagem ao prestador, você precisa estar logado.'
                : 'Para agendar um serviço, você precisa estar logado.';

            var id = 'modalLoginHotsitePublico';
            var ex = document.getElementById(id);
            if (ex) ex.remove();

            var modal = document.createElement('div');
            modal.className = 'modal fade'; modal.id = id; modal.setAttribute('tabindex', '-1');
            modal.innerHTML =
                '<div class="modal-dialog modal-dialog-centered">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header" style="background-color:#FFC300;color:#000;">' +
                            '<h5 class="modal-title"><i class="bi bi-lock me-2"></i>Acesso Restrito</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
                        '</div>' +
                        '<div class="modal-body"><p class="mb-0">' + msg + '</p></div>' +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>' +
                            '<a href="../paginasSite/login.html" class="btn btn-warning"><i class="bi bi-box-arrow-in-right me-1"></i>Fazer Login</a>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(modal);
            new bootstrap.Modal(modal).show();
        }

        // -----------------------------------------------------------------
        // Botão "Agendar Serviço"
        // -----------------------------------------------------------------
        if (btnAgendar) {
            btnAgendar.addEventListener('click', function (e) {
                e.preventDefault();
                if (!estaLogado) { mostrarModalLoginHotsite('agendar'); return; }
                // Direciona de volta para a tela de agendamento do cliente,
                // pré-selecionando o prestador atual via query param.
                var url = '../paginasCliente/clienteAgendarServicos.html';
                if (emailPrestador) url += '?prestador=' + encodeURIComponent(emailPrestador);
                window.location.href = url;
            });
        }

        // -----------------------------------------------------------------
        // Botão "Enviar Mensagem" — bloqueia para usuários não logados
        // removendo os atributos data-bs do Bootstrap antes do clique.
        // -----------------------------------------------------------------
        if (btnMensagem) {
            if (!estaLogado) {
                // Remove o data-bs-toggle para que o Bootstrap não abra o modal
                btnMensagem.removeAttribute('data-bs-toggle');
                btnMensagem.removeAttribute('data-bs-target');
                btnMensagem.addEventListener('click', function () {
                    mostrarModalLoginHotsite('mensagem');
                });
            }
            // Se logado, o data-bs-toggle original já abre o modal de chat normalmente.
        }
    }


    // =====================================================
    // NOTIFICAÇÕES — DASHBOARD DO PRESTADOR
    // (prestadorAreaExclusiva.html)
    // =====================================================
    function inicializarNotificacoesDashboardPrestador() {
        var mainEl = document.querySelector('.prest-main');
        if (!mainEl) return;
        // Só roda na área exclusiva do prestador (sem agenda-lista)
        if (document.getElementById('agenda-lista')) return;

        var usuarioLogado = null;
        try { usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null'); } catch (e) {}
        var emailPrest = usuarioLogado ? usuarioLogado.email : null;
        if (!emailPrest) return;

        // Injeta a barra de notificações antes do primeiro filho do main
        var barraId = 'sg-notif-barra-prest';
        if (!document.getElementById(barraId)) {
            var barra = document.createElement('div');
            barra.id = barraId;
            barra.style.cssText = 'margin-bottom:16px;';
            mainEl.insertBefore(barra, mainEl.firstChild);
        }

        function renderizarBarra() {
            var barra = document.getElementById(barraId);
            if (!barra) return;
            var notifs = sgObterNotificacoes(emailPrest).filter(function (n) { return !n.lida; });
            var qtdAg  = notifs.filter(function (n) { return n.tipo === 'agendamento'; }).length;
            var qtdMsg = notifs.filter(function (n) { return n.tipo === 'mensagem'; }).length;

            if (qtdAg === 0 && qtdMsg === 0) { barra.innerHTML = ''; return; }

            var html = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 16px;background:#fffbe6;border:1.5px solid #FFC300;border-radius:10px;">' +
                '<i class="bi bi-bell-fill" style="color:#e6a800;font-size:1.2rem;"></i>' +
                '<strong style="color:#7a5800;">Novas notificações:</strong>';

            if (qtdAg > 0) {
                html += '<button type="button" id="btn-notif-prest-ag" class="btn btn-warning btn-sm" style="font-size:.83rem;">' +
                    '<i class="bi bi-calendar-plus me-1"></i>' + qtdAg + ' nova(s) solicitação(ões) de agendamento' +
                '</button>';
            }
            if (qtdMsg > 0) {
                html += '<button type="button" id="btn-notif-prest-msg" class="btn btn-primary btn-sm" style="font-size:.83rem;">' +
                    '<i class="bi bi-chat-dots me-1"></i>' + qtdMsg + ' nova(s) mensagem(ns)' +
                '</button>';
            }
            html += '<button type="button" id="btn-notif-prest-all" class="btn btn-outline-secondary btn-sm" style="font-size:.83rem;margin-left:auto;">' +
                '<i class="bi bi-list-check me-1"></i>Ver todas' +
            '</button>';
            html += '</div>';
            barra.innerHTML = html;

            // Clique: solicitações de agendamento → prestadorServicosAgendados pendentes
            var btnAg = document.getElementById('btn-notif-prest-ag');
            if (btnAg) {
                btnAg.addEventListener('click', function () {
                    // Pega o primeiro agendamento pendente
                    var primeiroAg = notifs.find(function (n) { return n.tipo === 'agendamento'; });
                    var agId = primeiroAg ? (primeiroAg.dados.agendamentoId || '') : '';
                    var url = 'prestadorServicosAgendados.html?aba=pendentes' + (agId ? '&agendamentoId=' + agId : '');
                    window.location.href = url;
                });
            }

            // Clique: mensagens → prestadorServicosAgendados com chat
            var btnMsg = document.getElementById('btn-notif-prest-msg');
            if (btnMsg) {
                btnMsg.addEventListener('click', function () {
                    var primeiraMsg = notifs.find(function (n) { return n.tipo === 'mensagem'; });
                    var agId = primeiraMsg ? (primeiraMsg.dados.agendamentoId || '') : '';
                    var url = 'prestadorServicosAgendados.html' + (agId ? '?chat=' + agId : '');
                    window.location.href = url;
                });
            }

            // Clique: ver todas → abre modal com lista completa
            var btnAll = document.getElementById('btn-notif-prest-all');
            if (btnAll) {
                btnAll.addEventListener('click', function () { abrirModalNotificacoesPrest(emailPrest); });
            }
        }

        function abrirModalNotificacoesPrest(email) {
            var todasNotifs = sgObterNotificacoes(email).slice().reverse();
            var html = '';
            if (todasNotifs.length === 0) {
                html = '<p class="text-muted text-center py-3"><i class="bi bi-check2-all me-2"></i>Nenhuma notificação.</p>';
            } else {
                html = '<div class="list-group">';
                todasNotifs.forEach(function (n) {
                    var icon = 'bi-bell';
                    var cor = '#6c757d';
                    var titulo = 'Notificação';
                    var desc = '';
                    var acao = '';
                    if (n.tipo === 'agendamento') {
                        icon = 'bi-calendar-plus'; cor = '#FFC300'; titulo = 'Nova Solicitação de Agendamento';
                        desc = '<strong>' + (n.dados.clienteNome || 'Cliente') + '</strong> solicitou agendamento de <strong>' +
                            (n.dados.servico || 'serviço') + '</strong> para ' + (n.dados.label || n.dados.data || '');
                        if (n.dados.agendamentoId) {
                            acao = 'prestadorServicosAgendados.html?aba=pendentes&agendamentoId=' + n.dados.agendamentoId;
                        }
                    } else if (n.tipo === 'mensagem') {
                        icon = 'bi-chat-dots'; cor = '#146ADB'; titulo = 'Nova Mensagem';
                        desc = '<strong>' + (n.dados.clienteNome || 'Cliente') + '</strong>: ' + (n.dados.preview || '');
                        if (n.dados.agendamentoId) {
                            acao = 'prestadorServicosAgendados.html?chat=' + n.dados.agendamentoId;
                        }
                    }
                    var dt = '';
                    try { dt = new Date(n.timestamp).toLocaleString('pt-BR'); } catch (e) {}
                    html += '<div class="list-group-item list-group-item-action' + (n.lida ? '' : ' fw-bold') + '" style="border-left:4px solid ' + cor + ';margin-bottom:4px;border-radius:6px;">';
                    html += '<div class="d-flex justify-content-between align-items-start">';
                    html += '<div><i class="bi ' + icon + ' me-2" style="color:' + cor + ';"></i>' + titulo + '</div>';
                    html += '<small class="text-muted">' + dt + '</small></div>';
                    html += '<div style="margin-top:4px;font-size:.88rem;">' + desc + '</div>';
                    if (acao) {
                        html += '<div style="margin-top:6px;"><a href="' + acao + '" class="btn btn-sm btn-outline-primary" style="font-size:.8rem;">' +
                            '<i class="bi bi-arrow-right-circle me-1"></i>Ver detalhes</a></div>';
                    }
                    html += '</div>';
                });
                html += '</div>';
            }

            var idModal = 'modalNotifPrestDash';
            var ex = document.getElementById(idModal);
            if (ex) ex.remove();
            var modal = document.createElement('div');
            modal.className = 'modal fade'; modal.id = idModal; modal.setAttribute('tabindex', '-1');
            modal.innerHTML =
                '<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header" style="background:#FFC300;color:#000;">' +
                            '<h5 class="modal-title"><i class="bi bi-bell-fill me-2"></i>Minhas Notificações</h5>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
                        '</div>' +
                        '<div class="modal-body">' + html + '</div>' +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Fechar</button>' +
                            '<button type="button" class="btn btn-outline-secondary btn-sm" id="btn-marcar-todas-lidas-prest">Marcar todas como lidas</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(modal);
            var inst = new bootstrap.Modal(modal);
            inst.show();
            modal.querySelector('#btn-marcar-todas-lidas-prest').addEventListener('click', function () {
                sgMarcarTodasLidas(email);
                inst.hide();
                renderizarBarra();
            });
        }

        renderizarBarra();
        // Polling a cada 5s para capturar notificações chegando em outra aba
        setInterval(renderizarBarra, 5000);
    }

    // =====================================================
    // NOTIFICAÇÕES — DASHBOARD DO CLIENTE
    // (clienteAreaExclusiva.html)
    // =====================================================
    function inicializarNotificacoesDashboardCliente() {
        var mainEl = document.querySelector('.cli-main');
        if (!mainEl) return;
        // Só roda na área exclusiva do cliente (tem cli-pedidos-lista)
        if (!document.querySelector('.cli-pedidos-lista')) return;

        var usuarioLogado = null;
        try { usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null'); } catch (e) {}
        var emailCli = usuarioLogado ? usuarioLogado.email : null;
        if (!emailCli) return;

        var barraId = 'sg-notif-barra-cli';
        if (!document.getElementById(barraId)) {
            var barra = document.createElement('div');
            barra.id = barraId;
            barra.style.cssText = 'margin-bottom:16px;';
            mainEl.insertBefore(barra, mainEl.firstChild);
        }

        function renderizarBarra() {
            var barra = document.getElementById(barraId);
            if (!barra) return;
            var notifs = sgObterNotificacoes(emailCli).filter(function (n) { return !n.lida; });
            var qtdConf = notifs.filter(function (n) { return n.tipo === 'confirmacao' || n.tipo === 'cancelamento' || n.tipo === 'rejeicao'; }).length;
            var qtdMsg  = notifs.filter(function (n) { return n.tipo === 'mensagem'; }).length;

            if (qtdConf === 0 && qtdMsg === 0) { barra.innerHTML = ''; return; }

            var html = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 16px;background:#e8f4fd;border:1.5px solid #146ADB;border-radius:10px;">' +
                '<i class="bi bi-bell-fill" style="color:#146ADB;font-size:1.2rem;"></i>' +
                '<strong style="color:#0d3d78;">Novas notificações:</strong>';

            if (qtdConf > 0) {
                html += '<button type="button" id="btn-notif-cli-ag" class="btn btn-warning btn-sm" style="font-size:.83rem;">' +
                    '<i class="bi bi-calendar-check me-1"></i>' + qtdConf + ' atualização(ões) de agendamento' +
                '</button>';
            }
            if (qtdMsg > 0) {
                html += '<button type="button" id="btn-notif-cli-msg" class="btn btn-primary btn-sm" style="font-size:.83rem;">' +
                    '<i class="bi bi-chat-dots me-1"></i>' + qtdMsg + ' nova(s) mensagem(ns)' +
                '</button>';
            }
            html += '<button type="button" id="btn-notif-cli-all" class="btn btn-outline-secondary btn-sm" style="font-size:.83rem;margin-left:auto;">' +
                '<i class="bi bi-list-check me-1"></i>Ver todas' +
            '</button>';
            html += '</div>';
            barra.innerHTML = html;

            // Clique: confirmação/cancelamento → abre modal de agendamentos
            var btnAg = document.getElementById('btn-notif-cli-ag');
            if (btnAg) {
                btnAg.addEventListener('click', function () {
                    sgMarcarTodasLidas(emailCli);
                    renderizarBarra();
                    // Dispara o modal de agendamentos do cliente
                    var linkAg = document.getElementById('link-aguardando-confirmacao');
                    if (linkAg) linkAg.click();
                });
            }

            // Clique: mensagens → abre chat com o prestador relevante
            var btnMsg = document.getElementById('btn-notif-cli-msg');
            if (btnMsg) {
                btnMsg.addEventListener('click', function () {
                    var primeiraMsg = notifs.find(function (n) { return n.tipo === 'mensagem'; });
                    if (!primeiraMsg) return;
                    // Tenta abrir o chat pelo clienteId + prestadorId
                    var cliId = primeiraMsg.dados.clienteId;
                    if (cliId) {
                        // Encontra o pedido cujo slug corresponde
                        var pedido = document.querySelector('.cli-pedidos-item');
                        var pedidos = document.querySelectorAll('.cli-pedidos-item');
                        pedidos.forEach(function (p) {
                            // Tenta abrir o chat do primeiro item
                        });
                        // Como simplificação, abre o modal de notificações
                    }
                    abrirModalNotificacoesCli(emailCli);
                });
            }

            // Clique: ver todas → modal
            var btnAll = document.getElementById('btn-notif-cli-all');
            if (btnAll) {
                btnAll.addEventListener('click', function () { abrirModalNotificacoesCli(emailCli); });
            }
        }

        function abrirModalNotificacoesCli(email) {
            var todasNotifs = sgObterNotificacoes(email).slice().reverse();
            var html = '';
            if (todasNotifs.length === 0) {
                html = '<p class="text-muted text-center py-3"><i class="bi bi-check2-all me-2"></i>Nenhuma notificação.</p>';
            } else {
                html = '<div class="list-group">';
                todasNotifs.forEach(function (n) {
                    var icon = 'bi-bell'; var cor = '#6c757d'; var titulo = 'Notificação'; var desc = '';
                    if (n.tipo === 'confirmacao') {
                        icon = 'bi-calendar-check'; cor = '#198754'; titulo = 'Agendamento Confirmado!';
                        desc = 'Seu agendamento de <strong>' + (n.dados.servico || '') + '</strong> com <strong>' +
                            (n.dados.prestadorNome || 'Prestador') + '</strong> foi <strong style="color:#198754;">CONFIRMADO</strong>.';
                    } else if (n.tipo === 'cancelamento') {
                        icon = 'bi-calendar-x'; cor = '#dc3545'; titulo = 'Agendamento Cancelado';
                        desc = 'Seu agendamento de <strong>' + (n.dados.servico || '') + '</strong> foi <strong style="color:#dc3545;">CANCELADO</strong>.' +
                            (n.dados.motivo ? ' Motivo: ' + n.dados.motivo : '');
                    } else if (n.tipo === 'rejeicao') {
                        icon = 'bi-x-octagon'; cor = '#fd7e14'; titulo = 'Solicitação Rejeitada';
                        desc = 'Sua solicitação de <strong>' + (n.dados.servico || '') + '</strong> foi <strong style="color:#fd7e14;">REJEITADA</strong>.' +
                            (n.dados.motivo ? ' Motivo: ' + n.dados.motivo : '');
                    } else if (n.tipo === 'mensagem') {
                        icon = 'bi-chat-dots'; cor = '#146ADB'; titulo = 'Nova Mensagem do Prestador';
                        desc = '<strong>' + (n.dados.prestadorNome || 'Prestador') + '</strong>: ' + (n.dados.preview || '');
                    }
                    var dt = '';
                    try { dt = new Date(n.timestamp).toLocaleString('pt-BR'); } catch (e) {}
                    html += '<div class="list-group-item' + (n.lida ? '' : ' fw-bold') + '" style="border-left:4px solid ' + cor + ';margin-bottom:4px;border-radius:6px;">';
                    html += '<div class="d-flex justify-content-between align-items-start">';
                    html += '<div><i class="bi ' + icon + ' me-2" style="color:' + cor + ';"></i>' + titulo + '</div>';
                    html += '<small class="text-muted">' + dt + '</small></div>';
                    html += '<div style="margin-top:4px;font-size:.88rem;">' + desc + '</div>';
                    html += '</div>';
                });
                html += '</div>';
            }

            var idModal = 'modalNotifCliDash';
            var ex = document.getElementById(idModal);
            if (ex) ex.remove();
            var modal = document.createElement('div');
            modal.className = 'modal fade'; modal.id = idModal; modal.setAttribute('tabindex', '-1');
            modal.innerHTML =
                '<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header" style="background:#146ADB;color:#fff;">' +
                            '<h5 class="modal-title"><i class="bi bi-bell-fill me-2"></i>Minhas Notificações</h5>' +
                            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' +
                        '</div>' +
                        '<div class="modal-body">' + html + '</div>' +
                        '<div class="modal-footer">' +
                            '<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Fechar</button>' +
                            '<button type="button" class="btn btn-outline-secondary btn-sm" id="btn-marcar-todas-lidas-cli">Marcar todas como lidas</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(modal);
            var inst = new bootstrap.Modal(modal);
            inst.show();
            modal.querySelector('#btn-marcar-todas-lidas-cli').addEventListener('click', function () {
                sgMarcarTodasLidas(email);
                inst.hide();
                renderizarBarra();
            });
        }

        renderizarBarra();
        setInterval(renderizarBarra, 5000);
    }

    // =====================================================
    // INICIALIZAÇÃO GERAL
    // =====================================================
    inicializarNavbarSaudacao();
    inicializarHome();
    inicializarCadastro();
    inicializarLogin();
    inicializarClienteAreaExclusiva();
    inicializarPrestadorAreaExclusiva();
    inicializarPrestadorServicosAgendados();
    inicializarAvaliacoesFeitas();
    inicializarAvaliacoesRecebidas();
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
});