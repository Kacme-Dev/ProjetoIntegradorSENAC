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
        // Modal: Aguardando Confirmação
        // -----------------------------------------------------------
        function abrirModalAguardandoConfirmacao(pedidosAbertos) {
            var conteudo = '';

            if (pedidosAbertos.length === 0) {
                conteudo = '<p class="text-muted text-center py-3"><i class="bi bi-check-circle me-2"></i>Nenhum agendamento aguardando confirmação.</p>';
            } else {
                conteudo += '<p class="mb-3 text-muted">Agendamentos enviados ao prestador e aguardando confirmação:</p>';
                conteudo += '<div class="table-responsive"><table class="table table-bordered table-hover align-middle">';
                conteudo += '<thead class="table-dark"><tr>' +
                    '<th>#</th>' +
                    '<th>Serviço</th>' +
                    '<th>Profissional</th>' +
                    '<th>Data / Hora</th>' +
                    '<th>Status</th>' +
                    '</tr></thead><tbody>';

                pedidosAbertos.forEach(function (p, idx) {
                    conteudo += '<tr>' +
                        '<td>' + (idx + 1) + '</td>' +
                        '<td>' + p.servico + '</td>' +
                        '<td>' + p.profissional + '</td>' +
                        '<td>' + p.dataHora + '</td>' +
                        '<td><span class="badge" style="background-color:#0d6efd;">Em Andamento</span></td>' +
                        '</tr>';
                });

                conteudo += '</tbody></table></div>';
            }

            // AJUSTADO: Mesmo padrão do Modal "Detalhes dos Pagamentos" (#FFC300)
            var modal = criarModal(
                'modalAguardandoConfirmacao',
                '<i class="bi bi-hourglass me-2"></i>Agendamentos Aguardando Confirmação',
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
                    abrirModalAguardandoConfirmacao(stats.pedidosAbertos);
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
    // BOTÃO VOLTAR (clientePerfilAdm.html e outros)
    // =====================================================
    function inicializarBotaoVoltar() {
        document.querySelectorAll('button').forEach(function (btn) {
            if (btn.textContent.trim() === 'Voltar' && btn.id === 'btn-voltar') {
                btn.addEventListener('click', function () {
                    window.history.back();
                });
            }
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
    // FUNÇÃO: SINCRONIZAR SIDEBAR COM COLLAPSE (RESPONSIVIDADE)
    // Faz com que o botão hambúrguer (que aciona o collapse do Bootstrap
    // sobre #navbarNav) também controle a exibição da sidebar em telas
    // pequenas, unificando a responsividade dos menus e da sidebar.
    // =====================================================
    function inicializarSidebarResponsiva() {
        var navbarNav = document.getElementById('navbarNav');
        var sidebar = document.querySelector('.cli-sidebar');

        if (!navbarNav || !sidebar) return;

        navbarNav.addEventListener('show.bs.collapse', function () {
            sidebar.classList.add('cli-sidebar-show');
        });

        navbarNav.addEventListener('hide.bs.collapse', function () {
            sidebar.classList.remove('cli-sidebar-show');
        });
    }


    // =====================================================
    // INICIALIZAÇÃO GERAL
    // =====================================================
    inicializarNavbarSaudacao();
    inicializarHome();
    inicializarCadastro();
    inicializarLogin();
    inicializarClienteAreaExclusiva();
    inicializarAvaliacoesFeitas();
    inicializarAvaliacoesRecebidas();
    inicializarBotaoVoltar();
    inicializarPerfilCliente();
    inicializarSidebarResponsiva();
});