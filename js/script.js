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

        // --- Exibe saudação com nome do usuário logado ---
        const spanOla = document.querySelector('.navbar-logada-info');
        if (spanOla) {
            try {
                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
                if (usuarioLogado && usuarioLogado.nome) {
                    spanOla.textContent = 'Olá, ' + usuarioLogado.nome + '!';
                }
            } catch (e) { /* mantém texto padrão */ }
        }

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
                alert('Avaliação salva com sucesso! Ela aparecerá na página de Avaliações.');
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
    // AVALIAÇÕES RECEBIDAS (prestadorAvaliacoesRecebidas / clienteAvaliacoesRecebidas)
    // =====================================================
    function inicializarAvaliacoesRecebidas() {
        var container = document.querySelector('.container1');
        if (!container) return;

        var AVALIACOES_KEY = 'avaliacoesSalvas';

        function obterAvaliacoes() {
            try { return JSON.parse(localStorage.getItem(AVALIACOES_KEY) || '[]'); }
            catch (e) { return []; }
        }

        var avaliacoes = obterAvaliacoes();
        if (avaliacoes.length === 0) return;

        // Cabeçalho da seção dinâmica
        var headerDiv = document.createElement('div');
        headerDiv.id = 'dynamic-reviews-header';
        headerDiv.style.cssText = 'font-size:1rem; font-weight:700; color:var(--azul-principal,#146ADB); padding-bottom:8px; border-bottom:2px solid var(--azul-principal,#146ADB); margin-bottom:4px;';
        headerDiv.innerHTML = '<i class="bi bi-star-fill me-2" style="color:#ffc107"></i>Minhas Avaliações Feitas';
        container.insertBefore(headerDiv, container.firstChild);

        // Insere cards das avaliações salvas (mais recente primeiro)
        var avaliacoesRevertidas = avaliacoes.slice().reverse();
        var anchor = headerDiv.nextSibling;

        avaliacoesRevertidas.forEach(function (av) {
            var stars = '';
            for (var i = 1; i <= 5; i++) {
                stars += i <= av.nota
                    ? '<i class="bi bi-star-fill filled" style="color:#ffc107"></i>'
                    : '<i class="bi bi-star" style="color:#ccc"></i>';
            }

            var card = document.createElement('div');
            card.className = 'review-card';
            card.dataset.pedidoId = av.pedidoId;
            card.innerHTML =
                '<div class="d-flex justify-content-between align-items-center mb-2">' +
                    '<h5 class="mb-0">Profissional: ' + av.profissional + ' (' + av.servico + ')</h5>' +
                    '<span class="text-muted"><small>Data ' + av.data + '</small></span>' +
                '</div>' +
                '<div class="rating">' + stars +
                    '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6>' +
                '</div>' +
                '<p class="review-text">"' + av.comentario + '"</p>' +
                '<button type="button" class="btn btn-danger btn-excluir-dinamico me-2" data-pedido-id="' + av.pedidoId + '">Excluir Avaliação</button>';

            container.insertBefore(card, anchor);
        });

        // Delegação de evento para excluir avaliações dinâmicas
        container.addEventListener('click', function (e) {
            if (!e.target.classList.contains('btn-excluir-dinamico')) return;
            var pedidoId = e.target.dataset.pedidoId;
            if (!confirm('Tem certeza que deseja excluir esta avaliação?')) return;

            var lista = obterAvaliacoes().filter(function (a) { return a.pedidoId !== pedidoId; });
            localStorage.setItem(AVALIACOES_KEY, JSON.stringify(lista));
            e.target.closest('.review-card').remove();

            if (!container.querySelector('.review-card[data-pedido-id]')) {
                var h = document.getElementById('dynamic-reviews-header');
                if (h) h.remove();
            }
        });
    }

    // =====================================================
    // BOTÃO VOLTAR (clientePerfilAdm.html e outros)
    // =====================================================
    function inicializarBotaoVoltar() {
        document.querySelectorAll('button').forEach(function (btn) {
            if (btn.textContent.trim() === 'Voltar') {
                btn.addEventListener('click', function () {
                    window.history.back();
                });
            }
        });
    }

    // =====================================================
    // INICIALIZAÇÃO GERAL
    // =====================================================
    inicializarHome();
    inicializarCadastro();
    inicializarLogin();
    inicializarClienteAreaExclusiva();
    inicializarAvaliacoesRecebidas();
    inicializarBotaoVoltar();
});