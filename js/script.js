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
            'prestador@servgo.com': { senha: 'senha123', tipo: 'prestador' },
            'cliente@servgo.com':   { senha: 'senha456', tipo: 'cliente'   },
            'admin@servgo.com':     { senha: 'admin',    tipo: 'admin'     }
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
                redirecionarPorTipo(usuariosFixos[email].tipo);
                return;
            }

            // 2. Verifica usuários cadastrados via formulário
            const usuariosCadastrados = obterUsuariosCadastrados();
            if (usuariosCadastrados[email] && usuariosCadastrados[email].senha === senha) {
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

    // =====================================================
    // INICIALIZAÇÃO GERAL
    // =====================================================
    inicializarHome();
    inicializarCadastro();
    inicializarLogin();
});