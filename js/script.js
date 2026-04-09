document.addEventListener('DOMContentLoaded', function () {
    const USUARIOS_STORAGE_KEY = 'usuariosCadastrados';
 
    // =====================================================
    // FUNÇÕES AUXILIARES
    // =====================================================
    function obterUsuariosCadastrados() {
        return JSON.parse(localStorage.getItem(USUARIOS_STORAGE_KEY) || '{}');
    }
 
    function salvarUsuariosCadastrados(usuarios) {
        localStorage.setItem(USUARIOS_STORAGE_KEY, JSON.stringify(usuarios));
    }
 
    function estaEmPaginasSite() {
        return window.location.pathname.includes('/paginasSite/');
    }
 
    function irPara(caminhoRaiz) {
        if (estaEmPaginasSite()) {
            window.location.href = `../${caminhoRaiz}`;
        } else {
            window.location.href = caminhoRaiz;
        }
    }
 
    function irParaDentroDePaginasSite(arquivo) {
        if (estaEmPaginasSite()) {
            window.location.href = arquivo;
        } else {
            window.location.href = `paginasSite/${arquivo}`;
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
            const indiceRandomico = Math.floor(Math.random() * frasesPlaceholder.length);
            return frasesPlaceholder[indiceRandomico];
        }
 
        campoBusca.placeholder = obterFraseRandomica();
 
        setInterval(function () {
            campoBusca.placeholder = obterFraseRandomica();
        }, 3000);
    }
 
    // =====================================================
    // CADASTRO (cadastro.html)
    // =====================================================
    function inicializarCadastro() {
        const prestadorEscolha = document.getElementById('prestador-escolha');
        const prestadorFormDetalhe = document.getElementById('prestador-form');
        const prestadorCard = document.getElementById('prestador-card-completo');
 
        const clienteEscolha = document.getElementById('cliente-escolha');
        const clienteFormDetalhe = document.getElementById('cliente-form');
        const clienteCard = document.getElementById('cliente-card-completo');
 
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
                if (prestadorColuna) prestadorColuna.classList.remove('col-md-6');
                if (prestadorColuna) prestadorColuna.classList.add('col-md-8');
 
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
                if (clienteColuna) clienteColuna.classList.remove('col-md-6');
                if (clienteColuna) clienteColuna.classList.add('col-md-8');
 
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
                irParaDentroDePaginasSite('login.html?cadastro=sucesso');
            });
        }
 
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
                irParaDentroDePaginasSite('login.html?cadastro=sucesso');
            });
        }
    }
 
    // =====================================================
    // LOGIN (login.html)
    // =====================================================
    function inicializarLogin() {
        const urlParams = new URLSearchParams(window.location.search);
        const alertaContainer = document.getElementById('alerta-cadastro-sucesso');
        const formLogin = document.getElementById('form-login');
        const emailInput = document.getElementById('email-login');
        const senhaInput = document.getElementById('senha-login');
        const alertaErroContainer = document.getElementById('alerta-login-erro');
 
        if (urlParams.get('cadastro') === 'sucesso' && alertaContainer) {
            alertaContainer.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show text-center" role="alert">
                    <strong>Parabéns!</strong> Seu cadastro foi concluído. Faça login abaixo para começar!
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            `;
            history.replaceState(null, '', window.location.pathname);
        }
 
        if (!formLogin || !emailInput || !senhaInput) return;
 
        const usuariosValidos = {
            'prestador@servgo.com': { senha: 'senha123', tipo: 'prestador' },
            'cliente@servgo.com': { senha: 'senha456', tipo: 'cliente' },
            'admin@servgo.com': { senha: 'admin', tipo: 'admin' }
        };
 
        formLogin.addEventListener('submit', function (event) {
            event.preventDefault();
 
            const email = emailInput.value.trim().toLowerCase();
            const senha = senhaInput.value.trim();
 
            if (alertaErroContainer) {
                alertaErroContainer.innerHTML = '';
            }
 
            if (usuariosValidos[email] && usuariosValidos[email].senha === senha) {
                const tipo = usuariosValidos[email].tipo;
 
                if (tipo === 'admin') {
                    irPara('dashboard.html');
                    return;
                }
 
                if (tipo === 'cliente') {
                    irPara('clienteAreaExclusiva.html');
                    return;
                }
 
                if (tipo === 'prestador') {
                    irPara('prestadorHotsiteAdm.html');
                    return;
                }
            }
 
            const usuariosCadastrados = obterUsuariosCadastrados();
 
            if (usuariosCadastrados[email] && usuariosCadastrados[email].senha === senha) {
                const tipoUsuario = usuariosCadastrados[email].tipo;
 
                if (tipoUsuario === 'prestador') {
                    irPara('prestadorHotsiteAdm.html');
                    return;
                }
 
                if (tipoUsuario === 'cliente') {
                    irPara('clienteAreaExclusiva.html');
                    return;
                }
            }
 
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
    // INICIALIZAÇÃO GERAL
    // =====================================================
    inicializarHome();
    inicializarCadastro();
    inicializarLogin();
});