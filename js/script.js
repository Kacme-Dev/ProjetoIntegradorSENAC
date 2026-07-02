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
        // ── SPRINT 1 — Sessão isolada por aba ──────────────────────────
        // Chaves listadas aqui são gravadas/lidas via sessionStorage em vez
        // de localStorage. Isso garante que cada aba do navegador mantenha
        // sua própria sessão de login (admin, cliente ou prestador) de
        // forma totalmente independente, sem que uma sobrescreva a outra.
        // Os demais dados (cadastros, agendamentos, etc.) continuam em
        // localStorage normalmente, preservando o comportamento atual.
        _CHAVES_SESSAO_ABA: ['usuarioLogado', 'sg_adm_session_ts'],
        _storage: function (chave) {
            return this._CHAVES_SESSAO_ABA.indexOf(chave) >= 0 ? sessionStorage : localStorage;
        },
        get: function (chave) {
            try { return JSON.parse(this._storage(chave).getItem(chave)); } catch (e) { return null; }
        },
        set: function (chave, valor) {
            try { this._storage(chave).setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; }
        },
        remove: function (chave) { try { this._storage(chave).removeItem(chave); } catch (e) {} },
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
    // SPRINT 3 — SG_MidiaDB: armazenamento de mídias em IndexedDB
    // =========================================================
    // O localStorage (usado pelo objeto DB acima) tem cota muito pequena
    // (~5–10MB por origem), insuficiente para armazenar vídeos em base64.
    // O IndexedDB possui cota bem maior (tipicamente centenas de MB),
    // sendo adequado para guardar imagens e vídeos da Galeria de Trabalhos.
    //
    // Os registros de cadastro (usuariosCadastrados / hotsite) continuam
    // em localStorage como antes — porém o campo "galeria" passa a guardar
    // apenas referências no formato "idbmidia://<chave>", e o conteúdo
    // (data URL em base64) é salvo separadamente no IndexedDB através
    // deste módulo.
    var SG_MIDIA_DB_NOME  = 'sgMidiaDB';
    var SG_MIDIA_DB_STORE = 'midias';

    function _sgMidiaAbrirDB() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error('IndexedDB indisponível neste navegador.')); return; }
            var req = indexedDB.open(SG_MIDIA_DB_NOME, 1);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(SG_MIDIA_DB_STORE)) {
                    db.createObjectStore(SG_MIDIA_DB_STORE);
                }
            };
            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror   = function (e) { reject(e.target.error || new Error('Falha ao abrir IndexedDB.')); };
        });
    }

    var SG_MidiaDB = {
        PREFIXO: 'idbmidia://',

        /** Salva uma data URL (base64) sob a chave informada. */
        salvar: function (chave, dataUrl) {
            return _sgMidiaAbrirDB().then(function (db) {
                return new Promise(function (resolve, reject) {
                    var tx = db.transaction(SG_MIDIA_DB_STORE, 'readwrite');
                    tx.objectStore(SG_MIDIA_DB_STORE).put(dataUrl, chave);
                    tx.oncomplete = function () { resolve(true); };
                    tx.onerror    = function (e) { reject(e.target.error || new Error('Falha ao salvar mídia.')); };
                });
            });
        },

        /** Recupera a data URL (base64) salva sob a chave, ou null. */
        obter: function (chave) {
            return _sgMidiaAbrirDB().then(function (db) {
                return new Promise(function (resolve, reject) {
                    var tx = db.transaction(SG_MIDIA_DB_STORE, 'readonly');
                    var req = tx.objectStore(SG_MIDIA_DB_STORE).get(chave);
                    req.onsuccess = function () { resolve(req.result || null); };
                    req.onerror   = function (e) { reject(e.target.error || new Error('Falha ao ler mídia.')); };
                });
            });
        },

        /** Remove a mídia salva sob a chave (sem erro caso não exista). */
        remover: function (chave) {
            return _sgMidiaAbrirDB().then(function (db) {
                return new Promise(function (resolve) {
                    var tx = db.transaction(SG_MIDIA_DB_STORE, 'readwrite');
                    tx.objectStore(SG_MIDIA_DB_STORE).delete(chave);
                    tx.oncomplete = function () { resolve(true); };
                    tx.onerror    = function () { resolve(false); };
                });
            }).catch(function () { return false; });
        },

        /** Verifica se um valor é uma referência de mídia no IndexedDB. */
        ehReferencia: function (valor) {
            return typeof valor === 'string' && valor.indexOf(this.PREFIXO) === 0;
        },

        /** Extrai a chave de armazenamento a partir de uma referência. */
        chaveDe: function (valor) {
            return valor.substring(this.PREFIXO.length);
        }
    };

    // =========================================================
    // HELPERS DE USUÁRIOS
    // =========================================================
    var USUARIOS_KEY = 'usuariosCadastrados';

    function obterUsuariosCadastrados() { return DB.get(USUARIOS_KEY) || {}; }
    function salvarUsuariosCadastrados(u) { DB.set(USUARIOS_KEY, u); }

    function obterUsuarioLogado() {
        var sessao = DB.get('usuarioLogado');
        if (!sessao || !sessao.email || !sessao.tipo) return sessao;

        // ── SPRINT 1 — Regra de segurança da sessão por aba ──────────────
        // Antes de considerar a sessão local válida, confirma que o e-mail
        // ainda existe na base de cadastros E que o "tipo" da sessão
        // corresponde exatamente ao tipo cadastrado. Isso evita:
        //  - sessões forjadas/adulteradas manualmente (ex.: via console);
        //  - sessões de contas removidas ou que tiveram o tipo alterado;
        //  - escalonamento de privilégio entre admin/cliente/prestador.
        // Sessões inválidas são automaticamente encerradas (somente na
        // aba atual, sem afetar sessões válidas em outras abas).
        var cadastro = obterUsuariosCadastrados();
        var registro = cadastro[sessao.email];
        if (!registro || registro.tipo !== sessao.tipo) {
            DB.remove('usuarioLogado');
            return null;
        }
        return sessao;
    }
    function salvarUsuarioLogado(email, nome, tipo) {
        DB.set('usuarioLogado', { email: email, nome: nome, tipo: tipo });
    }
    function deslogarUsuario() {
        DB.remove('usuarioLogado');
        window.location.href = '/index.html';
    }

    // =========================================================
    // SPRINT 1 — SG_Auth: módulo centralizado de autenticação
    // Preparado para substituição por JWT/OAuth em versão futura.
    // =========================================================

    /**
     * SG_Auth — API pública de controle de acesso.
     *
     * Métodos:
     *  - estaLogado()           → boolean
     *  - ehTipo(tipo)           → boolean
     *  - exigirLogin(opcoes)    → boolean (false = acesso negado, modal exibido)
     *  - guardPagina(tipos)     → boolean (false = redirecionado para login)
     */
    var SG_Auth = {

        /**
         * Retorna o objeto do usuário logado ou null.
         * Centraliza a leitura da sessão — ponto único de troca futura.
         * @returns {Object|null}
         */
        obterUsuario: function () {
            return obterUsuarioLogado();
        },

        /**
         * Verifica se existe uma sessão de usuário ativa.
         * @returns {boolean}
         */
        estaLogado: function () {
            var usu = this.obterUsuario();
            return !!(usu && usu.email && usu.tipo);
        },

        /**
         * Verifica se o usuário logado pertence a um ou mais tipos.
         * @param {string|string[]} tipo - Ex.: 'cliente' ou ['cliente','admin']
         * @returns {boolean}
         */
        ehTipo: function (tipo) {
            var usu = this.obterUsuario();
            if (!usu) return false;
            var tipos = Array.isArray(tipo) ? tipo : [tipo];
            return tipos.indexOf(usu.tipo) >= 0;
        },

        /**
         * Exige login para uma ação pontual (ex.: clique em botão).
         * Se o usuário não estiver logado, exibe modal de aviso e retorna false.
         * Não redireciona automaticamente — aguarda ação do usuário no modal.
         *
         * @param {Object} [opcoes]
         * @param {string}   [opcoes.redirectDepoisLogin] - URL de retorno após login
         * @param {string}   [opcoes.mensagem]            - Mensagem HTML do modal
         * @param {Function} [opcoes.onNegado]            - Callback ao negar acesso
         * @returns {boolean} true = autorizado | false = acesso negado
         */
        exigirLogin: function (opcoes) {
            if (this.estaLogado()) return true;
            opcoes = opcoes || {};
            var loginUrl = '/paginasSite/login.html';
            if (opcoes.redirectDepoisLogin) {
                loginUrl += '?redirect=' + encodeURIComponent(opcoes.redirectDepoisLogin);
            }
            var mensagem = opcoes.mensagem ||
                'Para continuar, você precisa estar <strong>logado</strong> no ServGo!';
            _exibirModalAcessoRestrito(mensagem, loginUrl);
            if (typeof opcoes.onNegado === 'function') opcoes.onNegado();
            return false;
        },

        /**
         * Guard de página — verifica sessão ao carregar uma rota protegida.
         * Se o usuário não estiver logado (ou for de tipo não permitido),
         * salva a URL atual no sessionStorage e redireciona para o login.
         *
         * @param {string|string[]} [tiposPermitidos] - Tipos de usuário aceitos na página
         * @param {string}          [urlFallback]     - URL de redirecionamento (padrão: login.html)
         * @returns {boolean} true = acesso permitido | false = redirecionado
         */
        guardPagina: function (tiposPermitidos, urlFallback) {
            var usu = this.obterUsuario();
            var loginBase = urlFallback || '/paginasSite/login.html';

            if (!usu) {
                // Persiste URL atual para retorno automático pós-login
                try {
                    sessionStorage.setItem('sg_redirect_apos_login', window.location.href);
                } catch (e) { /* sessionStorage indisponível */ }
                window.location.replace(loginBase + '?acesso=restrito');
                return false;
            }

            if (tiposPermitidos) {
                var tipos = Array.isArray(tiposPermitidos) ? tiposPermitidos : [tiposPermitidos];
                if (tipos.indexOf(usu.tipo) < 0) {
                    // Logado mas com tipo incorreto
                    // Se a página exige admin, redireciona para login.html geral; senão, vai para home
                    if (tipos.length === 1 && tipos[0] === 'admin') {
                        window.location.replace(loginBase + '?acesso=restrito');
                    } else {
                        window.location.replace('/index.html');
                    }
                    return false;
                }
            }

            return true; // acesso autorizado
        }
    };

    /**
     * Exibe modal padrão de "Acesso Restrito" com botão de login.
     * Utilizado por SG_Auth.exigirLogin() e ações pontuais.
     *
     * @param {string} mensagem - HTML da mensagem exibida no corpo do modal
     * @param {string} loginUrl - URL completa do botão "Fazer Login"
     */
    function _exibirModalAcessoRestrito(mensagem, loginUrl) {
        var id = 'sg-modal-acesso-restrito';
        var ex = document.getElementById(id);
        if (ex) ex.remove(); // evita duplicação

        var modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = id;
        modal.setAttribute('tabindex', '-1');
        modal.setAttribute('aria-labelledby', id + '-titulo');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('role', 'dialog');
        modal.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content">' +

            /* Cabeçalho */
            '<div class="modal-header" style="background:#FFC300;color:#000;">' +
            '<h5 class="modal-title" id="' + id + '-titulo">' +
            '<i class="bi bi-lock-fill me-2"></i>Acesso Restrito</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>' +
            '</div>' +

            /* Corpo */
            '<div class="modal-body">' +
            '<p>' + mensagem + '</p>' +
            '<p class="text-muted" style="font-size:.85rem;">' +
            '<i class="bi bi-info-circle me-1"></i>' +
            'Faça login ou crie sua conta gratuitamente para acessar este recurso.' +
            '</p>' +
            '</div>' +

            /* Rodapé */
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>' +
            '<a href="' + loginUrl + '" class="btn btn-warning">' +
            '<i class="bi bi-box-arrow-in-right me-1"></i>Fazer Login / Cadastro' +
            '</a>' +
            '</div>' +

            '</div></div>';

        document.body.appendChild(modal);
        new bootstrap.Modal(modal).show();
    }

    // =========================================================
    // SPRINT 2 — NEWSLETTER
    // Armazena e-mails inscritos, registra disparos e processa
    // descadastro via parâmetro ?unsubscribe= na URL.
    // =========================================================
    var SG_NEWSLETTER_KEY  = 'sgNewsletterInscritos';
    var SG_NEWSLETTER_LOG  = 'sgNewsletterDisparos';

    /** Retorna array de objetos { email, dataInscricao } */
    function sgNewsletterObterInscritos() { return DB.get(SG_NEWSLETTER_KEY) || []; }
    function sgNewsletterSalvarInscritos(arr) { DB.set(SG_NEWSLETTER_KEY, arr); }

    /** Retorna log de disparos: array de { noticiaId, titulo, dataDisparo, destinatarios[] } */
    function sgNewsletterObterDisparos() { return DB.get(SG_NEWSLETTER_LOG) || []; }
    function sgNewsletterSalvarDisparos(arr) { DB.set(SG_NEWSLETTER_LOG, arr); }

    /**
     * Inscreve um e-mail na newsletter.
     * @param {string} email
     * @returns {'ok'|'duplicado'|'invalido'}
     */
    function sgNewsletterInscrever(email) {
        email = (email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'invalido';
        var inscritos = sgNewsletterObterInscritos();
        if (inscritos.some(function(i){ return i.email === email; })) return 'duplicado';
        inscritos.push({ email: email, dataInscricao: new Date().toISOString() });
        sgNewsletterSalvarInscritos(inscritos);
        return 'ok';
    }

    /**
     * Remove um e-mail da newsletter (descadastro).
     * @param {string} email
     */
    function sgNewsletterDescadastrar(email) {
        email = (email || '').trim().toLowerCase();
        if (!email) return;
        var inscritos = sgNewsletterObterInscritos().filter(function(i){ return i.email !== email; });
        sgNewsletterSalvarInscritos(inscritos);
    }

    /**
     * Gera o corpo HTML do e-mail de newsletter para uma notícia.
     * Inclui link de descadastro com parâmetro ?unsubscribe=<email codificado>.
     *
     * NOTA: Como esta é uma aplicação front-end sem servidor de e-mail,
     * o "envio" é simulado: registra o disparo no localStorage e exibe
     * no painel admin o log de e-mails que seriam enviados.
     * Para envio real, substitua _sgNewsletterDisparar() por uma chamada
     * fetch() a um serviço como SendGrid, Mailchimp ou similar.
     *
     * @param {Object} noticia
     * @param {string} emailDestino
     * @returns {string} HTML do corpo do e-mail
     */
    function sgNewsletterGerarCorpoEmail(noticia, emailDestino) {
        var baseUrl = window.location.origin;
        var unsubUrl = baseUrl + '/index.html?unsubscribe=' + encodeURIComponent(emailDestino);
        var imgHtml = noticia.imagemUrl
            ? '<img src="' + noticia.imagemUrl + '" alt="Imagem da matéria" style="width:100%;max-height:220px;object-fit:cover;border-radius:6px;margin-bottom:16px;">'
            : '';
        return '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"><title>' + noticia.titulo + '</title></head>' +
            '<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0;">' +
            '<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">' +
            '<div style="background:#146ADB;padding:20px 28px;">' +
                '<span style="font-size:1.5rem;font-weight:800;color:#fff;">Serv<span style="color:#FFC300;">Go!</span></span>' +
                '<span style="color:#ffffffaa;font-size:.85rem;margin-left:12px;">Conteúdo Exclusivo</span>' +
            '</div>' +
            '<div style="padding:28px 32px;">' +
                imgHtml +
                '<span style="background:#e8f0fe;color:#146ADB;font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:20px;">' + (noticia.categoria||'Novidades') + '</span>' +
                '<h2 style="font-size:1.35rem;color:#212529;margin:12px 0 8px;">' + noticia.titulo + '</h2>' +
                '<p style="color:#555;line-height:1.6;margin:0 0 18px;">' + noticia.resumo + '</p>' +
                (noticia.conteudo ? '<p style="color:#444;line-height:1.7;font-size:.95rem;">' + noticia.conteudo + '</p>' : '') +
                '<p style="color:#888;font-size:.82rem;margin-top:20px;"><i>Por ' + (noticia.autor||'Equipe ServGo!') + ' · ' + (noticia.dataPublicacao||'') + '</i></p>' +
            '</div>' +
            '<div style="background:#f0f0f0;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">' +
                '<p style="color:#888;font-size:.8rem;margin:0;">Você está recebendo este e-mail porque se inscreveu na newsletter do ServGo!</p>' +
                '<p style="margin:8px 0 0;"><a href="' + unsubUrl + '" style="color:#dc3545;font-size:.8rem;text-decoration:underline;">Para não receber mais esse conteúdo, clique aqui</a></p>' +
            '</div>' +
            '</div></body></html>';
    }

    /**
     * Registra o disparo da notícia para todos os inscritos no log do localStorage.
     * Em produção: substituir pelo envio real via API de e-mail.
     * @param {Object} noticia
     * @returns {number} quantidade de destinatários
     */
    function _sgNewsletterDisparar(noticia) {
        var inscritos = sgNewsletterObterInscritos();
        if (inscritos.length === 0) return 0;
        var disparos = sgNewsletterObterDisparos();
        // Evita reenvio da mesma notícia
        var jaDisparado = disparos.some(function(d){ return d.noticiaId === noticia.id; });
        if (jaDisparado) return 0;
        disparos.push({
            noticiaId:    noticia.id,
            titulo:       noticia.titulo,
            dataDisparo:  new Date().toISOString(),
            destinatarios: inscritos.map(function(i){ return i.email; })
        });
        sgNewsletterSalvarDisparos(disparos);
        return inscritos.length;
    }

    /**
     * Verifica se a URL contém ?unsubscribe= e processa o descadastro automaticamente.
     * Chamado no DOMContentLoaded para todas as páginas.
     */
    function sgNewsletterProcessarDescadastroUrl() {
        var params = new URLSearchParams(window.location.search);
        var emailParam = params.get('unsubscribe');
        if (!emailParam) return;
        var email = decodeURIComponent(emailParam).trim().toLowerCase();
        sgNewsletterDescadastrar(email);
        // Remove o parâmetro da URL sem recarregar a página
        history.replaceState(null, '', window.location.pathname);
        // Exibe toast de confirmação
        setTimeout(function(){
            exibirToast('E-mail <strong>' + email + '</strong> removido da newsletter com sucesso.');
        }, 600);
    }

    /**
     * Inicializa os formulários de newsletter nas páginas Home / indexCliente / indexPrestador.
     * Suporta os três IDs de formulário usados nas respectivas páginas.
     */
    function inicializarFormsNewsletter() {
        // Processa descadastro via URL primeiro
        sgNewsletterProcessarDescadastroUrl();

        var pares = [
            { formId: 'formNewsletterHome',      inputId: 'inputNewsletterHome',      alertaId: 'alertaNewsletterHome' },
            { formId: 'formNewsletterCliente',   inputId: 'inputNewsletterCliente',   alertaId: 'alertaNewsletterCliente' },
            { formId: 'formNewsletterPrestador', inputId: 'inputNewsletterPrestador', alertaId: 'alertaNewsletterPrestador' }
        ];

        pares.forEach(function(p) {
            var form   = document.getElementById(p.formId);
            var input  = document.getElementById(p.inputId);
            var alerta = document.getElementById(p.alertaId);
            if (!form || !input || !alerta) return;

            form.addEventListener('submit', function(e) {
                e.preventDefault();
                var email = input.value.trim();
                var resultado = sgNewsletterInscrever(email);
                alerta.style.display = 'block';
                if (resultado === 'ok') {
                    alerta.innerHTML = '<span class="badge bg-success px-3 py-2" style="font-size:.9rem;"><i class="bi bi-check-circle me-1"></i>E-mail cadastrado! Você receberá nossos conteúdos exclusivos.</span>';
                    input.value = '';
                } else if (resultado === 'duplicado') {
                    alerta.innerHTML = '<span class="badge bg-warning text-dark px-3 py-2" style="font-size:.9rem;"><i class="bi bi-exclamation-circle me-1"></i>Este e-mail já está cadastrado na nossa newsletter.</span>';
                } else {
                    alerta.innerHTML = '<span class="badge bg-danger px-3 py-2" style="font-size:.9rem;"><i class="bi bi-x-circle me-1"></i>Por favor, informe um e-mail válido.</span>';
                }
                setTimeout(function(){ alerta.style.display = 'none'; }, 5000);
            });
        });
    }
    // Verifica se a URL atual requer autenticação e redireciona
    // para o login caso o usuário não esteja logado.
    //
    // Rotas protegidas:
    //   /paginasCliente/*              → tipos: cliente, admin
    //   /paginasPrestador/*            → tipos: prestador, admin
    //   /paginasAdministrador/*        → tipo: admin
    //   /paginasSite/dashboardAdmin.html → tipo: admin (legado — redireciona para adminGerenciamento)
    //
    // Rotas públicas (sem guard):
    //   /index.html, /paginasSite/agendarServicos.html,
    //   /paginasPrestador/prestadorHotsite.html,
    //   /paginasSite/avaliacao.html, /paginasSite/contatoSite.html,
    //   /paginasSite/faqSite.html, /paginasSite/login.html,
    //   /paginasSite/cadastro.html
    // =========================================================
    function inicializarGuardPaginasRestritas() {
        var path = window.location.pathname;

        /* Páginas dentro de /paginasPrestador/ que SÃO públicas (hotsite) */
        var EXCECOES_PRESTADOR = [
            'prestadorHotsite.html'
        ];

        /* Regras de proteção: padrão de caminho → tipos de usuário permitidos */
        var regras = [
            { padrao: '/paginasCliente/',       tipos: ['cliente', 'admin'] },
            { padrao: '/paginasPrestador/',      tipos: ['prestador', 'admin'] },
            { padrao: '/paginasAdministrador/',  tipos: ['admin'],  loginUrl: '/paginasSite/login.html' },
            { padrao: 'dashboardAdmin',          tipos: ['admin'],  loginUrl: '/paginasSite/login.html' },
            { padrao: 'adminGerenciamento',      tipos: ['admin'],  loginUrl: '/paginasSite/login.html' }
        ];

        /* Verifica se a rota atual corresponde a alguma regra */
        var regraAtiva = null;
        for (var i = 0; i < regras.length; i++) {
            if (path.includes(regras[i].padrao)) {
                regraAtiva = regras[i];
                break;
            }
        }

        if (!regraAtiva) return; // página pública — sem restrição

        /* Verifica exceções (páginas públicas dentro de rotas protegidas) */
        var isExcecao = EXCECOES_PRESTADOR.some(function (exc) {
            return path.includes(exc);
        });
        if (isExcecao) return; // é uma página pública, libera acesso

        /* Executa o guard — redireciona se não autenticado ou tipo incorreto */
        SG_Auth.guardPagina(regraAtiva.tipos, regraAtiva.loginUrl || null);
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
    function sgMarcarNotifLidaPorId(email, notifId) {
        if (!email || !notifId) return;
        var lista = sgObterNotificacoes(email);
        lista.forEach(function (n) { if (n.id === notifId) n.lida = true; });
        sgSalvarNotificacoes(email, lista);
    }

    // =========================================================
    // AGENDAMENTOS — helpers compartilhados
    // =========================================================
    function obterAgendamentosPrestador(emailPrest) {
        var chave = 'agendamentos_' + emailPrest;
        return DB.get(chave) || [];
    }
    function salvarAgendamentosPrestador(emailPrest, ags) {
        DB.set('agendamentos_' + emailPrest, ags);
    }
    function _atualizarStatusClienteAgendamento(agId, emailCliente, novoStatus, extra) {
        if (!emailCliente || !agId) return;
        var cliAgs = DB.get('clienteAgendamentos_' + emailCliente) || [];
        var idx = cliAgs.findIndex(function (a) { return a.id === agId; });
        if (idx >= 0) {
            cliAgs[idx].status = novoStatus;
            cliAgs[idx].atualizadoEm = new Date().toISOString();
            if (extra && typeof extra === 'object') {
                Object.keys(extra).forEach(function (k) { cliAgs[idx][k] = extra[k]; });
            }
            DB.set('clienteAgendamentos_' + emailCliente, cliAgs);
        }
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

    /**
     * Termos indexados para busca na Home (index.html).
     * Cada entrada contém palavras-chave e a URL de destino correspondente.
     */
    var SG_BUSCA_HOME = [
        { termos: ['saúde','saude','médico','medico','clínica','clinica','exame','consulta','hospital'], url: 'paginasSite/agendarServicos.html?tipo=Sa%C3%BAde' },
        { termos: ['beleza','salão','salao','cabelo','manicure','estética','estetica','unhas','maquiagem'], url: 'paginasSite/agendarServicos.html?tipo=Beleza' },
        { termos: ['manutenção','manutencao','predial','encanador','encanamento','pedreiro','pintor','obra','reforma','reparo'], url: 'paginasSite/agendarServicos.html?tipo=Manuten%C3%A7%C3%A3o%20Predial' },
        { termos: ['ti','tecnologia','software','desenvolvimento','informática','informatica','computador','cibersegurança','ciberseguranca','rede','infraestrutura'], url: 'paginasSite/agendarServicos.html?tipo=TI' },
        { termos: ['lazer','entretenimento','passeio','show','evento','diversão','diversao','atividade'], url: 'paginasSite/agendarServicos.html?tipo=Lazer' },
        { termos: ['alimentação','alimentacao','restaurante','comida','delivery','marmita','cardápio','cardapio','refeição','refeicao'], url: 'paginasSite/agendarServicos.html?tipo=Alimenta%C3%A7%C3%A3o' },
        { termos: ['design','gráfico','grafico','identidade visual','logo','logotipo','web design','arte'], url: 'paginasSite/agendarServicos.html?tipo=Design' },
        { termos: ['segurança','seguranca','vigilância','vigilancia','câmera','camera','alarme','monitoramento'], url: 'paginasSite/agendarServicos.html?tipo=Seguran%C3%A7a' },
        { termos: ['logística','logistica','entrega','frete','transporte','mudança','mudanca','motoboy'], url: 'paginasSite/agendarServicos.html?tipo=Log%C3%ADstica' },
        { termos: ['consultoria','consultor','assessoria','estratégia','estrategia','gestão','gestao','mentoria'], url: 'paginasSite/agendarServicos.html?tipo=Consultoria' },
        { termos: ['construção','construcao','obra civil','engenharia','arquitetura','projeto'], url: 'paginasSite/agendarServicos.html?tipo=Constru%C3%A7%C3%A3o' }
    ];

    /**
     * Engine central de busca reutilizável pelas três páginas home.
     * Normaliza acentos para comparação tolerante.
     */
    function _executarBuscaSite(query, indice, alertaId, prefixoRota) {
        var alerta = document.getElementById(alertaId);
        if (!alerta) return;
        var q = (query || '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!q) {
            alerta.style.display = 'block';
            alerta.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>Por favor, digite algo para buscar.';
            return;
        }
        var destino = null;
        for (var i = 0; i < indice.length; i++) {
            var entrada = indice[i];
            for (var j = 0; j < entrada.termos.length; j++) {
                var termo = entrada.termos[j].toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (q.includes(termo) || termo.includes(q)) { destino = entrada.url; break; }
            }
            if (destino) break;
        }
        if (destino) {
            alerta.style.display = 'none';
            window.location.href = (prefixoRota || '') + destino;
        } else {
            alerta.style.display = 'block';
            alerta.innerHTML =
                '<i class="bi bi-search me-2"></i>' +
                'O conteúdo "<strong>' + query.trim() + '</strong>" não foi encontrado. ' +
                'Tente buscar por: <em>Saúde, Beleza, TI, Lazer, Alimentação, Manutenção, Design, Segurança, Logística, Consultoria ou Construção</em>.';
        }
    }

    function inicializarHome() {
        var frases = ["Agende sua consulta médica aqui.", "Encontre o especialista de saúde ideal.", "Busque clínicas e exames disponíveis.", "Descubra salões e serviços de beleza.", "Procure por manicure, cabelo ou estética.", "Confira as últimas tendências em beleza.", "Precisa de um eletricista ou encanador?", "Orçamento rápido para reformas e reparos.", "Serviços de manutenção predial e civil.", "Soluções em software e desenvolvimento.", "Apoio técnico para problemas de TI.", "Busque por cibersegurança e infraestrutura.", "Sugestões de passeios e entretenimento.", "Onde se divertir neste fim de semana?", "Encontre eventos, shows e atividades.", "Descubra restaurantes e deliverys.", "Cardápios, pratos e culinárias diversas.", "Onde comer hoje? Pesquise aqui!"];
        var campo = document.getElementById('campoBuscaHome') || document.getElementById('campoBusca') || document.querySelector('.input-group input.form-control[aria-label="Busca"]');
        if (!campo) return;
        campo.placeholder = frases[Math.floor(Math.random() * frases.length)];
        setInterval(function () { campo.placeholder = frases[Math.floor(Math.random() * frases.length)]; }, 3000);
        // Busca funcional — Home
        var btnBuscar = document.getElementById('btnBuscarHome');
        if (btnBuscar) {
            btnBuscar.addEventListener('click', function () {
                _executarBuscaSite(campo.value, SG_BUSCA_HOME, 'alertaBuscaHome', '');
            });
        }
        campo.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') _executarBuscaSite(campo.value, SG_BUSCA_HOME, 'alertaBuscaHome', '');
        });
    }

    // =========================================================
    // SPRINT 1 — Busca nas páginas indexCliente e indexPrestador
    // =========================================================
    var SG_BUSCA_CLIENTE = [
        { termos: ['saúde','saude','médico','medico','clínica','clinica','exame','consulta','hospital'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Sa%C3%BAde' },
        { termos: ['beleza','salão','salao','cabelo','manicure','estética','estetica','unhas','maquiagem'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Beleza' },
        { termos: ['manutenção','manutencao','predial','encanador','encanamento','pedreiro','pintor','obra','reforma','reparo'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Manuten%C3%A7%C3%A3o%20Predial' },
        { termos: ['ti','tecnologia','software','desenvolvimento','informática','informatica','computador','cibersegurança','ciberseguranca','rede','infraestrutura'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=TI' },
        { termos: ['lazer','entretenimento','passeio','show','evento','diversão','diversao','atividade'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Lazer' },
        { termos: ['alimentação','alimentacao','restaurante','comida','delivery','marmita','cardápio','cardapio','refeição','refeicao'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Alimenta%C3%A7%C3%A3o' },
        { termos: ['design','gráfico','grafico','identidade visual','logo','logotipo','web design','arte'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Design' },
        { termos: ['segurança','seguranca','vigilância','vigilancia','câmera','camera','alarme','monitoramento'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Seguran%C3%A7a' },
        { termos: ['logística','logistica','entrega','frete','transporte','mudança','mudanca','motoboy'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Log%C3%ADstica' },
        { termos: ['consultoria','consultor','assessoria','estratégia','estrategia','gestão','gestao','mentoria'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Consultoria' },
        { termos: ['construção','construcao','obra civil','engenharia','arquitetura','projeto'], url: '/paginasCliente/clienteAgendarServicos.html?tipo=Constru%C3%A7%C3%A3o' }
    ];

    var SG_BUSCA_PRESTADOR = [
        { termos: ['saúde','saude','médico','medico','clínica','clinica','exame','consulta','hospital'], url: '/paginasSite/agendarServicos.html?tipo=Sa%C3%BAde' },
        { termos: ['beleza','salão','salao','cabelo','manicure','estética','estetica','unhas','maquiagem'], url: '/paginasSite/agendarServicos.html?tipo=Beleza' },
        { termos: ['manutenção','manutencao','predial','encanador','encanamento','pedreiro','pintor','obra','reforma','reparo'], url: '/paginasSite/agendarServicos.html?tipo=Manuten%C3%A7%C3%A3o%20Predial' },
        { termos: ['ti','tecnologia','software','desenvolvimento','informática','informatica','computador','cibersegurança','ciberseguranca','rede','infraestrutura'], url: '/paginasSite/agendarServicos.html?tipo=TI' },
        { termos: ['lazer','entretenimento','passeio','show','evento','diversão','diversao','atividade'], url: '/paginasSite/agendarServicos.html?tipo=Lazer' },
        { termos: ['alimentação','alimentacao','restaurante','comida','delivery','marmita','cardápio','cardapio','refeição','refeicao'], url: '/paginasSite/agendarServicos.html?tipo=Alimenta%C3%A7%C3%A3o' },
        { termos: ['design','gráfico','grafico','identidade visual','logo','logotipo','web design','arte'], url: '/paginasSite/agendarServicos.html?tipo=Design' },
        { termos: ['segurança','seguranca','vigilância','vigilancia','câmera','camera','alarme','monitoramento'], url: '/paginasSite/agendarServicos.html?tipo=Seguran%C3%A7a' },
        { termos: ['logística','logistica','entrega','frete','transporte','mudança','mudanca','motoboy'], url: '/paginasSite/agendarServicos.html?tipo=Log%C3%ADstica' },
        { termos: ['consultoria','consultor','assessoria','estratégia','estrategia','gestão','gestao','mentoria'], url: '/paginasSite/agendarServicos.html?tipo=Consultoria' },
        { termos: ['construção','construcao','obra civil','engenharia','arquitetura','projeto'], url: '/paginasSite/agendarServicos.html?tipo=Constru%C3%A7%C3%A3o' }
    ];

    function inicializarBuscaIndexCliente() {
        var campo = document.getElementById('campoBuscaCliente');
        var btn   = document.getElementById('btnBuscarCliente');
        if (!campo || !btn) return;
        btn.addEventListener('click', function () {
            _executarBuscaSite(campo.value, SG_BUSCA_CLIENTE, 'alertaBuscaCliente', '');
        });
        campo.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') _executarBuscaSite(campo.value, SG_BUSCA_CLIENTE, 'alertaBuscaCliente', '');
        });
    }

    function inicializarBuscaIndexPrestador() {
        var campo = document.getElementById('campoBuscaPrestador');
        var btn   = document.getElementById('btnBuscarPrestador');
        if (!campo || !btn) return;
        btn.addEventListener('click', function () {
            _executarBuscaSite(campo.value, SG_BUSCA_PRESTADOR, 'alertaBuscaPrestador', '');
        });
        campo.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') _executarBuscaSite(campo.value, SG_BUSCA_PRESTADOR, 'alertaBuscaPrestador', '');
        });
    }

    // =========================================================
    // Sprint 2 — Roteamento de categorias na Home
    // Os links em index.html já apontam diretamente para
    // agendarServicos.html via href. O guard de sessão dentro
    // dessa página redireciona clientes logados para
    // clienteAgendarServicos.html preservando o ?tipo=.
    // Esta função é mantida apenas para compatibilidade futura.
    // =========================================================
    function inicializarIndexHome() {
        // Sem interceptação de clique: os hrefs já fazem o roteamento correto.
        // agendarServicos.html → guard redireciona logados para clienteAgendarServicos.html
    }

    // =========================================================
    // CADASTRO
    // =========================================================
    // =========================================================
    // SG_Trial — Gerenciamento de Trial e Assinaturas
    // =========================================================
    var SG_Trial = (function () {
        var PLANOS = [
            {
                id: 'basico',
                nome: 'Plano Básico',
                preco: 'R$ 49,90/mês',
                descricao: 'Hotsite ativo, agendamentos ilimitados, suporte por e-mail.',
                destaque: false,
                cor: '#146ADB'
            },
            {
                id: 'profissional',
                nome: 'Plano Profissional',
                preco: 'R$ 89,90/mês',
                descricao: 'Tudo do Básico + destaque no catálogo, galeria de fotos ampliada, relatórios mensais.',
                destaque: true,
                cor: '#FFC300'
            },
            {
                id: 'premium',
                nome: 'Plano Premium',
                preco: 'R$ 139,90/mês',
                descricao: 'Tudo do Profissional + suporte prioritário 24h, selo verificado, campanhas de divulgação.',
                destaque: false,
                cor: '#198754'
            }
        ];

        var TRIAL_DIAS   = 30;
        var AVISO_DIAS   = 5; // começa a avisar quando faltam 5 dias
        var CARENCIA_DIAS = 90; // carência para reativação do plano gratuito após cancelamento

        // ── SPRINT 1 — Lê configuração editada pelo admin (sgTrialConfig) ──
        // O admin pode alterar TRIAL_DIAS e CARENCIA_DIAS pelo painel de
        // Planos & Contratos. Os valores editados são persistidos em
        // localStorage sob 'sgTrialConfig' e têm prioridade sobre os padrões.
        (function() {
            try {
                var cfg = JSON.parse(localStorage.getItem('sgTrialConfig'));
                if (cfg && typeof cfg === 'object') {
                    if (typeof cfg.trialDias === 'number' && cfg.trialDias >= 1)   TRIAL_DIAS    = cfg.trialDias;
                    if (typeof cfg.carenciaDias === 'number' && cfg.carenciaDias >= 0) CARENCIA_DIAS = cfg.carenciaDias;
                }
            } catch(e) {}
        }());

        function verificarStatus(email, dadosUsu) {
            // SPRINT 2 — resolve transições pendentes (vigência / troca / cancelamento)
            // antes de avaliar o status, garantindo consistência em toda a aplicação.
            try {
                if (window.SG_Plano && email) {
                    var _resolv = window.SG_Plano.resolver(email);
                    if (_resolv) dadosUsu = _resolv;
                }
            } catch (e) {}
            // Assinatura ativa — acesso conforme o plano vigente
            if (dadosUsu.assinatura && dadosUsu.assinatura.ativa) {
                if (dadosUsu.assinatura.plano === 'gratuito') {
                    return { bloqueado: false, diasRestantes: 999, motivo: 'gratuito' };
                }
                return { bloqueado: false, diasRestantes: 999, motivo: 'assinante' };
            }
            // Assinatura cancelada — verifica carência de 90 dias para plano gratuito
            if (dadosUsu.assinatura && dadosUsu.assinatura.cancelada) {
                var dataCancelamento = dadosUsu.assinatura.dataCancelamento
                    ? new Date(dadosUsu.assinatura.dataCancelamento)
                    : null;
                var planoAnt = dadosUsu.assinatura.planoAnterior || null;
                // SPRINT 2 — Carência universal: após o cancelamento efetivado (fim da
                // vigência), o Plano Gratuito só é liberado depois de CARENCIA_DIAS
                // corridos. A reativação de um plano pago (mesmo ou novo) é permitida
                // a qualquer momento, iniciando um novo ciclo do zero.
                if (dataCancelamento) {
                    var agora       = new Date();
                    var diffDias    = Math.floor((agora - dataCancelamento) / (1000 * 60 * 60 * 24));
                    var diasRestCarencia = CARENCIA_DIAS - diffDias;
                    if (diasRestCarencia > 0) {
                        return {
                            bloqueado: true, diasRestantes: 0,
                            motivo: 'cancelado_carencia',
                            diasCarenciaRestantes: diasRestCarencia,
                            dataCancelamento: dataCancelamento.toISOString(),
                            planoAnterior: planoAnt
                        };
                    }
                    return {
                        bloqueado: true, diasRestantes: 0,
                        motivo: 'cancelado', diasCarenciaRestantes: 0,
                        dataCancelamento: dataCancelamento.toISOString(),
                        planoAnterior: planoAnt
                    };
                }
                return {
                    bloqueado: true, diasRestantes: 0,
                    motivo: 'cancelado', diasCarenciaRestantes: 0,
                    planoAnterior: planoAnt, dataCancelamento: null
                };
            }
            // Sem trialInicio — prestador recém-cadastrado que optou pelo trial gratuito
            if (!dadosUsu.trialInicio) {
                return { bloqueado: false, diasRestantes: TRIAL_DIAS, motivo: 'trial_gratuito' };
            }
            var inicio = new Date(dadosUsu.trialInicio);
            var agora  = new Date();
            var diffMs = agora - inicio;
            var diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            var restantes = TRIAL_DIAS - diffDias;
            if (restantes <= 0) {
                return { bloqueado: true, diasRestantes: 0, motivo: 'trial_expirado' };
            }
            return { bloqueado: false, diasRestantes: restantes, motivo: 'trial' };
        }

        function deveAvisar(diasRestantes) {
            return diasRestantes <= AVISO_DIAS && diasRestantes > 0;
        }

        function obterPlanos() {
            // Prioriza configuração editada pelo admin (sgPlanosConfig)
            try {
                var cfg = JSON.parse(localStorage.getItem('sgPlanosConfig'));
                if (cfg && Array.isArray(cfg) && cfg.length > 0) return cfg;
            } catch(e) {}
            return PLANOS;
        }

        function obterPlano(id) {
            return PLANOS.filter(function(p){ return p.id === id; })[0] || null;
        }

        return { verificarStatus: verificarStatus, deveAvisar: deveAvisar, obterPlanos: obterPlanos, obterPlano: obterPlano, TRIAL_DIAS: TRIAL_DIAS, CARENCIA_DIAS: CARENCIA_DIAS };
    }());

    // =========================================================
    // SPRINT 2 — SG_Plano: ciclo de vida da assinatura do prestador
    // ---------------------------------------------------------
    // Centraliza vigência, troca de plano agendada (upgrade /
    // downgrade / volta ao gratuito), cancelamento com carência e
    // renovação automática. As transições são aplicadas "on read"
    // (resolver) — a cada login/carregamento, o que estiver vencido
    // é efetivado e persistido. Exposto em window para que os
    // scripts inline das páginas (planosContrato, prestadorMeuPlano,
    // login) usem EXATAMENTE a mesma lógica, eliminando divergências.
    // =========================================================
    var SG_Plano = (function () {
        var CICLO_DIAS = 30; // duração da vigência de um ciclo pago (mensal)
        function _carencia() { return (typeof SG_Trial.CARENCIA_DIAS === 'number') ? SG_Trial.CARENCIA_DIAS : 90; }

        var RANK  = { gratuito: 0, trial: 0, basico: 1, profissional: 2, premium: 3 };
        var NOMES = { gratuito: 'Plano Gratuito', trial: 'Trial Gratuito (30 dias)', basico: 'Plano Básico', profissional: 'Plano Profissional', premium: 'Plano Premium' };

        function _hoje()        { return new Date(); }
        function _addDias(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
        function _iso(d)        { return d.toISOString(); }
        function fmt(iso)       { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return '—'; } }
        function nomePlano(id)  { return NOMES[id] || ((SG_Trial.obterPlano(id) || {}).nome) || id || '—'; }
        function rank(id)       { return (RANK[id] != null) ? RANK[id] : 1; }
        function tipoMudanca(atual, destino) {
            if (destino === 'gratuito') return 'gratuito';
            if (rank(destino) > rank(atual)) return 'upgrade';
            if (rank(destino) < rank(atual)) return 'downgrade';
            return 'igual';
        }

        function _usuarios() { try { return JSON.parse(localStorage.getItem(USUARIOS_KEY) || '{}'); } catch (e) { return {}; } }
        function _salvar(o)  { try { localStorage.setItem(USUARIOS_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }

        // Sessão validada (sessionStorage via DB) — ponto único usado pelas páginas.
        function sessao() { return obterUsuarioLogado(); }

        // Garante dataInicio/dataFim coerentes para um plano pago ativo.
        function _normalizarVigencia(ass) {
            if (!ass || !ass.ativa) return ass;
            if (ass.plano === 'gratuito') { ass.dataFim = null; return ass; } // gratuito não expira
            if (!ass.dataInicio) ass.dataInicio = _iso(_hoje());
            if (!ass.dataFim)    ass.dataFim    = _iso(_addDias(new Date(ass.dataInicio), CICLO_DIAS));
            return ass;
        }

        // Aplica transições vencidas (troca/cancelamento agendados, renovação) e persiste.
        function resolver(email) {
            if (!email) return null;
            var cad = _usuarios();
            var d   = cad[email];
            if (!d || !d.assinatura) return d || null;
            var ass = d.assinatura;
            var mudou = false;
            var agora = _hoje();

            if (ass.ativa && ass.plano !== 'gratuito') {
                _normalizarVigencia(ass);
                var guard = 0;
                while (ass && ass.dataFim && agora >= new Date(ass.dataFim) && guard < 600) {
                    guard++;
                    var fim = new Date(ass.dataFim);
                    if (ass.cancelamentoAgendado) {
                        // Cancelamento efetiva no fim da vigência → bloqueio + carência.
                        d.assinatura = {
                            ativa: false, cancelada: true,
                            plano: null, planoAnterior: ass.plano,
                            contratoId: ass.contratoId || null,
                            dataInicio: ass.dataInicio, dataFim: ass.dataFim,
                            dataCancelamento: ass.dataFim,
                            eraTrial: (ass.plano === 'trial' || ass.plano === 'gratuito')
                        };
                        d.statusConta = 'bloqueado_cancelamento';
                        ass = d.assinatura; mudou = true;
                        break;
                    } else if (ass.mudancaAgendada) {
                        var destino = ass.mudancaAgendada.planoDestino;
                        if (destino === 'gratuito') {
                            // Downgrade ao gratuito: conta segue ativa, porém limitada.
                            d.assinatura = {
                                ativa: true, cancelada: false,
                                plano: 'gratuito', planoAnterior: ass.plano,
                                contratoId: ass.contratoId || ('CONT-' + Date.now()),
                                dataInicio: ass.dataFim, dataFim: null,
                                mudancaAgendada: null, cancelamentoAgendado: null
                            };
                            d.statusConta = 'ativo';
                            ass = d.assinatura; mudou = true;
                            break; // gratuito não renova
                        }
                        // Upgrade/downgrade entre planos pagos: novo ciclo do zero.
                        ass.planoAnterior      = ass.plano;
                        ass.plano              = destino;
                        ass.dataInicio         = ass.dataFim;
                        ass.dataFim            = _iso(_addDias(fim, CICLO_DIAS));
                        ass.contratoId         = 'CONT-' + Date.now();
                        ass.mudancaAgendada    = null;
                        mudou = true;
                    } else {
                        // Renovação automática mensal do mesmo plano.
                        ass.dataInicio = ass.dataFim;
                        ass.dataFim    = _iso(_addDias(fim, CICLO_DIAS));
                        mudou = true;
                    }
                }
            }

            if (mudou) {
                cad[email] = d; _salvar(cad);
                // SPRINT 3 — garante a cobrança do ciclo pago vigente após renovação/troca.
                try { if (window.SG_Financeiro) window.SG_Financeiro.sincronizarPrestador(email); } catch (e) {}
            }
            return d;
        }

        // Descritor de estado consolidado (usado pelas telas).
        function estado(email) {
            var d  = resolver(email) || {};
            var ass = d.assinatura || {};
            var st  = SG_Trial.verificarStatus(email, d);
            var planoAtual = ass.ativa ? ass.plano : null;
            return {
                fase: st.motivo,                 // assinante | gratuito | trial | trial_gratuito | trial_expirado | cancelado | cancelado_carencia
                bloqueado: !!st.bloqueado,
                plano: planoAtual,
                planoNome: planoAtual ? nomePlano(planoAtual) : null,
                ativa: !!ass.ativa,
                cancelada: !!ass.cancelada,
                dataInicio: ass.dataInicio || null,
                dataFim: ass.dataFim || null,
                contratoId: ass.contratoId || null,
                mudancaAgendada: ass.mudancaAgendada || null,
                cancelamentoAgendado: ass.cancelamentoAgendado || null,
                dataCancelamento: ass.dataCancelamento || null,
                diasCarenciaRestantes: st.diasCarenciaRestantes || 0,
                planoAnterior: ass.planoAnterior || null
            };
        }

        // Contratação imediata (novo cadastro / contratação / reativação): novo ciclo.
        function contratar(email, planoId) {
            var cad = _usuarios();
            var d   = cad[email] || {};
            var inicio = _hoje();
            d.assinatura = {
                ativa: true, cancelada: false,
                plano: planoId, planoAnterior: planoId,
                contratoId: 'CONT-' + Date.now(),
                dataInicio: _iso(inicio),
                dataFim: _iso(_addDias(inicio, CICLO_DIAS)),
                mudancaAgendada: null, cancelamentoAgendado: null,
                dataCancelamento: null
            };
            d.statusConta = 'ativo';
            cad[email] = d; _salvar(cad);
            // SPRINT 3 — registra a cobrança financeira do novo ciclo pago.
            try {
                if (window.SG_Financeiro && planoId !== 'gratuito' && planoId !== 'trial') {
                    window.SG_Financeiro.gerarCobranca(email, planoId, {
                        contratoId: d.assinatura.contratoId, dataInicio: d.assinatura.dataInicio
                    });
                }
            } catch (e) {}
            return d;
        }

        // Agenda troca (upgrade/downgrade/gratuito) para o FIM da vigência atual.
        function agendarTroca(email, planoDestino) {
            var cad = _usuarios();
            var d   = cad[email] || {};
            var ass = d.assinatura;
            if (!ass || !ass.ativa) return { ok: false, motivo: 'sem_assinatura' };
            _normalizarVigencia(ass);
            var atual = ass.plano;
            var tipo  = tipoMudanca(atual, planoDestino);
            if (tipo === 'igual') return { ok: false, motivo: 'mesmo_plano' };
            ass.mudancaAgendada = {
                planoDestino: planoDestino,
                nomeDestino: nomePlano(planoDestino),
                tipo: tipo,
                efetivaEm: ass.dataFim
            };
            ass.cancelamentoAgendado = null; // troca substitui cancelamento agendado
            cad[email] = d; _salvar(cad);
            return { ok: true, tipo: tipo, efetivaEm: ass.dataFim, atual: atual, destino: planoDestino };
        }

        // Agenda cancelamento para o FIM da vigência (carência inicia no fim da vigência).
        function agendarCancelamento(email) {
            var cad = _usuarios();
            var d   = cad[email] || {};
            var ass = d.assinatura;
            if (!ass || !ass.ativa) return { ok: false, motivo: 'sem_assinatura' };
            _normalizarVigencia(ass);
            var fim = ass.dataFim || _iso(_addDias(_hoje(), CICLO_DIAS));
            ass.cancelamentoAgendado = {
                efetivaEm: fim,
                carenciaDias: _carencia(),
                carenciaAteh: _iso(_addDias(new Date(fim), _carencia()))
            };
            ass.mudancaAgendada = null; // cancelamento substitui troca agendada
            cad[email] = d; _salvar(cad);
            return { ok: true, efetivaEm: fim, carenciaDias: _carencia(), carenciaAteh: ass.cancelamentoAgendado.carenciaAteh };
        }

        function reverterTroca(email) {
            var cad = _usuarios(); var d = cad[email] || {};
            if (d.assinatura) { d.assinatura.mudancaAgendada = null; cad[email] = d; _salvar(cad); }
            return d;
        }
        function reverterCancelamento(email) {
            var cad = _usuarios(); var d = cad[email] || {};
            if (d.assinatura) { d.assinatura.cancelamentoAgendado = null; cad[email] = d; _salvar(cad); }
            return d;
        }

        return {
            CICLO_DIAS: CICLO_DIAS, RANK: RANK, NOMES: NOMES,
            fmt: fmt, nomePlano: nomePlano, rank: rank, tipoMudanca: tipoMudanca,
            sessao: sessao, resolver: resolver, estado: estado, contratar: contratar,
            agendarTroca: agendarTroca, agendarCancelamento: agendarCancelamento,
            reverterTroca: reverterTroca, reverterCancelamento: reverterCancelamento,
            carenciaDias: _carencia
        };
    }());
    try { window.SG_Plano = SG_Plano; } catch (e) {}

    // =========================================================
    // SPRINT 3 — SG_Financeiro: controle financeiro (bureau)
    // ---------------------------------------------------------
    // Mantém a saúde financeira do site: registra o valor de cada
    // contrato de prestador (cobranças), expõe as formas de
    // pagamento (PIX, depósito bancário, boleto), gera boletos
    // (linha digitável) e permite a BAIXA de pagamentos pelo
    // administrador. Exposto em window para uso pelas páginas
    // (prestadorMeuPlano e adminGerenciamento).
    // =========================================================
    var SG_Financeiro = (function () {
        var CFG_KEY  = 'sgConfigPagamento';
        var COBR_KEY = 'sgCobrancas';

        function _get(k)  { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
        function _set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
        function _hoje()      { return new Date(); }
        function _addDias(d,n){ var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
        function _iso(d)      { return d.toISOString(); }
        function fmtData(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return '—'; } }
        function fmtBRL(v)    { try { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch (e) { return 'R$ ' + (v || 0).toFixed(2); } }

        function configPadrao() {
            return {
                pixTipo: 'CNPJ', pixChave: '12.345.678/0001-90', pixTitular: 'ServGo! Serviços Digitais LTDA',
                banco: '001 — Banco do Brasil', agencia: '1234-5', conta: '56789-0',
                titular: 'ServGo! Serviços Digitais LTDA', cnpj: '12.345.678/0001-90',
                boletoBeneficiario: 'ServGo! Serviços Digitais LTDA',
                boletoInstrucoes: 'Pagável em qualquer banco até o vencimento. Após o vencimento: multa de 2% + juros de 1% ao mês.'
            };
        }
        function obterConfig() { var c = _get(CFG_KEY); return (c && typeof c === 'object') ? Object.assign(configPadrao(), c) : configPadrao(); }
        function salvarConfig(cfg) { return _set(CFG_KEY, Object.assign(obterConfig(), cfg || {})); }

        function listar()       { var a = _get(COBR_KEY); return Array.isArray(a) ? a : []; }
        function _salvarLista(a){ _set(COBR_KEY, a); }

        function precoNumerico(planoId) {
            var def = { basico: 49.90, profissional: 89.90, premium: 139.90, gratuito: 0, trial: 0 };
            var preco = '';
            try { (SG_Trial.obterPlanos() || []).forEach(function (p) { if (p && p.id === planoId) preco = p.preco; }); } catch (e) {}
            if (!preco) return def[planoId] != null ? def[planoId] : 0;
            var s = String(preco).replace(/[^0-9.,]/g, '');
            s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
            var n = parseFloat(s);
            return isNaN(n) ? (def[planoId] != null ? def[planoId] : 0) : n;
        }
        function nomePlano(planoId) { try { if (window.SG_Plano) return window.SG_Plano.nomePlano(planoId); } catch (e) {} return planoId; }

        function _referencia(email, contratoId, dataInicio) { return (email || '') + '|' + (contratoId || '') + '|' + (dataInicio || ''); }

        // Cria (idempotentemente) uma cobrança para um ciclo de plano pago.
        function gerarCobranca(email, planoId, opts) {
            opts = opts || {};
            if (!email || !planoId || planoId === 'gratuito' || planoId === 'trial') return null;
            var valor = (opts.valor != null) ? opts.valor : precoNumerico(planoId);
            if (!valor) return null;
            var inicio = opts.dataInicio || _iso(_hoje());
            var ref = _referencia(email, opts.contratoId, inicio);
            var lista = listar();
            for (var i = 0; i < lista.length; i++) { if (lista[i].referencia === ref) return lista[i]; } // já existe
            var venc = opts.dataVencimento || _iso(_addDias(new Date(inicio), 5));
            var cob = {
                id: 'COB-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                referencia: ref,
                email: email,
                plano: planoId,
                planoNome: nomePlano(planoId),
                valor: valor,
                descricao: 'Assinatura ' + nomePlano(planoId),
                contratoId: opts.contratoId || null,
                dataEmissao: inicio,
                dataVencimento: venc,
                status: 'pendente',           // pendente | pago | cancelado
                formaPagamento: null,
                dataBaixa: null,
                baixaPor: null,
                observacao: ''
            };
            lista.push(cob); _salvarLista(lista);
            return cob;
        }

        // Garante cobrança para o ciclo pago vigente do prestador.
        function sincronizarPrestador(email) {
            try {
                var cad = _get('usuariosCadastrados') || {};
                var d = cad[email]; if (!d || !d.assinatura) return;
                var a = d.assinatura;
                if (a.ativa && a.plano && a.plano !== 'gratuito' && a.plano !== 'trial') {
                    gerarCobranca(email, a.plano, {
                        contratoId: a.contratoId, dataInicio: a.dataInicio,
                        dataVencimento: a.dataInicio ? _iso(_addDias(new Date(a.dataInicio), 5)) : null
                    });
                }
            } catch (e) {}
        }
        function sincronizarTodos() {
            try {
                var cad = _get('usuariosCadastrados') || {};
                Object.keys(cad).forEach(function (e) { if (cad[e] && cad[e].tipo === 'prestador') sincronizarPrestador(e); });
            } catch (e) {}
        }

        function cobrancasPrestador(email) {
            return listar().filter(function (c) { return c.email === email; })
                           .sort(function (a, b) { return new Date(b.dataEmissao) - new Date(a.dataEmissao); });
        }

        function ehAtrasada(c) { return c.status === 'pendente' && c.dataVencimento && new Date(c.dataVencimento) < _hoje(); }
        function statusVisual(c) {
            if (c.status === 'pago')      return 'pago';
            if (c.status === 'cancelado') return 'cancelado';
            return ehAtrasada(c) ? 'atrasado' : 'pendente';
        }

        function darBaixa(id, forma, obs, admin) {
            var lista = listar(), ok = false;
            for (var i = 0; i < lista.length; i++) {
                if (lista[i].id === id) {
                    lista[i].status = 'pago';
                    lista[i].formaPagamento = forma || 'manual';
                    lista[i].dataBaixa = _iso(_hoje());
                    lista[i].baixaPor = admin || 'admin';
                    if (obs) lista[i].observacao = obs;
                    ok = true; break;
                }
            }
            if (ok) _salvarLista(lista);
            return ok;
        }
        function estornar(id) {
            var lista = listar(), ok = false;
            for (var i = 0; i < lista.length; i++) {
                if (lista[i].id === id) { lista[i].status = 'pendente'; lista[i].formaPagamento = null; lista[i].dataBaixa = null; lista[i].baixaPor = null; ok = true; break; }
            }
            if (ok) _salvarLista(lista);
            return ok;
        }
        function cancelar(id) {
            var lista = listar(), ok = false;
            for (var i = 0; i < lista.length; i++) { if (lista[i].id === id) { lista[i].status = 'cancelado'; ok = true; break; } }
            if (ok) _salvarLista(lista);
            return ok;
        }

        function resumo() {
            var lista = listar();
            var r = { emitido: 0, recebido: 0, pendente: 0, atrasado: 0, qtd: 0, qtdPagas: 0, qtdPendentes: 0, qtdAtrasadas: 0 };
            lista.forEach(function (c) {
                if (c.status === 'cancelado') return;
                r.qtd++;
                r.emitido += c.valor || 0;
                if (c.status === 'pago') { r.recebido += c.valor || 0; r.qtdPagas++; }
                else {
                    r.pendente += c.valor || 0; r.qtdPendentes++;
                    if (ehAtrasada(c)) { r.atrasado += c.valor || 0; r.qtdAtrasadas++; }
                }
            });
            return r;
        }

        // Boleto determinístico (linha digitável + nosso número) — simulação frontend.
        function gerarBoleto(cob) {
            var cfg = obterConfig();
            var num = String(cob.id).replace(/\D/g, '').slice(-11);
            while (num.length < 11) num = '0' + num;
            var valorCent = String(Math.round((cob.valor || 0) * 100));
            while (valorCent.length < 10) valorCent = '0' + valorCent;
            function bloco(seed) { var s = ''; for (var i = 0; i < seed.length; i++) s += ((seed.charCodeAt(i) * 7) % 10); return (s + '000000000000').slice(0, 12); }
            var b1 = bloco(num + '1'), b2 = bloco(num + '2'), b3 = bloco(num + '3');
            var linha = b1.slice(0,5) + '.' + b1.slice(5,10) + ' ' +
                        b2.slice(0,5) + '.' + b2.slice(5,10) + ' ' +
                        b3.slice(0,5) + '.' + b3.slice(5,10) + ' 1 ' + valorCent;
            return {
                linhaDigitavel: linha, nossoNumero: num,
                beneficiario: cfg.boletoBeneficiario, cnpj: cfg.cnpj,
                valor: cob.valor, vencimento: cob.dataVencimento, instrucoes: cfg.boletoInstrucoes
            };
        }

        return {
            CFG_KEY: CFG_KEY, COBR_KEY: COBR_KEY,
            obterConfig: obterConfig, salvarConfig: salvarConfig, configPadrao: configPadrao,
            precoNumerico: precoNumerico, nomePlano: nomePlano,
            gerarCobranca: gerarCobranca, sincronizarPrestador: sincronizarPrestador, sincronizarTodos: sincronizarTodos,
            listar: listar, cobrancasPrestador: cobrancasPrestador,
            darBaixa: darBaixa, estornar: estornar, cancelar: cancelar,
            statusVisual: statusVisual, ehAtrasada: ehAtrasada, resumo: resumo,
            gerarBoleto: gerarBoleto, fmtData: fmtData, fmtBRL: fmtBRL
        };
    }());
    try { window.SG_Financeiro = SG_Financeiro; } catch (e) {}

    // ── Modal: Termos do período de testes (30 dias) ──────────────────
    function _sgMostrarModalTrialPrestador(nome, email, senha) {
        var modalId = 'sg-modal-trial-cadastro';
        var existente = document.getElementById(modalId);
        if (existente) existente.remove();

        var html = '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
            '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#146ADB;color:#fff;">' +
            '<h5 class="modal-title"><i class="bi bi-clock-history me-2"></i>Período de Testes Gratuito</h5>' +
            '</div>' +
            '<div class="modal-body">' +
            '<p>Olá, <strong>' + _esc(nome) + '</strong>! Seja bem-vindo(a) ao ServGo!</p>' +
            '<div style="background:#e8f4fd;border-left:4px solid #146ADB;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">' +
            '<p style="margin:0 0 8px;font-weight:700;color:#146ADB;"><i class="bi bi-gift-fill me-2"></i>30 Dias Gratuitos</p>' +
            '<p style="margin:0;font-size:.9rem;color:#333;">Você terá acesso completo ao seu HotSite de serviços por <strong>30 dias</strong> sem custo algum. Após esse período, será necessário contratar um plano de assinatura para continuar utilizando os recursos da plataforma.</p>' +
            '</div>' +
            '<ul style="font-size:.88rem;color:#555;margin-bottom:0;">' +
            '<li>O período de testes inicia-se na data de hoje.</li>' +
            '<li>Você receberá alertas a partir de 5 dias antes do vencimento.</li>' +
            '<li>No vencimento, o acesso será suspenso até a contratação de um plano.</li>' +
            '<li>Você pode contratar um plano a qualquer momento pelo seu painel.</li>' +
            '</ul>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" id="sg-trial-cancelar"><i class="bi bi-x-circle me-1"></i>Cancelar</button>' +
            '<button type="button" class="btn btn-warning fw-bold" id="sg-trial-concordar"><i class="bi bi-check-circle me-1"></i>Concordar e Cadastrar</button>' +
            '</div></div></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modalEl = document.getElementById(modalId);

        // Tenta usar Bootstrap Modal; fallback para exibição CSS direta
        var modal = null;
        try {
            modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
            modal.show();
        } catch (errModal) {
            console.warn('SG_Trial: bootstrap.Modal indisponível, usando fallback CSS');
            modalEl.style.display = 'flex';
            modalEl.style.alignItems = 'center';
            modalEl.style.justifyContent = 'center';
            modalEl.classList.add('show');
            document.body.classList.add('modal-open');
        }

        document.getElementById('sg-trial-cancelar').addEventListener('click', function () {
            try { if (modal) modal.hide(); } catch (e) {}
            try { modalEl.remove(); } catch (e) {}
            document.body.classList.remove('modal-open');
        });

        document.getElementById('sg-trial-concordar').addEventListener('click', function () {
            try {
                var usuarios = obterUsuariosCadastrados();
                usuarios[email] = {
                    nome: nome,
                    senha: senha,
                    tipo: 'prestador',
                    trialInicio: new Date().toISOString(),
                    dataCadastro: new Date().toISOString()
                };
                salvarUsuariosCadastrados(usuarios);
            } catch (errSave) {
                console.error('SG_Trial: erro ao salvar usuário:', errSave);
            }
            // Redireciona imediatamente — sem depender de evento Bootstrap
            try { modal.hide(); } catch (e) {}
            try { modalEl.remove(); } catch (e) {}
            window.location.href = 'login.html?cadastro=sucesso';
        });
    }

    // ── Modal: Trial expirado no login ────────────────────────────────
    function _sgMostrarModalTrialExpirado(email, nome, alertaEl) {
        var modalId = 'sg-modal-trial-expirado';
        var existente = document.getElementById(modalId);
        if (existente) existente.remove();

        var html = '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
            '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#dc3545;color:#fff;">' +
            '<h5 class="modal-title"><i class="bi bi-lock-fill me-2"></i>Período de Testes Encerrado</h5>' +
            '</div>' +
            '<div class="modal-body">' +
            '<p>Olá, <strong>' + _esc(nome || email) + '</strong>!</p>' +
            '<div style="background:#fff3cd;border-left:4px solid #dc3545;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">' +
            '<p style="margin:0;font-size:.9rem;color:#333;">Seu período de <strong>30 dias gratuitos</strong> foi encerrado. Para continuar utilizando o HotSite e todos os recursos do ServGo!, contrate um dos nossos planos de assinatura.</p>' +
            '</div>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<a href="/index.html" class="btn btn-secondary"><i class="bi bi-house me-1"></i>Voltar ao Site</a>' +
            '<a href="/paginasSite/planosContrato.html" class="btn btn-warning fw-bold"><i class="bi bi-credit-card me-1"></i>Ver Planos de Assinatura</a>' +
            '</div></div></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modalEl = document.getElementById(modalId);
        var modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
        modal.show();
    }

    // ── Modal: Assinatura cancelada no login ──────────────────────────
    function _sgMostrarModalReativacao(email, nome, alertaEl) {
        var modalId = 'sg-modal-reativacao';
        var existente = document.getElementById(modalId);
        if (existente) existente.remove();

        var cad = obterUsuariosCadastrados();
        var dadosUsu = cad[email] || {};
        var st = SG_Trial.verificarStatus(email, dadosUsu);
        var planoAnterior = (dadosUsu.assinatura && dadosUsu.assinatura.planoAnterior) || null;
        var nomePlano = planoAnterior && planoAnterior !== 'trial' && planoAnterior !== 'gratuito'
            ? ((SG_Trial.obterPlano(planoAnterior) || {}).nome || planoAnterior)
            : null;

        // ── Bloco de carência (90 dias) ───────────────────────
        var blocoCarencia = '';
        var emCarencia = st.motivo === 'cancelado_carencia';
        if (emCarencia && st.diasCarenciaRestantes > 0) {
            blocoCarencia =
                '<div style="background:#fef3c7;border:1.5px solid #FFC300;border-radius:10px;padding:14px 16px;margin-bottom:14px;">' +
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                        '<i class="bi bi-hourglass-split" style="color:#b8870c;font-size:1.1rem;"></i>' +
                        '<strong style="color:#92400e;font-size:.9rem;">Carência do Plano Gratuito</strong>' +
                    '</div>' +
                    '<p style="margin:0 0 6px;font-size:.85rem;color:#78350f;">' +
                        'O Plano Gratuito só pode ser reativado após <strong>90 dias corridos</strong> do cancelamento.' +
                    '</p>' +
                    '<div style="background:#fff;border-radius:8px;padding:10px 14px;text-align:center;">' +
                        '<div style="font-size:2rem;font-weight:900;color:#dc3545;line-height:1;" id="sg-carencia-contador">' +
                            st.diasCarenciaRestantes +
                        '</div>' +
                        '<div style="font-size:.78rem;color:#555;margin-top:2px;">' +
                            'dia' + (st.diasCarenciaRestantes !== 1 ? 's' : '') + ' restante' + (st.diasCarenciaRestantes !== 1 ? 's' : '') +
                            ' para liberar o plano gratuito' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        // ── Botão reativar mesmo plano (só para planos pagos) ─
        var btnReativarHtml = '';
        if (nomePlano) {
            btnReativarHtml = '<button type="button" class="btn btn-success fw-bold btn-sm" id="sg-reativar-mesmo-plano">' +
                '<i class="bi bi-arrow-repeat me-1"></i>Reativar ' + _esc(nomePlano) + '</button>';
        }

        var html = '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
            '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#dc3545;color:#fff;">' +
            '<h5 class="modal-title"><i class="bi bi-lock-fill me-2"></i>Acesso Bloqueado — Assinatura Cancelada</h5>' +
            '</div>' +
            '<div class="modal-body">' +
            '<p>Olá, <strong>' + _esc(nome || email) + '</strong>!</p>' +
            '<div style="background:#fee2e2;border-left:4px solid #dc3545;padding:12px 14px;border-radius:0 8px 8px 0;margin-bottom:14px;">' +
            '<p style="margin:0;font-size:.9rem;"><i class="bi bi-lock-fill me-1"></i>Seu acesso está <strong>bloqueado</strong>. Para voltar a utilizar o ServGo!, reative seu plano ou contrate um novo plano pago.</p>' +
            '</div>' +
            blocoCarencia +
            (nomePlano ? '<p style="font-size:.88rem;color:#555;">Seu último plano ativo era: <strong>' + _esc(nomePlano) + '</strong>.</p>' : '') +
            '</div>' +
            '<div class="modal-footer" style="flex-wrap:wrap;gap:8px;">' +
            '<a href="/index.html" class="btn btn-secondary btn-sm"><i class="bi bi-house me-1"></i>Voltar ao Site</a>' +
            btnReativarHtml +
            '<a href="/paginasSite/planosContrato.html" class="btn btn-warning fw-bold btn-sm"><i class="bi bi-credit-card me-1"></i>Contratar Novo Plano</a>' +
            '</div></div></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modalEl = document.getElementById(modalId);
        var modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
        modal.show();

        var btnReativar = document.getElementById('sg-reativar-mesmo-plano');
        if (btnReativar) {
            btnReativar.addEventListener('click', function () {
                var usuarios = obterUsuariosCadastrados();
                var u = usuarios[email] || {};
                u.assinatura = {
                    ativa: true,
                    cancelada: false,
                    plano: planoAnterior,
                    planoAnterior: planoAnterior,
                    contratoId: u.assinatura && u.assinatura.contratoId ? u.assinatura.contratoId : ('CONT-' + Date.now()),
                    dataInicio: new Date().toISOString()
                };
                usuarios[email] = u;
                salvarUsuariosCadastrados(usuarios);
                modal.hide();
                modalEl.addEventListener('hidden.bs.modal', function () {
                    modalEl.remove();
                    salvarUsuarioLogado(email, u.nome, u.tipo);
                    redirecionarPorTipo(u.tipo);
                }, { once: true });
            });
        }
    }

    // ── Inicializar botões de assinatura na sidebar (prestadorHotsiteAdm) ──
    function inicializarBotoesAssinatura() {
        var btnContratar  = document.getElementById('sg-btn-contratar-plano');
        var btnCancelar   = document.getElementById('sg-btn-cancelar-assinatura');
        var btnAlterar    = document.getElementById('sg-btn-alterar-plano');
        var wrapCancelar  = document.getElementById('sg-wrap-cancelar-plano');
        if (!btnContratar && !btnCancelar) return;

        var usu = obterUsuarioLogado();
        if (!usu) return;
        var email = usu.email;
        var usuarios = obterUsuariosCadastrados();
        var dadosUsu = usuarios[email] || {};

        // Estado: assinante ativo
        var isAssinante = dadosUsu.assinatura && dadosUsu.assinatura.ativa;
        if (isAssinante) {
            if (btnContratar) btnContratar.style.display = 'none';
            if (wrapCancelar) wrapCancelar.style.display = 'block';
        } else {
            if (btnContratar) btnContratar.style.display = 'block';
            if (wrapCancelar) wrapCancelar.style.display = 'none';
        }

        // Botão Contratar Plano
        if (btnContratar) {
            btnContratar.addEventListener('click', function (e) {
                e.preventDefault();
                _sgAbrirModalPlanos(email, dadosUsu, false);
            });
        }

        // Botão Cancelar Assinatura
        if (btnCancelar) {
            btnCancelar.addEventListener('click', function (e) {
                e.preventDefault();
                _sgConfirmarCancelamento(email);
            });
        }

        // Botão Alterar Plano
        if (btnAlterar) {
            btnAlterar.addEventListener('click', function (e) {
                e.preventDefault();
                _sgAbrirModalPlanos(email, dadosUsu, true);
            });
        }

        // Aviso de trial na sidebar
        _sgMostrarAvisoTrialSidebar(email, dadosUsu);
    }

    // ── Aviso de trial na sidebar do HotsiteAdm ──────────────────────
    function _sgMostrarAvisoTrialSidebar(email, dadosUsu) {
        var wrapAviso = document.getElementById('sg-trial-aviso-sidebar');
        if (!wrapAviso) return;
        var st = SG_Trial.verificarStatus(email, dadosUsu);
        if (!SG_Trial.deveAvisar(st.diasRestantes) && !st.bloqueado) {
            wrapAviso.style.display = 'none';
            return;
        }
        wrapAviso.style.display = 'block';
        var msg, cor;
        if (st.diasRestantes === 1 || st.diasRestantes === 0) {
            msg = '<i class="bi bi-exclamation-triangle-fill me-1"></i>Seu período de testes <strong>encerra hoje</strong>! Contrate um plano para continuar.';
            cor = '#dc3545';
        } else {
            msg = '<i class="bi bi-clock me-1"></i>Faltam <strong>' + st.diasRestantes + ' dias</strong> para o fim do período de testes.';
            cor = '#b8870c';
        }
        wrapAviso.innerHTML = '<div style="background:' + cor + ';color:#fff;padding:10px 12px;border-radius:6px;font-size:.8rem;margin:8px 10px;">' + msg + '</div>';
    }

    // ── Modal: Escolher plano ─────────────────────────────────────────
    function _sgAbrirModalPlanos(email, dadosUsu, isAlteracao) {
        var modalId = 'sg-modal-planos';
        var existente = document.getElementById(modalId);
        if (existente) existente.remove();

        var planos = SG_Trial.obterPlanos();
        var planoAtual = dadosUsu.assinatura && dadosUsu.assinatura.plano ? dadosUsu.assinatura.plano : null;

        var cardsHtml = planos.map(function (p) {
            var isCurrent = p.id === planoAtual;
            var borda = p.destaque ? '3px solid #FFC300' : '1.5px solid #dee2e6';
            var bg = p.destaque ? '#fffbeb' : '#fff';
            var badgeDestaque = p.destaque ? '<span style="background:#FFC300;color:#000;font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-bottom:6px;display:inline-block;">★ Mais Popular</span><br>' : '';
            return '<div style="border:' + borda + ';background:' + bg + ';border-radius:10px;padding:18px;margin-bottom:12px;">' +
                badgeDestaque +
                '<div style="font-weight:800;font-size:1rem;color:#1a1a1a;">' + _esc(p.nome) + '</div>' +
                '<div style="font-size:1.3rem;font-weight:800;color:' + p.cor + ';margin:4px 0;">' + _esc(p.preco) + '</div>' +
                '<div style="font-size:.85rem;color:#555;margin-bottom:12px;">' + _esc(p.descricao) + '</div>' +
                (isCurrent ? '<button class="btn btn-secondary btn-sm w-100" disabled><i class="bi bi-check me-1"></i>Plano Atual</button>' :
                    '<button class="btn btn-warning btn-sm w-100 fw-bold sg-btn-selecionar-plano" data-plano="' + p.id + '" data-nome="' + _esc(p.nome) + '"><i class="bi bi-check-circle me-1"></i>' + (isAlteracao ? 'Alterar para este Plano' : 'Contratar') + '</button>') +
                '</div>';
        }).join('');

        var html = '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
            '<div class="modal-dialog modal-dialog-centered modal-lg">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#146ADB;color:#fff;">' +
            '<h5 class="modal-title"><i class="bi bi-credit-card me-2"></i>' + (isAlteracao ? 'Alterar Plano de Assinatura' : 'Contratar Plano de Assinatura') + '</h5>' +
            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' +
            '</div>' +
            '<div class="modal-body">' +
            '<p style="font-size:.9rem;color:#555;margin-bottom:18px;">Escolha o plano que melhor atende às suas necessidades. O plano entrará em vigor imediatamente após a contratação.</p>' +
            cardsHtml +
            '<p style="font-size:.78rem;color:#aaa;margin-top:10px;text-align:center;">Ao contratar, você aceita os <a href="/paginasSite/planosContrato.html" target="_blank">Termos de Contrato</a> do plano selecionado.</p>' +
            '</div>' +
            '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div>' +
            '</div></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modalEl = document.getElementById(modalId);
        var modal = new bootstrap.Modal(modalEl);
        modal.show();

        modalEl.querySelectorAll('.sg-btn-selecionar-plano').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var planoId   = btn.dataset.plano;
                var planoNome = btn.dataset.nome;
                _sgEfetivarAssinatura(email, planoId, planoNome, isAlteracao, modal, modalEl);
            });
        });
    }

    // ── Efetivar assinatura ───────────────────────────────────────────
    function _sgEfetivarAssinatura(email, planoId, planoNome, isAlteracao, modalAnterior, modalAnteriorEl) {
        var usuarios = obterUsuariosCadastrados();
        var u = usuarios[email] || {};
        var contratoId = (u.assinatura && u.assinatura.contratoId) ? u.assinatura.contratoId : ('CONT-' + Date.now());
        u.assinatura = {
            ativa: true,
            cancelada: false,
            plano: planoId,
            planoAnterior: planoId,
            contratoId: contratoId,
            dataInicio: new Date().toISOString()
        };
        usuarios[email] = u;
        salvarUsuariosCadastrados(usuarios);

        if (modalAnterior) modalAnterior.hide();
        if (modalAnteriorEl) modalAnteriorEl.addEventListener('hidden.bs.modal', function () { modalAnteriorEl.remove(); }, { once: true });

        // Atualiza botões na sidebar imediatamente
        var btnContratar = document.getElementById('sg-btn-contratar-plano');
        var wrapCancelar = document.getElementById('sg-wrap-cancelar-plano');
        if (btnContratar) btnContratar.style.display = 'none';
        if (wrapCancelar) wrapCancelar.style.display = 'block';

        // Toast de confirmação
        _sgToastAssinatura('Plano <strong>' + _esc(planoNome) + '</strong> ativado com sucesso! Contrato: ' + contratoId, 'success');
    }

    // ── Confirmar cancelamento ────────────────────────────────────────
    function _sgConfirmarCancelamento(email) {
        var modalId = 'sg-modal-cancelar-assinatura';
        var existente = document.getElementById(modalId);
        if (existente) existente.remove();

        var usuarios  = obterUsuariosCadastrados();
        var dadosUsu  = usuarios[email] || {};
        var planoAtualId = dadosUsu.assinatura && dadosUsu.assinatura.plano ? dadosUsu.assinatura.plano : null;
        var eraTrial  = !planoAtualId || planoAtualId === 'trial' || planoAtualId === 'gratuito';
        var nomePlano = planoAtualId && !eraTrial
            ? ((SG_Trial.obterPlano(planoAtualId) || {}).nome || planoAtualId)
            : 'Plano Gratuito / Trial';

        var regrasCarencia = eraTrial
            ? '<li style="margin-bottom:8px;"><i class="bi bi-hourglass-split me-2" style="color:#b8870c;"></i>' +
              '<strong>Carência de 90 dias:</strong> o Plano Gratuito só poderá ser reativado após <strong>90 dias corridos</strong> do cancelamento. ' +
              'Um contador será exibido na tela de login informando os dias restantes.</li>'
            : '';

        var html = '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
            '<div class="modal-dialog modal-dialog-centered modal-lg">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#dc3545;color:#fff;">' +
            '<h5 class="modal-title"><i class="bi bi-x-octagon me-2"></i>Cancelar Assinatura — ' + _esc(nomePlano) + '</h5>' +
            '</div>' +
            '<div class="modal-body">' +
            '<div style="background:#fee2e2;border-left:4px solid #dc3545;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:18px;">' +
            '<p style="margin:0 0 4px;font-weight:700;color:#991b1b;font-size:.92rem;">' +
            '<i class="bi bi-exclamation-octagon-fill me-1"></i>Leia com atenção antes de confirmar</p>' +
            '<p style="margin:0;font-size:.85rem;color:#7f1d1d;">As condições abaixo entram em vigor <strong>imediatamente</strong> após a confirmação.</p>' +
            '</div>' +
            '<ul style="list-style:none;padding:0;margin:0 0 16px;">' +
            '<li style="margin-bottom:8px;"><i class="bi bi-lock-fill me-2" style="color:#dc3545;"></i>' +
            '<strong>Bloqueio imediato:</strong> seu login ficará bloqueado. Não será possível acessar o painel, agendamentos ou HotSite.</li>' +
            regrasCarencia +
            '<li style="margin-bottom:8px;"><i class="bi bi-arrow-repeat me-2" style="color:#146ADB;"></i>' +
            '<strong>Opção A — Reativar plano cancelado:</strong> a qualquer momento (respeitando a carência, se aplicável) ' +
            'você pode reativar o mesmo plano. Um novo ciclo iniciará na data da reativação.</li>' +
            '<li style="margin-bottom:0;"><i class="bi bi-credit-card me-2" style="color:#198754;"></i>' +
            '<strong>Opção B — Contratar novo plano:</strong> contrate um plano diferente imediatamente. ' +
            'A nova data de cobrança será a data da nova adesão.</li>' +
            '</ul>' +
            '<p style="font-size:.85rem;color:#555;margin-bottom:0;">Tem certeza que deseja cancelar a assinatura <strong>' + _esc(nomePlano) + '</strong>?</p>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Manter Assinatura</button>' +
            '<button type="button" class="btn btn-danger fw-bold" id="sg-confirmar-cancelar"><i class="bi bi-x-circle me-1"></i>Confirmar Cancelamento</button>' +
            '</div></div></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modalEl = document.getElementById(modalId);
        var modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();

        document.getElementById('sg-confirmar-cancelar').addEventListener('click', function () {
            var usu2 = obterUsuariosCadastrados();
            var u = usu2[email] || {};
            var planoAnt = u.assinatura && u.assinatura.plano ? u.assinatura.plano : null;
            u.assinatura = {
                ativa: false,
                cancelada: true,
                planoAnterior: planoAnt,
                contratoId: u.assinatura && u.assinatura.contratoId ? u.assinatura.contratoId : null,
                dataCancelamento: new Date().toISOString(),
                eraTrial: eraTrial
            };
            usu2[email] = u;
            salvarUsuariosCadastrados(usu2);
            DB.remove('usuarioLogado');
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', function () {
                modalEl.remove();
                window.location.href = '/index.html';
            }, { once: true });
        });
    }

    // ── Toast simples para assinatura ─────────────────────────────────
    function _sgToastAssinatura(mensagem, tipo) {
        var id = 'sg-toast-assinatura-' + Date.now();
        var bg = tipo === 'success' ? '#198754' : '#dc3545';
        var html = '<div id="' + id + '" style="position:fixed;bottom:24px;right:24px;z-index:9999;background:' + bg + ';color:#fff;padding:14px 20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:.9rem;max-width:320px;" role="alert">' +
            '<i class="bi bi-check-circle-fill me-2"></i>' + mensagem +
            '</div>';
        document.body.insertAdjacentHTML('beforeend', html);
        setTimeout(function () {
            var el = document.getElementById(id);
            if (el) el.remove();
        }, 4000);
    }

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

                // ── Verifica se e-mail já existe ──────────────
                var usuariosExist = obterUsuariosCadastrados();
                if (usuariosExist[email]) {
                    alert('Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail.');
                    return;
                }

                // ── Salva dados pendentes e redireciona para escolha de plano ─
                try {
                    sessionStorage.setItem('sgCadastroPrestadorPendente', JSON.stringify({
                        nome: nome,
                        email: email,
                        senha: senha,
                        dataCadastro: new Date().toISOString()
                    }));
                } catch (e) {
                    console.warn('SG: sessionStorage indisponível', e);
                }
                window.location.href = '/paginasSite/planosContrato.html';
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
                usuarios[email] = { nome: nome, senha: senha, tipo: 'cliente', dataCadastro: new Date().toISOString() };
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

        // ── Sprint 2 — Suporte ao login do Administrador na página geral ──
        // Garante que o admin de teste exista no sistema (mesmo seed que adminLogin.html).
        // Também limpa qualquer sessão admin expirada antes de processar o formulário,
        // evitando que um token obsoleto cause redirecionamentos indevidos.
        (function _prepararLoginAdmin() {
            var TESTE_EMAIL = 'admin@servgo.com.br';
            var TESTE_SENHA = 'Admin@2026';
            var usu = obterUsuariosCadastrados();
            var temAdmin = Object.keys(usu).some(function(e){ return usu[e].tipo === 'admin'; });
            if (!temAdmin) {
                usu[TESTE_EMAIL] = {
                    nome: 'Admin Teste',
                    senha: TESTE_SENHA,
                    tipo: 'admin',
                    dataCadastro: new Date().toISOString(),
                    criadoPor: 'seed-teste'
                };
                salvarUsuariosCadastrados(usu);
            }
            // Limpa sessão obsoleta para evitar auto-redirecionamento (somente nesta aba)
            try { sessionStorage.removeItem('sg_adm_session_ts'); } catch(e) {}
        })();

        var params = new URLSearchParams(window.location.search);
        if (params.get('cadastro') === 'sucesso' && alertaOk) {
            alertaOk.innerHTML = '<div class="alert alert-success alert-dismissible fade show text-center" role="alert"><strong>Parabéns!</strong> Seu cadastro foi concluído. Faça login abaixo!<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
            history.replaceState(null, '', window.location.pathname);
        }

        // Sprint 1 — exibe aviso quando o usuário foi bloqueado pelo guard de acesso
        if (params.get('acesso') === 'restrito' && alertaOk) {
            alertaOk.innerHTML =
                '<div class="alert alert-warning alert-dismissible fade show text-center" role="alert">' +
                '<i class="bi bi-lock-fill me-2"></i>' +
                '<strong>Acesso restrito.</strong> Faça login para continuar.' +
                '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
                '</div>';
        }

        inicializarLinkEsqueciSenha();

        formLogin.addEventListener('submit', function (e) {
            e.preventDefault();
            var email = emailInput.value.trim().toLowerCase();
            var senha = senhaInput.value.trim();
            if (alertaErro) alertaErro.innerHTML = '';

            var cad = obterUsuariosCadastrados();
            if (cad[email] && cad[email].senha === senha) {
                // ── Sprint 2 — Administrador: registra timestamp de sessão e redireciona ──
                if (cad[email].tipo === 'admin') {
                    try { sessionStorage.setItem('sg_adm_session_ts', String(Date.now())); } catch(e) {}
                    salvarUsuarioLogado(email, cad[email].nome, cad[email].tipo);
                    redirecionarPorTipo(cad[email].tipo);
                    return;
                }
                // ── Verifica estado do trial/assinatura do prestador ──
                if (cad[email].tipo === 'prestador') {
                    var statusTrial = SG_Trial.verificarStatus(email, cad[email]);
                    if (statusTrial.bloqueado) {
                        if (statusTrial.motivo === 'cancelado' || statusTrial.motivo === 'cancelado_carencia') {
                            // Assinatura cancelada (com ou sem carência) — mostra modal de reativação
                            _sgMostrarModalReativacao(email, cad[email].nome, alertaErro);
                            return;
                        }
                        // Trial expirado — mostra modal de contratação
                        _sgMostrarModalTrialExpirado(email, cad[email].nome, alertaErro);
                        return;
                    }
                }
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
        // Sprint 2 — se o login veio do fluxo "Agendar Serviço" sem estar logado,
        // retorna o cliente ao card do prestador que ele havia selecionado.
        var redirectParam = new URLSearchParams(window.location.search).get('redirect');
        if (redirectParam === 'clienteAgendar' && tipo === 'cliente') {
            var pendingPrest = sessionStorage.getItem('servgo_pending_prestador') || '';
            sessionStorage.removeItem('servgo_pending_prestador');
            var url = '../paginasCliente/clienteAgendarServicos.html';
            if (pendingPrest) url += '?email=' + encodeURIComponent(pendingPrest);
            window.location.href = url;
            return;
        }

        // Sprint 1 — retorna o usuário à página que ele tentou acessar antes
        // de ser bloqueado pelo guard SG_Auth.guardPagina (acesso=restrito).
        var sgRedirect = '';
        try {
            sgRedirect = sessionStorage.getItem('sg_redirect_apos_login') || '';
            if (sgRedirect) sessionStorage.removeItem('sg_redirect_apos_login');
        } catch (e) { sgRedirect = ''; }

        if (sgRedirect) {
            window.location.href = sgRedirect;
            return;
        }

        switch (tipo) {
            case 'admin': window.location.href = '../paginasAdministrador/adminGerenciamento.html'; break;
            case 'prestador': window.location.href = '../paginasPrestador/indexPrestador.html'; break;
            case 'cliente': window.location.href = '../paginasCliente/indexCliente.html'; break;
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

        // Em todas as páginas do prestador: garante o dropdown "Meu Perfil" na navbar
        _criarDropdownMeuPerfil(usu);

        // Nas páginas com sidebar (todas exceto indexPrestador): inicializa a sidebar também
        if (!isIndexPrest) {
            inicializarSidebarPrestador();
        }
    }

    function _criarDropdownMeuPerfil(usu) {
        var span = document.querySelector('.navbar-logada-info');
        if (!span) return;

        // Atualiza a saudação com o nome real do usuário
        // Preserva apenas os filhos não-texto (toggle/dropdown) e reescreve o texto
        var primeiroFilho = span.firstChild;
        // Substitui o nó de texto da saudação sem apagar elementos filhos
        var nos = Array.from(span.childNodes);
        nos.forEach(function (n) { if (n.nodeType === 3) span.removeChild(n); });
        span.insertBefore(document.createTextNode('Olá, ' + usu.nome + '!'), span.firstChild);

        // Verifica se o toggle já existe no HTML (páginas que o têm hardcoded)
        var toggleExistente = document.getElementById('prest-perfil-toggle');
        var dropdownExistente = document.getElementById('prest-perfil-dropdown');

        if (toggleExistente && toggleExistente.dataset.eventoBound) return; // já inicializado

        var toggle, dropdown;

        if (toggleExistente) {
            // Toggle já está no HTML — apenas reutiliza e liga os eventos
            toggle = toggleExistente;
            dropdown = dropdownExistente;
        } else {
            // Toggle não existe — cria dinamicamente (indexPrestador e demais páginas sem hardcode)
            span.style.cssText += '; position:relative; display:inline-flex; flex-direction:column; align-items:center; cursor:default;';

            toggle = document.createElement('a');
            toggle.id = 'prest-perfil-toggle';
            toggle.href = '#';
            toggle.style.cssText = 'font-size:0.72rem; color:var(--azul-principal,#146ADB); text-decoration:underline; cursor:pointer; white-space:nowrap;';
            toggle.innerHTML = '<i class="bi bi-chevron-down" id="prest-chevron" style="font-size:.65rem;"></i> Meu Perfil';

            dropdown = document.createElement('div');
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
        }

        // Marca como inicializado para evitar duplo bind
        toggle.dataset.eventoBound = '1';

        // Sprint 6 — sininho de mensagens não lidas na navbar do prestador
        _atualizarAvisoNavbarMsgsPrestador(usu.email);
        setInterval(function () { _atualizarAvisoNavbarMsgsPrestador(usu.email); }, 8000);

        var aberto = false;
        toggle.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            aberto = !aberto;
            if (dropdown) dropdown.style.display = aberto ? 'block' : 'none';
            var ch = document.getElementById('prest-chevron');
            if (ch) ch.className = 'bi ' + (aberto ? 'bi-chevron-up' : 'bi-chevron-down');
        });
        document.addEventListener('click', function (e) {
            if (!span.contains(e.target)) {
                aberto = false;
                if (dropdown) dropdown.style.display = 'none';
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
        if (tituloEl) tituloEl.textContent = proximo ? (proximo.servico || 'Serviço') : 'Nenhum agendamento';

        // Linha de horário
        var horarioSpan = document.getElementById('prest-proximo-horario');
        if (horarioSpan) horarioSpan.textContent = proximo ? (_formatarDiaLabel(proximo.data) + ' às ' + (proximo.horario || '').split(' - ')[0]) : '—';

        // Linha de tipo de serviço solicitado
        var servicoLinha = document.getElementById('prest-proximo-servico-linha');
        var servicoSpan  = document.getElementById('prest-proximo-servico');
        if (servicoLinha && servicoSpan) {
            var servStr = proximo ? (proximo.servico || '') : '';
            var descStr = proximo ? (proximo.descricaoCliente || '') : '';
            if (servStr || descStr) {
                servicoSpan.textContent = servStr + (descStr ? ' — ' + descStr : '');
                servicoLinha.style.display = '';
            } else {
                servicoLinha.style.display = 'none';
            }
        }

        // Linha de cliente
        var clienteLinha = document.getElementById('prest-proximo-cliente');
        var clienteNomeSpan = document.getElementById('prest-proximo-cliente-nome');
        if (clienteLinha && clienteNomeSpan) {
            if (proximo && proximo.cliente) {
                clienteNomeSpan.textContent = proximo.cliente;
                clienteLinha.style.display = '';
            } else { clienteLinha.style.display = 'none'; }
        }

        // Linha de telefone do cliente
        var telefoneLinha = document.getElementById('prest-proximo-telefone-linha');
        var telefoneSpan = document.getElementById('prest-proximo-telefone');
        if (telefoneLinha && telefoneSpan) {
            var telStr = proximo ? (proximo.clienteTel || '') : '';
            if (telStr) { telefoneSpan.textContent = telStr; telefoneLinha.style.display = ''; }
            else { telefoneLinha.style.display = 'none'; }
        }

        // Linha de endereço do cliente
        var enderecoLinha = document.getElementById('prest-proximo-endereco-linha');
        var enderecoSpan = document.getElementById('prest-proximo-endereco');
        if (enderecoLinha && enderecoSpan) {
            // clienteEndereco: salvo no booking via perfil do cliente (adm-endereco)
            var endStr = proximo ? (proximo.clienteEndereco || proximo.endereco || proximo.local || '') : '';
            if (endStr) { enderecoSpan.textContent = endStr; enderecoLinha.style.display = ''; }
            else { enderecoLinha.style.display = 'none'; }
        }

        // Linha de valor e pagamento
        var valorLinha = document.getElementById('prest-proximo-valor-linha');
        var valorSpan = document.getElementById('prest-proximo-valor');
        var pagSpan = document.getElementById('prest-proximo-pagamento');
        if (valorLinha && valorSpan && pagSpan) {
            var temValor = proximo && (proximo.valor || proximo.preco || proximo.valorServico);
            var temPag = proximo && (proximo.pagamento || proximo.formaPagamento);
            if (temValor || temPag) {
                var vlr = proximo.valor || proximo.preco || proximo.valorServico || '';
                valorSpan.textContent = vlr ? ('R$ ' + parseFloat(vlr).toFixed(2).replace('.', ',')) : '—';
                pagSpan.textContent = proximo.pagamento || proximo.formaPagamento || '—';
                valorLinha.style.display = '';
            } else { valorLinha.style.display = 'none'; }
        }

        // — Avaliação Média —
        var avsRecebidas = obterAvaliacoesRecebidasPrestador(emailPrest);
        var avsConcluidas = avsRecebidas.filter(function (a) { return a.nota && a.nota > 0; });
        var media = 0;
        if (avsConcluidas.length > 0) { media = avsConcluidas.reduce(function (s, a) { return s + a.nota; }, 0) / avsConcluidas.length; }

        var mediaEl = document.getElementById('prest-aval-media');
        if (mediaEl) {
            mediaEl.innerHTML = avsConcluidas.length > 0
                ? (media.toFixed(1) + ' <span style="font-size:0.9rem;color:var(--texto-muted);">/ 5.0</span>')
                : '<span style="font-size:0.9rem;color:var(--texto-muted);">Sem avaliações</span>';
        }

        var estrelasEl = document.getElementById('prest-aval-estrelas');
        if (estrelasEl) {
            var notaInteira = Math.round(media);
            var starsHtml = '';
            for (var si = 1; si <= 5; si++) {
                if (si <= notaInteira) starsHtml += '<i class="bi bi-star-fill" style="color:#ffc107;"></i>';
                else if (si - 0.5 <= media) starsHtml += '<i class="bi bi-star-half" style="color:#ffc107;"></i>';
                else starsHtml += '<i class="bi bi-star" style="color:#ccc;"></i>';
            }
            estrelasEl.innerHTML = starsHtml;
        }

        var qtdEl2 = document.getElementById('prest-aval-qtd');
        if (qtdEl2) qtdEl2.textContent = avsConcluidas.length + ' avaliação(ões) registrada(s)';

        // — Próximos Agendamentos em Fila —
        var qtdFila = proximos.length;
        var qtdEl = document.getElementById('prest-qtd-msgs-nao-lidas');
        if (qtdEl) qtdEl.textContent = qtdFila;

        // Contar confirmados vs total na fila
        var qtdConfirmados = proximos.filter(function (a) { return a.status === 'confirmado'; }).length;
        var filaInfoEl = document.getElementById('prest-fila-confirmados');
        if (filaInfoEl) {
            if (qtdFila > 0) {
                filaInfoEl.textContent = qtdConfirmados + ' confirmado(s) de ' + qtdFila + ' na fila';
            } else {
                filaInfoEl.textContent = 'Nenhum agendamento pendente';
            }
        }

        // Link "Ir para agendamentos"
        var linkIr = document.getElementById('link-ir-agendamentos');
        if (linkIr) {
            linkIr.addEventListener('click', function (e) {
                e.preventDefault();
                window.location.href = '/paginasPrestador/prestadorServicosAgendados.html';
            });
        }

        // Desativar link "Ver todas" (legado)
        var linkVer = document.getElementById('link-ver-msgs-prest');
        if (linkVer) { linkVer.style.pointerEvents = 'none'; linkVer.style.textDecoration = 'none'; linkVer.style.cursor = 'default'; }

        // — Histórico: lista dinâmica de serviços concluídos —
        var listaHistorico = document.getElementById('prest-historico-lista');
        if (listaHistorico) {

            // 1. Oculta itens estáticos do HTML que NÃO sejam concluídos
            listaHistorico.querySelectorAll('.prest-historico-item').forEach(function (li) {
                var badge = li.querySelector('.prest-badge');
                if (!badge || !badge.classList.contains('concluido')) li.style.display = 'none';
            });

            // 2. Injeta todos os agendamentos com status 'concluido' do localStorage
            var OCULTO_KEY = 'historicoOculto_' + emailPrest;
            var ocultos = DB.get(OCULTO_KEY) || [];

            var agsConcluidos = obterAgendamentosPrestador(emailPrest)
                .filter(function (a) { return a.status === 'concluido' && !ocultos.includes(a.id); });

            // Ordena do mais recente para o mais antigo
            agsConcluidos.sort(function (a, b) {
                var tA = a.concluidoEm || a.data || '';
                var tB = b.concluidoEm || b.data || '';
                return tB > tA ? 1 : -1;
            });

            agsConcluidos.forEach(function (ag) {
                // Evita duplicata caso o item já exista como HTML estático
                if (listaHistorico.querySelector('[data-pedido-id="' + ag.id + '"]')) return;

                var li = document.createElement('li');
                li.className = 'prest-historico-item';
                li.dataset.pedidoId    = ag.id;
                li.dataset.cliente     = ag.cliente  || '—';
                li.dataset.servico     = ag.servico  || '—';
                li.dataset.clienteEmail = ag.clienteEmail || '';
                li.dataset.data        = ag.data     || '';
                li.dataset.horario     = ag.horario  || '';

                // Horário de início (ex: "08:00 - 09:00" → "08:00")
                var horIni = (ag.horario || '').split(' - ')[0] || '—';

                // Subcategorias
                var subcatHtml = (ag.subcategoriasCliente && ag.subcategoriasCliente.length > 0)
                    ? '<br><small class="text-muted"><i class="bi bi-list-check me-1"></i>' +
                      ag.subcategoriasCliente.map(function (sc) { return _escaparHtml(sc); }).join(', ') + '</small>'
                    : '';

                // Valor e forma de pagamento
                var valorHtml = '';
                var valor = parseFloat(ag.valor) || 0;
                if (valor > 0) {
                    var pgto = ag.formaPagamento || ag.pagamento || '';
                    valorHtml = '<br><small class="text-muted"><i class="bi bi-cash-coin me-1"></i>R$ ' +
                        valor.toFixed(2).replace('.', ',') +
                        (pgto ? ' &mdash; ' + _escaparHtml(pgto) : '') + '</small>';
                }

                // Verifica se o prestador já avaliou este agendamento
                var AVAL_KEY_CHK = 'avaliacoesFeitasPrestAdm_' + emailPrest;
                var jaAvaliou = (DB.get(AVAL_KEY_CHK) || []).some(function (a) { return a.pedidoId === ag.id || a.id === ag.id; });

                // Botão de avaliação ou badge "Avaliado"
                var avalBtnHtml = jaAvaliou
                    ? ' <span class="badge ms-1" style="background:#198754;color:#fff;font-size:.75rem;"><i class="bi bi-check-circle me-1"></i>Avaliado</span>'
                    : ' <button type="button" class="btn btn-sm btn-prest-avaliar ms-1" data-ag-id="' + _escaparHtml(ag.id) + '" ' +
                      'style="background:#FFC300;border-color:#e6b000;color:#000;font-weight:600;">' +
                      '<i class="bi bi-star me-1"></i>Avaliar</button>';

                li.innerHTML =
                    '<div>' +
                        '<strong>' + _escaparHtml(ag.servico || '—') + '</strong>' +
                        subcatHtml +
                        '<br><span style="font-size:.82rem;color:#6c757d;">' + _escaparHtml(ag.cliente || '—') + '</span>' +
                        '<br><small class="text-muted"><i class="bi bi-calendar3 me-1"></i>' +
                            _escaparHtml(ag.data || '—') + ' às ' + _escaparHtml(horIni) + '</small>' +
                        valorHtml +
                    '</div>' +
                    '<div class="prest-historico-acoes">' +
                        '<span class="badge" style="background:#146ADB;color:#fff;font-size:.75rem;">Concluído</span>' +
                        ' <button type="button" class="btn btn-sm btn-prest-historico-chat ms-1" data-ag-id="' + _escaparHtml(ag.id) + '" ' +
                        'style="background:#6c757d;border-color:#6c757d;color:#fff;font-weight:600;">' +
                        '<i class="bi bi-clock-history me-1"></i>Ver Histórico de Mensagens</button>' +
                        avalBtnHtml +
                    '</div>';

                listaHistorico.appendChild(li);
            });

            // 3. Se nenhum item ficou visível, exibe mensagem de lista vazia
            var algumVisivel = Array.from(
                listaHistorico.querySelectorAll('.prest-historico-item')
            ).some(function (li) { return li.style.display !== 'none'; });

            if (!algumVisivel) {
                var msgVazia = document.createElement('li');
                msgVazia.id = 'historico-vazio-msg';
                msgVazia.style.cssText = 'text-align:center;color:var(--texto-muted,#6c757d);' +
                    'font-style:italic;padding:20px;list-style:none;';
                msgVazia.innerHTML =
                    '<i class="bi bi-inbox me-2"></i>Nenhum serviço concluído ainda.';
                listaHistorico.appendChild(msgVazia);
            }
        }

        // — Barra de notificações —
        _inicializarBarraNotifPrestAreaExclusiva(emailPrest);

        // — Modais de avaliar / editar no histórico (funciona nos itens dinâmicos também) —
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

    /**
     * Helper: Formata array de subcategorias em string legível
     * Ex: ["Troca de Torneira", "Reparos Elétricos"] => "Troca de Torneira, Reparos Elétricos"
     * @param {Array} subcats - Array de subcategorias selecionadas pelo cliente
     * @returns {string} - String formatada ou "—" se vazio
     */
    function _formatarSubcategorias(subcats) {
        if (!subcats || !Array.isArray(subcats) || subcats.length === 0) {
            return '—';
        }
        return subcats.map(function (sc) { return _escaparHtml(sc); }).join(', ');
    }

    function _inicializarBarraNotifPrestAreaExclusiva(emailPrest) {
        var barraExistente = document.getElementById('sg-notif-barra-prest');
        if (!barraExistente) return; // mantém o HTML já presente

        function renderBarra() {
            var notifs = sgObterNotificacoes(emailPrest).filter(function (n) { return !n.lida; });
            var qtdAg = notifs.filter(function (n) { return n.tipo === 'agendamento' || n.tipo === 'orcamento_solicitado'; }).length;
            var qtdOrcAceito = notifs.filter(function (n) { return n.tipo === 'orcamento_aceito'; }).length;
            var qtdOrcRecusado = notifs.filter(function (n) { return n.tipo === 'orcamento_recusado'; }).length;
            if (qtdAg === 0 && qtdOrcAceito === 0 && qtdOrcRecusado === 0) { barraExistente.innerHTML = ''; return; }
            var html = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 16px;background:#fffbe6;border:1.5px solid #FFC300;border-radius:10px;"><i class="bi bi-bell-fill" style="color:#e6a800;font-size:1.2rem;"></i><strong style="color:#7a5800;">Novas notificações:</strong>';
            if (qtdAg > 0) html += '<button type="button" id="btn-notif-prest-ag" class="btn btn-warning btn-sm" style="font-size:.83rem;"><i class="bi bi-calendar-plus me-1"></i>' + qtdAg + ' nova(s) solicitação(ões)</button>';
            if (qtdOrcAceito > 0) html += '<button type="button" id="btn-notif-prest-orc-aceito" class="btn btn-success btn-sm" style="font-size:.83rem;"><i class="bi bi-check-circle me-1"></i>' + qtdOrcAceito + ' orçamento(s) aceito(s)</button>';
            if (qtdOrcRecusado > 0) html += '<button type="button" id="btn-notif-prest-orc-recusado" class="btn btn-danger btn-sm" style="font-size:.83rem;"><i class="bi bi-x-circle me-1"></i>' + qtdOrcRecusado + ' proposta(s) recusada(s)</button>';
            html += '</div>';
            barraExistente.innerHTML = html;
            var btnAg = document.getElementById('btn-notif-prest-ag');
            if (btnAg) { btnAg.addEventListener('click', function () { window.location.href = '/paginasPrestador/prestadorServicosAgendados.html?aba=pendentes'; }); }
            var btnOrcAc = document.getElementById('btn-notif-prest-orc-aceito');
            if (btnOrcAc) { btnOrcAc.addEventListener('click', function () { window.location.href = '/paginasPrestador/prestadorServicosAgendados.html?aba=pendentes'; }); }
            var btnOrcRec = document.getElementById('btn-notif-prest-orc-recusado');
            if (btnOrcRec) { btnOrcRec.addEventListener('click', function () { window.location.href = '/paginasPrestador/prestadorServicosAgendados.html?aba=pendentes'; }); }
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

        // — Garante rótulo de serviço/cliente + texto do badge em todos os itens concluídos —
        lista.querySelectorAll('.prest-historico-item').forEach(function (li) {
            var badge = li.querySelector('.prest-badge');
            if (!badge || !badge.classList.contains('concluido')) return;

            // Preenche texto do badge se ainda estiver vazio
            if (!badge.textContent.trim()) badge.textContent = 'Concluído';

            // Injeta span de info se ainda não existir
            if (li.querySelector('span.prest-info-label')) return;
            var infoSpan = document.createElement('span');
            infoSpan.className = 'prest-info-label';
            var subcatTexto = li.dataset.subcategorias 
                ? _formatarSubcategorias(JSON.parse(li.dataset.subcategorias))
                : '—';
            infoSpan.innerHTML = '<strong>Serviço:</strong> ' + _escaparHtml(li.dataset.servico || '—') +
                ' &nbsp;|&nbsp; <strong>Cliente:</strong> ' + _escaparHtml(li.dataset.cliente || '—') +
                (li.dataset.subcategorias && JSON.parse(li.dataset.subcategorias).length > 0
                    ? ' &nbsp;|&nbsp; <strong>Serviços:</strong> ' + subcatTexto
                    : '');
            // Insere antes do badge
            li.insertBefore(infoSpan, badge);
        });

        // — Helper: salva avaliação do prestador também nas "recebidas" do cliente —
        function _sincronizarAvaliacaoNaClienteRecebidas(pedidoId, nota, comentario) {
            var li = lista.querySelector('[data-pedido-id="' + pedidoId + '"]');
            var clienteNome = li ? (li.dataset.cliente || '—') : '—';
            var servicoNome = li ? (li.dataset.servico || '—') : '—';
            var usu = obterUsuarioLogado();
            var prestadorNome = usu ? (usu.nome || 'Prestador') : 'Prestador';
            var KEY_CLI = 'avaliacoesRecebidasDoCliente';
            var avsCliente = DB.get(KEY_CLI) || [];
            var avId = 'rec-prest-' + pedidoId;
            var idx = avsCliente.findIndex(function (a) { return a.id === avId; });
            var registro = {
                id: avId,
                prestador: prestadorNome,
                servico: servicoNome,
                cliente: clienteNome,
                nota: nota,
                comentario: comentario,
                data: new Date().toLocaleDateString('pt-BR')
            };
            if (idx >= 0) avsCliente[idx] = registro;
            else avsCliente.push(registro);
            DB.set(KEY_CLI, avsCliente);
        }

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

        // Avaliar / Chat histórico
        lista.addEventListener('click', function (e) {
            var btnAv   = e.target.closest('.btn-prest-avaliar');
            var btnEx   = e.target.closest('.btn-prest-excluir');
            var btnChat = e.target.closest('.btn-prest-historico-chat');

            if (btnChat) {
                var agId = btnChat.dataset.agId;
                var li   = btnChat.closest('.prest-historico-item');
                // Reconstrói objeto ag mínimo para abrir o chat em modo leitura
                var agObj = {
                    id:       agId,
                    cliente:  li ? li.dataset.cliente  : '—',
                    servico:  li ? li.dataset.servico  : '—',
                    data:     li ? li.dataset.data     : '—',
                    horario:  li ? li.dataset.horario  : ''
                };
                _abrirChatPrestador(agObj, emailPrest, true);
                return;
            }

            if (btnAv) {
                // Suporta tanto data-ag-id (novo) como li pai (legado)
                var li = btnAv.closest('.prest-historico-item');
                pedidoAtual = btnAv.dataset.agId || (li ? li.dataset.pedidoId : null);
                var infoEl = document.getElementById('modal-prest-avaliar-info');
                if (infoEl) infoEl.innerHTML = '<strong>Serviço:</strong> ' + _escaparHtml(li ? li.dataset.servico : '—') + ' | <strong>Cliente:</strong> ' + _escaparHtml(li ? li.dataset.cliente : '—');
                renderEstrelas(starsAv, notaAv, 0);
                document.getElementById('modal-prest-comentario').value = '';
                if (modalAv) bootstrap.Modal.getOrCreateInstance(modalAv).show();
            }
            if (btnEx) {
                var liEx = btnEx.closest('.prest-historico-item');
                if (!confirm('Excluir este item do histórico?')) return;
                var idExcluir = liEx.dataset.pedidoId;
                var avsEx = obterAvals().filter(function (a) { return a.pedidoId !== idExcluir; });
                salvarAvals(avsEx);
                // Sprint 3 — remove também de AVAL_FEITAS_PREST_KEY (prestadorAvaliacoesFeitas)
                var avsFeitas = obterAvaliacoesFeitasPrestador(emailPrest).filter(function (a) { return a.id !== idExcluir; });
                salvarAvaliacoesFeitasPrestador(emailPrest, avsFeitas);
                // Persiste o ID como "oculto" para não reaparecer após reload
                var OCULTO_KEY = 'historicoOculto_' + emailPrest;
                var ocultos = DB.get(OCULTO_KEY) || [];
                if (!ocultos.includes(idExcluir)) ocultos.push(idExcluir);
                DB.set(OCULTO_KEY, ocultos);
                liEx.remove();
                exibirToast('Item removido do histórico.');
            }
        });

        var btnSalvarAv = document.getElementById('btn-prest-salvar-avaliacao');
        if (btnSalvarAv) {
            btnSalvarAv.addEventListener('click', function () {
                var nota = parseInt(notaAv.value) || 0;
                var coment = (document.getElementById('modal-prest-comentario') || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; }
                if (!coment.trim()) { alert('Escreva um comentário.'); return; }

                // Recupera nome do cliente e serviço a partir do item do histórico
                var liAv = lista.querySelector('[data-pedido-id="' + pedidoAtual + '"]');
                var clienteNome = liAv ? (liAv.dataset.cliente || '—') : '—';
                var servicoNome = liAv ? (liAv.dataset.servico || '—') : '—';
                var dataHoje    = new Date().toLocaleDateString('pt-BR');

                // Salva na chave local do histórico (área exclusiva)
                var avs = obterAvals();
                var idx = avs.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                var nova = {
                    pedidoId: pedidoAtual, id: pedidoAtual,
                    cliente: clienteNome, servico: servicoNome,
                    nota: nota, comentario: coment, data: dataHoje
                };
                if (idx >= 0) avs[idx] = nova; else avs.push(nova);
                salvarAvals(avs);

                // Sprint 3 — sincroniza com AVAL_FEITAS_PREST_KEY para prestadorAvaliacoesFeitas.html
                var avsFeitas = obterAvaliacoesFeitasPrestador(emailPrest);
                var idxF = avsFeitas.findIndex(function (a) { return a.id === pedidoAtual; });
                if (idxF >= 0) avsFeitas[idxF] = nova; else avsFeitas.push(nova);
                salvarAvaliacoesFeitasPrestador(emailPrest, avsFeitas);

                // Disponibiliza a avaliação na página de Avaliações Recebidas do cliente
                _sincronizarAvaliacaoNaClienteRecebidas(pedidoAtual, nota, coment);
                bootstrap.Modal.getInstance(modalAv).hide();

                // Troca o botão "Avaliar" pelo badge "Avaliado" no item do histórico
                var liAvalBadge = lista.querySelector('[data-pedido-id="' + pedidoAtual + '"]');
                if (liAvalBadge) {
                    var btnAvalEl = liAvalBadge.querySelector('.btn-prest-avaliar');
                    if (btnAvalEl) {
                        var badge = document.createElement('span');
                        badge.className = 'badge ms-1';
                        badge.style.cssText = 'background:#198754;color:#fff;font-size:.75rem;';
                        badge.innerHTML = '<i class="bi bi-check-circle me-1"></i>Avaliado';
                        btnAvalEl.replaceWith(badge);
                    }
                }

                exibirToast('Avaliação salva e enviada ao cliente!');
            });
        }

        var btnSalvarEd = document.getElementById('btn-prest-salvar-edicao');
        if (btnSalvarEd) {
            btnSalvarEd.addEventListener('click', function () {
                var nota = parseInt(notaEd.value) || 0;
                var coment = (document.getElementById('modal-prest-editar-comentario') || {}).value || '';
                if (nota === 0) { alert('Selecione uma nota.'); return; }
                if (!coment.trim()) { alert('Escreva um comentário.'); return; }

                // Atualiza na chave local do histórico
                var avs = obterAvals();
                var idx = avs.findIndex(function (a) { return a.pedidoId === pedidoAtual; });
                if (idx >= 0) { avs[idx].nota = nota; avs[idx].comentario = coment; salvarAvals(avs); }

                // Sprint 3 — sincroniza edição com AVAL_FEITAS_PREST_KEY
                var avsFeitas = obterAvaliacoesFeitasPrestador(emailPrest);
                var idxF = avsFeitas.findIndex(function (a) { return a.id === pedidoAtual; });
                if (idxF >= 0) { avsFeitas[idxF].nota = nota; avsFeitas[idxF].comentario = coment; salvarAvaliacoesFeitasPrestador(emailPrest, avsFeitas); }

                // Atualiza também na página de Avaliações Recebidas do cliente
                _sincronizarAvaliacaoNaClienteRecebidas(pedidoAtual, nota, coment);
                bootstrap.Modal.getInstance(modalEd).hide();
                exibirToast('Avaliação atualizada!');
            });
        }
    }

    // =========================================================
    // SPRINT 4 — MODAL PERFIL DO CLIENTE (prestadorServicosAgendados.html)
    // Abre o modal #modalPerfilCliente com os dados do cliente pelo email.
    // =========================================================
    function _abrirModalPerfilCliente(emailCliente) {
        var modalEl = document.getElementById('modalPerfilCliente');
        if (!modalEl) return;

        var usuarios   = obterUsuariosCadastrados();
        var dadosCli   = usuarios[emailCliente] || {};
        var perfil     = dadosCli.perfil || {};
        var nome       = dadosCli.nome || emailCliente;

        // Avatar
        var avatarEl = document.getElementById('perfil-cli-modal-avatar');
        if (avatarEl) {
            if (perfil.foto) {
                avatarEl.style.backgroundImage  = 'url(' + perfil.foto + ')';
                avatarEl.style.backgroundSize   = 'cover';
                avatarEl.style.backgroundRepeat = 'no-repeat';
                avatarEl.style.backgroundPosition = 'center';
                avatarEl.textContent = '';
            } else {
                avatarEl.style.backgroundImage = '';
                avatarEl.textContent = nome.substring(0, 2).toUpperCase();
            }
        }

        // Nome
        var nomeEl = document.getElementById('perfil-cli-modal-nome');
        if (nomeEl) nomeEl.textContent = nome;

        // Tempo de membro
        var membroEl = document.getElementById('perfil-cli-modal-membro');
        if (membroEl) {
            if (dadosCli.dataCadastro) {
                var dtCad   = new Date(dadosCli.dataCadastro);
                var diffMs  = new Date() - dtCad;
                var diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                var textoTempo;
                if (diffDias < 1)        textoTempo = 'hoje';
                else if (diffDias === 1)  textoTempo = '1 dia';
                else if (diffDias < 30)   textoTempo = diffDias + ' dias';
                else if (diffDias < 60)   textoTempo = '1 mês';
                else if (diffDias < 365)  textoTempo = Math.floor(diffDias / 30) + ' meses';
                else if (diffDias < 730)  textoTempo = '1 ano';
                else                      textoTempo = Math.floor(diffDias / 365) + ' anos';
                membroEl.textContent = textoTempo;
            } else {
                membroEl.textContent = 'data não registrada';
            }
        }

        // Média de avaliações recebidas pelo cliente
        var estrelasEl = document.getElementById('perfil-cli-modal-estrelas');
        if (estrelasEl) {
            var todasAvs = DB.get('avaliacoesRecebidasDoCliente') || [];
            var avsDoCliente = todasAvs.filter(function (a) { return a.emailCliente === emailCliente || !a.emailCliente; });
            // Se não houver campo emailCliente nas avaliações antigas, exibe todas
            var avsExibir = avsDoCliente.length > 0 ? avsDoCliente : (todasAvs.length > 0 ? todasAvs : []);
            if (avsExibir.length > 0) {
                var soma  = avsExibir.reduce(function (acc, a) { return acc + (Number(a.nota) || 0); }, 0);
                var media = soma / avsExibir.length;
                var html  = '';
                for (var i = 1; i <= 5; i++) {
                    if (i <= Math.floor(media))     html += '<i class="bi bi-star-fill" style="color:#ffc107;"></i>';
                    else if (i - media < 1)          html += '<i class="bi bi-star-half" style="color:#ffc107;"></i>';
                    else                             html += '<i class="bi bi-star" style="color:#ccc;"></i>';
                }
                estrelasEl.innerHTML = html + ' <span style="font-weight:600;color:#444;">' + media.toFixed(1) + '</span> <span style="color:#888;">(' + avsExibir.length + ' aval.)</span>';
            } else {
                estrelasEl.innerHTML = '<span style="color:#aaa;font-size:0.8rem;">Sem avaliações recebidas</span>';
            }
        }

        // Cidade
        var cidadeEl = document.getElementById('perfil-cli-modal-cidade');
        if (cidadeEl) cidadeEl.textContent = perfil.cidade || '—';

        // Dados pessoais
        var emailEl   = document.getElementById('perfil-cli-modal-email');
        var telEl     = document.getElementById('perfil-cli-modal-tel');
        var endEl     = document.getElementById('perfil-cli-modal-endereco');
        if (emailEl)  emailEl.textContent  = emailCliente || '—';
        if (telEl)    telEl.textContent    = perfil.tel      || '—';
        if (endEl)    endEl.textContent    = perfil.endereco || '—';

        // Avaliações recebidas (lista)
        var avaliEl = document.getElementById('perfil-cli-modal-avaliacoes');
        if (avaliEl) {
            var todasAvsLista = DB.get('avaliacoesRecebidasDoCliente') || [];
            if (todasAvsLista.length > 0) {
                avaliEl.innerHTML = todasAvsLista.slice().reverse().map(function (av) {
                    var sts = Array.from({ length: 5 }, function (_, i) {
                        return '<i class="bi ' + (i < av.nota ? 'bi-star-fill' : 'bi-star') + '" style="color:' + (i < av.nota ? '#ffc107' : '#ccc') + ';font-size:.75rem;"></i>';
                    }).join('');
                    return '<div style="border-bottom:1px solid var(--borda,#dee2e6);padding:6px 0;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span style="font-size:.82rem;font-weight:600;">' + _escaparHtml(av.prestador || '—') + ' · ' + _escaparHtml(av.servico || '—') + '</span>' +
                        '<span style="font-size:.75rem;color:#888;">' + (av.data || '') + '</span></div>' +
                        '<div>' + sts + '</div>' +
                        '<p style="margin:2px 0 0;font-size:.82rem;color:#555;">' + _escaparHtml(av.comentario || '') + '</p>' +
                        '</div>';
                }).join('');
            } else {
                avaliEl.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">Nenhuma avaliação registrada.</span>';
            }
        }

        // Abre o modal
        var modalInst = bootstrap.Modal.getOrCreateInstance(modalEl);
        modalInst.show();
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
        function isPendente(ag) { return ag.status === 'pendente' || ag.status === 'orcamento_pendente' || ag.status === 'orcamento_enviado' || ag.status === 'orcamento_aceito' || ag.status === 'orcamento_recusado'; }
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

                var statusMap = {
                    confirmado:         { tag: 'confirmado',  texto: 'Confirmado' },
                    pendente:           { tag: 'pendente',    texto: 'Pendente' },
                    cancelado:          { tag: 'cancelado',   texto: 'Cancelado' },
                    concluido:          { tag: 'concluido',   texto: 'Concluído' },
                    orcamento_pendente: { tag: 'pendente',    texto: 'Orçamento Solicitado' },
                    orcamento_enviado:  { tag: 'pendente',    texto: 'Orçamento Enviado' },
                    orcamento_aceito:   { tag: 'confirmado',  texto: 'Orçamento Aceito' },
                    orcamento_recusado: { tag: 'cancelado',   texto: 'Recusado pelo Cliente' }
                };
                var sm = statusMap[ag.status] || { tag: ag.status, texto: ag.status };
                var statusTag   = sm.tag;
                var statusTexto = sm.texto;
                var diaLabel = _formatarDiaLabel(ag.data);
                var horario = ag.horario || '—';

                var botoesHTML = '';

                if (aba === 'proximos') {
                    botoesHTML += '<a href="#" class="agenda-btn concluir" data-acao="concluir" style="background:#198754;color:#fff;border-color:#198754;"><i class="bi bi-check-circle me-1"></i>Concluir</a>';
                }

                // Botão Detalhes sempre presente
                if (ag.status === 'orcamento_pendente') {
                    botoesHTML += '<a href="#" class="agenda-btn" data-acao="detalhes" style="background:#FFC300;color:#000;border-color:#e6b000;font-weight:600;"><i class="bi bi-file-earmark-text me-1"></i>Enviar Orçamento</a>';
                    botoesHTML += '<a href="#" class="agenda-btn cancelar" data-acao="cancelar"><i class="bi bi-x me-1"></i>Rejeitar</a>';
                } else if (ag.status === 'orcamento_enviado') {
                    botoesHTML += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
                } else if (ag.status === 'orcamento_aceito') {
                    botoesHTML += '<a href="#" class="agenda-btn confirmar" data-acao="confirmar" style="background:#198754;color:#fff;"><i class="bi bi-check me-1"></i>Confirmar</a>';
                    botoesHTML += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
                    botoesHTML += '<a href="#" class="agenda-btn cancelar" data-acao="cancelar"><i class="bi bi-x me-1"></i>Cancelar</a>';
                } else if (ag.status === 'orcamento_recusado') {
                    // Sprint 3 — cliente recusou: prestador pode refazer a proposta
                    botoesHTML += '<a href="#" class="agenda-btn" data-acao="refazer" style="background:#FFC300;color:#000;border-color:#e6b000;font-weight:600;"><i class="bi bi-arrow-repeat me-1"></i>Refazer Proposta</a>';
                } else {
                    botoesHTML += '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
                    if (aba === 'pendentes') {
                        botoesHTML += '<a href="#" class="agenda-btn confirmar" data-acao="confirmar" style="background:#198754;color:#fff;"><i class="bi bi-check me-1"></i>Confirmar</a>';
                        botoesHTML += '<a href="#" class="agenda-btn cancelar" data-acao="cancelar"><i class="bi bi-x me-1"></i>Cancelar</a>';
                    }
                }

                // Badge extra: "Serviço em aberto" para confirmados, "Pago" para concluídos
                var badgeExtra = '';
                if (aba === 'proximos' && ag.status === 'confirmado') {
                    badgeExtra = '<span style="display:inline-block;margin-top:4px;background:#0d6efd;color:#fff;' +
                        'font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:20px;' +
                        'white-space:nowrap;"><i class="bi bi-clock me-1"></i>Serviço em aberto</span>';
                } else if (ag.status === 'concluido' && ag.pago) {
                    badgeExtra = '<span style="display:inline-block;margin-top:4px;background:#198754;color:#fff;' +
                        'font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:20px;' +
                        'white-space:nowrap;"><i class="bi bi-check-circle-fill me-1"></i>Pago</span>';
                }
                // Subcategorias do cliente
                var subcatHtml = (ag.subcategoriasCliente && ag.subcategoriasCliente.length > 0)
                    ? '<p class="agenda-cliente-servico" style="font-size:.78rem;color:#555;"><i class="bi bi-list-check me-1"></i>' + ag.subcategoriasCliente.map(function(sc){ return _escaparHtml(sc); }).join(', ') + '</p>'
                    : '';
                li.innerHTML = '<div><div class="agenda-slot-dia">' + diaLabel + '</div><div class="agenda-slot-tempo">' + horario + '</div></div><div><div class="agenda-cliente-nome">' + _escaparHtml(ag.cliente || '—') + '</div><p class="agenda-cliente-servico">Serviço: ' + _escaparHtml(ag.servico || '—') + '</p>' + subcatHtml + '<p class="agenda-cliente-local"><i class="bi bi-geo-alt me-1"></i>' + _escaparHtml(ag.endereco || '') + '</p></div><div class="agenda-status-area"><span class="agenda-status-tag ' + statusTag + '">' + statusTexto + '</span>' + badgeExtra + '<div class="agenda-botoes">' + botoesHTML + '</div></div>';
                listaEl.appendChild(li);
            });
        }

        // Delegação de eventos — configurada UMA vez, fora de renderizarAba,
        // evitando acumulação de listeners a cada troca de aba.
        listaEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.agenda-btn');
            if (!btn) return;
            e.preventDefault();
            var li = btn.closest('.agenda-prest-item');
            var agId = li ? li.dataset.agendamentoId : null;
            // Relê o agendamento atualizado do array (evita dados stale após salvar)
            var ag = agendamentos.find(function (a) { return a.id === agId; });
            if (!ag) return;
            var acao = btn.dataset.acao;
            if (acao === 'detalhes')  _abrirModalDetalhes(ag, emailPrest, agendamentos, salvarAgs);
            if (acao === 'concluir')  _concluirAgendamento(ag, agendamentos, salvarAgs, emailPrest, function () { renderizarAba(abaAtiva); atualizarContadores(); });
            if (acao === 'confirmar') _confirmarAgendamento(ag, agendamentos, salvarAgs, function () { renderizarAba(abaAtiva); atualizarContadores(); });
            if (acao === 'cancelar')  _abrirModalCancelar(ag, agendamentos, salvarAgs, function () { renderizarAba(abaAtiva); atualizarContadores(); });
            // Refazer Proposta: volta para orcamento_pendente e abre modal de edição
            if (acao === 'refazer') {
                var idxR = agendamentos.findIndex(function (a) { return a.id === ag.id; });
                if (idxR >= 0) {
                    agendamentos[idxR].status = 'orcamento_pendente';
                    salvarAgs();
                    if (ag.clienteEmail) _atualizarStatusClienteAgendamento(ag.id, ag.clienteEmail, 'orcamento_pendente');
                    renderizarAba(abaAtiva);
                    atualizarContadores();
                    _abrirModalDetalhes(agendamentos[idxR], emailPrest, agendamentos, salvarAgs);
                }
            }
        });

        // Auto-switch para pendentes: se não houver param de URL e existirem
        // agendamentos pendentes, abre diretamente a aba pendentes.
        if (!urlParams.get('aba') && agendamentos.some(isPendente)) {
            abaAtiva = 'pendentes';
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

        // Filtro histórico — exibe SOMENTE concluídos no período selecionado
        var btnFiltrar = document.getElementById('btn-filtrar-historico');
        var btnLimparFiltro = document.getElementById('btn-limpar-filtro');

        function renderizarHistoricoFiltrado(ini, fim) {
            listaEl.innerHTML = '';

            var lista = agendamentos.filter(function (a) {
                // Apenas agendamentos concluídos
                if (a.status !== 'concluido') return false;
                // Data de referência: concluidoEm (ISO → YYYY-MM-DD) ou ag.data
                var dataRef = '';
                if (a.concluidoEm) {
                    dataRef = a.concluidoEm.substring(0, 10);
                } else if (a.data) {
                    dataRef = a.data;
                }
                if (ini && dataRef < ini) return false;
                if (fim && dataRef > fim) return false;
                return true;
            });

            lista.sort(function (a, b) { return a.data > b.data ? 1 : -1; });

            // Atualiza label informativo do filtro
            var infoEl = document.getElementById('filtro-info-periodo');
            if (infoEl) {
                var partes = [];
                if (ini) partes.push('De: ' + ini.split('-').reverse().join('/'));
                if (fim) partes.push('Até: ' + fim.split('-').reverse().join('/'));
                infoEl.textContent = partes.length
                    ? 'Filtro ativo — ' + partes.join(' | ') + ' — ' + lista.length + ' serviço(s) concluído(s)'
                    : '';
            }

            if (lista.length === 0) {
                listaEl.innerHTML = '<li class="agenda-lista-vazia"><i class="bi bi-calendar-x"></i>Nenhum serviço concluído no período selecionado.</li>';
                return;
            }

            lista.forEach(function (ag) {
                var li = document.createElement('li');
                li.className = 'agenda-prest-item';
                li.dataset.agendamentoId = ag.id;
                var diaLabel = _formatarDiaLabel(ag.data);
                var horario  = ag.horario || '—';
                var botoesHTML = '<a href="#" class="agenda-btn" data-acao="detalhes"><i class="bi bi-info-circle me-1"></i>Detalhes</a>';
                var pagoBadge = ag.pago
                    ? '<span style="display:inline-block;margin-top:4px;background:#198754;color:#fff;font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;"><i class="bi bi-check-circle-fill me-1"></i>Pago</span>'
                    : '';
                var subcatHtml = (ag.subcategoriasCliente && ag.subcategoriasCliente.length > 0)
                    ? '<p class="agenda-cliente-servico" style="font-size:.78rem;color:#555;"><i class="bi bi-list-check me-1"></i>' + ag.subcategoriasCliente.map(function(sc){ return _escaparHtml(sc); }).join(', ') + '</p>'
                    : '';
                li.innerHTML =
                    '<div>' +
                        '<div class="agenda-slot-dia">'    + diaLabel + '</div>' +
                        '<div class="agenda-slot-tempo">'  + horario  + '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div class="agenda-cliente-nome">' + (ag.cliente || '—') + '</div>' +
                        '<p class="agenda-cliente-servico">Serviço: ' + (ag.servico || '—') + '</p>' +
                        subcatHtml +
                        '<p class="agenda-cliente-local"><i class="bi bi-geo-alt me-1"></i>' + (ag.endereco || '') + '</p>' +
                    '</div>' +
                    '<div class="agenda-status-area">' +
                        '<span class="agenda-status-tag concluido">Concluído</span>' + pagoBadge +
                        '<div class="agenda-botoes">' + botoesHTML + '</div>' +
                    '</div>';
                listaEl.appendChild(li);
            });
        }

        if (btnFiltrar) {
            btnFiltrar.addEventListener('click', function () {
                var ini = (document.getElementById('filtro-data-inicio') || {}).value || '';
                var fim = (document.getElementById('filtro-data-fim') || {}).value || '';
                if (!ini && !fim) {
                    alert('Selecione ao menos uma data para filtrar.');
                    return;
                }
                renderizarHistoricoFiltrado(ini, fim);
            });
        }
        if (btnLimparFiltro) {
            btnLimparFiltro.addEventListener('click', function () {
                ['filtro-data-inicio', 'filtro-data-fim'].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) el.value = '';
                });
                var infoEl = document.getElementById('filtro-info-periodo');
                if (infoEl) infoEl.textContent = '';
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
            sgCriarNotificacao(ag.clienteEmail, 'confirmacao', {
                servico: ag.servico,
                prestadorNome: ag.prestador || '',
                valor: ag.valor || 0,
                formaPagamento: ag.formaPagamento || '',
                data: ag.data,
                horario: ag.horario
            });
            // Marcar notificação de orcamento_aceito como lida para o prestador
            var usPrest = obterUsuarioLogado();
            if (usPrest) {
                var notifsP = sgObterNotificacoes(usPrest.email);
                notifsP.forEach(function (n) { if (n.tipo === 'orcamento_aceito' && (n.dados || {}).agendamentoId === ag.id) n.lida = true; });
                sgSalvarNotificacoes(usPrest.email, notifsP);
            }
        }
        exibirToast('Agendamento confirmado com sucesso!');
        if (callback) callback();
    }

    // =========================================================
    // RECEBIMENTOS — helpers
    // =========================================================
    function obterRecebimentos(emailPrest) { return DB.get('recebimentos_' + emailPrest) || []; }
    function salvarRecebimentos(emailPrest, arr) { DB.set('recebimentos_' + emailPrest, arr); }
    function registrarRecebimento(emailPrest, ag) {
        var rec = obterRecebimentos(emailPrest);
        rec.push({
            id: 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
            agId: ag.id,
            valor: ag.valor || 0,
            servico: ag.servico || '—',
            cliente: ag.cliente || '—',
            formaPagamento: ag.formaPagamento || '',
            data: ag.data || new Date().toISOString().substring(0, 10),
            registradoEm: new Date().toISOString()
        });
        salvarRecebimentos(emailPrest, rec);
        return ag.valor || 0;
    }

    // =========================================================
    // CONCLUIR AGENDAMENTO
    // Sprint 1 — conclusão direta pelo prestador, sem validação do cliente.
    // O serviço é movido imediatamente para Histórico (status 'concluido').
    // =========================================================
    function _concluirAgendamento(ag, agendamentos, salvarAgs, emailPrest, callback) {
        if (!confirm('Confirmar conclusão do serviço "' + (ag.servico || 'Serviço') + '" com ' + (ag.cliente || 'cliente') + '?\n\nO serviço será movido para o Histórico.')) return;

        var idx = agendamentos.findIndex(function (a) { return a.id === ag.id; });
        if (idx < 0) return;

        agendamentos[idx].status      = 'concluido';
        agendamentos[idx].concluidoEm = new Date().toISOString();
        agendamentos[idx].pago        = true;
        agendamentos[idx].valorPago   = parseFloat(agendamentos[idx].valor) || 0;
        salvarAgs();

        // Registra o recebimento (usa valor já salvo no agendamento, se houver)
        registrarRecebimento(emailPrest, agendamentos[idx]);

        // Notifica o cliente — apenas informativo, sem necessidade de ação
        if (ag.clienteEmail) {
            _atualizarStatusClienteAgendamento(ag.id, ag.clienteEmail, 'concluido');
            sgCriarNotificacao(ag.clienteEmail, 'conclusao', { servico: ag.servico });
        }

        exibirToast('Servi\u00e7o conclu\u00eddo! Movido para o Hist\u00f3rico.');
        if (callback) callback();
    }

    function _abrirModalCancelar(ag, agendamentos, salvarAgs, callback) {
        var modalEl = document.getElementById('modalCancelarAgendamento');
        if (!modalEl) return;
        var infoBox = document.getElementById('modal-cancelar-info-agendamento');
        if (infoBox) infoBox.innerHTML = '<strong>Cliente:</strong> ' + _escaparHtml(ag.cliente || '—') + ' | <strong>Serviço:</strong> ' + _escaparHtml(ag.servico || '—') + ' | <strong>Data:</strong> ' + _escaparHtml(ag.data || '—');
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
                var motivoCompleto = motivo + (obs ? ' — ' + obs : '');
                if (idx >= 0) { agendamentos[idx].status = 'cancelado'; agendamentos[idx].motivoCancelamento = motivoCompleto; salvarAgs(); }
                if (ag.clienteEmail) {
                    _atualizarStatusClienteAgendamento(ag.id, ag.clienteEmail, 'cancelado', { motivoCancelamento: motivoCompleto });
                    sgCriarNotificacao(ag.clienteEmail, 'cancelamento', { servico: ag.servico, motivo: motivoCompleto });
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
        var pagPref   = ag.formaPagamentoPreferida || '';
        // Pre-seleciona: usa o valor já salvo pelo prestador; se vazio, usa a preferência do cliente
        var pagSelecionado = pagamento || pagPref;

        // Linha informativa sobre a preferência do cliente
        var infoPrefHtml = pagPref
            ? '<div style="grid-column:1/-1;margin-top:-6px;margin-bottom:4px;font-size:.82rem;' +
              'color:#0d3d78;background:#e8f4fd;border-left:3px solid #146ADB;padding:5px 10px;border-radius:0 6px 6px 0;">' +
              '<i class="bi bi-info-circle me-1"></i><strong>Preferência de pagamento do cliente:</strong> ' +
              _escaparHtml(pagPref) + '</div>'
            : '';

        // ---- Dados de contato do CLIENTE (Sprint 1) ----
        // Prioridade: campo salvo no booking (clienteTel / clienteEndereco).
        // Fallback: perfil do cliente em usuariosCadastrados (cobre bookings antigos).
        var cliTelefone = ag.clienteTel || '';
        var cliEndereco = ag.clienteEndereco || '';
        if ((!cliTelefone || !cliEndereco) && ag.clienteEmail) {
            var _usuCli = obterUsuariosCadastrados()[ag.clienteEmail] || {};
            var _perfilCli = _usuCli.perfil || {};
            if (!cliTelefone) cliTelefone = _perfilCli.tel || '';
            if (!cliEndereco) cliEndereco = _perfilCli.endereco || '';
        }

        // Bloco de parcelamento (visível somente quando Cartão for selecionado)
        var parcelas   = ag.parcelas   || '';
        var valorParc  = ag.valorParcela || '';
        var parcelasHtml =
            '<div id="det-parcelas-bloco" style="grid-column:1/-1;display:' + (pagSelecionado === 'Cartão' ? 'block' : 'none') + ';' +
            'margin-top:8px;padding:10px 14px;background:#fff8e1;border-left:3px solid #FFC300;border-radius:0 8px 8px 0;">' +
            '<p style="font-weight:700;font-size:.85rem;margin:0 0 8px;color:#6d4c00;">' +
            '<i class="bi bi-credit-card me-1"></i>Parcelamento no Cartão</p>' +
            '<div style="display:flex;flex-wrap:wrap;gap:12px;">' +
            '<div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:3px;">Máx. de Parcelas</label>' +
            '<input type="number" id="det-parcelas-qtd" class="form-control form-control-sm" min="1" max="24" step="1" ' +
            'value="' + _escaparHtml(String(parcelas)) + '" placeholder="ex: 12" style="max-width:100px;"></div>' +
            '<div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:3px;">Valor de cada Parcela (R$)</label>' +
            '<input type="number" id="det-parcelas-valor" class="form-control form-control-sm" min="0" step="0.01" ' +
            'value="' + _escaparHtml(String(valorParc)) + '" placeholder="ex: 50,00" style="max-width:120px;"></div>' +
            '</div>' +
            '<p style="font-size:.78rem;color:#856404;margin:6px 0 0;">' +
            '<i class="bi bi-exclamation-triangle me-1"></i>' +
            'Esta informação será enviada ao cliente junto com o orçamento.</p>' +
            '</div>';

        corpo.innerHTML =
            '<div class="agenda-detalhe-secao"><h6 style="display:flex;align-items:center;gap:10px;"><span><i class="bi bi-person-circle me-1"></i>Dados do Cliente</span>' +
            (ag.clienteEmail ? '<button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" id="btn-ver-perfil-cliente" style="font-size:0.78rem;"><i class="bi bi-person-lines-fill me-1"></i>Ver Perfil</button>' : '') +
            '</h6>' +
            '<div class="agenda-detalhe-grid"><div><strong>Nome</strong><span>' + (ag.cliente || '—') + '</span></div><div><strong>Telefone</strong><span>' + (cliTelefone || '—') + '</span></div></div></div>' +
            '<div class="agenda-detalhe-secao"><h6><i class="bi bi-calendar-event me-1"></i>Serviço Agendado</h6>' +
            '<div class="agenda-detalhe-grid">' +
            '<div><strong>Serviço</strong><span>' + (ag.servico || '—') + '</span></div>' +
            '<div><strong>Status</strong><span><span class="agenda-status-tag ' + ag.status + '">' + ag.status + '</span></span></div>' +
            '<div><strong>Data</strong><span>' + (ag.data || '—') + '</span></div>' +
            '<div><strong>Horário</strong><span>' + (ag.horario || '—') + '</span></div>' +
            '<div style="grid-column:1/-1"><strong>Endereço</strong><span><i class="bi bi-geo-alt me-1"></i>' + (cliEndereco || '—') + '</span></div>' +
            '<div><strong>Valor (R$)</strong><span><input type="number" id="det-valor" class="form-control form-control-sm" value="' + valor + '" min="0" step="0.01" style="max-width:120px;"></span></div>' +
            '<div><strong>Forma de Pagamento</strong><span><select id="det-pagamento" class="form-select form-select-sm" style="max-width:150px;"><option value="">Selecione</option><option value="PIX"' + (pagSelecionado === 'PIX' ? ' selected' : '') + '>PIX</option><option value="Cartão"' + (pagSelecionado === 'Cartão' ? ' selected' : '') + '>Cartão</option><option value="Dinheiro"' + (pagSelecionado === 'Dinheiro' ? ' selected' : '') + '>Dinheiro</option></select></span></div>' +
            infoPrefHtml +
            parcelasHtml +
            '</div></div>' +
            (ag.descricaoCliente ? '<div class="agenda-detalhe-secao"><h6><i class="bi bi-chat-quote me-1"></i>Serviço Desejado pelo Cliente</h6><p style="white-space:pre-wrap;background:#f0f4ff;border-left:3px solid #146ADB;padding:10px 12px;border-radius:0 6px 6px 0;font-size:.88rem;margin:0;">' + _escaparHtml(ag.descricaoCliente) + '</p></div>' : '') +
            (ag.subcategoriasCliente && ag.subcategoriasCliente.length > 0
                ? '<div class="agenda-detalhe-secao"><h6><i class="bi bi-list-check me-1"></i>Serviços Selecionados pelo Cliente</h6>' +
                  '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">' +
                  ag.subcategoriasCliente.map(function (sc) {
                      return '<span style="display:inline-block;background:#FFC300;color:#000;font-size:.82rem;font-weight:700;' +
                          'padding:3px 12px;border-radius:20px;">' + _escaparHtml(sc) + '</span>';
                  }).join('') +
                  '</div></div>'
                : '') +
            '<div class="agenda-detalhe-secao" id="secao-lembretes"><h6><i class="bi bi-bell me-1"></i>Lembretes <small class="text-muted fw-normal">(editável)</small></h6>' +
            '<div id="agenda-lembretes-lista">' + lembretes.map(function (l, i) {
                return '<div class="agenda-lembrete-edit-row" style="display:flex;gap:6px;margin-bottom:6px;"><input type="text" class="form-control form-control-sm agenda-lembrete-input" value="' + _escaparHtml(l) + '" style="flex:1;"><button type="button" class="btn btn-sm btn-outline-danger agenda-lembrete-del" data-idx="' + i + '" title="Remover"><i class="bi bi-trash"></i></button></div>';
            }).join('') +
            '</div><button type="button" class="btn btn-sm btn-outline-secondary mt-1" id="btn-add-lembrete"><i class="bi bi-plus-circle me-1"></i>Adicionar Lembrete</button></div>' +
            '<div class="agenda-detalhe-secao"><h6><i class="bi bi-chat-left-text me-1"></i>Observações <small class="text-muted fw-normal">(editável)</small></h6>' +
            '<textarea id="agenda-obs-textarea" class="form-control form-control-sm" rows="3" style="resize:vertical;">' + _escaparHtml(obs) + '</textarea></div>' +
            '<div class="mt-3 text-end"><button type="button" class="btn btn-warning btn-sm" id="btn-salvar-detalhes"><i class="bi bi-floppy me-1"></i>Salvar Detalhes</button></div>';

        // Listener: exibe bloco de parcelamento quando Cartão for selecionado
        var detPagEl = document.getElementById('det-pagamento');
        var detParcBloco = document.getElementById('det-parcelas-bloco');

        // Sprint 4 — listener do botão "Ver Perfil" do cliente
        var btnVerPerfilCli = document.getElementById('btn-ver-perfil-cliente');
        if (btnVerPerfilCli && ag.clienteEmail) {
            btnVerPerfilCli.addEventListener('click', function () {
                _abrirModalPerfilCliente(ag.clienteEmail);
            });
        }

        // Sprint 7 — garante via JS que det-pagamento reflita a preferência do cliente
        // (complementa o atributo `selected` no HTML, evitando variações de parser do browser)
        if (detPagEl && pagSelecionado) {
            detPagEl.value = pagSelecionado;
            // Sincroniza imediatamente a visibilidade do bloco de parcelamento
            if (detParcBloco) detParcBloco.style.display = detPagEl.value === 'Cartão' ? 'block' : 'none';
        }

        if (detPagEl && detParcBloco) {
            detPagEl.addEventListener('change', function () {
                detParcBloco.style.display = detPagEl.value === 'Cartão' ? 'block' : 'none';
            });
        }

        // ---- Cálculo automático de valor de cada parcela (Sprint 1) ----
        // Fórmula: Valor de cada parcela = Valor total / Qtd. parcelas
        // Dispara sempre que Valor ou Qtd. Parcelas mudar.
        function _calcularValorParcela() {
            var elValor = document.getElementById('det-valor');
            var elQtd   = document.getElementById('det-parcelas-qtd');
            var elParcV = document.getElementById('det-parcelas-valor');
            if (!elValor || !elQtd || !elParcV) return;
            var V = parseFloat(elValor.value) || 0;
            var n = parseInt(elQtd.value, 10) || 0;
            if (V > 0 && n > 0) {
                elParcV.value = (V / n).toFixed(2);
            }
        }
        ['det-valor', 'det-parcelas-qtd'].forEach(function (fId) {
            var fEl = document.getElementById(fId);
            if (fEl) fEl.addEventListener('input', _calcularValorParcela);
        });
        // Calcula imediatamente se valores já estiverem preenchidos (reabertura do modal)
        _calcularValorParcela();

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

        // Salvar / Enviar Orçamento
        var btnSalvarLabel = (ag.status === 'orcamento_pendente') ? 'Enviar Orçamento' : 'Salvar Detalhes';
        var btnSalvarIcon  = (ag.status === 'orcamento_pendente') ? 'bi-send' : 'bi-floppy';
        corpo.querySelector('#btn-salvar-detalhes').textContent = '';
        corpo.querySelector('#btn-salvar-detalhes').innerHTML = '<i class="bi ' + btnSalvarIcon + ' me-1"></i>' + btnSalvarLabel;

        corpo.querySelector('#btn-salvar-detalhes').addEventListener('click', function () {
            var idx = agendamentos.findIndex(function (a) { return a.id === ag.id; });
            if (idx < 0) return;
            agendamentos[idx].valor = parseFloat((document.getElementById('det-valor') || {}).value) || 0;
            agendamentos[idx].formaPagamento = (document.getElementById('det-pagamento') || {}).value || '';
            agendamentos[idx].parcelas     = (document.getElementById('det-parcelas-qtd')   || {}).value || '';
            agendamentos[idx].valorParcela = (document.getElementById('det-parcelas-valor') || {}).value || '';
            agendamentos[idx].observacoes = (document.getElementById('agenda-obs-textarea') || {}).value || '';
            agendamentos[idx].lembretes = Array.from(corpo.querySelectorAll('.agenda-lembrete-input')).map(function (inp) { return inp.value.trim(); }).filter(Boolean);

            if (ag.status === 'orcamento_pendente') {
                // Enviar orçamento ao cliente
                agendamentos[idx].status = 'orcamento_enviado';
                salvarAgs();
                // Atualizar no storage do cliente
                if (ag.clienteEmail) {
                    _atualizarStatusClienteAgendamento(ag.id, ag.clienteEmail, 'orcamento_enviado');
                    var usuPrest = obterUsuarioLogado();
                    var nomePrestador = usuPrest ? (usuPrest.nome || emailPrest) : emailPrest;
                    var storeP = obterStorePrestadores();
                    if (storeP[emailPrest]) nomePrestador = storeP[emailPrest].nome || nomePrestador;
                    sgCriarNotificacao(ag.clienteEmail, 'orcamento_enviado', {
                        agendamentoId: ag.id,
                        servico: ag.servico,
                        prestadorNome: nomePrestador,
                        prestadorEmail: emailPrest,
                        valor: agendamentos[idx].valor,
                        formaPagamento: agendamentos[idx].formaPagamento,
                        parcelas: agendamentos[idx].parcelas || '',
                        valorParcela: agendamentos[idx].valorParcela || '',
                        data: ag.data,
                        horario: ag.horario,
                        descricaoCliente: ag.descricaoCliente || '',
                        subcategoriasCliente: ag.subcategoriasCliente || []
                    });
                }
                bootstrap.Modal.getInstance(modalEl).hide();
                exibirToast('Orçamento enviado ao cliente!');
            } else {
                salvarAgs();
                exibirToast('Detalhes salvos!');
            }
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

        // Sprint 3 — migração de registros legados de avaliacoesFeitasPrestAdm_<email>
        // Garante que avaliações salvas pela área exclusiva (chave antiga) também apareçam aqui.
        (function _migrarLegado() {
            var LEGACY_KEY = 'avaliacoesFeitasPrestAdm_' + emailPrest;
            var legacy = DB.get(LEGACY_KEY) || [];
            if (legacy.length === 0) return;
            var atuais = obterAvs();
            var idsAtuais = atuais.map(function (a) { return a.id; });
            var alterado = false;
            legacy.forEach(function (av) {
                var avId = av.pedidoId || av.id;
                if (!avId || idsAtuais.includes(avId)) return;
                // Tenta recuperar cliente/servico a partir dos agendamentos
                var ags = obterAgendamentosPrestador(emailPrest);
                var ag  = ags.find(function (a) { return a.id === avId; }) || {};
                atuais.push({
                    id: avId, pedidoId: avId,
                    cliente:    av.cliente    || ag.cliente    || '—',
                    servico:    av.servico    || ag.servico    || '—',
                    nota:       av.nota       || 0,
                    comentario: av.comentario || '',
                    data:       av.data       || new Date().toLocaleDateString('pt-BR')
                });
                alterado = true;
            });
            if (alterado) salvarAvs(atuais);
        })();

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
                var stars = Array.from({ length: 5 }, function (_, i) {
                    return i < av.nota
                        ? '<i class="bi bi-star-fill" style="color:#ffc107;"></i>'
                        : '<i class="bi bi-star" style="color:#ccc;"></i>';
                }).join('');
                var card = document.createElement('div');
                card.className = 'review-card-reverse review-card-prestador-feita';
                card.dataset.avId = av.id;
                card.innerHTML =
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        '<h5 class="mb-0">Cliente: ' + _escaparHtml(av.cliente || '—') +
                        ' <span class="text-muted fw-normal" style="font-size:.85rem;">(' + _escaparHtml(av.servico || '') + ')</span></h5>' +
                        '<span class="text-muted"><small>' + _escaparHtml(av.data || '') + '</small></span>' +
                    '</div>' +
                    '<div class="rating">' + stars +
                        '<h6 class="text-muted ms-2">Nota: ' + av.nota + '.0</h6>' +
                    '</div>' +
                    '<p class="review-text">“' + _escaparHtml(av.comentario || '') + '”</p>';
                container.insertBefore(card, botaoBloco || null);
            });
        }

        container.addEventListener('click', function (e) {
            var btnEd = e.target.closest('.btn-prest-feita-editar');

            if (btnEd) {
                var id = btnEd.dataset.id;
                var av = obterAvs().find(function (a) { return a.id === id; });
                if (!av) return;
                pedidoAtual = id;
                if (infoEl) infoEl.innerHTML =
                    '<strong>Cliente:</strong> ' + _escaparHtml(av.cliente || '—') +
                    ' &nbsp;|&nbsp; <strong>Serviço:</strong> ' + _escaparHtml(av.servico || '—');
                renderEstrelas(starsEl, notaEl, av.nota);
                if (comentEl) comentEl.value = av.comentario;
                if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
        });

        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                var nota   = parseInt((notaEl   || {}).value) || 0;
                var coment = (comentEl || {}).value || '';
                if (nota === 0)       { alert('Selecione uma nota.');       return; }
                if (!coment.trim())   { alert('Escreva um comentário.'); return; }

                // Atualiza em AVAL_FEITAS_PREST_KEY
                var avs = obterAvs();
                var idx = avs.findIndex(function (a) { return a.id === pedidoAtual; });
                if (idx >= 0) { avs[idx].nota = nota; avs[idx].comentario = coment; salvarAvs(avs); }

                // Sprint 3 — atualiza também na chave legada
                var LEGACY_KEY = 'avaliacoesFeitasPrestAdm_' + emailPrest;
                var legacy = DB.get(LEGACY_KEY) || [];
                var idxL = legacy.findIndex(function (a) { return (a.pedidoId || a.id) === pedidoAtual; });
                if (idxL >= 0) { legacy[idxL].nota = nota; legacy[idxL].comentario = coment; DB.set(LEGACY_KEY, legacy); }

                // Atualiza no lado do cliente
                var KEY_CLI = 'avaliacoesRecebidasDoCliente';
                var avsCliente = DB.get(KEY_CLI) || [];
                var avId = 'rec-prest-' + pedidoAtual;
                var idxC = avsCliente.findIndex(function (a) { return a.id === avId; });
                if (idxC >= 0) { avsCliente[idxC].nota = nota; avsCliente[idxC].comentario = coment; DB.set(KEY_CLI, avsCliente); }

                if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
                renderizarLista();
                exibirToast('Avaliação atualizada com sucesso!');
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

        var avs = obterAvaliacoesRecebidasPrestador(emailPrest);

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
                card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0">Cliente: ' + _escaparHtml(av.cliente) + ' (' + _escaparHtml(av.servico) + ')</h5><span class="text-muted"><small>' + av.data + '</small></span></div><div class="rating">' + stars + '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6></div><p class="review-text">"' + _escaparHtml(av.comentario) + '"</p>';
                container.insertBefore(card, botaoBloco || null);
            });
        }
        renderizarLista();
    }

    // =========================================================
    // HOTSITE ADM (prestadorHotsiteAdm.html)
    // =========================================================
    // =========================================================
    // SPRINT 6 — LIMITES DE GALERIA DE MÍDIA POR PLANO CONTRATADO
    // =========================================================
    // Cada plano libera uma quantidade diferente de fotos e vídeos na
    // galeria do HotSite. As fotos sempre ocupam os primeiros slots;
    // os vídeos ocupam os últimos. Este mapa é a ÚNICA fonte de verdade
    // sobre o limite de cada plano — usado tanto no Hotsite Admin (onde
    // o prestador faz upload) quanto no Hotsite público (onde os
    // clientes visualizam), garantindo que o limite do plano contratado
    // seja efetivamente respeitado nos dois lugares.
    var LIMITES_GALERIA_POR_PLANO = {
        gratuito:     { fotos: 3,  videos: 1 },  // Teste grátis de 30 dias
        basico:       { fotos: 6,  videos: 1 },  // R$ 49,90/mês
        profissional: { fotos: 11, videos: 1 },  // R$ 89,90/mês
        premium:      { fotos: 18, videos: 2 }   // R$ 139,90/mês
    };

    /**
     * Resolve o limite de galeria (fotos/vídeos/total) vigente para o
     * e-mail informado, com base no plano efetivamente contratado.
     * Reaproveita SG_Plano.estado(), que já resolve trial, vigência,
     * trocas e cancelamentos agendados antes de responder.
     * Apenas uma assinatura paga ATIVA ('assinante') libera o limite do
     * próprio plano contratado; qualquer outra situação — trial (com ou
     * sem trialInicio ainda registrado), downgrade ao gratuito, cancelado,
     * em carência ou qualquer estado inesperado — aplica o limite mais
     * restritivo (Plano Gratuito), por segurança.
     */
    function _obterLimiteGaleriaPorEmail(email) {
        var padrao = LIMITES_GALERIA_POR_PLANO.gratuito;
        var planoId = 'gratuito';
        try {
            var est = (window.SG_Plano && window.SG_Plano.estado) ? window.SG_Plano.estado(email) : null;
            if (est && est.fase === 'assinante' && est.plano && LIMITES_GALERIA_POR_PLANO[est.plano]) {
                planoId = est.plano;
            }
        } catch (e) { /* mantém o padrão (gratuito) em caso de qualquer falha */ }
        var limite = LIMITES_GALERIA_POR_PLANO[planoId] || padrao;
        return { fotos: limite.fotos, videos: limite.videos, total: limite.fotos + limite.videos, planoId: planoId };
    }

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
        var inputSubcatInput = document.getElementById('adm-subcategorias-input');
        var inputCidade = document.getElementById('adm-cidade');
        var inputDescricao = document.getElementById('adm-descricao');
        var inputEndereco = document.getElementById('adm-endereco');
        var inputNumero = document.getElementById('adm-numero');
        var inputBairro = document.getElementById('adm-bairro');
        var inputComplemento = document.getElementById('adm-complemento');
        var inputCep = document.getElementById('adm-cep');
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
        if (inputNumero) inputNumero.value = dadosSalvos.numero || '';
        if (inputBairro) inputBairro.value = dadosSalvos.bairro || '';
        if (inputComplemento) inputComplemento.value = dadosSalvos.complemento || '';
        if (inputCep) inputCep.value = dadosSalvos.cep || '';
        if (inputTel) inputTel.value = dadosSalvos.tel || '';

        // Injetar bloco de subcategorias abaixo do select de categoria (se ainda não existir)
        if (inputCategoria && !document.getElementById('adm-subcategorias-grupo')) {
            var subcatGrupo = document.createElement('div');
            subcatGrupo.id = 'adm-subcategorias-grupo';
            subcatGrupo.className = 'hotsiteadm-grupo';
            subcatGrupo.innerHTML =
                '<label for="adm-subcategorias-input">Sub-categorias de Serviço ' +
                '<small style="color:var(--texto-muted);font-weight:400;">(opcional)</small></label>' +
                '<div style="display:flex;gap:6px;">' +
                '<input class="hotsiteadm-input" type="text" id="adm-subcategorias-input" ' +
                'placeholder="Ex.: Troca de torneira, Instalação elétrica…" style="flex:1;margin-bottom:0;">' +
                '<button type="button" id="btn-add-subcategoria" class="btn btn-warning btn-sm" ' +
                'style="white-space:nowrap;"><i class="bi bi-plus-circle me-1"></i>Adicionar</button>' +
                '</div>' +
                '<small style="color:var(--texto-muted);font-size:.78rem;display:block;margin-top:4px;">' +
                'Pressione <kbd>Enter</kbd> ou clique em Adicionar. ' +
                'Serão exibidas como opções de seleção para o cliente.</small>' +
                '<div id="adm-subcategorias-lista" ' +
                'style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:28px;"></div>';
            inputCategoria.closest('.hotsiteadm-grupo').insertAdjacentElement('afterend', subcatGrupo);
            inputSubcatInput = document.getElementById('adm-subcategorias-input');
        }

        // Subcategorias
        var subcategoriasDados = (dadosSalvos.subcategorias && Array.isArray(dadosSalvos.subcategorias))
            ? dadosSalvos.subcategorias.slice() : [];

        function _renderSubcategorias() {
            var listaEl = document.getElementById('adm-subcategorias-lista');
            if (!listaEl) return;
            listaEl.innerHTML = '';
            subcategoriasDados.forEach(function (sc, idx) {
                var chip = document.createElement('span');
                chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:#FFC300;color:#000;' +
                    'font-size:.82rem;font-weight:600;padding:3px 10px 3px 12px;border-radius:20px;cursor:default;';
                chip.innerHTML = _escaparHtml(sc) +
                    '<button type="button" data-idx="' + idx + '" style="background:none;border:none;padding:0;' +
                    'cursor:pointer;color:#000;font-size:1rem;line-height:1;margin-left:2px;" title="Remover">&times;</button>';
                chip.querySelector('button').addEventListener('click', function () {
                    subcategoriasDados.splice(parseInt(this.dataset.idx), 1);
                    _renderSubcategorias();
                });
                listaEl.appendChild(chip);
            });
            if (subcategoriasDados.length === 0) {
                listaEl.innerHTML = '<span style="color:#6c757d;font-size:.82rem;font-style:italic;">' +
                    'Nenhuma subcategoria cadastrada.</span>';
            }
        }
        _renderSubcategorias();

        if (inputSubcatInput) {
            // Adiciona ao pressionar Enter ou vírgula
            inputSubcatInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    var val = inputSubcatInput.value.replace(/,/g, '').trim();
                    if (val && !subcategoriasDados.includes(val)) {
                        subcategoriasDados.push(val);
                        _renderSubcategorias();
                    }
                    inputSubcatInput.value = '';
                }
            });
            // Botão de adicionar ao lado do input
            var btnAddSub = document.getElementById('btn-add-subcategoria');
            if (btnAddSub) {
                btnAddSub.addEventListener('click', function () {
                    var val = inputSubcatInput.value.replace(/,/g, '').trim();
                    if (val && !subcategoriasDados.includes(val)) {
                        subcategoriasDados.push(val);
                        _renderSubcategorias();
                    }
                    inputSubcatInput.value = '';
                    inputSubcatInput.focus();
                });
            }
        }

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

        // SPRINT 2 — Galeria de slots dinâmicos, de acordo com o plano contratado.
        // SPRINT 6 — Os limites (quantidade de fotos e vídeos) agora respeitam
        // efetivamente o plano vigente do prestador (ver LIMITES_GALERIA_POR_PLANO),
        // em vez de liberar sempre o máximo (18 imagens + 2 vídeos) para todos.
        // Slots de fotos vêm sempre antes dos slots de vídeo.
        // galeriaDados é indexado por slot e persiste em memória até Salvar & Publicar.
        var _limiteGaleriaPlano = _obterLimiteGaleriaPorEmail(emailLogado);
        var TOTAL_SLOTS_GALERIA = _limiteGaleriaPlano.total;
        var INICIO_SLOTS_VIDEO  = _limiteGaleriaPlano.fotos; // slots a partir daqui são vídeo
        var galeriaSalva = dadosSalvos.galeria;
        var galeriaDados = new Array(TOTAL_SLOTS_GALERIA).fill(null);
        // Carrega dados salvos respeitando o índice de slot, independente do tamanho do array salvo
        if (galeriaSalva && Array.isArray(galeriaSalva)) {
            for (var gi = 0; gi < galeriaSalva.length && gi < TOTAL_SLOTS_GALERIA; gi++) {
                galeriaDados[gi] = galeriaSalva[gi] || null;
            }
        }

        // SPRINT 2 — URLs locais (Object URL) para reprodução imediata em testes.
        // Ao selecionar um arquivo, uma URL local é criada na hora (sem custo de
        // conversão) para que a imagem/vídeo possa ser visualizada/reproduzida
        // imediatamente em "página local", enquanto o equivalente em base64
        // (usado na persistência e exibição ao cliente) é gerado em paralelo.
        var galeriaUrlsLocais = new Array(TOTAL_SLOTS_GALERIA).fill(null);
        function _liberarUrlLocal(slot) {
            if (galeriaUrlsLocais[slot]) {
                try { URL.revokeObjectURL(galeriaUrlsLocais[slot]); } catch (e) {}
                galeriaUrlsLocais[slot] = null;
            }
        }
        window.addEventListener('beforeunload', function () {
            for (var ru = 0; ru < TOTAL_SLOTS_GALERIA; ru++) _liberarUrlLocal(ru);
        });

        // SPRINT 3 — resolução assíncrona de mídias salvas no IndexedDB.
        // galeriaDados pode conter referências "idbmidia://<chave>" (mídias
        // já publicadas). Essas referências são resolvidas em segundo plano
        // e substituídas pelo conteúdo real (data URL) assim que disponíveis.
        var galeriaResolvendo = new Array(TOTAL_SLOTS_GALERIA).fill(false);
        function _resolverReferenciaMidia(slot) {
            if (galeriaResolvendo[slot]) return;
            var valor = galeriaDados[slot];
            if (!SG_MidiaDB.ehReferencia(valor)) return;
            galeriaResolvendo[slot] = true;
            SG_MidiaDB.obter(SG_MidiaDB.chaveDe(valor)).then(function (dataUrl) {
                galeriaResolvendo[slot] = false;
                galeriaDados[slot] = dataUrl || null;
                renderizarGaleria();
            }).catch(function () {
                galeriaResolvendo[slot] = false;
                galeriaDados[slot] = null;
                renderizarGaleria();
            });
        }

        function renderizarGaleria() {
            // Garante TOTAL_SLOTS_GALERIA slots no DOM antes de renderizar
            var galContainer = document.getElementById('galeria-thumbs');
            if (galContainer) {
                // SPRINT 6 — remove quaisquer slots (inclusive os pré-existentes
                // no HTML estático) cujo índice ultrapasse o limite do plano
                // contratado. Sem isso, um prestador em um plano com limite
                // menor que a marcação estática padrão continuaria enxergando
                // e podendo usar slots que não pertencem ao seu plano.
                Array.prototype.slice.call(galContainer.querySelectorAll('.hotsiteadm-thumb-preview')).forEach(function (thumbExcedente) {
                    if (parseInt(thumbExcedente.dataset.slot, 10) >= TOTAL_SLOTS_GALERIA) thumbExcedente.remove();
                });
                var existentes = galContainer.querySelectorAll('.hotsiteadm-thumb-preview').length;
                for (var s = existentes; s < TOTAL_SLOTS_GALERIA; s++) {
                    var newThumb = document.createElement('div');
                    newThumb.className = 'hotsiteadm-thumb-preview';
                    newThumb.dataset.slot = s;
                    galContainer.appendChild(newThumb);
                }
            }

            var thumbs = document.querySelectorAll('#galeria-thumbs .hotsiteadm-thumb-preview');
            thumbs.forEach(function (thumb) {
                // Captura o slot no escopo correto via IIFE para evitar closure bug
                (function(slotAtual) {
                    var ehSlotVideo = slotAtual >= INICIO_SLOTS_VIDEO;
                    var dado = galeriaDados[slotAtual];
                    var urlLocal = galeriaUrlsLocais[slotAtual];
                    // Limpa conteúdo e listeners anteriores (clone substitui o nó)
                    var novoThumb = thumb.cloneNode(false);
                    novoThumb.dataset.slot = slotAtual;
                    novoThumb.style.position = 'relative';
                    thumb.parentNode.replaceChild(novoThumb, thumb);

                    // Prioriza a URL local (Object URL) para reprodução imediata em
                    // testes; na ausência dela, usa o dado persistido (data URL).
                    // SPRINT 3 — se "dado" for uma referência ao IndexedDB ainda não
                    // resolvida, não é usada diretamente como fonte (seria inválida);
                    // a resolução assíncrona é disparada abaixo.
                    var referenciaPendente = SG_MidiaDB.ehReferencia(dado);
                    var fonte = urlLocal || (referenciaPendente ? null : dado);

                    if (fonte) {
                        var isVideo = ehSlotVideo || (typeof fonte === 'string' && (fonte.indexOf('data:video') === 0 || fonte.indexOf('/video/') >= 0));
                        if (isVideo) {
                            var vid = document.createElement('video');
                            vid.src = fonte;
                            vid.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
                            vid.muted = true;
                            vid.controls = true;
                            vid.setAttribute('playsinline', '');
                            novoThumb.appendChild(vid);
                        } else {
                            var img = document.createElement('img');
                            img.src = fonte;
                            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
                            novoThumb.appendChild(img);
                        }
                        var btnX = document.createElement('button');
                        btnX.type = 'button';
                        btnX.className = 'btn-galeria-excluir';
                        btnX.style.cssText = 'position:absolute;top:4px;right:4px;background:#dc3545;color:#fff;border:none;border-radius:50%;width:28px;height:28px;font-size:16px;line-height:1;cursor:pointer;z-index:2;';
                        btnX.innerHTML = '&times;';
                        btnX.title = 'Excluir mídia';
                        btnX.addEventListener('click', function (e) {
                            e.stopPropagation();
                            galeriaDados[slotAtual] = null;
                            _liberarUrlLocal(slotAtual);
                            renderizarGaleria();
                        });
                        novoThumb.appendChild(btnX);
                    } else if (referenciaPendente) {
                        // SPRINT 3 — mídia já publicada, ainda carregando do IndexedDB
                        novoThumb.innerHTML = '<i class="bi bi-hourglass-split"></i> Carregando…';
                        novoThumb.style.display = 'flex';
                        novoThumb.style.alignItems = 'center';
                        novoThumb.style.justifyContent = 'center';
                        novoThumb.style.gap = '4px';
                        novoThumb.style.color = '#6c757d';
                        novoThumb.style.fontSize = '.85rem';
                        _resolverReferenciaMidia(slotAtual);
                    } else {
                        var labelHtml = ehSlotVideo
                            ? '<i class="bi bi-play-circle"></i> Vídeo ' + (slotAtual - INICIO_SLOTS_VIDEO + 1)
                            : '<i class="bi bi-image"></i> Foto ' + (slotAtual + 1);
                        novoThumb.innerHTML = labelHtml;
                        novoThumb.style.display = 'flex';
                        novoThumb.style.alignItems = 'center';
                        novoThumb.style.justifyContent = 'center';
                        novoThumb.style.gap = '4px';
                        novoThumb.style.color = '#6c757d';
                        novoThumb.style.fontSize = '.85rem';
                    }

                    // Clique no card abre file input para esse slot específico
                    novoThumb.style.cursor = 'pointer';
                    novoThumb.addEventListener('click', function (e) {
                        if (e.target.classList.contains('btn-galeria-excluir')) return;
                        var fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = ehSlotVideo ? 'video/*' : 'image/*';
                        fileInput.addEventListener('change', function () {
                            var file = fileInput.files[0];
                            if (!file) return;

                            // SPRINT 2 — Gera imediatamente uma URL local (Object URL)
                            // a partir do arquivo selecionado, permitindo reproduzir a
                            // mídia em "página local" durante os testes, sem precisar
                            // aguardar a conversão para base64.
                            _liberarUrlLocal(slotAtual);
                            galeriaUrlsLocais[slotAtual] = URL.createObjectURL(file);
                            renderizarGaleria();

                            // Em paralelo, converte para data URL (base64) — é esse
                            // valor que será persistido no storage e exibido para os
                            // clientes na página pública do prestador.
                            var reader = new FileReader();
                            reader.onload = function (ev) {
                                galeriaDados[slotAtual] = ev.target.result;
                            };
                            reader.readAsDataURL(file);
                        });
                        fileInput.click();
                    });
                })(parseInt(thumb.dataset.slot));
            });
        }
        // SPRINT 6 — Aviso informativo (puramente aditivo, não altera nenhum
        // comportamento existente) mostrando ao prestador quantos arquivos de
        // mídia o seu plano atual libera na galeria.
        (function _sgExibirAvisoLimiteGaleria() {
            var galContainerRef = document.getElementById('galeria-thumbs');
            if (!galContainerRef || !galContainerRef.parentNode) return;
            var idAviso = 'sg-aviso-limite-galeria';
            var existenteAviso = document.getElementById(idAviso);
            if (existenteAviso) existenteAviso.remove();
            var nomesPlanoAviso = { gratuito: 'Teste Grátis (30 dias)', basico: 'Plano Básico', profissional: 'Plano Profissional', premium: 'Plano Premium' };
            var aviso = document.createElement('div');
            aviso.id = idAviso;
            aviso.style.cssText = 'margin:8px 0 12px;padding:8px 12px;background:#eef4ff;border:1px solid #b8d0f5;border-radius:6px;font-size:.82rem;color:#0d4fa3;';
            aviso.innerHTML = '<i class="bi bi-info-circle me-1"></i>Seu plano atual (<strong>' +
                (nomesPlanoAviso[_limiteGaleriaPlano.planoId] || _limiteGaleriaPlano.planoId) +
                '</strong>) permite até <strong>' + TOTAL_SLOTS_GALERIA + ' arquivos de mídia</strong> (' +
                _limiteGaleriaPlano.fotos + ' foto' + (_limiteGaleriaPlano.fotos === 1 ? '' : 's') + ' + ' +
                _limiteGaleriaPlano.videos + ' vídeo' + (_limiteGaleriaPlano.videos === 1 ? '' : 's') + ').';
            galContainerRef.parentNode.insertBefore(aviso, galContainerRef);
        }());
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
                    return '<div style="padding:10px;border-radius:8px;background:#f8f9fa;margin-bottom:8px;"><div>' + stars + '</div><p style="font-size:.85rem;margin:4px 0 0;">"' + _escaparHtml(av.comentario) + '"</p><small class="text-muted">— ' + _escaparHtml(av.cliente) + '</small></div>';
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

        // Máscara Telefone: (00) 00000-0000
        if (inputTel) {
            inputTel.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, '');
                if (v.length > 11) v = v.substring(0, 11);
                if (v.length === 0) { e.target.value = ''; return; }
                if (v.length <= 2) { v = '(' + v; }
                else if (v.length <= 7) { v = '(' + v.substring(0, 2) + ') ' + v.substring(2); }
                else if (v.length <= 11) { v = '(' + v.substring(0, 2) + ') ' + v.substring(2, 7) + '-' + v.substring(7); }
                e.target.value = v;
            });
        }

        // Máscara CEP: 00000-000
        if (inputCep) {
            inputCep.addEventListener('input', function (e) {
                var v = e.target.value.replace(/\D/g, '');
                if (v.length > 8) v = v.substring(0, 8);
                if (v.length > 5) v = v.substring(0, 5) + '-' + v.substring(5);
                e.target.value = v;
            });
        }

        // Campos obrigatórios com asterisco
        var obrigatorios = [
            { el: inputCnpj, label: 'CPF/CNPJ' }, { el: inputCategoria, label: 'Categoria Principal' },
            { el: inputCidade, label: 'Atende em' }, { el: inputEndereco, label: 'Endereço do Prestador' },
            { el: inputNumero, label: 'Número' }, { el: inputBairro, label: 'Bairro' },
            { el: inputCep, label: 'CEP' }, { el: inputTel, label: 'Telefone' }
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

                var enderecoCompleto = [
                    inputEndereco ? inputEndereco.value.trim() : '',
                    inputNumero ? inputNumero.value.trim() : '',
                    inputComplemento ? inputComplemento.value.trim() : '',
                    inputBairro ? inputBairro.value.trim() : '',
                    inputCep ? inputCep.value.trim() : ''
                ].filter(Boolean).join(', ');

                // SPRINT 3 — Antes de montar dadosSalvar, processa a galeria:
                // cada imagem/vídeo novo (base64) é gravado no IndexedDB e
                // substituído por uma referência leve "idbmidia://<chave>" para
                // não esgotar a cota do localStorage. Slots já referenciados são
                // mantidos; slots vazios removem qualquer mídia anterior salva.
                if (btnSalvar) { btnSalvar.disabled = true; }
                var operacoesMidia = [];
                var galeriaParaSalvar = new Array(TOTAL_SLOTS_GALERIA).fill(null);
                for (var slotSalvar = 0; slotSalvar < TOTAL_SLOTS_GALERIA; slotSalvar++) {
                    var chaveMidia = 'galeria_' + emailLogado + '_' + slotSalvar;
                    var valorSlot = galeriaDados[slotSalvar];

                    if (valorSlot && SG_MidiaDB.ehReferencia(valorSlot)) {
                        // Mídia já publicada anteriormente — mantém a referência.
                        galeriaParaSalvar[slotSalvar] = valorSlot;
                    } else if (valorSlot) {
                        // Mídia nova (data URL base64) — grava no IndexedDB.
                        (function (slotFixo, chaveFixa, valorFixo) {
                            operacoesMidia.push(
                                SG_MidiaDB.salvar(chaveFixa, valorFixo).then(function () {
                                    galeriaParaSalvar[slotFixo] = SG_MidiaDB.PREFIXO + chaveFixa;
                                })
                            );
                        })(slotSalvar, chaveMidia, valorSlot);
                    } else {
                        // Slot vazio — remove eventual mídia anterior salva nesse slot.
                        operacoesMidia.push(SG_MidiaDB.remover(chaveMidia));
                        galeriaParaSalvar[slotSalvar] = null;
                    }
                }

                Promise.all(operacoesMidia).then(function () {
                    var dadosSalvar = {
                        nome: inputNome ? inputNome.value : '', email: emailLogado,
                        cnpj: inputCnpj ? inputCnpj.value : '',
                        categoria: inputCategoria ? inputCategoria.value : '',
                        subcategorias: subcategoriasDados.slice(),
                        cidade: inputCidade ? inputCidade.value : '',
                        descricao: inputDescricao ? inputDescricao.value : '',
                        endereco: inputEndereco ? inputEndereco.value : '',
                        numero: inputNumero ? inputNumero.value : '',
                        bairro: inputBairro ? inputBairro.value : '',
                        complemento: inputComplemento ? inputComplemento.value : '',
                        cep: inputCep ? inputCep.value : '',
                        enderecoCompleto: enderecoCompleto,
                        tel: inputTel ? inputTel.value : '',
                        foto: (avatarDiv && avatarDiv.dataset.base64) || dadosSalvos.foto || '',
                        galeria: galeriaParaSalvar
                    };
                    var storeAtual = obterStorePrestadores();
                    storeAtual[emailLogado] = dadosSalvar;
                    var salvoOk = DB.set(HOTSITE_KEY, storeAtual);
                    if (btnSalvar) { btnSalvar.disabled = false; }
                    if (salvoOk) {
                        // Atualiza galeriaDados em memória com as referências salvas,
                        // mantendo a galeria consistente para a sessão atual.
                        galeriaDados = galeriaParaSalvar;
                        alert('Hot Site salvo e publicado com sucesso!');
                    } else {
                        alert('Não foi possível salvar: o armazenamento local atingiu o limite. ' +
                            'Tente usar imagens/vídeos menores ou remova alguma mídia da galeria.');
                    }
                }).catch(function (err) {
                    if (btnSalvar) { btnSalvar.disabled = false; }
                    alert('Não foi possível salvar as mídias da galeria: ' +
                        (err && err.message ? err.message : 'falha no armazenamento local de mídias.'));
                });
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
                if (inputNumero) inputNumero.value = '';
                if (inputBairro) inputBairro.value = '';
                if (inputComplemento) inputComplemento.value = '';
                if (inputCep) inputCep.value = '';
                if (inputTel) inputTel.value = '';
                subcategoriasDados.length = 0;
                _renderSubcategorias();
                aplicarAvatar(null);
                atualizarPreview();
            });
        }

        // Cancelar → indexPrestador (mantém login)
        if (btnCancelar) {
            btnCancelar.addEventListener('click', function (e) {
                e.preventDefault();
                var path = window.location.pathname;
                window.location.href = '/paginasPrestador/indexPrestador.html';
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
        if (!usu || usu.tipo !== 'prestador') return;
        var emailPrest = usu.email;
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
            if (confSalva[dia]) {
                if (ini) ini.value = confSalva[dia].inicio || ini.value;
                if (fim) fim.value = confSalva[dia].fim || fim.value;
                // Restaurar estado do checkbox para todos os dias
                var cbkId = dia + '-ativo';
                var cbkEl = document.getElementById(cbkId);
                if (cbkEl && confSalva[dia].ativo !== undefined) {
                    cbkEl.checked = !!confSalva[dia].ativo;
                    // Se o dia tem inputs de tempo, sincronizar disabled com o estado do checkbox
                    if (ini) ini.disabled = !cbkEl.checked;
                    if (fim) fim.disabled = !cbkEl.checked;
                }
            }
        });
        // Caso especial: domingo salvo como ativo → garantir que inputs fiquem habilitados
        if (confSalva.domingo && confSalva.domingo.ativo) {
            var domIni = document.getElementById('domingo-inicio');
            var domFim = document.getElementById('domingo-fim');
            var domCkSalvo = document.getElementById('domingo-ativo');
            if (domCkSalvo) domCkSalvo.checked = true;
            if (domIni) domIni.disabled = false;
            if (domFim) domFim.disabled = false;
        }
        if (confSalva.duracaoServico) { var el = document.getElementById('duracao-servico'); if (el) el.value = confSalva.duracaoServico; }
        if (confSalva.antecedencia)    { var el2 = document.getElementById('antecedencia');    if (el2) el2.value = confSalva.antecedencia; }
        if (confSalva.intervalo)       { var el3 = document.getElementById('intervalo');        if (el3) el3.value = confSalva.intervalo; }

        // Sprint 2 — ajustes no campo antecedencia e no select intervalo
        // (a) Garante min=12 no input de antecedência
        var antInput = document.getElementById('antecedencia');
        if (antInput) {
            antInput.min = '12';
            if (parseInt(antInput.value) < 12) antInput.value = '12';
        }
        // (b) Adiciona opção 60 min ao select de intervalo (se ainda não existir)
        var intvSelect = document.getElementById('intervalo');
        if (intvSelect && !intvSelect.querySelector('option[value="60"]')) {
            var opt60 = document.createElement('option');
            opt60.value = '60'; opt60.textContent = '60 minutos (1 hora)';
            intvSelect.appendChild(opt60);
        }

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
                var dur  = document.getElementById('duracao-servico');
                var ant  = document.getElementById('antecedencia');
                var intv = document.getElementById('intervalo');

                // Sprint 2 — validação de antecedência mínima (12 h)
                if (ant) {
                    var antVal = parseInt(ant.value);
                    if (isNaN(antVal) || antVal < 12) {
                        ant.value = '12';
                        alert('A antecedência mínima é de 12 horas. O valor foi ajustado automaticamente.');
                    }
                }

                if (dur)  dados.duracaoServico = dur.value;
                if (ant)  dados.antecedencia   = ant.value;
                if (intv) dados.intervalo       = intv.value;
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
        if (!usu || usu.tipo !== 'prestador') return;
        var emailPrest = usu.email;

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

        // Sprint 4 — converte dd/mm/yyyy → yyyy-mm-dd para comparação de período
        function _dmyParaIso(str) {
            if (!str) return '';
            var p = str.split('/');
            return (p.length === 3) ? p[2] + '-' + p[1].padStart(2,'0') + '-' + p[0].padStart(2,'0') : '';
        }

        function calcularStats(ini, fim) {
            var ags = obterAgs();

            // Sprint 2 (revisão) — usa a data de CONCLUSÃO (concluidoEm) como referência,
            // com fallback para ag.data, espelhando a lógica de renderizarHistoricoFiltrado.
            // Isso garante que serviços concluídos hoje apareçam no filtro do dia atual,
            // independentemente de quando o atendimento foi originalmente agendado.
            var concluidos = ags.filter(function (a) {
                if (a.status !== 'concluido') return false;
                if (!ini && !fim) return true;               // sem filtro → inclui todos

                // Determina a data de referência: concluidoEm (ISO → yyyy-mm-dd) ou ag.data
                var dataRef = a.concluidoEm
                    ? a.concluidoEm.substring(0, 10)
                    : (a.data || '');

                if (ini && dataRef < ini) return false;
                if (fim && dataRef > fim) return false;
                return true;
            });
            var clientes = {}; concluidos.forEach(function (a) { clientes[a.cliente] = true; });
            var fat = 0; concluidos.forEach(function (a) { fat += parseFloat(a.valor) || 0; });
            // Sprint 4 — avaliações também filtradas estritamente pelo período selecionado
            var avsRec = obterAvaliacoesRecebidasPrestador(emailPrest);
            if (ini || fim) {
                avsRec = avsRec.filter(function (a) {
                    var iso = _dmyParaIso(a.data);
                    if (!iso) return false;
                    if (ini && iso < ini) return false;
                    if (fim && iso > fim) return false;
                    return true;
                });
            }
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
                document.getElementById('dash-exp-print').addEventListener('click', function (e) { e.preventDefault(); var rm = document.querySelector('.relatorio-main'); if (rm) rm.setAttribute('data-print-date', new Date().toLocaleDateString('pt-BR')); window.print(); });
                document.getElementById('dash-exp-csv').addEventListener('click', function (e) {
                    e.preventDefault();
                    var ags = obterAgs().filter(function (a) { return a.status === 'concluido'; });
                    var csv = 'Data,Cliente,Serviço,Valor,Pagamento\n';
                    var totalCsv = 0;
                    ags.forEach(function (a) { var v = parseFloat(a.valor) || 0; totalCsv += v; csv += [a.data, '"' + a.cliente + '"', '"' + a.servico + '"', v.toFixed(2), '"' + (a.formaPagamento || '') + '"'].join(',') + '\n'; });
                    csv += ',,Total,' + totalCsv.toFixed(2) + ',\n';
                    _download(csv, 'relatorio_servgo.csv', 'text/csv;charset=utf-8;');
                });
                document.getElementById('dash-exp-xls').addEventListener('click', function (e) {
                    e.preventDefault();
                    var ags = obterAgs().filter(function (a) { return a.status === 'concluido'; });
                    var tsv = 'Data\tCliente\tServiço\tValor\tPagamento\n';
                    var totalXls = 0;
                    ags.forEach(function (a) { var v = parseFloat(a.valor) || 0; totalXls += v; tsv += [a.data, a.cliente, a.servico, v.toFixed(2), (a.formaPagamento || '')].join('\t') + '\n'; });
                    tsv += '\t\tTotal\t' + totalXls.toFixed(2) + '\t\n';
                    _download(tsv, 'relatorio_servgo.xls', 'application/vnd.ms-excel');
                });
                document.getElementById('dash-exp-word').addEventListener('click', function (e) {
                    e.preventDefault();
                    var ags = obterAgs().filter(function (a) { return a.status === 'concluido'; });
                    var totalWord = 0;
                    var html = '<html><head><meta charset="UTF-8"><title>Relatório ServGo!</title></head><body><h1>Relatório de Atendimentos</h1><table border="1" cellpadding="6"><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Pagamento</th></tr>';
                    ags.forEach(function (a) { var v = parseFloat(a.valor) || 0; totalWord += v; html += '<tr><td>' + a.data + '</td><td>' + a.cliente + '</td><td>' + a.servico + '</td><td>R$ ' + v.toFixed(2).replace('.', ',') + '</td><td>' + (a.formaPagamento || '') + '</td></tr>'; });
                    html += '<tr><td colspan="2"></td><td><strong>Total</strong></td><td colspan="2"><strong>R$ ' + totalWord.toFixed(2).replace('.', ',') + '</strong></td></tr>';
                    html += '</table></body></html>';
                    _download('\ufeff' + html, 'relatorio_servgo.doc', 'application/msword');
                });
            }

            if (concluidos.length === 0) { cardPlac.innerHTML = 'Nenhum atendimento concluído no período.'; return; }
            var totalValor = 0;
            concluidos.forEach(function (a) { totalValor += parseFloat(a.valor) || 0; });
            var tbl = '<div class="table-responsive"><table class="table table-bordered table-hover align-middle" style="font-size:.85rem;"><thead class="table-dark"><tr><th>#</th><th>Data</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Pagamento</th></tr></thead><tbody>';
            concluidos.forEach(function (a, i) { tbl += '<tr><td>' + (i + 1) + '</td><td>' + a.data + '</td><td>' + a.cliente + '</td><td>' + a.servico + '</td><td>' + formatBRL(a.valor) + '</td><td>' + (a.formaPagamento || '—') + '</td></tr>'; });
            tbl += '</tbody><tfoot><tr style="background:#f0f4ff;font-weight:700;"><td colspan="3"></td><td style="color:#0d3d78;">Total</td><td colspan="2" style="color:#0d3d78;">' + formatBRL(totalValor) + '</td></tr></tfoot></table></div>';
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
                // Sprint 4 — exige ao menos uma data para filtrar estritamente o período
                if (!ini && !fim) {
                    alert('Informe ao menos uma data (inicial ou final) para filtrar o período.');
                    return;
                }
                if (ini && fim && ini > fim) { alert('A data inicial não pode ser maior que a data final.'); return; }
                var info = document.getElementById('dash-periodo-info');
                if (info) {
                    info.style.display = 'block';
                    info.innerHTML =
                        '<i class="bi bi-funnel-fill me-1"></i>' +
                        'Período filtrado: ' +
                        (ini ? ini.split('-').reverse().join('/') : 'início') +
                        ' → ' +
                        (fim ? fim.split('-').reverse().join('/') : 'hoje');
                }
                renderizar(ini || null, fim || null);
            });
        }
        // Helper: limpa cards e tabela sem recalcular
        function limparTela() {
            // Zera os 4 indicadores do grid
            var grid = relMain.querySelector('.grid');
            if (grid) {
                grid.querySelectorAll('.kv').forEach(function (kv) { kv.textContent = '—'; });
            }
            // Limpa a tabela de detalhes
            var cardPlac = relMain.querySelector('.card .placeholder');
            if (cardPlac) {
                cardPlac.innerHTML =
                    '<span style="color:var(--texto-muted,#6c757d);font-style:italic;font-size:.9rem;">' +
                    '<i class="bi bi-funnel me-2"></i>' +
                    'Selecione um período e clique em <strong>Filtrar</strong> para visualizar o relatório.' +
                    '</span>';
            }
        }

        if (btnLimpar) {
            btnLimpar.addEventListener('click', function () {
                // Sprint 4 — limpa inputs de data
                ['dash-data-ini', 'dash-data-fim'].forEach(function (id) {
                    var el = document.getElementById(id); if (el) el.value = ''; 
                });
                // Oculta e limpa label de período
                var info = document.getElementById('dash-periodo-info');
                if (info) { info.style.display = 'none'; info.innerHTML = ''; }
                // Limpa cards e tabela sem repopular com dados gerais
                limparTela();
            });
        }

        // -------------------------------------------------------
        // Sprint 2 — ao carregar, pré-preenche ambos os campos com
        // a data de hoje e renderiza os indicadores do dia atual.
        // -------------------------------------------------------
        (function preencherHoje() {
            // Monta a data atual no formato yyyy-mm-dd (padrão input[type=date])
            var agora   = new Date();
            var ano     = agora.getFullYear();
            var mes     = String(agora.getMonth() + 1).padStart(2, '0');
            var dia     = String(agora.getDate()).padStart(2, '0');
            var hojeISO = ano + '-' + mes + '-' + dia;             // ex.: "2026-05-11"
            var hojeBR  = dia + '/' + mes + '/' + ano;             // ex.: "11/05/2026"

            // Preenche os dois inputs de período com a data de hoje
            var inpIni = document.getElementById('dash-data-ini');
            var inpFim = document.getElementById('dash-data-fim');
            if (inpIni) inpIni.value = hojeISO;
            if (inpFim) inpFim.value = hojeISO;

            // Exibe o rótulo de período informativo
            var info = document.getElementById('dash-periodo-info');
            if (info) {
                info.style.display = 'block';
                info.innerHTML =
                    '<i class="bi bi-calendar-check me-1"></i>' +
                    'Exibindo dados de <strong>hoje</strong> — ' + hojeBR;
            }

            // Renderiza os cards e a tabela com o filtro de hoje
            renderizar(hojeISO, hojeISO);
        }());
    }

    // =========================================================
    // CONTATO DO PRESTADOR (prestadorContato.html)
    // =========================================================
    // =========================================================
    // CONTATO DO PRESTADOR — Sprint 5
    // Envio real via FormSubmit.co (sem backend).
    // Destino fixo de testes: kleber.sdi@hotmail.com
    // ATENÇÃO: no primeiro envio, o FormSubmit envia um e-mail
    // de ativação para kleber.sdi@hotmail.com — confirme o link
    // recebido para ativar o endereço.
    // =========================================================

    // =========================================================
    // SPRINT 3 — MODO TESTE / PRODUÇÃO
    //
    // SG_MODO_KEY: chave do localStorage que controla o modo atual.
    //   'teste'    → tickets salvos normalmente, e-mails NÃO enviados
    //                — registrados no log de simulação (sgEmailLog).
    //   'producao' → tickets salvos + e-mails enviados via FormSubmit.
    //
    // O administrador alterna o modo pelo painel Admin (aba Suporte).
    // O modo padrão é 'teste' até que o admin ative a produção.
    //
    // COMO USAR:
    //  1. Abra o painel Admin → Suporte / Tickets → painel "Modo de Envio"
    //  2. Valide os e-mails simulados no log de testes
    //  3. Quando satisfeito, clique em "Ativar Produção"
    //  4. A partir daí todos os envios serão reais via FormSubmit
    // =========================================================
    var SG_MODO_KEY    = 'sgModoEnvio';
    var SG_EMAIL_LOG   = 'sgEmailLog';    // log de e-mails simulados (modo teste)

    /** Retorna 'teste' ou 'producao' */
    function sgObterModo() {
        return DB.get(SG_MODO_KEY) || 'teste';
    }
    function sgDefinirModo(modo) {
        DB.set(SG_MODO_KEY, modo === 'producao' ? 'producao' : 'teste');
    }
    function sgEmModoTeste() { return sgObterModo() !== 'producao'; }

    /** Registra um e-mail simulado no log de testes */
    function sgRegistrarEmailLog(entrada) {
        var log = DB.get(SG_EMAIL_LOG) || [];
        log.push(Object.assign({ dataRegistro: new Date().toISOString() }, entrada));
        // Mantém no máximo 200 entradas
        if (log.length > 200) log = log.slice(log.length - 200);
        DB.set(SG_EMAIL_LOG, log);
    }
    function sgObterEmailLog() { return DB.get(SG_EMAIL_LOG) || []; }
    function sgLimparEmailLog() { DB.remove(SG_EMAIL_LOG); }

    /**
     * Motor de envio unificado.
     * Em modo teste: registra no log e resolve imediatamente como sucesso.
     * Em modo produção: envia via FormSubmit.co.
     *
     * @param {Object} config  - { destEmail, fd (FormData), logEntry (objeto descritivo) }
     * @returns {Promise<{ok: boolean, simulado: boolean}>}
     */
    function sgEnviarEmail(config) {
        if (sgEmModoTeste()) {
            // Simula envio — registra no log
            sgRegistrarEmailLog(config.logEntry || { tipo: 'generico', destEmail: config.destEmail });
            console.info('[ServGo | MODO TESTE] E-mail simulado e registrado no log:', config.logEntry);
            return Promise.resolve({ ok: true, simulado: true });
        }
        // Produção — envio real
        return fetch('https://formsubmit.co/ajax/' + config.destEmail, { method: 'POST', body: config.fd })
            .then(function(res){
                return res.json().catch(function(){ return { success: res.ok ? 'true' : 'false' }; });
            })
            .then(function(data){
                var ok = data.success === 'true' || data.success === true;
                return { ok: ok, simulado: false };
            });
    }

    // =========================================================
    // SPRINT 3 — DADOS ADMINISTRATIVOS DE CONTATO (sgDadosAdm)
    // Armazena endereço, telefone, e-mail de suporte e outras
    // informações exibidas nas páginas de contato do site.
    // Configurados pelo administrador via dadosAdm.html.
    // =========================================================
    var SG_DADOS_ADM_KEY = 'sgDadosAdm';

    var SG_DADOS_ADM_DEFAULTS = {
        endereco:    'Rua Exemplo, 123 - Cidade, SP',
        telefone:    '(18) 91234-5678',
        emailSuporte:'contato@site.com.br',
        horarioAtendimento: 'Segunda a Sexta, das 08h às 18h',
        whatsapp:    '',
        site:        'www.servgo.com.br'
    };

    function sgObterDadosAdm() {
        return DB.get(SG_DADOS_ADM_KEY) || Object.assign({}, SG_DADOS_ADM_DEFAULTS);
    }
    function sgSalvarDadosAdm(dados) {
        DB.set(SG_DADOS_ADM_KEY, dados);
    }

    /**
     * Preenche dinamicamente o bloco .contato-info nas páginas de contato
     * com os dados cadastrados pelo administrador.
     */
    function sgPreencherContatoInfo() {
        var info = document.getElementById('contato-info-dinamico');
        if (!info) return;
        var d = sgObterDadosAdm();
        var endEl  = document.getElementById('ci-endereco');
        var telEl  = document.getElementById('ci-telefone');
        var emlEl  = document.getElementById('ci-email');
        if (endEl) endEl.innerHTML = '<i class="bi bi-geo-alt-fill me-2"></i>' + _escaparHtml(d.endereco || SG_DADOS_ADM_DEFAULTS.endereco);
        if (telEl) {
            var telHtml = '<i class="bi bi-telephone-fill me-2"></i>' + _escaparHtml(d.telefone || SG_DADOS_ADM_DEFAULTS.telefone);
            if (d.whatsapp) telHtml += '&nbsp;&nbsp;<a href="https://wa.me/' + d.whatsapp.replace(/\D/g,'') + '" target="_blank" style="color:inherit;"><i class="bi bi-whatsapp me-1" style="color:#25d366;"></i>' + _escaparHtml(d.whatsapp) + '</a>';
            telEl.innerHTML = telHtml;
        }
        if (emlEl) emlEl.innerHTML = '<i class="bi bi-envelope-fill me-2"></i>' + _escaparHtml(d.emailSuporte || SG_DADOS_ADM_DEFAULTS.emailSuporte);
        // Horário de atendimento — adiciona se existir
        var horEl = document.getElementById('ci-horario');
        if (!horEl && d.horarioAtendimento) {
            var h5 = document.createElement('h5');
            h5.id = 'ci-horario';
            h5.innerHTML = '<i class="bi bi-clock me-2"></i>' + d.horarioAtendimento;
            info.appendChild(h5);
        } else if (horEl) {
            horEl.innerHTML = '<i class="bi bi-clock me-2"></i>' + (d.horarioAtendimento || '');
        }
    }

    // =========================================================
    // SPRINT 3 — SISTEMA DE TICKETS (contato unificado)
    // Garante comunicação fluída: usuário envia → ticket criado
    // → admin gerencia → notificação por e-mail a cada mudança
    // de status (aberto → em andamento → resolvido).
    // =========================================================
    var SG_TICKETS_KEY = 'sgTickets';
    function sgObterTickets() { return DB.get(SG_TICKETS_KEY) || []; }
    function sgSalvarTickets(arr) { DB.set(SG_TICKETS_KEY, arr); }

    /**
     * Gera o HTML do corpo do e-mail de notificação de status para o usuário.
     * @param {Object} ticket
     * @param {string} status  - 'aberto' | 'em_andamento' | 'resolvido'
     * @param {string} resposta - Resposta/observação do admin (opcional)
     */
    function sgGerarEmailStatusTicket(ticket, status, resposta) {
        var statusLabel = { aberto: 'Aberto', em_andamento: 'Em Andamento', resolvido: 'Resolvido' }[status] || status;
        var statusCor   = { aberto: '#dc3545', em_andamento: '#b8870c', resolvido: '#198754' }[status] || '#555';
        var d = sgObterDadosAdm();
        return '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"></head>' +
            '<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0;">' +
            '<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">' +
            '<div style="background:#146ADB;padding:20px 28px;">' +
                '<span style="font-size:1.5rem;font-weight:800;color:#fff;">Serv<span style="color:#FFC300;">Go!</span></span>' +
                '<span style="color:#ffffffaa;font-size:.85rem;margin-left:12px;">Suporte / Atendimento</span>' +
            '</div>' +
            '<div style="padding:28px 32px;">' +
                '<h2 style="font-size:1.2rem;color:#212529;margin:0 0 12px;">Atualização do seu chamado</h2>' +
                '<div style="background:#f8f9fa;border-left:4px solid ' + statusCor + ';padding:14px 18px;border-radius:6px;margin-bottom:18px;">' +
                    '<div style="font-size:.82rem;color:#888;margin-bottom:4px;">Número do Chamado</div>' +
                    '<div style="font-weight:700;color:#212529;font-size:.95rem;">#' + ticket.id + '</div>' +
                    '<div style="font-size:.82rem;color:#888;margin-top:8px;margin-bottom:4px;">Status</div>' +
                    '<span style="background:' + statusCor + ';color:#fff;padding:3px 12px;border-radius:20px;font-size:.8rem;font-weight:700;">' + statusLabel + '</span>' +
                '</div>' +
                '<table style="width:100%;font-size:.88rem;border-collapse:collapse;margin-bottom:18px;">' +
                    '<tr><td style="padding:6px 0;color:#888;width:110px;">Assunto:</td><td style="padding:6px 0;color:#333;font-weight:600;">' + (ticket.assunto||'—') + '</td></tr>' +
                    '<tr><td style="padding:6px 0;color:#888;">Solicitante:</td><td style="padding:6px 0;color:#333;">' + (ticket.nome||'—') + '</td></tr>' +
                    '<tr><td style="padding:6px 0;color:#888;">Abertura:</td><td style="padding:6px 0;color:#333;">' + new Date(ticket.dataAbertura).toLocaleString('pt-BR') + '</td></tr>' +
                    (ticket.dataResposta ? '<tr><td style="padding:6px 0;color:#888;">Atualizado em:</td><td style="padding:6px 0;color:#333;">' + new Date(ticket.dataResposta).toLocaleString('pt-BR') + '</td></tr>' : '') +
                '</table>' +
                '<div style="background:#f8f9fa;padding:12px 16px;border-radius:6px;margin-bottom:18px;">' +
                    '<div style="font-size:.82rem;color:#888;margin-bottom:6px;font-weight:600;">Sua mensagem original:</div>' +
                    '<div style="font-size:.88rem;color:#444;line-height:1.6;">' + (ticket.mensagem||'') + '</div>' +
                '</div>' +
                (resposta ? '<div style="background:#d1fae5;border-left:4px solid #198754;padding:14px 18px;border-radius:6px;margin-bottom:18px;">' +
                    '<div style="font-size:.82rem;color:#065f46;font-weight:700;margin-bottom:6px;"><i>Resposta da equipe ServGo!:</i></div>' +
                    '<div style="font-size:.9rem;color:#065f46;line-height:1.6;">' + resposta + '</div>' +
                '</div>' : '') +
                (status === 'em_andamento' ? '<div style="background:#fff9e6;border:1px solid #ffe58f;padding:12px 16px;border-radius:6px;margin-bottom:18px;font-size:.85rem;color:#7d6608;">⏳ Sua solicitação está em análise. Nossa equipe entrará em contato em breve.</div>' : '') +
                (status === 'resolvido' ? '<div style="background:#d1fae5;border:1px solid #6ee7b7;padding:12px 16px;border-radius:6px;margin-bottom:18px;font-size:.85rem;color:#065f46;">✅ Seu chamado foi resolvido. Se precisar de mais ajuda, abra um novo chamado.</div>' : '') +
            '</div>' +
            '<div style="background:#f0f0f0;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">' +
                '<p style="color:#888;font-size:.8rem;margin:0 0 4px;">Dúvidas? Entre em contato: <a href="mailto:' + d.emailSuporte + '" style="color:#146ADB;">' + d.emailSuporte + '</a></p>' +
                '<p style="color:#aaa;font-size:.75rem;margin:0;">© ServGo! — ' + d.site + '</p>' +
            '</div>' +
            '</div></body></html>';
    }

    /**
     * Envia e-mail de notificação de status via FormSubmit para o usuário
     * que abriu o ticket.
     * @param {Object} ticket  - Objeto do ticket atualizado
     * @param {string} status  - Novo status
     * @param {string} resposta - Resposta do admin
     */
    function sgEnviarNotificacaoStatusTicket(ticket, status, resposta) {
        if (!ticket || !ticket.email) return;
        var d = sgObterDadosAdm();
        var destEmail = d.emailSuporte || 'contato@site.com.br';
        var statusLabel = { aberto: 'Aberto', em_andamento: 'Em Andamento', resolvido: 'Resolvido' }[status] || status;
        var fd = new FormData();
        fd.append('name',      'ServGo! Suporte');
        fd.append('email',     destEmail);
        fd.append('_replyto',  destEmail);
        fd.append('_subject',  '[ServGo! Suporte] Chamado #' + ticket.id + ' — Status: ' + statusLabel);
        fd.append('_captcha',  'false');
        fd.append('_template', 'table');
        fd.append('Para',      ticket.nome + ' <' + ticket.email + '>');
        fd.append('Assunto do Chamado', ticket.assunto || '—');
        fd.append('Status Atual', statusLabel);
        fd.append('Mensagem Original', ticket.mensagem || '—');
        if (resposta) fd.append('Resposta da Equipe', resposta);
        fd.append('Número do Chamado', '#' + ticket.id);

        sgEnviarEmail({
            destEmail: destEmail,
            fd: fd,
            logEntry: {
                tipo:       'notificacao_status',
                ticketId:   ticket.id,
                assunto:    ticket.assunto || '—',
                de:         'ServGo! Suporte <' + destEmail + '>',
                para:       ticket.nome + ' <' + ticket.email + '>',
                statusNovo: status,
                statusLabel: statusLabel,
                resposta:   resposta || '',
                modoEnvio:  sgObterModo()
            }
        }).catch(function(e){ console.warn('[ServGo] Notificação de ticket não enviada:', e); });
    }

    /**
     * Formulário de contato unificado.
     * Funciona nas três páginas: contatoSite.html, clienteContatoSite.html,
     * prestadorContato.html.
     *
     * Lógica:
     *  1. Pré-preenche nome/e-mail se o usuário estiver logado
     *  2. Valida campos obrigatórios
     *  3. Cria ticket no localStorage (sgTickets) com status 'aberto'
     *  4. Envia também via FormSubmit para o e-mail de suporte configurado
     *  5. Exibe feedback claro ao usuário com número do chamado
     *  6. Preenche contato-info com dados dinâmicos do admin
     */
    function inicializarFormContato() {
        // Preenche informações de contato do admin dinamicamente
        sgPreencherContatoInfo();

        // Detecta qual botão está presente na página
        var btnEnviar = document.getElementById('btn-enviar-contato-site') ||
                        document.getElementById('btn-enviar-contato-cliente') ||
                        document.getElementById('btn-enviar-contato-prestador') ||
                        document.querySelector('.contato-enviar-btn');
        if (!btnEnviar) return;

        // Badge de modo visível para o usuário (só em teste, para orientar desenvolvedores)
        if (sgEmModoTeste()) {
            var badgeModo = document.createElement('div');
            badgeModo.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;color:#856404;font-size:.78rem;padding:5px 12px;border-radius:6px;margin-bottom:10px;display:inline-flex;align-items:center;gap:6px;';
            badgeModo.innerHTML = '<i class="bi bi-flask me-1"></i><strong>Modo Teste ativo</strong> — e-mails não serão enviados. Ative o Modo Produção no painel Admin → Suporte.';
            btnEnviar.parentNode.insertBefore(badgeModo, btnEnviar);
        }

        // Detecta qual div de feedback usar
        var feedbackEl = document.getElementById('contato-site-feedback') ||
                         document.getElementById('contato-cliente-feedback') ||
                         document.getElementById('contato-prestador-feedback');

        // Pré-preenche nome e e-mail do usuário logado
        var usu = obterUsuarioLogado();
        if (usu) {
            var nomeEl  = document.getElementById('nome');
            var emailEl = document.getElementById('email');
            if (nomeEl  && !nomeEl.value)  nomeEl.value  = usu.nome  || '';
            if (emailEl && !emailEl.value) emailEl.value = usu.email || '';
        }

        // Detecta origem (prestador, cliente ou visitante)
        var path = window.location.pathname;
        var origemContato = path.includes('prestador') ? 'prestador' :
                            path.includes('cliente')   ? 'cliente'   : 'visitante';

        btnEnviar.addEventListener('click', function () {
            var nome     = ((document.getElementById('nome')     || {}).value || '').trim();
            var email    = ((document.getElementById('email')    || {}).value || '').trim();
            var assunto  = ((document.getElementById('assunto')  || {}).value || '').trim() || 'Contato via site';
            var mensagem = ((document.getElementById('mensagem') || {}).value || '').trim();
            var arquivoInput = document.getElementById('arquivo');

            // Validações — feedback inline
            function mostrarErro(msg) {
                if (feedbackEl) {
                    feedbackEl.style.display = 'block';
                    feedbackEl.innerHTML = '<div class="alert alert-danger py-2"><i class="bi bi-exclamation-triangle me-2"></i>' + msg + '</div>';
                } else { alert(msg); }
            }

            if (!nome)    { mostrarErro('Informe seu nome.');            return; }
            if (!email || !/\S+@\S+\.\S+/.test(email)) { mostrarErro('Informe um e-mail válido.'); return; }
            if (!mensagem) { mostrarErro('Escreva uma mensagem.');       return; }

            if (arquivoInput && arquivoInput.files && arquivoInput.files[0]) {
                if (arquivoInput.files[0].size / (1024 * 1024) > 20) {
                    mostrarErro('O arquivo deve ter no máximo 20 MB.'); return;
                }
            }

            // Cria ticket no localStorage
            var modoAtual = sgObterModo();
            var ticket = {
                id:               _gerarId('ticket'),
                assunto:          assunto,
                mensagem:         mensagem,
                nome:             nome,
                email:            email,
                origem:           origemContato,
                tipoUsuario:      usu ? usu.tipo : 'visitante',
                dataAbertura:     new Date().toISOString(),
                status:           'aberto',
                resposta:         '',
                dataResposta:     '',
                adminResponsavel: '',
                modoEnvio:        modoAtual,   // registra se foi criado em teste ou produção
                anexo:            arquivoInput && arquivoInput.files && arquivoInput.files[0]
                                      ? arquivoInput.files[0].name : null
            };
            var tickets = sgObterTickets();
            tickets.push(ticket);
            sgSalvarTickets(tickets);

            // Feedback visual no botão
            btnEnviar.disabled = true;
            var textoOriginal = btnEnviar.innerHTML;
            btnEnviar.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Enviando…';

            // Monta FormData (usado em produção; em teste apenas o logEntry é gravado)
            var d = sgObterDadosAdm();
            var destEmail = d.emailSuporte || 'contato@site.com.br';
            var fd = new FormData();
            fd.append('name',      nome);
            fd.append('email',     email);
            fd.append('_replyto',  email);
            fd.append('_subject',  '[ServGo! Contato] ' + assunto + ' — de ' + nome);
            fd.append('_captcha',  'false');
            fd.append('_template', 'table');
            fd.append('Assunto',   assunto);
            fd.append('Mensagem',  mensagem);
            fd.append('Origem',    origemContato);
            fd.append('Tipo Usuário', usu ? usu.tipo : 'visitante');
            fd.append('Nº Chamado', '#' + ticket.id);
            if (arquivoInput && arquivoInput.files && arquivoInput.files[0]) {
                fd.append('attachment', arquivoInput.files[0], arquivoInput.files[0].name);
            }

            sgEnviarEmail({
                destEmail: destEmail,
                fd: fd,
                logEntry: {
                    tipo:       'contato_novo',
                    ticketId:   ticket.id,
                    assunto:    assunto,
                    de:         nome + ' <' + email + '>',
                    para:       destEmail,
                    origem:     origemContato,
                    mensagem:   mensagem,
                    anexo:      ticket.anexo || null,
                    modoEnvio:  modoAtual
                }
            })
            .then(function(resultado) {
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = textoOriginal;

                var sufixoModo = resultado.simulado
                    ? '<div style="font-size:.78rem;margin-top:6px;color:#856404;background:#fff3cd;padding:4px 10px;border-radius:4px;display:inline-block;"><i class="bi bi-flask me-1"></i>Modo Teste — e-mail simulado e registrado no log do Admin.</div>'
                    : '';

                if (feedbackEl) {
                    feedbackEl.style.display = 'block';
                    feedbackEl.innerHTML =
                        '<div class="alert alert-success py-3">' +
                            '<div style="font-weight:700;font-size:1rem;margin-bottom:6px;"><i class="bi bi-check-circle-fill me-2"></i>Mensagem enviada com sucesso!</div>' +
                            '<div style="font-size:.88rem;">Chamado registrado: <strong>#' + ticket.id + '</strong>.</div>' +
                            '<div style="font-size:.85rem;margin-top:4px;color:#0d6832;">Nossa equipe responderá no e-mail <strong>' + email + '</strong> em breve.</div>' +
                            sufixoModo +
                        '</div>';
                } else {
                    exibirToast('Chamado #' + ticket.id + ' registrado' + (resultado.simulado ? ' (modo teste)' : '') + '!');
                }

                // Limpa formulário
                ['nome','email','assunto','mensagem','arquivo'].forEach(function(id){
                    var el = document.getElementById(id); if (el) el.value = '';
                });
                if (usu) {
                    var nEl = document.getElementById('nome'); if (nEl) nEl.value = usu.nome || '';
                    var eEl = document.getElementById('email'); if (eEl) eEl.value = usu.email || '';
                }
            })
            .catch(function(err){
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = textoOriginal;
                console.error('[ServGo] Erro no envio de contato:', err);
                if (feedbackEl) {
                    feedbackEl.style.display = 'block';
                    feedbackEl.innerHTML =
                        '<div class="alert alert-warning py-3">' +
                            '<div style="font-weight:700;margin-bottom:4px;"><i class="bi bi-exclamation-triangle me-2"></i>Mensagem registrada localmente.</div>' +
                            '<div style="font-size:.88rem;">Chamado <strong>#' + ticket.id + '</strong> salvo. Envio por e-mail falhou. Nossa equipe entrará em contato em breve.</div>' +
                        '</div>';
                } else {
                    exibirToast('Chamado #' + ticket.id + ' salvo — e-mail pendente.');
                }
            });
        });
    }

    // Mantém compatibilidade com chamadas existentes
    function inicializarContatoPrestador() { inicializarFormContato(); }

    // =========================================================
    // SPRINT 3 — DADOS ADM (dadosAdm.html — seção configuração
    // de dados de contato administrativos do site)
    // =========================================================
    function inicializarDadosAdm() {
        var secAdm = document.getElementById('sec-dados-adm-contato');
        if (!secAdm) return;

        var d = sgObterDadosAdm();

        function _preencherCampos(dados) {
            var mapa = {
                'dadosadm-endereco':    dados.endereco,
                'dadosadm-telefone':    dados.telefone,
                'dadosadm-email':       dados.emailSuporte,
                'dadosadm-horario':     dados.horarioAtendimento,
                'dadosadm-whatsapp':    dados.whatsapp,
                'dadosadm-site':        dados.site
            };
            Object.keys(mapa).forEach(function(id){
                var el = document.getElementById(id);
                if (el) el.value = mapa[id] || '';
            });
        }

        function _salvarCampos() {
            var dados = {
                endereco:            (document.getElementById('dadosadm-endereco')  || {}).value || '',
                telefone:            (document.getElementById('dadosadm-telefone')  || {}).value || '',
                emailSuporte:        (document.getElementById('dadosadm-email')     || {}).value || '',
                horarioAtendimento:  (document.getElementById('dadosadm-horario')   || {}).value || '',
                whatsapp:            (document.getElementById('dadosadm-whatsapp')  || {}).value || '',
                site:                (document.getElementById('dadosadm-site')      || {}).value || ''
            };
            if (!dados.emailSuporte || !/\S+@\S+\.\S+/.test(dados.emailSuporte)) {
                alert('Informe um e-mail de suporte válido.'); return;
            }
            sgSalvarDadosAdm(dados);
            exibirToast('Dados de contato administrativos salvos com sucesso!');
        }

        _preencherCampos(d);

        var btnSalvar = document.getElementById('btn-salvar-dados-adm');
        if (btnSalvar) btnSalvar.addEventListener('click', _salvarCampos);

        var btnRestaurar = document.getElementById('btn-restaurar-dados-adm');
        if (btnRestaurar) btnRestaurar.addEventListener('click', function(){
            if (confirm('Restaurar os valores padrão de contato?')) {
                sgSalvarDadosAdm(Object.assign({}, SG_DADOS_ADM_DEFAULTS));
                _preencherCampos(SG_DADOS_ADM_DEFAULTS);
                exibirToast('Dados restaurados para os valores padrão.');
            }
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

        // Sprint 1 — inclui solicitações novas (orcamento_pendente) na contagem de Pedidos em Aberto
        (function _complementarStatComSolicitacoes() {
            var usu0 = obterUsuarioLogado();
            var emailCli0 = usu0 ? usu0.email : '';
            var agsAll0 = DB.get('clienteAgendamentos_' + emailCli0) || [];
            var countAtivos = agsAll0.filter(function (a) {
                return a.status === 'orcamento_pendente' || a.status === 'orcamento_enviado';
            }).length;
            // Soma com emAberto existente (pedidos estáticos da lista)
            stats.emAberto += countAtivos;
        }());

        atualizarStatCards(stats);

        // Links nos stat cards
        var cards = document.querySelectorAll('.cli-stat-card');
        /* Sprint 1 — link do stat card mostra estado correto para cada status */
        (function _configurarLinkAguardando() {
            var usu2 = obterUsuarioLogado();
            var emailCli2 = usu2 ? usu2.email : '';
            var agsCliAll = DB.get('clienteAgendamentos_' + emailCli2) || [];
            var pendEnviado  = agsCliAll.filter(function (a) { return a.status === 'orcamento_enviado'; });
            var pendAguard   = agsCliAll.filter(function (a) { return a.status === 'orcamento_pendente'; });
            var cancelados   = agsCliAll.filter(function (a) { return a.status === 'cancelado'; });
            if (cards[0]) {
                var info0 = cards[0].querySelector('.cli-stat-info');
                if (info0) {
                    if (pendEnviado.length > 0) {
                        // Sprint 2 — sem links; ações ficam na seção inline sprint1-sol-card
                        info0.innerHTML =
                            '<i class="bi bi-check-circle" style="color:#198754;"></i> Proposta recebida — ver detalhes abaixo';
                    } else if (pendAguard.length > 0) {
                        // Sprint 2 — texto simples, sem link clicável
                        info0.innerHTML =
                            '<i class="bi bi-hourglass"></i> Aguardando confirmação do prestador';
                    } else if (cancelados.length > 0) {
                        // Prestador cancelou — permite ver o motivo
                        info0.innerHTML =
                            '<i class="bi bi-x-circle" style="color:#dc3545;"></i> ' +
                            '<a href="#" id="link-solicitacao-cancelada" style="color:#dc3545;text-decoration:underline;">Solicitação cancelada</a>';
                        var linkCan = document.getElementById('link-solicitacao-cancelada');
                        if (linkCan) linkCan.addEventListener('click', function (e) { e.preventDefault(); _abrirModalSolicitacaoCancelada(cancelados, criarModal); });
                    } else {
                        info0.innerHTML = '<i class="bi bi-hourglass"></i> Nenhum orçamento pendente';
                    }
                }
            }
        }());

        // Sprint 1 — Renderiza seção inline de solicitações em andamento
        _renderizarSolicitacoesPendentes();

        // ── Sprint 2/3 — Stat cards: lógica baseada no DB ───────────────────
        (function _configurarCardsStatSprint2() {
            var usuS2 = obterUsuarioLogado();
            var emailS2 = usuS2 ? usuS2.email : '';
            var agsS2 = DB.get('clienteAgendamentos_' + emailS2) || [];

            // Agendamentos em aberto = não concluídos e não cancelados
            var agsAbertos = agsS2.filter(function (a) {
                return a.status !== 'concluido' && a.status !== 'cancelado';
            });

            // Agendamentos concluídos pelo prestador
            var agsConcluidos = agsS2.filter(function (a) {
                return a.status === 'concluido';
            });

            // ── Sprint 3 — enriquece registro do cliente com dados financeiros
            // do storage do prestador (valor e formaPagamento não são gravados
            // em clienteAgendamentos_ pelo fluxo atual).
            function enriquecerAg(ag) {
                var agPrest = null;
                if (ag.emailPrestador) {
                    var listaPrest = obterAgendamentosPrestador(ag.emailPrestador);
                    agPrest = listaPrest.find(function (p) { return p.id === ag.id; }) || null;
                }
                return {
                    data:           ag.data || '',
                    // horario no clienteAgendamentos_ vem como "HH:MM - HH:MM"; pega só o início
                    horario:        (ag.horario || '').split(' - ')[0].trim(),
                    servico:        ag.servico || (agPrest ? agPrest.servico : '') || '—',
                    // subcategoriasCliente é o campo correto no storage do cliente
                    subcategorias:  ag.subcategoriasCliente || (agPrest ? (agPrest.subcategoriasCliente || []) : []),
                    // nomePrestador é o campo correto no storage do cliente
                    prestador:      ag.nomePrestador || (agPrest ? (agPrest.prestador || agPrest.prestadorNome || '') : '') || '—',
                    // valor e formaPagamento vêm do storage do prestador quando ausentes no cliente
                    valor:          parseFloat(ag.valor) || (agPrest ? parseFloat(agPrest.valor) || 0 : 0),
                    formaPagamento: ag.formaPagamento || (agPrest ? agPrest.formaPagamento : '') || '—'
                };
            }

            // Total monetário dos agendamentos em aberto (via dados enriquecidos)
            var totalPendente = 0;
            agsAbertos.forEach(function (a) {
                totalPendente += enriquecerAg(a).valor;
            });

            // Helper — "YYYY-MM-DD às HH:MM"
            function fmtDH(ag) {
                var d = (ag.data || '').trim();
                var h = (ag.horario || '').trim();
                return d + (h ? ' às ' + h : '');
            }

            // Helper — serviço + subcategorias concatenados
            function fmtSrv(ag) {
                var partes = [];
                if (ag.servico) partes.push(ag.servico);
                var subs = Array.isArray(ag.subcategorias) ? ag.subcategorias : [];
                subs.forEach(function (s) { if (s && partes.indexOf(s) < 0) partes.push(s); });
                return partes.filter(Boolean).join(', ') || '—';
            }

            // Helper — valor em BRL
            function fmtBRL(v) {
                return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',');
            }

            // ── Card[0]: Pedidos em Aberto — atualiza valor via DB ────────────
            if (cards[0]) {
                var valEl0 = cards[0].querySelector('.cli-stat-valor');
                if (valEl0) valEl0.textContent = agsAbertos.length;
            }

            // ── Card[1]: Serviços Pendentes de Pagamento ──────────────────────
            if (cards[1]) {
                var valEl1 = cards[1].querySelector('.cli-stat-valor');
                var info1 = cards[1].querySelector('.cli-stat-info');

                // Valor: mostra total pendente ou traço se não houver nada pendente
                if (valEl1) {
                    valEl1.textContent = agsAbertos.length > 0
                        ? fmtBRL(totalPendente)
                        : '—';
                }

                if (info1) {
                    if (agsAbertos.length > 0) {
                        info1.innerHTML = '<i class="bi bi-currency-dollar"></i> <a href="#" id="link-pagamentos" style="color:inherit;text-decoration:underline;">Ver detalhes</a>';
                        var linkPag = document.getElementById('link-pagamentos');
                        if (linkPag) {
                            linkPag.addEventListener('click', function (e) {
                                e.preventDefault();
                                var rows1 = agsAbertos.map(function (a) {
                                    var d = enriquecerAg(a);
                                    return '<tr>' +
                                        '<td style="white-space:nowrap;">' + fmtDH(d) + '</td>' +
                                        '<td>' + fmtSrv(d) + '</td>' +
                                        '<td>' + d.prestador + '</td>' +
                                        '<td style="white-space:nowrap;">' + fmtBRL(d.valor) + '</td>' +
                                        '<td>' + d.formaPagamento + '</td>' +
                                        '</tr>';
                                }).join('');
                                var conteudo1 =
                                    '<p class="mb-3"><strong>Valor do Serviço: ' + fmtBRL(totalPendente) + '</strong></p>' +
                                    '<div class="table-responsive">' +
                                    '<table class="table table-sm table-bordered align-middle">' +
                                    '<thead class="table-light"><tr>' +
                                    '<th>Data</th><th>Serviço / Subcategoria</th>' +
                                    '<th>Prestador</th><th>Valor</th><th>Pagamento</th>' +
                                    '</tr></thead>' +
                                    '<tbody>' + rows1 + '</tbody>' +
                                    '</table></div>';
                                var modal1 = criarModal('modalPagamentos', '<i class="bi bi-currency-dollar me-2"></i>Pagamentos Pendentes', '#FFC300', conteudo1);
                                new bootstrap.Modal(modal1).show();
                            });
                        }
                    } else {
                        info1.innerHTML = '<i class="bi bi-currency-dollar"></i> Nenhum pagamento pendente';
                    }
                }
            }

            // ── Card[2]: Serviços Concluídos — Ver Histórico (somente concluídos) ──
            if (cards[2]) {
                var valEl2 = cards[2].querySelector('.cli-stat-valor');
                var info2 = cards[2].querySelector('.cli-stat-info');

                if (valEl2) valEl2.textContent = agsConcluidos.length;

                if (info2) {
                    info2.innerHTML = '<i class="bi bi-patch-check"></i> <a href="#" id="link-historico" style="color:inherit;text-decoration:underline;">Ver Histórico</a>';
                    var linkHist = document.getElementById('link-historico');
                    if (linkHist) {
                        linkHist.addEventListener('click', function (e) {
                            e.preventDefault();
                            var conteudo2;
                            if (agsConcluidos.length === 0) {
                                conteudo2 = '<p class="text-muted text-center py-3"><i class="bi bi-info-circle me-2"></i>Nenhum serviço concluído ainda.</p>';
                            } else {
                                var rows2 = agsConcluidos.map(function (a, i) {
                                    var d = enriquecerAg(a);
                                    return '<tr>' +
                                        '<td>' + (i + 1) + '</td>' +
                                        '<td style="white-space:nowrap;">' + fmtDH(d) + '</td>' +
                                        '<td>' + fmtSrv(d) + '</td>' +
                                        '<td>' + d.prestador + '</td>' +
                                        '<td style="white-space:nowrap;">' + fmtBRL(d.valor) + '</td>' +
                                        '<td>' + d.formaPagamento + '</td>' +
                                        '</tr>';
                                }).join('');
                                conteudo2 =
                                    '<div class="table-responsive">' +
                                    '<table class="table table-sm table-bordered align-middle">' +
                                    '<thead class="table-light"><tr>' +
                                    '<th>#</th><th>Data</th><th>Serviço / Subcategoria</th>' +
                                    '<th>Prestador</th><th>Valor</th><th>Pagamento</th>' +
                                    '</tr></thead>' +
                                    '<tbody>' + rows2 + '</tbody>' +
                                    '</table></div>';
                            }
                            var modal2 = criarModal('modalHistorico', '<i class="bi bi-patch-check me-2"></i>Histórico de Serviços', '#FFC300', conteudo2);
                            new bootstrap.Modal(modal2).show();
                        });
                    }
                }
            }
        }());

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
                var info = document.getElementById('modal-prestador-info'); if (info) info.innerHTML = '<strong>Serviço:</strong> ' + _escaparHtml(item.dataset.servico) + ' | <strong>Prestador:</strong> ' + _escaparHtml(item.dataset.profissional);
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
                var info = document.getElementById('modal-editar-info'); if (info) info.innerHTML = '<strong>Serviço:</strong> ' + _escaparHtml(av.servico) + ' | <strong>Prestador:</strong> ' + _escaparHtml(av.profissional);
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

    /* ── Sprint 1 ─────────────────────────────────────────────────────────────────
       Modal "Aguardando Confirmação": exibe APENAS os agendamentos com status
       orcamento_enviado, com todos os dados do orçamento retornado pelo prestador.
       Permite aceitar ou recusar diretamente por aqui.
       Após a última ação, remove o link do stat card chamando
       _atualizarLinkAguardandoStatCard().
    ─────────────────────────────────────────────────────────────────────────── */
    function _abrirModalAguardandoConf(criarModal) {
        var usu = obterUsuarioLogado();
        var emailCli = usu ? usu.email : '';
        var agsAll  = DB.get('clienteAgendamentos_' + emailCli) || [];
        /* Filtra somente os que ainda estão aguardando resposta do cliente */
        var ags = agsAll.filter(function (a) { return a.status === 'orcamento_enviado'; });

        function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        var html;
        if (ags.length === 0) {
            html = '<p class="text-muted text-center py-4"><i class="bi bi-check-all me-2" style="color:#198754;font-size:1.2rem;"></i>Nenhum orçamento pendente de confirmação.</p>';
        } else {
            html = ags.map(function (ag) {
                /* Busca dados completos do orçamento no registro do prestador */
                var agsPrest = obterAgendamentosPrestador(ag.emailPrestador || '');
                var agP = agsPrest.find(function (a) { return a.id === ag.id; }) || {};

                var valor        = agP.valor !== undefined ? parseFloat(agP.valor) : null;
                var formaPgto    = agP.formaPagamento || ag.formaPagamentoPreferida || '';
                var parcelas     = agP.parcelas || '';
                var valorParcela = agP.valorParcela || '';
                var local        = agP.clienteEndereco || '';
                var dataFmt      = (ag.data || '').split('-').reverse().join('/');
                var horario      = ag.horario ? ag.horario.split(' - ')[0] : '';
                var subcats      = (ag.subcategoriasCliente || []);

                var linhas = '';
                /* Nome do Prestador */
                linhas += '<p style="margin:4px 0;font-size:.88rem;"><i class="bi bi-person-fill me-1" style="color:#146ADB;"></i><strong>Prestador:</strong> ' + _esc(ag.nomePrestador) + '</p>';
                /* Tipo de serviço / subcategoria */
                linhas += '<p style="margin:4px 0;font-size:.88rem;"><i class="bi bi-tools me-1" style="color:#146ADB;"></i><strong>Serviço:</strong> ' + _esc(ag.servico);
                if (subcats.length > 0) linhas += ' &mdash; <span style="color:#555;">' + subcats.map(_esc).join(', ') + '</span>';
                linhas += '</p>';
                /* Data e hora */
                if (dataFmt || horario) {
                    linhas += '<p style="margin:4px 0;font-size:.88rem;"><i class="bi bi-calendar3 me-1" style="color:#146ADB;"></i><strong>Data/Hora:</strong> ' + _esc(dataFmt) + (horario ? ' às ' + _esc(horario) : '') + '</p>';
                }
                /* Local */
                if (local) {
                    linhas += '<p style="margin:4px 0;font-size:.88rem;"><i class="bi bi-geo-alt-fill me-1" style="color:#146ADB;"></i><strong>Local:</strong> ' + _esc(local) + '</p>';
                }
                /* Valor */
                if (valor !== null) {
                    linhas += '<p style="margin:4px 0;font-size:.88rem;"><i class="bi bi-cash-coin me-1" style="color:#146ADB;"></i><strong>Valor:</strong> R$ ' + valor.toFixed(2).replace('.', ',') + '</p>';
                }
                /* Forma de pagamento */
                if (formaPgto) {
                    linhas += '<p style="margin:4px 0;font-size:.88rem;"><i class="bi bi-credit-card me-1" style="color:#146ADB;"></i><strong>Pagamento:</strong> ' + _esc(formaPgto);
                    if (formaPgto === 'Cartão' && parcelas) {
                        linhas += ' — até ' + _esc(String(parcelas)) + ' parcela(s)' + (valorParcela ? ' de R$ ' + parseFloat(valorParcela).toFixed(2).replace('.', ',') : '');
                    }
                    linhas += '</p>';
                }

                return '<div class="notif-item-cli-aguardando" data-ag-id="' + _esc(ag.id) + '" ' +
                    'data-prest-email="' + _esc(ag.emailPrestador) + '" ' +
                    'data-prest-nome="' + _esc(ag.nomePrestador) + '" ' +
                    'data-servico="' + _esc(ag.servico) + '" ' +
                    'style="border-left:4px solid #146ADB;padding:12px 16px;background:#f0f4ff;border-radius:0 10px 10px 0;margin-bottom:14px;transition:opacity .3s;">' +
                    '<div style="font-weight:700;font-size:.95rem;margin-bottom:8px;color:#0d3d78;">' +
                    '<i class="bi bi-hourglass-split me-2" style="color:#146ADB;"></i>Orçamento Recebido — Aguardando sua Confirmação' +
                    '</div>' +
                    linhas +
                    '<div style="display:flex;gap:8px;margin-top:12px;">' +
                    '<button type="button" class="btn btn-danger btn-sm btn-aw-recusar">' +
                    '<i class="bi bi-x-circle me-1"></i>Recusar</button>' +
                    '<button type="button" class="btn btn-success btn-sm btn-aw-aceitar">' +
                    '<i class="bi bi-calendar-check me-1"></i>Aceitar e Confirmar</button>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }

        /* Reutiliza criarModal para manter o padrão visual */
        var modal = criarModal('modalAguardando', '<i class="bi bi-hourglass me-2"></i>Orçamentos Aguardando Confirmação', '#146ADB', html);
        var bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        /* ── Botões Recusar ── */
        modal.querySelectorAll('.btn-aw-recusar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var card       = btn.closest('.notif-item-cli-aguardando');
                var agId       = card.dataset.agId;
                var prestEmail = card.dataset.prestEmail;
                var servico    = card.dataset.servico;
                if (!confirm('Tem certeza que deseja recusar este orçamento?')) return;

                /* Atualiza storage do prestador */
                var agsPr = obterAgendamentosPrestador(prestEmail);
                var idxPr = agsPr.findIndex(function (a) { return a.id === agId; });
                if (idxPr >= 0) { agsPr[idxPr].status = 'orcamento_recusado'; salvarAgendamentosPrestador(prestEmail, agsPr); }

                /* Atualiza storage do cliente */
                _atualizarStatusClienteAgendamento(agId, emailCli, 'orcamento_recusado');

                /* Notifica prestador */
                sgCriarNotificacao(prestEmail, 'orcamento_recusado', { agendamentoId: agId, servico: servico });

                /* Marca notificação correspondente como lida */
                var notifsC = sgObterNotificacoes(emailCli);
                var nOrc = notifsC.find(function (n) { return n.tipo === 'orcamento_enviado' && (n.dados || {}).agendamentoId === agId; });
                if (nOrc) sgMarcarNotifLidaPorId(emailCli, nOrc.id);

                /* Remove card do modal com fade */
                card.style.opacity = '0';
                setTimeout(function () {
                    card.remove();
                    var restantes = modal.querySelectorAll('.notif-item-cli-aguardando');
                    if (restantes.length === 0) {
                        modal.querySelector('.modal-body').innerHTML =
                            '<p class="text-muted text-center py-4"><i class="bi bi-check-all me-2" style="color:#198754;font-size:1.2rem;"></i>Todos os orçamentos foram respondidos!</p>';
                        setTimeout(function () { bsModal.hide(); }, 1200);
                    }
                }, 320);

                _atualizarLinkAguardandoStatCard(emailCli);
                if (typeof exibirToast === 'function') exibirToast('Orçamento recusado. O prestador foi notificado.');
            });
        });

        /* ── Botões Aceitar ── */
        modal.querySelectorAll('.btn-aw-aceitar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var card       = btn.closest('.notif-item-cli-aguardando');
                var agId       = card.dataset.agId;
                var prestEmail = card.dataset.prestEmail;
                var prestNome  = card.dataset.prestNome;
                var servico    = card.dataset.servico;

                /* Atualiza storage do prestador */
                var agsPr = obterAgendamentosPrestador(prestEmail);
                var idxPr = agsPr.findIndex(function (a) { return a.id === agId; });
                if (idxPr >= 0) { agsPr[idxPr].status = 'confirmado'; salvarAgendamentosPrestador(prestEmail, agsPr); }

                /* Atualiza storage do cliente */
                _atualizarStatusClienteAgendamento(agId, emailCli, 'confirmado');

                /* Notifica prestador */
                sgCriarNotificacao(prestEmail, 'confirmacao', {
                    agendamentoId: agId, servico: servico,
                    clienteNome: usu ? usu.nome : ''
                });

                /* Marca notificação correspondente como lida */
                var notifsC = sgObterNotificacoes(emailCli);
                var nOrc = notifsC.find(function (n) { return n.tipo === 'orcamento_enviado' && (n.dados || {}).agendamentoId === agId; });
                if (nOrc) sgMarcarNotifLidaPorId(emailCli, nOrc.id);

                /* Remove card do modal com fade */
                card.style.opacity = '0';
                setTimeout(function () {
                    card.remove();
                    var restantes = modal.querySelectorAll('.notif-item-cli-aguardando');
                    if (restantes.length === 0) {
                        modal.querySelector('.modal-body').innerHTML =
                            '<p class="text-muted text-center py-4"><i class="bi bi-check-all me-2" style="color:#198754;font-size:1.2rem;"></i>Agendamento confirmado com sucesso!</p>';
                        setTimeout(function () { bsModal.hide(); }, 1200);
                    }
                }, 320);

                _atualizarLinkAguardandoStatCard(emailCli);
                if (typeof exibirToast === 'function') exibirToast('Agendamento confirmado! Serviço com ' + prestNome + ' está agendado.');
            });
        });
    }

    /* ── Sprint 1 — helper: atualiza (ou remove) o link "Aguardando Confirmação"
       no stat card após o cliente aceitar ou recusar um orçamento.             */
    function _atualizarLinkAguardandoStatCard(emailCli) {
        var agsAtual = DB.get('clienteAgendamentos_' + (emailCli || '')) || [];
        var pendEnviado = agsAtual.filter(function (a) { return a.status === 'orcamento_enviado'; });
        var pendAguard  = agsAtual.filter(function (a) { return a.status === 'orcamento_pendente'; });
        var cancelados  = agsAtual.filter(function (a) { return a.status === 'cancelado'; });
        var card0 = document.querySelector('.cli-stat-card.destaque-azul, .cli-stat-card:first-child');
        if (!card0) { var todos = document.querySelectorAll('.cli-stat-card'); if (todos.length > 0) card0 = todos[0]; }
        if (!card0) return;
        var info0 = card0.querySelector('.cli-stat-info');
        if (!info0) return;

        function _cm(idM, titulo, corT, body) {
            var ex2 = document.getElementById(idM); if (ex2) ex2.remove();
            var m = document.createElement('div');
            m.className = 'modal fade'; m.id = idM; m.setAttribute('tabindex', '-1');
            m.innerHTML = '<div class="modal-dialog modal-lg"><div class="modal-content">' +
                '<div class="modal-header" style="background-color:' + corT + ';color:' + (corT === '#dc3545' ? '#fff' : '#fff') + ';">' +
                '<h5 class="modal-title">' + titulo + '</h5>' +
                '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
                '<div class="modal-body">' + body + '</div>' +
                '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div>' +
                '</div></div>';
            document.body.appendChild(m); return m;
        }

        if (pendEnviado.length > 0) {
            // Sprint 2 — sem links de ação no stat card; ações estão na seção inline
            info0.innerHTML = '<i class="bi bi-check-circle" style="color:#198754;"></i> Proposta recebida — ver detalhes abaixo';
        } else if (pendAguard.length > 0) {
            // Sprint 2 — texto simples, sem link clicável
            info0.innerHTML = '<i class="bi bi-hourglass"></i> Aguardando confirmação do prestador';
        } else if (cancelados.length > 0) {
            info0.innerHTML = '<i class="bi bi-x-circle" style="color:#dc3545;"></i> <a href="#" id="link-solicitacao-cancelada" style="color:#dc3545;text-decoration:underline;">Solicitação cancelada</a>';
            var lc = document.getElementById('link-solicitacao-cancelada');
            if (lc) lc.addEventListener('click', function (e) { e.preventDefault(); _abrirModalSolicitacaoCancelada(cancelados, _cm); });
        } else {
            info0.innerHTML = '<i class="bi bi-hourglass"></i> Nenhum orçamento pendente';
        }

        // Atualiza também a seção inline
        if (typeof _renderizarSolicitacoesPendentes === 'function') _renderizarSolicitacoesPendentes();
    }

    // =========================================================
    // SPRINT 1 — HELPERS DE SOLICITAÇÃO DE AGENDAMENTO (CLIENTE)
    // =========================================================

    /* Renderiza a seção inline #cli-solicitacoes-sprint1 na Área do Cliente
       com todos os pedidos em andamento (orcamento_pendente, orcamento_enviado, cancelado). */
    function _renderizarSolicitacoesPendentes() {
        var usu = obterUsuarioLogado();
        if (!usu) return;
        var section = document.getElementById('cli-solicitacoes-sprint1');
        var lista   = document.getElementById('cli-solicitacoes-lista');
        if (!section || !lista) return;

        var agsAll = DB.get('clienteAgendamentos_' + usu.email) || [];
        var ativos = agsAll.filter(function (a) {
            return a.status === 'orcamento_pendente' ||
                   a.status === 'orcamento_enviado'  ||
                   a.status === 'cancelado';
        });

        if (ativos.length === 0) { section.style.display = 'none'; return; }
        section.style.display = '';

        function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        lista.innerHTML = ativos.map(function (ag) {
            var agsPrest   = obterAgendamentosPrestador(ag.emailPrestador || '');
            var agP        = agsPrest.find(function (a) { return a.id === ag.id; }) || {};
            var dataFmt    = (ag.data || '').split('-').reverse().join('/');
            var horario    = ag.horario ? ag.horario.split(' - ')[0] : '';
            var subcats    = (ag.subcategoriasCliente || []);
            var valor      = (agP.valor !== undefined && agP.valor !== 0) ? parseFloat(agP.valor) : null;
            var formaPgto  = agP.formaPagamento || ag.formaPagamentoPreferida || '';
            var parcelas   = agP.parcelas || '';
            var valorParc  = agP.valorParcela || '';

            // ── Sprint 2: orcamento_enviado → estilo notif-item-cli com todos os detalhes ──
            if (ag.status === 'orcamento_enviado') {
                var ts = ag.criadoEm
                    ? new Date(ag.criadoEm).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
                    : '';
                var linhas = '';
                linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-tools me-1" style="color:#6c757d;"></i><strong>Serviço:</strong> ' + _esc(ag.servico) + '</p>';
                linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-person-fill me-1" style="color:#6c757d;"></i><strong>Prestador:</strong> ' + _esc(ag.nomePrestador) + '</p>';
                if (dataFmt) linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-calendar3 me-1" style="color:#6c757d;"></i><strong>Data:</strong> ' + _esc(dataFmt) + (horario ? ' às ' + _esc(horario) : '') + '</p>';
                if (valor !== null) linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-cash-coin me-1" style="color:#6c757d;"></i><strong>Valor à vista:</strong> R$ ' + valor.toFixed(2).replace('.', ',') + '</p>';
                if (formaPgto) linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-credit-card me-1" style="color:#6c757d;"></i><strong>Pagamento:</strong> ' + _esc(formaPgto) + '</p>';
                if (formaPgto === 'Cartão' && parcelas)
                    linhas += '<p style="margin:3px 0;font-size:.85rem;padding:5px 10px;background:#fff8e1;border-left:3px solid #FFC300;border-radius:0 6px 6px 0;">' +
                        '<i class="bi bi-credit-card me-1" style="color:#e6a800;"></i>' +
                        '<strong>Parcelamento:</strong> até ' + _esc(String(parcelas)) + ' parcela(s)' +
                        (valorParc ? ' de R$ ' + parseFloat(valorParc).toFixed(2).replace('.', ',') : '') + '</p>';
                if (ag.descricaoCliente) linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-chat-quote me-1" style="color:#6c757d;"></i><strong>Serviço solicitado:</strong> ' + _esc(ag.descricaoCliente) + '</p>';
                if (subcats.length > 0)
                    linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-list-check me-1" style="color:#6c757d;"></i><strong>Serviços selecionados:</strong> ' +
                        subcats.map(function (sc) {
                            return '<span style="display:inline-block;background:#FFC300;color:#000;font-size:.78rem;font-weight:700;padding:1px 8px;border-radius:12px;margin:1px 2px;">' + _esc(sc) + '</span>';
                        }).join('') + '</p>';
                linhas += '<div style="display:flex;gap:8px;margin-top:10px;">' +
                    '<button type="button" class="btn btn-danger btn-sm btn-sprint1-recusar" data-ag-id="' + _esc(ag.id) + '" data-prest-email="' + _esc(ag.emailPrestador) + '" data-servico="' + _esc(ag.servico) + '">' +
                    '<i class="bi bi-x-circle me-1"></i>Recusar Orçamento</button>' +
                    '<button type="button" class="btn btn-success btn-sm btn-sprint1-confirmar" data-ag-id="' + _esc(ag.id) + '" data-prest-email="' + _esc(ag.emailPrestador) + '" data-servico="' + _esc(ag.servico) + '" data-prest-nome="' + _esc(ag.nomePrestador) + '">' +
                    '<i class="bi bi-calendar-check me-1"></i>Aceitar e Agendar</button>' +
                    '</div>';
                if (ts) linhas += '<p style="margin:6px 0 0;font-size:.76rem;color:#adb5bd;"><i class="bi bi-clock me-1"></i>' + ts + '</p>';

                return '<div class="sprint1-sol-card" data-status="orcamento_enviado" style="margin-bottom:14px;transition:opacity .3s;">' +
                    '<div class="notif-item-cli" style="border-left:4px solid #146ADB;padding:10px 14px;background:#f8f9fa;border-radius:0 8px 8px 0;">' +
                    '<div style="font-weight:700;font-size:.92rem;margin-bottom:6px;"><i class="bi bi-file-earmark-text me-2" style="color:#146ADB;font-size:1rem;"></i>Orçamento Recebido do Prestador</div>' +
                    linhas + '</div></div>';
            }

            // ── orcamento_pendente ──
            if (ag.status === 'orcamento_pendente') {
                return '<div class="sprint1-sol-card" data-status="orcamento_pendente" ' +
                    'style="border-left:4px solid #146ADB;padding:14px 16px;background:#fafbff;border-radius:0 10px 10px 0;margin-bottom:14px;transition:opacity .3s;">' +
                    '<div style="font-weight:700;font-size:.9rem;color:#146ADB;margin-bottom:8px;">' +
                    '<i class="bi bi-hourglass-split me-2"></i>Aguardando confirmação do prestador</div>' +
                    '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-person-fill me-1" style="color:#146ADB;"></i><strong>Prestador:</strong> ' + _esc(ag.nomePrestador) + '</p>' +
                    '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-tools me-1" style="color:#146ADB;"></i><strong>Serviço:</strong> ' + _esc(ag.servico) + (subcats.length > 0 ? ' &mdash; ' + subcats.map(_esc).join(', ') : '') + '</p>' +
                    (dataFmt ? '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-calendar3 me-1" style="color:#146ADB;"></i><strong>Data/Hora:</strong> ' + _esc(dataFmt) + (horario ? ' às ' + _esc(horario) : '') + '</p>' : '') +
                    '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-credit-card me-1" style="color:#146ADB;"></i><strong>Pagamento preferido:</strong> ' + _esc(ag.formaPagamentoPreferida || '—') + '</p>' +
                    '</div>';
            }

            // ── cancelado ──
            var motivoCan = agP.motivoCancelamento || ag.motivoCancelamento || '';
            return '<div class="sprint1-sol-card" data-status="cancelado" ' +
                'style="border-left:4px solid #dc3545;padding:14px 16px;background:#fafbff;border-radius:0 10px 10px 0;margin-bottom:14px;transition:opacity .3s;">' +
                '<div style="font-weight:700;font-size:.9rem;color:#dc3545;margin-bottom:8px;">' +
                '<i class="bi bi-x-circle-fill me-2"></i>Solicitação cancelada</div>' +
                '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-person-fill me-1" style="color:#dc3545;"></i><strong>Prestador:</strong> ' + _esc(ag.nomePrestador) + '</p>' +
                '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-tools me-1" style="color:#dc3545;"></i><strong>Serviço:</strong> ' + _esc(ag.servico) + '</p>' +
                '<div style="margin-top:8px;">' +
                '<a href="#" class="btn-sprint1-ver-motivo" data-ag-id="' + _esc(ag.id) + '" data-motivo="' + _esc(motivoCan) + '" style="color:#dc3545;font-size:.85rem;text-decoration:underline;">' +
                '<i class="bi bi-info-circle me-1"></i>Ver motivo do cancelamento</a>' +
                '</div></div>';
        }).join('');

        // Delegação de clique — Confirmar
        lista.querySelectorAll('.btn-sprint1-confirmar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var agId = btn.dataset.agId, prestEmail = btn.dataset.prestEmail;
                var prestNome = btn.dataset.prestNome, servico = btn.dataset.servico;
                var agsPr = obterAgendamentosPrestador(prestEmail);
                var idxPr = agsPr.findIndex(function (a) { return a.id === agId; });
                if (idxPr >= 0) { agsPr[idxPr].status = 'confirmado'; salvarAgendamentosPrestador(prestEmail, agsPr); }
                _atualizarStatusClienteAgendamento(agId, usu.email, 'confirmado');
                sgCriarNotificacao(prestEmail, 'confirmacao', { agendamentoId: agId, servico: servico, clienteNome: usu.nome });
                var notifsC = sgObterNotificacoes(usu.email);
                var nOrc = notifsC.find(function (n) { return n.tipo === 'orcamento_enviado' && (n.dados || {}).agendamentoId === agId; });
                if (nOrc) sgMarcarNotifLidaPorId(usu.email, nOrc.id);
                if (typeof exibirToast === 'function') exibirToast('Agendamento confirmado! Serviço com ' + prestNome + ' está agendado.');
                _renderizarSolicitacoesPendentes();
                _atualizarLinkAguardandoStatCard(usu.email);
            });
        });

        // Delegação de clique — Recusar
        lista.querySelectorAll('.btn-sprint1-recusar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var agId = btn.dataset.agId, prestEmail = btn.dataset.prestEmail, servico = btn.dataset.servico;
                if (!confirm('Tem certeza que deseja recusar este orçamento?')) return;
                var agsPr = obterAgendamentosPrestador(prestEmail);
                var idxPr = agsPr.findIndex(function (a) { return a.id === agId; });
                if (idxPr >= 0) { agsPr[idxPr].status = 'orcamento_recusado'; salvarAgendamentosPrestador(prestEmail, agsPr); }
                _atualizarStatusClienteAgendamento(agId, usu.email, 'orcamento_recusado');
                sgCriarNotificacao(prestEmail, 'orcamento_recusado', { agendamentoId: agId, servico: servico });
                var notifsC = sgObterNotificacoes(usu.email);
                var nOrc = notifsC.find(function (n) { return n.tipo === 'orcamento_enviado' && (n.dados || {}).agendamentoId === agId; });
                if (nOrc) sgMarcarNotifLidaPorId(usu.email, nOrc.id);
                if (typeof exibirToast === 'function') exibirToast('Orçamento recusado. O prestador foi notificado.');
                _renderizarSolicitacoesPendentes();
                _atualizarLinkAguardandoStatCard(usu.email);
            });
        });

        // Delegação de clique — Ver motivo do cancelamento
        lista.querySelectorAll('.btn-sprint1-ver-motivo').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                var motivo = link.dataset.motivo || 'Motivo não informado pelo prestador.';
                _abrirModalSolicitacaoCancelada([{ motivoCancelamento: motivo }], function (idM, titulo, corT, body) {
                    var ex = document.getElementById(idM); if (ex) ex.remove();
                    var m = document.createElement('div');
                    m.className = 'modal fade'; m.id = idM; m.setAttribute('tabindex', '-1');
                    m.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header" style="background-color:' + corT + ';color:#fff;"><h5 class="modal-title">' + titulo + '</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body">' + body + '</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div></div></div>';
                    document.body.appendChild(m); return m;
                });
            });
        });
    }

    /* Abre modal mostrando solicitações com status orcamento_pendente */
    function _abrirModalSolicitacoesAndamento(criarModal) {
        var usu = obterUsuarioLogado();
        if (!usu) return;
        var agsAll = DB.get('clienteAgendamentos_' + usu.email) || [];
        var pendentes = agsAll.filter(function (a) { return a.status === 'orcamento_pendente'; });
        function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        var html = pendentes.length === 0
            ? '<p class="text-muted text-center py-4"><i class="bi bi-check-all me-2" style="color:#198754;font-size:1.2rem;"></i>Nenhuma solicitação pendente.</p>'
            : pendentes.map(function (ag) {
                var dataFmt = (ag.data || '').split('-').reverse().join('/');
                var horario = ag.horario ? ag.horario.split(' - ')[0] : '';
                var subcats = (ag.subcategoriasCliente || []);
                return '<div style="border-left:4px solid #146ADB;padding:12px 16px;background:#f0f4ff;border-radius:0 10px 10px 0;margin-bottom:14px;">' +
                    '<div style="font-weight:700;font-size:.92rem;color:#0d3d78;margin-bottom:6px;"><i class="bi bi-hourglass-split me-2" style="color:#146ADB;"></i>Aguardando confirmação do prestador</div>' +
                    '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-person-fill me-1" style="color:#146ADB;"></i><strong>Prestador:</strong> ' + _esc(ag.nomePrestador) + '</p>' +
                    '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-tools me-1" style="color:#146ADB;"></i><strong>Serviço:</strong> ' + _esc(ag.servico) + (subcats.length > 0 ? ' &mdash; ' + subcats.map(_esc).join(', ') : '') + '</p>' +
                    (dataFmt ? '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-calendar3 me-1" style="color:#146ADB;"></i><strong>Data/Hora:</strong> ' + _esc(dataFmt) + (horario ? ' às ' + _esc(horario) : '') + '</p>' : '') +
                    '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-credit-card me-1" style="color:#146ADB;"></i><strong>Pagamento preferido:</strong> ' + _esc(ag.formaPagamentoPreferida || '—') + '</p>' +
                    '</div>';
            }).join('');
        var modal = criarModal('modalSolAndamento', '<i class="bi bi-hourglass-split me-2"></i>Pedidos Aguardando Confirmação', '#146ADB', html);
        new bootstrap.Modal(modal).show();
    }

    /* Abre modal mostrando motivo do cancelamento pelo prestador */
    function _abrirModalSolicitacaoCancelada(cancelados, criarModal) {
        function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
        var html = cancelados.map(function (ag) {
            var motivo = ag.motivoCancelamento || 'Motivo não informado pelo prestador.';
            return '<div style="border-left:4px solid #dc3545;padding:14px 16px;background:#fff5f5;border-radius:0 10px 10px 0;margin-bottom:12px;">' +
                '<div style="font-weight:700;font-size:.92rem;color:#dc3545;margin-bottom:8px;"><i class="bi bi-x-circle-fill me-2"></i>Solicitação Cancelada pelo Prestador</div>' +
                (ag.nomePrestador ? '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-person-fill me-1" style="color:#dc3545;"></i><strong>Prestador:</strong> ' + _esc(ag.nomePrestador) + '</p>' : '') +
                (ag.servico ? '<p style="margin:3px 0;font-size:.87rem;"><i class="bi bi-tools me-1" style="color:#dc3545;"></i><strong>Serviço:</strong> ' + _esc(ag.servico) + '</p>' : '') +
                '<div style="margin-top:10px;padding:10px 14px;background:#fff;border:1px solid #f5c6cb;border-radius:6px;">' +
                '<strong style="font-size:.88rem;color:#dc3545;"><i class="bi bi-chat-left-text me-1"></i>Motivo informado pelo prestador:</strong>' +
                '<p style="margin:6px 0 0;font-size:.88rem;color:#5a0000;">' + _esc(motivo) + '</p>' +
                '</div></div>';
        }).join('');
        var modal = criarModal('modalSolCancelada', '<i class="bi bi-x-zcircle me-2"></i>Solicitação Cancelada', '#dc3545', html);
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
                card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0">Prestador: ' + _escaparHtml(av.profissional || av.profissional || '—') + ' (' + _escaparHtml(av.servico || '') + ')</h5><span class="text-muted"><small>' + av.data + '</small></span></div><div class="rating">' + stars + '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6></div><p class="review-text">"' + _escaparHtml(av.comentario) + '"</p>';
                container.insertBefore(card, botao || null);
            });
        }

        container.addEventListener('click', function (e) {
            var btnEd = e.target.closest('.btn-editar-feita');
            if (btnEd) {
                var pid = btnEd.dataset.pedidoId; var av = obterAvs().find(function (a) { return a.pedidoId === pid; }); if (!av) return;
                pedidoAtual = pid; if (infoEl) infoEl.innerHTML = '<strong>Serviço:</strong> ' + _escaparHtml(av.servico) + ' | <strong>Prestador:</strong> ' + _escaparHtml(av.profissional);
                renderE(starsEl, notaEl, av.nota); if (comentEl) comentEl.value = av.comentario;
                if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
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
                card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="mb-0">Prestador: ' + _escaparHtml(av.prestador) + ' (' + _escaparHtml(av.servico) + ')</h5><span class="text-muted"><small>' + av.data + '</small></span></div><div class="rating">' + stars + '<h6 class="text-muted ms-2">Avaliação: ' + av.nota + '.0</h6></div><p class="review-text">"' + _escaparHtml(av.comentario) + '"</p>';
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

        // Sprint 2 — exibe o nome do cliente logado no título da página
        var tituloNome = document.getElementById('titulo-nome-cliente');
        if (tituloNome) tituloNome.textContent = (dadosUsu.nome || (usu ? usu.nome : '') || 'Cliente');

        if (dadosUsu.perfil) {
            if (inputCpf) inputCpf.value = dadosUsu.perfil.cpf || '';
            if (inputCidade) inputCidade.value = dadosUsu.perfil.cidade || '';
            if (inputEndereco) inputEndereco.value = dadosUsu.perfil.endereco || '';
            if (inputTel) inputTel.value = dadosUsu.perfil.tel || '';
            if (dadosUsu.perfil.foto && avatarDiv) { avatarDiv.style.backgroundImage = 'url(' + dadosUsu.perfil.foto + ')'; avatarDiv.style.backgroundSize = 'cover'; avatarDiv.textContent = ''; avatarDiv.dataset.base64 = dadosUsu.perfil.foto; }
            else if (avatarDiv) avatarDiv.textContent = inputNome.value.substring(0, 2).toUpperCase();
        } else { if (avatarDiv) avatarDiv.textContent = inputNome.value.substring(0, 2).toUpperCase(); }

        // Sprint 3 — popula elementos do preview lateral

        // Tempo de membro
        var elMembroDesde = document.getElementById('preview-membro-desde');
        if (elMembroDesde) {
            if (dadosUsu.dataCadastro) {
                var dtCad = new Date(dadosUsu.dataCadastro);
                var agora = new Date();
                var diffMs = agora - dtCad;
                var diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                var textoTempo;
                if (diffDias < 1)       textoTempo = 'hoje';
                else if (diffDias === 1) textoTempo = '1 dia';
                else if (diffDias < 30)  textoTempo = diffDias + ' dias';
                else if (diffDias < 60)  textoTempo = '1 mês';
                else if (diffDias < 365) textoTempo = Math.floor(diffDias / 30) + ' meses';
                else if (diffDias < 730) textoTempo = '1 ano';
                else                     textoTempo = Math.floor(diffDias / 365) + ' anos';
                elMembroDesde.textContent = textoTempo;
            } else {
                elMembroDesde.textContent = 'data não registrada';
            }
        }

        // Média de avaliações recebidas pelos prestadores
        var elMediaAv = document.getElementById('preview-media-avaliacao');
        if (elMediaAv) {
            var avsRec = DB.get('avaliacoesRecebidasDoCliente') || [];
            if (avsRec.length > 0) {
                var soma = avsRec.reduce(function (acc, a) { return acc + (Number(a.nota) || 0); }, 0);
                var media = soma / avsRec.length;
                var estrelas = '';
                for (var i = 1; i <= 5; i++) {
                    if (i <= Math.floor(media))      estrelas += '<i class="bi bi-star-fill" style="color:#ffc107;"></i>';
                    else if (i - media < 1)          estrelas += '<i class="bi bi-star-half" style="color:#ffc107;"></i>';
                    else                             estrelas += '<i class="bi bi-star" style="color:#ccc;"></i>';
                }
                elMediaAv.innerHTML = estrelas + ' <span style="font-weight:600; color:#444;">' + media.toFixed(1) + '</span> <span style="color:#888;">(' + avsRec.length + ' aval.)</span>';
            } else {
                elMediaAv.innerHTML = '<span style="color:#aaa; font-size:0.8rem;">Sem avaliações recebidas</span>';
            }
        }

        // Cidade
        var elCidade = document.getElementById('preview-cidade');
        if (elCidade) elCidade.textContent = (dadosUsu.perfil && dadosUsu.perfil.cidade) ? dadosUsu.perfil.cidade : '—';

        // Dados pessoais
        var elEmail    = document.getElementById('preview-email');
        var elTel      = document.getElementById('preview-tel');
        var elEndereco = document.getElementById('preview-endereco');
        if (elEmail)    elEmail.textContent    = emailLogado || '—';
        if (elTel)      elTel.textContent      = (dadosUsu.perfil && dadosUsu.perfil.tel)      ? dadosUsu.perfil.tel      : '—';
        if (elEndereco) elEndereco.textContent = (dadosUsu.perfil && dadosUsu.perfil.endereco) ? dadosUsu.perfil.endereco : '—';

        if (inputFoto) { inputFoto.addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function (ev) { if (avatarDiv) { avatarDiv.style.backgroundImage = 'url(' + ev.target.result + ')'; avatarDiv.style.backgroundSize = 'cover'; avatarDiv.textContent = ''; avatarDiv.dataset.base64 = ev.target.result; } }; r.readAsDataURL(f); }); }

        if (btnSalvar) {
            btnSalvar.addEventListener('click', function () {
                // Sprint 2 — validação de campos obrigatórios
                var camposObrigatorios = [
                    { el: inputCpf,      nome: 'CPF' },
                    { el: inputCidade,   nome: 'Cidade' },
                    { el: inputEndereco, nome: 'Endereço' },
                    { el: inputTel,      nome: 'Telefone' }
                ];
                var faltando = camposObrigatorios.filter(function (c) { return !c.el || !c.el.value.trim(); }).map(function (c) { return c.nome; });
                if (faltando.length > 0) {
                    alert('Os seguintes campos são obrigatórios e precisam ser preenchidos:\n• ' + faltando.join('\n• '));
                    if (faltando.length > 0 && inputCpf && !inputCpf.value.trim()) inputCpf.focus();
                    else if (faltando.indexOf('Cidade') >= 0 && inputCidade) inputCidade.focus();
                    else if (faltando.indexOf('Endereço') >= 0 && inputEndereco) inputEndereco.focus();
                    else if (faltando.indexOf('Telefone') >= 0 && inputTel) inputTel.focus();
                    return;
                }
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

        // Sprint 3 — Banner de somente-visualização para convidados (não logados)
        if (!estaLogado) {
            var bannerConvidado = document.createElement('div');
            bannerConvidado.id = 'sg-banner-convidado';
            bannerConvidado.style.cssText =
                'display:flex;flex-wrap:wrap;gap:12px;align-items:center;' +
                'padding:12px 16px;margin-bottom:18px;' +
                'background:#fff8e1;border:1.5px solid #FFC300;border-radius:10px;';
            bannerConvidado.innerHTML =
                '<i class="bi bi-eye" style="color:#e6a800;font-size:1.2rem;flex-shrink:0;"></i>' +
                '<span style="flex:1;font-size:.9rem;color:#7a5700;">' +
                '<strong>Modo Visualização.</strong> Você está navegando como convidado. ' +
                'Para solicitar orçamentos ou agendar serviços, faça login ou crie sua conta.' +
                '</span>' +
                '<a href="/paginasSite/login.html" class="btn btn-warning btn-sm" style="white-space:nowrap;">' +
                '<i class="bi bi-box-arrow-in-right me-1"></i>Fazer Login</a>';
            mainAgendar.insertBefore(bannerConvidado, mainAgendar.firstChild);
        }

        // (sem semeio de dados demo — storage começa limpo)

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
            var slots = _calcularSlotsDisponiveis(emailPrest, 30);
            if (slots.length === 0) return null;
            var primeiro = slots[0];
            return { data: primeiro.data, horario: primeiro.slots[0], label: primeiro.label + ' às ' + primeiro.slots[0] };
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
            var descBloco   = document.getElementById('prest-descricao-bloco');
            var descTexto   = document.getElementById('prest-descricao-texto');
            var cliServBloco = document.getElementById('cli-servico-desejado-bloco');
            var cliServInput = document.getElementById('cli-servico-desejado');
            var cliServCont  = document.getElementById('cli-servico-contador');

            if (!email) {
                if (blocoHorario) blocoHorario.innerHTML = '';
                if (blocoContato) blocoContato.innerHTML = '';
                if (descBloco) descBloco.style.display = 'none';
                var subcatBlocoEl = document.getElementById('prest-subcategorias-bloco');
                if (subcatBlocoEl) subcatBlocoEl.style.display = 'none';
                if (cliServBloco) cliServBloco.style.display = 'none';
                var bpCli = document.getElementById('bloco-pagamento-cli');
                if (bpCli) bpCli.style.display = 'none';
                var btnVD0 = document.getElementById('btn-ver-disponibilidade');
                if (btnVD0) btnVD0.style.display = 'none';
                return;
            }
            var dados = obterStorePrestadores()[email] || {};
            slotAtual = proximoHorario(email);
            if (blocoHorario) blocoHorario.innerHTML = slotAtual ? '<strong>' + slotAtual.label + '</strong>' : '<em>Sem disponibilidade.</em>';
            if (blocoContato) blocoContato.innerHTML = '<i class="bi bi-telephone me-1"></i>' + (dados.tel || '—') + '<br><i class="bi bi-envelope me-1"></i>' + (dados.email || email);

            // Sprint 4 — exibe e conecta o botão de calendário
            var btnVerDisp = document.getElementById('btn-ver-disponibilidade');
            if (btnVerDisp) {
                btnVerDisp.style.display = '';
                // Reatribui onclick a cada troca de prestador (evita capturar email antigo)
                btnVerDisp.onclick = function () {
                    var slotAnterior = slotAtual; // preserva para restaurar em caso de Cancel
                    _abrirModalAgenda(email, function (slot) {
                        // Persiste a escolha do cliente e atualiza o display
                        slotAtual = { data: slot.data, horario: slot.horario, label: slot.label };
                        if (blocoHorario) blocoHorario.innerHTML =
                            '<strong><i class="bi bi-check-circle-fill text-success me-1"></i>' +
                            slotAtual.label + '</strong>';
                    }, function () {
                        // Sprint 1 — Cancel: restaura o horário que estava antes de abrir o modal
                        slotAtual = slotAnterior;
                        if (blocoHorario) {
                            blocoHorario.innerHTML = slotAtual
                                ? '<strong><i class="bi bi-check-circle-fill text-success me-1"></i>' + slotAtual.label + '</strong>'
                                : (proximoHorario(email) ? '<strong>' + proximoHorario(email).label + '</strong>' : '<em>Sem disponibilidade.</em>');
                        }
                    });
                };
            }

            // Subcategorias como checkboxes (prioridade) ou descrição como fallback
            var subcatBloco = document.getElementById('prest-subcategorias-bloco');
            var subcatLista = document.getElementById('prest-subcategorias-lista');
            var subcats = (dados.subcategorias && dados.subcategorias.length > 0) ? dados.subcategorias : [];
            if (subcats.length > 0 && subcatBloco && subcatLista) {
                subcatLista.innerHTML = '';
                subcats.forEach(function (sc, idx) {
                    var cbId = 'subcat-cb-' + idx;
                    var lbl = document.createElement('label');
                    lbl.htmlFor = cbId;
                    lbl.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;' +
                        'background:#fff;border:1.5px solid #FFC300;border-radius:20px;padding:4px 14px;' +
                        'font-size:.87rem;font-weight:500;transition:background .15s,color .15s;user-select:none;';
                    var cb = document.createElement('input');
                    cb.type = 'checkbox'; cb.id = cbId; cb.value = sc;
                    cb.className = 'prest-subcat-cb'; cb.style.accentColor = '#FFC300';
                    cb.addEventListener('change', function () {
                        lbl.style.background = cb.checked ? '#FFC300' : '#fff';
                        lbl.style.color = cb.checked ? '#000' : '';
                        lbl.style.fontWeight = cb.checked ? '700' : '500';
                    });
                    lbl.appendChild(cb);
                    lbl.appendChild(document.createTextNode(sc));
                    subcatLista.appendChild(lbl);
                });
                subcatBloco.style.display = '';
                if (descBloco) descBloco.style.display = 'none';
            } else {
                if (subcatBloco) subcatBloco.style.display = 'none';
                // Exibe a descrição de serviços do prestador (fallback)
                if (descBloco && descTexto) {
                    var desc = (dados.descricao || '').trim();
                    if (desc) { descTexto.textContent = desc; descBloco.style.display = ''; }
                    else descBloco.style.display = 'none';
                }
            }

            // Exibe a caixa para o cliente descrever o serviço desejado
            if (cliServBloco) {
                cliServBloco.style.display = '';
                if (cliServInput) cliServInput.value = '';
                if (cliServCont) cliServCont.textContent = '0';
            }
            // Contador de caracteres
            if (cliServInput && cliServCont) {
                cliServInput.oninput = function () {
                    cliServCont.textContent = cliServInput.value.length;
                };
            }

            // Exibe as opções de pagamento do prestador
            var blocoPagemento = document.getElementById('bloco-pagamento-cli');
            var selectPagemento = document.getElementById('cli-forma-pagamento');
            if (blocoPagemento && selectPagemento) {
                var pagOpcoes = (dados.formasPagamento && dados.formasPagamento.length > 0)
                    ? dados.formasPagamento
                    : ['PIX', 'Cartão', 'Dinheiro'];
                selectPagemento.innerHTML = '<option value="">-- Selecione --</option>';
                pagOpcoes.forEach(function (op) {
                    var opt = document.createElement('option');
                    opt.value = op; opt.textContent = op;
                    selectPagemento.appendChild(opt);
                });
                blocoPagemento.style.display = '';
                selectPagemento.onchange = function () {
                    var aviso = document.getElementById('aviso-boleto');
                    if (aviso) aviso.style.display = selectPagemento.value === 'Boleto' ? '' : 'none';
                };
            }
        }

        selectTipo.addEventListener('change', function () { preencherPrestadores(selectTipo.value); atualizarInfoPrestador(''); });
        selectPrestador.addEventListener('change', function () { atualizarInfoPrestador(selectPrestador.value); });

        // Pré-seleciona tipo e prestador vindos da URL (ex.: quando cliente vem do hotsite)
        var urlParamsAg = new URLSearchParams(window.location.search);
        var tipoUrl  = urlParamsAg.get('tipo')      || '';
        var prestUrl = urlParamsAg.get('prestador') || '';
        if (tipoUrl || prestUrl) {
            preencherTipos();
            if (tipoUrl) {
                selectTipo.value = tipoUrl;
                preencherPrestadores(tipoUrl);
                if (prestUrl) {
                    selectPrestador.value = prestUrl;
                    atualizarInfoPrestador(prestUrl);
                }
            }
        } else {
            preencherTipos();
        }

        // Sprint 1 — btnAgendar: se já há slot escolhido, confirma direto; caso contrário abre modal de agenda
        var btnAgendar = mainAgendar.querySelector('#btn-solicitar-orcamento, .cta-agendar, .cta');
        if (btnAgendar) {
            btnAgendar.addEventListener('click', function (e) {
                e.preventDefault();
                if (!estaLogado) { _modalLoginNecessario(); return; }
                if (!selectPrestador.value) { alert('Selecione um prestador antes de agendar.'); return; }

                var cliServInputV = document.getElementById('cli-servico-desejado');
                var descricaoCliente = cliServInputV ? (cliServInputV.value || '').trim() : '';
                if (!descricaoCliente) {
                    if (cliServInputV) { cliServInputV.classList.add('is-invalid'); cliServInputV.focus(); }
                    alert('Preencha o campo "Informações Adicionais" antes de agendar.');
                    return;
                }
                var pagamentoPref = (document.getElementById('cli-forma-pagamento') || {}).value || '';
                if (!pagamentoPref) { alert('Selecione a Forma de Pagamento antes de agendar.'); return; }

                var subcatsSelecionadas = Array.from(
                    mainAgendar.querySelectorAll('.prest-subcat-cb:checked')
                ).map(function (cb) { return cb.value; });

                function _criarAgendamento(slot) {
                    slotAtual = { data: slot.data, horario: slot.horario, label: slot.label };
                    var novoId = 'orc-cli-' + Date.now();
                    var dataSlot    = slot.data;
                    var fimH        = String(parseInt(slot.horario.split(':')[0]) + 1).padStart(2, '0') + ':00';
                    var horarioSlot = slot.horario + ' - ' + fimH;
                    var labelSlot   = slot.label + ' às ' + slot.horario;

                    var ags = obterAgendamentosPrestador(selectPrestador.value);
                    var usuData = obterUsuariosCadastrados()[usu.email] || {};
                    var perfil = usuData.perfil || {};
                    ags.push({
                        id: novoId, status: 'orcamento_pendente',
                        data: dataSlot, horario: horarioSlot,
                        cliente: usu.nome, clienteEmail: usu.email,
                        clienteTel: perfil.tel || '', clienteEndereco: perfil.endereco || '',
                        servico: selectTipo.value || 'Serviço',
                        descricaoCliente: descricaoCliente,
                        subcategoriasCliente: subcatsSelecionadas,
                        formaPagamentoPreferida: pagamentoPref,
                        observacoes: '', lembretes: [], valor: 0, formaPagamento: ''
                    });
                    salvarAgendamentosPrestador(selectPrestador.value, ags);

                    var cliAgs = DB.get('clienteAgendamentos_' + usu.email) || [];
                    var storeV = obterStorePrestadores();
                    var nomePrest = (storeV[selectPrestador.value] || {}).nome || selectPrestador.value;
                    cliAgs.push({
                        id: novoId, emailPrestador: selectPrestador.value, nomePrestador: nomePrest,
                        servico: selectTipo.value, descricaoCliente: descricaoCliente,
                        subcategoriasCliente: subcatsSelecionadas,
                        formaPagamentoPreferida: pagamentoPref, data: dataSlot, horario: horarioSlot,
                        status: 'orcamento_pendente', criadoEm: new Date().toISOString()
                    });
                    DB.set('clienteAgendamentos_' + usu.email, cliAgs);

                    sgCriarNotificacao(selectPrestador.value, 'orcamento_solicitado', {
                        agendamentoId: novoId, clienteNome: usu.nome, clienteEmail: usu.email,
                        servico: selectTipo.value, descricaoCliente: descricaoCliente,
                        subcategoriasCliente: subcatsSelecionadas, label: labelSlot
                    });

                    // Sprint 1 — redireciona para Área do Cliente para acompanhar o pedido
                    window.location.href = '/paginasCliente/clienteAreaExclusiva.html';
                }

                // Sprint 1 — se o cliente já escolheu um horário via modal, confirma diretamente
                if (slotAtual) {
                    _criarAgendamento(slotAtual);
                    return;
                }

                // Sem slot pré-escolhido — abre modal de agenda
                _abrirModalAgenda(selectPrestador.value, function (slot) {
                    _criarAgendamento(slot);
                }, function () {
                    // onCancelar — slot anterior (se havia) foi restaurado pelo handler de Cancel
                });
            });
        }

        if (linkHotsite) {
            linkHotsite.addEventListener('click', function (e) {
                e.preventDefault();
                // Sprint 3 — convidados podem visualizar o hotsite; apenas booking é bloqueado lá
                if (!selectPrestador.value) { alert('Selecione um prestador.'); return; }
                window.location.href = '/paginasPrestador/prestadorHotsite.html?prestador=' + encodeURIComponent(selectPrestador.value);
            });
        }

    }

    // =========================================================
    // HELPER — configuração de agenda do prestador
    // Retorna o config salvo ou defaults (seg–sex 08:00–18:00).
    // Usado em _abrirModalAgenda, proximoHorario e hotsite.
    // =========================================================
    function _obterConfigAgenda(emailPrest) {
        var CONF_KEY = 'agendaConfig_' + emailPrest;
        var conf = DB.get(CONF_KEY) || {};
        // Defaults para dias não configurados
        var diasMap = { 0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado' };
        var resultado = {};
        for (var dow = 0; dow <= 6; dow++) {
            var nome = diasMap[dow];
            var c = conf[nome];
            if (c) {
                resultado[dow] = { ativo: c.ativo === undefined ? true : !!c.ativo, inicio: c.inicio || '08:00', fim: c.fim || '18:00' };
            } else {
                // Default: seg–sex abertos, sab e dom fechados
                resultado[dow] = { ativo: dow >= 1 && dow <= 5, inicio: '08:00', fim: '18:00' };
            }
        }
        // ── Regras de agendamento (Sprint 2) ──────────────────────────────────
        // antecedencia: mínimo obrigatório de 12 horas
        var antSalva = parseInt(conf.antecedencia);
        resultado.antecedencia   = isNaN(antSalva) ? 24 : Math.max(12, antSalva);
        // duracaoServico: mínimo de 60 min (1 bloco = 1 h)
        var durSalva = parseInt(conf.duracaoServico);
        resultado.duracaoServico = isNaN(durSalva) ? 120 : Math.max(60, durSalva);
        // intervalo: mínimo de 60 min entre o fim de um serviço e o início do próximo
        var intSalvo = parseInt(conf.intervalo);
        resultado.intervalo      = isNaN(intSalvo) ? 60 : Math.max(60, intSalvo);
        return resultado;
    }

    // Gera lista de { data, label, slots[] } respeitando a config do prestador.
    // Sprint 2 — usa antecedencia, duracaoServico e intervalo salvos em agendaConfig.
    function _calcularSlotsDisponiveis(emailPrest, maxDias) {
        maxDias = maxDias || 30;
        var config   = _obterConfigAgenda(emailPrest);
        var ags      = obterAgendamentosPrestador(emailPrest);
        var ocupados = {};
        ags.forEach(function (a) {
            // Sprint 5 — Somente agendamentos efetivamente cancelados ou recusados pelo cliente
            // libertam o slot. TODOS os demais status — incluindo orcamento_pendente,
            // orcamento_enviado, orcamento_aceito e confirmado — mantêm o horário bloqueado,
            // garantindo que nenhum outro cliente (ou o mesmo) veja esse slot como disponível
            // enquanto a solicitação não for concluída ou descartada.
            if (a.status === 'cancelado' || a.status === 'orcamento_recusado') return;
            var ini = (a.horario || '').split(' - ')[0];
            if (ini && a.data) ocupados[a.data + ' ' + ini] = true;
        });

        var agora = new Date();

        // ── Regras configuradas pelo prestador ────────────────────────────────────────
        // antecedencia: mínimo de horas de aviso prévio (mínimo obrigatório = 12 h)
        var antecedenciaHoras = config.antecedencia; // já normalizado em _obterConfigAgenda
        var minima = new Date(agora.getTime() + antecedenciaHoras * 60 * 60 * 1000);

        // Passo entre slots em minutos = duração + intervalo (mín 60 min cada)
        var duracaoMin   = config.duracaoServico; // min 60
        var intervaloMin = config.intervalo;      // min 60
        var passoMin     = duracaoMin + intervaloMin; // passo total mínimo = 120 min

        var diasDisponiveis = [];

        for (var d = 0; d < maxDias; d++) {
            var dia = new Date(agora);
            dia.setDate(agora.getDate() + d);
            var dow     = dia.getDay();
            var confDia = config[dow];
            if (!confDia || !confDia.ativo) continue;

            // Converte horários de início/fim do dia para minutos desde meia-noite
            var partsIni  = (confDia.inicio || '08:00').split(':');
            var partsFim  = (confDia.fim    || '18:00').split(':');
            var inicioMin = parseInt(partsIni[0]) * 60 + (parseInt(partsIni[1]) || 0);
            var fimMin    = parseInt(partsFim[0]) * 60 + (parseInt(partsFim[1]) || 0);

            var dataStr = dia.toISOString().substring(0, 10);
            var slots   = [];

            var curMin = inicioMin;
            while (curMin + duracaoMin <= fimMin) {
                var hS   = Math.floor(curMin / 60);
                var mS   = curMin % 60;
                var horS = String(hS).padStart(2, '0') + ':' + String(mS).padStart(2, '0');

                // Bloqueia slots dentro da janela de antecedência mínima
                var slotDt = new Date(dataStr + 'T' + horS + ':00');
                if (slotDt.getTime() >= minima.getTime()) {
                    if (!ocupados[dataStr + ' ' + horS]) slots.push(horS);
                }

                curMin += passoMin;
            }

            if (slots.length > 0) {
                diasDisponiveis.push({ data: dataStr, label: _formatarDiaLabel(dataStr), slots: slots });
            }
        }
        return diasDisponiveis;
    }

    // =========================================================
    // MODAL AGENDA — exibe slots disponíveis e confirma booking
    // Reutilizado em clienteAgendarServicos e prestadorHotsite
    // =========================================================
    function _abrirModalAgenda(emailPrest, onConfirmar, onCancelar) {
        var modal = document.getElementById('modalAgendaPrestador');
        if (!modal) return;

        var nomeEl        = document.getElementById('agenda-modal-nome-prestador');
        var slotsEl       = document.getElementById('agenda-modal-slots');
        var selecionadoEl = document.getElementById('agenda-modal-selecionado');
        var labelEl       = document.getElementById('agenda-modal-slot-label');
        var btnConfirmar  = document.getElementById('btn-confirmar-agendamento');

        // Preenche nome do prestador
        var dados = obterStorePrestadores()[emailPrest] || {};
        if (nomeEl) nomeEl.textContent = dados.nome || emailPrest;

        // Calcula slots disponíveis respeitando config de agenda do prestador (7 dias à frente)
        var diasDisponiveis = _calcularSlotsDisponiveis(emailPrest, 7);

        // Renderiza grid de slots
        if (slotsEl) {
            if (diasDisponiveis.length === 0) {
                slotsEl.innerHTML = '<p class="text-center text-muted py-4"><i class="bi bi-calendar-x me-2"></i>Sem disponibilidade nos próximos 30 dias.</p>';
            } else {
                slotsEl.innerHTML = diasDisponiveis.map(function (item) {
                    var btns = item.slots.map(function (s) {
                        return '<button type="button" class="btn btn-outline-secondary btn-sm agenda-slot-btn me-1 mb-1" ' +
                            'data-data="' + item.data + '" ' +
                            'data-horario="' + s + '" ' +
                            'data-label="' + item.label + ' às ' + s + '">' + s + '</button>';
                    }).join('');
                    return '<div style="margin-bottom:14px;">' +
                        '<div style="font-weight:700;font-size:.88rem;color:#333;margin-bottom:6px;border-bottom:1px solid #dee2e6;padding-bottom:4px;">' +
                        '<i class="bi bi-calendar2-check me-1" style="color:#FFC300;"></i>' + item.label + '</div>' +
                        '<div>' + btns + '</div></div>';
                }).join('');
            }
        }

        // Reset estado de seleção
        var slotSelecionado = null;
        if (selecionadoEl) selecionadoEl.style.display = 'none';

        // Substitui btnConfirmar para evitar listeners duplicados ao reabrir o modal
        if (btnConfirmar) {
            var btnNovo = btnConfirmar.cloneNode(true);
            btnConfirmar.parentNode.replaceChild(btnNovo, btnConfirmar);
            btnConfirmar = btnNovo;
            btnConfirmar.disabled = true;
        }

        // Delegação de clique nos slots
        if (slotsEl) {
            var _onSlotClick = function (e) {
                var btn = e.target.closest('.agenda-slot-btn');
                if (!btn) return;
                slotsEl.querySelectorAll('.agenda-slot-btn').forEach(function (b) {
                    b.classList.remove('btn-warning', 'fw-bold');
                    b.classList.add('btn-outline-secondary');
                });
                btn.classList.remove('btn-outline-secondary');
                btn.classList.add('btn-warning', 'fw-bold');
                slotSelecionado = { data: btn.dataset.data, horario: btn.dataset.horario, label: btn.dataset.label };
                if (labelEl) labelEl.textContent = slotSelecionado.label;
                if (selecionadoEl) selecionadoEl.style.display = '';
                if (btnConfirmar) btnConfirmar.disabled = false;
            };
            // Remove listener anterior (cloneNode já cuidou do btnConfirmar; para slotsEl, reassignamos innerHTML sempre)
            slotsEl.onclick = _onSlotClick;
        }

        // Confirmar agendamento — valida campos obrigatórios do painel antes de prosseguir
        if (btnConfirmar) {
            btnConfirmar.addEventListener('click', function () {
                if (!slotSelecionado) return;

                // ── Coleta e valida campos obrigatórios fora do modal ────────────────
                var erros = [];

                var elDesc = document.getElementById('cli-servico-desejado');
                var elPag  = document.getElementById('cli-forma-pagamento');

                var descricao = elDesc ? (elDesc.value || '').trim() : '';
                var pagamento = elPag  ? (elPag.value  || '').trim() : '';

                if (!descricao) erros.push({ el: elDesc, rotulo: 'Informações Adicionais' });
                if (!pagamento) erros.push({ el: elPag,  rotulo: 'Forma de Pagamento'      });

                if (erros.length > 0) {
                    // Fecha o modal e devolve o foco para o formulário
                    var bsModalVal = bootstrap.Modal.getInstance(modal);
                    if (bsModalVal) bsModalVal.hide();

                    // Aplica destaque de erro e remove ao corrigir
                    erros.forEach(function (err) {
                        if (!err.el) return;
                        err.el.classList.add('is-invalid');
                        // Adiciona feedback visual abaixo do campo (evita duplicação)
                        var feedbackId = err.el.id + '-feedback-sprint4';
                        var feedbackEx = document.getElementById(feedbackId);
                        if (!feedbackEx) {
                            var fb = document.createElement('div');
                            fb.id = feedbackId;
                            fb.className = 'invalid-feedback';
                            fb.style.display = 'block';
                            fb.textContent = 'Campo obrigatório: preencha "' + err.rotulo + '" para confirmar o agendamento.';
                            err.el.parentNode.insertBefore(fb, err.el.nextSibling);
                        }
                        // Remove destaque ao corrigir (input ou change)
                        ['input', 'change'].forEach(function (ev) {
                            err.el.addEventListener(ev, function _rm() {
                                err.el.classList.remove('is-invalid');
                                var fb2 = document.getElementById(feedbackId);
                                if (fb2) fb2.remove();
                                err.el.removeEventListener(ev, _rm);
                            });
                        });
                    });

                    // Rola suavemente até o primeiro campo com erro e foca nele
                    modal.addEventListener('hidden.bs.modal', function _scroll() {
                        modal.removeEventListener('hidden.bs.modal', _scroll);
                        var primeiro = erros[0].el;
                        if (!primeiro) return;
                        primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(function () { primeiro.focus(); }, 350);
                    });

                    // Toast de aviso com cor de erro
                    var toastEl = document.getElementById('toastNotificacao');
                    if (toastEl) {
                        var nomes = erros.map(function (e) { return '"' + e.rotulo + '"'; }).join(' e ');
                        var msgEl = document.getElementById('toast-mensagem');
                        if (msgEl) msgEl.textContent = 'Preencha ' + nomes + ' antes de confirmar o agendamento.';
                        // Temporariamente aplica cor de erro; restaura ao ocultar
                        toastEl.classList.remove('bg-dark', 'text-bg-success');
                        toastEl.classList.add('text-bg-danger');
                        toastEl.addEventListener('hidden.bs.toast', function _restore() {
                            toastEl.removeEventListener('hidden.bs.toast', _restore);
                            toastEl.classList.remove('text-bg-danger');
                            toastEl.classList.add('bg-dark');
                        });
                        bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 4000 }).show();
                    }
                    return; // bloqueia o prosseguimento
                }

                // ── Sprint 5: Re-valida disponibilidade do slot no momento do clique ──
                // Garante que, entre a abertura do modal e o clique em Confirmar,
                // nenhum outro cliente tenha reservado o mesmo horário.
                var slotsRelidos = _calcularSlotsDisponiveis(emailPrest, 14);
                var slotAindaLivre = slotsRelidos.some(function (d) {
                    return d.data === slotSelecionado.data &&
                           d.slots.indexOf(slotSelecionado.horario) >= 0;
                });

                if (!slotAindaLivre) {
                    // Atualiza a grade com os horários reais mais recentes
                    var novosSlots = _calcularSlotsDisponiveis(emailPrest, 7);
                    if (slotsEl) {
                        slotsEl.innerHTML = novosSlots.length === 0
                            ? '<p class="text-center text-muted py-4"><i class="bi bi-calendar-x me-2"></i>' +
                              'Sem disponibilidade nos próximos 30 dias.</p>'
                            : novosSlots.map(function (item) {
                                return '<div style="margin-bottom:14px;">' +
                                    '<div style="font-weight:700;font-size:.88rem;color:#333;margin-bottom:6px;' +
                                    'border-bottom:1px solid #dee2e6;padding-bottom:4px;">' +
                                    '<i class="bi bi-calendar2-check me-1" style="color:#FFC300;"></i>' +
                                    item.label + '</div><div>' +
                                    item.slots.map(function (s) {
                                        return '<button type="button" class="btn btn-outline-secondary btn-sm' +
                                            ' agenda-slot-btn me-1 mb-1"' +
                                            ' data-data="'    + item.data  + '"' +
                                            ' data-horario="' + s          + '"' +
                                            ' data-label="'  + item.label + ' às ' + s + '">' +
                                            s + '</button>';
                                    }).join('') + '</div></div>';
                              }).join('');
                        slotsEl.scrollTop = 0;
                    }
                    // Limpa a seleção e desabilita o botão até nova escolha
                    slotSelecionado = null;
                    if (selecionadoEl) selecionadoEl.style.display = 'none';
                    if (btnConfirmar) btnConfirmar.disabled = true;
                    // Toast de conflito
                    var toastConfl = document.getElementById('toastNotificacao');
                    if (toastConfl) {
                        var msgConfl = document.getElementById('toast-mensagem');
                        if (msgConfl) msgConfl.textContent =
                            'O horário selecionado não está mais disponível. Escolha outro horário.';
                        toastConfl.classList.remove('bg-dark', 'text-bg-success');
                        toastConfl.classList.add('text-bg-danger');
                        toastConfl.addEventListener('hidden.bs.toast', function _restConfl() {
                            toastConfl.removeEventListener('hidden.bs.toast', _restConfl);
                            toastConfl.classList.remove('text-bg-danger');
                            toastConfl.classList.add('bg-dark');
                        });
                        bootstrap.Toast.getOrCreateInstance(toastConfl, { delay: 4000 }).show();
                    }
                    return; // bloqueia — slot já foi tomado
                }

                // ── Tudo preenchido — confirma normalmente ───────────────────────────
                var bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) bsModal.hide();
                onConfirmar(slotSelecionado);
            });
        }

        var bsModal = bootstrap.Modal.getOrCreateInstance(modal);

        // Sprint 1 — ao fechar o modal sem confirmar (Cancel / X), restaura o slot anterior
        function _onModalHidden() {
            modal.removeEventListener('hidden.bs.modal', _onModalHidden);
            // slotSelecionado só fica preenchido se o utilizador confirmou (onConfirmar foi chamado);
            // se fechou sem confirmar, chama onCancelar para restaurar o estado anterior.
            if (!_modalConfirmado && typeof onCancelar === 'function') {
                onCancelar();
            }
            _modalConfirmado = false;
        }
        var _modalConfirmado = false;
        // Marca como confirmado antes de chamar hide dentro do handler de btnConfirmar
        var _origOnConfirmar = onConfirmar;
        onConfirmar = function (slot) {
            _modalConfirmado = true;
            _origOnConfirmar(slot);
        };
        modal.addEventListener('hidden.bs.modal', _onModalHidden);

        bsModal.show();
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
        // Sprint 1 — suporta ?email= (vindo do catálogo via "Saiba Mais") e ?prestador= (legado)
        var emailPrest = params.get('email') || params.get('prestador') || '';

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
                metaEl.innerHTML = _escaparHtml(dados.categoria || 'Atividade') + ' &nbsp;·&nbsp; <span style="color:#ffc107;">' + starsH + '</span> &nbsp;' + mediaAv.toFixed(1) + ' &nbsp;·&nbsp; ' + avsRec.length + ' avaliação(ões)';
            }

            // Atende em
            var atendeEl = document.getElementById('hs-atende');
            if (atendeEl) atendeEl.innerHTML = '<i class="bi bi-geo-alt-fill me-1"></i> Atende em: ' + _escaparHtml(dados.cidade || '—');

            // Descrição
            var descEl = document.getElementById('hs-desc');
            if (descEl) descEl.textContent = dados.descricao || '';

            // Contatos
            var emailEl = document.getElementById('hs-email');
            if (emailEl) emailEl.textContent = dados.email || emailPrest || '—';
            var telEl = document.getElementById('hs-tel');
            if (telEl) telEl.textContent = dados.tel || '—';

            // SPRINT 2/3/6 — Galeria: quantidade de slots (fotos + vídeos) e o
            // ponto em que os vídeos começam agora dependem do plano
            // efetivamente contratado pelo prestador (ver LIMITES_GALERIA_POR_PLANO),
            // em vez de assumir sempre o máximo de 20 (18 imagens + 2 vídeos).
            // Itens podem ser data URLs diretas (legado) ou referências
            // "idbmidia://<chave>" apontando para o IndexedDB (SG_MidiaDB).
            var _limiteGaleriaPublico = _obterLimiteGaleriaPorEmail(emailPrest);
            var galeriaEl = document.getElementById('hs-galeria');
            if (galeriaEl) {
                // Oculta quaisquer slots estáticos que ultrapassem o limite do
                // plano contratado, para não exibir molduras vazias de mídia
                // que o prestador não tem direito a preencher.
                galeriaEl.querySelectorAll('.hotsite-thumb').forEach(function (thumbPublico) {
                    var slotPublico = parseInt(thumbPublico.dataset.slot, 10);
                    if (!isNaN(slotPublico) && slotPublico >= _limiteGaleriaPublico.total) {
                        thumbPublico.style.display = 'none';
                    }
                });
            }
            if (galeriaEl && dados.galeria && dados.galeria.length > 0) {
                var thumbs = galeriaEl.querySelectorAll('.hotsite-thumb');
                dados.galeria.forEach(function (item, idx) {
                    if (!item || idx >= thumbs.length || idx >= _limiteGaleriaPublico.total) return;
                    var thumb = thumbs[idx];

                    function _renderMidia(valor) {
                        if (!valor) return;
                        var isVid = idx >= _limiteGaleriaPublico.fotos || valor.startsWith('data:video') || valor.includes('/video/');
                        thumb.innerHTML = '';
                        thumb.style.overflow = 'hidden';
                        var el = isVid ? document.createElement('video') : document.createElement('img');
                        el.src = valor;
                        el.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
                        if (isVid) { el.muted = true; el.setAttribute('playsinline', ''); el.controls = true; }
                        thumb.appendChild(el);
                    }

                    if (SG_MidiaDB.ehReferencia(item)) {
                        thumb.innerHTML = '<i class="bi bi-hourglass-split"></i>';
                        thumb.style.overflow = 'hidden';
                        SG_MidiaDB.obter(SG_MidiaDB.chaveDe(item)).then(function (dataUrl) {
                            _renderMidia(dataUrl);
                        }).catch(function () {});
                    } else {
                        _renderMidia(item);
                    }
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

            // Próximo horário disponível (respeita config de agenda)
            var slotEl = document.getElementById('hotsite-preview-proximo-slot');
            if (slotEl) {
                slotEl.style.cursor = 'default'; slotEl.style.pointerEvents = 'none';
                var slotsDisp = _calcularSlotsDisponiveis(emailPrest, 30);
                if (slotsDisp.length > 0) {
                    slotEl.textContent = slotsDisp[0].label + ' às ' + slotsDisp[0].slots[0];
                } else {
                    slotEl.textContent = 'Sem disponibilidade nos próximos 30 dias';
                }
            }
        }

        // Botão Agendar Serviço — redireciona para clienteAgendarServicos com dados pré-selecionados
        // Sprint 3 — para convidados: remove data-bs-toggle/target para evitar conflito de modais
        var btnAgendar = document.querySelector('.cta-agendar');
        if (btnAgendar) {
            if (!estaLogado) {
                // Remove os atributos Bootstrap que abririam o modal de agenda diretamente
                btnAgendar.removeAttribute('data-bs-toggle');
                btnAgendar.removeAttribute('data-bs-target');
            }
            btnAgendar.addEventListener('click', function (e) {
                e.preventDefault();
                if (!estaLogado) { _modalLoginHotsite(emailPrest); return; }
                // Monta URL com tipo e email do prestador (se disponíveis a partir dos params da página)
                var tipoParam  = dados ? (dados.categoria || '') : '';
                var prestParam = emailPrest || '';
                var baseUrl = '/paginasCliente/clienteAgendarServicos.html';
                var query   = [];
                if (tipoParam)  query.push('tipo='  + encodeURIComponent(tipoParam));
                if (prestParam) query.push('prestador=' + encodeURIComponent(prestParam));
                window.location.href = baseUrl + (query.length ? '?' + query.join('&') : '');
            });
        }
    }

    function _modalLoginHotsite(emailPrest) {
        // Sprint 2 — persiste o email do prestador para redirecionamento pós-login/cadastro
        if (emailPrest) sessionStorage.setItem('servgo_pending_prestador', emailPrest);

        var loginUrl = '/paginasSite/login.html?redirect=clienteAgendar';
        var id = 'modalLoginHotsite'; var ex = document.getElementById(id); if (ex) ex.remove();
        var modal = document.createElement('div'); modal.className = 'modal fade'; modal.id = id; modal.setAttribute('tabindex', '-1');
        modal.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
            '<div class="modal-header" style="background:#FFC300;color:#000;">' +
            '<h5 class="modal-title"><i class="bi bi-lock me-2"></i>Login Necessário</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
            '<div class="modal-body">' +
            '<p>Para agendar um serviço é necessário efetuar o <strong>login</strong> ou realizar o seu <strong>cadastro</strong>.</p>' +
            '<p class="text-muted" style="font-size:.85rem;"><i class="bi bi-info-circle me-1"></i>Após o login, você será redirecionado automaticamente para continuar o agendamento.</p>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>' +
            '<a href="' + loginUrl + '" class="btn btn-warning"><i class="bi bi-box-arrow-in-right me-1"></i>Fazer Login / Cadastro</a>' +
            '</div></div></div>';
        document.body.appendChild(modal); new bootstrap.Modal(modal).show();
    }

    // =========================================================
    // NOTIFICAÇÕES — área exclusiva do prestador
    // =========================================================
    function inicializarNotificacoesDashboardPrestador() {
        // Gerenciado em inicializarPrestadorAreaExclusiva
    }

    function inicializarNotificacoesDashboardCliente() {
        // Sprint 2 — banner de notificações removido; retornos do prestador
        // são exibidos diretamente na seção inline (#cli-solicitacoes-sprint1).
    }

    // =========================================================
    // MODAL NOTIFICAÇÕES CLIENTE — retornos dos prestadores
    // Exibe confirmações, cancelamentos e conclusões recebidas.
    // =========================================================
    function _abrirModalNotificacoesCliente(emailCli, notifs, onMarcarLidas) {
        var id = 'modalNotifRetornoPrestador';
        var ex = document.getElementById(id); if (ex) ex.remove();

        // Agendamentos do cliente para cruzar dados (data, horário, prestador)
        var cliAgs = DB.get('clienteAgendamentos_' + emailCli) || [];

        function _icone(tipo) {
            if (tipo === 'confirmacao')     return '<i class="bi bi-check-circle-fill me-2" style="color:#198754;font-size:1rem;"></i>';
            if (tipo === 'cancelamento')    return '<i class="bi bi-x-circle-fill me-2" style="color:#dc3545;font-size:1rem;"></i>';
            if (tipo === 'conclusao')       return '<i class="bi bi-star-fill me-2" style="color:#FFC300;font-size:1rem;"></i>';
            if (tipo === 'orcamento_enviado') return '<i class="bi bi-file-earmark-text me-2" style="color:#146ADB;font-size:1rem;"></i>';
            return '<i class="bi bi-bell-fill me-2" style="color:#146ADB;font-size:1rem;"></i>';
        }
        function _titulo(tipo) {
            if (tipo === 'confirmacao')     return 'Serviço Confirmado!';
            if (tipo === 'cancelamento')    return 'Serviço Cancelado';
            if (tipo === 'conclusao')       return 'Serviço Concluído';
            if (tipo === 'orcamento_enviado') return 'Orçamento Recebido do Prestador';
            return 'Notificação';
        }
        function _borda(tipo) {
            if (tipo === 'confirmacao')     return '#198754';
            if (tipo === 'cancelamento')    return '#dc3545';
            if (tipo === 'conclusao')       return '#FFC300';
            if (tipo === 'orcamento_enviado') return '#146ADB';
            return '#146ADB';
        }

        var itensHtml = notifs.map(function (n) {
            var d = n.dados || {};

            // Cruzar com o agendamento mais recente do mesmo serviço
            var ag = cliAgs.slice().reverse().find(function (a) {
                return a.id === d.agendamentoId || a.servico === d.servico;
            }) || {};

            var dataLabel = d.data ? d.data.split('-').reverse().join('/') : (ag.data ? ag.data.split('-').reverse().join('/') : '');
            var horario   = d.horario ? d.horario.split(' - ')[0] : (ag.horario ? ag.horario.split(' - ')[0] : '');
            var prestNome = d.prestadorNome || ag.nomePrestador || '';
            var ts = n.timestamp
                ? new Date(n.timestamp).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
                : '';

            var linhas = '';
            if (d.servico)   linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-tools me-1" style="color:#6c757d;"></i><strong>Serviço:</strong> ' + _escaparHtml(d.servico) + '</p>';
            if (prestNome)   linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-person-fill me-1" style="color:#6c757d;"></i><strong>Prestador:</strong> ' + _escaparHtml(prestNome) + '</p>';
            if (dataLabel)   linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-calendar3 me-1" style="color:#6c757d;"></i><strong>Data:</strong> ' + dataLabel + (horario ? ' às ' + horario : '') + '</p>';

            if (n.tipo === 'orcamento_enviado') {
                if (d.valor !== undefined && d.valor !== null)
                    linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-cash-coin me-1" style="color:#6c757d;"></i><strong>Valor à vista:</strong> R$ ' + parseFloat(d.valor || 0).toFixed(2).replace('.', ',') + '</p>';
                if (d.formaPagamento)
                    linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-credit-card me-1" style="color:#6c757d;"></i><strong>Pagamento:</strong> ' + _escaparHtml(d.formaPagamento) + '</p>';
                if (d.formaPagamento === 'Cartão' && d.parcelas)
                    linhas += '<p style="margin:3px 0;font-size:.85rem;padding:5px 10px;background:#fff8e1;border-left:3px solid #FFC300;border-radius:0 6px 6px 0;">' +
                        '<i class="bi bi-credit-card me-1" style="color:#e6a800;"></i>' +
                        '<strong>Parcelamento:</strong> até ' + _escaparHtml(String(d.parcelas)) + ' parcela(s)' +
                        (d.valorParcela ? ' de R$ ' + parseFloat(d.valorParcela).toFixed(2).replace('.', ',') : '') + '</p>';
                if (d.descricaoCliente)
                    linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-chat-quote me-1" style="color:#6c757d;"></i><strong>Serviço solicitado:</strong> ' + _escaparHtml(d.descricaoCliente) + '</p>';
                if (d.subcategoriasCliente && d.subcategoriasCliente.length > 0)
                    linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-list-check me-1" style="color:#6c757d;"></i><strong>Serviços selecionados:</strong> ' +
                        d.subcategoriasCliente.map(function (sc) {
                            return '<span style="display:inline-block;background:#FFC300;color:#000;font-size:.78rem;' +
                                'font-weight:700;padding:1px 8px;border-radius:12px;margin:1px 2px;">' + _escaparHtml(sc) + '</span>';
                        }).join('') + '</p>';
                // Botões de ação
                linhas += '<div style="display:flex;gap:8px;margin-top:10px;">' +
                    '<button type="button" class="btn btn-danger btn-sm btn-orc-recusar" ' +
                        'data-ag-id="' + _escaparHtml(d.agendamentoId || '') + '" ' +
                        'data-prest-email="' + _escaparHtml(d.prestadorEmail || '') + '" ' +
                        'data-servico="' + _escaparHtml(d.servico || '') + '">' +
                        '<i class="bi bi-x-circle me-1"></i>Recusar Orçamento</button>' +
                    '<button type="button" class="btn btn-success btn-sm btn-orc-aceitar" ' +
                        'data-ag-id="' + _escaparHtml(d.agendamentoId || '') + '" ' +
                        'data-prest-email="' + _escaparHtml(d.prestadorEmail || '') + '" ' +
                        'data-prest-nome="' + _escaparHtml(prestNome || '') + '" ' +
                        'data-servico="' + _escaparHtml(d.servico || '') + '">' +
                        '<i class="bi bi-calendar-check me-1"></i>Aceitar e Agendar</button>' +
                    '</div>';
            }

            if (n.tipo === 'cancelamento' && d.motivo)
                linhas += '<p style="margin:3px 0;font-size:.85rem;color:#dc3545;"><i class="bi bi-exclamation-circle me-1"></i><strong>Motivo:</strong> ' + _escaparHtml(d.motivo) + '</p>';
            if (n.tipo === 'confirmacao') {
                if (d.valor) linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-cash-coin me-1" style="color:#6c757d;"></i><strong>Valor:</strong> R$ ' + parseFloat(d.valor).toFixed(2).replace('.', ',') + '</p>';
                if (d.formaPagamento) linhas += '<p style="margin:3px 0;font-size:.85rem;"><i class="bi bi-credit-card me-1" style="color:#6c757d;"></i><strong>Pagamento:</strong> ' + _escaparHtml(d.formaPagamento) + '</p>';
            }
            if (ts) linhas += '<p style="margin:6px 0 0;font-size:.76rem;color:#adb5bd;"><i class="bi bi-clock me-1"></i>' + ts + '</p>';

            return '<div class="notif-item-cli" data-notif-id="' + _escaparHtml(n.id || '') + '" style="border-left:4px solid ' + _borda(n.tipo) + ';padding:10px 14px;background:#f8f9fa;border-radius:0 8px 8px 0;margin-bottom:10px;">' +
                '<div style="font-weight:700;font-size:.92rem;margin-bottom:6px;">' + _icone(n.tipo) + _titulo(n.tipo) + '</div>' +
                linhas + '</div>';
        }).join('');

        if (!itensHtml) {
            itensHtml = '<p class="text-muted text-center py-3">' +
                '<i class="bi bi-inbox me-2"></i>Nenhum retorno do prestador.</p>';
        }

        var modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = id;
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#146ADB;color:#fff;">' +
            '<h5 class="modal-title">' +
            '<i class="bi bi-bell-fill me-2"></i>Retornos dos Prestadores' +
            '</h5>' +
            '<button type="button" class="btn-close btn-close-white" ' +
            'data-bs-dismiss="modal" aria-label="Fechar"></button>' +
            '</div>' +
            '<div class="modal-body" style="padding:16px;">' + itensHtml + '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">' +
            '<i class="bi bi-x-circle me-1"></i>Fechar</button>' +
            '<button type="button" class="btn btn-sm" id="btn-modal-notif-lidas" ' +
            'style="background:#146ADB;border-color:#146ADB;color:#fff;font-weight:600;">' +
            '<i class="bi bi-check-all me-1"></i>Marcar como lidas</button>' +
            '</div>' +
            '</div></div>';

        document.body.appendChild(modal);
        var bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Limpa o modal do DOM ao fechar para evitar acúmulo
        modal.addEventListener('hidden.bs.modal', function () { modal.remove(); });

        var btnLidas = document.getElementById('btn-modal-notif-lidas');
        if (btnLidas) {
            btnLidas.addEventListener('click', function () {
                bsModal.hide();
                if (onMarcarLidas) onMarcarLidas();
            });
        }

        // ---- Helper: remove item do DOM e verifica se ainda há pendentes ----
        function _removerItemEVerificar(notifId, emailCli) {
            // Remove o card da notificação tratada
            var itemEl = modal.querySelector('.notif-item-cli[data-notif-id="' + notifId + '"]');
            if (itemEl) {
                itemEl.style.transition = 'opacity .3s';
                itemEl.style.opacity = '0';
                setTimeout(function () { itemEl.remove(); _verificarPendentes(); }, 320);
            } else {
                _verificarPendentes();
            }
        }

        function _verificarPendentes() {
            var bodyEl = modal.querySelector('.modal-body');
            var restantes = modal.querySelectorAll('.notif-item-cli');

            // Conta apenas os itens que ainda têm botões de ação (orcamento pendente de resposta)
            var comAcao = modal.querySelectorAll('.btn-orc-recusar, .btn-orc-aceitar').length;

            if (restantes.length === 0) {
                // Nenhuma notificação restante: exibe mensagem e fecha
                if (bodyEl) bodyEl.innerHTML =
                    '<p class="text-muted text-center py-4">' +
                    '<i class="bi bi-check-all me-2" style="color:#198754;font-size:1.2rem;"></i>' +
                    'Todos os retornos foram tratados!</p>';
                setTimeout(function () { bsModal.hide(); if (onMarcarLidas) onMarcarLidas(); }, 1200);
            } else if (comAcao === 0) {
                // Restam apenas informativos (sem botões de ação) — atualiza contador no rodapé
                var rodape = modal.querySelector('.modal-footer');
                if (rodape && !rodape.querySelector('#notif-pendentes-aviso')) {
                    var aviso = document.createElement('span');
                    aviso.id = 'notif-pendentes-aviso';
                    aviso.style.cssText = 'font-size:.82rem;color:#198754;font-weight:600;margin-right:auto;';
                    aviso.innerHTML = '<i class="bi bi-check-circle me-1"></i>Orçamentos resolvidos';
                    rodape.insertBefore(aviso, rodape.firstChild);
                }
            }
        }

        // ---- Botões de ação de orçamento ----
        modal.querySelectorAll('.btn-orc-recusar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var agId       = btn.dataset.agId;
                var prestEmail = btn.dataset.prestEmail;
                var servico    = btn.dataset.servico;
                // Recupera o id da notificação a partir do card pai
                var cardEl  = btn.closest('.notif-item-cli');
                var notifId = cardEl ? cardEl.dataset.notifId : '';
                if (!confirm('Tem certeza que deseja recusar este orçamento?')) return;

                // Atualiza no storage do prestador
                var agsPrest = obterAgendamentosPrestador(prestEmail);
                var idxP = agsPrest.findIndex(function (a) { return a.id === agId; });
                if (idxP >= 0) { agsPrest[idxP].status = 'orcamento_recusado'; salvarAgendamentosPrestador(prestEmail, agsPrest); }

                // Atualiza no storage do cliente
                var usuCli = obterUsuarioLogado();
                if (usuCli) _atualizarStatusClienteAgendamento(agId, usuCli.email, 'orcamento_recusado');

                // Notifica o prestador
                sgCriarNotificacao(prestEmail, 'orcamento_recusado', { agendamentoId: agId, servico: servico });

                // Marca APENAS esta notificação como lida
                if (usuCli) sgMarcarNotifLidaPorId(usuCli.email, notifId);

                // Remove o card do modal; mantém os demais abertos
                _removerItemEVerificar(notifId, usuCli ? usuCli.email : '');
                exibirToast('Orçamento recusado. O prestador foi notificado.');

                /* Sprint 1 — atualiza o link "Aguardando Confirmação" no stat card */
                if (usuCli) _atualizarLinkAguardandoStatCard(usuCli.email);
            });
        });

        modal.querySelectorAll('.btn-orc-aceitar').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var agId       = btn.dataset.agId;
                var prestEmail = btn.dataset.prestEmail;
                var prestNome  = btn.dataset.prestNome;
                var servico    = btn.dataset.servico;
                var cardEl  = btn.closest('.notif-item-cli');
                var notifId = cardEl ? cardEl.dataset.notifId : '';

                // Sprint 3 — Aceitar e Agendar: confirma diretamente, sem etapa adicional do prestador
                // Atualiza no storage do prestador
                var agsPrest = obterAgendamentosPrestador(prestEmail);
                var idxP = agsPrest.findIndex(function (a) { return a.id === agId; });
                if (idxP >= 0) { agsPrest[idxP].status = 'confirmado'; salvarAgendamentosPrestador(prestEmail, agsPrest); }

                // Atualiza no storage do cliente
                var usuCli = obterUsuarioLogado();
                if (usuCli) _atualizarStatusClienteAgendamento(agId, usuCli.email, 'confirmado');

                // Notifica o prestador que o agendamento foi confirmado pelo cliente
                sgCriarNotificacao(prestEmail, 'confirmacao', {
                    agendamentoId: agId, servico: servico,
                    clienteNome: usuCli ? usuCli.nome : ''
                });

                // Marca APENAS esta notificação como lida
                if (usuCli) sgMarcarNotifLidaPorId(usuCli.email, notifId);

                // Remove o card do modal; mantém os demais abertos
                _removerItemEVerificar(notifId, usuCli ? usuCli.email : '');
                exibirToast('Agendamento confirmado! Seu serviço com ' + prestNome + ' está agendado.');

                /* Sprint 1 — atualiza (ou remove) o link "Aguardando Confirmação"
                   no stat card da Área Exclusiva do cliente.                      */
                if (usuCli) _atualizarLinkAguardandoStatCard(usuCli.email);
            });
        });
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
    // NAVBAR CLIENTE — "Meu Perfil" dropdown (Sprint 3)
    // =========================================================
    function inicializarNavbarCliente() {
        var isCliPage = window.location.pathname.includes('/paginasCliente/') ||
            window.location.pathname.includes('indexCliente');
        if (!isCliPage) return;

        var usu = obterUsuarioLogado();
        if (!usu || usu.tipo !== 'cliente') return;

        // Atualiza saudação
        var span = document.querySelector('.navbar-logada-info');
        if (span) span.textContent = 'Olá, ' + usu.nome + '!';

        // Remove botão Sair avulso do navbar (se ainda existir do HTML estático)
        document.querySelectorAll('a.btn-danger, .navbar-nav a.btn-danger').forEach(function (a) {
            if (a.textContent.trim() === 'Sair' ||
                (a.href && a.href.includes('index.html') && a.classList.contains('btn-danger'))) {
                var li = a.closest('li'); if (li) li.remove(); else a.remove();
            }
        });

        // Cria dropdown "Meu Perfil" para TODAS as páginas do cliente
        _criarDropdownMeuPerfilCliente(usu);

        // Inicializa sidebar (adiciona Sair + logout)
        inicializarSidebarCliente();
    }

    function _criarDropdownMeuPerfilCliente(usu) {
        if (document.getElementById('cli-perfil-toggle')) return; // já criado
        var span = document.querySelector('.navbar-logada-info');
        if (!span) return;

        span.style.cssText += '; position:relative; display:inline-flex; flex-direction:column; align-items:center; cursor:default;';

        var toggle = document.createElement('a');
        toggle.id = 'cli-perfil-toggle';
        toggle.href = '#';
        toggle.style.cssText = 'font-size:0.72rem; color:var(--azul-principal,#146ADB); text-decoration:underline; cursor:pointer; white-space:nowrap;';
        toggle.innerHTML = '<i class="bi bi-chevron-down" id="cli-chevron" style="font-size:.65rem;"></i> Meu Perfil';

        var dropdown = document.createElement('div');
        dropdown.id = 'cli-perfil-dropdown';
        dropdown.style.cssText = 'display:none; position:absolute; top:calc(100% + 4px); right:0; min-width:230px; background:var(--fundo-card,#fff); border:1.5px solid var(--borda,#dee2e6); border-radius:8px; box-shadow:0 4px 18px rgba(0,0,0,.13); z-index:1055; padding:6px 0;';

        var base = '/paginasCliente/';
        var links = [
            { href: base + 'clienteAreaExclusiva.html', icon: 'bi-house-door', text: 'Área Exclusiva' },
            { href: base + 'clientePerfilAdm.html', icon: 'bi-person-circle', text: 'Meu Perfil' },
            { href: base + 'clienteAgendarServicos.html', icon: 'bi-calendar-check', text: 'Agendar Serviços' },
            { href: base + 'clienteAvaliacoesFeitas.html', icon: 'bi-star', text: 'Avaliações Realizadas' },
            { href: base + 'clienteAvaliacoesRecebidas.html', icon: 'bi-star-half', text: 'Avaliações Recebidas' },
            { href: base + 'clienteContatoSite.html', icon: 'bi-chat-text', text: 'Suporte/Contato' }
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

        // Sprint 6 — sininho de mensagens não lidas na navbar do cliente
        _atualizarAvisoNavbarMsgsCliente(usu.email);
        setInterval(function () { _atualizarAvisoNavbarMsgsCliente(usu.email); }, 8000);

        var aberto = false;
        toggle.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            aberto = !aberto;
            dropdown.style.display = aberto ? 'block' : 'none';
            var ch = document.getElementById('cli-chevron');
            if (ch) ch.className = 'bi ' + (aberto ? 'bi-chevron-up' : 'bi-chevron-down');
        });
        document.addEventListener('click', function (e) {
            if (!span.contains(e.target)) {
                aberto = false; dropdown.style.display = 'none';
                var ch = document.getElementById('cli-chevron');
                if (ch) ch.className = 'bi bi-chevron-down';
            }
        });
    }

    // =========================================================
    // SIDEBAR CLIENTE — Sair no rodapé (Sprint 3)
    // =========================================================
    function inicializarSidebarCliente() {
        var sidebar = document.querySelector('.cli-sidebar');
        if (!sidebar) return;
        var ul = sidebar.querySelector('ul');
        if (!ul) return;
        if (!sidebar.querySelector('.sidebar-sair')) {
            var liSair = document.createElement('li');
            liSair.className = 'sidebar-sair';
            liSair.innerHTML = '<a href="/index.html" id="cli-sidebar-btn-sair"><i class="bi bi-box-arrow-right"></i> Sair</a>';
            ul.appendChild(liSair);
        }
        var btnSair = sidebar.querySelector('#cli-sidebar-btn-sair, .sidebar-sair a');
        if (btnSair && !btnSair.dataset.logoutBound) {
            btnSair.dataset.logoutBound = '1';
            btnSair.addEventListener('click', function () { DB.remove('usuarioLogado'); });
        }
        // Remove btn-danger Sair do navbar se ainda existir
        document.querySelectorAll('a.btn-danger, a.btn.btn-danger').forEach(function (a) {
            if (a.href && (a.href.includes('index.html') || a.textContent.trim() === 'Sair')) {
                var li = a.closest('li'); if (li) li.remove(); else a.remove();
            }
        });
    }

    // =========================================================
    // CLIENTE — SERVIÇOS CONFIRMADOS + CHAT (Sprint 3)
    // Popula #cli-tabela-confirmados com agendamentos confirmados
    // e permite ao cliente enviar mensagens ao prestador.
    // =========================================================
    function inicializarClienteConfirmados() {
        var tabela = document.getElementById('cli-tabela-confirmados');
        if (!tabela) return;

        var usu = obterUsuarioLogado();
        if (!usu) return;
        var emailCli = usu.email;

        // Verifica se o cliente já avaliou este agendamento específico
        function _jaAvaliouConfirmado(agId, prestEmail) {
            var avs = obterAvaliacoesRecebidasPrestador(prestEmail);
            return avs.some(function (a) { return a.id === 'cli-aval-conf-' + agId; });
        }

        var _avalConfAtual = null;

        function renderConfirmados() {
            var cliAgs = DB.get('clienteAgendamentos_' + emailCli) || [];
            var ativos = cliAgs.filter(function (ag) {
                return ag.status === 'confirmado' || ag.status === 'concluido';
            });

            if (ativos.length === 0) {
                tabela.innerHTML = '<p class="text-muted text-center py-4" style="font-size:.9rem;"><i class="bi bi-calendar-check me-2"></i>Nenhum serviço confirmado ainda.</p>';
                var avisoEl = document.getElementById('cli-aviso-msgs-confirmados');
                if (avisoEl) avisoEl.style.display = 'none';
                return;
            }

            // Verifica mensagens não lidas
            var hasUnread = false;
            ativos.forEach(function (ag) {
                var chat = DB.get('agendaChat_' + ag.id) || [];
                if (chat.some(function (m) { return m.tipo === 'prest' && !m.lidaCliente; })) hasUnread = true;
            });
            var avisoEl = document.getElementById('cli-aviso-msgs-confirmados');
            if (avisoEl) avisoEl.style.display = hasUnread ? '' : 'none';

            var html = '<ul class="cli-pedidos-lista">';
            ativos.forEach(function (ag) {
                var chat = DB.get('agendaChat_' + ag.id) || [];
                var unread = chat.filter(function (m) { return m.tipo === 'prest' && !m.lidaCliente; }).length;
                var horIni = (ag.horario || '').split(' - ')[0] || '—';
                // Sprint 3 — busca valor e forma de pagamento do registro do prestador
                var agsPrestConf = obterAgendamentosPrestador(ag.emailPrestador || '');
                var agPConf      = agsPrestConf.find(function (a) { return a.id === ag.id; }) || {};
                var valorConf    = (agPConf.valor !== undefined && agPConf.valor !== 0) ? parseFloat(agPConf.valor) : null;
                var pgtoConf     = agPConf.formaPagamento || ag.formaPagamentoPreferida || '';
                // Sprint 1 — badge de status enriquecido
                var statusBadgesHtml;
                if (ag.status === 'confirmado') {
                    statusBadgesHtml =
                        '<span class="badge" style="background:#198754; color:#fff; font-size:.75rem;">Confirmado</span>' +
                        '&nbsp;<span class="badge" style="background:#0d6efd; color:#fff; font-size:.72rem;white-space:nowrap;">' +
                        '<i class="bi bi-clock me-1"></i>Serviço em aberto</span>';
                } else {
                    statusBadgesHtml =
                        '<span class="badge" style="background:#146ADB; color:#fff; font-size:.75rem;">Concluído</span>' +
                        (agPConf.pago
                            ? '&nbsp;<span class="badge" style="background:#198754; color:#fff; font-size:.72rem;white-space:nowrap;">' +
                              '<i class="bi bi-check-circle-fill me-1"></i>Pago</span>'
                            : '');
                }
                // Sprint 1 — subcategoria do serviço
                var subcatCliHtml = (ag.subcategoriasCliente && ag.subcategoriasCliente.length > 0)
                    ? '<br><small class="text-muted"><i class="bi bi-list-check me-1"></i>' +
                      ag.subcategoriasCliente.map(function(sc){ return _escaparHtml(sc); }).join(', ') + '</small>'
                    : '';
                html +=
                    '<li class="cli-pedidos-item">' +
                    '<div>' +
                    '<strong>' + _escaparHtml(ag.servico || '—') + '</strong>' +
                    subcatCliHtml +
                    '<br><span style="font-size:.82rem;color:#6c757d;">' + _escaparHtml(ag.nomePrestador || '—') + '</span>' +
                    '<br><small class="text-muted"><i class="bi bi-calendar3 me-1"></i>' + _escaparHtml(ag.data || '—') + ' às ' + horIni + '</small>' +
                    (valorConf !== null ? '<br><small class="text-muted"><i class="bi bi-cash-coin me-1"></i>R$ ' + valorConf.toFixed(2).replace('.', ',') + (pgtoConf ? ' &mdash; ' + _escaparHtml(pgtoConf) : '') + '</small>' : '') +
                    '</div>' +
                    '<div class="cli-pedidos-acoes">' +
                    statusBadgesHtml +
                    (ag.status === 'concluido'
                        // Serviço concluído — chat bloqueado, botão vira "Ver Histórico"
                        ? '<button type="button" class="btn btn-sm btn-chat-cliente ms-1" ' +
                          'data-ag-id="' + _escaparHtml(ag.id) + '" ' +
                          'data-prest-email="' + _escaparHtml(ag.emailPrestador || '') + '" ' +
                          'data-prest-nome="' + _escaparHtml(ag.nomePrestador || '') + '" ' +
                          'data-servico="' + _escaparHtml(ag.servico || '') + '" ' +
                          'data-data="' + _escaparHtml(ag.data || '') + '" ' +
                          'data-readonly="1" ' +
                          'style="background:#6c757d;border-color:#6c757d;color:#fff;font-weight:600;">' +
                          '<i class="bi bi-clock-history me-1"></i>Ver Histórico de Mensagens</button>'
                        // Serviço em aberto — chat ativo
                        : '<button type="button" class="btn btn-sm btn-chat-cliente" ' +
                          'data-ag-id="' + _escaparHtml(ag.id) + '" ' +
                          'data-prest-email="' + _escaparHtml(ag.emailPrestador || '') + '" ' +
                          'data-prest-nome="' + _escaparHtml(ag.nomePrestador || '') + '" ' +
                          'data-servico="' + _escaparHtml(ag.servico || '') + '" ' +
                          'data-data="' + _escaparHtml(ag.data || '') + '" ' +
                          'style="background:#0dcaf0;border-color:#0dcaf0;color:#fff;font-weight:600;">' +
                          '<i class="bi bi-chat-dots me-1"></i>Enviar Mensagem' +
                          (unread > 0 ? ' <span class="badge bg-danger" style="font-size:.65rem;vertical-align:middle;">' + unread + '</span>' : '') +
                          '</button>') +
                    (ag.status === 'concluido'
                        ? (_jaAvaliouConfirmado(ag.id, ag.emailPrestador || '')
                            ? ' <span class="badge ms-1" style="background:#198754;color:#fff;font-size:.75rem;"><i class="bi bi-check-circle me-1"></i>Avaliado</span>'
                            : ' <button type="button" class="btn btn-sm btn-avaliar-confirmado ms-1" ' +
                              'data-ag-id="' + _escaparHtml(ag.id) + '" ' +
                              'data-prest-email="' + _escaparHtml(ag.emailPrestador || '') + '" ' +
                              'data-prest-nome="' + _escaparHtml(ag.nomePrestador || '') + '" ' +
                              'data-servico="' + _escaparHtml(ag.servico || '') + '" ' +
                              'style="background:#FFC300;border-color:#e6b000;color:#000;font-weight:600;">' +
                              '<i class="bi bi-star me-1"></i>Avaliar</button>')
                        : '') +
                    '</div>' +
                    '</li>';
            });
            html += '</ul>';
            tabela.innerHTML = html;

            tabela.querySelectorAll('.btn-chat-cliente').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var somenteLeitura = btn.dataset.readonly === '1';
                    _abrirChatCliente(
                        btn.dataset.agId,
                        btn.dataset.prestEmail,
                        btn.dataset.prestNome,
                        btn.dataset.servico,
                        btn.dataset.data,
                        emailCli,
                        somenteLeitura
                    );
                    // Só re-renderiza após fechar se o chat estava ativo (pode ter novas mensagens)
                    if (!somenteLeitura) {
                        setTimeout(renderConfirmados, 400);
                    }
                });
            });

            // — Botão Avaliar: abre modal de avaliação do prestador —
            tabela.querySelectorAll('.btn-avaliar-confirmado').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    _avalConfAtual = {
                        agId:      btn.dataset.agId,
                        prestEmail: btn.dataset.prestEmail,
                        prestNome: btn.dataset.prestNome,
                        servico:   btn.dataset.servico
                    };
                    var modalEl = document.getElementById('modalAvaliarPrestConfirmado');
                    if (!modalEl) return;
                    var infoEl = document.getElementById('modal-aval-conf-info');
                    if (infoEl) infoEl.innerHTML =
                        '<strong>Prestador:</strong> ' + _escaparHtml(btn.dataset.prestNome) +
                        ' &nbsp;|&nbsp; <strong>Serviço:</strong> ' + _escaparHtml(btn.dataset.servico);
                    // Reseta estrelas
                    var stars = modalEl.querySelectorAll('#modal-aval-conf-estrelas i');
                    stars.forEach(function (s) { s.className = 'bi bi-star'; s.style.color = '#ccc'; });
                    var notaEl = document.getElementById('modal-aval-conf-nota');
                    if (notaEl) notaEl.value = '0';
                    var comentEl = document.getElementById('modal-aval-conf-comentario');
                    if (comentEl) comentEl.value = '';
                    bootstrap.Modal.getOrCreateInstance(modalEl).show();
                });
            });
        }

        // — Inicializa estrelas do modal de avaliação de prestador (serviços concluídos) —
        (function _initStarsAvalConf() {
            var cont   = document.getElementById('modal-aval-conf-estrelas');
            var hidden = document.getElementById('modal-aval-conf-nota');
            if (!cont || !hidden) return;
            var stars = cont.querySelectorAll('i');
            stars.forEach(function (s, i) {
                s.addEventListener('click', function () {
                    hidden.value = i + 1;
                    stars.forEach(function (st, j) {
                        st.className   = j <= i ? 'bi bi-star-fill filled' : 'bi bi-star';
                        st.style.color = j <= i ? '#ffc107' : '#ccc';
                    });
                });
                s.addEventListener('mouseover', function () {
                    stars.forEach(function (st, j) { st.style.color = j <= i ? '#ffc107' : '#ccc'; });
                });
                s.addEventListener('mouseout', function () {
                    var cur = parseInt(hidden.value) || 0;
                    stars.forEach(function (st, j) { st.style.color = j < cur ? '#ffc107' : '#ccc'; });
                });
            });
        }());

        // — Salvar avaliação: persiste em avaliacoesRecebidasPrestador —
        var btnSalvarAvalConf = document.getElementById('btn-salvar-aval-conf');
        if (btnSalvarAvalConf && !btnSalvarAvalConf.dataset.bound) {
            btnSalvarAvalConf.dataset.bound = '1';
            btnSalvarAvalConf.addEventListener('click', function () {
                if (!_avalConfAtual) return;
                var nota   = parseInt((document.getElementById('modal-aval-conf-nota')       || {}).value) || 0;
                var coment = (document.getElementById('modal-aval-conf-comentario') || {}).value || '';
                if (nota === 0)        { alert('Selecione uma nota antes de salvar.');     return; }
                if (!coment.trim())    { alert('Escreva um comentário antes de salvar.'); return; }

                var usLogado    = obterUsuarioLogado();
                var clienteNome = usLogado ? (usLogado.nome || 'Cliente') : 'Cliente';
                var avId        = 'cli-aval-conf-' + _avalConfAtual.agId;

                var registro = {
                    id:          avId,
                    cliente:     clienteNome,
                    servico:     _avalConfAtual.servico,
                    nota:        nota,
                    comentario:  coment,
                    data:        new Date().toLocaleDateString('pt-BR')
                };

                // Salva em avaliacoesRecebidasPrestador (chave do prestador avaliado)
                var avs = obterAvaliacoesRecebidasPrestador(_avalConfAtual.prestEmail);
                var idx = avs.findIndex(function (a) { return a.id === avId; });
                if (idx >= 0) avs[idx] = registro; else avs.push(registro);
                salvarAvaliacoesRecebidasPrestador(_avalConfAtual.prestEmail, avs);

                // Sprint 1 — também registra em avaliacoesSalvas para aparecer
                // em clienteAvaliacoesFeitas.html (lista "Minhas Avaliações Realizadas")
                var AVALIACOES_KEY = 'avaliacoesSalvas';
                var avsFeitas = DB.get(AVALIACOES_KEY) || [];
                var registroFeita = {
                    pedidoId:     avId,
                    profissional: _avalConfAtual.prestNome,
                    servico:      _avalConfAtual.servico,
                    nota:         nota,
                    comentario:   coment,
                    data:         new Date().toLocaleDateString('pt-BR')
                };
                var idxFeita = avsFeitas.findIndex(function (a) { return a.pedidoId === avId; });
                if (idxFeita >= 0) avsFeitas[idxFeita] = registroFeita; else avsFeitas.push(registroFeita);
                DB.set(AVALIACOES_KEY, avsFeitas);

                var modalEl = document.getElementById('modalAvaliarPrestConfirmado');
                if (modalEl) { var inst = bootstrap.Modal.getInstance(modalEl); if (inst) inst.hide(); }
                exibirToast('Avaliação enviada ao prestador com sucesso!');
                renderConfirmados(); // atualiza o botão para "Avaliado"
            });
        }

        renderConfirmados();
        // Polling a cada 10 segundos para novas mensagens
        setInterval(renderConfirmados, 10000);
    }

    // =========================================================
    // CHAT CLIENTE → PRESTADOR (Sprint 3)
    // =========================================================
    function _abrirChatCliente(agId, prestEmail, prestNome, servico, data, emailCli, somenteLeitura) {
        var CHAT_KEY = 'agendaChat_' + agId;
        var modalId = 'modalChatCliente_' + agId;
        var ex = document.getElementById(modalId);
        if (ex) { bootstrap.Modal.getOrCreateInstance(ex).show(); return; }

        var modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = modalId;
        modal.setAttribute('tabindex', '-1');

        // ── Cabeçalho — muda ícone/título conforme modo ────────────────────
        var headerIcone = somenteLeitura ? 'bi-clock-history' : 'bi-chat-dots';
        var headerTitulo = somenteLeitura
            ? 'Histórico de Mensagens — ' + _escaparHtml(prestNome)
            : 'Chat com ' + _escaparHtml(prestNome);

        // Botão Imprimir Mensagens (somente no modo leitura)
        var btnImprimirHtml = somenteLeitura
            ? '<button type="button" class="btn btn-sm btn-outline-light me-2" id="chat-cli-imprimir-' + agId + '">' +
              '<i class="bi bi-printer me-1"></i>Imprimir Mensagens</button>'
            : '';

        // ── Área de composição — ativa ou bloqueada ─────────────────────────
        var composerHtml = somenteLeitura
            ? '<div style="padding:12px 16px;background:#f8f9fa;border-top:1px solid #dee2e6;text-align:center;">' +
              '<span style="font-size:.85rem;color:#6c757d;">' +
              '<i class="bi bi-lock-fill me-2"></i>Serviço concluído — novas mensagens não são permitidas.' +
              '</span></div>'
            : '<div class="agenda-chat-composer">' +
              '<textarea class="form-control agenda-chat-textarea" id="chat-cli-input-' + agId + '" maxlength="500" placeholder="Digite sua mensagem para o prestador..."></textarea>' +
              '<div class="agenda-chat-contador"><span id="chat-cli-cont-' + agId + '">0</span>/500</div>' +
              '</div>';

        // ── Rodapé — botões variam conforme modo ────────────────────────────
        var rodapeHtml = somenteLeitura
            ? '<div class="agenda-chat-rodape">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-circle me-1"></i>Fechar</button>' +
              '</div>'
            : '<div class="agenda-chat-rodape">' +
              '<button type="button" class="btn btn-secondary btn-sm" id="chat-cli-limpar-' + agId + '"><i class="bi bi-x-circle me-1"></i>Limpar</button>' +
              '<button type="button" class="btn btn-sm" id="chat-cli-enviar-' + agId + '" style="background:var(--azul-principal);border-color:var(--azul-principal);color:#fff;font-weight:600;"><i class="bi bi-send me-1"></i>Enviar</button>' +
              '</div>';

        modal.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-lg">' +
            '<div class="modal-content agenda-chat-modal">' +
            '<div class="modal-header" style="background:var(--azul-principal,#146ADB);color:#fff;">' +
            '<h5 class="modal-title"><i class="bi ' + headerIcone + ' me-2"></i>' + headerTitulo + '</h5>' +
            btnImprimirHtml +
            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>' +
            '</div>' +
            '<div class="agenda-chat-info">' +
            '<span class="agenda-chat-info-item"><i class="bi bi-tools"></i> <strong>' + _escaparHtml(servico) + '</strong></span>' +
            '<span class="agenda-chat-info-item"><i class="bi bi-person-fill"></i> <strong>' + _escaparHtml(prestNome) + '</strong></span>' +
            '<span class="agenda-chat-info-item"><i class="bi bi-calendar3"></i> <strong>' + _escaparHtml(data) + '</strong></span>' +
            '</div>' +
            '<div class="agenda-chat-historico" id="chat-cli-hist-' + agId + '" aria-live="polite"></div>' +
            composerHtml +
            rodapeHtml +
            '</div></div>';

        document.body.appendChild(modal);

        function carregarMsgs() {
            var msgs = DB.get(CHAT_KEY) || [];
            // Marca msgs do prestador como lidas pelo cliente
            var changed = false;
            msgs.forEach(function (m) { if (m.tipo === 'prest' && !m.lidaCliente) { m.lidaCliente = true; changed = true; } });
            if (changed) DB.set(CHAT_KEY, msgs);

            var histEl = document.getElementById('chat-cli-hist-' + agId);
            if (!histEl) return;
            if (msgs.length === 0) {
                histEl.innerHTML = '<div class="agenda-chat-vazio"><i class="bi bi-chat-dots"></i>' +
                    (somenteLeitura ? 'Nenhuma mensagem foi trocada neste serviço.' : 'Nenhuma mensagem ainda. Seja o primeiro a escrever!') +
                    '</div>';
                return;
            }
            histEl.innerHTML = msgs.map(function (m) {
                var lado = m.tipo === 'cliente' ? 'prest' : 'cliente';
                var autor = m.tipo === 'cliente' ? 'Você' : _escaparHtml(prestNome);
                var hora = m.timestamp
                    ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '';
                return '<div class="agenda-chat-msg ' + lado + '">' +
                    _escaparHtml(m.texto) +
                    '<span class="agenda-chat-msg-hora">' + autor + ' · ' + hora + '</span>' +
                    '</div>';
            }).join('');
            histEl.scrollTop = histEl.scrollHeight;
        }

        carregarMsgs();
        var bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', function () { modal.remove(); });

        // ── Botão Imprimir Mensagens ────────────────────────────────────────
        if (somenteLeitura) {
            var btnImprimir = document.getElementById('chat-cli-imprimir-' + agId);
            if (btnImprimir) {
                btnImprimir.addEventListener('click', function () {
                    var msgs = DB.get(CHAT_KEY) || [];
                    var linhas = msgs.map(function (m) {
                        var autor = m.tipo === 'cliente' ? 'Você (cliente)' : _escaparHtml(prestNome);
                        var hora = m.timestamp
                            ? new Date(m.timestamp).toLocaleString('pt-BR')
                            : '';
                        var alinhamento = m.tipo === 'cliente' ? 'right' : 'left';
                        var bg = m.tipo === 'cliente' ? '#e8f4fd' : '#f0f4ff';
                        var border = m.tipo === 'cliente' ? '2px solid #0dcaf0' : '2px solid #146ADB';
                        return '<div style="text-align:' + alinhamento + ';margin-bottom:14px;">' +
                            '<div style="display:inline-block;max-width:75%;background:' + bg + ';' +
                            'border-left:' + (m.tipo === 'cliente' ? 'none' : border) + ';' +
                            'border-right:' + (m.tipo === 'cliente' ? border : 'none') + ';' +
                            'padding:10px 14px;border-radius:8px;text-align:left;">' +
                            '<div style="font-size:.78rem;font-weight:700;color:#555;margin-bottom:4px;">' + autor + '</div>' +
                            '<div style="font-size:.9rem;color:#212529;">' + _escaparHtml(m.texto) + '</div>' +
                            '<div style="font-size:.72rem;color:#888;margin-top:4px;text-align:right;">' + hora + '</div>' +
                            '</div></div>';
                    }).join('');

                    var dataImpressao = new Date().toLocaleString('pt-BR');
                    var win = window.open('', '_blank', 'width=800,height=700');
                    win.document.write(
                        '<!DOCTYPE html><html lang="pt-br"><head>' +
                        '<meta charset="UTF-8">' +
                        '<title>Histórico de Mensagens — ServGo!</title>' +
                        '<style>' +
                        'body{font-family:Arial,sans-serif;padding:30px;color:#212529;}' +
                        'h2{color:#146ADB;margin-bottom:4px;}' +
                        '.meta{font-size:.82rem;color:#6c757d;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #dee2e6;}' +
                        '.rodape{margin-top:32px;font-size:.75rem;color:#aaa;text-align:center;border-top:1px solid #dee2e6;padding-top:12px;}' +
                        '@media print{button{display:none!important;}}' +
                        '</style></head><body>' +
                        '<div style="text-align:center;margin-bottom:20px;">' +
                        '<span style="font-size:1.4rem;font-weight:900;color:#146ADB;">Serv</span>' +
                        '<span style="font-size:1.4rem;font-weight:900;color:#FFC300;">Go!</span>' +
                        '</div>' +
                        '<h2><i></i>Histórico de Mensagens</h2>' +
                        '<div class="meta">' +
                        '<strong>Serviço:</strong> ' + _escaparHtml(servico) + ' &nbsp;|&nbsp; ' +
                        '<strong>Prestador:</strong> ' + _escaparHtml(prestNome) + ' &nbsp;|&nbsp; ' +
                        '<strong>Data do Serviço:</strong> ' + _escaparHtml(data) + '<br>' +
                        '<strong>Impresso em:</strong> ' + dataImpressao +
                        '</div>' +
                        (msgs.length === 0
                            ? '<p style="color:#6c757d;text-align:center;">Nenhuma mensagem foi trocada neste serviço.</p>'
                            : linhas) +
                        '<div class="rodape">ServGo! — Documento gerado automaticamente em ' + dataImpressao + '</div>' +
                        '<div style="text-align:center;margin-top:20px;">' +
                        '<button onclick="window.print()" style="background:#146ADB;color:#fff;border:none;padding:8px 24px;border-radius:6px;font-size:.9rem;cursor:pointer;">Imprimir / Salvar PDF</button>' +
                        '</div>' +
                        '</body></html>'
                    );
                    win.document.close();
                    win.focus();
                });
            }
        } else {
            // ── Modo ativo: contador, limpar e enviar ───────────────────────
            var inputEl = document.getElementById('chat-cli-input-' + agId);
            var contEl = document.getElementById('chat-cli-cont-' + agId);
            if (inputEl && contEl) {
                inputEl.addEventListener('input', function () { contEl.textContent = inputEl.value.length; });
            }

            var btnLimpar = document.getElementById('chat-cli-limpar-' + agId);
            if (btnLimpar && inputEl) {
                btnLimpar.addEventListener('click', function () {
                    inputEl.value = '';
                    if (contEl) contEl.textContent = '0';
                });
            }

            var btnEnviar = document.getElementById('chat-cli-enviar-' + agId);
            if (btnEnviar && inputEl) {
                btnEnviar.addEventListener('click', function () {
                    var texto = (inputEl.value || '').trim();
                    if (!texto) { alert('Digite uma mensagem.'); return; }
                    var msgs = DB.get(CHAT_KEY) || [];
                    msgs.push({
                        id: 'msg-cli-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
                        tipo: 'cliente',
                        texto: texto,
                        timestamp: new Date().toISOString(),
                        lidaPrest: false,
                        lidaCliente: true
                    });
                    DB.set(CHAT_KEY, msgs);
                    inputEl.value = '';
                    if (contEl) contEl.textContent = '0';
                    if (prestEmail) {
                        sgCriarNotificacao(prestEmail, 'nova_mensagem_cliente', {
                            agendamentoId: agId,
                            clienteNome: emailCli,
                            servico: servico
                        });
                    }
                    carregarMsgs();
                });
            }

            // Polling de msgs a cada 5 s (apenas modo ativo)
            var pollingChat = setInterval(carregarMsgs, 5000);
            modal.addEventListener('hidden.bs.modal', function () {
                clearInterval(pollingChat);
                _atualizarAvisoNavbarMsgsCliente(emailCli);
            });
            return; // evita o listener duplicado abaixo
        }

        // Sprint 6 — atualiza o sininho da navbar ao fechar (modo leitura)
        modal.addEventListener('hidden.bs.modal', function () {
            _atualizarAvisoNavbarMsgsCliente(emailCli);
        });
    }

    // =========================================================
    // CHAT PRESTADOR → CLIENTE (Sprint 3)
    // Botão Chat na lista de agendamentos confirmados/próximos
    // =========================================================
    function _abrirChatPrestador(ag, emailPrest, somenteLeitura) {
        var CHAT_KEY = 'agendaChat_' + ag.id;
        var modalId = (somenteLeitura ? 'modalChatPrestHist_' : 'modalChatPrestador_') + ag.id;
        var ex = document.getElementById(modalId);
        if (ex) { bootstrap.Modal.getOrCreateInstance(ex).show(); return; }

        var tituloModal = somenteLeitura
            ? '<i class="bi bi-clock-history me-2"></i>Histórico de Mensagens — ' + _escaparHtml(ag.cliente || 'Cliente')
            : '<i class="bi bi-chat-dots me-2"></i>Chat com ' + _escaparHtml(ag.cliente || 'Cliente');

        var composerHtml = somenteLeitura
            ? '<div class="agenda-chat-composer" style="background:#f8f9fa;border-top:1px solid #dee2e6;padding:10px 16px;">' +
              '<p class="text-muted mb-0" style="font-size:.83rem;"><i class="bi bi-lock me-1"></i>Serviço concluído — chat em modo somente leitura.</p>' +
              '</div>' +
              '<div class="agenda-chat-rodape">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-circle me-1"></i>Fechar</button>' +
              '</div>'
            : '<div class="agenda-chat-composer">' +
              '<textarea class="form-control agenda-chat-textarea" id="chat-prest-input-' + ag.id + '" maxlength="500" placeholder="Digite uma mensagem para o cliente..."></textarea>' +
              '<div class="agenda-chat-contador"><span id="chat-prest-cont-' + ag.id + '">0</span>/500</div>' +
              '</div>' +
              '<div class="agenda-chat-rodape">' +
              '<button type="button" class="btn btn-secondary btn-sm" id="chat-prest-limpar-' + ag.id + '"><i class="bi bi-x-circle me-1"></i>Limpar</button>' +
              '<button type="button" class="btn btn-sm" id="chat-prest-enviar-' + ag.id + '" style="background:var(--azul-principal);border-color:var(--azul-principal);color:#fff;font-weight:600;"><i class="bi bi-send me-1"></i>Enviar</button>' +
              '</div>';

        var modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = modalId;
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-lg">' +
            '<div class="modal-content agenda-chat-modal">' +
            '<div class="modal-header" style="background:#2B2B2B;color:#fff;">' +
            '<h5 class="modal-title">' + tituloModal + '</h5>' +
            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>' +
            '</div>' +
            '<div class="agenda-chat-info">' +
            '<span class="agenda-chat-info-item"><i class="bi bi-person-fill"></i> <strong>' + _escaparHtml(ag.cliente || '—') + '</strong></span>' +
            '<span class="agenda-chat-info-item"><i class="bi bi-tools"></i> <strong>' + _escaparHtml(ag.servico || '—') + '</strong></span>' +
            '<span class="agenda-chat-info-item"><i class="bi bi-calendar3"></i> <strong>' + _escaparHtml(ag.data || '—') + '</strong></span>' +
            '</div>' +
            '<div class="agenda-chat-historico" id="chat-prest-hist-' + ag.id + '" aria-live="polite"></div>' +
            composerHtml +
            '</div></div>';
        document.body.appendChild(modal);

        function carregarMsgsPrest() {
            var msgs = DB.get(CHAT_KEY) || [];
            var changed = false;
            msgs.forEach(function (m) { if (m.tipo === 'cliente' && !m.lidaPrest) { m.lidaPrest = true; changed = true; } });
            if (changed) DB.set(CHAT_KEY, msgs);
            var histEl = document.getElementById('chat-prest-hist-' + ag.id);
            if (!histEl) return;
            if (msgs.length === 0) {
                histEl.innerHTML = '<div class="agenda-chat-vazio"><i class="bi bi-chat-dots"></i>Nenhuma mensagem ainda.</div>';
                return;
            }
            histEl.innerHTML = msgs.map(function (m) {
                var lado = m.tipo === 'prest' ? 'prest' : 'cliente';
                var autor = m.tipo === 'prest' ? 'Você' : _escaparHtml(ag.cliente || 'Cliente');
                var hora = m.timestamp
                    ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '';
                return '<div class="agenda-chat-msg ' + lado + '">' +
                    _escaparHtml(m.texto) +
                    '<span class="agenda-chat-msg-hora">' + autor + ' · ' + hora + '</span>' +
                    '</div>';
            }).join('');
            histEl.scrollTop = histEl.scrollHeight;
        }

        carregarMsgsPrest();
        var bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', function () { modal.remove(); });

        // Modo somente leitura — não conecta o composer
        if (somenteLeitura) {
            var pollingRO = setInterval(carregarMsgsPrest, 5000);
            modal.addEventListener('hidden.bs.modal', function () { clearInterval(pollingRO); });
            return;
        }

        var inputEl = document.getElementById('chat-prest-input-' + ag.id);
        var contEl = document.getElementById('chat-prest-cont-' + ag.id);
        if (inputEl && contEl) {
            inputEl.addEventListener('input', function () { contEl.textContent = inputEl.value.length; });
        }
        var btnLimpar = document.getElementById('chat-prest-limpar-' + ag.id);
        if (btnLimpar && inputEl) {
            btnLimpar.addEventListener('click', function () { inputEl.value = ''; if (contEl) contEl.textContent = '0'; });
        }
        var btnEnviar = document.getElementById('chat-prest-enviar-' + ag.id);
        if (btnEnviar && inputEl) {
            btnEnviar.addEventListener('click', function () {
                var texto = (inputEl.value || '').trim();
                if (!texto) { alert('Digite uma mensagem.'); return; }
                var msgs = DB.get(CHAT_KEY) || [];
                msgs.push({
                    id: 'msg-prest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
                    tipo: 'prest',
                    texto: texto,
                    timestamp: new Date().toISOString(),
                    lidaPrest: true,
                    lidaCliente: false
                });
                DB.set(CHAT_KEY, msgs);
                inputEl.value = '';
                if (contEl) contEl.textContent = '0';
                if (ag.clienteEmail) {
                    sgCriarNotificacao(ag.clienteEmail, 'nova_mensagem_prest', {
                        agendamentoId: ag.id,
                        prestadorNome: emailPrest,
                        servico: ag.servico
                    });
                }
                carregarMsgsPrest();
            });
        }
        var pollingPrest = setInterval(carregarMsgsPrest, 5000);
        modal.addEventListener('hidden.bs.modal', function () {
            clearInterval(pollingPrest);
            // Sprint 6 — remove o sininho do botão Chat ao marcar mensagens como lidas
            var liEl = document.querySelector('.agenda-prest-item[data-agendamento-id="' + ag.id + '"]');
            if (liEl) {
                var sinoEl = liEl.querySelector('.agenda-btn-sino');
                if (sinoEl) sinoEl.remove();
            }
            // Atualiza o sininho da navbar imediatamente após a leitura
            _atualizarAvisoNavbarMsgsPrestador(emailPrest);
        });
    }

    // =========================================================
    // PATCH: Adiciona botão Chat ao renderizarAba do prestador
    // (estende a função já existente sem modificar o original)
    // =========================================================
    (function _patchChatPrestador() {
        // Aguarda o DOM e então observa cliques no #agenda-lista para 'chat'
        var listaEl = document.getElementById('agenda-lista');
        if (!listaEl) return;
        var usu = obterUsuarioLogado();
        if (!usu || usu.tipo !== 'prestador') return;
        var emailPrest = usu.email;

        // Observer: quando o conteúdo de agenda-lista mudar, adiciona botão Chat
        // nos items 'confirmado' que ainda não têm o botão
        var obs = new MutationObserver(function () {
            listaEl.querySelectorAll('.agenda-prest-item').forEach(function (item) {
                var agId = item.dataset.agendamentoId;
                if (!agId) return;
                var botoesDiv = item.querySelector('.agenda-botoes');
                if (!botoesDiv) return;
                if (botoesDiv.querySelector('[data-acao="chat"]')) return; // já tem
                var statusEl = item.querySelector('.agenda-status-tag');
                if (!statusEl) return;
                if (!statusEl.classList.contains('confirmado')) return;
                var unread = (DB.get('agendaChat_' + agId) || []).filter(function (m) { return m.tipo === 'cliente' && !m.lidaPrest; }).length;
                var btnChat = document.createElement('a');
                btnChat.href = '#';
                btnChat.className = 'agenda-btn chat';
                btnChat.dataset.acao = 'chat';
                btnChat.innerHTML = '<i class="bi bi-chat-dots me-1"></i>Enviar Mensagem' +
                    (unread > 0 ? ' <span class="agenda-btn-sino"><i class="bi bi-bell-fill"></i></span>' : '');
                btnChat.addEventListener('click', function (e) {
                    e.preventDefault();
                    var ags = obterAgendamentosPrestador(emailPrest);
                    var ag = ags.find(function (a) { return a.id === agId; });
                    if (ag) _abrirChatPrestador(ag, emailPrest);
                });
                botoesDiv.appendChild(btnChat);
            });
        });
        obs.observe(listaEl, { childList: true, subtree: false });
    }());

    // =========================================================
    // SPRINT 6 — AVISO DE MENSAGENS NÃO LIDAS NA NAVBAR
    // =========================================================

    /** Conta mensagens de clientes ainda não lidas pelo prestador
     *  — inclui mensagens de chat livre E eventos de agendamento/proposta. */
    function _contarMsgsNaoLidasPrestador(emailPrest) {
        // 1. Mensagens de chat livre não lidas
        var totalChat = obterAgendamentosPrestador(emailPrest).reduce(function (tot, ag) {
            var chat = DB.get('agendaChat_' + ag.id) || [];
            return tot + chat.filter(function (m) { return m.tipo === 'cliente' && !m.lidaPrest; }).length;
        }, 0);
        // 2. Notificações de evento não lidas: nova solicitação, aceite e rejeição de proposta
        var tiposEventoPrest = ['orcamento_solicitado', 'agendamento', 'orcamento_aceito', 'orcamento_recusado'];
        var totalEventos = sgObterNotificacoes(emailPrest).filter(function (n) {
            return !n.lida && tiposEventoPrest.indexOf(n.tipo) >= 0;
        }).length;
        return totalChat + totalEventos;
    }

    /** Conta mensagens de prestadores ainda não lidas pelo cliente
     *  — inclui mensagens de chat livre E eventos de proposta/confirmação. */
    function _contarMsgsNaoLidasCliente(emailCli) {
        // 1. Mensagens de chat livre não lidas
        var totalChat = (DB.get('clienteAgendamentos_' + emailCli) || []).reduce(function (tot, ag) {
            var chat = DB.get('agendaChat_' + ag.id) || [];
            return tot + chat.filter(function (m) { return m.tipo === 'prest' && !m.lidaCliente; }).length;
        }, 0);
        // 2. Notificações de evento não lidas: proposta recebida (nova ou reenvio), confirmação, cancelamento
        var tiposEventoCli = ['orcamento_enviado', 'confirmacao', 'cancelamento', 'conclusao'];
        var totalEventos = sgObterNotificacoes(emailCli).filter(function (n) {
            return !n.lida && tiposEventoCli.indexOf(n.tipo) >= 0;
        }).length;
        return totalChat + totalEventos;
    }

    /** Exibe ou remove o sininho vermelho na navbar do prestador */
    function _atualizarAvisoNavbarMsgsPrestador(emailPrest) {
        var id = 'sg-navbar-bell-prest';
        var hasUnread = _contarMsgsNaoLidasPrestador(emailPrest) > 0;
        var el = document.getElementById(id);
        if (hasUnread && !el) {
            el = document.createElement('span');
            el.id = id;
            el.style.cssText =
                'position:relative;display:inline-flex;align-items:center;gap:5px;margin-right:10px;' +
                'background:#dc3545;color:#fff;border-radius:20px;padding:4px 12px;' +
                'font-size:.78rem;font-weight:700;white-space:nowrap;cursor:pointer;' +
                'box-shadow:0 2px 8px rgba(220,53,69,.35);';
            el.innerHTML = '<i class="bi bi-bell-fill"></i> Você possui mensagens não lidas!';
            el.title = 'Clique para ver as mensagens';
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                _abrirDropdownMsgsNavbar(el, 'prest', emailPrest);
            });
            var navSpan = document.querySelector('.navbar-logada-info');
            if (navSpan && navSpan.parentNode) navSpan.parentNode.insertBefore(el, navSpan);
        } else if (!hasUnread && el) {
            var dropPrest = document.getElementById('sg-navbar-bell-drop-prest');
            if (dropPrest) dropPrest.remove();
            el.remove();
        }
    }

    /** Exibe ou remove o sininho vermelho na navbar do cliente */
    function _atualizarAvisoNavbarMsgsCliente(emailCli) {
        var id = 'sg-navbar-bell-cli';
        var hasUnread = _contarMsgsNaoLidasCliente(emailCli) > 0;
        var el = document.getElementById(id);
        if (hasUnread && !el) {
            el = document.createElement('span');
            el.id = id;
            el.style.cssText =
                'position:relative;display:inline-flex;align-items:center;gap:5px;margin-right:10px;' +
                'background:#dc3545;color:#fff;border-radius:20px;padding:4px 12px;' +
                'font-size:.78rem;font-weight:700;white-space:nowrap;cursor:pointer;' +
                'box-shadow:0 2px 8px rgba(220,53,69,.35);';
            el.innerHTML = '<i class="bi bi-bell-fill"></i> Você possui mensagens não lidas!';
            el.title = 'Clique para ver as mensagens';
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                _abrirDropdownMsgsNavbar(el, 'cli', emailCli);
            });
            var navSpan = document.querySelector('.navbar-logada-info');
            if (navSpan && navSpan.parentNode) navSpan.parentNode.insertBefore(el, navSpan);
        } else if (!hasUnread && el) {
            var dropCli = document.getElementById('sg-navbar-bell-drop-cli');
            if (dropCli) dropCli.remove();
            el.remove();
        }
    }

    /**
     * Sprint 2 — Dropdown unificado do sininho da navbar.
     * Cobre TANTO mensagens de chat livre QUANTO eventos de agendamento/proposta:
     *
     * Para o PRESTADOR (tipo='prest'):
     *   — nova solicitação de agendamento (orcamento_solicitado / agendamento)
     *   — confirmação de proposta pelo cliente (orcamento_aceito)
     *   — rejeição de proposta pelo cliente (orcamento_recusado)
     *   — mensagens de chat livre não lidas
     *
     * Para o CLIENTE (tipo='cli'):
     *   — orçamento/proposta recebida do prestador (orcamento_enviado) ← tb reenvios
     *   — confirmação do agendamento pelo prestador (confirmacao)
     *   — cancelamento pelo prestador (cancelamento)
     *   — conclusão de serviço (conclusao)
     *   — mensagens de chat livre não lidas
     *
     * @param {HTMLElement} bellEl  — elemento do sininho (âncora do dropdown)
     * @param {'prest'|'cli'} tipo  — tipo de usuário
     * @param {string} email        — e-mail do usuário logado
     */
    function _abrirDropdownMsgsNavbar(bellEl, tipo, email) {
        var dropId = 'sg-navbar-bell-drop-' + tipo;

        // Toggle: fecha se já aberto
        var existente = document.getElementById(dropId);
        if (existente) { existente.remove(); return; }

        // ── Helpers de rótulo/ícone/cor por tipo de evento ─────────────────
        function _rotuloEvento(tipoNotif) {
            var mapa = {
                'orcamento_solicitado': 'Nova solicitação de agendamento',
                'agendamento':          'Nova solicitação de agendamento',
                'orcamento_aceito':     'Proposta aceita pelo cliente',
                'orcamento_recusado':   'Proposta recusada pelo cliente',
                'orcamento_enviado':    'Orçamento / Proposta recebida',
                'confirmacao':          'Agendamento confirmado pelo prestador',
                'cancelamento':         'Agendamento cancelado pelo prestador',
                'conclusao':            'Serviço concluído'
            };
            return mapa[tipoNotif] || 'Notificação';
        }
        function _iconeEvento(tipoNotif) {
            if (tipoNotif === 'orcamento_solicitado' || tipoNotif === 'agendamento') return 'bi-calendar-plus';
            if (tipoNotif === 'orcamento_aceito' || tipoNotif === 'confirmacao')     return 'bi-check-circle-fill';
            if (tipoNotif === 'orcamento_recusado' || tipoNotif === 'cancelamento')  return 'bi-x-circle-fill';
            if (tipoNotif === 'orcamento_enviado')                                   return 'bi-file-earmark-text-fill';
            if (tipoNotif === 'conclusao')                                           return 'bi-star-fill';
            return 'bi-bell-fill';
        }
        function _corEvento(tipoNotif) {
            if (tipoNotif === 'orcamento_aceito' || tipoNotif === 'confirmacao' || tipoNotif === 'conclusao') return '#198754';
            if (tipoNotif === 'orcamento_recusado' || tipoNotif === 'cancelamento')                          return '#dc3545';
            if (tipoNotif === 'orcamento_enviado')                                                           return '#146ADB';
            return '#e6a800';
        }

        // ── Coleta todos os itens pendentes ────────────────────────────────
        var itens = [];

        if (tipo === 'prest') {
            // — Chat livre não lido —
            obterAgendamentosPrestador(email).forEach(function (ag) {
                var chat = DB.get('agendaChat_' + ag.id) || [];
                var naoLidas = chat.filter(function (m) { return m.tipo === 'cliente' && !m.lidaPrest; });
                if (naoLidas.length > 0) {
                    itens.push({
                        tipo: 'chat', agId: ag.id,
                        remetente: ag.cliente || 'Cliente',
                        servico:   ag.servico || '—',
                        data:      ag.data    || '—',
                        qtd:       naoLidas.length,
                        ag:        ag
                    });
                }
            });
            // — Eventos de agendamento/proposta não lidos —
            var tiposEventoPrest = ['orcamento_solicitado', 'agendamento', 'orcamento_aceito', 'orcamento_recusado'];
            sgObterNotificacoes(email).filter(function (n) {
                return !n.lida && tiposEventoPrest.indexOf(n.tipo) >= 0;
            }).forEach(function (n) {
                var d = n.dados || {};
                itens.push({
                    tipo: 'evento', tipoNotif: n.tipo, notifId: n.id,
                    remetente: d.clienteNome || 'Cliente',
                    servico:   d.servico     || '—',
                    data:      d.data        || (d.label ? d.label.split(' ')[0] : '—'),
                    qtd:       1,
                    agId:      d.agendamentoId || ''
                });
            });

        } else {
            // — Chat livre não lido —
            (DB.get('clienteAgendamentos_' + email) || []).forEach(function (ag) {
                var chat = DB.get('agendaChat_' + ag.id) || [];
                var naoLidas = chat.filter(function (m) { return m.tipo === 'prest' && !m.lidaCliente; });
                if (naoLidas.length > 0) {
                    itens.push({
                        tipo: 'chat', agId: ag.id,
                        remetente:      ag.nomePrestador  || 'Prestador',
                        servico:        ag.servico        || '—',
                        data:           ag.data           || '—',
                        qtd:            naoLidas.length,
                        emailPrestador: ag.emailPrestador || '',
                        nomePrestador:  ag.nomePrestador  || ''
                    });
                }
            });
            // — Eventos de proposta/confirmação/cancelamento não lidos —
            var tiposEventoCli = ['orcamento_enviado', 'confirmacao', 'cancelamento', 'conclusao'];
            sgObterNotificacoes(email).filter(function (n) {
                return !n.lida && tiposEventoCli.indexOf(n.tipo) >= 0;
            }).forEach(function (n) {
                var d = n.dados || {};
                var cliAgs = DB.get('clienteAgendamentos_' + email) || [];
                var ag = cliAgs.find(function (a) { return a.id === d.agendamentoId; }) || {};
                itens.push({
                    tipo: 'evento', tipoNotif: n.tipo, notifId: n.id,
                    remetente:      d.prestadorNome  || ag.nomePrestador  || 'Prestador',
                    servico:        d.servico        || ag.servico        || '—',
                    data:           d.data           || ag.data           || '—',
                    qtd:            1,
                    agId:           d.agendamentoId  || ag.id             || '',
                    emailPrestador: d.prestadorEmail || ag.emailPrestador || '',
                    nomePrestador:  d.prestadorNome  || ag.nomePrestador  || ''
                });
            });
        }

        if (itens.length === 0) return;

        var total = itens.reduce(function (t, c) { return t + c.qtd; }, 0);

        // ── Monta o dropdown ────────────────────────────────────────────────
        var drop = document.createElement('div');
        drop.id = dropId;
        drop.style.cssText =
            'position:absolute;top:calc(100% + 8px);right:0;min-width:295px;max-width:370px;' +
            'background:#fff;border:1.5px solid #dee2e6;border-radius:10px;' +
            'box-shadow:0 6px 24px rgba(0,0,0,.16);z-index:2100;overflow:hidden;' +
            'max-height:440px;display:flex;flex-direction:column;';

        // Cabeçalho fixo
        var header = document.createElement('div');
        header.style.cssText =
            'padding:10px 14px;background:#dc3545;color:#fff;font-size:.82rem;' +
            'font-weight:700;display:flex;align-items:center;gap:7px;flex-shrink:0;';
        header.innerHTML =
            '<i class="bi bi-bell-fill"></i> ' +
            total + ' aviso' + (total !== 1 ? 's' : '') + ' não lido' + (total !== 1 ? 's' : '');
        drop.appendChild(header);

        // Área rolável dos itens
        var listaDiv = document.createElement('div');
        listaDiv.style.cssText = 'overflow-y:auto;flex:1;';
        drop.appendChild(listaDiv);

        itens.forEach(function (conv) {
            var item = document.createElement('div');
            item.style.cssText =
                'padding:10px 14px;border-bottom:1px solid #f0f4ff;cursor:pointer;' +
                'display:flex;flex-direction:column;gap:4px;transition:background .15s;';

            var icone, corIcone, rotulo, badge;
            if (conv.tipo === 'chat') {
                icone    = 'bi-chat-dots-fill';
                corIcone = '#146ADB';
                rotulo   = 'Mensagem de ' + _escaparHtml(conv.remetente);
                badge    = String(conv.qtd);
            } else {
                icone    = _iconeEvento(conv.tipoNotif);
                corIcone = _corEvento(conv.tipoNotif);
                rotulo   = _rotuloEvento(conv.tipoNotif);
                badge    = '!';
            }

            item.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:space-between;">' +
                    '<span style="font-weight:700;font-size:.85rem;color:#212529;' +
                        'display:flex;align-items:center;gap:6px;flex:1;min-width:0;">' +
                        '<i class="bi ' + icone + '" style="color:' + corIcone + ';flex-shrink:0;"></i>' +
                        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                            rotulo +
                        '</span>' +
                    '</span>' +
                    '<span style="background:' + corIcone + ';color:#fff;border-radius:12px;' +
                        'padding:1px 8px;font-size:.72rem;font-weight:700;flex-shrink:0;margin-left:6px;">' +
                        badge +
                    '</span>' +
                '</div>' +
                '<small style="color:#6c757d;font-size:.75rem;">' +
                    '<i class="bi bi-tools me-1"></i>' + _escaparHtml(conv.servico) +
                    (conv.data && conv.data !== '—'
                        ? ' &nbsp;·&nbsp; <i class="bi bi-calendar3 me-1"></i>' + _escaparHtml(conv.data)
                        : '') +
                '</small>';

            item.addEventListener('mouseover', function () { item.style.background = '#f0f4ff'; });
            item.addEventListener('mouseout',  function () { item.style.background = ''; });

            item.addEventListener('click', function (e) {
                e.stopPropagation();
                drop.remove();

                if (conv.tipo === 'chat') {
                    // Abre modal de chat livre
                    if (tipo === 'prest') {
                        _abrirChatPrestador(conv.ag, email);
                        setTimeout(function () { _atualizarAvisoNavbarMsgsPrestador(email); }, 800);
                    } else {
                        _abrirChatCliente(
                            conv.agId, conv.emailPrestador, conv.nomePrestador,
                            conv.servico, conv.data, email
                        );
                        setTimeout(function () { _atualizarAvisoNavbarMsgsCliente(email); }, 800);
                    }
                } else {
                    // Marca a notificação de evento como lida e navega para a tela correta
                    sgMarcarNotifLidaPorId(email, conv.notifId);
                    if (tipo === 'prest') {
                        var url = '/paginasPrestador/prestadorServicosAgendados.html?aba=pendentes';
                        if (conv.agId) url += '&agId=' + encodeURIComponent(conv.agId);
                        window.location.href = url;
                    } else {
                        window.location.href = '/paginasCliente/clienteAreaExclusiva.html';
                    }
                    setTimeout(function () {
                        if (tipo === 'prest') _atualizarAvisoNavbarMsgsPrestador(email);
                        else _atualizarAvisoNavbarMsgsCliente(email);
                    }, 400);
                }
            });

            listaDiv.appendChild(item);
        });

        // Rodapé fixo
        var rodape = document.createElement('div');
        rodape.style.cssText =
            'padding:7px 14px;background:#f8f9fa;font-size:.75rem;' +
            'color:#6c757d;text-align:center;border-top:1px solid #dee2e6;flex-shrink:0;';
        rodape.textContent =
            itens.length + ' aviso' + (itens.length !== 1 ? 's' : '') +
            ' pendente' + (itens.length !== 1 ? 's' : '');
        drop.appendChild(rodape);

        bellEl.appendChild(drop);

        // Fecha ao clicar fora
        setTimeout(function () {
            function _fecharFora(e) {
                if (!bellEl.contains(e.target)) {
                    drop.remove();
                    document.removeEventListener('click', _fecharFora);
                }
            }
            document.addEventListener('click', _fecharFora);
        }, 0);
    }


    // =========================================================
    // SPRINT 2 — Polling cliente: sininho + barra de notificações
    // Atualiza o sininho da navbar sempre que houver notificações
    // não lidas (chat livre OU eventos de proposta/agendamento).
    // =========================================================
    function _iniciarPollingNotifCliente() {
        var usu = obterUsuarioLogado();
        if (!usu) return;
        var emailCli = usu.email;
        setInterval(function () {
            // Sempre atualiza o sininho (cobre chat + eventos de proposta)
            _atualizarAvisoNavbarMsgsCliente(emailCli);
            // Re-exibe barra inline se houver notifs não lidas ainda não exibidas
            var barra = document.getElementById('sg-notif-barra-cli');
            if (barra) return;
            var notifs = sgObterNotificacoes(emailCli).filter(function (n) { return !n.lida; });
            if (notifs.length === 0) return;
            inicializarNotificacoesDashboardCliente();
        }, 8000);
    }

    // =========================================================
    // SPRINT 5 — SEMEIO DE PRESTADORES INICIAIS
    // Popula hotsitePrestadorDados, usuariosCadastrados e
    // avaliacoesRecebidasPrestador com dados realistas para que
    // o catálogo em agendarServicos.html exiba cards imediatamente.
    // Executado uma única vez (flag 'sg_seed_v1').
    // Emails usam domínio @servgo.app — nunca removidos pelo
    // sgLimparDadosDemo (que limpa apenas @servgo.com).
    // =========================================================
    function sgSemearPrestadoresIniciais() {
        var FLAG = 'sg_seed_v1';
        if (localStorage.getItem(FLAG) === '1') return;

        var PRESTADORES = [

            /* ── SAÚDE ─────────────────────────────────────── */
            {
                email: 'dra.marina.costa@servgo.app',
                nome: 'Dra. Marina Costa',
                categoria: 'Saúde',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99801-2234',
                endereco: 'Av. Manoel Goulart, 850 – Centro',
                cnpj: '12.345.678/0001-90',
                descricao: 'Médica clínica geral e medicina preventiva. Consultas, check-up e orientação nutricional integrada. Atendimento humanizado e horários flexíveis.',
                subcategorias: ['Clínica Geral', 'Check-up', 'Medicina Preventiva'],
                formasPagamento: ['PIX', 'Cartão', 'Boleto'],
                avaliacoes: [
                    { id: 'av-mc-1', cliente: 'Fernanda Rocha', servico: 'Clínica Geral', nota: 5, comentario: 'Atendimento excelente, muito atenciosa e cuidadosa. Super recomendo!', data: '10/04/2026' },
                    { id: 'av-mc-2', cliente: 'Roberto Alves', servico: 'Check-up', nota: 5, comentario: 'Profissional incrível, explica tudo com clareza e segurança.', data: '02/04/2026' },
                    { id: 'av-mc-3', cliente: 'Tânia Mendes', servico: 'Medicina Preventiva', nota: 4, comentario: 'Ótima consulta, me sentiu muito bem orientada.', data: '25/03/2026' }
                ]
            },
            {
                email: 'dr.lucas.nutri@servgo.app',
                nome: 'Dr. Lucas Santos',
                categoria: 'Saúde',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99712-5566',
                endereco: 'Rua Tenente Nicolau Maffei, 230 – Jardim Bongiovani',
                cnpj: '98.765.432/0001-11',
                descricao: 'Nutricionista clínico e esportivo. Planos alimentares personalizados para emagrecimento, hipertrofia e qualidade de vida. Atendimento presencial e online.',
                subcategorias: ['Nutrição Clínica', 'Nutrição Esportiva', 'Emagrecimento'],
                formasPagamento: ['PIX', 'Cartão', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-ls-1', cliente: 'Camila Ferreira', servico: 'Nutrição Esportiva', nota: 5, comentario: 'Mudou minha relação com a alimentação. Resultado incrível!', data: '08/04/2026' },
                    { id: 'av-ls-2', cliente: 'Paulo Henrique', servico: 'Emagrecimento', nota: 4, comentario: 'Plano bem estruturado e acompanhamento constante.', data: '30/03/2026' }
                ]
            },

            /* ── BELEZA ─────────────────────────────────────── */
            {
                email: 'studio.bella.pp@servgo.app',
                nome: 'Studio Bella',
                categoria: 'Beleza',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 98834-7701',
                endereco: 'Rua Coronel José Soares Marcondes, 430 – Centro',
                cnpj: '55.123.789/0001-44',
                descricao: 'Salão completo de beleza. Cortes femininos e masculinos, coloração, mechas, tratamentos capilares, escova progressiva e maquiagem para eventos.',
                subcategorias: ['Corte', 'Coloração', 'Mechas', 'Escova Progressiva', 'Maquiagem'],
                formasPagamento: ['PIX', 'Cartão', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-sb-1', cliente: 'Juliana Campos', servico: 'Coloração', nota: 5, comentario: 'Adorei o resultado! Melhor salão que já fui em Prudente.', data: '12/04/2026' },
                    { id: 'av-sb-2', cliente: 'Mariana Lopes', servico: 'Escova Progressiva', nota: 5, comentario: 'Meu cabelo ficou lindo e durou muito. Nota 10!', data: '05/04/2026' },
                    { id: 'av-sb-3', cliente: 'Ana Paula', servico: 'Corte', nota: 4, comentario: 'Profissionais ótimas, ambiente aconchegante.', data: '28/03/2026' }
                ]
            },
            {
                email: 'nail.carla.studio@servgo.app',
                nome: 'Carla Nail Studio',
                categoria: 'Beleza',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99203-8812',
                endereco: 'Rua Siqueira Campos, 210 – Jardim América',
                cnpj: '',
                descricao: 'Especialista em nail art, gel, acrílico, alongamento e cuidados com as unhas. Atendimento personalizado, produtos premium e higiene impecável.',
                subcategorias: ['Nail Art', 'Gel e Acrílico', 'Alongamento', 'Manicure', 'Pedicure'],
                formasPagamento: ['PIX', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-cn-1', cliente: 'Beatriz Lima', servico: 'Nail Art', nota: 5, comentario: 'Trabalho impecável! Minhas unhas ficaram perfeitas para o casamento.', data: '09/04/2026' },
                    { id: 'av-cn-2', cliente: 'Gisele Prado', servico: 'Gel e Acrílico', nota: 5, comentario: 'Durou semanas sem lascar. Super recomendo!', data: '01/04/2026' }
                ]
            },

            /* ── MANUTENÇÃO PREDIAL ─────────────────────────── */
            {
                email: 'mario.eletrica.pp@servgo.app',
                nome: 'Mário Elétrica',
                categoria: 'Manutenção Predial',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99100-4423',
                endereco: 'Rua das Flores, 100 – Jardim Eldorado',
                cnpj: '77.654.321/0001-88',
                descricao: 'Eletricista residencial e comercial. Instalações, reparos, quadros de distribuição, tomadas, iluminação e laudos técnicos. Atendimento emergencial 24h.',
                subcategorias: ['Instalações Elétricas', 'Reparos', 'Quadro de Distribuição', 'Iluminação', 'Laudo Técnico'],
                formasPagamento: ['PIX', 'Cartão', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-me-1', cliente: 'Carlos Oliveira', servico: 'Instalações Elétricas', nota: 5, comentario: 'Rápido, eficiente e preço justo. Resolveu tudo em menos de 2 horas.', data: '11/04/2026' },
                    { id: 'av-me-2', cliente: 'Sandra Vieira', servico: 'Reparos', nota: 4, comentario: 'Profissional sério e competente. Recomendo sem dúvida.', data: '03/04/2026' }
                ]
            },
            {
                email: 'jose.hidraulica.pp@servgo.app',
                nome: 'José Hidráulica & Reformas',
                categoria: 'Manutenção Predial',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 98760-3311',
                endereco: 'Rua Paes de Barros, 77 – Vila Nova',
                cnpj: '',
                descricao: 'Encanador e reformista com 15 anos de experiência. Vazamentos, desentupimentos, instalação de torneiras, aquecedores, caixas d\'água e pequenas reformas.',
                subcategorias: ['Vazamentos', 'Desentupimento', 'Aquecedor', 'Caixa d\'água', 'Reformas'],
                formasPagamento: ['PIX', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-jh-1', cliente: 'Rogério Costa', servico: 'Vazamentos', nota: 5, comentario: 'Chegou rápido e resolveu o problema que outros não conseguiram. Excelente!', data: '07/04/2026' },
                    { id: 'av-jh-2', cliente: 'Vera Lúcia', servico: 'Desentupimento', nota: 5, comentario: 'Serviço limpo, rápido e sem sujeira. Voltarei sempre.', data: '29/03/2026' }
                ]
            },

            /* ── TI ─────────────────────────────────────────── */
            {
                email: 'rafael.suportetech@servgo.app',
                nome: 'Rafael Tech Suporte',
                categoria: 'TI',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99456-1122',
                endereco: 'Atendimento Remoto e Presencial – PP e Região',
                cnpj: '44.987.123/0001-55',
                descricao: 'Suporte técnico para empresas e pessoas físicas. Formatação, remoção de vírus, redes Wi-Fi, backup, configuração de sistemas e home office. Atendimento remoto imediato.',
                subcategorias: ['Formatação', 'Redes Wi-Fi', 'Remoção de Vírus', 'Backup', 'Home Office'],
                formasPagamento: ['PIX', 'Cartão'],
                avaliacoes: [
                    { id: 'av-rt-1', cliente: 'Fábio Mendonça', servico: 'Redes Wi-Fi', nota: 5, comentario: 'Resolveu o problema da minha rede em 20 minutos remotamente. Incrível!', data: '10/04/2026' },
                    { id: 'av-rt-2', cliente: 'Luisa Trindade', servico: 'Formatação', nota: 4, comentario: 'Atendeu rápido e entregou o computador como novo.', data: '04/04/2026' }
                ]
            },
            {
                email: 'ana.dev.solutions@servgo.app',
                nome: 'Ana Dev Solutions',
                categoria: 'TI',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 98891-6677',
                endereco: 'Atendimento 100% Remoto',
                cnpj: '33.112.456/0001-22',
                descricao: 'Desenvolvedora web e mobile freelancer. Criação de sites institucionais, lojas virtuais, landing pages, sistemas web sob medida e APIs. Entrega com qualidade e prazo.',
                subcategorias: ['Sites Institucionais', 'E-commerce', 'Landing Page', 'Sistemas Web', 'APIs'],
                formasPagamento: ['PIX', 'Transferência', 'Boleto'],
                avaliacoes: [
                    { id: 'av-ad-1', cliente: 'Ricardo Barros', servico: 'Sites Institucionais', nota: 5, comentario: 'Site entregue no prazo, lindo e totalmente responsivo. Super profissional!', data: '06/04/2026' },
                    { id: 'av-ad-2', cliente: 'Empresa Atacado SP', servico: 'E-commerce', nota: 5, comentario: 'Desenvolveu nossa loja virtual do zero. Excelente trabalho!', data: '22/03/2026' }
                ]
            },

            /* ── LAZER ──────────────────────────────────────── */
            {
                email: 'carlos.eventos.pp@servgo.app',
                nome: 'Carlos Eventos & Animação',
                categoria: 'Lazer',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99321-8890',
                endereco: 'Rua Projetada, 45 – Jardim Universitário',
                cnpj: '66.234.891/0001-37',
                descricao: 'Animação de festas infantis, corporativas e sociais. DJ, karaokê, iluminação, som, decoração temática e recreação infantil. Mais de 500 eventos realizados.',
                subcategorias: ['Festa Infantil', 'Eventos Corporativos', 'DJ', 'Karaokê', 'Decoração'],
                formasPagamento: ['PIX', 'Cartão', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-ce-1', cliente: 'Patrícia Souza', servico: 'Festa Infantil', nota: 5, comentario: 'A festa da minha filha foi um sucesso total! Crianças adoraram.', data: '13/04/2026' },
                    { id: 'av-ce-2', cliente: 'Empresa ABC', servico: 'Eventos Corporativos', nota: 5, comentario: 'Profissionalismo impecável no nosso evento de confraternização.', data: '01/04/2026' }
                ]
            },

            /* ── ALIMENTAÇÃO ────────────────────────────────── */
            {
                email: 'chef.patricia.gastronomia@servgo.app',
                nome: 'Chef Patrícia Gastronomia',
                categoria: 'Alimentação',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99600-5544',
                endereco: 'Atende na Residência do Cliente – Grande PP',
                cnpj: '88.456.012/0001-60',
                descricao: 'Chef particular para jantares especiais, festas e eventos gastronômicos. Cardápios personalizados, desde o casual ao sofisticado. Catering para empresas e casamentos.',
                subcategorias: ['Jantar Especial', 'Catering', 'Buffet', 'Cardápio Personalizado'],
                formasPagamento: ['PIX', 'Cartão'],
                avaliacoes: [
                    { id: 'av-cp-1', cliente: 'Henrique Duarte', servico: 'Jantar Especial', nota: 5, comentario: 'Preparou um jantar incrível para o aniversário da minha esposa. Perfeito!', data: '12/04/2026' },
                    { id: 'av-cp-2', cliente: 'Empresa Delta', servico: 'Catering', nota: 5, comentario: 'Almoço executivo impecável para 40 pessoas. Super recomendo!', data: '05/04/2026' }
                ]
            },
            {
                email: 'sabor.cia.delivery@servgo.app',
                nome: 'Sabor & Cia',
                categoria: 'Alimentação',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 98700-2200',
                endereco: 'Rua Quinze de Novembro, 520 – Centro',
                cnpj: '21.098.765/0001-43',
                descricao: 'Marmitas fitness, quentinhas e refeições saudáveis com entrega. Cardápio semanal variado, sem conservantes. Ideal para quem busca praticidade e saúde na alimentação.',
                subcategorias: ['Marmita Fitness', 'Quentinha', 'Dieta', 'Sem Glúten', 'Vegano'],
                formasPagamento: ['PIX', 'Cartão', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-sc-1', cliente: 'Aline Rezende', servico: 'Marmita Fitness', nota: 5, comentario: 'Comida deliciosa e saudável. Assino o plano semanal há 3 meses!', data: '09/04/2026' },
                    { id: 'av-sc-2', cliente: 'Marcos Neto', servico: 'Quentinha', nota: 4, comentario: 'Boa comida caseira com entrega pontual. Vale muito!', data: '31/03/2026' }
                ]
            },

            /* ── DESIGN ─────────────────────────────────────── */
            {
                email: 'bia.design.studio@servgo.app',
                nome: 'Bia Design Studio',
                categoria: 'Design',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99510-7733',
                endereco: 'Atendimento Remoto e Presencial',
                cnpj: '50.321.678/0001-15',
                descricao: 'Criação de identidade visual, logotipos, social media, material gráfico para impressão e digital. Design estratégico que comunica sua marca com clareza e impacto.',
                subcategorias: ['Logo e Identidade Visual', 'Social Media', 'Material Gráfico', 'Branding'],
                formasPagamento: ['PIX', 'Cartão'],
                avaliacoes: [
                    { id: 'av-bd-1', cliente: 'Loja Moda & Estilo', servico: 'Logo e Identidade Visual', nota: 5, comentario: 'Criou a identidade da minha loja e ficou perfeita! Muito talentosa.', data: '11/04/2026' },
                    { id: 'av-bd-2', cliente: 'Restaurante Sabores', servico: 'Social Media', nota: 5, comentario: 'Nosso Instagram cresceu muito depois do trabalho dela. Incrível!', data: '03/04/2026' }
                ]
            },

            /* ── SEGURANÇA ──────────────────────────────────── */
            {
                email: 'securemax.pp@servgo.app',
                nome: 'SecureMax Segurança',
                categoria: 'Segurança',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99200-1144',
                endereco: 'Av. Brasil, 1200 – Jardim Aviação',
                cnpj: '74.891.230/0001-80',
                descricao: 'Instalação de câmeras CFTV, alarmes, cerca elétrica e controle de acesso. Monitoramento 24h para residências e empresas. Orçamento gratuito e visita técnica sem custo.',
                subcategorias: ['Câmeras CFTV', 'Alarmes', 'Cerca Elétrica', 'Controle de Acesso', 'Monitoramento'],
                formasPagamento: ['PIX', 'Cartão', 'Boleto'],
                avaliacoes: [
                    { id: 'av-sm-1', cliente: 'Distribuidora Silva', servico: 'Câmeras CFTV', nota: 5, comentario: 'Instalação rápida e sistema de altíssima qualidade. Empresa top!', data: '10/04/2026' },
                    { id: 'av-sm-2', cliente: 'Condomínio Residencial', servico: 'Controle de Acesso', nota: 4, comentario: 'Profissionais organizados e suporte excelente pós-instalação.', data: '02/04/2026' }
                ]
            },

            /* ── LOGÍSTICA ──────────────────────────────────── */
            {
                email: 'mudafacil.pp@servgo.app',
                nome: 'Muda Fácil Transportes',
                categoria: 'Logística',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99050-6622',
                endereco: 'Rua Voluntários da Pátria, 90 – Vila Independência',
                cnpj: '31.765.432/0001-67',
                descricao: 'Mudanças residenciais e comerciais, transporte de mobiliário e equipamentos, frete executivo e pequenos fretes. Equipe treinada, veículos equipados e seguro de carga incluso.',
                subcategorias: ['Mudança Residencial', 'Mudança Comercial', 'Frete Executivo', 'Pequenos Fretes'],
                formasPagamento: ['PIX', 'Cartão', 'Dinheiro'],
                avaliacoes: [
                    { id: 'av-mf-1', cliente: 'Família Carvalho', servico: 'Mudança Residencial', nota: 5, comentario: 'Equipe cuidadosa, pontuais e sem nenhum arranhão. Excelente!', data: '08/04/2026' },
                    { id: 'av-mf-2', cliente: 'Escritório JK', servico: 'Mudança Comercial', nota: 5, comentario: 'Mudamos nosso escritório em um dia só. Perfeitos!', data: '25/03/2026' }
                ]
            },

            /* ── CONSULTORIA ────────────────────────────────── */
            {
                email: 'rg.consultoria.pp@servgo.app',
                nome: 'RG Consultoria Empresarial',
                categoria: 'Consultoria',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99700-3355',
                endereco: 'Rua Rui Barbosa, 300 – Centro Empresarial',
                cnpj: '60.432.109/0001-28',
                descricao: 'Consultoria em gestão empresarial, financeira e estratégica para pequenas e médias empresas. Planejamento, processos, redução de custos e expansão de negócios. Primeira consulta gratuita.',
                subcategorias: ['Gestão Financeira', 'Planejamento Estratégico', 'Processos', 'RH', 'Marketing'],
                formasPagamento: ['PIX', 'Transferência', 'Boleto'],
                avaliacoes: [
                    { id: 'av-rg-1', cliente: 'Mercado Bom Preço', servico: 'Gestão Financeira', nota: 5, comentario: 'Reduziram nossos custos em 30% em 3 meses. Trabalho sensacional!', data: '07/04/2026' },
                    { id: 'av-rg-2', cliente: 'Indústria Beta', servico: 'Planejamento Estratégico', nota: 5, comentario: 'Profissionais extremamente competentes. Transformaram nossa empresa.', data: '28/03/2026' }
                ]
            },

            /* ── CONSTRUÇÃO ─────────────────────────────────── */
            {
                email: 'construirbem.pp@servgo.app',
                nome: 'ConstruirBem Reformas',
                categoria: 'Construção',
                cidade: 'Presidente Prudente, SP',
                tel: '(18) 99400-8800',
                endereco: 'Rua Major Simplício de Lima, 150 – Jardim Maracanã',
                cnpj: '82.543.210/0001-01',
                descricao: 'Reformas residenciais e comerciais completas. Banheiros, cozinhas, ampliações, pintura, revestimentos e acabamentos. Orçamento gratuito, prazo cumprido e 1 ano de garantia.',
                subcategorias: ['Reforma de Banheiro', 'Reforma de Cozinha', 'Pintura', 'Revestimentos', 'Ampliações'],
                formasPagamento: ['PIX', 'Cartão', 'Boleto'],
                avaliacoes: [
                    { id: 'av-cb-1', cliente: 'Luís Fernando', servico: 'Reforma de Banheiro', nota: 5, comentario: 'Banheiro ficou lindo! Trabalho caprichado, limpo e no prazo combinado.', data: '11/04/2026' },
                    { id: 'av-cb-2', cliente: 'Clínica Saúde Viva', servico: 'Reforma Comercial', nota: 5, comentario: 'Reformaram nossa clínica sem atrapalhar o funcionamento. Perfeitos!', data: '04/04/2026' },
                    { id: 'av-cb-3', cliente: 'Família Torres', servico: 'Pintura', nota: 4, comentario: 'Trabalho muito bem feito, preço justo e equipe educada.', data: '26/03/2026' }
                ]
            }
        ];

        // — Grava no storage ———————————————————————————————————
        var hotsiteStore = DB.get(HOTSITE_KEY) || {};
        var usuarios     = obterUsuariosCadastrados();
        var avStore      = DB.get(AVAL_RECEBIDAS_PREST_KEY) || {};
        var agendaStore  = {};  // configs de agenda por email

        PRESTADORES.forEach(function (p) {
            // Hotsite
            hotsiteStore[p.email] = {
                nome: p.nome, email: p.email, cnpj: p.cnpj || '',
                categoria: p.categoria, cidade: p.cidade,
                descricao: p.descricao, endereco: p.endereco, tel: p.tel,
                foto: '', fotoPerfil: '',
                subcategorias: p.subcategorias || [],
                formasPagamento: p.formasPagamento || ['PIX', 'Cartão', 'Dinheiro']
            };

            // Usuário (permite login como prestador seed)
            if (!usuarios[p.email]) {
                usuarios[p.email] = { nome: p.nome, senha: 'Seed@2026', tipo: 'prestador' };
            }

            // Avaliações recebidas
            if (!avStore[p.email]) {
                avStore[p.email] = (p.avaliacoes || []).map(function (av) {
                    return Object.assign({}, av);
                });
            }

            // Agenda padrão: seg–sex 08:00–18:00, duração 60 min, intervalo 60 min, antecedência 12 h
            var CONF_KEY_AG = 'agendaConfig_' + p.email;
            if (!DB.get(CONF_KEY_AG)) {
                DB.set(CONF_KEY_AG, {
                    segunda:  { ativo: true,  inicio: '08:00', fim: '18:00' },
                    terca:    { ativo: true,  inicio: '08:00', fim: '18:00' },
                    quarta:   { ativo: true,  inicio: '08:00', fim: '18:00' },
                    quinta:   { ativo: true,  inicio: '08:00', fim: '18:00' },
                    sexta:    { ativo: true,  inicio: '08:00', fim: '18:00' },
                    sabado:   { ativo: true,  inicio: '08:00', fim: '13:00' },
                    domingo:  { ativo: false, inicio: '08:00', fim: '12:00' },
                    duracaoServico: 60,
                    intervalo: 60,
                    antecedencia: 12
                });
            }
        });

        DB.set(HOTSITE_KEY, hotsiteStore);
        salvarUsuariosCadastrados(usuarios);
        DB.set(AVAL_RECEBIDAS_PREST_KEY, avStore);

        localStorage.setItem(FLAG, '1');
    }

    // =========================================================
    // LIMPEZA DE DADOS DEMO — garante storage zerado
    // Remove quaisquer chaves gravadas por versões anteriores
    // que continham contas ou agendamentos de demonstração.
    // Executado uma única vez (flag 'sg_demo_limpo_v1').
    // =========================================================
    function sgLimparDadosDemo() {
        var FLAG = 'sg_demo_limpo_v1';
        if (localStorage.getItem(FLAG) === '1') return; // já foi limpo

        var EMAILS_DEMO = [
            'prestador@servgo.com',
            'cliente@servgo.com',
            'admin@servgo.com',
            'saude@servgo.com',
            'beleza@servgo.com'
        ];

        // Remove hotsite entries dos prestadores demo
        var store = DB.get('hotsitePrestadorDados') || {};
        var storeAlterado = false;
        EMAILS_DEMO.forEach(function (e) {
            if (store[e]) { delete store[e]; storeAlterado = true; }
        });
        if (storeAlterado) DB.set('hotsitePrestadorDados', store);

        // Remove usuários demo do cadastro
        var usuarios = obterUsuariosCadastrados();
        var usuAlterado = false;
        EMAILS_DEMO.forEach(function (e) {
            if (usuarios[e]) { delete usuarios[e]; usuAlterado = true; }
        });
        if (usuAlterado) salvarUsuariosCadastrados(usuarios);

        // Remove chaves de agendamentos, avaliações, notificações e chat dos demos
        var prefixos = [
            'agendamentos_',
            'clienteAgendamentos_',
            'avaliacoesFeitas_',
            'avaliacoesRecebidas_',
            'avalFeitasPrest_',
            'avalRecebidasPrest_',
            'sgNotificacoes_',
            'agendaConfig_',
            'perfilCliente_',
            'agendaChat_'
        ];
        var keysParaRemover = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (!k) continue;
            var ehDemo = EMAILS_DEMO.some(function (e) {
                return prefixos.some(function (p) { return k === p + e; });
            });
            // Chave legada de sprint anterior
            if (k === 'prestAgendamentos') ehDemo = true;
            if (ehDemo) keysParaRemover.push(k);
        }
        keysParaRemover.forEach(function (k) { localStorage.removeItem(k); });

        // Limpa sessão de usuário logado que seja demo
        var logado = DB.get('usuarioLogado');
        if (logado && EMAILS_DEMO.indexOf(logado.email) >= 0) {
            DB.remove('usuarioLogado');
        }

        localStorage.setItem(FLAG, '1');
    }

    // =========================================================
    // CATÁLOGO PÚBLICO (agendarServicos.html)
    //
    // Responsabilidades (migradas do script inline da página):
    //   1. Verificar sessão:
    //      - Cliente logado   → redireciona para clienteAgendarServicos.html
    //      - Prestador/Admin  → oculta banner de convidado
    //      - Visitante (guest)→ exibe banner de convidado
    //   2. Renderizar o catálogo de prestadores em modo somente leitura.
    //   3. Aplicar filtros por categoria, incluindo lista fixa de categorias.
    //   4. "Saiba Mais" redireciona para prestadorHotsite.html?email=EMAIL.
    //   5. Não exibir painel de agendamento (apenas visualização pública).
    //
    // Nota: clienteAgendarServicos.html possui seu próprio bloco de
    // inicialização via inicializarAgendarServicos() — não duplicar.
    // =========================================================
    function inicializarCatalogoPublico() {

        var loadingEl = document.getElementById('catalogo-loading');
        if (!loadingEl) return; // página não tem catálogo público

        // Evita duplicação com a página autenticada de agendamento
        if (window.location.pathname.includes('clienteAgendarServicos')) return;

        // ── 1. Verificação de sessão ──────────────────────────
        // Migrado de agendarServicos.html — centraliza o controle aqui.
        try {
            var usu = obterUsuarioLogado();

            if (usu && usu.tipo === 'cliente') {
                // Cliente logado: redireciona para a página autenticada,
                // preservando o parâmetro ?tipo= da URL caso exista.
                var params = new URLSearchParams(window.location.search);
                var tipoParam = params.get('tipo') || '';
                var urlRedir  = '/paginasCliente/clienteAgendarServicos.html';
                if (tipoParam) urlRedir += '?tipo=' + encodeURIComponent(tipoParam);
                window.location.replace(urlRedir);
                return; // interrompe — o redirect irá ocorrer
            }

            var bannerGuest = document.getElementById('banner-guest');

            if (usu && (usu.tipo === 'prestador' || usu.tipo === 'admin')) {
                // Prestador ou Admin: já tem sessão, oculta o banner de convidado
                if (bannerGuest) bannerGuest.style.display = 'none';
            } else {
                // Visitante sem sessão: garante o banner de login visível
                if (bannerGuest) bannerGuest.style.display = '';
            }
        } catch (e) { /* localStorage indisponível — continua em modo guest */ }

        // ── 2. Constantes de visual ───────────────────────────
        // Lista fixa de categorias sempre exibidas nos filtros,
        // mesmo sem prestadores cadastrados naquela categoria ainda.
        var CATS_FIXAS = [
            'Alimentação', 'Beleza', 'Construção', 'Consultoria', 'Design',
            'Lazer', 'Logística', 'Manutenção Predial', 'Saúde', 'Segurança', 'TI'
        ];

        var GRAD = {
            'Saúde':              ['#0ea5e9', '#0369a1'],
            'Beleza':             ['#ec4899', '#be185d'],
            'Manutenção Predial': ['#f59e0b', '#b45309'],
            'TI':                 ['#8b5cf6', '#6d28d9'],
            'Lazer':              ['#7c3aed', '#5b21b6'],
            'Alimentação':        ['#ea580c', '#c2410c'],
            'Design':             ['#0891b2', '#0e7490'],
            'Segurança':          ['#dc2626', '#991b1b'],
            'Logística':          ['#ca8a04', '#a16207'],
            'Consultoria':        ['#475569', '#334155'],
            'Construção':         ['#92400e', '#78350f']
        };
        var ICO = {
            'Saúde':              'bi-heart-pulse-fill',
            'Beleza':             'bi-scissors',
            'Manutenção Predial': 'bi-tools',
            'TI':                 'bi-cpu-fill',
            'Lazer':              'bi-controller',
            'Alimentação':        'bi-basket-fill',
            'Design':             'bi-palette-fill',
            'Segurança':          'bi-shield-fill',
            'Logística':          'bi-truck',
            'Consultoria':        'bi-briefcase-fill',
            'Construção':         'bi-building'
        };

        // ── 3. Helpers internos ───────────────────────────────

        /** Retorna gradiente CSS para uma categoria. */
        function grad(cat) {
            var g = GRAD[cat] || ['#146ADB', '#0d4fa3'];
            return 'linear-gradient(135deg,' + g[0] + ',' + g[1] + ')';
        }

        /** Extrai as iniciais do nome do prestador. */
        function ini(nome) {
            var p = (nome || '').trim().split(/\s+/);
            return p.length >= 2
                ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
                : (p[0] || 'P').slice(0, 2).toUpperCase();
        }

        /** Escapa caracteres HTML para uso em innerHTML. */
        function esc(s) {
            return String(s || '')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        /**
         * Calcula a média e total de avaliações recebidas por um prestador.
         * @param {string} email - E-mail do prestador
         * @returns {{ media: number, total: number }}
         */
        function mediaAval(email) {
            var store = DB.get('avaliacoesRecebidasPrestador') || {};
            var lista = (store[email] || []).filter(function (a) {
                return typeof a.nota === 'number';
            });
            if (!lista.length) return { media: 0, total: 0 };
            return {
                media: lista.reduce(function (s, a) { return s + a.nota; }, 0) / lista.length,
                total: lista.length
            };
        }

        /**
         * Obtém a lista consolidada de prestadores, fundindo duas fontes:
         *   1) hotsitePrestadorDados  — perfis completos (prioridade)
         *   2) usuariosCadastrados    — prestadores sem hotsite preenchido
         * @returns {Array} Lista de objetos de prestadores
         */
        function obterPrestadores() {
            var hotsite  = obterStorePrestadores();
            var usuarios = DB.get('usuariosCadastrados') || {};
            var merged   = {};

            // Fonte 1: dados completos do hotsite
            Object.keys(hotsite).forEach(function (email) {
                var p = hotsite[email];
                if (p && p.nome && p.categoria) {
                    merged[email] = Object.assign({}, p, { email: email });
                }
            });

            // Fonte 2: prestadores sem perfil de hotsite ainda
            Object.keys(usuarios).forEach(function (email) {
                var u = usuarios[email];
                if (u && u.tipo === 'prestador' && !merged[email]) {
                    merged[email] = {
                        email:     email,
                        nome:      u.nome      || email,
                        categoria: u.categoria || 'Outros',
                        descricao: u.descricao || '',
                        tel:       u.tel       || '',
                        cidade:    u.cidade    || '',
                        foto:      u.foto      || u.fotoPerfil || ''
                    };
                }
            });

            return Object.keys(merged)
                .map(function (e) { return merged[e]; })
                .filter(function (p) { return p.nome && p.categoria; });
        }

        /**
         * Agrupa a lista de prestadores por categoria.
         * @param {Array} lista
         * @returns {Object} Mapa { categoria: [prestadores] }
         */
        function agrupar(lista) {
            var g = {};
            lista.forEach(function (p) {
                var c = p.categoria || 'Outros';
                (g[c] = g[c] || []).push(p);
            });
            return g;
        }

        // ── 4. Referências ao DOM ─────────────────────────────
        var secoesEl    = document.getElementById('catalogo-secoes');
        var vazioEl     = document.getElementById('catalogo-vazio');
        var filtrosCont = document.getElementById('filtros-container');
        if (!secoesEl) return;

        var catAtiva = '';

        // Lê categoria pré-selecionada via ?tipo= na URL
        var urlParamsCat = new URLSearchParams(window.location.search);
        var tipoUrl      = urlParamsCat.get('tipo') || '';

        // ── 5. Foto / placeholder do card ─────────────────────

        /** Cria elemento de placeholder com iniciais e ícone de categoria. */
        function mkPlh(prest) {
            var d = document.createElement('div');
            d.className = 'prest-card-foto-placeholder';
            d.style.background = grad(prest.categoria);
            d.innerHTML =
                '<span class="av-ini">' + ini(prest.nome) + '</span>' +
                '<span class="av-ico"><i class="bi ' + (ICO[prest.categoria] || 'bi-person') + '"></i></span>';
            return d;
        }

        /** Cria o elemento de foto do card, com fallback para placeholder. */
        function fotoEl(prest) {
            var wrap = document.createElement('div');
            wrap.className = 'prest-card-foto';
            var foto = prest.fotoPerfil || prest.foto || '';
            if (foto) {
                var img = document.createElement('img');
                img.src = foto;
                img.alt = prest.nome;
                var plh = mkPlh(prest);
                img.onerror = function () { img.style.display = 'none'; plh.style.display = 'flex'; };
                plh.style.display = 'none';
                wrap.appendChild(img);
                wrap.appendChild(plh);
            } else {
                wrap.appendChild(mkPlh(prest));
            }
            // Badge flutuante com o nome da categoria
            var badge = document.createElement('div');
            badge.className = 'prest-card-cat-badge';
            badge.innerHTML =
                '<i class="bi ' + (ICO[prest.categoria] || 'bi-tag') + '"></i>' +
                esc(prest.categoria);
            wrap.appendChild(badge);
            return wrap;
        }

        // ── 6. Criação do card de prestador ───────────────────

        /**
         * Constrói o card completo de um prestador no catálogo público.
         * Clique no card ou em "Saiba Mais" navega para o HotSite do prestador.
         * @param {Object} prest - Dados do prestador
         * @returns {HTMLElement} Elemento do card
         */
        function criarCard(prest) {
            var card = document.createElement('div');
            card.className = 'prest-card';
            card.dataset.email = prest.email;

            // Área da foto
            card.appendChild(fotoEl(prest));

            // Corpo do card
            var corpo = document.createElement('div');
            corpo.className = 'prest-card-corpo';

            // Nome do prestador
            var nomeEl = document.createElement('div');
            nomeEl.className = 'prest-card-nome';
            nomeEl.textContent = prest.nome;
            corpo.appendChild(nomeEl);

            // Estrelas de avaliação (somente se houver avaliações)
            var av = mediaAval(prest.email);
            if (av.total > 0) {
                var rEl = document.createElement('div');
                rEl.className = 'prest-card-rating';
                var st = '';
                for (var i = 1; i <= 5; i++) {
                    st += '<i class="bi ' + (i <= Math.round(av.media) ? 'bi-star-fill' : 'bi-star') + '"></i>';
                }
                rEl.innerHTML = st +
                    '<span class="txt-nota">' + av.media.toFixed(1) + ' (' + av.total + ')</span>';
                corpo.appendChild(rEl);
            }

            // Descrição resumida
            var desc = (prest.descricao || prest.especializacao || '').trim();
            if (desc) {
                var dEl = document.createElement('div');
                dEl.className = 'prest-card-desc';
                dEl.textContent = desc;
                corpo.appendChild(dEl);
            }

            // Informações de contato (somente exibição)
            var ct = document.createElement('div');
            ct.className = 'prest-card-contato';
            if (prest.tel) {
                ct.innerHTML += '<span><i class="bi bi-telephone-fill"></i>' + esc(prest.tel) + '</span>';
            }
            ct.innerHTML += '<span><i class="bi bi-envelope-fill"></i>' + esc(prest.email) + '</span>';
            corpo.appendChild(ct);

            // Ação: "Saiba Mais" → HotSite do prestador (modo somente visualização)
            var ac = document.createElement('div');
            ac.className = 'prest-card-acoes';
            var btnS = document.createElement('button');
            btnS.type = 'button';
            btnS.className = 'btn-card-sel';
            btnS.innerHTML = '<i class="bi bi-info-circle me-1"></i>Saiba Mais';
            ac.appendChild(btnS);
            corpo.appendChild(ac);
            card.appendChild(corpo);

            // Navegação para o HotSite do prestador
            function _irHotsite(e) {
                if (e) e.stopPropagation();
                window.location.href =
                    '/paginasPrestador/prestadorHotsite.html?email=' +
                    encodeURIComponent(prest.email);
            }
            btnS.addEventListener('click', _irHotsite);
            card.addEventListener('click', function () { _irHotsite(); });

            return card;
        }

        // ── 7. Filtros por categoria ──────────────────────────

        /**
         * Renderiza as pílulas de filtro de categoria.
         * Mescla as categorias dos prestadores com a lista fixa CATS_FIXAS,
         * garantindo que todas as categorias padrão apareçam mesmo sem
         * prestadores cadastrados nelas.
         * @param {string[]} cats - Categorias dos prestadores cadastrados
         */
        function renderFiltros(cats) {
            if (!filtrosCont) return;

            // Mescla categorias fixas com quaisquer extras dos prestadores
            var todasCats = CATS_FIXAS.slice();
            cats.forEach(function (c) {
                if (todasCats.indexOf(c) < 0) todasCats.push(c);
            });
            todasCats.sort();

            // Preserva o botão "Todos" que existe no HTML
            var btnTodos = filtrosCont.querySelector('.filtro-pill-todos');
            filtrosCont.innerHTML = '';
            if (btnTodos) filtrosCont.appendChild(btnTodos);

            todasCats.forEach(function (cat) {
                var btn = document.createElement('button');
                btn.className = 'filtro-pill';
                btn.dataset.cat = cat;
                btn.innerHTML = '<i class="bi ' + (ICO[cat] || 'bi-tag-fill') + '"></i> ' + cat;
                filtrosCont.appendChild(btn);
            });

            // Conecta eventos de clique em todos os filtros
            filtrosCont.querySelectorAll('.filtro-pill').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    catAtiva = btn.dataset.cat || '';
                    filtrosCont.querySelectorAll('.filtro-pill').forEach(function (b) {
                        b.classList.remove('ativo');
                    });
                    btn.classList.add('ativo');
                    filtrar(catAtiva);
                });
            });
        }

        /**
         * Exibe ou oculta as seções por categoria conforme o filtro ativo.
         * @param {string} cat - Categoria selecionada (vazio = todas)
         */
        function filtrar(cat) {
            var secoes = secoesEl.querySelectorAll('.catalogo-secao');
            var vis = 0;
            secoes.forEach(function (s) {
                if (!cat || s.dataset.cat === cat) { s.classList.remove('oculta'); vis++; }
                else s.classList.add('oculta');
            });
            if (vazioEl) vazioEl.style.display = vis ? 'none' : 'block';
        }

        // ── 8. Renderização principal do catálogo ─────────────

        /**
         * Popula o DOM com as seções de categoria e os cards de prestadores.
         * @param {Array} lista - Lista de prestadores a exibir
         */
        function renderCatalogo(lista) {
            loadingEl.style.display = 'none';

            // Sempre renderiza os filtros (com as categorias fixas)
            var grupos = lista.length ? agrupar(lista) : {};
            var cats   = Object.keys(grupos).sort();
            renderFiltros(cats);

            if (!lista.length) {
                if (vazioEl) vazioEl.style.display = 'block';
                return;
            }

            secoesEl.innerHTML = '';
            cats.forEach(function (cat) {
                var lista2 = grupos[cat];
                var ico    = ICO[cat] || 'bi-tag-fill';

                var secao = document.createElement('div');
                secao.className = 'catalogo-secao';
                secao.dataset.cat = cat;

                var titulo = document.createElement('div');
                titulo.className = 'catalogo-secao-titulo';
                titulo.innerHTML =
                    '<span class="cat-icon"><i class="bi ' + ico + '"></i></span>' +
                    '<span>' + cat + '</span>' +
                    '<span class="badge-count">' + lista2.length +
                    ' prestador' + (lista2.length !== 1 ? 'es' : '') + '</span>';

                var grid = document.createElement('div');
                grid.className = 'catalogo-grid';
                lista2.forEach(function (p) { grid.appendChild(criarCard(p)); });

                secao.appendChild(titulo);
                secao.appendChild(grid);
                secoesEl.appendChild(secao);
            });

            // Aplica filtro de categoria pré-selecionado via URL (?tipo=...)
            if (tipoUrl) {
                catAtiva = tipoUrl;
                if (filtrosCont) {
                    filtrosCont.querySelectorAll('.filtro-pill').forEach(function (b) {
                        b.classList.remove('ativo');
                    });
                    var btnAtivo = filtrosCont.querySelector('.filtro-pill[data-cat="' + tipoUrl + '"]');
                    if (btnAtivo) btnAtivo.classList.add('ativo');
                }
                filtrar(tipoUrl);
            }
        }

        // ── 9. Executa a renderização ─────────────────────────
        var lista = obterPrestadores();
        if (!lista.length) {
            // Aguarda possível escrita assíncrona no localStorage (ex.: seed)
            setTimeout(function () {
                renderCatalogo(obterPrestadores());
            }, 400);
        } else {
            renderCatalogo(lista);
        }
    }

    // =========================================================
    // SPRINT 1 — NOTÍCIAS DINÂMICAS NA HOME (index.html)
    // Lê sgNoticias do localStorage, filtra publicadas, ordena
    // da mais recente para a mais antiga e renderiza até 24 cards.
    // Um botão "Carregar Matérias Mais Antigas" pagina as demais.
    // Cada card abre um modal de leitura (somente leitura).
    // =========================================================
    function inicializarNoticiasIndexHome() {
        var grid = document.getElementById('noticias-grid');
        if (!grid) return; // não está na index

        var LIMITE_POR_PAGINA = 24;
        var paginaAtual       = 0;
        var noticiasPublicadas = [];

        /* ── helpers locais ─────────────────────────────── */
        function _escN(s) {
            return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
        function _fmtDataN(iso) {
            if (!iso) return '';
            try { return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}); }
            catch(e) { return iso; }
        }
        function _calcLeitura(texto) {
            var palavras = (texto || '').split(/\s+/).filter(Boolean).length;
            return Math.max(1, Math.round(palavras / 200)) + ' min de leitura';
        }

        /* ── modal de leitura ───────────────────────────── */
        function _abrirModalMateria(n) {
            var modalEl = document.getElementById('modalVerMateria');
            if (!modalEl) return;
            var tituloEl = document.getElementById('modal-materia-titulo');
            var corpoEl  = document.getElementById('modal-materia-corpo');
            if (tituloEl) tituloEl.innerHTML = '<i class="bi bi-newspaper me-2"></i>' + _escN(n.titulo);
            if (corpoEl) {
                var imgHtml = n.imagemUrl
                    ? '<img src="' + _escN(n.imagemUrl) + '" class="img-fluid rounded mb-3 w-100" alt="' + _escN(n.titulo) + '" onerror="this.style.display=\'none\'">'
                    : '';
                corpoEl.innerHTML =
                    imgHtml +
                    '<div class="mb-2">' +
                        '<span class="badge bg-primary me-2">' + _escN(n.categoria || 'Geral') + '</span>' +
                        (n.destaque ? '<span class="badge" style="background:#fffbeb;color:#b45309;border:1px solid #fcd34d;"><i class="bi bi-star-fill text-warning me-1"></i>Destaque</span>' : '') +
                    '</div>' +
                    '<h4 class="fw-bold mb-2">' + _escN(n.titulo) + '</h4>' +
                    '<p class="text-muted small mb-3">' +
                        '<i class="bi bi-person me-1"></i>' + _escN(n.autor || 'Equipe ServGo!') +
                        ' &nbsp;&middot;&nbsp; <i class="bi bi-calendar me-1"></i>' + _fmtDataN(n.dataCriacao) +
                        ' &nbsp;&middot;&nbsp; <i class="bi bi-clock me-1"></i>' + _calcLeitura(n.conteudo) +
                    '</p>' +
                    (n.resumo
                        ? '<p class="lead mb-3" style="font-size:.95rem;color:#444;">' + _escN(n.resumo) + '</p>'
                        : '') +
                    '<div class="border-top pt-3" style="white-space:pre-wrap;line-height:1.75;color:#333;">' +
                        _escN(n.conteudo || '') +
                    '</div>';
            }
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }

        /* ── renderiza fatia de cards no grid ───────────── */
        function _renderCards(inicio, fim) {
            var frag = document.createDocumentFragment();
            noticiasPublicadas.slice(inicio, fim).forEach(function(n) {
                var col     = document.createElement('div');
                col.className = 'col-lg-4 col-md-6';
                var imgSrc  = n.imagemUrl || 'placeholder_card.png';
                col.innerHTML =
                    '<div class="card h-100 shadow-sm">' +
                        '<img src="' + _escN(imgSrc) + '" class="card-img-top" alt="' + _escN(n.titulo) + '" ' +
                            'onerror="this.src=\'placeholder_card.png\'">' +
                        '<div class="card-body">' +
                            '<span class="badge bg-primary">' + _escN(n.categoria || 'Geral') + '</span>' +
                            (n.destaque ? ' <span class="badge bg-warning text-dark"><i class="bi bi-star-fill"></i></span>' : '') +
                            '<h5 class="card-title mt-2">' + _escN(n.titulo) + '</h5>' +
                            '<p class="card-text small text-muted">' +
                                '<i class="bi bi-clock"></i> ' + _calcLeitura(n.conteudo) +
                            '</p>' +
                            '<button class="btn btn-sm btn-outline-secondary btn-ler-materia" ' +
                                'data-noticia-id="' + _escN(n.id) + '">Ler</button>' +
                        '</div>' +
                    '</div>';
                frag.appendChild(col);
            });
            grid.appendChild(frag);
            // Bind nos novos botões "Ler"
            grid.querySelectorAll('.btn-ler-materia:not([data-bound])').forEach(function(btn) {
                btn.dataset.bound = '1';
                btn.addEventListener('click', function() {
                    var id = btn.dataset.noticiaId;
                    var n  = noticiasPublicadas.find(function(x) { return x.id === id; });
                    if (n) _abrirModalMateria(n);
                });
            });
        }

        /* ── atualiza / remove o botão "carregar mais" ── */
        function _atualizarBotaoMais() {
            var cont = document.getElementById('noticias-carregar-mais-container');
            if (!cont) return;
            var totalMostradas = (paginaAtual + 1) * LIMITE_POR_PAGINA;
            if (totalMostradas < noticiasPublicadas.length) {
                cont.innerHTML =
                    '<button class="btn btn-outline-dark px-4 py-2 rounded-pill" id="btn-carregar-mais-noticias">' +
                        '<i class="bi bi-clock-history me-2"></i>Carregar Matérias Mais Antigas' +
                    '</button>';
                document.getElementById('btn-carregar-mais-noticias').addEventListener('click', function() {
                    paginaAtual++;
                    var ini = paginaAtual * LIMITE_POR_PAGINA;
                    var fim = Math.min(ini + LIMITE_POR_PAGINA, noticiasPublicadas.length);
                    _renderCards(ini, fim);
                    _atualizarBotaoMais();
                });
            } else {
                cont.innerHTML = '';
            }
        }

        /* ── inicialização ────────────────────────────── */
        function _inicializar() {
            var todas = (function() {
                try { return JSON.parse(localStorage.getItem('sgNoticias')) || []; }
                catch(e) { return []; }
            })();

            noticiasPublicadas = todas
                .filter(function(n) { return n.status === 'publicado'; })
                .sort(function(a, b) {
                    return new Date(b.dataCriacao || 0).getTime() -
                           new Date(a.dataCriacao || 0).getTime();
                });

            // Limpa cards estáticos (se restarem)
            grid.innerHTML = '';

            if (noticiasPublicadas.length === 0) {
                grid.innerHTML =
                    '<div class="col-12 text-center text-muted py-5">' +
                        '<i class="bi bi-newspaper" style="font-size:2.5rem;display:block;margin-bottom:12px;color:#ccc;"></i>' +
                        'Nenhuma matéria publicada no momento.' +
                    '</div>';
                return;
            }

            paginaAtual = 0;
            _renderCards(0, Math.min(LIMITE_POR_PAGINA, noticiasPublicadas.length));
            _atualizarBotaoMais();
        }

        // Aguarda possível seed do admin (pode ser chamado logo antes)
        setTimeout(_inicializar, 50);
    }

    // =========================================================
    // INICIALIZAÇÃO GERAL
    // =========================================================
    inicializarGuardPaginasRestritas();     // Sprint 1 — guard de acesso a rotas protegidas
    sgSemearPrestadoresIniciais();          // Sprint 5 — seed de prestadores iniciais (1× por device)
    sgLimparDadosDemo();                    // Sprint 1 — limpa dados demo de versões anteriores
    inicializarNavbarSaudacao();
    inicializarNavbarPrestador();
    inicializarNavbarCliente();         // Sprint 3 — novo
    inicializarHome();
    inicializarIndexHome();             // Sprint 2 — roteamento de categorias (logado/guest)
    inicializarNoticiasIndexHome();     // Sprint 1 — cards dinâmicos de notícias na home
    inicializarBuscaIndexCliente();     // Sprint 1 — busca na home do cliente
    inicializarBuscaIndexPrestador();   // Sprint 1 — busca na home do prestador
    inicializarFormsNewsletter();       // Sprint 2 — formulários de newsletter + descadastro via URL
    inicializarCadastro();
    inicializarLogin();
    inicializarAdminLogin();     // Sprint 4 — login exclusivo para administradores
    inicializarAdminCadastro();  // Sprint 4 — cadastro seguro de administradores
    inicializarClienteAreaExclusiva();
    inicializarClienteConfirmados();    // Sprint 3 — novo
    inicializarPrestadorAreaExclusiva();
    inicializarPrestadorServicosAgendados();
    inicializarAvaliacoesFeitas();       // cliente
    inicializarAvaliacoesRecebidas();    // cliente
    inicializarAvaliacoesFeitasPrestador();
    inicializarAvaliacoesRecebidasPrestador();
    inicializarBotaoVoltar();
    inicializarPerfilCliente();
    inicializarHotsitePrestador();
    // =========================================================
    // MEU PLANO — Página prestadorMeuPlano.html
    // =========================================================
    function inicializarMeuPlano() {
        var mainEl = document.getElementById('sg-meu-plano-main');
        if (!mainEl) return;

        var usu = obterUsuarioLogado();
        if (!usu || usu.tipo !== 'prestador') {
            window.location.href = '/paginasSite/login.html';
            return;
        }

        var email   = usu.email;
        var usuarios = obterUsuariosCadastrados();
        var dadosUsu = usuarios[email] || {};
        var st       = SG_Trial.verificarStatus(email, dadosUsu);
        var planos   = SG_Trial.obterPlanos();

        // ── Renderiza o cabeçalho do status atual ──────────────
        var statusEl = document.getElementById('sg-plano-status-bloco');
        if (statusEl) statusEl.innerHTML = _sgMeuPlanoStatusHtml(dadosUsu, st);

        // ── SPRINT 2 — Ações de ciclo de vida no bloco de status ──────
        var _recarrega = function () { window.location.reload(); };
        var btnVoltarGrat = document.getElementById('sg-mp-voltar-gratuito');
        if (btnVoltarGrat) btnVoltarGrat.addEventListener('click', function () {
            if (!window.SG_Plano) return;
            var e2 = window.SG_Plano.estado(email);
            if (!confirm('Agendar a volta ao Plano Gratuito?\n\nVocê mantém os benefícios do ' + (e2.planoNome || 'plano atual') + ' até ' + window.SG_Plano.fmt(e2.dataFim) + '. A partir dessa data, sua conta passa ao Plano Gratuito (benefícios limitados).')) return;
            var r = window.SG_Plano.agendarTroca(email, 'gratuito');
            if (r && r.ok) { _sgToastAssinatura('Volta ao Plano Gratuito agendada para <strong>' + window.SG_Plano.fmt(r.efetivaEm) + '</strong>.', 'success'); setTimeout(_recarrega, 1300); }
        });
        var btnRevTroca = document.getElementById('sg-mp-reverter-troca');
        if (btnRevTroca) btnRevTroca.addEventListener('click', function () {
            if (window.SG_Plano) { window.SG_Plano.reverterTroca(email); _sgToastAssinatura('Alteração agendada revertida.', 'success'); setTimeout(_recarrega, 900); }
        });
        var btnRevCancel = document.getElementById('sg-mp-reverter-cancel');
        if (btnRevCancel) btnRevCancel.addEventListener('click', function () {
            if (window.SG_Plano) { window.SG_Plano.reverterCancelamento(email); _sgToastAssinatura('Cancelamento agendado revertido.', 'success'); setTimeout(_recarrega, 900); }
        });

        // ── Renderiza os cards de plano com ações ──────────────
        var cardsEl = document.getElementById('sg-plano-cards');
        if (cardsEl) cardsEl.innerHTML = _sgMeuPlanoCardsHtml(planos, dadosUsu, st);

        // ── Delegação de eventos nos botões dos cards ──────────
        if (cardsEl) {
            cardsEl.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-acao-plano]');
                if (!btn) return;
                var acao    = btn.dataset.acaoPlano;
                var planoId = btn.dataset.plano;
                var planoNome = btn.dataset.nome;

                if (acao === 'contratar' || acao === 'upgrade' || acao === 'downgrade') {
                    _sgMeuPlanoConfirmarContratacao(email, planoId, planoNome, acao, dadosUsu, function () {
                        // Recarrega a página após ação
                        window.location.reload();
                    });
                } else if (acao === 'cancelar') {
                    _sgMeuPlanoCancelar(email, dadosUsu);
                }
            });
        }

        // ── Botão usar trial gratuito (só aparece se ainda não iniciou trial) ──
        var btnTrial = document.getElementById('sg-btn-usar-trial');
        if (btnTrial) {
            btnTrial.addEventListener('click', function () {
                _sgMeuPlanoIniciarTrial(email, dadosUsu, function () {
                    window.location.reload();
                });
            });
        }

        // ── Sprint 3 — Botão Cancelar Plano (renderizado dinamicamente) ──────
        // Não depende de elemento pré-existente no HTML estático.
        // É criado e conectado aqui, garantindo execução sem falhas silenciosas.
        var wrapCancel = document.getElementById('sg-cancelar-plano-wrap');
        if (wrapCancel) {
            var _assPend = (dadosUsu.assinatura && dadosUsu.assinatura.cancelamentoAgendado);
            var podeCancel = (st.motivo === 'assinante') && !_assPend;
            if (podeCancel) {
                var btnCancel = document.createElement('button');
                btnCancel.type      = 'button';
                btnCancel.innerHTML = '<i class="bi bi-x-circle me-1"></i> Cancelar Plano';
                btnCancel.className = 'btn fw-bold btn-sm';
                // SPRINT 2 — botão de cancelamento sempre visível a partir da
                // efetivação da contratação: fundo #b91c1c e fonte branca.
                btnCancel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background-color:#b91c1c;color:#fff;border:1px solid #b91c1c;';
                btnCancel.addEventListener('click', function () {
                    var usuariosAtual = obterUsuariosCadastrados();
                    var dadosAtual    = usuariosAtual[email] || {};
                    _sgMeuPlanoCancelar(email, dadosAtual);
                });
                wrapCancel.appendChild(btnCancel);
            }
        }
    }

    // ── Bloco de status atual ──────────────────────────────────
    function _sgMeuPlanoStatusHtml(dadosUsu, st) {
        var planoAtual = dadosUsu.assinatura && dadosUsu.assinatura.plano ? SG_Trial.obterPlano(dadosUsu.assinatura.plano) : null;
        var contratoId = dadosUsu.assinatura && dadosUsu.assinatura.contratoId ? dadosUsu.assinatura.contratoId : null;
        var dataInicio = dadosUsu.assinatura && dadosUsu.assinatura.dataInicio ? new Date(dadosUsu.assinatura.dataInicio).toLocaleDateString('pt-BR') : null;
        var trialIni   = dadosUsu.trialInicio ? new Date(dadosUsu.trialInicio).toLocaleDateString('pt-BR') : null;

        var ass = dadosUsu.assinatura || {};
        function _fmtD(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return '—'; } }

        if (st.motivo === 'assinante' && planoAtual) {
            var vig = ass.dataFim ? _fmtD(ass.dataFim) : null;
            var extra = '';
            if (ass.mudancaAgendada) {
                var md = ass.mudancaAgendada;
                var rotuloM = md.planoDestino === 'gratuito'
                    ? 'Volta ao Plano Gratuito'
                    : ((md.tipo === 'upgrade' ? 'Upgrade' : 'Troca') + ' para ' + _escaparHtml(md.nomeDestino));
                extra += '<div style="margin-top:10px;background:#fff8e1;border:1px solid #FFC300;border-radius:8px;padding:10px 12px;font-size:.84rem;color:#7a5c00;">' +
                    '<i class="bi bi-calendar-event me-1"></i><strong>' + rotuloM + '</strong> agendada para <strong>' + _fmtD(md.efetivaEm) + '</strong>. Até lá, seus benefícios atuais continuam.' +
                    '<button type="button" id="sg-mp-reverter-troca" class="btn btn-sm btn-outline-secondary mt-2 d-block"><i class="bi bi-arrow-counterclockwise me-1"></i>Reverter alteração agendada</button></div>';
            }
            if (ass.cancelamentoAgendado) {
                extra += '<div style="margin-top:10px;background:#fee2e2;border:1px solid #dc3545;border-radius:8px;padding:10px 12px;font-size:.84rem;color:#991b1b;">' +
                    '<i class="bi bi-x-octagon me-1"></i><strong>Cancelamento agendado</strong> para <strong>' + _fmtD(ass.cancelamentoAgendado.efetivaEm) + '</strong>. Benefícios ativos até lá; depois inicia a carência de 90 dias.' +
                    '<button type="button" id="sg-mp-reverter-cancel" class="btn btn-sm btn-outline-secondary mt-2 d-block"><i class="bi bi-arrow-counterclockwise me-1"></i>Reverter cancelamento</button></div>';
            }
            if (!ass.mudancaAgendada && !ass.cancelamentoAgendado) {
                extra += '<div style="margin-top:10px;"><button type="button" id="sg-mp-voltar-gratuito" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-down-circle me-1"></i>Voltar ao Plano Gratuito (ao fim da vigência)</button></div>';
            }
            return '<div style="background:linear-gradient(135deg,#d1fae5,#a7f3d0);border:2px solid #10b981;border-radius:12px;padding:20px 24px;margin-bottom:24px;">' +
                '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
                '<div style="background:#10b981;color:#fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;"><i class="bi bi-check-circle-fill"></i></div>' +
                '<div style="flex:1;min-width:200px;">' +
                '<div style="font-weight:800;font-size:1.1rem;color:#065f46;">Plano Ativo: ' + _escaparHtml(planoAtual.nome) + '</div>' +
                '<div style="font-size:.85rem;color:#047857;">' + _escaparHtml(planoAtual.preco) + (dataInicio ? ' · Desde ' + dataInicio : '') + (vig ? ' · Vigência até ' + vig + ' (renova automaticamente)' : '') + '</div>' +
                (contratoId ? '<div style="font-size:.78rem;color:#6b7280;margin-top:2px;">Contrato: <strong>' + _escaparHtml(contratoId) + '</strong></div>' : '') +
                '</div></div>' + extra + '</div>';
        }

        // Plano Gratuito ativo (limitado) — resultado do downgrade ao gratuito
        if (st.motivo === 'gratuito') {
            return '<div style="background:linear-gradient(135deg,#e9ecef,#f8f9fa);border:2px solid #6c757d;border-radius:12px;padding:20px 24px;margin-bottom:24px;">' +
                '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
                '<div style="background:#6c757d;color:#fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;"><i class="bi bi-emoji-smile"></i></div>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:800;font-size:1.1rem;color:#343a40;">Plano Gratuito Ativo</div>' +
                '<div style="font-size:.85rem;color:#495057;">Benefícios limitados. Faça upgrade para um plano pago a qualquer momento para liberar todos os recursos.</div>' +
                '</div></div></div>';
        }

        if (st.motivo === 'trial' || st.motivo === 'trial_gratuito') {
            var diasRestantes = st.diasRestantes;
            var cor = diasRestantes <= 5 ? '#dc3545' : '#b8870c';
            return '<div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:2px solid #FFC300;border-radius:12px;padding:20px 24px;margin-bottom:24px;">' +
                '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
                '<div style="background:#FFC300;color:#000;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;"><i class="bi bi-clock-history"></i></div>' +
                '<div>' +
                '<div style="font-weight:800;font-size:1.1rem;color:#92400e;">Período de Testes Gratuito (30 dias)</div>' +
                '<div style="font-size:.88rem;color:' + cor + ';font-weight:700;">' +
                (diasRestantes <= 0 ? 'Encerrado' : diasRestantes === 1 ? 'Encerra hoje!' : 'Faltam <strong>' + diasRestantes + ' dias</strong>') +
                '</div>' +
                (trialIni ? '<div style="font-size:.78rem;color:#6b7280;margin-top:2px;">Início do trial: ' + trialIni + '</div>' : '') +
                '<div style="font-size:.82rem;color:#555;margin-top:4px;">Acesso equivalente ao <strong>Plano Básico</strong>. Contrate um plano para continuar após o vencimento.</div>' +
                '</div></div></div>';
        }

        if (st.motivo === 'cancelado') {
            return '<div style="background:#fee2e2;border:2px solid #dc3545;border-radius:12px;padding:20px 24px;margin-bottom:24px;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                '<div style="background:#dc3545;color:#fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;"><i class="bi bi-x-circle-fill"></i></div>' +
                '<div>' +
                '<div style="font-weight:800;font-size:1.1rem;color:#991b1b;">Assinatura Cancelada</div>' +
                '<div style="font-size:.85rem;color:#b91c1c;">Seu acesso está suspenso. Contrate ou reative um plano para voltar a usar o ServGo!.</div>' +
                '</div></div></div>';
        }

        if (st.motivo === 'cancelado_carencia') {
            var dias = st.diasCarenciaRestantes || 0;
            return '<div style="background:#fff3cd;border:2px solid #FFC300;border-radius:12px;padding:20px 24px;margin-bottom:24px;">' +
                '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
                '<div style="background:#FFC300;color:#000;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;"><i class="bi bi-hourglass-split"></i></div>' +
                '<div style="flex:1;">' +
                '<div style="font-weight:800;font-size:1.1rem;color:#92400e;">Plano Cancelado — Carência Ativa</div>' +
                '<div style="font-size:.85rem;color:#78350f;margin-top:2px;">O plano gratuito só poderá ser reativado após <strong>90 dias corridos</strong> do cancelamento.</div>' +
                '<div style="margin-top:10px;background:#fff;border-radius:8px;padding:8px 14px;display:inline-flex;align-items:center;gap:10px;">' +
                '<span style="font-size:2rem;font-weight:900;color:#dc3545;line-height:1;">' + dias + '</span>' +
                '<span style="font-size:.8rem;color:#555;">dia' + (dias !== 1 ? 's' : '') + ' restante' + (dias !== 1 ? 's' : '') + '<br>para liberar o plano gratuito</span>' +
                '</div>' +
                '<div style="font-size:.82rem;color:#555;margin-top:8px;">Você pode contratar um plano pago imediatamente para retomar o acesso.</div>' +
                '</div></div></div>';
        }

        if (st.motivo === 'trial_expirado' || st.bloqueado) {
            return '<div style="background:#fee2e2;border:2px solid #dc3545;border-radius:12px;padding:20px 24px;margin-bottom:24px;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                '<div style="background:#dc3545;color:#fff;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;"><i class="bi bi-hourglass-bottom"></i></div>' +
                '<div>' +
                '<div style="font-weight:800;font-size:1.1rem;color:#991b1b;">Período de Testes Encerrado</div>' +
                '<div style="font-size:.85rem;color:#b91c1c;">Seus 30 dias gratuitos foram utilizados. Contrate um plano para continuar.</div>' +
                '</div></div></div>';
        }

        return '';
    }

    // ── Cards de plano com ações contextuais ─────────────────────────
    function _sgMeuPlanoCardsHtml(planos, dadosUsu, st) {
        var assC = dadosUsu.assinatura || {};
        var planoAtualId = (assC.ativa && assC.plano && assC.plano !== 'gratuito') ? assC.plano : null;
        var pendente     = !!(assC.mudancaAgendada || assC.cancelamentoAgendado);
        var indices      = { basico: 0, profissional: 1, premium: 2 };
        var idxAtual     = planoAtualId !== null ? (indices[planoAtualId] !== undefined ? indices[planoAtualId] : -1) : -1;

        return planos.map(function (p, i) {
            var isAtual  = p.id === planoAtualId;
            var borda    = isAtual ? '3px solid #10b981' : p.destaque ? '2px solid #FFC300' : '1.5px solid #dee2e6';
            var bg       = isAtual ? '#f0fdf4' : p.destaque ? '#fffbeb' : '#fff';
            var badgeAtual = isAtual ? '<span style="background:#10b981;color:#fff;font-size:.68rem;font-weight:700;padding:2px 10px;border-radius:20px;margin-bottom:6px;display:inline-block;">✓ Plano Atual</span><br>' : '';
            var badgePop   = (!isAtual && p.destaque) ? '<span style="background:#FFC300;color:#000;font-size:.68rem;font-weight:700;padding:2px 10px;border-radius:20px;margin-bottom:6px;display:inline-block;">★ Mais Popular</span><br>' : '';

            // Define o botão de ação contextual
            var btnHtml = '';
            if (isAtual) {
                if (pendente) {
                    btnHtml = '<button type="button" class="btn btn-outline-secondary btn-sm w-100 mt-2" disabled><i class="bi bi-hourglass-split me-1"></i>Alteração agendada</button>';
                } else {
                    btnHtml = '<button type="button" class="btn btn-outline-danger btn-sm w-100 mt-2" data-acao-plano="cancelar" data-plano="' + p.id + '" data-nome="' + _escaparHtml(p.nome) + '">' +
                        '<i class="bi bi-x-circle me-1"></i>Cancelar Assinatura</button>';
                }
            } else if (pendente && planoAtualId) {
                btnHtml = '<button type="button" class="btn btn-light btn-sm w-100" disabled style="opacity:.6;"><i class="bi bi-lock me-1"></i>Indisponível durante agendamento</button>';
            } else if (!planoAtualId) {
                btnHtml = '<button type="button" class="btn btn-warning fw-bold btn-sm w-100" data-acao-plano="contratar" data-plano="' + p.id + '" data-nome="' + _escaparHtml(p.nome) + '">' +
                    '<i class="bi bi-check-circle me-1"></i>Contratar</button>';
            } else if (i > idxAtual) {
                btnHtml = '<button type="button" class="btn btn-success btn-sm w-100" data-acao-plano="upgrade" data-plano="' + p.id + '" data-nome="' + _escaparHtml(p.nome) + '">' +
                    '<i class="bi bi-arrow-up-circle me-1"></i>Fazer Upgrade</button>';
            } else {
                btnHtml = '<button type="button" class="btn btn-outline-secondary btn-sm w-100" data-acao-plano="downgrade" data-plano="' + p.id + '" data-nome="' + _escaparHtml(p.nome) + '">' +
                    '<i class="bi bi-arrow-down-circle me-1"></i>Fazer Downgrade</button>';
            }

            return '<div style="border:' + borda + ';background:' + bg + ';border-radius:10px;padding:18px 16px;flex:1;min-width:220px;">' +
                badgeAtual + badgePop +
                '<div style="font-weight:800;font-size:.95rem;color:#1a1a1a;">' + _escaparHtml(p.nome) + '</div>' +
                '<div style="font-size:1.3rem;font-weight:900;color:' + p.cor + ';margin:4px 0;">' + _escaparHtml(p.preco) + '</div>' +
                '<div style="font-size:.82rem;color:#555;margin-bottom:12px;">' + _escaparHtml(p.descricao) + '</div>' +
                btnHtml +
                '</div>';
        }).join('');
    }

    // ── Confirmar contratação / upgrade / downgrade ───────────────────
    function _sgMeuPlanoConfirmarContratacao(email, planoId, planoNome, acao, dadosUsu, callback) {
        var est = (window.SG_Plano && window.SG_Plano.estado) ? window.SG_Plano.estado(email) : null;
        var temPago  = !!(est && est.ativa && est.plano && est.plano !== 'gratuito');
        var agendar  = temPago && (acao === 'upgrade' || acao === 'downgrade');

        var precos   = { basico: 'R$ 49,90/mês', profissional: 'R$ 89,90/mês', premium: 'R$ 139,90/mês' };
        try { (SG_Trial.obterPlanos() || []).forEach(function (p) { if (p && p.preco) precos[p.id] = p.preco; }); } catch (e) {}
        var acaoLabels = { contratar: 'Contratar', upgrade: 'Fazer Upgrade para', downgrade: 'Fazer Downgrade para' };
        var label    = acaoLabels[acao] || 'Contratar';

        var modalId  = 'sg-meu-plano-modal-conf';
        var exist    = document.getElementById(modalId);
        if (exist) exist.remove();

        var corpo;
        if (agendar) {
            var fim = window.SG_Plano.fmt(est.dataFim);
            corpo = '<p>Você está alterando do <strong>' + _escaparHtml(est.planoNome) + '</strong> para o <strong>' + _escaparHtml(planoNome) + '</strong>.</p>' +
                '<div style="background:#fff8e1;border-left:4px solid #FFC300;padding:12px 14px;border-radius:0 8px 8px 0;margin-bottom:10px;">' +
                '<p style="margin:0 0 6px;font-size:.86rem;"><i class="bi bi-calendar-check me-1"></i>Você mantém os benefícios do <strong>' + _escaparHtml(est.planoNome) + '</strong> até <strong>' + fim + '</strong> (fim da vigência atual).</p>' +
                '<p style="margin:0;font-size:.86rem;"><i class="bi bi-arrow-right-circle me-1"></i>A partir de <strong>' + fim + '</strong>, o <strong>' + _escaparHtml(planoNome) + '</strong> entra em vigor, iniciando um novo ciclo.</p></div>' +
                '<p class="text-muted small" style="margin:0;"><i class="bi bi-info-circle me-1"></i>Não há reembolso proporcional — o período já contratado é integral.</p>';
        } else {
            corpo = '<p>Você está prestes a <strong>' + label.toLowerCase() + ' ' + _escaparHtml(planoNome) + '</strong> por <strong>' + (precos[planoId] || '') + '</strong>.</p>' +
                '<p class="text-muted small">O plano entra em vigor imediatamente e inicia um novo ciclo de 30 dias. Ao confirmar, você aceita os <a href="/paginasSite/planosContrato.html" target="_blank">Termos de Contrato</a>.</p>';
        }

        var html = '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
            '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#146ADB;color:#fff;">' +
            '<h5 class="modal-title"><i class="bi bi-credit-card me-2"></i>' + (agendar ? 'Alterar Plano' : (label + ' ' + _escaparHtml(planoNome))) + '</h5>' +
            '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' +
            '</div>' +
            '<div class="modal-body">' + corpo + '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>' +
            '<button type="button" class="btn btn-warning fw-bold" id="sg-meu-plano-btn-ok"><i class="bi bi-check-circle me-1"></i>' + (agendar ? 'Agendar Alteração' : 'Confirmar') + '</button>' +
            '</div></div></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modalEl = document.getElementById(modalId);
        var modal   = new bootstrap.Modal(modalEl);
        modal.show();

        document.getElementById('sg-meu-plano-btn-ok').addEventListener('click', function () {
            if (window.SG_Plano) {
                if (agendar) window.SG_Plano.agendarTroca(email, planoId);
                else         window.SG_Plano.contratar(email, planoId);
            }
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', function () { modalEl.remove(); }, { once: true });
            if (typeof callback === 'function') callback();
        });
    }

    // ── Cancelar assinatura (agendado para o fim da vigência) ─────────
    function _sgMeuPlanoCancelar(email, dadosUsu) {
        var est = (window.SG_Plano && window.SG_Plano.estado) ? window.SG_Plano.estado(email) : null;
        if (!est || !est.ativa || est.plano === 'gratuito') {
            _sgToastAssinatura('Não há um plano pago ativo para cancelar.', 'erro');
            return;
        }

        var modalId = 'sg-meu-plano-modal-cancelar';
        var exist   = document.getElementById(modalId);
        if (exist) exist.remove();

        var nomePlanoAtual = est.planoNome;
        var fim     = window.SG_Plano.fmt(est.dataFim);
        var carencia = (window.SG_Plano.carenciaDias ? window.SG_Plano.carenciaDias() : 90);

        var html = '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
            '<div class="modal-dialog modal-dialog-centered modal-lg">' +
            '<div class="modal-content">' +
            '<div class="modal-header" style="background:#dc3545;color:#fff;">' +
            '<h5 class="modal-title"><i class="bi bi-x-octagon me-2"></i>Cancelar Assinatura — ' + _escaparHtml(nomePlanoAtual) + '</h5>' +
            '</div>' +
            '<div class="modal-body">' +
            '<div style="background:#fff8e1;border-left:4px solid #FFC300;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:18px;">' +
            '<p style="margin:0 0 4px;font-weight:700;color:#7a5c00;font-size:.92rem;">' +
            '<i class="bi bi-info-circle-fill me-1"></i>O cancelamento é agendado — você não perde o acesso agora</p>' +
            '<p style="margin:0;font-size:.85rem;color:#7a5c00;">Seus benefícios continuam ativos até o fim da vigência atual (<strong>' + fim + '</strong>).</p>' +
            '</div>' +
            '<ul style="list-style:none;padding:0;margin:0 0 16px;">' +
            '<li style="margin-bottom:8px;"><i class="bi bi-calendar-check me-2" style="color:#198754;"></i>' +
            '<strong>Benefícios até ' + fim + ':</strong> você continua usando o ' + _escaparHtml(nomePlanoAtual) + ' normalmente até essa data.</li>' +
            '<li style="margin-bottom:8px;"><i class="bi bi-lock-fill me-2" style="color:#dc3545;"></i>' +
            '<strong>Bloqueio após a vigência:</strong> a partir de ' + fim + ', a conta é bloqueada e o HotSite sai do catálogo.</li>' +
            '<li style="margin-bottom:8px;"><i class="bi bi-hourglass-split me-2" style="color:#b8870c;"></i>' +
            '<strong>Carência de ' + carencia + ' dias:</strong> o Plano Gratuito só é liberado após ' + carencia + ' dias corridos contados a partir de ' + fim + '.</li>' +
            '<li style="margin-bottom:0;"><i class="bi bi-arrow-repeat me-2" style="color:#146ADB;"></i>' +
            '<strong>Retorno antecipado:</strong> para voltar antes da carência, reative o mesmo plano pago ou contrate um novo — iniciando um novo ciclo do zero.</li>' +
            '</ul>' +
            '<p style="font-size:.85rem;color:#555;margin-bottom:0;">Deseja agendar o cancelamento do <strong>' + _escaparHtml(nomePlanoAtual) + '</strong> para <strong>' + fim + '</strong>?</p>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="bi bi-arrow-left me-1"></i>Manter Assinatura</button>' +
            '<button type="button" class="btn btn-danger fw-bold" id="sg-meu-plano-confirmar-cancelar">' +
            '<i class="bi bi-calendar-x me-1"></i>Agendar Cancelamento</button>' +
            '</div></div></div></div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var modalEl = document.getElementById(modalId);
        var modal   = new bootstrap.Modal(modalEl, { backdrop: 'static' });
        modal.show();

        document.getElementById('sg-meu-plano-confirmar-cancelar').addEventListener('click', function () {
            var r = window.SG_Plano ? window.SG_Plano.agendarCancelamento(email) : { ok: false };
            modal.hide();
            modalEl.addEventListener('hidden.bs.modal', function () {
                modalEl.remove();
                if (r && r.ok) {
                    _sgToastAssinatura('Cancelamento agendado para <strong>' + window.SG_Plano.fmt(r.efetivaEm) + '</strong>. Seus benefícios seguem ativos até lá.', 'success');
                    setTimeout(function () { window.location.reload(); }, 1400);
                } else {
                    _sgToastAssinatura('Não foi possível agendar o cancelamento.', 'erro');
                }
            }, { once: true });
        });
    }

    // ── Iniciar trial gratuito a partir da página Meu Plano ──────────
    function _sgMeuPlanoIniciarTrial(email, dadosUsu, callback) {
        var usuarios = obterUsuariosCadastrados();
        var u        = usuarios[email] || {};
        if (!u.trialInicio) {
            u.trialInicio = new Date().toISOString();
            usuarios[email] = u;
            salvarUsuariosCadastrados(usuarios);
        }
        if (typeof callback === 'function') callback();
    }

    // =========================================================
    // SPRINT 9 — MODOS DE COR (Claro / Escuro / Daltônico)
    // =========================================================
    // Implementação 100% aditiva: não altera nenhuma função,
    // variável ou comportamento já existente no site. Apenas
    // adiciona um seletor de tema, injetado via JS em toda página,
    // que grava a preferência em localStorage e aplica o atributo
    // data-tema em <html> (a troca visual em si é feita inteiramente
    // pelo CSS adicionado na seção 32 de estiloServGo.css).
    var SG_TEMA_CHAVE = 'sgTema';
    var SG_TEMAS = [
        { id: 'claro',     label: 'Claro',     icone: 'bi-sun-fill' },
        { id: 'escuro',    label: 'Escuro',    icone: 'bi-moon-stars-fill' },
        { id: 'daltonico', label: 'Daltônico', icone: 'bi-eye-fill' }
    ];

    function _sgObterTema() {
        try {
            var t = localStorage.getItem(SG_TEMA_CHAVE);
            if (t === 'escuro' || t === 'daltonico' || t === 'claro') return t;
        } catch (e) {}
        return 'claro';
    }

    function _sgAplicarTema(tema) {
        try { document.documentElement.setAttribute('data-tema', tema); } catch (e) {}
        try { localStorage.setItem(SG_TEMA_CHAVE, tema); } catch (e) {}
    }

    function inicializarSeletorTema() {
        // Garante o tema correto aplicado (o <script> inline no <head>
        // de cada página já faz isso antes da renderização, evitando
        // "flash" de tema errado; esta chamada é apenas uma garantia
        // adicional caso o atributo ainda não tenha sido definido).
        if (!document.documentElement.getAttribute('data-tema')) {
            document.documentElement.setAttribute('data-tema', _sgObterTema());
        }

        // Evita duplicar o botão caso a função seja chamada mais de uma vez.
        if (document.getElementById('sg-tema-botao')) return;

        var botao = document.createElement('button');
        botao.type = 'button';
        botao.id = 'sg-tema-botao';
        botao.setAttribute('aria-label', 'Alterar modo de cores do site');
        botao.setAttribute('aria-haspopup', 'true');
        botao.setAttribute('aria-expanded', 'false');

        var menu = document.createElement('div');
        menu.id = 'sg-tema-menu';
        menu.setAttribute('role', 'menu');

        function _renderizar() {
            var atual = _sgObterTema();
            var infoAtual = SG_TEMAS.filter(function (t) { return t.id === atual; })[0] || SG_TEMAS[0];
            botao.innerHTML = '<i class="bi ' + infoAtual.icone + '"></i>';

            menu.innerHTML = '';
            SG_TEMAS.forEach(function (t) {
                var item = document.createElement('button');
                item.type = 'button';
                item.setAttribute('role', 'menuitemradio');
                item.setAttribute('aria-checked', String(t.id === atual));
                if (t.id === atual) item.className = 'sg-tema-ativo';
                item.innerHTML = '<i class="bi ' + t.icone + '"></i><span>' + t.label + '</span>' +
                    (t.id === atual ? '<i class="bi bi-check2 ms-auto"></i>' : '');
                item.addEventListener('click', function (e) {
                    e.stopPropagation();
                    _sgAplicarTema(t.id);
                    _renderizar();
                    _fecharMenu();
                });
                menu.appendChild(item);
            });
        }

        function _abrirMenu() {
            menu.classList.add('sg-tema-menu-aberto');
            botao.setAttribute('aria-expanded', 'true');
        }
        function _fecharMenu() {
            menu.classList.remove('sg-tema-menu-aberto');
            botao.setAttribute('aria-expanded', 'false');
        }

        botao.addEventListener('click', function (e) {
            e.stopPropagation();
            if (menu.classList.contains('sg-tema-menu-aberto')) _fecharMenu();
            else _abrirMenu();
        });
        document.addEventListener('click', function (e) {
            if (!menu.contains(e.target) && e.target !== botao) _fecharMenu();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') _fecharMenu();
        });

        _renderizar();
        document.body.appendChild(botao);
        document.body.appendChild(menu);
    }

        inicializarMeuPlano();
    inicializarBotoesAssinatura();
    inicializarAlterarSenhaGeral();
    inicializarSidebarResponsiva();
    inicializarSeletorTema();       // Sprint 9 — modos de cor (claro/escuro/daltônico)
    inicializarAgendarServicos();
    inicializarCatalogoPublico();           // Sprint 4 — catálogo de prestadores na página pública
    inicializarHotsitePublico();
    inicializarNotificacoesDashboardPrestador();
    inicializarNotificacoesDashboardCliente();
    _iniciarPollingNotifCliente();      // Sprint 3 — novo
    inicializarConfigurarAgenda();
    inicializarDashboardPrestador();
    inicializarContatoPrestador();  // compatibilidade — chama inicializarFormContato()
    inicializarFormContato();       // Sprint 3 — contato unificado (contatoSite + clienteContato)
    inicializarDadosAdm();          // Sprint 3 — configuração de dados admin no dadosAdm.html
    inicializarAdminGerenciamento(); // Sprint 2
    inicializarFaqSite();            // Sprint 3
    inicializarFaqEnviarDuvida();    // Sprint 3 — envio de dúvida do FAQ para o suporte admin

    // =========================================================
    // SPRINT 4 — LOGIN ADMINISTRATIVO SEGURO
    // (adminLogin.html)
    //
    // Funcionalidades:
    //  • Formulário dedicado para admins (não acessível pelo login público)
    //  • Bloqueio progressivo: após 5 tentativas erradas, trava 15 min
    //  • Barra visual de tentativas restantes
    //  • Countdown de desbloqueio em tempo real
    //  • Sessão admin com expiração por inatividade (60 min)
    //  • Toggle de visibilidade da senha
    //  • Redireciona para adminGerenciamento.html após login
    //  • Usuário já logado como admin é redirecionado imediatamente
    // =========================================================
    function inicializarAdminLogin() {
        var form = document.getElementById('form-admin-login');
        if (!form) return;

        // ── MODO TESTE — seed automático ─────────────────────────
        // Remove para produção. Garante que sempre existe um admin
        // de teste acessível sem configuração prévia.
        var TESTE_EMAIL = 'admin@servgo.com.br';
        var TESTE_SENHA = 'Admin@2026';
        (function _seedAdminTeste() {
            var usu = obterUsuariosCadastrados();
            var temAdmin = Object.keys(usu).some(function(e){ return usu[e].tipo === 'admin'; });
            if (!temAdmin) {
                usu[TESTE_EMAIL] = {
                    nome: 'Admin Teste',
                    senha: TESTE_SENHA,
                    tipo: 'admin',
                    dataCadastro: new Date().toISOString(),
                    criadoPor: 'seed-teste'
                };
                salvarUsuariosCadastrados(usu);
            }
        })();

        // Exibe banner de modo teste na página
        (function _exibirBannerTeste() {
            var card = document.querySelector('.adm-login-card');
            if (!card) return;
            var banner = document.createElement('div');
            banner.id = 'adm-teste-banner';
            banner.style.cssText = [
                'background:rgba(255,195,0,.12)',
                'border:1.5px solid rgba(255,195,0,.35)',
                'border-radius:10px',
                'padding:14px 16px',
                'margin-bottom:20px',
                'font-size:.82rem',
                'color:#fde68a'
            ].join(';');
            banner.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                    '<i class="bi bi-cone-striped" style="font-size:1rem;color:#FFC300;"></i>' +
                    '<strong style="color:#FFC300;font-size:.85rem;letter-spacing:.03em;">MODO TESTE ATIVO</strong>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin-bottom:12px;font-size:.8rem;">' +
                    '<span style="opacity:.65;">E-mail:</span>' +
                    '<code style="color:#fff;background:rgba(255,255,255,.08);padding:1px 7px;border-radius:4px;">' + TESTE_EMAIL + '</code>' +
                    '<span style="opacity:.65;">Senha:</span>' +
                    '<code style="color:#fff;background:rgba(255,255,255,.08);padding:1px 7px;border-radius:4px;">' + TESTE_SENHA + '</code>' +
                '</div>' +
                '<button type="button" id="adm-btn-preencher-teste" style="' +
                    'width:100%;padding:7px;border-radius:6px;border:1.5px solid rgba(255,195,0,.5);' +
                    'background:rgba(255,195,0,.15);color:#FFC300;font-size:.82rem;font-weight:700;' +
                    'cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;' +
                '">' +
                    '<i class="bi bi-lightning-charge-fill"></i> Preencher e Entrar Automaticamente' +
                '</button>';
            // Insere antes do alerta dinâmico
            var alertaEl2 = document.getElementById('adm-login-alerta');
            if (alertaEl2) card.insertBefore(banner, alertaEl2);
            else card.insertBefore(banner, card.firstChild);

            // Botão de auto-preenchimento e submit
            document.getElementById('adm-btn-preencher-teste').addEventListener('click', function () {
                var eEl = document.getElementById('adm-email-input');
                var sEl = document.getElementById('adm-senha-input');
                if (eEl) eEl.value = TESTE_EMAIL;
                if (sEl) sEl.value = TESTE_SENHA;
                form.dispatchEvent(new Event('submit'));
            });
        })();

        // ── Chaves ──────────────────────────────────────────────
        var LOCK_KEY    = 'sg_adm_lockout';     // { tentativas, bloqueadoAte }
        var SESSION_KEY = 'sg_adm_session_ts';  // timestamp da última atividade
        var MAX_TENT    = 5;
        var LOCK_MS     = 15 * 60 * 1000;       // 15 minutos em ms
        var SESSION_MS  = 60 * 60 * 1000;       // 60 minutos de inatividade

        // ── Elementos ───────────────────────────────────────────
        var emailEl     = document.getElementById('adm-email-input');
        var senhaEl     = document.getElementById('adm-senha-input');
        var alertaEl    = document.getElementById('adm-login-alerta');
        var btnEntrar   = document.getElementById('adm-btn-entrar');
        var spinner     = document.getElementById('adm-spinner');
        var btnIco      = document.getElementById('adm-btn-ico');
        var btnTexto    = document.getElementById('adm-btn-texto');
        var barraWrap   = document.getElementById('adm-tentativas-barra');
        var barraTxt    = document.getElementById('adm-tentativas-texto');
        var barraFill   = document.getElementById('adm-tentativas-fill');
        var lockMsg     = document.getElementById('adm-lockout-msg');
        var lockCnt     = document.getElementById('adm-lockout-countdown');
        var toggleBtn   = document.getElementById('adm-toggle-senha');
        var toggleIco   = document.getElementById('adm-toggle-ico');

        // ── Sprint 1: ao chegar na página de login, sempre encerra sessão ──
        // Garante que o logon automático não ocorra; credenciais são exigidas sempre.
        DB.remove('usuarioLogado');
        try { sessionStorage.removeItem('sg_adm_session_ts'); } catch(e) {}

        // ── Toggle senha ─────────────────────────────────────────
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var tipo = senhaEl.type === 'password' ? 'text' : 'password';
                senhaEl.type = tipo;
                toggleIco.className = tipo === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
            });
        }

        // ── helpers ──────────────────────────────────────────────
        function _getLock()  { try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || {}; } catch(e) { return {}; } }
        function _setLock(v) { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); }

        function _mostrarAlerta(tipo, msg) {
            if (!alertaEl) return;
            var icones = { erro: 'bi-shield-exclamation', aviso: 'bi-exclamation-triangle-fill', sucesso: 'bi-check-circle-fill' };
            alertaEl.innerHTML =
                '<div class="adm-alerta ' + tipo + '">' +
                '<i class="bi ' + (icones[tipo]||'bi-info-circle') + '" style="flex-shrink:0;margin-top:1px;"></i>' +
                '<span>' + msg + '</span></div>';
            alertaEl.style.display = 'block';
        }

        function _limparAlerta() {
            if (alertaEl) { alertaEl.innerHTML = ''; alertaEl.style.display = 'none'; }
        }

        function _setCarregando(ativo) {
            btnEntrar.disabled = ativo;
            if (spinner) spinner.style.display = ativo ? 'inline-block' : 'none';
            if (btnIco)  btnIco.style.display  = ativo ? 'none' : 'inline-block';
            if (btnTexto) btnTexto.textContent  = ativo ? 'Verificando…' : 'Acessar Painel';
        }

        function _atualizarBarra(tentativas) {
            if (!barraWrap) return;
            var restantes = Math.max(0, MAX_TENT - tentativas);
            barraWrap.style.display = tentativas > 0 ? 'block' : 'none';
            if (barraTxt)  barraTxt.textContent = restantes + ' de ' + MAX_TENT;
            if (barraFill) {
                var pct = (restantes / MAX_TENT) * 100;
                barraFill.style.width = pct + '%';
                barraFill.style.background = pct > 60 ? '#22c55e' : pct > 20 ? '#FFC300' : '#ef4444';
            }
        }

        function _fmtTempo(ms) {
            var s = Math.ceil(ms / 1000);
            var m = Math.floor(s / 60); s = s % 60;
            return (m > 0 ? m + 'min ' : '') + s + 's';
        }

        // Contador regressivo de desbloqueio
        var _lockTimer = null;
        function _iniciarCountdown(ate) {
            if (!lockMsg || !lockCnt) return;
            lockMsg.style.display  = 'block';
            btnEntrar.disabled     = true;

            function _tick() {
                var resto = ate - Date.now();
                if (resto <= 0) {
                    lockMsg.style.display = 'none';
                    btnEntrar.disabled    = false;
                    if (barraWrap) barraWrap.style.display = 'none';
                    _limparAlerta();
                    clearInterval(_lockTimer);
                    return;
                }
                lockCnt.textContent = _fmtTempo(resto);
            }
            _tick();
            clearInterval(_lockTimer);
            _lockTimer = setInterval(_tick, 1000);
        }

        // ── Verifica estado de bloqueio ao carregar ──────────────
        (function _verificarBloqueioInicial() {
            var lock = _getLock();
            if (lock.bloqueadoAte && Date.now() < lock.bloqueadoAte) {
                _mostrarAlerta('aviso',
                    'Muitas tentativas incorretas. Aguarde o desbloqueio automático.');
                _atualizarBarra(MAX_TENT);
                _iniciarCountdown(lock.bloqueadoAte);
            } else if (lock.tentativas > 0) {
                _atualizarBarra(lock.tentativas);
            }
        })();

        // Verifica expiração de sessão admin ao carregar
        (function _verificarExpiracaoSessao() {
            var params = new URLSearchParams(window.location.search);
            if (params.get('expirado') === '1') {
                _mostrarAlerta('aviso', 'Sua sessão administrativa expirou por inatividade. Faça login novamente.');
            }
            if (params.get('acesso') === 'restrito') {
                _mostrarAlerta('aviso', 'Acesso restrito. Faça login como administrador para continuar.');
            }
        })();

        // ── Submit ────────────────────────────────────────────────
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            _limparAlerta();

            var lock = _getLock();

            // Verifica bloqueio ativo
            if (lock.bloqueadoAte && Date.now() < lock.bloqueadoAte) {
                _iniciarCountdown(lock.bloqueadoAte);
                return;
            }

            var email = (emailEl ? emailEl.value.trim().toLowerCase() : '');
            var senha = (senhaEl ? senhaEl.value : '');

            if (!email || !senha) {
                _mostrarAlerta('erro', 'Preencha e-mail e senha.');
                return;
            }

            // Simula delay de verificação (UX + anti-brute-force)
            _setCarregando(true);
            setTimeout(function () {
                _setCarregando(false);

                var usuarios = obterUsuariosCadastrados();
                var usu      = usuarios[email];

                // Verificação: usuário existe, senha correta e é admin
                if (usu && usu.senha === senha && usu.tipo === 'admin') {
                    // Sucesso — limpa lockout e inicia sessão
                    _setLock({ tentativas: 0, bloqueadoAte: null });
                    _refreshAdminSession();
                    salvarUsuarioLogado(email, usu.nome, usu.tipo);

                    _mostrarAlerta('sucesso', 'Acesso autorizado. Redirecionando…');
                    btnEntrar.disabled = true;

                    // Redireciona após breve feedback visual
                    var destino = '/paginasAdministrador/adminGerenciamento.html';
                    try {
                        var sg = sessionStorage.getItem('sg_redirect_apos_login') || '';
                        if (sg && sg.includes('admin')) { destino = sg; sessionStorage.removeItem('sg_redirect_apos_login'); }
                    } catch(ex) {}

                    setTimeout(function () { window.location.replace(destino); }, 900);
                    return;
                }

                // Falha — registra tentativa
                var novasTentativas = (lock.tentativas || 0) + 1;
                var novoLock = { tentativas: novasTentativas, bloqueadoAte: null };

                if (novasTentativas >= MAX_TENT) {
                    novoLock.bloqueadoAte = Date.now() + LOCK_MS;
                    _setLock(novoLock);
                    _atualizarBarra(novasTentativas);
                    _mostrarAlerta('erro',
                        'Número máximo de tentativas atingido. ' +
                        'Acesso bloqueado por <strong>15 minutos</strong>.');
                    _iniciarCountdown(novoLock.bloqueadoAte);
                    if (senhaEl) senhaEl.value = '';
                    return;
                }

                _setLock(novoLock);
                _atualizarBarra(novasTentativas);

                var restantes = MAX_TENT - novasTentativas;
                _mostrarAlerta('erro',
                    'E-mail ou senha incorretos, ou usuário sem permissão de administrador. ' +
                    'Você tem <strong>' + restantes + ' tentativa' + (restantes !== 1 ? 's' : '') + '</strong> restante' + (restantes !== 1 ? 's' : '') + '.');
                if (senhaEl) senhaEl.value = '';
                if (emailEl) emailEl.classList.add('erro');
            }, 800);
        });

        // Remove classe de erro ao digitar
        if (emailEl) emailEl.addEventListener('input', function () { emailEl.classList.remove('erro'); });
        if (senhaEl) senhaEl.addEventListener('input', function () { senhaEl.classList.remove('erro'); });

        // ── Expira sessão admin por inatividade ──────────────────
        function _refreshAdminSession() {
            try { sessionStorage.setItem(SESSION_KEY, String(Date.now())); } catch(e) {}
        }
        // Monitora atividade a cada 5 min para expirar sessão
        (function _monitorarSessao() {
            var _u = obterUsuarioLogado();
            if (!_u || _u.tipo !== 'admin') return;
            setInterval(function () {
                var ts = parseInt(sessionStorage.getItem(SESSION_KEY) || '0', 10);
                if (ts && Date.now() - ts > SESSION_MS) {
                    DB.remove('usuarioLogado');
                    window.location.replace('/paginasSite/login.html?acesso=restrito');
                }
            }, 5 * 60 * 1000);
        })();
    }

    // =========================================================
    // SPRINT 4 — CADASTRO ADMINISTRATIVO SEGURO
    // (adminCadastro.html)
    //
    // Modos de operação:
    //   1. MODO SESSÃO  — usuário admin já logado pode criar novos admins
    //   2. MODO SETUP   — nenhum admin existe → requer token de configuração
    //   3. BLOQUEADO    — existe admin e não há sessão → acesso negado
    //
    // Token de configuração padrão: SERVGO-ADMIN-2026
    //   (deve ser alterado após o primeiro uso nas configurações do sistema)
    //
    // Validações:
    //   • Nome (3–100 chars)
    //   • E-mail único, não cadastrado
    //   • Senha forte: 8+ chars, maiúscula, número, especial
    //   • Confirmação de senha
    //   • Indicador de força com checklist em tempo real
    // =========================================================
    function inicializarAdminCadastro() {
        var form = document.getElementById('form-admin-cadastro');
        if (!form) return;

        var SETUP_TOKEN  = 'SERVGO-ADMIN-2026';
        var SETUP_USED   = 'sg_setup_token_usado';

        // ── Elementos ────────────────────────────────────────────
        var nomeEl     = document.getElementById('adm-cad-nome');
        var emailEl    = document.getElementById('adm-cad-email');
        var senhaEl    = document.getElementById('adm-cad-senha');
        var senha2El   = document.getElementById('adm-cad-senha2');
        var tokenWrap  = document.getElementById('adm-cad-token-wrap');
        var tokenEl    = document.getElementById('adm-cad-token');
        var alertaEl   = document.getElementById('adm-cad-alerta');
        var avisoEl    = document.getElementById('adm-cad-aviso');
        var btnCad     = document.getElementById('adm-btn-cadastrar');
        var matchMsg   = document.getElementById('adm-match-msg');

        // ── MODO TESTE — exibe banner com token e dados de exemplo ─
        (function _bannerTesteCadastro() {
            var card = document.querySelector('.adm-cad-card');
            if (!card) return;
            var banner = document.createElement('div');
            banner.style.cssText = [
                'background:rgba(255,195,0,.12)',
                'border:1.5px solid rgba(255,195,0,.35)',
                'border-radius:10px',
                'padding:14px 16px',
                'margin-bottom:18px',
                'font-size:.82rem',
                'color:#fde68a'
            ].join(';');
            banner.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                    '<i class="bi bi-cone-striped" style="font-size:1rem;color:#FFC300;"></i>' +
                    '<strong style="color:#FFC300;font-size:.85rem;letter-spacing:.03em;">MODO TESTE ATIVO</strong>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin-bottom:12px;font-size:.8rem;">' +
                    '<span style="opacity:.65;">Token:</span>' +
                    '<code style="color:#fff;background:rgba(255,255,255,.08);padding:1px 7px;border-radius:4px;">' + SETUP_TOKEN + '</code>' +
                '</div>' +
                '<button type="button" id="adm-cad-btn-preencher" style="' +
                    'width:100%;padding:7px;border-radius:6px;border:1.5px solid rgba(255,195,0,.5);' +
                    'background:rgba(255,195,0,.15);color:#FFC300;font-size:.82rem;font-weight:700;' +
                    'cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;' +
                '">' +
                    '<i class="bi bi-lightning-charge-fill"></i> Preencher com Dados de Exemplo' +
                '</button>';
            var alertaRef = document.getElementById('adm-cad-alerta');
            if (alertaRef) card.insertBefore(banner, alertaRef);
            else card.insertBefore(banner, card.firstChild);

            document.getElementById('adm-cad-btn-preencher').addEventListener('click', function () {
                if (tokenEl)  tokenEl.value  = SETUP_TOKEN;
                if (nomeEl)   nomeEl.value   = 'Admin Teste';
                if (emailEl)  emailEl.value  = 'admin@servgo.com.br';
                // Preenche senha forte de exemplo
                var senhaEx = 'Admin@2026';
                if (senhaEl)  { senhaEl.value  = senhaEx; senhaEl.dispatchEvent(new Event('input')); }
                if (senha2El) { senha2El.value = senhaEx; senha2El.dispatchEvent(new Event('input')); }
            });
        })();

        // ── helpers ──────────────────────────────────────────────
        function _mostrarAlerta(tipo, msg) {
            if (!alertaEl) return;
            var icones = { erro: 'bi-shield-exclamation', aviso: 'bi-exclamation-triangle-fill', sucesso: 'bi-check-circle-fill' };
            alertaEl.innerHTML =
                '<div class="adm-alerta ' + tipo + '">' +
                '<i class="bi ' + (icones[tipo]||'bi-info-circle') + '" style="flex-shrink:0;margin-top:1px;"></i>' +
                '<span>' + msg + '</span></div>';
            alertaEl.style.display = 'block';
        }

        // ── Determina o modo ─────────────────────────────────────
        var usuarios  = obterUsuariosCadastrados();
        var admins    = Object.keys(usuarios).filter(function(e){ return usuarios[e].tipo === 'admin'; });
        var temAdmin  = admins.length > 0;
        var sessao    = obterUsuarioLogado();
        var eSessAdm  = sessao && sessao.tipo === 'admin';

        if (!temAdmin) {
            // MODO SETUP — nenhum admin existe
            if (tokenWrap) tokenWrap.style.display = 'block';
            if (avisoEl)   avisoEl.style.display   = 'none';
        } else if (eSessAdm) {
            // MODO SESSÃO — admin logado criando outro admin
            if (tokenWrap) tokenWrap.style.display = 'none';
            if (avisoEl) {
                avisoEl.innerHTML =
                    '<i class="bi bi-shield-fill-check" style="color:#86efac;"></i>' +
                    '<div><strong style="color:#86efac;">Sessão administrativa ativa.</strong>' +
                    ' Você pode cadastrar um novo administrador.' +
                    ' <a href="/paginasAdministrador/adminGerenciamento.html" style="color:#86efac;">Ir para o painel</a></div>';
            }
        } else {
            // BLOQUEADO — admin existe mas não há sessão admin
            if (tokenWrap) tokenWrap.style.display = 'none';
            if (avisoEl) {
                avisoEl.innerHTML =
                    '<i class="bi bi-lock-fill" style="color:#fca5a5;flex-shrink:0;"></i>' +
                    '<div><strong style="color:#fca5a5;">Acesso negado.</strong>' +
                    ' Já existe pelo menos um administrador cadastrado. Para criar um novo,' +
                    ' faça <a href="/paginasSite/login.html" style="color:#fca5a5;">login como administrador</a> primeiro.</div>';
            }
            if (btnCad) btnCad.disabled = true;
            // Bloqueia todos os campos
            [nomeEl, emailEl, senhaEl, senha2El].forEach(function(el){ if (el) el.disabled = true; });
            return;
        }

        // ── Toggle visibilidade de senhas ─────────────────────────
        function _bindToggle(btnId, icoId, inputEl) {
            var btn = document.getElementById(btnId);
            var ico = document.getElementById(icoId);
            if (!btn || !ico || !inputEl) return;
            btn.addEventListener('click', function () {
                var tipo = inputEl.type === 'password' ? 'text' : 'password';
                inputEl.type = tipo;
                ico.className = tipo === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
            });
        }
        _bindToggle('toggle-senha-1', 'ico-senha-1', senhaEl);
        _bindToggle('toggle-senha-2', 'ico-senha-2', senha2El);

        // ── Indicador de força da senha ───────────────────────────
        var sbEls = [
            document.getElementById('sb1'), document.getElementById('sb2'),
            document.getElementById('sb3'), document.getElementById('sb4')
        ];
        var strengthLabel = document.getElementById('adm-strength-label');
        var strengthWrap  = document.getElementById('adm-strength-wrap');
        var reqLen  = document.getElementById('req-len');
        var reqUpp  = document.getElementById('req-upp');
        var reqNum  = document.getElementById('req-num');
        var reqEsp  = document.getElementById('req-esp');

        function _avaliarSenha(s) {
            var score = 0;
            var ok = {
                len: s.length >= 8,
                upp: /[A-Z]/.test(s),
                num: /[0-9]/.test(s),
                esp: /[^a-zA-Z0-9]/.test(s)
            };
            if (ok.len) score++;
            if (ok.upp) score++;
            if (ok.num) score++;
            if (ok.esp) score++;
            if (s.length >= 12) score = Math.min(4, score + 0.5);
            return { score: Math.round(score), ok: ok };
        }

        function _renderReq(el, ok) {
            if (!el) return;
            el.classList.toggle('ok', ok);
            el.querySelector('i').className = ok ? 'bi bi-check-circle-fill' : 'bi bi-circle';
        }

        function _renderStrength(score) {
            var cores  = ['#ef4444','#f97316','#FFC300','#22c55e'];
            var labels = ['Fraca','Razoável','Boa','Forte'];
            sbEls.forEach(function(b, i) {
                if (!b) return;
                b.style.background = i < score ? cores[Math.min(score-1, 3)] : 'rgba(255,255,255,.1)';
            });
            if (strengthLabel) {
                strengthLabel.textContent = score > 0 ? labels[Math.min(score-1,3)] : '';
                strengthLabel.style.color = score > 0 ? cores[Math.min(score-1,3)] : 'rgba(255,255,255,.4)';
            }
        }

        if (senhaEl) {
            senhaEl.addEventListener('input', function () {
                var s = senhaEl.value;
                if (strengthWrap) strengthWrap.style.display = s.length > 0 ? 'block' : 'none';
                var res = _avaliarSenha(s);
                _renderStrength(res.score);
                _renderReq(reqLen, res.ok.len);
                _renderReq(reqUpp, res.ok.upp);
                _renderReq(reqNum, res.ok.num);
                _renderReq(reqEsp, res.ok.esp);
                if (senha2El && senha2El.value) _verificarMatch();
            });
        }

        // ── Verificação de correspondência de senhas ──────────────
        function _verificarMatch() {
            if (!matchMsg || !senha2El) return;
            var match = senhaEl && senhaEl.value === senha2El.value;
            matchMsg.style.display = senha2El.value.length > 0 ? 'block' : 'none';
            matchMsg.innerHTML     = match
                ? '<i class="bi bi-check-circle-fill" style="color:#86efac;"></i> <span style="color:#86efac;">Senhas coincidem</span>'
                : '<i class="bi bi-x-circle-fill" style="color:#fca5a5;"></i> <span style="color:#fca5a5;">Senhas não coincidem</span>';
            if (senha2El) { senha2El.classList.toggle('ok', match); senha2El.classList.toggle('erro', !match && senha2El.value.length > 0); }
        }
        if (senha2El) senha2El.addEventListener('input', _verificarMatch);

        // ── Submit ────────────────────────────────────────────────
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (alertaEl) { alertaEl.innerHTML = ''; alertaEl.style.display = 'none'; }

            var nome   = (nomeEl   ? nomeEl.value.trim()   : '');
            var email  = (emailEl  ? emailEl.value.trim().toLowerCase() : '');
            var senha  = (senhaEl  ? senhaEl.value         : '');
            var senha2 = (senha2El ? senha2El.value        : '');
            var token  = (tokenEl  ? tokenEl.value.trim()  : '');

            // ── Validações ──────────────────────────────────────
            if (!nome || nome.length < 3) {
                _mostrarAlerta('erro', 'Informe o nome completo (mínimo 3 caracteres).');
                if (nomeEl) nomeEl.focus(); return;
            }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                _mostrarAlerta('erro', 'Informe um e-mail válido.');
                if (emailEl) emailEl.focus(); return;
            }

            var rx = /^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
            if (!rx.test(senha)) {
                _mostrarAlerta('erro', 'A senha não atende aos requisitos de segurança: mínimo 8 caracteres com maiúscula, número e especial.');
                if (senhaEl) senhaEl.focus(); return;
            }
            if (senha !== senha2) {
                _mostrarAlerta('erro', 'As senhas não coincidem.');
                if (senha2El) senha2El.focus(); return;
            }

            var usuariosAtuais = obterUsuariosCadastrados();

            // E-mail já existe
            if (usuariosAtuais[email]) {
                _mostrarAlerta('erro', 'Este e-mail já está cadastrado no sistema.');
                if (emailEl) emailEl.focus(); return;
            }

            // ── Verificação de autorização ──────────────────────
            var adminsAtuais = Object.keys(usuariosAtuais).filter(function(e){ return usuariosAtuais[e].tipo === 'admin'; });
            var temAdmAtual  = adminsAtuais.length > 0;
            var sessaoAtual2 = obterUsuarioLogado();
            var eSessAdm2    = sessaoAtual2 && sessaoAtual2.tipo === 'admin';

            if (temAdmAtual && !eSessAdm2) {
                _mostrarAlerta('erro', 'Acesso negado. Faça login como administrador para cadastrar novos admins.');
                return;
            }

            if (!temAdmAtual) {
                // Modo setup: valida token
                if (!token) {
                    _mostrarAlerta('erro', 'Informe o Token de Configuração.');
                    if (tokenEl) tokenEl.focus(); return;
                }
                if (token !== SETUP_TOKEN) {
                    _mostrarAlerta('erro', 'Token de configuração inválido.');
                    if (tokenEl) tokenEl.value = ''; tokenEl && tokenEl.focus();
                    return;
                }
                // Marca token como usado (informativo)
                try { localStorage.setItem(SETUP_USED, new Date().toISOString()); } catch(ex) {}
            }

            // ── Cria o admin ────────────────────────────────────
            usuariosAtuais[email] = {
                nome:          nome,
                senha:         senha,
                tipo:          'admin',
                dataCadastro:  new Date().toISOString(),
                criadoPor:     eSessAdm2 ? (sessaoAtual2.email || 'admin') : 'setup'
            };
            salvarUsuariosCadastrados(usuariosAtuais);

            if (btnCad) btnCad.disabled = true;
            _mostrarAlerta('sucesso',
                'Administrador <strong>' + nome.replace(/</g,'&lt;') + '</strong> cadastrado com sucesso! ' +
                'Redirecionando para o login…');

            setTimeout(function () {
                window.location.replace('/paginasSite/login.html?cadastro=sucesso');
            }, 1800);
        });
    }

    // =========================================================
    // SPRINT 3 — FAQ DINÂMICO COM EDIÇÃO ADMINISTRATIVA
    // (faqSite.html)
    // Leitores veem o FAQ normal.
    // Admins logados veem controles inline para:
    //   • Editar / excluir seções (grupos h4)
    //   • Reordenar seções (↑ ↓)
    //   • Editar / excluir grupos de perguntas (details/summary)
    //   • Adicionar novo grupo dentro de cada seção
    //   • Editar / excluir / reordenar itens individuais (faq-content)
    //   • Adicionar novo item dentro de cada grupo
    //   • Adicionar nova seção no topo via barra admin
    // Dados persistidos em localStorage: sgFaqDados
    // =========================================================
    function inicializarFaqSite() {
        var container = document.getElementById('faq-container-dinamico');
        if (!container) return;

        var FAQ_KEY   = 'sgFaqDados';
        var SEED_FLAG = 'sg_seed_faq_v1';

        // ── helpers ────────────────────────────────────────────
        function dbGet(k)   { try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; } }
        function dbSet(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }
        function _esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function _gid()     { return 'faq-' + Date.now() + '-' + Math.random().toString(36).slice(2,6); }

        function obterFaq()  { return dbGet(FAQ_KEY) || []; }
        function salvarFaq(d){ dbSet(FAQ_KEY, d); }

        // ── verifica se o usuário atual é admin ────────────────
        var usu    = null;
        var isAdm  = false;
        try { usu = obterUsuarioLogado(); isAdm = usu && usu.tipo === 'admin'; } catch(e) {}

        // ── seed com o conteúdo original do FAQ ───────────────
        function _seedFaq() {
            if (localStorage.getItem(SEED_FLAG) === '1') return;
            if ((dbGet(FAQ_KEY)||[]).length > 0) { localStorage.setItem(SEED_FLAG,'1'); return; }

            var dados = [
                {
                    id: _gid(), titulo: 'Tópicos de Ajuda (FAQs Categorizadas)',
                    publico: 'clientes', ordem: 0,
                    grupos: [
                        {
                            id: _gid(), titulo: 'Segurança e Confiança', ordem: 0,
                            itens: [
                                { id: _gid(), pergunta: 'É seguro contratar pela plataforma?',              resposta: 'Sim. Todos os prestadores passam por verificação de identidade e são avaliados pelos clientes após cada serviço realizado.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 0 },
                                { id: _gid(), pergunta: 'Como os profissionais são verificados?',           resposta: 'Os prestadores enviam documentos de identificação e comprovante de habilitação profissional, que são revisados pela nossa equipe.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 1 },
                                { id: _gid(), pergunta: 'Como cancelo um serviço agendado?',               resposta: 'Acesse "Minha Área" → "Serviços Agendados" e clique em "Cancelar" no serviço desejado. Cancelamentos com mais de 24h de antecedência não geram cobrança.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 2 }
                            ]
                        },
                        {
                            id: _gid(), titulo: 'Orçamentos, Pagamentos e Agendamento', ordem: 1,
                            itens: [
                                { id: _gid(), pergunta: 'Como peço um orçamento?',                                        resposta: 'Encontre o prestador em "Agendar Serviços", escolha a subcategoria desejada e clique em "Solicitar Orçamento". O prestador responderá com valor e data disponível.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 0 },
                                { id: _gid(), pergunta: 'O pagamento é feito pelo site ou direto para o profissional?',   resposta: 'O pagamento é combinado diretamente entre cliente e prestador na etapa de orçamento. A plataforma registra o acordo mas não processa pagamentos financeiros.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 1 },
                                { id: _gid(), pergunta: 'Como e quando eu recebo pelos meus serviços?',                   resposta: 'O recebimento ocorre conforme a forma de pagamento acordada com o cliente no orçamento (PIX, dinheiro, cartão, etc.).', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 2 },
                                { id: _gid(), pergunta: 'O que acontece se o cliente abrir uma disputa ou pedir reembolso?', resposta: 'Nossa equipe analisará o caso com base no histórico de mensagens e avaliações. Entre em contato pelo Suporte/Contato para abrir um chamado.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 3 },
                                { id: _gid(), pergunta: 'Como cancelo um serviço agendado?',                              resposta: 'Acesse sua área exclusiva → "Serviços Agendados" → "Cancelar". Para cancelamentos com menos de 24h, políticas específicas podem se aplicar.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 4 },
                                { id: _gid(), pergunta: 'O profissional pode alterar o valor do orçamento?',              resposta: 'Não após a confirmação. O valor só pode ser renegociado antes da confirmação pelo cliente. Após confirmado, qualquer alteração precisa ser comunicada e aceita pelo cliente.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 5 }
                            ]
                        },
                        {
                            id: _gid(), titulo: 'Resolvendo Problemas', ordem: 2,
                            itens: [
                                { id: _gid(), pergunta: 'O profissional não apareceu. O que eu faço?',                   resposta: 'Tente contato pelo chat da plataforma. Se não houver resposta em 30 minutos, acione nosso suporte pelo Contato. O serviço poderá ser cancelado sem custo.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 0 },
                                { id: _gid(), pergunta: 'O serviço foi malfeito ou não foi concluído. O que faço?',      resposta: 'Não confirme a conclusão do serviço. Registre um ticket de suporte com fotos e a descrição do problema para que possamos mediar.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 1 },
                                { id: _gid(), pergunta: 'O profissional cobrou um valor diferente do combinado.',        resposta: 'Não efetue o pagamento. Entre em contato com nosso suporte imediatamente com o registro do orçamento aprovado.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 2 },
                                { id: _gid(), pergunta: 'O profissional quebrou ou danificou algo na minha casa.',       resposta: 'Documente com fotos e entre em contato com o suporte. Recomendamos registrar um boletim de ocorrência em casos de danos expressivos.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 3 }
                            ]
                        },
                        {
                            id: _gid(), titulo: 'Problemas Graves de Segurança ou Conduta', ordem: 3,
                            itens: [
                                { id: _gid(), pergunta: 'Tive um problema grave (suspeita de roubo, assédio, ameaça, racismo, perseguição).', resposta: 'Sua segurança é prioridade. Em situações de emergência ligue 190. Para denúncias na plataforma use os botões abaixo.', denuncia: true, denunciaPrest: true, denunciaCli: true, ordem: 0 }
                            ]
                        }
                    ]
                },
                {
                    id: _gid(), titulo: 'Tópicos de Ajuda para Prestadores de Serviços',
                    publico: 'prestadores', ordem: 1,
                    grupos: [
                        {
                            id: _gid(), titulo: 'Suporte para Prestadores de Serviços', ordem: 0,
                            itens: [
                                { id: _gid(), pergunta: 'Como configuro meu perfil para atrair clientes?',        resposta: 'Preencha completamente o seu HotSite: foto de perfil, descrição detalhada, portfólio de fotos, subcategorias e formas de pagamento aceitas.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 0 },
                                { id: _gid(), pergunta: 'Como funciona a verificação de perfil e documentos?',    resposta: 'Após o cadastro, você pode enviar documentos pelo seu perfil. A verificação ocorre em até 3 dias úteis e adiciona um selo de confiança ao seu HotSite.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 1 },
                                { id: _gid(), pergunta: 'Como adiciono fotos ao meu portfólio?',                  resposta: 'Acesse "Meu Hot Site" → "Galeria de Fotos" e faça o upload de imagens dos seus trabalhos realizados.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 2 },
                                { id: _gid(), pergunta: 'Como envio um orçamento?',                               resposta: 'Em "Meus Agendamentos" → aba "Pendentes", abra o detalhe da solicitação e preencha valor e forma de pagamento para enviar o orçamento ao cliente.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 3 },
                                { id: _gid(), pergunta: 'O cliente não me pagou (calote). O que eu faço?',        resposta: 'Registre um ticket de suporte com o histórico do serviço. Você também pode denunciar o cliente pelo botão abaixo.', denuncia: true, denunciaPrest: false, denunciaCli: true, ordem: 4 },
                                { id: _gid(), pergunta: 'O cliente me deu uma nota injusta. Posso recorrer?',     resposta: 'Sim. Acesse "Avaliações Recebidas" e use o botão de contestação. Nossa equipe analisará o caso em até 5 dias úteis.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 5 }
                            ]
                        }
                    ]
                },
                {
                    id: _gid(), titulo: 'Acesso e Conta (Para todos os usuários)',
                    publico: 'geral', ordem: 2,
                    grupos: [
                        {
                            id: _gid(), titulo: 'Gerenciamento e Recuperação de Conta', ordem: 0,
                            itens: [
                                { id: _gid(), pergunta: 'Não consigo conectar a minha conta (e-mail ou senha incorreta).',  resposta: 'Verifique se o e-mail está correto. Se a senha estiver errada, use "Esqueci minha senha" na tela de login para redefini-la.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 0 },
                                { id: _gid(), pergunta: 'Como recupero minha senha?',                                       resposta: 'Na tela de login, clique em "Esqueci minha senha", informe seu e-mail cadastrado e siga as instruções enviadas.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 1 },
                                { id: _gid(), pergunta: 'Como altero meu e-mail ou telefone de cadastro?',                  resposta: 'Acesse "Meu Perfil" → "Editar Dados Pessoais" e atualize as informações desejadas.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 2 },
                                { id: _gid(), pergunta: 'Minha conta está inválida ou suspensa. O que faço?',              resposta: 'Entre em contato com nosso suporte pelo Fale Conosco informando seu e-mail cadastrado. Responderemos em até 48h.', denuncia: false, denunciaPrest: false, denunciaCli: false, ordem: 3 }
                            ]
                        }
                    ]
                }
            ];
            salvarFaq(dados);
            localStorage.setItem(SEED_FLAG, '1');
        }
        _seedFaq();

        // ── renderização principal ─────────────────────────────
        function _renderFaq() {
            var dados = obterFaq();
            dados.sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });

            // Barra admin
            var barraEl = document.getElementById('faq-admin-bar');
            if (barraEl) {
                if (isAdm) {
                    barraEl.style.display = 'block';
                    barraEl.innerHTML =
                        '<div class="faq-admin-bar">' +
                            '<span class="faq-admin-bar-badge"><i class="bi bi-shield-fill-check"></i>Modo Admin</span>' +
                            '<span class="faq-admin-bar-info">Você pode editar, reordenar e excluir seções, grupos e itens do FAQ.</span>' +
                            '<button class="btn-faq-adm btn-faq-nova-secao" id="faq-btn-nova-secao-top">' +
                                '<i class="bi bi-folder-plus"></i> Nova Seção' +
                            '</button>' +
                        '</div>';
                    document.getElementById('faq-btn-nova-secao-top').addEventListener('click', function(){
                        _abrirModalSecao(null);
                    });
                } else {
                    barraEl.style.display = 'none';
                }
            }

            var html = '';
            dados.forEach(function(sec, secIdx){
                var classeModo = isAdm ? 'faq-secao-bloco adm-mode' : 'faq-secao-bloco';
                html += '<div class="' + classeModo + '" data-sec-id="' + _esc(sec.id) + '">';

                // Header da seção
                html += '<hr class="titulo-divisor-faq">';
                if (isAdm) {
                    html +=
                        '<div class="faq-grupo-header">' +
                        '<h4>' + _esc(sec.titulo) + '</h4>' +
                        '<div class="faq-adm-controls">' +
                            (secIdx > 0
                                ? '<button class="faq-btn-adm mover-cima" title="Mover seção para cima" data-acao="mover-sec-cima" data-sec-id="' + _esc(sec.id) + '"><i class="bi bi-arrow-up"></i></button>'
                                : '') +
                            (secIdx < dados.length-1
                                ? '<button class="faq-btn-adm mover-baixo" title="Mover seção para baixo" data-acao="mover-sec-baixo" data-sec-id="' + _esc(sec.id) + '"><i class="bi bi-arrow-down"></i></button>'
                                : '') +
                            '<button class="faq-btn-adm editar-sec" data-acao="editar-sec" data-sec-id="' + _esc(sec.id) + '"><i class="bi bi-pencil"></i> Editar</button>' +
                            '<button class="faq-btn-adm add-item" data-acao="novo-grupo" data-sec-id="' + _esc(sec.id) + '"><i class="bi bi-plus-circle"></i> Novo Grupo</button>' +
                            '<button class="faq-btn-adm excluir-sec" data-acao="excluir-sec" data-sec-id="' + _esc(sec.id) + '" data-sec-titulo="' + _esc(sec.titulo) + '"><i class="bi bi-trash"></i></button>' +
                        '</div></div>';
                } else {
                    html += '<h4>' + _esc(sec.titulo) + '</h4>';
                }

                // Grupos (details)
                var grupos = (sec.grupos||[]).slice().sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
                grupos.forEach(function(grp, grpIdx){
                    html += '<details data-grp-id="' + _esc(grp.id) + '">';

                    // Summary com controles admin
                    if (isAdm) {
                        html +=
                            '<summary style="list-style:none;">' +
                            '<div class="faq-summary-row">' +
                                '<span class="faq-summary-texto">' + _esc(grp.titulo) + '</span>' +
                                '<div class="faq-adm-controls">' +
                                    (grpIdx > 0
                                        ? '<button class="faq-btn-adm mover-cima" title="Subir grupo" data-acao="mover-grp-cima" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '"><i class="bi bi-arrow-up"></i></button>'
                                        : '') +
                                    (grpIdx < grupos.length-1
                                        ? '<button class="faq-btn-adm mover-baixo" title="Descer grupo" data-acao="mover-grp-baixo" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '"><i class="bi bi-arrow-down"></i></button>'
                                        : '') +
                                    '<button class="faq-btn-adm editar-sum" data-acao="editar-grp" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '" data-grp-titulo="' + _esc(grp.titulo) + '"><i class="bi bi-pencil"></i> Editar</button>' +
                                    '<button class="faq-btn-adm excluir-det" data-acao="excluir-grp" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '" data-grp-titulo="' + _esc(grp.titulo) + '"><i class="bi bi-trash"></i></button>' +
                                '</div>' +
                            '</div></summary>';
                    } else {
                        html += '<summary>' + _esc(grp.titulo) + '</summary>';
                    }

                    // Itens (faq-content)
                    var itens = (grp.itens||[]).slice().sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
                    itens.forEach(function(item, itIdx){
                        html += '<div class="faq-content" data-item-id="' + _esc(item.id) + '">';
                        if (isAdm) {
                            html +=
                                '<div class="faq-content-row">' +
                                '<div class="faq-content-corpo">' +
                                    '<p><strong>' + _esc(item.pergunta) + '</strong></p>' +
                                    '<p style="color:#555;">' + _esc(item.resposta) + '</p>' +
                                    (item.denuncia ? _renderBotoesDenuncia(item) : '') +
                                '</div>' +
                                '<div class="faq-adm-controls">' +
                                    (itIdx > 0
                                        ? '<button class="faq-btn-adm mover-cima" title="Subir item" data-acao="mover-item-cima" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '" data-item-id="' + _esc(item.id) + '"><i class="bi bi-arrow-up"></i></button>'
                                        : '') +
                                    (itIdx < itens.length-1
                                        ? '<button class="faq-btn-adm mover-baixo" title="Descer item" data-acao="mover-item-baixo" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '" data-item-id="' + _esc(item.id) + '"><i class="bi bi-arrow-down"></i></button>'
                                        : '') +
                                    '<button class="faq-btn-adm editar-item" data-acao="editar-item" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '" data-item-id="' + _esc(item.id) + '"><i class="bi bi-pencil"></i></button>' +
                                    '<button class="faq-btn-adm excluir-item" data-acao="excluir-item" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '" data-item-id="' + _esc(item.id) + '" data-pergunta="' + _esc(item.pergunta) + '"><i class="bi bi-trash"></i></button>' +
                                '</div></div>';
                        } else {
                            html +=
                                '<p><strong>' + _esc(item.pergunta) + '</strong></p>' +
                                '<p style="color:#555;">' + _esc(item.resposta) + '</p>' +
                                (item.denuncia ? _renderBotoesDenuncia(item) : '');
                        }
                        html += '</div>'; // faq-content
                    });

                    // Botão "Novo Item" ao final do grupo (só admin)
                    if (isAdm) {
                        html +=
                            '<div class="faq-add-item-btn-wrap">' +
                            '<button class="faq-btn-adm add-item" data-acao="novo-item" data-sec-id="' + _esc(sec.id) + '" data-grp-id="' + _esc(grp.id) + '">' +
                                '<i class="bi bi-plus-circle"></i> Novo Item de FAQ' +
                            '</button></div>';
                    }

                    html += '</details>';
                });

                html += '</div>'; // faq-secao-bloco
            });

            container.innerHTML = html;
            _bindEventos();
        }

        // ── render botões de denúncia ──────────────────────────
        function _renderBotoesDenuncia(item) {
            var btns = '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">';
            if (item.denunciaPrest) btns += '<button class="btn btn-danger btn-sm" type="button">Denunciar Prestador de Serviço</button>';
            if (item.denunciaCli)   btns += '<button class="btn btn-danger btn-sm" type="button">Denunciar Cliente</button>';
            btns += '</div>';
            return btns;
        }

        // ── bind de todos os eventos de edição ─────────────────
        function _bindEventos() {
            if (!isAdm) return;
            container.querySelectorAll('[data-acao]').forEach(function(btn){
                btn.addEventListener('click', function(e){
                    e.stopPropagation(); // evita abrir/fechar o details ao clicar no botão
                    var acao    = btn.dataset.acao;
                    var secId   = btn.dataset.secId   || '';
                    var grpId   = btn.dataset.grpId   || '';
                    var itemId  = btn.dataset.itemId  || '';

                    // ── Seções ───────────────────────────────────
                    if (acao === 'editar-sec') {
                        _abrirModalSecao(secId);
                    }
                    if (acao === 'excluir-sec') {
                        _confirmarExcluir(
                            'Excluir a seção <strong>' + _esc(btn.dataset.secTitulo) + '</strong> e todos os seus grupos e itens?',
                            function(){ _excluirSecao(secId); }
                        );
                    }
                    if (acao === 'mover-sec-cima')  { _moverSecao(secId, -1); }
                    if (acao === 'mover-sec-baixo') { _moverSecao(secId, +1); }

                    // ── Grupos ───────────────────────────────────
                    if (acao === 'novo-grupo') {
                        _abrirModalGrupo(secId, null);
                    }
                    if (acao === 'editar-grp') {
                        _abrirModalGrupo(secId, grpId);
                    }
                    if (acao === 'excluir-grp') {
                        _confirmarExcluir(
                            'Excluir o grupo <strong>' + _esc(btn.dataset.grpTitulo) + '</strong> e todos os seus itens?',
                            function(){ _excluirGrupo(secId, grpId); }
                        );
                    }
                    if (acao === 'mover-grp-cima')  { _moverGrupo(secId, grpId, -1); }
                    if (acao === 'mover-grp-baixo') { _moverGrupo(secId, grpId, +1); }

                    // ── Itens ────────────────────────────────────
                    if (acao === 'novo-item') {
                        _abrirModalItem(secId, grpId, null);
                    }
                    if (acao === 'editar-item') {
                        _abrirModalItem(secId, grpId, itemId);
                    }
                    if (acao === 'excluir-item') {
                        _confirmarExcluir(
                            'Excluir o item: <em>' + _esc(btn.dataset.pergunta) + '</em>?',
                            function(){ _excluirItem(secId, grpId, itemId); }
                        );
                    }
                    if (acao === 'mover-item-cima')  { _moverItem(secId, grpId, itemId, -1); }
                    if (acao === 'mover-item-baixo') { _moverItem(secId, grpId, itemId, +1); }
                });
            });
        }

        // ── MODAL: Seção ───────────────────────────────────────
        function _abrirModalSecao(secId) {
            var titEl = document.getElementById('faq-modal-secao-titulo');
            var idEl  = document.getElementById('faq-secao-id');
            var tEd   = document.getElementById('faq-secao-titulo-input');
            var pEd   = document.getElementById('faq-secao-publico');
            if (!titEl || !idEl || !tEd || !pEd) return;

            titEl.innerHTML = secId
                ? '<i class="bi bi-pencil-square me-2"></i>Editar Seção'
                : '<i class="bi bi-folder-plus me-2"></i>Nova Seção';
            idEl.value  = secId || '';
            tEd.value   = '';
            pEd.value   = 'geral';

            if (secId) {
                var sec = obterFaq().find(function(s){ return s.id === secId; });
                if (sec) { tEd.value = sec.titulo; pEd.value = sec.publico || 'geral'; }
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalFaqSecao')).show();
        }

        document.getElementById('faq-btn-salvar-secao').addEventListener('click', function(){
            var secId  = document.getElementById('faq-secao-id').value.trim();
            var titulo = document.getElementById('faq-secao-titulo-input').value.trim();
            var publi  = document.getElementById('faq-secao-publico').value;
            if (!titulo) { alert('Informe o título da seção.'); return; }

            var dados = obterFaq();
            if (secId) {
                var idx = dados.findIndex(function(s){ return s.id === secId; });
                if (idx >= 0) { dados[idx].titulo = titulo; dados[idx].publico = publi; }
            } else {
                var maxOrdem = dados.reduce(function(m,s){ return Math.max(m, s.ordem||0); }, -1);
                dados.push({ id: _gid(), titulo: titulo, publico: publi, ordem: maxOrdem+1, grupos: [] });
            }
            salvarFaq(dados);
            bootstrap.Modal.getInstance(document.getElementById('modalFaqSecao')).hide();
            _renderFaq();
            _exibirToastFaq(secId ? 'Seção atualizada!' : 'Nova seção criada!');
        });

        // ── MODAL: Grupo ───────────────────────────────────────
        function _abrirModalGrupo(secId, grpId) {
            var titEl = document.getElementById('faq-modal-grupo-titulo');
            var sEl   = document.getElementById('faq-grupo-secao-id');
            var gEl   = document.getElementById('faq-grupo-id');
            var tEl   = document.getElementById('faq-grupo-titulo-input');
            if (!titEl||!sEl||!gEl||!tEl) return;

            titEl.innerHTML = grpId
                ? '<i class="bi bi-pencil-square me-2"></i>Editar Grupo de Perguntas'
                : '<i class="bi bi-collection me-2"></i>Novo Grupo de Perguntas';
            sEl.value = secId;
            gEl.value = grpId || '';
            tEl.value = '';

            if (grpId) {
                var sec = obterFaq().find(function(s){ return s.id === secId; });
                if (sec) {
                    var grp = (sec.grupos||[]).find(function(g){ return g.id === grpId; });
                    if (grp) tEl.value = grp.titulo;
                }
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalFaqGrupo')).show();
        }

        document.getElementById('faq-btn-salvar-grupo').addEventListener('click', function(){
            var secId  = document.getElementById('faq-grupo-secao-id').value;
            var grpId  = document.getElementById('faq-grupo-id').value.trim();
            var titulo = document.getElementById('faq-grupo-titulo-input').value.trim();
            if (!titulo) { alert('Informe o título do grupo.'); return; }

            var dados = obterFaq();
            var sec   = dados.find(function(s){ return s.id === secId; });
            if (!sec) return;
            sec.grupos = sec.grupos || [];

            if (grpId) {
                var g = sec.grupos.find(function(x){ return x.id === grpId; });
                if (g) g.titulo = titulo;
            } else {
                var maxO = sec.grupos.reduce(function(m,g){ return Math.max(m, g.ordem||0); }, -1);
                sec.grupos.push({ id: _gid(), titulo: titulo, ordem: maxO+1, itens: [] });
            }
            salvarFaq(dados);
            bootstrap.Modal.getInstance(document.getElementById('modalFaqGrupo')).hide();
            _renderFaq();
            _exibirToastFaq(grpId ? 'Grupo atualizado!' : 'Novo grupo criado!');
        });

        // ── MODAL: Item ────────────────────────────────────────
        var _denunciaToggle = document.getElementById('faq-item-tem-denuncia');
        var _denunciaOps    = document.getElementById('faq-item-denuncia-opcoes');
        if (_denunciaToggle && _denunciaOps) {
            _denunciaToggle.addEventListener('change', function(){
                _denunciaOps.style.display = this.checked ? 'block' : 'none';
            });
        }

        function _abrirModalItem(secId, grpId, itemId) {
            var titEl  = document.getElementById('faq-modal-item-titulo');
            var sEl    = document.getElementById('faq-item-secao-id');
            var gEl    = document.getElementById('faq-item-grupo-id');
            var iEl    = document.getElementById('faq-item-id');
            var pEl    = document.getElementById('faq-item-pergunta');
            var rEl    = document.getElementById('faq-item-resposta');
            var dEl    = document.getElementById('faq-item-tem-denuncia');
            var dpEl   = document.getElementById('faq-item-denuncia-prest');
            var dcEl   = document.getElementById('faq-item-denuncia-cli');
            var dopEl  = document.getElementById('faq-item-denuncia-opcoes');
            if (!titEl||!sEl||!gEl||!iEl||!pEl||!rEl||!dEl) return;

            titEl.innerHTML = itemId
                ? '<i class="bi bi-pencil-square me-2"></i>Editar Item de FAQ'
                : '<i class="bi bi-question-circle me-2"></i>Novo Item de FAQ';
            sEl.value  = secId;
            gEl.value  = grpId;
            iEl.value  = itemId || '';
            pEl.value  = '';
            rEl.value  = '';
            dEl.checked = false;
            if (dpEl) dpEl.checked = true;
            if (dcEl) dcEl.checked = true;
            if (dopEl) dopEl.style.display = 'none';

            if (itemId) {
                var sec = obterFaq().find(function(s){ return s.id === secId; });
                if (sec) {
                    var grp = (sec.grupos||[]).find(function(g){ return g.id === grpId; });
                    if (grp) {
                        var item = (grp.itens||[]).find(function(it){ return it.id === itemId; });
                        if (item) {
                            pEl.value   = item.pergunta  || '';
                            rEl.value   = item.resposta  || '';
                            dEl.checked = !!item.denuncia;
                            if (dpEl) dpEl.checked = !!item.denunciaPrest;
                            if (dcEl) dcEl.checked = !!item.denunciaCli;
                            if (dopEl) dopEl.style.display = item.denuncia ? 'block' : 'none';
                        }
                    }
                }
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalFaqItem')).show();
        }

        document.getElementById('faq-btn-salvar-item').addEventListener('click', function(){
            var secId    = document.getElementById('faq-item-secao-id').value;
            var grpId    = document.getElementById('faq-item-grupo-id').value;
            var itemId   = document.getElementById('faq-item-id').value.trim();
            var pergunta = document.getElementById('faq-item-pergunta').value.trim();
            var resposta = document.getElementById('faq-item-resposta').value.trim();
            var denuncia = document.getElementById('faq-item-tem-denuncia').checked;
            var denPrest = denuncia && document.getElementById('faq-item-denuncia-prest').checked;
            var denCli   = denuncia && document.getElementById('faq-item-denuncia-cli').checked;

            if (!pergunta || !resposta) { alert('Pergunta e resposta são obrigatórias.'); return; }

            var dados = obterFaq();
            var sec   = dados.find(function(s){ return s.id === secId; });
            if (!sec) return;
            var grp = (sec.grupos||[]).find(function(g){ return g.id === grpId; });
            if (!grp) return;
            grp.itens = grp.itens || [];

            if (itemId) {
                var it = grp.itens.find(function(x){ return x.id === itemId; });
                if (it) {
                    it.pergunta = pergunta; it.resposta = resposta;
                    it.denuncia = denuncia; it.denunciaPrest = denPrest; it.denunciaCli = denCli;
                }
            } else {
                var maxO2 = grp.itens.reduce(function(m,x){ return Math.max(m, x.ordem||0); }, -1);
                grp.itens.push({ id: _gid(), pergunta: pergunta, resposta: resposta, denuncia: denuncia, denunciaPrest: denPrest, denunciaCli: denCli, ordem: maxO2+1 });
            }
            salvarFaq(dados);
            bootstrap.Modal.getInstance(document.getElementById('modalFaqItem')).hide();
            _renderFaq();
            _exibirToastFaq(itemId ? 'Item atualizado!' : 'Novo item adicionado!');
        });

        // ── exclusões ──────────────────────────────────────────
        function _excluirSecao(secId) {
            salvarFaq(obterFaq().filter(function(s){ return s.id !== secId; }));
            _renderFaq();
            _exibirToastFaq('Seção excluída.');
        }

        function _excluirGrupo(secId, grpId) {
            var dados = obterFaq();
            var sec   = dados.find(function(s){ return s.id === secId; });
            if (sec) sec.grupos = (sec.grupos||[]).filter(function(g){ return g.id !== grpId; });
            salvarFaq(dados);
            _renderFaq();
            _exibirToastFaq('Grupo excluído.');
        }

        function _excluirItem(secId, grpId, itemId) {
            var dados = obterFaq();
            var sec   = dados.find(function(s){ return s.id === secId; });
            if (sec) {
                var grp = (sec.grupos||[]).find(function(g){ return g.id === grpId; });
                if (grp) grp.itens = (grp.itens||[]).filter(function(i){ return i.id !== itemId; });
            }
            salvarFaq(dados);
            _renderFaq();
            _exibirToastFaq('Item excluído.');
        }

        // ── movimentação de ordem ──────────────────────────────
        function _moverSecao(secId, dir) {
            var dados = obterFaq().slice().sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
            var idx   = dados.findIndex(function(s){ return s.id === secId; });
            var novo  = idx + dir;
            if (novo < 0 || novo >= dados.length) return;
            var tmp = dados[idx].ordem; dados[idx].ordem = dados[novo].ordem; dados[novo].ordem = tmp;
            salvarFaq(dados);
            _renderFaq();
        }

        function _moverGrupo(secId, grpId, dir) {
            var dados = obterFaq();
            var sec   = dados.find(function(s){ return s.id === secId; });
            if (!sec) return;
            var grupos = (sec.grupos||[]).slice().sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
            var idx    = grupos.findIndex(function(g){ return g.id === grpId; });
            var novo   = idx + dir;
            if (novo < 0 || novo >= grupos.length) return;
            var tmp = grupos[idx].ordem; grupos[idx].ordem = grupos[novo].ordem; grupos[novo].ordem = tmp;
            sec.grupos = grupos;
            salvarFaq(dados);
            _renderFaq();
        }

        function _moverItem(secId, grpId, itemId, dir) {
            var dados = obterFaq();
            var sec   = dados.find(function(s){ return s.id === secId; });
            if (!sec) return;
            var grp   = (sec.grupos||[]).find(function(g){ return g.id === grpId; });
            if (!grp) return;
            var itens = (grp.itens||[]).slice().sort(function(a,b){ return (a.ordem||0)-(b.ordem||0); });
            var idx   = itens.findIndex(function(i){ return i.id === itemId; });
            var novo  = idx + dir;
            if (novo < 0 || novo >= itens.length) return;
            var tmp = itens[idx].ordem; itens[idx].ordem = itens[novo].ordem; itens[novo].ordem = tmp;
            grp.itens = itens;
            salvarFaq(dados);
            _renderFaq();
        }

        // ── modal de confirmação de exclusão ───────────────────
        function _confirmarExcluir(msg, cb) {
            var corpoEl = document.getElementById('faq-conf-corpo');
            if (corpoEl) corpoEl.innerHTML = '<p>' + msg + '</p>';
            var btnConf = document.getElementById('faq-btn-conf-excluir');
            var novo = btnConf.cloneNode(true);
            btnConf.parentNode.replaceChild(novo, btnConf);
            novo.addEventListener('click', function(){
                bootstrap.Modal.getInstance(document.getElementById('modalFaqConfirmar')).hide();
                cb();
            });
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalFaqConfirmar')).show();
        }

        // ── toast ──────────────────────────────────────────────
        function _exibirToastFaq(msg) {
            // reutiliza o toast existente no script.js, se disponível, senão cria um simples
            var toastEl = document.getElementById('toastNotificacao');
            var toastMsg = document.getElementById('toast-mensagem');
            if (toastEl && toastMsg && window.bootstrap && bootstrap.Toast) {
                toastMsg.textContent = msg;
                bootstrap.Toast.getOrCreateInstance(toastEl).show();
            }
        }

        // ── render inicial ─────────────────────────────────────
        _renderFaq();
    }

    // =========================================================
    // SPRINT 3 — ENVIO DE DÚVIDA DO FAQ PARA O SUPORTE ADMIN
    // (faqSite.html)
    //
    // Funcionalidades:
    //  • Captura o textarea#mensagem da seção "Não encontrou sua dúvida?"
    //  • Valida preenchimento mínimo antes de salvar
    //  • Cria ticket com status 'aberto' na chave sgTickets
    //    (mesma usada por inicializarFormContato e adminGerenciamento)
    //  • Preenche nome/e-mail automaticamente se o usuário estiver logado
    //  • Exibe feedback inline de sucesso com número do chamado
    //  • Limpa o campo após envio bem-sucedido
    // =========================================================
    function inicializarFaqEnviarDuvida() {
        var btn      = document.getElementById('faq-btn-enviar-duvida');
        var textarea = document.getElementById('mensagem');
        if (!btn || !textarea) return;

        var feedbackEl = document.getElementById('faq-enviar-feedback');

        function _mostrarFeedback(tipo, html) {
            if (!feedbackEl) return;
            var cls = tipo === 'sucesso' ? 'alert-success' :
                      tipo === 'erro'    ? 'alert-danger'  : 'alert-warning';
            feedbackEl.style.display = 'block';
            feedbackEl.innerHTML = '<div class="alert ' + cls + ' py-2 mb-0">' + html + '</div>';
        }

        function _esconderFeedback() {
            if (feedbackEl) { feedbackEl.style.display = 'none'; feedbackEl.innerHTML = ''; }
        }

        function _setBtnEstado(carregando) {
            btn.disabled = carregando;
            btn.innerHTML = carregando
                ? '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Enviando…'
                : '<i class="bi bi-send me-1"></i>Enviar';
        }

        btn.addEventListener('click', function () {
            _esconderFeedback();

            var texto = textarea.value.trim();

            if (!texto) {
                _mostrarFeedback('erro',
                    '<i class="bi bi-exclamation-triangle me-2"></i>' +
                    'Por favor, escreva sua dúvida antes de enviar.');
                textarea.focus();
                return;
            }
            if (texto.length < 10) {
                _mostrarFeedback('erro',
                    '<i class="bi bi-exclamation-triangle me-2"></i>' +
                    'Sua mensagem é muito curta. Descreva melhor sua dúvida.');
                textarea.focus();
                return;
            }

            _setBtnEstado(true);

            var usu    = obterUsuarioLogado();
            var nome   = usu ? (usu.nome  || usu.email || 'Visitante') : 'Visitante';
            var email  = usu ? (usu.email || 'nao-informado@faq.servgo') : 'nao-informado@faq.servgo';
            var tipo   = usu ? (usu.tipo  || 'visitante') : 'visitante';

            var ticket = {
                id:               _gerarId('ticket'),
                assunto:          'Dúvida via FAQ',
                mensagem:         texto,
                nome:             nome,
                email:            email,
                origem:           'faq',
                tipoUsuario:      tipo,
                dataAbertura:     new Date().toISOString(),
                status:           'aberto',
                resposta:         '',
                dataResposta:     '',
                adminResponsavel: '',
                modoEnvio:        sgObterModo(),
                anexo:            null
            };

            var tickets = sgObterTickets();
            tickets.push(ticket);
            sgSalvarTickets(tickets);

            setTimeout(function () {
                _setBtnEstado(false);
                _mostrarFeedback('sucesso',
                    '<div style="font-weight:700;margin-bottom:4px;">' +
                    '<i class="bi bi-check-circle-fill me-2"></i>Dúvida enviada com sucesso!</div>' +
                    '<div style="font-size:.88rem;">Chamado registrado: <strong>#' + ticket.id + '</strong>. ' +
                    'Nossa equipe de suporte irá analisar e responder em breve.</div>');
                textarea.value = '';
            }, 500);
        });
    }

    // =========================================================
    // SPRINT 2 — GERENCIAMENTO ADMINISTRATIVO
    // (adminGerenciamento.html)
    // Oferece: gestão de usuários, prestadores, notícias,
    // tickets de suporte e ferramentas de manutenção do sistema.
    // =========================================================
    function inicializarAdminGerenciamento() {
        var mainEl = document.getElementById('admin-ger-main');
        if (!mainEl) return;

        var usu = obterUsuarioLogado();
        if (!usu || usu.tipo !== 'admin') {
            SG_Auth.guardPagina(['admin'], '/paginasSite/login.html');
            return;
        }

        // ── Atualiza saudação ──────────────────────────────────
        var saudEl = document.getElementById('adm-saudacao-navbar');
        if (saudEl) saudEl.textContent = 'Admin: ' + (usu.nome || usu.email);

        // Seed de notícias iniciais (1 vez por device)
        _adminSeedNoticias();

        // ── Chaves de armazenamento ────────────────────────────
        var NOTICIAS_KEY = 'sgNoticias';
        var TICKETS_KEY  = 'sgTickets';

        function dbGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; } }
        function dbSet(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e) { return false; } }

        function obterNoticias() { return dbGet(NOTICIAS_KEY) || []; }
        function salvarNoticias(arr) { dbSet(NOTICIAS_KEY, arr); }
        function obterTickets()  { return dbGet(TICKETS_KEY)  || []; }
        function salvarTickets(arr)  { dbSet(TICKETS_KEY,  arr); }

        function _esc(s) {
            return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
        function _fmtData(iso) {
            if (!iso) return '—';
            try { return new Date(iso).toLocaleDateString('pt-BR'); } catch(e) { return iso; }
        }
        function _gerarId(prefix) {
            return (prefix||'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
        }
        function _avatarCor(nome) {
            var cores = ['#146ADB','#198754','#6f42c1','#0dcaf0','#fd7e14','#dc3545','#b8870c'];
            var idx = 0;
            for (var i=0; i<(nome||'').length; i++) idx += nome.charCodeAt(i);
            return cores[idx % cores.length];
        }

        // ── Atualiza badges da sidebar ─────────────────────────
        function _atualizarBadges() {
            var usuarios    = obterUsuariosCadastrados();
            var qtdUsu      = Object.keys(usuarios).length;
            var qtdPrest    = Object.keys(dbGet('hotsitePrestadorDados') || {}).length;
            var qtdNot      = obterNoticias().filter(function(n){ return n.status === 'rascunho'; }).length;
            var qtdTickets  = obterTickets().filter(function(t){ return t.status === 'aberto'; }).length;
            var qtdNewsl    = sgNewsletterObterInscritos().length;

            function _setBadge(id, val) {
                var el = document.getElementById(id);
                if (!el) return;
                if (val > 0) { el.textContent = val; el.style.display = 'inline-block'; }
                else { el.style.display = 'none'; }
            }
            _setBadge('adm-badge-usuarios',    qtdUsu);
            _setBadge('adm-badge-prestadores', qtdPrest);
            _setBadge('adm-badge-noticias',    qtdNot);
            _setBadge('adm-badge-suporte',     qtdTickets);
            _setBadge('adm-badge-newsletter',  qtdNewsl);
        }
        _atualizarBadges();

        // ── Navegação entre seções (SPA) ───────────────────────
        var secAtiva = 'visao-geral';
        var loaders  = {
            'visao-geral': _carregarVisaoGeral,
            'usuarios':    _carregarUsuarios,
            'prestadores': _carregarPrestadores,
            'noticias':    _carregarNoticias,
            'newsletter':  _carregarNewsletter,
            'suporte':     _carregarSupporte,
            'planos':      _carregarPlanos,
            'financeiro':  _carregarFinanceiro,
            'manutencao':  _carregarManutencao
        };

        function _navegarPara(sec) {
            secAtiva = sec;
            // Oculta todas
            mainEl.querySelectorAll('.admin-secao').forEach(function(el){
                el.style.display = 'none';
            });
            var alvo = document.getElementById('sec-' + sec);
            if (alvo) alvo.style.display = '';
            // Atualiza sidebar
            document.querySelectorAll('#admin-ger-sidebar li a[data-sec]').forEach(function(a){
                if (a.dataset.sec === sec) a.classList.add('prest-nav-ativo');
                else                       a.classList.remove('prest-nav-ativo');
            });
            // Carrega conteúdo
            if (loaders[sec]) loaders[sec]();
        }

        document.querySelectorAll('#admin-ger-sidebar li a[data-sec]').forEach(function(a){
            a.addEventListener('click', function(e){
                e.preventDefault();
                _navegarPara(a.dataset.sec);
            });
        });

        // SPRINT 8 — Em telas mobile, fecha o menu lateral automaticamente após
        // selecionar uma seção, evitando que ele fique cobrindo o conteúdo.
        // Adicionado como listener independente para não alterar o handler
        // de navegação já existente acima.
        (function () {
            var sidebarAdm = document.getElementById('admin-ger-sidebar');
            if (!sidebarAdm) return;
            sidebarAdm.querySelectorAll('li a[data-sec]').forEach(function (a) {
                a.addEventListener('click', function () {
                    if (window.innerWidth < 992) sidebarAdm.classList.remove('prest-sidebar-show');
                });
            });
        }());

        // Sair limpa sessão
        var btnSair = document.getElementById('adm-btn-sair');
        if (btnSair) btnSair.addEventListener('click', function(){ DB.remove('usuarioLogado'); });
        var sidebarSair = document.getElementById('sidebar-btn-sair');
        if (sidebarSair) sidebarSair.addEventListener('click', function(){ DB.remove('usuarioLogado'); });

        // ── SEÇÃO: VISÃO GERAL ─────────────────────────────────
        function _carregarVisaoGeral() {
            var sec = document.getElementById('sec-visao-geral');
            if (!sec) return;

            var usuarios  = obterUsuariosCadastrados();
            var listaUsu  = Object.keys(usuarios).map(function(e){ return Object.assign({}, usuarios[e], {email:e}); });
            var qtdTotal  = listaUsu.length;
            var qtdCli    = listaUsu.filter(function(u){ return u.tipo==='cliente'; }).length;
            var qtdPrest  = listaUsu.filter(function(u){ return u.tipo==='prestador'; }).length;
            var qtdAdmin  = listaUsu.filter(function(u){ return u.tipo==='admin'; }).length;

            var hotsiteStore = dbGet('hotsitePrestadorDados') || {};
            var qtdHotsite   = Object.keys(hotsiteStore).length;

            var qtdAgs = 0;
            Object.keys(hotsiteStore).forEach(function(email){
                var ags = dbGet('agendamentos_' + email) || [];
                qtdAgs += ags.length;
            });

            var qtdAvsPrest = 0;
            var avsStore = dbGet('avaliacoesRecebidasPrestador') || {};
            Object.keys(avsStore).forEach(function(e){ qtdAvsPrest += (avsStore[e]||[]).length; });
            var qtdAvsCli = (dbGet('avaliacoesRecebidasDoCliente')||[]).length;

            var qtdNot  = obterNoticias().filter(function(n){ return n.status==='publicado'; }).length;

            // Distribuição de categorias
            var catCount = {};
            Object.keys(hotsiteStore).forEach(function(email){
                var cat = (hotsiteStore[email]||{}).categoria || 'Outros';
                catCount[cat] = (catCount[cat]||0) + 1;
            });
            var catSorted = Object.keys(catCount).sort(function(a,b){ return catCount[b]-catCount[a]; });
            var catMax    = catSorted.length > 0 ? catCount[catSorted[0]] : 1;

            var catsHtml = catSorted.slice(0,8).map(function(cat){
                var pct = Math.round((catCount[cat]/catMax)*100);
                return '<div class="adm-cat-item">' +
                    '<div class="adm-cat-label"><span>' + _esc(cat) + '</span><span>' + catCount[cat] + '</span></div>' +
                    '<div class="adm-cat-barra"><div class="adm-cat-fill" style="width:' + pct + '%;"></div></div>' +
                    '</div>';
            }).join('');

            // Atividade recente (últimos 5 cadastros)
            var recentes = listaUsu
                .filter(function(u){ return u.dataCadastro; })
                .sort(function(a,b){ return b.dataCadastro > a.dataCadastro ? 1 : -1; })
                .slice(0,5);
            var recentesHtml = recentes.length === 0
                ? '<p class="text-muted text-center py-3" style="font-size:.85rem;">Nenhum cadastro recente.</p>'
                : recentes.map(function(u){
                    var cor = u.tipo === 'prestador' ? '#b8870c' : u.tipo === 'admin' ? '#6f42c1' : '#146ADB';
                    var ini = (u.nome||'U').substring(0,2).toUpperCase();
                    return '<div class="adm-ativ-item">' +
                        '<div class="adm-ativ-avatar" style="background:' + cor + ';">' + ini + '</div>' +
                        '<div class="adm-ativ-info">' +
                            '<div class="adm-ativ-nome">' + _esc(u.nome||u.email) + '</div>' +
                            '<div class="adm-ativ-meta">' + _esc(u.email) + ' · ' + _fmtData(u.dataCadastro) + '</div>' +
                        '</div>' +
                        '<span class="adm-badge-status ' + u.tipo + '">' + u.tipo + '</span>' +
                        '</div>';
                }).join('');

            sec.innerHTML =
                '<div class="adm-secao-titulo"><i class="bi bi-grid-1x2-fill" style="color:#146ADB;"></i>Visão Geral</div>' +
                '<p class="adm-secao-subtitulo">Resumo do estado atual da plataforma ServGo!</p>' +

                '<div class="adm-kpi-grid">' +
                    '<div class="adm-kpi azul"><div class="adm-kpi-titulo">Usuários Cadastrados</div><div class="adm-kpi-valor">' + qtdTotal + '</div><div class="adm-kpi-detalhe"><i class="bi bi-people-fill"></i>' + qtdAdmin + ' admin · ' + qtdCli + ' cli · ' + qtdPrest + ' prest</div></div>' +
                    '<div class="adm-kpi amarelo"><div class="adm-kpi-titulo">Prestadores com HotSite</div><div class="adm-kpi-valor">' + qtdHotsite + '</div><div class="adm-kpi-detalhe"><i class="bi bi-briefcase-fill"></i>Perfis publicados</div></div>' +
                    '<div class="adm-kpi verde"><div class="adm-kpi-titulo">Agendamentos Totais</div><div class="adm-kpi-valor">' + qtdAgs + '</div><div class="adm-kpi-detalhe"><i class="bi bi-calendar-check"></i>Em todos os prestadores</div></div>' +
                    '<div class="adm-kpi vermelho"><div class="adm-kpi-titulo">Avaliações (Prest.)</div><div class="adm-kpi-valor">' + qtdAvsPrest + '</div><div class="adm-kpi-detalhe"><i class="bi bi-star-fill"></i>' + qtdAvsCli + ' avaliações de clientes</div></div>' +
                    '<div class="adm-kpi roxo"><div class="adm-kpi-titulo">Notícias Publicadas</div><div class="adm-kpi-valor">' + qtdNot + '</div><div class="adm-kpi-detalhe"><i class="bi bi-newspaper"></i>' + obterNoticias().filter(function(n){return n.status==='rascunho';}).length + ' em rascunho</div></div>' +
                    '<div class="adm-kpi"><div class="adm-kpi-titulo">Tickets Suporte</div><div class="adm-kpi-valor">' + obterTickets().length + '</div><div class="adm-kpi-detalhe"><i class="bi bi-headset"></i>' + obterTickets().filter(function(t){return t.status==='aberto';}).length + ' abertos</div></div>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">' +
                    '<div class="adm-card">' +
                        '<div class="adm-card-hdr"><span><i class="bi bi-clock-history me-2" style="color:#146ADB;"></i>Últimos Cadastros</span></div>' +
                        '<div class="adm-card-corpo">' + recentesHtml + '</div>' +
                    '</div>' +
                    '<div class="adm-card">' +
                        '<div class="adm-card-hdr"><span><i class="bi bi-bar-chart-fill me-2" style="color:#FFC300;"></i>Prestadores por Categoria</span></div>' +
                        '<div class="adm-card-corpo">' + (catsHtml || '<p class="text-muted" style="font-size:.85rem;">Nenhum prestador cadastrado.</p>') + '</div>' +
                    '</div>' +
                '</div>';
        }

        // ── SEÇÃO: USUÁRIOS ────────────────────────────────────
        var _filtroUsuTipo = '';
        var _filtroUsuBusca = '';

        function _carregarUsuarios() {
            var sec = document.getElementById('sec-usuarios');
            if (!sec) return;

            function _renderUsuarios() {
                var usuarios = obterUsuariosCadastrados();
                var lista = Object.keys(usuarios).map(function(e){
                    return Object.assign({}, usuarios[e], {email:e});
                });

                // Aplica filtros
                if (_filtroUsuTipo) lista = lista.filter(function(u){ return u.tipo === _filtroUsuTipo; });
                if (_filtroUsuBusca) {
                    var q = _filtroUsuBusca.toLowerCase();
                    lista = lista.filter(function(u){
                        return (u.nome||'').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                    });
                }

                var rows = lista.map(function(u){
                    var cor = u.tipo === 'prestador' ? '#b8870c' : u.tipo === 'admin' ? '#6f42c1' : '#146ADB';
                    var ini = (u.nome||u.email).substring(0,2).toUpperCase();
                    return '<tr>' +
                        '<td><div style="display:flex;align-items:center;gap:9px;">' +
                            '<div style="width:30px;height:30px;border-radius:50%;background:' + cor + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex-shrink:0;">' + ini + '</div>' +
                            '<div><div style="font-weight:600;">' + _esc(u.nome||'—') + '</div>' +
                            '<div style="font-size:.75rem;color:#888;">' + _esc(u.email) + '</div></div></div></td>' +
                        '<td><span class="adm-badge-status ' + u.tipo + '">' + u.tipo + '</span></td>' +
                        '<td>' + _fmtData(u.dataCadastro) + '</td>' +
                        '<td><div class="adm-acoes">' +
                            '<button class="adm-btn-acao ver" data-email="' + _esc(u.email) + '" data-acao="ver-perfil"><i class="bi bi-eye"></i> Ver</button>' +
                            '<button class="adm-btn-acao senha" data-email="' + _esc(u.email) + '" data-nome="' + _esc(u.nome||u.email) + '" data-acao="reset-senha"><i class="bi bi-key"></i> Senha</button>' +
                            (u.email !== usu.email
                                ? '<button class="adm-btn-acao excluir" data-email="' + _esc(u.email) + '" data-nome="' + _esc(u.nome||u.email) + '" data-acao="excluir-usuario"><i class="bi bi-trash"></i></button>'
                                : '') +
                        '</div></td>' +
                    '</tr>';
                }).join('');

                var tabHtml = lista.length === 0
                    ? '<div class="adm-vazio"><i class="bi bi-person-x"></i>Nenhum usuário encontrado.</div>'
                    : '<div style="overflow-x:auto;"><table class="adm-tabela"><thead><tr><th>Usuário</th><th>Tipo</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

                var corpoEl = document.getElementById('adm-usuarios-corpo');
                if (corpoEl) corpoEl.innerHTML = tabHtml;

                // Bind ações
                if (corpoEl) {
                    corpoEl.querySelectorAll('[data-acao]').forEach(function(btn){
                        btn.addEventListener('click', function(){
                            var acao  = btn.dataset.acao;
                            var email = btn.dataset.email;
                            if (acao === 'ver-perfil')    _abrirPerfilUsuario(email);
                            if (acao === 'reset-senha')   _abrirResetSenha(email, btn.dataset.nome);
                            if (acao === 'excluir-usuario') _confirmarExcluirUsuario(email, btn.dataset.nome);
                        });
                    });
                }
            }

            var totalUsu = Object.keys(obterUsuariosCadastrados()).length;
            sec.innerHTML =
                '<div class="adm-secao-titulo"><i class="bi bi-people-fill" style="color:#146ADB;"></i>Gerenciar Usuários</div>' +
                '<p class="adm-secao-subtitulo">Visualize, edite e administre todos os usuários da plataforma.</p>' +
                '<div class="adm-toolbar">' +
                    '<div class="adm-toolbar-search"><input class="adm-busca-input" id="adm-usu-busca" type="text" placeholder="&#xF52D; Buscar por nome ou e-mail..." autocomplete="off"></div>' +
                    '<div class="adm-filtro-tabs">' +
                        '<button class="adm-filtro-tab ativo" data-tipo="">Todos (' + totalUsu + ')</button>' +
                        '<button class="adm-filtro-tab" data-tipo="cliente">Clientes</button>' +
                        '<button class="adm-filtro-tab" data-tipo="prestador">Prestadores</button>' +
                        '<button class="adm-filtro-tab" data-tipo="admin">Admins</button>' +
                    '</div>' +
                    '<button class="btn btn-dark btn-sm ms-auto" id="adm-btn-novo-admin">' +
                        '<i class="bi bi-shield-fill-plus me-1"></i>Novo Admin' +
                    '</button>' +
                '</div>' +
                '<div class="adm-card"><div id="adm-usuarios-corpo"></div></div>';

            _renderUsuarios();

            // Busca em tempo real
            document.getElementById('adm-usu-busca').addEventListener('input', function(){
                _filtroUsuBusca = this.value.trim();
                _renderUsuarios();
            });
            // Filtro de tipo
            sec.querySelectorAll('.adm-filtro-tab[data-tipo]').forEach(function(tab){
                tab.addEventListener('click', function(){
                    _filtroUsuTipo = tab.dataset.tipo;
                    sec.querySelectorAll('.adm-filtro-tab[data-tipo]').forEach(function(t){
                        t.classList.toggle('ativo', t === tab);
                    });
                    _renderUsuarios();
                });
            });
            // Novo admin
            var btnNovoAdmin = document.getElementById('adm-btn-novo-admin');
            if (btnNovoAdmin) {
                btnNovoAdmin.addEventListener('click', function(){
                    document.getElementById('adm-novo-nome').value = '';
                    document.getElementById('adm-novo-email').value = '';
                    document.getElementById('adm-novo-senha').value = '';
                    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmNovoAdmin')).show();
                });
            }
        }

        // Abrir modal Ver Perfil
        function _abrirPerfilUsuario(email) {
            var usuarios  = obterUsuariosCadastrados();
            var u         = usuarios[email] || {};
            var hotsiteStore = dbGet('hotsitePrestadorDados') || {};
            var hotsite   = hotsiteStore[email] || {};
            var ags       = u.tipo === 'prestador' ? (dbGet('agendamentos_'+email)||[]).length : '—';
            var avsRec    = u.tipo === 'prestador'
                ? ((dbGet('avaliacoesRecebidasPrestador')||{})[email]||[]).length : '—';
            var perfil    = u.perfil || {};
            var cor       = u.tipo === 'prestador' ? '#b8870c' : u.tipo === 'admin' ? '#6f42c1' : '#146ADB';
            var ini       = (u.nome||email).substring(0,2).toUpperCase();

            var corpo =
                '<div style="display:flex;gap:16px;align-items:center;margin-bottom:18px;flex-wrap:wrap;">' +
                    '<div style="width:60px;height:60px;border-radius:50%;background:' + cor + ';color:#fff;font-size:1.4rem;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + ini + '</div>' +
                    '<div><h5 style="margin:0;font-weight:700;">' + _esc(u.nome||'—') + '</h5>' +
                    '<div style="font-size:.85rem;color:#666;">' + _esc(email) + '</div>' +
                    '<span class="adm-badge-status ' + (u.tipo||'') + '">' + (u.tipo||'—') + '</span></div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                    '<div><strong>Data de Cadastro:</strong><br><span style="color:#555;">' + _fmtData(u.dataCadastro) + '</span></div>' +
                    '<div><strong>Cidade:</strong><br><span style="color:#555;">' + _esc(hotsite.cidade||perfil.cidade||'—') + '</span></div>' +
                    '<div><strong>Telefone:</strong><br><span style="color:#555;">' + _esc(hotsite.tel||perfil.tel||'—') + '</span></div>' +
                    '<div><strong>Endereço:</strong><br><span style="color:#555;">' + _esc(hotsite.endereco||perfil.endereco||'—') + '</span></div>' +
                    (u.tipo==='prestador'
                        ? '<div><strong>Categoria:</strong><br><span style="color:#555;">' + _esc(hotsite.categoria||'—') + '</span></div>' +
                          '<div><strong>CPF/CNPJ:</strong><br><span style="color:#555;">' + _esc(hotsite.cnpj||'—') + '</span></div>' +
                          '<div><strong>Agendamentos:</strong><br><span style="font-weight:700;color:#146ADB;">' + ags + '</span></div>' +
                          '<div><strong>Avaliações Recebidas:</strong><br><span style="font-weight:700;color:#198754;">' + avsRec + '</span></div>'
                        : '') +
                '</div>';

            var corpoEl = document.getElementById('adm-modal-perfil-corpo');
            if (corpoEl) corpoEl.innerHTML = corpo;
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmVerPerfil')).show();
        }

        // Abrir modal Reset Senha
        function _abrirResetSenha(email, nome) {
            document.getElementById('adm-reset-email').value = email;
            document.getElementById('adm-reset-nova-senha').value = '';
            var infoEl = document.getElementById('adm-reset-info');
            if (infoEl) infoEl.innerHTML = '<strong>Usuário:</strong> ' + _esc(nome||email) + '<br><small class="text-muted">' + _esc(email) + '</small>';
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmResetSenha')).show();
        }

        // Confirmar Reset Senha
        var btnConfReset = document.getElementById('adm-btn-confirmar-reset');
        if (btnConfReset) {
            btnConfReset.addEventListener('click', function(){
                var email    = (document.getElementById('adm-reset-email')||{}).value || '';
                var novaSen  = (document.getElementById('adm-reset-nova-senha')||{}).value || '';
                if (!novaSen || novaSen.length < 6) { alert('Informe uma senha com no mínimo 6 caracteres.'); return; }
                var usuarios = obterUsuariosCadastrados();
                if (!usuarios[email]) { alert('Usuário não encontrado.'); return; }
                usuarios[email].senha = novaSen;
                salvarUsuariosCadastrados(usuarios);
                bootstrap.Modal.getInstance(document.getElementById('modalAdmResetSenha')).hide();
                exibirToast('Senha de ' + _esc(usuarios[email].nome||email) + ' redefinida com sucesso!');
            });
        }

        // Confirmar Excluir Usuário
        function _confirmarExcluirUsuario(email, nome) {
            var corpoEl = document.getElementById('adm-conf-corpo');
            if (corpoEl) corpoEl.innerHTML =
                '<p>Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário:</p>' +
                '<p><strong>' + _esc(nome) + '</strong> (' + _esc(email) + ')</p>' +
                '<p class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>Esta ação não pode ser desfeita. Todos os dados relacionados serão perdidos.</p>';
            var btnConf = document.getElementById('adm-btn-confirmar-acao');
            if (btnConf) {
                var novo = btnConf.cloneNode(true);
                btnConf.parentNode.replaceChild(novo, btnConf);
                novo.addEventListener('click', function(){
                    var usuarios = obterUsuariosCadastrados();
                    delete usuarios[email];
                    salvarUsuariosCadastrados(usuarios);
                    bootstrap.Modal.getInstance(document.getElementById('modalAdmConfirmar')).hide();
                    exibirToast('Usuário ' + _esc(nome) + ' excluído.');
                    _atualizarBadges();
                    _carregarUsuarios();
                });
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmConfirmar')).show();
        }

        // Criar Novo Admin
        var btnCriarAdmin = document.getElementById('adm-btn-criar-admin');
        if (btnCriarAdmin) {
            btnCriarAdmin.addEventListener('click', function(){
                var nome   = (document.getElementById('adm-novo-nome')||{}).value.trim();
                var email  = (document.getElementById('adm-novo-email')||{}).value.trim().toLowerCase();
                var senha  = (document.getElementById('adm-novo-senha')||{}).value;
                if (!nome || !email || !senha) { alert('Preencha todos os campos.'); return; }
                var rx = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;
                if (!rx.test(senha)) { alert('A senha deve ter mínimo 8 caracteres com letras, números e especiais.'); return; }
                var usuarios = obterUsuariosCadastrados();
                if (usuarios[email]) { alert('E-mail já cadastrado.'); return; }
                usuarios[email] = { nome: nome, senha: senha, tipo: 'admin', dataCadastro: new Date().toISOString() };
                salvarUsuariosCadastrados(usuarios);
                bootstrap.Modal.getInstance(document.getElementById('modalAdmNovoAdmin')).hide();
                exibirToast('Administrador ' + _esc(nome) + ' criado com sucesso!');
                _atualizarBadges();
                _carregarUsuarios();
            });
        }

        // ── SEÇÃO: PRESTADORES ─────────────────────────────────
        function _carregarPrestadores() {
            var sec = document.getElementById('sec-prestadores');
            if (!sec) return;

            var hotsiteStore = dbGet('hotsitePrestadorDados') || {};
            var avsStore     = dbGet('avaliacoesRecebidasPrestador') || {};
            var todosUsuarios = obterUsuariosCadastrados();

            var lista = Object.keys(hotsiteStore).map(function(email){
                var h    = hotsiteStore[email] || {};
                var avs  = (avsStore[email]||[]).filter(function(a){ return typeof a.nota === 'number'; });
                var media = avs.length ? (avs.reduce(function(s,a){ return s+a.nota; },0)/avs.length).toFixed(1) : '—';
                var ags  = (dbGet('agendamentos_'+email)||[]).length;
                return { email:email, nome:h.nome||email, categoria:h.categoria||'—', cidade:h.cidade||'—', ags:ags, media:media, total:avs.length };
            });

            var rows = lista.map(function(p){
                var estStr = p.media !== '—'
                    ? '<span style="color:#FFC300;">★</span> ' + p.media + ' <span style="color:#888;font-size:.78rem;">(' + p.total + ')</span>'
                    : '<span style="color:#aaa;">Sem avaliações</span>';
                var dadosUsu = todosUsuarios[p.email] || {};
                var st = dadosUsu.tipo === 'prestador' ? SG_Trial.verificarStatus(p.email, dadosUsu) : { bloqueado: false, diasRestantes: 0 };
                var statusHtml;
                if (dadosUsu.assinatura && dadosUsu.assinatura.ativa) {
                    statusHtml = '<span class="adm-badge-status ativo">Assinante</span><br><small style="color:#888;font-size:.7rem;">' + _esc(dadosUsu.assinatura.plano || 'Plano') + '</small>';
                } else if (dadosUsu.tipo === 'prestador' && dadosUsu.trialInicio) {
                    statusHtml = st.bloqueado
                        ? '<span class="adm-badge-status inativo">Trial Expirado</span>'
                        : '<span class="adm-badge-status em_andamento">Trial</span><br><small style="color:#888;font-size:.7rem;">' + st.diasRestantes + ' dia(s)</small>';
                } else if (dadosUsu.assinatura && dadosUsu.assinatura.cancelada) {
                    statusHtml = '<span class="adm-badge-status inativo">Cancelado</span>';
                } else {
                    statusHtml = '<span class="adm-badge-status rascunho">Seed</span>';
                }
                var contratoHtml = (dadosUsu.assinatura && dadosUsu.assinatura.contratoId)
                    ? '<br><small style="color:#888;font-size:.7rem;">Contrato #' + dadosUsu.assinatura.contratoId + '</small>' : '';
                return '<tr>' +
                    '<td style="font-weight:600;">' + _esc(p.nome) + '</td>' +
                    '<td><span class="adm-badge-status prestador">' + _esc(p.categoria) + '</span></td>' +
                    '<td>' + _esc(p.cidade) + '</td>' +
                    '<td style="text-align:center;">' + p.ags + '</td>' +
                    '<td>' + estStr + '</td>' +
                    '<td>' + statusHtml + contratoHtml + '</td>' +
                    '<td><div class="adm-acoes">' +
                        '<a class="adm-btn-acao ver" href="/paginasPrestador/prestadorHotsite.html?email=' + encodeURIComponent(p.email) + '" target="_blank">' +
                            '<i class="bi bi-box-arrow-up-right"></i> HotSite' +
                        '</a>' +
                        '<button class="adm-btn-acao excluir" data-email="' + _esc(p.email) + '" data-nome="' + _esc(p.nome) + '" data-acao="remover-hotsite">' +
                            '<i class="bi bi-trash"></i> Remover' +
                        '</button>' +
                    '</div></td>' +
                '</tr>';
            }).join('');

            // Prestadores em trial sem hotsite publicado
            var emailsComHotsite = Object.keys(hotsiteStore);
            var prestSemHotsite = Object.keys(todosUsuarios).filter(function(em){
                return todosUsuarios[em].tipo === 'prestador' && emailsComHotsite.indexOf(em) === -1;
            });
            var rowsSemHotsite = prestSemHotsite.map(function(em){
                var u  = todosUsuarios[em];
                var st = SG_Trial.verificarStatus(em, u);
                var statusHtml;
                if (u.assinatura && u.assinatura.ativa) {
                    statusHtml = '<span class="adm-badge-status ativo">Assinante</span>';
                } else if (st.bloqueado) {
                    statusHtml = '<span class="adm-badge-status inativo">Trial Expirado</span>';
                } else if (u.assinatura && u.assinatura.cancelada) {
                    statusHtml = '<span class="adm-badge-status inativo">Cancelado</span>';
                } else {
                    statusHtml = '<span class="adm-badge-status em_andamento">Trial</span><br><small style="color:#888;font-size:.7rem;">' + st.diasRestantes + ' dia(s)</small>';
                }
                return '<tr style="background:#fffbeb;">' +
                    '<td style="font-weight:600;">' + _esc(u.nome||em) + ' <small style="color:#aaa;">(sem hotsite)</small></td>' +
                    '<td>—</td><td>—</td><td style="text-align:center;">0</td><td>—</td>' +
                    '<td>' + statusHtml + '</td>' +
                    '<td><div class="adm-acoes">' +
                        '<button class="adm-btn-acao excluir" data-email="' + _esc(em) + '" data-nome="' + _esc(u.nome||em) + '" data-acao="remover-usuario">' +
                            '<i class="bi bi-trash"></i> Remover' +
                        '</button>' +
                    '</div></td>' +
                '</tr>';
            }).join('');

            var totalPrest = lista.length + prestSemHotsite.length;
            var badgeEl = document.getElementById('adm-badge-prestadores');
            if (badgeEl) { badgeEl.textContent = totalPrest; badgeEl.style.display = 'inline-block'; }

            var tabHtml = totalPrest === 0
                ? '<div class="adm-vazio"><i class="bi bi-briefcase"></i>Nenhum prestador cadastrado.</div>'
                : '<div style="overflow-x:auto;"><table class="adm-tabela"><thead><tr><th>Nome</th><th>Categoria</th><th>Cidade</th><th style="text-align:center;">Agendamentos</th><th>Avaliações</th><th>Status / Contrato</th><th>Ações</th></tr></thead><tbody>' + rows + rowsSemHotsite + '</tbody></table></div>';

            sec.innerHTML =
                '<div class="adm-secao-titulo"><i class="bi bi-briefcase-fill" style="color:#FFC300;"></i>Gerenciar Prestadores</div>' +
                '<p class="adm-secao-subtitulo">' + lista.length + ' com HotSite publicado · ' + prestSemHotsite.length + ' em trial sem hotsite.</p>' +
                '<div class="adm-card"><div id="adm-prest-corpo">' + tabHtml + '</div></div>';

            sec.querySelectorAll('[data-acao="remover-hotsite"]').forEach(function(btn){
                btn.addEventListener('click', function(){
                    var email = btn.dataset.email;
                    var nome  = btn.dataset.nome;
                    var corpoEl = document.getElementById('adm-conf-corpo');
                    if (corpoEl) corpoEl.innerHTML =
                        '<p>Remover os dados de HotSite do prestador:</p>' +
                        '<p><strong>' + _esc(nome) + '</strong></p>' +
                        '<p class="text-warning small"><i class="bi bi-exclamation-triangle me-1"></i>O usuário continuará cadastrado, mas seu HotSite será removido do catálogo.</p>';
                    var btnConf = document.getElementById('adm-btn-confirmar-acao');
                    var novo = btnConf.cloneNode(true);
                    btnConf.parentNode.replaceChild(novo, btnConf);
                    novo.addEventListener('click', function(){
                        var hs = dbGet('hotsitePrestadorDados') || {};
                        delete hs[email];
                        dbSet('hotsitePrestadorDados', hs);
                        bootstrap.Modal.getInstance(document.getElementById('modalAdmConfirmar')).hide();
                        exibirToast('HotSite de ' + _esc(nome) + ' removido.');
                        _atualizarBadges();
                        _carregarPrestadores();
                    });
                    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmConfirmar')).show();
                });
            });
        }

        // ── SEÇÃO: NOTÍCIAS & CONTEÚDO ─────────────────────────
        var _noticiaEditandoId = null;

        function _carregarNoticias() {
            var sec = document.getElementById('sec-noticias');
            if (!sec) return;

            function _renderNoticias() {
                var noticias = obterNoticias();
                var rows = noticias.slice().reverse().map(function(n){
                    return '<tr>' +
                        '<td style="max-width:260px;">' +
                            '<div style="font-weight:700;font-size:.88rem;">' + _esc(n.titulo||'—') + '</div>' +
                            (n.destaque ? '<span class="adm-badge-status destaque"><i class="bi bi-star-fill"></i> Destaque</span>' : '') +
                        '</td>' +
                        '<td>' + _esc(n.categoria||'—') + '</td>' +
                        '<td>' + _esc(n.autor||'—') + '</td>' +
                        '<td>' + _fmtData(n.dataCriacao) + '</td>' +
                        '<td><span class="adm-badge-status ' + (n.status||'rascunho') + '">' + (n.status||'rascunho') + '</span></td>' +
                        '<td><div class="adm-acoes">' +
                            '<button class="adm-btn-acao editar" data-id="' + _esc(n.id) + '" data-acao="editar-noticia"><i class="bi bi-pencil"></i> Editar</button>' +
                            '<button class="adm-btn-acao ' + (n.status==='publicado'?'excluir':'publicar') + '" data-id="' + _esc(n.id) + '" data-acao="toggle-status-noticia">' +
                                (n.status==='publicado' ? '<i class="bi bi-eye-slash"></i> Despublicar' : '<i class="bi bi-check-circle"></i> Publicar') +
                            '</button>' +
                            '<button class="adm-btn-acao excluir" data-id="' + _esc(n.id) + '" data-titulo="' + _esc(n.titulo||'') + '" data-acao="excluir-noticia"><i class="bi bi-trash"></i></button>' +
                        '</div></td>' +
                    '</tr>';
                }).join('');

                var tabHtml = noticias.length === 0
                    ? '<div class="adm-vazio"><i class="bi bi-newspaper"></i>Nenhuma notícia cadastrada. Crie a primeira!</div>'
                    : '<div style="overflow-x:auto;"><table class="adm-tabela"><thead><tr><th>Título</th><th>Categoria</th><th>Autor</th><th>Criado em</th><th>Status</th><th>Ações</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

                var listaEl = document.getElementById('adm-noticias-lista');
                if (listaEl) listaEl.innerHTML = tabHtml;

                sec.querySelectorAll('[data-acao]').forEach(function(btn){
                    btn.addEventListener('click', function(){
                        var acao = btn.dataset.acao;
                        if (acao === 'editar-noticia')         _abrirModalNoticia(btn.dataset.id);
                        if (acao === 'toggle-status-noticia')  _toggleStatusNoticia(btn.dataset.id);
                        if (acao === 'excluir-noticia')        _confirmarExcluirNoticia(btn.dataset.id, btn.dataset.titulo);
                    });
                });
            }

            sec.innerHTML =
                '<div class="adm-secao-titulo"><i class="bi bi-newspaper" style="color:#146ADB;"></i>Notícias & Conteúdo</div>' +
                '<p class="adm-secao-subtitulo">Crie, edite e publique matérias, artigos e posts em destaque para o site.</p>' +
                '<div style="margin-bottom:14px;">' +
                    '<button class="btn btn-primary btn-sm" id="adm-btn-nova-noticia">' +
                        '<i class="bi bi-plus-circle me-1"></i>Nova Notícia / Matéria' +
                    '</button>' +
                '</div>' +
                '<div class="adm-card"><div id="adm-noticias-lista"></div></div>';

            _renderNoticias();

            document.getElementById('adm-btn-nova-noticia').addEventListener('click', function(){
                _abrirModalNoticia(null);
            });
        }

        function _abrirModalNoticia(id) {
            _noticiaEditandoId = id || null;
            var titulo  = document.getElementById('adm-noticia-modal-titulo');
            if (titulo) titulo.innerHTML = '<i class="bi bi-newspaper me-2"></i>' + (id ? 'Editar Notícia' : 'Nova Notícia / Matéria');
            document.getElementById('adm-noticia-id').value = id || '';

            var campos = { titulo:'', resumo:'', conteudo:'', categoria:'Inovação & Tecnologia', status:'publicado', imagemUrl:'', autor:'Equipe ServGo!', destaque:false };
            if (id) {
                var n = obterNoticias().find(function(x){ return x.id===id; });
                if (n) { campos.titulo=n.titulo||''; campos.resumo=n.resumo||''; campos.conteudo=n.conteudo||''; campos.categoria=n.categoria||campos.categoria; campos.status=n.status||'publicado'; campos.imagemUrl=n.imagemUrl||''; campos.autor=n.autor||''; campos.destaque=!!n.destaque; }
            }
            document.getElementById('adm-noticia-titulo').value    = campos.titulo;
            document.getElementById('adm-noticia-resumo').value    = campos.resumo;
            document.getElementById('adm-noticia-conteudo').value  = campos.conteudo;
            document.getElementById('adm-noticia-categoria').value = campos.categoria;
            document.getElementById('adm-noticia-status').value    = campos.status;
            document.getElementById('adm-noticia-imagem').value    = campos.imagemUrl;
            document.getElementById('adm-noticia-autor').value     = campos.autor;
            document.getElementById('adm-noticia-destaque').checked= campos.destaque;
            document.getElementById('adm-noticia-cont-chars').textContent = campos.conteudo.length;
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmNoticia')).show();
        }

        // Contador de caracteres no conteúdo
        var contArea = document.getElementById('adm-noticia-conteudo');
        if (contArea) {
            contArea.addEventListener('input', function(){
                var el = document.getElementById('adm-noticia-cont-chars');
                if (el) el.textContent = contArea.value.length;
            });
        }

        // Salvar notícia
        var btnSalvarNot = document.getElementById('adm-btn-salvar-noticia');
        if (btnSalvarNot) {
            btnSalvarNot.addEventListener('click', function(){
                var titulo = (document.getElementById('adm-noticia-titulo')||{}).value.trim();
                var resumo = (document.getElementById('adm-noticia-resumo')||{}).value.trim();
                if (!titulo || !resumo) { alert('Título e resumo são obrigatórios.'); return; }

                var registro = {
                    id:          _noticiaEditandoId || _gerarId('noticia'),
                    titulo:      titulo,
                    resumo:      resumo,
                    conteudo:    (document.getElementById('adm-noticia-conteudo')||{}).value,
                    categoria:   (document.getElementById('adm-noticia-categoria')||{}).value,
                    status:      (document.getElementById('adm-noticia-status')||{}).value,
                    imagemUrl:   (document.getElementById('adm-noticia-imagem')||{}).value.trim(),
                    autor:       (document.getElementById('adm-noticia-autor')||{}).value.trim() || 'Equipe ServGo!',
                    destaque:    document.getElementById('adm-noticia-destaque').checked,
                    dataCriacao: _noticiaEditandoId
                        ? (obterNoticias().find(function(x){ return x.id===_noticiaEditandoId; })||{}).dataCriacao || new Date().toISOString()
                        : new Date().toISOString(),
                    dataPublicacao: new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'})
                };

                var noticias = obterNoticias();
                var idx = noticias.findIndex(function(x){ return x.id===registro.id; });
                if (idx >= 0) noticias[idx] = registro; else noticias.push(registro);
                salvarNoticias(noticias);

                // SPRINT 2 — Disparo de newsletter ao publicar nova notícia
                bootstrap.Modal.getInstance(document.getElementById('modalAdmNoticia')).hide();
                if (registro.status === 'publicado' && !_noticiaEditandoId) {
                    var qtdDisparados = _sgNewsletterDisparar(registro);
                    if (qtdDisparados > 0) {
                        exibirToast('Notícia salva! Newsletter disparada para ' + qtdDisparados + ' inscrito(s).');
                    } else {
                        var inscritos = sgNewsletterObterInscritos();
                        if (inscritos.length === 0) {
                            exibirToast('Notícia "' + _esc(titulo) + '" salva. Nenhum inscrito na newsletter ainda.');
                        } else {
                            exibirToast('Notícia "' + _esc(titulo) + '" salva com sucesso!');
                        }
                    }
                } else {
                    exibirToast('Notícia "' + _esc(titulo) + '" salva com sucesso!');
                }
                _atualizarBadges();
                _carregarNoticias();
            });
        }

        function _toggleStatusNoticia(id) {
            var noticias = obterNoticias();
            var idx = noticias.findIndex(function(n){ return n.id===id; });
            if (idx < 0) return;
            noticias[idx].status = noticias[idx].status === 'publicado' ? 'rascunho' : 'publicado';
            salvarNoticias(noticias);
            _atualizarBadges();
            _carregarNoticias();
        }

        function _confirmarExcluirNoticia(id, titulo) {
            var corpoEl = document.getElementById('adm-conf-corpo');
            if (corpoEl) corpoEl.innerHTML = '<p>Excluir a notícia: <strong>' + _esc(titulo) + '</strong>?</p>';
            var btnConf = document.getElementById('adm-btn-confirmar-acao');
            var novo = btnConf.cloneNode(true);
            btnConf.parentNode.replaceChild(novo, btnConf);
            novo.addEventListener('click', function(){
                salvarNoticias(obterNoticias().filter(function(n){ return n.id!==id; }));
                bootstrap.Modal.getInstance(document.getElementById('modalAdmConfirmar')).hide();
                exibirToast('Notícia excluída.');
                _atualizarBadges();
                _carregarNoticias();
            });
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmConfirmar')).show();
        }

        // ── SEÇÃO: NEWSLETTER ──────────────────────────────────
        function _carregarNewsletter() {
            var sec = document.getElementById('sec-newsletter');
            if (!sec) return;

            function _renderNewsletter() {
                var inscritos = sgNewsletterObterInscritos();
                var disparos  = sgNewsletterObterDisparos();

                // Tabela de inscritos
                var inscritosHtml = inscritos.length === 0
                    ? '<p class="text-muted text-center py-3" style="font-size:.85rem;">Nenhum inscrito ainda.</p>'
                    : '<table class="table table-sm table-hover mb-0" style="font-size:.87rem;">' +
                        '<thead><tr><th>E-mail</th><th>Data de Inscrição</th><th style="width:80px;">Ação</th></tr></thead>' +
                        '<tbody>' + inscritos.map(function(i){
                            return '<tr>' +
                                '<td>' + _esc(i.email) + '</td>' +
                                '<td>' + _fmtData(i.dataInscricao) + '</td>' +
                                '<td><button class="btn btn-danger btn-sm py-0 px-2" data-unsub="' + _esc(i.email) + '" title="Descadastrar"><i class="bi bi-trash3"></i></button></td>' +
                            '</tr>';
                        }).join('') + '</tbody></table>';

                // Log de disparos
                var disparosHtml = disparos.length === 0
                    ? '<p class="text-muted text-center py-3" style="font-size:.85rem;">Nenhum disparo registrado.</p>'
                    : disparos.slice().reverse().map(function(d){
                        return '<div class="adm-ativ-item" style="border-bottom:1px solid #f0f0f0;padding:10px 0;">' +
                            '<div style="flex:1;">' +
                                '<div style="font-weight:600;font-size:.88rem;">' + _esc(d.titulo) + '</div>' +
                                '<div style="font-size:.78rem;color:#888;">Disparado em ' + _fmtData(d.dataDisparo) + ' · ' + d.destinatarios.length + ' destinatário(s)</div>' +
                                '<div style="font-size:.76rem;color:#aaa;margin-top:3px;">' + d.destinatarios.slice(0,5).map(_esc).join(', ') + (d.destinatarios.length > 5 ? ' ...' : '') + '</div>' +
                            '</div>' +
                        '</div>';
                    }).join('');

                sec.innerHTML =
                    '<div class="adm-secao-titulo"><i class="bi bi-envelope-paper-fill" style="color:#146ADB;"></i>Newsletter</div>' +
                    '<p class="adm-secao-subtitulo">Gerencie os inscritos e acompanhe os disparos automáticos realizados ao publicar notícias.</p>' +

                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">' +

                        '<div class="adm-card">' +
                            '<div class="adm-card-hdr" style="display:flex;align-items:center;justify-content:space-between;">' +
                                '<span><i class="bi bi-people-fill me-2" style="color:#146ADB;"></i>Inscritos (' + inscritos.length + ')</span>' +
                                '<button id="adm-news-exportar" class="btn btn-outline-secondary btn-sm" title="Exportar lista em CSV"><i class="bi bi-download me-1"></i>CSV</button>' +
                            '</div>' +
                            '<div class="adm-card-corpo" style="padding:0;overflow:auto;max-height:400px;">' + inscritosHtml + '</div>' +
                        '</div>' +

                        '<div class="adm-card">' +
                            '<div class="adm-card-hdr"><i class="bi bi-send-fill me-2" style="color:#0dcaf0;"></i>Histórico de Disparos (' + disparos.length + ')</div>' +
                            '<div class="adm-card-corpo" style="max-height:400px;overflow-y:auto;">' + disparosHtml + '</div>' +
                        '</div>' +

                    '</div>' +

                    '<div class="adm-card mt-4" style="background:#fffbea;border:1px solid #ffe58f;">' +
                        '<div class="adm-card-hdr"><i class="bi bi-info-circle-fill me-2" style="color:#b8870c;"></i>Como funciona o envio</div>' +
                        '<div class="adm-card-corpo" style="font-size:.85rem;color:#555;line-height:1.7;">' +
                            '<p style="margin:0 0 6px;"><strong>Inscrição:</strong> O visitante informa o e-mail no rodapé das páginas (Home, Área do Cliente, Área do Prestador) e clica em "Cadastrar". O e-mail é salvo na base de inscritos.</p>' +
                            '<p style="margin:0 0 6px;"><strong>Disparo automático:</strong> Ao salvar uma nova notícia com status "Publicado", o sistema registra automaticamente o disparo para todos os inscritos. O log acima exibe os destinatários e a data de cada envio.</p>' +
                            '<p style="margin:0 0 6px;"><strong>Descadastro:</strong> O inscrito pode clicar em "Para não receber mais esse conteúdo, clique aqui" no rodapé do e-mail. O link abre a Home com o parâmetro <code>?unsubscribe=email</code> e remove o endereço automaticamente.</p>' +
                            '<p style="margin:0;"><strong>Envio real:</strong> Esta plataforma funciona sem servidor. Para envio real de e-mails, integre a função <code>_sgNewsletterDisparar()</code> no <code>script.js</code> com um serviço como SendGrid, Mailchimp ou Amazon SES.</p>' +
                        '</div>' +
                    '</div>';

                // Botão descadastrar manualmente (admin)
                sec.querySelectorAll('[data-unsub]').forEach(function(btn){
                    btn.addEventListener('click', function(){
                        var email = btn.dataset.unsub;
                        if (confirm('Remover ' + email + ' da newsletter?')) {
                            sgNewsletterDescadastrar(email);
                            _atualizarBadges();
                            _renderNewsletter();
                            exibirToast('E-mail removido da newsletter.');
                        }
                    });
                });

                // Exportar CSV
                var btnExp = document.getElementById('adm-news-exportar');
                if (btnExp) {
                    btnExp.addEventListener('click', function(){
                        if (inscritos.length === 0) { alert('Nenhum inscrito para exportar.'); return; }
                        var csv = 'E-mail,Data de Inscrição\n' + inscritos.map(function(i){
                            return '"' + i.email + '","' + new Date(i.dataInscricao).toLocaleString('pt-BR') + '"';
                        }).join('\n');
                        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        var url  = URL.createObjectURL(blob);
                        var a    = document.createElement('a');
                        a.href = url; a.download = 'newsletter-inscritos-' + new Date().toISOString().slice(0,10) + '.csv';
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        exibirToast('Lista exportada com sucesso!');
                    });
                }
            }

            _renderNewsletter();
        }

        // ── SEÇÃO: SUPORTE / TICKETS ───────────────────────────
        function _carregarSupporte() {
            var sec = document.getElementById('sec-suporte');
            if (!sec) return;

            // Descrições de cada aba para orientar o administrador
            var descricaoFiltro = {
                todos:        'Todos os chamados recebidos, independente do status.',
                aberto:       'Solicitações recém-chegadas aguardando análise da equipe. Responda ou mova para "Em Andamento" ao iniciar o tratamento.',
                em_andamento: 'Chamados já analisados que estão em tratativas com o usuário. Mova para "Resolvido" ao concluir.',
                resolvido:    'Histórico completo de chamados encerrados. Todos os registros de atendimento da plataforma.'
            };

            function _labelStatus(s) {
                return { aberto: 'Aberto', em_andamento: 'Em Andamento', resolvido: 'Resolvido' }[s] || s;
            }
            function _labelOrigem(o) {
                return { prestador: 'Prestador', cliente: 'Cliente', visitante: 'Visitante' }[o] || (o || '—');
            }

            function _renderTickets(filtro) {
                var todos = obterTickets();
                var tickets = filtro && filtro !== 'todos'
                    ? todos.filter(function(t){ return t.status===filtro; })
                    : todos;
                tickets = tickets.slice().reverse();

                // Descrição da aba ativa
                var descEl = document.getElementById('adm-ticket-descricao');
                if (descEl) descEl.textContent = descricaoFiltro[filtro] || '';

                var html = tickets.length === 0
                    ? '<div class="adm-vazio"><i class="bi bi-headset"></i>Nenhum chamado encontrado nesta categoria.</div>'
                    : tickets.map(function(t){
                        var cor = {aberto:'#dc3545', em_andamento:'#b8870c', resolvido:'#198754'}[t.status] || '#aaa';
                        var origemLabel = _labelOrigem(t.origem);
                        var origemCor   = { prestador: '#b8870c', cliente: '#146ADB', visitante: '#6c757d' }[t.origem] || '#6c757d';
                        return '<div class="adm-ticket-item ' + (t.status||'') + '" style="border-left:4px solid ' + cor + ';padding:14px 16px;background:#fff;border-radius:6px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,.07);">' +
                            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:6px;">' +
                                '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                                    '<span style="font-weight:700;color:#1a1a1a;">' + _esc(t.assunto||'Sem assunto') + '</span>' +
                                    '<span class="adm-badge-status ' + (t.status||'') + '" style="background:' + cor + ';color:#fff;padding:2px 10px;border-radius:20px;font-size:.75rem;">' + _labelStatus(t.status) + '</span>' +
                                    '<span style="background:' + origemCor + '22;color:' + origemCor + ';padding:2px 8px;border-radius:20px;font-size:.73rem;font-weight:600;">' + origemLabel + '</span>' +
                                '</div>' +
                                '<span style="font-size:.75rem;color:#888;">' + _fmtData(t.dataAbertura) + '</span>' +
                            '</div>' +
                            '<div style="font-size:.83rem;color:#555;margin-bottom:6px;">' +
                                '<i class="bi bi-person me-1"></i><strong>' + _esc(t.nome||'—') + '</strong>' +
                                ' &nbsp;·&nbsp; <i class="bi bi-envelope me-1"></i>' + _esc(t.email||'—') +
                                (t.tipoUsuario ? ' &nbsp;·&nbsp; <i class="bi bi-tag me-1"></i>' + _esc(t.tipoUsuario) : '') +
                                (t.anexo ? ' &nbsp;·&nbsp; <i class="bi bi-paperclip me-1"></i>' + _esc(t.anexo) : '') +
                            '</div>' +
                            '<div style="font-size:.85rem;color:#333;padding:8px 12px;background:#f8f9fa;border-radius:6px;margin-bottom:8px;line-height:1.5;">' + _esc(t.mensagem||'') + '</div>' +
                            (t.resposta ? '<div style="font-size:.83rem;color:#065f46;padding:8px 12px;background:#d1fae5;border-radius:6px;margin-bottom:8px;"><i class="bi bi-reply-fill me-1"></i><strong>Resposta da equipe:</strong> ' + _esc(t.resposta) + '</div>' : '') +
                            (t.adminResponsavel ? '<div style="font-size:.75rem;color:#888;margin-bottom:6px;"><i class="bi bi-person-check me-1"></i>Atendido por: ' + _esc(t.adminResponsavel) + (t.dataResposta ? ' em ' + _fmtData(t.dataResposta) : '') + '</div>' : '') +
                            '<div class="adm-acoes" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">' +
                                '<button class="adm-btn-acao responder" data-id="' + _esc(t.id) + '" data-acao="responder-ticket" style="background:#146ADB;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:.82rem;cursor:pointer;"><i class="bi bi-reply me-1"></i>Responder / Atualizar</button>' +
                                (t.status !== 'em_andamento' && t.status !== 'resolvido'
                                    ? '<button class="adm-btn-acao" data-id="' + _esc(t.id) + '" data-acao="mover-em_andamento" style="background:#b8870c;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:.82rem;cursor:pointer;"><i class="bi bi-arrow-right me-1"></i>Mover para Em Andamento</button>' : '') +
                                (t.status !== 'resolvido'
                                    ? '<button class="adm-btn-acao" data-id="' + _esc(t.id) + '" data-acao="mover-resolvido" style="background:#198754;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:.82rem;cursor:pointer;"><i class="bi bi-check2 me-1"></i>Marcar como Resolvido</button>' : '') +
                                '<button class="adm-btn-acao excluir" data-id="' + _esc(t.id) + '" data-acao="excluir-ticket" style="background:#fff;color:#dc3545;border:1px solid #dc3545;border-radius:6px;padding:5px 10px;font-size:.82rem;cursor:pointer;" title="Excluir ticket"><i class="bi bi-trash"></i></button>' +
                            '</div>' +
                        '</div>';
                    }).join('');

                var listaEl = document.getElementById('adm-tickets-lista');
                if (listaEl) listaEl.innerHTML = html;

                // Ação: responder / atualizar (abre modal)
                sec.querySelectorAll('[data-acao="responder-ticket"]').forEach(function(btn){
                    btn.addEventListener('click', function(){ _abrirResponderTicket(btn.dataset.id); });
                });

                // Ação: mover para Em Andamento
                sec.querySelectorAll('[data-acao="mover-em_andamento"]').forEach(function(btn){
                    btn.addEventListener('click', function(){
                        _mudarStatusTicket(btn.dataset.id, 'em_andamento', '');
                    });
                });

                // Ação: marcar como Resolvido
                sec.querySelectorAll('[data-acao="mover-resolvido"]').forEach(function(btn){
                    btn.addEventListener('click', function(){
                        _mudarStatusTicket(btn.dataset.id, 'resolvido', '');
                    });
                });

                // Ação: excluir
                sec.querySelectorAll('[data-acao="excluir-ticket"]').forEach(function(btn){
                    btn.addEventListener('click', function(){
                        if (!confirm('Excluir este chamado permanentemente?')) return;
                        salvarTickets(obterTickets().filter(function(t){ return t.id!==btn.dataset.id; }));
                        _atualizarBadges();
                        _renderTickets(filtroAtivo);
                        exibirToast('Chamado removido.');
                    });
                });
            }

            /**
             * Muda o status de um ticket e dispara notificação por e-mail ao usuário.
             */
            function _mudarStatusTicket(id, novoStatus, resposta) {
                var tickets = obterTickets();
                var idx = tickets.findIndex(function(t){ return t.id===id; });
                if (idx < 0) return;
                var statusAnterior = tickets[idx].status;
                if (statusAnterior === novoStatus) {
                    exibirToast('O chamado já está com status "' + _labelStatus(novoStatus) + '".');
                    return;
                }
                tickets[idx].status           = novoStatus;
                if (resposta) tickets[idx].resposta = resposta;
                tickets[idx].dataResposta     = new Date().toISOString();
                tickets[idx].adminResponsavel = usu.nome || usu.email;
                salvarTickets(tickets);
                // Notificação por e-mail ao usuário
                sgEnviarNotificacaoStatusTicket(tickets[idx], novoStatus, resposta || tickets[idx].resposta || '');
                _atualizarBadges();
                _renderTickets(filtroAtivo);
                exibirToast('Chamado atualizado para "' + _labelStatus(novoStatus) + '" e usuário notificado por e-mail.');
            }

            var filtroAtivo = 'todos';
            var totais = {
                todos:        obterTickets().length,
                aberto:       obterTickets().filter(function(t){return t.status==='aberto';}).length,
                em_andamento: obterTickets().filter(function(t){return t.status==='em_andamento';}).length,
                resolvido:    obterTickets().filter(function(t){return t.status==='resolvido';}).length
            };

            sec.innerHTML =
                '<div class="adm-secao-titulo"><i class="bi bi-headset" style="color:#0dcaf0;"></i>Suporte / Tickets</div>' +
                '<p class="adm-secao-subtitulo">Gerencie as solicitações de contato recebidas de clientes, prestadores e visitantes. A cada mudança de status, o usuário é notificado por e-mail automaticamente.</p>' +
                '<div class="adm-toolbar" style="flex-wrap:wrap;gap:8px;">' +
                    '<div class="adm-filtro-tabs">' +
                        '<button class="adm-filtro-tab ativo" data-filtro="todos">Todos (' + totais.todos + ')</button>' +
                        '<button class="adm-filtro-tab" data-filtro="aberto" style="border-color:#dc3545;color:#dc3545;">Abertos (' + totais.aberto + ')</button>' +
                        '<button class="adm-filtro-tab" data-filtro="em_andamento" style="border-color:#b8870c;color:#b8870c;">Em Andamento (' + totais.em_andamento + ')</button>' +
                        '<button class="adm-filtro-tab" data-filtro="resolvido" style="border-color:#198754;color:#198754;">Resolvidos (' + totais.resolvido + ')</button>' +
                    '</div>' +
                '</div>' +
                '<p id="adm-ticket-descricao" style="font-size:.83rem;color:#888;margin:8px 0 12px;padding:0 2px;">' + descricaoFiltro.todos + '</p>' +
                '<div id="adm-tickets-lista"></div>';

            _renderTickets('todos');

            sec.querySelectorAll('.adm-filtro-tab[data-filtro]').forEach(function(tab){
                tab.addEventListener('click', function(){
                    filtroAtivo = tab.dataset.filtro;
                    sec.querySelectorAll('.adm-filtro-tab[data-filtro]').forEach(function(t){
                        t.classList.toggle('ativo', t===tab);
                    });
                    _renderTickets(filtroAtivo);
                });
            });

            // ── Painel: Modo de Envio (Teste / Produção) ──────────
            var painelModoDiv = document.createElement('div');
            painelModoDiv.id  = 'adm-painel-modo-envio';
            painelModoDiv.style.marginTop = '32px';
            painelModoDiv.innerHTML = _renderPainelModo();
            sec.appendChild(painelModoDiv);
            _bindPainelModo(painelModoDiv);

            // ── Painel: Log de Testes de E-mail ───────────────────
            var painelLogDiv = document.createElement('div');
            painelLogDiv.id  = 'adm-painel-email-log';
            painelLogDiv.style.marginTop = '20px';
            painelLogDiv.innerHTML = _renderEmailLog();
            sec.appendChild(painelLogDiv);
            _bindEmailLog(painelLogDiv);

            // ── Seção de dados de contato administrativo ──────────
            var secDadosAdm = document.getElementById('sec-dados-adm-contato');
            if (!secDadosAdm) {
                var dadosAdmDiv = document.createElement('div');
                dadosAdmDiv.id = 'sec-dados-adm-contato-inline';
                dadosAdmDiv.style.marginTop = '20px';
                dadosAdmDiv.innerHTML = _renderDadosAdmForm();
                sec.appendChild(dadosAdmDiv);
                _bindDadosAdmForm(dadosAdmDiv);
            }
        }

        // ── Renderiza painel de Modo de Envio ──────────────────────
        function _renderPainelModo() {
            var modo = sgObterModo();
            var eTeste = modo !== 'producao';
            var corModo  = eTeste ? '#856404' : '#0a3622';
            var bgModo   = eTeste ? '#fff3cd' : '#d1fae5';
            var bordaModo= eTeste ? '#ffc107' : '#6ee7b7';
            var iconeModo= eTeste ? 'bi-flask' : 'bi-send-check-fill';
            var textoModo= eTeste ? 'Modo Teste' : 'Modo Produção';
            var descModo = eTeste
                ? 'E-mails <strong>não são enviados</strong>. Todas as mensagens são simuladas e registradas no log abaixo para validação.'
                : 'E-mails <strong>enviados em tempo real</strong> via FormSubmit para o endereço de suporte configurado.';
            return '<div class="adm-card" style="border:2px solid ' + bordaModo + ';background:' + bgModo + ';">' +
                '<div class="adm-card-hdr" style="background:transparent;border-bottom:1px solid ' + bordaModo + ';">' +
                    '<span style="color:' + corModo + ';font-weight:700;"><i class="bi ' + iconeModo + ' me-2"></i>Modo de Envio de E-mails: ' + textoModo + '</span>' +
                '</div>' +
                '<div class="adm-card-corpo" style="padding:16px;">' +
                    '<p style="font-size:.88rem;color:' + corModo + ';margin-bottom:14px;">' + descModo + '</p>' +
                    (eTeste
                        ? '<div style="background:#fff;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:.83rem;color:#444;">' +
                            '<strong style="display:block;margin-bottom:6px;"><i class="bi bi-info-circle me-1"></i>Checklist antes de ativar a Produção:</strong>' +
                            '<ul style="margin:0;padding-left:18px;line-height:1.9;">' +
                                '<li>Configure o <strong>E-mail de Suporte</strong> abaixo (painel "Dados de Contato")</li>' +
                                '<li>Envie pelo menos 1 teste e verifique o log de e-mails abaixo</li>' +
                                '<li>Confirme que todos os campos (assunto, nome, origem) aparecem corretamente no log</li>' +
                                '<li>Acesse <strong>formsubmit.co</strong> e confirme o e-mail de ativação enviado ao e-mail de suporte</li>' +
                            '</ul>' +
                          '</div>' +
                          '<button id="adm-btn-ativar-producao" class="btn btn-success btn-sm px-4"><i class="bi bi-send-check-fill me-1"></i>Ativar Modo Produção</button>' +
                          '<span style="font-size:.78rem;color:#888;margin-left:12px;">Você poderá voltar ao modo teste a qualquer momento.</span>'
                        : '<button id="adm-btn-voltar-teste" class="btn btn-warning btn-sm px-4"><i class="bi bi-flask me-1"></i>Voltar ao Modo Teste</button>' +
                          '<span style="font-size:.78rem;color:#888;margin-left:12px;">Útil para testar novas configurações sem enviar e-mails reais.</span>'
                    ) +
                '</div>' +
            '</div>';
        }

        function _bindPainelModo(container) {
            var btnProd = container.querySelector('#adm-btn-ativar-producao');
            var btnTeste = container.querySelector('#adm-btn-voltar-teste');
            if (btnProd) {
                btnProd.addEventListener('click', function(){
                    if (!confirm('Ativar Modo Produção?\n\nA partir deste momento todos os e-mails serão enviados via FormSubmit para o e-mail de suporte configurado.\n\nCertifique-se de ter confirmado o e-mail de ativação do FormSubmit antes de continuar.')) return;
                    sgDefinirModo('producao');
                    exibirToast('✅ Modo Produção ativado. E-mails serão enviados em tempo real.');
                    // Re-renderiza o painel
                    container.innerHTML = _renderPainelModo();
                    _bindPainelModo(container);
                });
            }
            if (btnTeste) {
                btnTeste.addEventListener('click', function(){
                    sgDefinirModo('teste');
                    exibirToast('Modo Teste ativado. E-mails serão simulados e registrados no log.');
                    container.innerHTML = _renderPainelModo();
                    _bindPainelModo(container);
                });
            }
        }

        // ── Renderiza log de e-mails de teste ─────────────────────
        function _renderEmailLog() {
            var log = sgObterEmailLog().slice().reverse();
            var tipoLabel = { contato_novo: 'Novo Contato', notificacao_status: 'Notificação de Status' };
            var tipoCor   = { contato_novo: '#146ADB', notificacao_status: '#198754' };
            var logHtml = log.length === 0
                ? '<p class="text-muted text-center py-3" style="font-size:.85rem;"><i class="bi bi-inbox me-2"></i>Nenhum e-mail simulado ainda. Envie um contato de teste para ver o registro aqui.</p>'
                : log.map(function(e, i){
                    var cor  = tipoCor[e.tipo]   || '#888';
                    var rotulo = tipoLabel[e.tipo] || e.tipo;
                    var statusHtml = e.statusLabel
                        ? '<span style="background:' + ({Aberto:'#dc3545',['Em Andamento']:'#b8870c',Resolvido:'#198754'}[e.statusLabel]||'#888') + ';color:#fff;padding:1px 8px;border-radius:20px;font-size:.73rem;margin-left:6px;">' + e.statusLabel + '</span>'
                        : '';
                    return '<div style="border-left:3px solid ' + cor + ';padding:10px 14px;margin-bottom:10px;background:#fff;border-radius:0 6px 6px 0;box-shadow:0 1px 3px rgba(0,0,0,.06);">' +
                        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;margin-bottom:6px;">' +
                            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                                '<span style="background:' + cor + ';color:#fff;padding:2px 10px;border-radius:20px;font-size:.75rem;font-weight:700;">' + rotulo + '</span>' +
                                (e.ticketId ? '<span style="font-size:.78rem;color:#888;">Chamado #' + _esc(e.ticketId) + '</span>' : '') +
                                statusHtml +
                            '</div>' +
                            '<span style="font-size:.73rem;color:#aaa;">' + (e.dataRegistro ? new Date(e.dataRegistro).toLocaleString('pt-BR') : '—') + '</span>' +
                        '</div>' +
                        '<div style="font-size:.83rem;color:#333;line-height:1.6;">' +
                            '<div><span style="color:#888;">De:</span> ' + _esc(e.de||'—') + '</div>' +
                            '<div><span style="color:#888;">Para:</span> ' + _esc(e.para||'—') + '</div>' +
                            (e.assunto ? '<div><span style="color:#888;">Assunto:</span> ' + _esc(e.assunto) + '</div>' : '') +
                            (e.mensagem ? '<div style="margin-top:4px;padding:6px 10px;background:#f8f9fa;border-radius:4px;font-size:.82rem;color:#555;">' + _esc(e.mensagem.substring(0,120)) + (e.mensagem.length>120?'…':'') + '</div>' : '') +
                            (e.resposta ? '<div style="margin-top:4px;padding:6px 10px;background:#d1fae5;border-radius:4px;font-size:.82rem;color:#065f46;"><strong>Resposta:</strong> ' + _esc(e.resposta) + '</div>' : '') +
                            (e.anexo ? '<div style="font-size:.77rem;color:#888;margin-top:3px;"><i class="bi bi-paperclip me-1"></i>' + _esc(e.anexo) + '</div>' : '') +
                        '</div>' +
                    '</div>';
                }).join('');

            return '<div class="adm-card">' +
                '<div class="adm-card-hdr" style="display:flex;align-items:center;justify-content:space-between;">' +
                    '<span><i class="bi bi-journal-text me-2" style="color:#6f42c1;"></i>Log de E-mails Simulados <span style="font-size:.78rem;color:#888;font-weight:400;">(' + log.length + ' registro' + (log.length!==1?'s':'') + ')</span></span>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<button id="adm-log-atualizar" class="btn btn-outline-secondary btn-sm" title="Atualizar"><i class="bi bi-arrow-clockwise"></i></button>' +
                        '<button id="adm-log-exportar" class="btn btn-outline-secondary btn-sm"><i class="bi bi-download me-1"></i>CSV</button>' +
                        '<button id="adm-log-limpar" class="btn btn-outline-danger btn-sm"><i class="bi bi-trash me-1"></i>Limpar</button>' +
                    '</div>' +
                '</div>' +
                '<div class="adm-card-corpo" style="max-height:420px;overflow-y:auto;padding:14px 16px;">' +
                    logHtml +
                '</div>' +
            '</div>';
        }

        function _bindEmailLog(container) {
            var btnAtualizar = container.querySelector('#adm-log-atualizar');
            var btnExportar  = container.querySelector('#adm-log-exportar');
            var btnLimpar    = container.querySelector('#adm-log-limpar');
            if (btnAtualizar) btnAtualizar.addEventListener('click', function(){
                container.innerHTML = _renderEmailLog();
                _bindEmailLog(container);
            });
            if (btnExportar) btnExportar.addEventListener('click', function(){
                var log = sgObterEmailLog();
                if (!log.length) { alert('Nenhum registro para exportar.'); return; }
                var cols = ['dataRegistro','tipo','ticketId','de','para','assunto','statusLabel','modoEnvio','mensagem'];
                var csv  = cols.join(',') + '\n' + log.map(function(e){
                    return cols.map(function(c){ return '"' + String(e[c]||'').replace(/"/g,'""') + '"'; }).join(',');
                }).join('\n');
                var blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
                var url  = URL.createObjectURL(blob);
                var a    = document.createElement('a');
                a.href = url; a.download = 'servgo-email-log-' + new Date().toISOString().slice(0,10) + '.csv';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                exibirToast('Log exportado com sucesso!');
            });
            if (btnLimpar) btnLimpar.addEventListener('click', function(){
                if (!confirm('Limpar todo o log de e-mails simulados?')) return;
                sgLimparEmailLog();
                container.innerHTML = _renderEmailLog();
                _bindEmailLog(container);
                exibirToast('Log de e-mails limpo.');
            });
        }

        /**
         * Renderiza o formulário de dados admin de contato.
         */
        function _renderDadosAdmForm() {
            var d = sgObterDadosAdm();
            return '<div class="adm-card">' +
                '<div class="adm-card-hdr"><i class="bi bi-gear-fill me-2" style="color:#146ADB;"></i>Dados de Contato Administrativos' +
                '<small style="font-size:.78rem;color:#888;margin-left:10px;">Exibidos nas páginas de contato do site</small></div>' +
                '<div class="adm-card-corpo">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' +
                    '<div><label style="font-size:.83rem;font-weight:700;margin-bottom:4px;display:block;">Endereço</label><input id="dadosadm-endereco" class="form-control form-control-sm" value="' + _esc(d.endereco||'') + '" placeholder="Rua, número, cidade"></div>' +
                    '<div><label style="font-size:.83rem;font-weight:700;margin-bottom:4px;display:block;">Telefone</label><input id="dadosadm-telefone" class="form-control form-control-sm" value="' + _esc(d.telefone||'') + '" placeholder="(11) 91234-5678"></div>' +
                    '<div><label style="font-size:.83rem;font-weight:700;margin-bottom:4px;display:block;">E-mail de Suporte <span style="color:red;">*</span></label><input id="dadosadm-email" type="email" class="form-control form-control-sm" value="' + _esc(d.emailSuporte||'') + '" placeholder="suporte@site.com.br"></div>' +
                    '<div><label style="font-size:.83rem;font-weight:700;margin-bottom:4px;display:block;">WhatsApp</label><input id="dadosadm-whatsapp" class="form-control form-control-sm" value="' + _esc(d.whatsapp||'') + '" placeholder="(11) 91234-5678"></div>' +
                    '<div><label style="font-size:.83rem;font-weight:700;margin-bottom:4px;display:block;">Horário de Atendimento</label><input id="dadosadm-horario" class="form-control form-control-sm" value="' + _esc(d.horarioAtendimento||'') + '" placeholder="Seg-Sex 08h–18h"></div>' +
                    '<div><label style="font-size:.83rem;font-weight:700;margin-bottom:4px;display:block;">Site</label><input id="dadosadm-site" class="form-control form-control-sm" value="' + _esc(d.site||'') + '" placeholder="www.servgo.com.br"></div>' +
                '</div>' +
                '<div style="display:flex;gap:10px;margin-top:16px;">' +
                    '<button id="btn-salvar-dados-adm" class="btn btn-primary btn-sm"><i class="bi bi-floppy me-1"></i>Salvar Dados de Contato</button>' +
                    '<button id="btn-restaurar-dados-adm" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-counterclockwise me-1"></i>Restaurar Padrão</button>' +
                '</div>' +
                '</div></div>';
        }

        function _bindDadosAdmForm(container) {
            var btnSalvar = (container || document).getElementById('btn-salvar-dados-adm');
            var btnRestaurar = (container || document).getElementById('btn-restaurar-dados-adm');
            if (btnSalvar) btnSalvar.addEventListener('click', function(){
                var dados = {
                    endereco:           ((container||document).getElementById('dadosadm-endereco')  || {}).value || '',
                    telefone:           ((container||document).getElementById('dadosadm-telefone')  || {}).value || '',
                    emailSuporte:       ((container||document).getElementById('dadosadm-email')     || {}).value || '',
                    horarioAtendimento: ((container||document).getElementById('dadosadm-horario')   || {}).value || '',
                    whatsapp:           ((container||document).getElementById('dadosadm-whatsapp')  || {}).value || '',
                    site:               ((container||document).getElementById('dadosadm-site')      || {}).value || ''
                };
                if (!dados.emailSuporte || !/\S+@\S+\.\S+/.test(dados.emailSuporte)) {
                    alert('Informe um e-mail de suporte válido.'); return;
                }
                sgSalvarDadosAdm(dados);
                exibirToast('Dados de contato salvos! As páginas de contato já refletem as novas informações.');
            });
            if (btnRestaurar) btnRestaurar.addEventListener('click', function(){
                if (!confirm('Restaurar os valores padrão de contato?')) return;
                sgSalvarDadosAdm(Object.assign({}, SG_DADOS_ADM_DEFAULTS));
                var campos = { 'dadosadm-endereco': SG_DADOS_ADM_DEFAULTS.endereco, 'dadosadm-telefone': SG_DADOS_ADM_DEFAULTS.telefone, 'dadosadm-email': SG_DADOS_ADM_DEFAULTS.emailSuporte, 'dadosadm-horario': SG_DADOS_ADM_DEFAULTS.horarioAtendimento, 'dadosadm-whatsapp': SG_DADOS_ADM_DEFAULTS.whatsapp, 'dadosadm-site': SG_DADOS_ADM_DEFAULTS.site };
                Object.keys(campos).forEach(function(id){ var el = (container||document).getElementById(id); if(el) el.value = campos[id]; });
                exibirToast('Dados restaurados para os valores padrão.');
            });
        }

        function _abrirResponderTicket(id) {
            var t = obterTickets().find(function(x){ return x.id===id; });
            if (!t) return;
            document.getElementById('adm-ticket-id').value = id;
            document.getElementById('adm-ticket-status').value  = t.status || 'aberto';
            document.getElementById('adm-ticket-resposta').value = t.resposta || '';
            var detEl = document.getElementById('adm-ticket-detalhes');
            if (detEl) {
                var origemLabel = { prestador: 'Prestador', cliente: 'Cliente', visitante: 'Visitante' }[t.origem] || (t.origem || '—');
                detEl.innerHTML =
                    '<div style="background:#f8f9fa;padding:12px;border-radius:6px;font-size:.88rem;">' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:8px;">' +
                    '<div><strong>De:</strong> ' + _esc(t.nome||'—') + ' &lt;' + _esc(t.email||'') + '&gt;</div>' +
                    '<div><strong>Origem:</strong> ' + _esc(origemLabel) + (t.tipoUsuario ? ' (' + _esc(t.tipoUsuario) + ')' : '') + '</div>' +
                    '<div><strong>Assunto:</strong> ' + _esc(t.assunto||'—') + '</div>' +
                    '<div><strong>Abertura:</strong> ' + _fmtData(t.dataAbertura) + '</div>' +
                    (t.anexo ? '<div><strong>Anexo:</strong> ' + _esc(t.anexo) + '</div>' : '') +
                    '</div>' +
                    '<strong>Mensagem:</strong>' +
                    '<div style="margin-top:6px;padding:8px 12px;background:#fff;border:1px solid #dee2e6;border-radius:4px;line-height:1.5;">' + _esc(t.mensagem||'') + '</div>' +
                    '</div>';
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdmTicket')).show();
        }

        var btnSalvarTicket = document.getElementById('adm-btn-salvar-ticket');
        if (btnSalvarTicket) {
            btnSalvarTicket.addEventListener('click', function(){
                var id       = (document.getElementById('adm-ticket-id')||{}).value;
                var status   = (document.getElementById('adm-ticket-status')||{}).value;
                var resposta = (document.getElementById('adm-ticket-resposta')||{}).value.trim();
                var tickets  = obterTickets();
                var idx      = tickets.findIndex(function(t){ return t.id===id; });
                if (idx < 0) return;
                var statusAnterior = tickets[idx].status;
                tickets[idx].status           = status;
                tickets[idx].resposta         = resposta;
                tickets[idx].dataResposta     = new Date().toISOString();
                tickets[idx].adminResponsavel = usu.nome || usu.email;
                salvarTickets(tickets);
                bootstrap.Modal.getInstance(document.getElementById('modalAdmTicket')).hide();
                // Notifica o usuário por e-mail sempre que status ou resposta muda
                sgEnviarNotificacaoStatusTicket(tickets[idx], status, resposta);
                exibirToast('Chamado atualizado! Notificação enviada para ' + (tickets[idx].email||'o usuário') + '.');
                _atualizarBadges();
                _carregarSupporte();
            });
        }

        // ── SEÇÃO: MANUTENÇÃO ──────────────────────────────────
        // =========================================================
        // SPRINT 1 — SEÇÃO: PLANOS & CONTRATOS
        // Permite ao admin visualizar, editar e salvar os planos de
        // assinatura exibidos para os prestadores na plataforma.
        // Os dados são persistidos em localStorage sob a chave
        // 'sgPlanosConfig', lida por SG_Trial.obterPlanos() via
        // fallback que prioriza a configuração editada pelo admin.
        // =========================================================
        var SG_PLANOS_KEY = 'sgPlanosConfig';

        function _sgObterPlanosConfig() {
            try {
                var salvo = JSON.parse(localStorage.getItem(SG_PLANOS_KEY));
                if (salvo && Array.isArray(salvo) && salvo.length > 0) return salvo;
            } catch(e) {}
            // Fallback: retorna os planos padrão do SG_Trial
            return SG_Trial.obterPlanos().map(function(p) { return Object.assign({}, p); });
        }

        function _sgSalvarPlanosConfig(arr) {
            try { localStorage.setItem(SG_PLANOS_KEY, JSON.stringify(arr)); return true; } catch(e) { return false; }
        }

        // ── SPRINT 1 — Termos de Contrato editáveis pelo admin ──
        var SG_TERMOS_KEY = 'sgTermosContrato';

        function _sgTermosPadrao() {
            return [
                { id:'geral', icone:'bi-shield-check', cor:'#146ADB', aberto:true,
                  titulo:'Cláusulas Gerais — Todos os Planos',
                  corpo:'<p><strong>1. Objeto do Contrato</strong><br>O presente contrato regula a prestação de serviços de plataforma digital ServGo!, consistente na disponibilização de HotSite para prestadores de serviço e intermediação de agendamentos.</p>'+
                        '<p><strong>2. Vigência</strong><br>A assinatura é mensal, renovada automaticamente, e pode ser cancelada a qualquer momento pelo prestador pelo painel de controle, sem multa.</p>'+
                        '<p><strong>3. Período de Testes</strong><br>Novos prestadores têm direito a 30 (trinta) dias de uso gratuito da plataforma, com HotSite ativo no catálogo, agendamentos ilimitados, avaliações de clientes, suporte por e-mail e galeria de até 4 (quatro) arquivos de mídia (3 fotos + 1 vídeo). Após esse período, a continuidade exige a contratação de um plano.</p>'+
                        '<p><strong>4. Pagamento</strong><br>As cobranças são mensais, realizadas na data de aniversário da assinatura. O não pagamento dentro de 5 (cinco) dias corridos implica suspensão do acesso.</p>'+
                        '<p><strong>5. Cancelamento</strong><br>O cancelamento pode ser solicitado a qualquer momento. O acesso permanece ativo até o fim do ciclo mensal pago. Ao cancelar, o HotSite é removido do catálogo e o login é bloqueado.</p>'+
                        '<p><strong>6. Responsabilidade</strong><br>O prestador é responsável pelo conteúdo publicado em seu HotSite. A ServGo! não se responsabiliza por serviços contratados diretamente entre prestador e cliente fora da plataforma.</p>'+
                        '<p><strong>7. Foro</strong><br>Fica eleito o foro da comarca de Presidente Prudente — SP para dirimir quaisquer controvérsias, com renúncia a qualquer outro.</p>' },
                { id:'basico', icone:'bi-file-earmark', cor:'#146ADB', aberto:false,
                  titulo:'Contrato — Plano Básico (R$ 49,90/mês)',
                  corpo:'<p>Aplicam-se todas as Cláusulas Gerais, acrescidas das seguintes condições específicas:</p><ul>'+
                        '<li><strong>HotSite:</strong> O prestador terá um perfil público no catálogo ServGo! com informações básicas, categoria de serviço, cidade, avaliações e galeria de até 7 (sete) arquivos de mídia (6 fotos + 1 vídeo).</li>'+
                        '<li><strong>Agendamentos:</strong> O sistema de agendamentos online é ilimitado. O prestador configura sua agenda e disponibilidade pelo painel.</li>'+
                        '<li><strong>Avaliações:</strong> Clientes podem avaliar o prestador após o atendimento. O prestador pode responder às avaliações.</li>'+
                        '<li><strong>Suporte:</strong> Atendimento por e-mail em horário comercial (seg a sex, 8h–18h), com retorno em até 48h úteis.</li>'+
                        '<li><strong>Destaque:</strong> O HotSite não recebe posicionamento de destaque no catálogo. A ordenação segue critérios de avaliação e atividade.</li>'+
                        '<li><strong>Cancelamento:</strong> Sem multa rescisória. O acesso permanece ativo até o fim do ciclo pago.</li></ul>' },
                { id:'profissional', icone:'bi-file-earmark-check', cor:'#b8870c', aberto:false,
                  titulo:'Contrato — Plano Profissional (R$ 89,90/mês)',
                  corpo:'<p>Inclui todos os benefícios do Plano Básico, mais:</p><ul>'+
                        '<li><strong>Galeria Ampliada:</strong> Galeria de até 12 (doze) arquivos de mídia (11 fotos + 1 vídeo) publicados no HotSite.</li>'+
                        '<li><strong>Destaque no Catálogo:</strong> O HotSite é posicionado prioritariamente nos resultados de busca e na listagem do catálogo público, com badge "Destaque".</li>'+
                        '<li><strong>Relatórios Mensais:</strong> Relatório mensal com estatísticas de visitas ao HotSite, agendamentos realizados, avaliações recebidas e comparativo com o mês anterior.</li>'+
                        '<li><strong>Suporte:</strong> Atendimento por e-mail em horário comercial, com retorno em até 24h úteis.</li>'+
                        '<li><strong>Cancelamento:</strong> Sem multa rescisória. O acesso permanece ativo até o fim do ciclo pago.</li></ul>' },
                { id:'premium', icone:'bi-file-earmark-check-fill', cor:'#198754', aberto:false,
                  titulo:'Contrato — Plano Premium (R$ 139,90/mês)',
                  corpo:'<p>Inclui todos os benefícios do Plano Profissional, mais:</p><ul>'+
                        '<li><strong>Galeria Premium:</strong> Galeria de até 20 (vinte) arquivos de mídia (18 fotos + 2 vídeos) publicados no HotSite.</li>'+
                        '<li><strong>Suporte Prioritário 24h:</strong> Canal de suporte exclusivo com retorno garantido em até 4h, incluindo fins de semana e feriados.</li>'+
                        '<li><strong>Selo Verificado ServGo!:</strong> Após verificação de documentos e histórico na plataforma, o HotSite recebe o selo oficial de profissional verificado, exibido em destaque no catálogo.</li>'+
                        '<li><strong>Relatórios Avançados:</strong> Relatório mensal detalhado com análise de desempenho, perfil de cliente, horários de pico e sugestões de otimização.</li>'+
                        '<li><strong>Campanhas de Divulgação:</strong> Inclusão mensal em campanhas de divulgação nas redes sociais do ServGo! e newsletter para clientes cadastrados.</li>'+
                        '<li><strong>Cancelamento:</strong> Sem multa rescisória. O acesso permanece ativo até o fim do ciclo pago.</li></ul>' },
                { id:'reembolso', icone:'bi-arrow-counterclockwise', cor:'#dc3545', aberto:false,
                  titulo:'Política de Reembolso',
                  corpo:'<p>Aplicável a todos os planos:</p><ul>'+
                        '<li>Cancelamentos dentro de 7 (sete) dias corridos da contratação inicial têm direito a reembolso integral (direito de arrependimento — CDC art. 49).</li>'+
                        '<li>Cancelamentos após 7 dias não geram reembolso proporcional. O acesso permanece ativo até o fim do ciclo mensal pago.</li>'+
                        '<li>Solicitações de reembolso devem ser encaminhadas para <strong>financeiro@servgo.app</strong> com o número do contrato.</li>'+
                        '<li>O prazo para processamento do reembolso é de até 10 (dez) dias úteis.</li></ul>' },
                { id:'alteracao', icone:'bi-arrow-repeat', cor:'#6f42c1', aberto:false,
                  titulo:'Alteração de Plano',
                  corpo:'<ul><li>O prestador pode fazer upgrade (migração para plano superior) a qualquer momento. Os benefícios do novo plano entram em vigor imediatamente.</li>'+
                        '<li>Downgrade (migração para plano inferior) é possível e também entra em vigor imediatamente.</li>'+
                        '<li>O ciclo de faturamento é reiniciado na data da alteração. Eventuais créditos proporcionais do plano anterior são descontados na nova cobrança.</li>'+
                        '<li>O número de contrato é mantido em qualquer alteração de plano.</li></ul>' }
            ];
        }

        function _sgObterTermosContrato() {
            try { var s = JSON.parse(localStorage.getItem(SG_TERMOS_KEY)); if (s && Array.isArray(s) && s.length) return s; } catch(e) {}
            return _sgTermosPadrao();
        }
        function _sgSalvarTermosContrato(arr) {
            try { localStorage.setItem(SG_TERMOS_KEY, JSON.stringify(arr)); return true; } catch(e) { return false; }
        }

        function _carregarPlanos() {
            var sec = document.getElementById('sec-planos');
            if (!sec) return;

            // ── Chave de configuração de períodos (trial / carência) ──
            var SG_TRIAL_CFG_KEY = 'sgTrialConfig';

            function _obterTrialConfig() {
                try {
                    var cfg = JSON.parse(localStorage.getItem(SG_TRIAL_CFG_KEY));
                    if (cfg && typeof cfg === 'object') return cfg;
                } catch(e) {}
                return { trialDias: 30, carenciaDias: 90 };
            }

            function _salvarTrialConfig(cfg) {
                try { localStorage.setItem(SG_TRIAL_CFG_KEY, JSON.stringify(cfg)); return true; } catch(e) { return false; }
            }

            var planos = _sgObterPlanosConfig();

            // ── Helpers de contratos ──────────────────────────────────
            function _obterContratosAtivos() {
                var usu = obterUsuariosCadastrados();
                var lista = [];
                Object.keys(usu).forEach(function(email) {
                    var u = usu[email];
                    if (u.tipo !== 'prestador') return;
                    var ass = u.assinatura || {};
                    lista.push({
                        nome:        u.nome || '—',
                        email:       email,
                        plano:       ass.plano || (u.trialInicio ? 'trial' : '—'),
                        status:      ass.ativa ? 'ativo' : (ass.cancelada ? 'cancelado' : (u.trialInicio ? 'trial' : 'sem_plano')),
                        contratoId:  ass.contratoId || '—',
                        dataInicio:  ass.dataInicio  ? new Date(ass.dataInicio).toLocaleDateString('pt-BR')  : '—',
                        dataCancelamento: ass.dataCancelamento ? new Date(ass.dataCancelamento).toLocaleDateString('pt-BR') : '—',
                        trialInicio: u.trialInicio   ? new Date(u.trialInicio).toLocaleDateString('pt-BR')   : '—'
                    });
                });
                return lista;
            }

            function _statusBadge(status) {
                var mapa = {
                    ativo:     '<span style="background:#d1fae5;color:#065f46;font-size:.72rem;font-weight:700;padding:2px 10px;border-radius:20px;">Ativo</span>',
                    cancelado: '<span style="background:#fee2e2;color:#991b1b;font-size:.72rem;font-weight:700;padding:2px 10px;border-radius:20px;">Cancelado</span>',
                    trial:     '<span style="background:#fef3c7;color:#92400e;font-size:.72rem;font-weight:700;padding:2px 10px;border-radius:20px;">Trial</span>',
                    sem_plano: '<span style="background:#f3f4f6;color:#6b7280;font-size:.72rem;font-weight:700;padding:2px 10px;border-radius:20px;">Sem Plano</span>'
                };
                return mapa[status] || mapa['sem_plano'];
            }

            function _renderSecaoPlanos() {
                planos = _sgObterPlanosConfig();
                var trialCfg = _obterTrialConfig();
                var contratos = _obterContratosAtivos();

                // ── KPIs ────────────────────────────────────────────
                var totalAssinantes = contratos.filter(function(c){ return c.status === 'ativo'; }).length;
                var totalTrial      = contratos.filter(function(c){ return c.status === 'trial'; }).length;
                var totalCancelados = contratos.filter(function(c){ return c.status === 'cancelado'; }).length;
                var totalPrestadores= contratos.length;

                // ── Cards de planos ──────────────────────────────────
                var cardsHtml = planos.map(function(p, idx) {
                    var corDestaque = p.destaque ? '#FFC300' : '#dee2e6';
                    var bgDestaque  = p.destaque ? '#fffbeb' : '#fff';
                    var recursosArr = Array.isArray(p.recursos) ? p.recursos : [];
                    var recursosHtml = recursosArr.length
                        ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:.8rem;color:#444;">' +
                            recursosArr.map(function(r){ return '<li>' + _esc(r) + '</li>'; }).join('') +
                          '</ul>'
                        : '<span style="font-size:.78rem;color:#aaa;font-style:italic;">Nenhum recurso cadastrado.</span>';

                    // Assinantes deste plano
                    var assinantesPlano = contratos.filter(function(c){ return c.plano === p.id && c.status === 'ativo'; }).length;

                    return '<div class="adm-plano-card" style="border:2px solid ' + corDestaque + ';background:' + bgDestaque + ';border-radius:12px;padding:20px 22px;margin-bottom:20px;">' +
                        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
                            '<div style="display:flex;align-items:center;gap:10px;">' +
                                '<div style="width:16px;height:16px;border-radius:50%;background:' + _esc(p.cor || '#146ADB') + ';flex-shrink:0;border:2px solid rgba(0,0,0,.1);"></div>' +
                                '<span style="font-weight:800;font-size:1rem;color:#1a1a1a;">' + _esc(p.nome) + '</span>' +
                                (p.destaque ? '<span style="background:#FFC300;color:#000;font-size:.65rem;font-weight:800;padding:2px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.04em;">★ Destaque</span>' : '') +
                            '</div>' +
                            '<div style="display:flex;gap:8px;align-items:center;">' +
                                '<span style="font-size:.78rem;color:#6c757d;background:#f3f4f6;padding:3px 10px;border-radius:20px;">' + assinantesPlano + ' assinante' + (assinantesPlano !== 1 ? 's' : '') + '</span>' +
                                '<button class="adm-btn-acao ver" data-acao="editar-plano" data-idx="' + idx + '" title="Editar plano">' +
                                    '<i class="bi bi-pencil-fill me-1"></i>Editar' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;font-size:.85rem;color:#555;margin-bottom:10px;">' +
                            '<div><i class="bi bi-tag-fill me-1" style="color:#146ADB;"></i><strong>ID:</strong> ' + _esc(p.id) + '</div>' +
                            '<div><i class="bi bi-cash-coin me-1" style="color:#198754;"></i><strong>Preço:</strong> <span style="font-weight:700;color:#198754;">' + _esc(p.preco) + '</span></div>' +
                            '<div style="grid-column:1/-1;"><i class="bi bi-card-text me-1" style="color:#6f42c1;"></i><strong>Descrição:</strong> ' + _esc(p.descricao) + '</div>' +
                            '<div><i class="bi bi-palette me-1" style="color:#fd7e14;"></i><strong>Cor:</strong> <span style="display:inline-block;width:14px;height:14px;background:' + _esc(p.cor) + ';border-radius:3px;vertical-align:middle;margin-right:4px;border:1px solid #ccc;"></span>' + _esc(p.cor) + '</div>' +
                        '</div>' +
                        '<div style="border-top:1px solid #eee;padding-top:10px;margin-top:4px;">' +
                            '<div style="font-size:.8rem;font-weight:700;color:#444;margin-bottom:4px;"><i class="bi bi-check2-all me-1" style="color:#146ADB;"></i>Recursos / Benefícios:</div>' +
                            recursosHtml +
                        '</div>' +
                    '</div>';
                }).join('');

                // ── Tabela de contratos ──────────────────────────────
                var contratosHtml;
                if (contratos.length === 0) {
                    contratosHtml = '<div style="text-align:center;padding:32px;color:#aaa;font-size:.88rem;"><i class="bi bi-inbox" style="font-size:2rem;display:block;margin-bottom:8px;"></i>Nenhum prestador cadastrado.</div>';
                } else {
                    contratosHtml =
                        '<div style="overflow-x:auto;">' +
                        '<table class="prest-tabela" style="font-size:.82rem;">' +
                        '<thead><tr>' +
                            '<th>Prestador</th><th>E-mail</th><th>Plano</th>' +
                            '<th>Status</th><th>Contrato</th><th>Início</th><th>Cancelamento</th><th>Trial Início</th>' +
                        '</tr></thead><tbody>' +
                        contratos.map(function(c) {
                            var planoNome = (function(){
                                var p = planos.filter(function(pl){ return pl.id === c.plano; })[0];
                                return p ? p.nome : (c.plano === 'trial' ? 'Trial' : (c.plano || '—'));
                            }());
                            return '<tr>' +
                                '<td style="font-weight:600;">' + _esc(c.nome) + '</td>' +
                                '<td>' + _esc(c.email) + '</td>' +
                                '<td><span style="background:#e0ecff;color:#146ADB;font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:20px;">' + _esc(planoNome) + '</span></td>' +
                                '<td>' + _statusBadge(c.status) + '</td>' +
                                '<td style="font-family:monospace;font-size:.75rem;">' + _esc(c.contratoId) + '</td>' +
                                '<td>' + _esc(c.dataInicio) + '</td>' +
                                '<td>' + _esc(c.dataCancelamento) + '</td>' +
                                '<td>' + _esc(c.trialInicio) + '</td>' +
                            '</tr>';
                        }).join('') +
                        '</tbody></table></div>';
                }

                // ── Termos de Contrato (editáveis) ───────────────────
                var termos = _sgObterTermosContrato();
                var termosLinhasHtml = termos.map(function (t, i) {
                    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #eee;border-radius:8px;margin-bottom:10px;background:#fff;">' +
                        '<div style="display:flex;align-items:center;gap:10px;min-width:0;">' +
                            '<i class="bi '+_esc(t.icone||'bi-file-earmark-text')+'" style="color:'+_esc(t.cor||'#146ADB')+';font-size:1.1rem;flex-shrink:0;"></i>' +
                            '<div style="min-width:0;">' +
                                '<div style="font-weight:700;font-size:.9rem;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_esc(t.titulo)+'</div>' +
                                '<div style="font-size:.74rem;color:#888;">ID: '+_esc(t.id)+'</div>' +
                            '</div></div>' +
                        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
                            '<button class="adm-btn-acao ver" data-acao="editar-termo" data-idx="'+i+'" title="Editar cláusula"><i class="bi bi-pencil-fill me-1"></i>Editar</button>' +
                            '<button class="adm-btn-acao" data-acao="excluir-termo" data-idx="'+i+'" title="Excluir cláusula" style="color:#dc3545;border-color:#f5c2c7;"><i class="bi bi-trash3"></i></button>' +
                        '</div></div>';
                }).join('');
                var termosCardHtml =
                    '<div class="adm-card" style="margin-top:20px;">' +
                        '<div class="adm-card-hdr" style="display:flex;align-items:center;justify-content:space-between;">' +
                            '<span><i class="bi bi-file-earmark-text-fill me-2" style="color:#146ADB;"></i>Termos de Contrato (exibidos em planosContrato.html)</span>' +
                            '<div style="display:flex;gap:8px;">' +
                                '<button class="adm-btn-acao ver" id="adm-termo-novo" style="background:#198754;color:#fff;border-color:#198754;"><i class="bi bi-plus-circle me-1"></i>Nova Cláusula</button>' +
                                '<button class="adm-btn-acao" id="adm-termos-restaurar" style="background:#6f42c1;color:#fff;border-color:#6f42c1;" title="Restaurar termos padrão"><i class="bi bi-arrow-counterclockwise me-1"></i>Restaurar Padrão</button>' +
                            '</div></div>' +
                        '<div class="adm-card-corpo" style="padding:16px;">' +
                            '<p style="font-size:.82rem;color:#888;margin:0 0 14px;">Edite título e conteúdo de cada cláusula. As alterações aparecem imediatamente para os prestadores na página de Planos e Contratos. O conteúdo aceita HTML simples (parágrafos, listas, negrito).</p>' +
                            (termosLinhasHtml || '<div style="text-align:center;padding:24px;color:#aaa;font-size:.85rem;">Nenhuma cláusula cadastrada.</div>') +
                        '</div></div>';

                sec.innerHTML =
                    '<div class="adm-secao-titulo"><i class="bi bi-credit-card-2-front-fill" style="color:#146ADB;"></i>Planos & Contratos de Assinatura</div>' +
                    '<p class="adm-secao-subtitulo">Gerencie os planos de assinatura, recursos, preços e períodos oferecidos aos prestadores. As alterações refletem imediatamente na plataforma.</p>' +

                    // KPIs
                    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">' +
                        '<div class="prest-stat-card destaque-azul" style="margin:0;">' +
                            '<div class="prest-stat-titulo">Planos Configurados</div>' +
                            '<div class="prest-stat-valor">' + planos.length + '</div>' +
                        '</div>' +
                        '<div class="prest-stat-card destaque-amarelo" style="margin:0;">' +
                            '<div class="prest-stat-titulo">Assinantes Ativos</div>' +
                            '<div class="prest-stat-valor">' + totalAssinantes + '</div>' +
                        '</div>' +
                        '<div class="prest-stat-card" style="margin:0;border-left:4px solid #198754;">' +
                            '<div class="prest-stat-titulo">Em Trial</div>' +
                            '<div class="prest-stat-valor">' + totalTrial + '</div>' +
                        '</div>' +
                        '<div class="prest-stat-card" style="margin:0;border-left:4px solid #dc3545;">' +
                            '<div class="prest-stat-titulo">Cancelados</div>' +
                            '<div class="prest-stat-valor">' + totalCancelados + '</div>' +
                        '</div>' +
                    '</div>' +

                    // Configuração de períodos (Trial e Carência)
                    '<div class="adm-card" style="margin-bottom:20px;">' +
                        '<div class="adm-card-hdr"><span><i class="bi bi-sliders me-2" style="color:#6f42c1;"></i>Configuração de Períodos</span></div>' +
                        '<div class="adm-card-corpo" style="padding:20px;">' +
                            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +
                                '<div>' +
                                    '<label class="form-label fw-bold" style="font-size:.88rem;">Período de Trial Gratuito (dias) <span style="color:red;">*</span></label>' +
                                    '<input type="number" class="form-control" id="adm-trial-dias" value="' + trialCfg.trialDias + '" min="1" max="365" style="max-width:160px;">' +
                                    '<small class="text-muted">Dias de acesso gratuito para novos prestadores. Padrão: 30 dias.</small>' +
                                '</div>' +
                                '<div>' +
                                    '<label class="form-label fw-bold" style="font-size:.88rem;">Carência para Plano Gratuito (dias) <span style="color:red;">*</span></label>' +
                                    '<input type="number" class="form-control" id="adm-carencia-dias" value="' + trialCfg.carenciaDias + '" min="0" max="730" style="max-width:160px;">' +
                                    '<small class="text-muted">Dias de espera após cancelamento para reativar plano gratuito. Padrão: 90 dias.</small>' +
                                '</div>' +
                            '</div>' +
                            '<div id="adm-trial-alerta" class="mt-3" style="display:none;"></div>' +
                            '<div style="display:flex;gap:10px;margin-top:16px;">' +
                                '<button class="adm-btn-acao ver" id="adm-btn-salvar-trial" style="background:#6f42c1;color:#fff;border-color:#6f42c1;">' +
                                    '<i class="bi bi-floppy me-1"></i>Salvar Períodos' +
                                '</button>' +
                                '<button class="adm-btn-acao" id="adm-btn-restaurar-trial">' +
                                    '<i class="bi bi-arrow-counterclockwise me-1"></i>Restaurar Padrão' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    // Lista de planos
                    '<div class="adm-card" style="margin-bottom:20px;">' +
                        '<div class="adm-card-hdr" style="display:flex;align-items:center;justify-content:space-between;">' +
                            '<span><i class="bi bi-list-check me-2" style="color:#146ADB;"></i>Planos de Assinatura</span>' +
                            '<div style="display:flex;gap:8px;">' +
                                '<button class="adm-btn-acao" id="adm-planos-restaurar" style="background:#6f42c1;color:#fff;border-color:#6f42c1;" title="Restaurar planos padrão do sistema">' +
                                    '<i class="bi bi-arrow-counterclockwise me-1"></i>Restaurar Padrão' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="adm-card-corpo" style="padding:16px;">' +
                            cardsHtml +
                        '</div>' +
                    '</div>' +

                    // Tabela de contratos
                    '<div class="adm-card">' +
                        '<div class="adm-card-hdr" style="display:flex;align-items:center;justify-content:space-between;">' +
                            '<span><i class="bi bi-file-earmark-text me-2" style="color:#198754;"></i>Contratos dos Prestadores</span>' +
                            '<span style="font-size:.78rem;color:#888;">' + totalPrestadores + ' prestador' + (totalPrestadores !== 1 ? 'es' : '') + ' cadastrado' + (totalPrestadores !== 1 ? 's' : '') + '</span>' +
                        '</div>' +
                        '<div class="adm-card-corpo" style="padding:0 0 8px;">' +
                            contratosHtml +
                        '</div>' +
                    '</div>' +

                    termosCardHtml;

                // ── Listener: Salvar períodos ─────────────────────────
                var btnSalvarTrial = document.getElementById('adm-btn-salvar-trial');
                var alertaTrial    = document.getElementById('adm-trial-alerta');
                if (btnSalvarTrial) {
                    btnSalvarTrial.addEventListener('click', function() {
                        var td = parseInt(document.getElementById('adm-trial-dias').value, 10);
                        var cd = parseInt(document.getElementById('adm-carencia-dias').value, 10);
                        if (isNaN(td) || td < 1) {
                            alertaTrial.innerHTML = '<div class="alert alert-danger py-2 px-3 mb-0"><i class="bi bi-exclamation-circle me-1"></i>Período de Trial deve ser no mínimo 1 dia.</div>';
                            alertaTrial.style.display = 'block'; return;
                        }
                        if (isNaN(cd) || cd < 0) {
                            alertaTrial.innerHTML = '<div class="alert alert-danger py-2 px-3 mb-0"><i class="bi bi-exclamation-circle me-1"></i>Carência deve ser 0 ou mais dias.</div>';
                            alertaTrial.style.display = 'block'; return;
                        }
                        if (_salvarTrialConfig({ trialDias: td, carenciaDias: cd })) {
                            alertaTrial.style.display = 'none';
                            exibirToast('Períodos atualizados! Trial: ' + td + ' dias | Carência: ' + cd + ' dias.');
                        } else {
                            alertaTrial.innerHTML = '<div class="alert alert-danger py-2 px-3 mb-0"><i class="bi bi-exclamation-circle me-1"></i>Erro ao salvar. Verifique o armazenamento.</div>';
                            alertaTrial.style.display = 'block';
                        }
                    });
                }

                // ── Listener: Restaurar períodos padrão ──────────────
                var btnRestaurarTrial = document.getElementById('adm-btn-restaurar-trial');
                if (btnRestaurarTrial) {
                    btnRestaurarTrial.addEventListener('click', function() {
                        if (!confirm('Restaurar os períodos de Trial (30 dias) e Carência (90 dias) para os valores padrão?')) return;
                        localStorage.removeItem(SG_TRIAL_CFG_KEY);
                        exibirToast('Períodos restaurados para o padrão do sistema!');
                        _renderSecaoPlanos();
                    });
                }

                // ── Listener: Editar plano ────────────────────────────
                sec.querySelectorAll('[data-acao="editar-plano"]').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var idx = parseInt(btn.dataset.idx, 10);
                        _abrirModalEditarPlano(idx);
                    });
                });

                // ── Listener: Restaurar planos padrão ────────────────
                var btnRestaurar = document.getElementById('adm-planos-restaurar');
                if (btnRestaurar) {
                    btnRestaurar.addEventListener('click', function() {
                        if (!confirm('Restaurar todos os planos para os valores padrão do sistema?\n\nEsta ação não pode ser desfeita.')) return;
                        localStorage.removeItem(SG_PLANOS_KEY);
                        exibirToast('Planos restaurados para o padrão do sistema!');
                        _renderSecaoPlanos();
                    });
                }

                // ── Listeners: Termos de Contrato ─────────────────────
                var btnNovoTermo = document.getElementById('adm-termo-novo');
                if (btnNovoTermo) btnNovoTermo.addEventListener('click', function(){ _abrirModalEditarTermo(-1); });

                sec.querySelectorAll('[data-acao="editar-termo"]').forEach(function (btn) {
                    btn.addEventListener('click', function(){ _abrirModalEditarTermo(parseInt(btn.dataset.idx,10)); });
                });
                sec.querySelectorAll('[data-acao="excluir-termo"]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var idx = parseInt(btn.dataset.idx,10);
                        var lista = _sgObterTermosContrato(); var t = lista[idx]; if (!t) return;
                        if (!confirm('Excluir a cláusula "'+(t.titulo||'')+'"?\n\nEsta ação não pode ser desfeita.')) return;
                        lista.splice(idx,1); _sgSalvarTermosContrato(lista);
                        exibirToast('Cláusula removida.'); _renderSecaoPlanos();
                    });
                });
                var btnRestTermos = document.getElementById('adm-termos-restaurar');
                if (btnRestTermos) btnRestTermos.addEventListener('click', function () {
                    if (!confirm('Restaurar todos os Termos de Contrato para o padrão do sistema?\n\nEsta ação não pode ser desfeita.')) return;
                    localStorage.removeItem(SG_TERMOS_KEY);
                    exibirToast('Termos restaurados para o padrão!'); _renderSecaoPlanos();
                });
            }

            // ── Modal: Editar Plano (expandido com Recursos) ─────────
            function _abrirModalEditarPlano(idx) {
                var p = planos[idx];
                if (!p) return;

                var modalId   = 'modalAdmEditarPlano';
                var existente = document.getElementById(modalId);
                if (existente) existente.remove();

                var recursosArr  = Array.isArray(p.recursos) ? p.recursos : [];
                var recursosVal  = recursosArr.join('\n');

                var html =
                    '<div class="modal fade" id="' + modalId + '" tabindex="-1" aria-modal="true" role="dialog">' +
                    '<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">' +
                    '<div class="modal-content">' +
                    '<div class="modal-header" style="background:#146ADB;color:#fff;">' +
                        '<h5 class="modal-title"><i class="bi bi-pencil-square me-2"></i>Editar Plano: ' + _esc(p.nome) + '</h5>' +
                        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="adm-form-grid">' +

                            '<div>' +
                                '<label class="form-label fw-bold">Nome do Plano <span style="color:red;">*</span></label>' +
                                '<input type="text" class="form-control" id="adm-plano-nome" value="' + _esc(p.nome) + '" maxlength="60" placeholder="Ex.: Plano Básico">' +
                            '</div>' +

                            '<div>' +
                                '<label class="form-label fw-bold">Preço <span style="color:red;">*</span></label>' +
                                '<input type="text" class="form-control" id="adm-plano-preco" value="' + _esc(p.preco) + '" maxlength="40" placeholder="Ex.: R$ 49,90/mês">' +
                            '</div>' +

                            '<div class="col-full">' +
                                '<label class="form-label fw-bold">Descrição / Resumo <span style="color:red;">*</span></label>' +
                                '<textarea class="form-control" id="adm-plano-descricao" rows="3" maxlength="300" style="resize:none;" placeholder="Descreva o plano resumidamente...">' + _esc(p.descricao) + '</textarea>' +
                                '<small class="text-muted"><span id="adm-plano-desc-chars">' + (p.descricao||'').length + '</span> / 300 caracteres</small>' +
                            '</div>' +

                            '<div class="col-full">' +
                                '<label class="form-label fw-bold">Recursos / Benefícios</label>' +
                                '<textarea class="form-control" id="adm-plano-recursos" rows="6" style="resize:vertical;" placeholder="Um recurso por linha&#10;Ex:&#10;HotSite ativo no catálogo&#10;Agendamentos ilimitados&#10;Suporte por e-mail">' + _esc(recursosVal) + '</textarea>' +
                                '<small class="text-muted">Um recurso por linha. Esses itens aparecem na lista de benefícios do plano exibida aos prestadores.</small>' +
                            '</div>' +

                            '<div>' +
                                '<label class="form-label fw-bold">Cor de Destaque</label>' +
                                '<div style="display:flex;align-items:center;gap:10px;">' +
                                    '<input type="color" class="form-control form-control-color" id="adm-plano-cor" value="' + (p.cor||'#146ADB') + '" style="width:50px;height:36px;padding:2px;">' +
                                    '<input type="text" class="form-control" id="adm-plano-cor-hex" value="' + _esc(p.cor||'#146ADB') + '" maxlength="7" placeholder="#146ADB" style="max-width:120px;">' +
                                '</div>' +
                            '</div>' +

                            '<div>' +
                                '<label class="form-label fw-bold">Destacar este plano?</label>' +
                                '<div class="form-check form-switch mt-1">' +
                                    '<input class="form-check-input" type="checkbox" id="adm-plano-destaque" role="switch"' + (p.destaque ? ' checked' : '') + '>' +
                                    '<label class="form-check-label" for="adm-plano-destaque"><i class="bi bi-star-fill text-warning me-1"></i>Exibir como plano em destaque (★ Mais Popular)</label>' +
                                '</div>' +
                                '<small class="text-muted">Apenas um plano deve ser marcado como destaque.</small>' +
                            '</div>' +

                        '</div>' +
                        '<div id="adm-plano-alerta" class="mt-3" style="display:none;"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>' +
                        '<button type="button" class="btn btn-primary" id="adm-btn-salvar-plano">' +
                            '<i class="bi bi-floppy me-1"></i>Salvar Alterações' +
                        '</button>' +
                    '</div>' +
                    '</div></div></div>';

                document.body.insertAdjacentHTML('beforeend', html);
                var modalEl = document.getElementById(modalId);
                var modal   = new bootstrap.Modal(modalEl);
                modal.show();

                // Sincroniza color picker ↔ hex input
                var colorEl   = document.getElementById('adm-plano-cor');
                var hexEl     = document.getElementById('adm-plano-cor-hex');
                var descEl    = document.getElementById('adm-plano-descricao');
                var descChars = document.getElementById('adm-plano-desc-chars');

                if (colorEl && hexEl) {
                    colorEl.addEventListener('input', function() { hexEl.value = colorEl.value; });
                    hexEl.addEventListener('input', function() {
                        if (/^#[0-9a-fA-F]{6}$/.test(hexEl.value)) colorEl.value = hexEl.value;
                    });
                }
                if (descEl && descChars) {
                    descEl.addEventListener('input', function() { descChars.textContent = descEl.value.length; });
                }

                // Salvar
                var btnSalvar = document.getElementById('adm-btn-salvar-plano');
                var alertaEl2 = document.getElementById('adm-plano-alerta');

                if (btnSalvar) {
                    btnSalvar.addEventListener('click', function() {
                        var nome      = (document.getElementById('adm-plano-nome').value || '').trim();
                        var preco     = (document.getElementById('adm-plano-preco').value || '').trim();
                        var descricao = (document.getElementById('adm-plano-descricao').value || '').trim();
                        var cor       = (document.getElementById('adm-plano-cor-hex').value || '').trim() || colorEl.value;
                        var destaque  = document.getElementById('adm-plano-destaque').checked;
                        var recursosRaw = (document.getElementById('adm-plano-recursos').value || '');
                        var recursos  = recursosRaw.split('\n').map(function(r){ return r.trim(); }).filter(function(r){ return r.length > 0; });

                        if (!nome || !preco || !descricao) {
                            alertaEl2.innerHTML = '<div class="alert alert-danger py-2 px-3 mb-0"><i class="bi bi-exclamation-circle me-1"></i>Preencha Nome, Preço e Descrição.</div>';
                            alertaEl2.style.display = 'block';
                            return;
                        }

                        // Se marcou como destaque, remove destaque dos outros
                        if (destaque) {
                            planos.forEach(function(pl, i) { if (i !== idx) pl.destaque = false; });
                        }

                        planos[idx] = Object.assign({}, planos[idx], {
                            nome:      nome,
                            preco:     preco,
                            descricao: descricao,
                            cor:       /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : (p.cor || '#146ADB'),
                            destaque:  destaque,
                            recursos:  recursos
                        });

                        if (_sgSalvarPlanosConfig(planos)) {
                            exibirToast('Plano "' + nome + '" atualizado com sucesso!');
                            modal.hide();
                            modalEl.addEventListener('hidden.bs.modal', function() {
                                try { modalEl.remove(); } catch(e) {}
                                _renderSecaoPlanos();
                            }, { once: true });
                        } else {
                            alertaEl2.innerHTML = '<div class="alert alert-danger py-2 px-3 mb-0"><i class="bi bi-exclamation-circle me-1"></i>Erro ao salvar. Verifique o armazenamento disponível.</div>';
                            alertaEl2.style.display = 'block';
                        }
                    });
                }

                // Limpa modal do DOM ao fechar
                modalEl.addEventListener('hidden.bs.modal', function() {
                    try { modalEl.remove(); } catch(e) {}
                }, { once: true });
            }

            // ── Modal: Editar / Criar Cláusula de Contrato ───────────
            function _abrirModalEditarTermo(idx) {
                var termos = _sgObterTermosContrato();
                var novo   = (idx < 0);
                var t      = novo ? { id:'', icone:'bi-file-earmark-text', cor:'#146ADB', titulo:'', corpo:'', aberto:false } : termos[idx];
                if (!t) return;
                var modalId = 'modalAdmEditarTermo';
                var ex = document.getElementById(modalId); if (ex) ex.remove();

                var html =
                    '<div class="modal fade" id="'+modalId+'" tabindex="-1" aria-modal="true" role="dialog">' +
                    '<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div class="modal-content">' +
                    '<div class="modal-header" style="background:#146ADB;color:#fff;">' +
                        '<h5 class="modal-title"><i class="bi bi-file-earmark-text me-2"></i>'+(novo?'Nova Cláusula':'Editar Cláusula')+'</h5>' +
                        '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body"><div class="adm-form-grid">' +
                        '<div><label class="form-label fw-bold">Título <span style="color:red;">*</span></label>' +
                            '<input type="text" class="form-control" id="adm-termo-titulo" value="'+_esc(t.titulo)+'" maxlength="120" placeholder="Ex.: Contrato — Plano Básico (R$ 49,90/mês)"></div>' +
                        '<div><label class="form-label fw-bold">Ícone (Bootstrap Icons)</label>' +
                            '<input type="text" class="form-control" id="adm-termo-icone" value="'+_esc(t.icone||'bi-file-earmark-text')+'" maxlength="40" placeholder="bi-shield-check">' +
                            '<small class="text-muted">Ex.: <code>bi-shield-check</code></small></div>' +
                        '<div><label class="form-label fw-bold">Cor do Ícone</label><div style="display:flex;align-items:center;gap:10px;">' +
                            '<input type="color" class="form-control form-control-color" id="adm-termo-cor" value="'+(/^#[0-9a-fA-F]{6}$/.test(t.cor||'')?t.cor:'#146ADB')+'" style="width:50px;height:36px;padding:2px;">' +
                            '<input type="text" class="form-control" id="adm-termo-cor-hex" value="'+_esc(t.cor||'#146ADB')+'" maxlength="7" style="max-width:120px;"></div></div>' +
                        '<div><label class="form-label fw-bold">Aberto por padrão?</label><div class="form-check form-switch mt-1">' +
                            '<input class="form-check-input" type="checkbox" id="adm-termo-aberto" role="switch"'+(t.aberto?' checked':'')+'>' +
                            '<label class="form-check-label" for="adm-termo-aberto">Exibir expandida ao abrir a página</label></div></div>' +
                        '<div class="col-full"><label class="form-label fw-bold">Conteúdo <span style="color:red;">*</span></label>' +
                            '<textarea class="form-control" id="adm-termo-corpo" rows="12" style="resize:vertical;font-family:monospace;font-size:.82rem;" placeholder="Aceita HTML simples: <p>, <ul>, <li>, <strong>...">'+_esc(t.corpo)+'</textarea>' +
                            '<small class="text-muted">HTML simples permitido: &lt;p&gt;, &lt;ul&gt;&lt;li&gt;, &lt;strong&gt;.</small></div>' +
                    '</div><div id="adm-termo-alerta" class="mt-3" style="display:none;"></div></div>' +
                    '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>' +
                        '<button type="button" class="btn btn-primary" id="adm-btn-salvar-termo"><i class="bi bi-floppy me-1"></i>Salvar Cláusula</button></div>' +
                    '</div></div></div>';

                document.body.insertAdjacentHTML('beforeend', html);
                var modalEl = document.getElementById(modalId);
                var modal = new bootstrap.Modal(modalEl); modal.show();

                var corEl = document.getElementById('adm-termo-cor');
                var hexEl = document.getElementById('adm-termo-cor-hex');
                if (corEl && hexEl) {
                    corEl.addEventListener('input', function(){ hexEl.value = corEl.value; });
                    hexEl.addEventListener('input', function(){ if (/^#[0-9a-fA-F]{6}$/.test(hexEl.value)) corEl.value = hexEl.value; });
                }
                var alertaEl = document.getElementById('adm-termo-alerta');
                var btnSalvar = document.getElementById('adm-btn-salvar-termo');
                if (btnSalvar) btnSalvar.addEventListener('click', function () {
                    var titulo = (document.getElementById('adm-termo-titulo').value||'').trim();
                    var corpo  = (document.getElementById('adm-termo-corpo').value||'').trim();
                    var icone  = (document.getElementById('adm-termo-icone').value||'').trim() || 'bi-file-earmark-text';
                    var cor    = (document.getElementById('adm-termo-cor-hex').value||'').trim() || corEl.value;
                    var aberto = document.getElementById('adm-termo-aberto').checked;
                    if (!titulo || !corpo) {
                        alertaEl.innerHTML = '<div class="alert alert-danger py-2 px-3 mb-0"><i class="bi bi-exclamation-circle me-1"></i>Preencha Título e Conteúdo.</div>';
                        alertaEl.style.display='block'; return;
                    }
                    var lista = _sgObterTermosContrato();
                    var reg = {
                        id: novo ? ('ct-'+Date.now().toString(36)) : (t.id || ('ct-'+Date.now().toString(36))),
                        icone: icone, cor: /^#[0-9a-fA-F]{6}$/.test(cor)?cor:'#146ADB',
                        titulo: titulo, corpo: corpo, aberto: aberto
                    };
                    if (novo) lista.push(reg); else lista[idx] = Object.assign({}, lista[idx], reg);
                    if (_sgSalvarTermosContrato(lista)) {
                        exibirToast('Cláusula salva com sucesso!');
                        modal.hide();
                        modalEl.addEventListener('hidden.bs.modal', function(){ try{modalEl.remove();}catch(e){} _renderSecaoPlanos(); }, { once:true });
                    } else {
                        alertaEl.innerHTML = '<div class="alert alert-danger py-2 px-3 mb-0"><i class="bi bi-exclamation-circle me-1"></i>Erro ao salvar. Verifique o armazenamento.</div>';
                        alertaEl.style.display='block';
                    }
                });
                modalEl.addEventListener('hidden.bs.modal', function(){ try{modalEl.remove();}catch(e){} }, { once:true });
            }

            _renderSecaoPlanos();
        }
        // ── FIM Sprint 1: Planos & Contratos ─────────────────────────

        function _carregarManutencao() {
            var sec = document.getElementById('sec-manutencao');
            if (!sec) return;

            // Calcula uso do localStorage por chave relevante
            var chaves = [
                'usuariosCadastrados', 'hotsitePrestadorDados',
                'avaliacoesRecebidasPrestador', 'avaliacoesRecebidasDoCliente',
                'avaliacoesSalvas', NOTICIAS_KEY, TICKETS_KEY, 'sg_seed_v1'
            ];
            var tamanhoTotal = 0;
            var itensStorage = chaves.map(function(k){
                try {
                    var val = localStorage.getItem(k) || '';
                    var tam = (new Blob([val])).size;
                    tamanhoTotal += tam;
                    return { chave: k, tam: tam, fmt: tam > 1024 ? (tam/1024).toFixed(1)+' KB' : tam+' B' };
                } catch(e) { return {chave:k, tam:0, fmt:'—'}; }
            });
            var maxTam = Math.max.apply(null, itensStorage.map(function(i){ return i.tam; })) || 1;

            var storageHtml = itensStorage.map(function(item){
                var pct = Math.round((item.tam/maxTam)*100);
                var cor = item.tam > 50000 ? '#dc3545' : item.tam > 10000 ? '#FFC300' : '#146ADB';
                return '<div class="adm-storage-item">' +
                    '<div class="adm-storage-nome"><span>' + item.chave + '</span><span>' + item.fmt + '</span></div>' +
                    '<div class="adm-storage-barra"><div class="adm-storage-fill" style="width:' + pct + '%;background:' + cor + ';"></div></div>' +
                    '</div>';
            }).join('');

            var ferramentas = [
                {
                    cor:'#146ADB', icone:'bi-download', titulo:'Exportar Todos os Dados',
                    desc:'Baixa um arquivo JSON com todos os dados armazenados no sistema.',
                    acao:'exportar-dados', rotulo:'<i class="bi bi-download me-1"></i>Exportar JSON'
                },
                {
                    cor:'#6f42c1', icone:'bi-arrow-counterclockwise', titulo:'Recriar Seed de Prestadores',
                    desc:'Remove a flag sg_seed_v1 e recria os prestadores de demonstração na próxima recarga.',
                    acao:'reset-seed', rotulo:'<i class="bi bi-arrow-counterclockwise me-1"></i>Recriar Seed'
                },
                {
                    cor:'#198754', icone:'bi-plus-circle', titulo:'Adicionar Ticket de Demonstração',
                    desc:'Insere um ticket de suporte de exemplo para testar o painel de suporte.',
                    acao:'demo-ticket', rotulo:'<i class="bi bi-plus-circle me-1"></i>Criar Demo'
                },
                {
                    cor:'#dc3545', icone:'bi-trash3', titulo:'Limpar Notificações Antigas (>30 dias)',
                    desc:'Remove notificações lidas com mais de 30 dias de todos os usuários.',
                    acao:'limpar-notifs', rotulo:'<i class="bi bi-trash3 me-1"></i>Limpar'
                },
                {
                    cor:'#dc3545', icone:'bi-exclamation-triangle', titulo:'Excluir TODOS os Dados do Sistema',
                    desc:'Apaga todos os dados de localStorage do ServGo! (usuários, hotsite, agendamentos, etc). Use com extremo cuidado.',
                    acao:'reset-total', rotulo:'<i class="bi bi-exclamation-triangle me-1"></i>Reset Total', estilo:'background:#dc3545;color:#fff;border-color:#dc3545;'
                }
            ];

            var ferramentasHtml = ferramentas.map(function(f){
                return '<div class="adm-tool-card">' +
                    '<div class="adm-tool-icone" style="background:' + f.cor + ';">' +
                        '<i class="bi ' + f.icone + '"></i>' +
                    '</div>' +
                    '<div class="adm-tool-texto">' +
                        '<div class="adm-tool-titulo">' + f.titulo + '</div>' +
                        '<div class="adm-tool-desc">' + f.desc + '</div>' +
                    '</div>' +
                    '<div class="adm-tool-acao">' +
                        '<button class="adm-btn-acao ver" style="' + (f.estilo||'') + '" data-acao="' + f.acao + '">' + f.rotulo + '</button>' +
                    '</div>' +
                '</div>';
            }).join('');

            sec.innerHTML =
                '<div class="adm-secao-titulo"><i class="bi bi-tools" style="color:#6f42c1;"></i>Manutenção do Sistema</div>' +
                '<p class="adm-secao-subtitulo">Ferramentas avançadas para monitoramento, exportação e manutenção da plataforma.</p>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +
                    '<div>' +
                        '<div class="adm-card">' +
                            '<div class="adm-card-hdr"><span><i class="bi bi-hdd me-2" style="color:#146ADB;"></i>Uso do Armazenamento Local</span>' +
                                '<span style="font-size:.78rem;color:#888;">Total: ~' + (tamanhoTotal/1024).toFixed(1) + ' KB</span>' +
                            '</div>' +
                            '<div class="adm-card-corpo">' + storageHtml + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div class="adm-card">' +
                            '<div class="adm-card-hdr"><span><i class="bi bi-gear-fill me-2" style="color:#6f42c1;"></i>Ferramentas de Sistema</span></div>' +
                            '<div class="adm-card-corpo" style="padding:12px 16px;">' + ferramentasHtml + '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            // Ações das ferramentas
            sec.querySelectorAll('[data-acao]').forEach(function(btn){
                btn.addEventListener('click', function(){
                    var acao = btn.dataset.acao;
                    if (acao === 'exportar-dados') {
                        var dados = {};
                        for (var i=0; i<localStorage.length; i++) {
                            var k = localStorage.key(i);
                            if (k.startsWith('sg') || ['usuariosCadastrados','hotsitePrestadorDados','avaliacoesRecebidasPrestador','avaliacoesRecebidasDoCliente','avaliacoesSalvas'].indexOf(k) >= 0) {
                                try { dados[k] = JSON.parse(localStorage.getItem(k)); } catch(e) { dados[k] = localStorage.getItem(k); }
                            }
                        }
                        var blob = new Blob([JSON.stringify(dados, null, 2)], {type:'application/json'});
                        var url  = URL.createObjectURL(blob);
                        var a    = document.createElement('a');
                        a.href = url; a.download = 'servgo-backup-' + new Date().toISOString().slice(0,10) + '.json';
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        exibirToast('Dados exportados com sucesso!');
                    }
                    if (acao === 'reset-seed') {
                        localStorage.removeItem('sg_seed_v1');
                        exibirToast('Flag de seed removida. Recarregue a página para recriar os prestadores.');
                    }
                    if (acao === 'demo-ticket') {
                        var nomes = ['Ana Lima','Carlos Souza','Fernanda Barros','Roberto Costa'];
                        var nomeDemo = nomes[Math.floor(Math.random()*nomes.length)];
                        var tickets = obterTickets();
                        tickets.push({
                            id: _gerarId('ticket'),
                            assunto: 'Dúvida sobre agendamento',
                            mensagem: 'Olá! Gostaria de saber como faço para cancelar um agendamento com mais de 24h de antecedência.',
                            nome: nomeDemo,
                            email: nomeDemo.toLowerCase().replace(' ','.') + '@exemplo.com',
                            dataAbertura: new Date().toISOString(),
                            status: 'aberto',
                            resposta: '', dataResposta: '', adminResponsavel: ''
                        });
                        salvarTickets(tickets);
                        _atualizarBadges();
                        exibirToast('Ticket de demonstração criado!');
                        _carregarManutencao();
                    }
                    if (acao === 'limpar-notifs') {
                        var limite = new Date(); limite.setDate(limite.getDate()-30);
                        var usuarios = obterUsuariosCadastrados();
                        Object.keys(usuarios).forEach(function(email){
                            var chave = 'sgNotificacoes_' + email;
                            var notifs = DB.get(chave) || [];
                            var filtradas = notifs.filter(function(n){
                                if (!n.lida) return true;
                                return n.timestamp ? new Date(n.timestamp) > limite : true;
                            });
                            DB.set(chave, filtradas);
                        });
                        exibirToast('Notificações antigas limpas!');
                    }
                    if (acao === 'reset-total') {
                        if (!confirm('⚠️ ATENÇÃO: Isso apagará TODOS os dados do ServGo! (usuários, prestadores, agendamentos, etc).\n\nDigite CONFIRMAR para prosseguir.')) return;
                        var keysParaRemover = [];
                        for (var j=0; j<localStorage.length; j++) keysParaRemover.push(localStorage.key(j));
                        keysParaRemover.forEach(function(k){ localStorage.removeItem(k); });
                        alert('Todos os dados foram removidos. Redirecionando para o início...');
                        window.location.href = '/index.html';
                    }
                });
            });
        }

        // ── SEÇÃO: BUREAU FINANCEIRO ───────────────────────────
        function _carregarFinanceiro() {
            var sec = document.getElementById('sec-financeiro');
            if (!sec) return;
            var Fin = window.SG_Financeiro;
            if (!Fin) { sec.innerHTML = '<div class="adm-secao-titulo">Financeiro</div><p>Módulo financeiro indisponível.</p>'; return; }

            Fin.sincronizarTodos();

            var filtroStatus = sec.getAttribute('data-filtro') || 'todos';
            var termo = (sec.getAttribute('data-termo') || '').toLowerCase();

            function badge(stv) {
                var map = { pago:['#198754','Pago'], pendente:['#b8870c','Pendente'], atrasado:['#dc3545','Atrasado'], cancelado:['#6c757d','Cancelado'] };
                var m = map[stv] || map.pendente;
                return '<span style="background:' + m[0] + ';color:#fff;font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:20px;">' + m[1] + '</span>';
            }
            function _inp(id,label,val){ return '<div><label class="form-label fw-bold">'+label+'</label><input type="text" class="form-control" id="'+id+'" value="'+_esc(val||'')+'"></div>'; }
            function _v(id){ var e=document.getElementById(id); return e?e.value.trim():''; }

            function _boletoHtml(cob, bol) {
                return '<div style="border:2px dashed #146ADB;border-radius:10px;padding:18px;font-family:monospace;">' +
                    '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #146ADB;padding-bottom:8px;margin-bottom:10px;align-items:center;">' +
                        '<strong style="font-size:1.15rem;"><span style="color:#146ADB;">Serv</span><span style="color:#FFC300;">Go!</span></strong>' +
                        '<span style="font-size:.78rem;">Boleto de Cobrança</span></div>' +
                    '<div style="font-size:.82rem;color:#333;line-height:1.9;">' +
                        'Beneficiário: <strong>' + _esc(bol.beneficiario) + '</strong> — CNPJ ' + _esc(bol.cnpj) + '<br>' +
                        'Nosso número: <strong>' + _esc(bol.nossoNumero) + '</strong><br>' +
                        'Vencimento: <strong>' + Fin.fmtData(bol.vencimento) + '</strong> · Valor: <strong>' + Fin.fmtBRL(bol.valor) + '</strong>' +
                    '</div>' +
                    '<div style="background:#f1f5ff;border-radius:6px;padding:12px;margin-top:12px;text-align:center;font-size:1rem;font-weight:700;letter-spacing:1px;word-break:break-all;">' + _esc(bol.linhaDigitavel) + '</div>' +
                    '<div style="font-size:.74rem;color:#888;margin-top:10px;">' + _esc(bol.instrucoes) + '</div>' +
                '</div>';
            }

            function render() {
                var r    = Fin.resumo();
                var cfg  = Fin.obterConfig();
                var todas = Fin.listar().slice().sort(function(a,b){ return new Date(b.dataEmissao)-new Date(a.dataEmissao); });
                var cobr = todas.filter(function(c){
                    var sv = Fin.statusVisual(c);
                    var okS = (filtroStatus==='todos') ? true
                            : (filtroStatus==='pendente' ? (sv==='pendente'||sv==='atrasado') : sv===filtroStatus);
                    var okT = !termo || (c.email||'').toLowerCase().indexOf(termo)>=0 ||
                              (c.planoNome||'').toLowerCase().indexOf(termo)>=0 || (c.id||'').toLowerCase().indexOf(termo)>=0;
                    return okS && okT;
                });

                var kpis = [
                    ['Total Emitido', Fin.fmtBRL(r.emitido), '#146ADB', 'bi-receipt', r.qtd + ' cobrança(s)'],
                    ['Recebido',      Fin.fmtBRL(r.recebido), '#198754', 'bi-check2-circle', r.qtdPagas + ' paga(s)'],
                    ['Pendente',      Fin.fmtBRL(r.pendente), '#b8870c', 'bi-hourglass-split', r.qtdPendentes + ' em aberto'],
                    ['Atrasado',      Fin.fmtBRL(r.atrasado), '#dc3545', 'bi-exclamation-triangle', r.qtdAtrasadas + ' vencida(s)']
                ];
                var kpisHtml = kpis.map(function(k){
                    return '<div class="adm-card" style="padding:16px 18px;">' +
                        '<div style="display:flex;align-items:center;gap:10px;">' +
                        '<div style="background:'+k[2]+';color:#fff;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;"><i class="bi '+k[3]+'"></i></div>' +
                        '<div><div style="font-size:.76rem;color:#888;font-weight:600;">'+k[0]+'</div>' +
                        '<div style="font-size:1.25rem;font-weight:900;color:'+k[2]+';">'+k[1]+'</div>' +
                        '<div style="font-size:.7rem;color:#aaa;">'+k[4]+'</div></div></div></div>';
                }).join('');

                var linhas = cobr.map(function(c){
                    var sv = Fin.statusVisual(c);
                    var acoes = '';
                    if (c.status==='pendente') acoes += '<button class="adm-btn-acao ver" data-fin="baixa" data-id="'+c.id+'" style="background:#198754;color:#fff;border-color:#198754;"><i class="bi bi-cash-coin me-1"></i>Dar baixa</button>';
                    if (c.status==='pago')     acoes += '<button class="adm-btn-acao" data-fin="estornar" data-id="'+c.id+'" style="color:#b8870c;border-color:#ffe08a;"><i class="bi bi-arrow-counterclockwise me-1"></i>Estornar</button>';
                    acoes += '<button class="adm-btn-acao" data-fin="boleto" data-id="'+c.id+'"><i class="bi bi-upc-scan me-1"></i>Boleto</button>';
                    if (c.status!=='cancelado' && c.status!=='pago') acoes += '<button class="adm-btn-acao" data-fin="cancelar" data-id="'+c.id+'" style="color:#dc3545;border-color:#f5c2c7;"><i class="bi bi-x-circle"></i></button>';
                    return '<tr>' +
                        '<td style="padding:9px 10px;font-size:.82rem;">'+_esc(c.email)+'</td>' +
                        '<td style="padding:9px 10px;font-size:.82rem;">'+_esc(c.planoNome)+'</td>' +
                        '<td style="padding:9px 10px;font-size:.82rem;font-weight:700;">'+Fin.fmtBRL(c.valor)+'</td>' +
                        '<td style="padding:9px 10px;font-size:.8rem;color:#666;">'+Fin.fmtData(c.dataEmissao)+'</td>' +
                        '<td style="padding:9px 10px;font-size:.8rem;color:#666;">'+Fin.fmtData(c.dataVencimento)+'</td>' +
                        '<td style="padding:9px 10px;">'+badge(sv)+(c.dataBaixa?'<div style="font-size:.68rem;color:#aaa;margin-top:2px;">baixa: '+Fin.fmtData(c.dataBaixa)+(c.formaPagamento?' · '+_esc(c.formaPagamento):'')+'</div>':'')+'</td>' +
                        '<td style="padding:9px 10px;"><div style="display:flex;gap:5px;flex-wrap:wrap;">'+acoes+'</div></td>' +
                        '</tr>';
                }).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:#aaa;">Nenhuma cobrança encontrada.</td></tr>';

                var filtros = ['todos','pendente','atrasado','pago','cancelado'];
                var filtroBtns = filtros.map(function(f){
                    var ativo = f===filtroStatus;
                    var lbl = {todos:'Todas',pendente:'Pendentes',atrasado:'Atrasadas',pago:'Pagas',cancelado:'Canceladas'}[f];
                    return '<button class="adm-btn-acao'+(ativo?' ver':'')+'" data-filtro="'+f+'" style="'+(ativo?'background:#146ADB;color:#fff;border-color:#146ADB;':'')+'">'+lbl+'</button>';
                }).join('');

                sec.innerHTML =
                    '<div class="adm-secao-titulo"><i class="bi bi-bank2" style="color:#146ADB;"></i>Bureau Financeiro</div>' +
                    '<p class="adm-secao-subtitulo">Controle dos contratos dos prestadores: valores, formas de pagamento e baixas.</p>' +
                    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">'+kpisHtml+'</div>' +
                    '<div class="adm-card" style="margin-bottom:20px;">' +
                        '<div class="adm-card-hdr"><span><i class="bi bi-wallet2 me-2" style="color:#198754;"></i>Formas de Pagamento do Site (exibidas ao prestador)</span></div>' +
                        '<div class="adm-card-corpo" style="padding:16px;">' +
                            '<div class="adm-form-grid">' +
                                _inp('fin-pixTipo','Tipo da Chave PIX',cfg.pixTipo) +
                                _inp('fin-pixChave','Chave PIX',cfg.pixChave) +
                                _inp('fin-pixTitular','Titular do PIX',cfg.pixTitular) +
                                _inp('fin-banco','Banco',cfg.banco) +
                                _inp('fin-agencia','Agência',cfg.agencia) +
                                _inp('fin-conta','Conta Corrente',cfg.conta) +
                                _inp('fin-titular','Titular da Conta',cfg.titular) +
                                _inp('fin-cnpj','CNPJ',cfg.cnpj) +
                                _inp('fin-boletoBeneficiario','Beneficiário (Boleto)',cfg.boletoBeneficiario) +
                                '<div class="col-full"><label class="form-label fw-bold">Instruções do Boleto</label><textarea class="form-control" id="fin-boletoInstrucoes" rows="2">'+_esc(cfg.boletoInstrucoes)+'</textarea></div>' +
                            '</div>' +
                            '<button class="btn btn-success btn-sm mt-3" id="fin-salvar-config"><i class="bi bi-floppy me-1"></i>Salvar Formas de Pagamento</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="adm-card">' +
                        '<div class="adm-card-hdr" style="flex-wrap:wrap;gap:8px;"><span><i class="bi bi-receipt-cutoff me-2" style="color:#146ADB;"></i>Cobranças dos Contratos</span>' +
                            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'+filtroBtns +
                            '<input type="text" id="fin-busca" placeholder="Buscar prestador/plano..." value="'+_esc(termo)+'" style="border:1px solid #ddd;border-radius:6px;padding:5px 10px;font-size:.82rem;">' +
                            '</div></div>' +
                        '<div class="adm-card-corpo" style="padding:0;overflow-x:auto;">' +
                            '<table style="width:100%;border-collapse:collapse;min-width:760px;">' +
                            '<thead><tr style="background:#f8f9fa;">' +
                            ['Prestador','Plano','Valor','Emissão','Vencimento','Status','Ações'].map(function(h){ return '<th style="padding:10px;font-size:.74rem;color:#666;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid #eee;text-align:left;">'+h+'</th>'; }).join('') +
                            '</tr></thead><tbody>'+linhas+'</tbody></table>' +
                        '</div>' +
                    '</div>';

                _wire();
            }

            function _wire() {
                var save = document.getElementById('fin-salvar-config');
                if (save) save.addEventListener('click', function(){
                    Fin.salvarConfig({
                        pixTipo:_v('fin-pixTipo'), pixChave:_v('fin-pixChave'), pixTitular:_v('fin-pixTitular'),
                        banco:_v('fin-banco'), agencia:_v('fin-agencia'), conta:_v('fin-conta'), titular:_v('fin-titular'), cnpj:_v('fin-cnpj'),
                        boletoBeneficiario:_v('fin-boletoBeneficiario'), boletoInstrucoes:_v('fin-boletoInstrucoes')
                    });
                    exibirToast('Formas de pagamento atualizadas!');
                });
                sec.querySelectorAll('[data-filtro]').forEach(function(b){ b.addEventListener('click', function(){ filtroStatus=b.dataset.filtro; sec.setAttribute('data-filtro',filtroStatus); render(); }); });
                var busca = document.getElementById('fin-busca');
                if (busca) busca.addEventListener('input', function(){
                    termo=busca.value.toLowerCase(); sec.setAttribute('data-termo',termo); render();
                    var b2=document.getElementById('fin-busca'); if(b2){ b2.focus(); try{ b2.setSelectionRange(b2.value.length,b2.value.length); }catch(e){} }
                });
                sec.querySelectorAll('[data-fin]').forEach(function(btn){
                    btn.addEventListener('click', function(){
                        var id=btn.dataset.id, acao=btn.dataset.fin;
                        if (acao==='baixa') _modalBaixa(id);
                        else if (acao==='estornar'){ if(confirm('Estornar esta baixa? A cobrança volta para Pendente.')){ Fin.estornar(id); exibirToast('Baixa estornada.'); render(); } }
                        else if (acao==='cancelar'){ if(confirm('Cancelar esta cobrança?')){ Fin.cancelar(id); exibirToast('Cobrança cancelada.'); render(); } }
                        else if (acao==='boleto') _modalBoleto(id);
                    });
                });
            }

            function _modalBaixa(id){
                var cob = Fin.listar().filter(function(c){return c.id===id;})[0]; if(!cob) return;
                var mid='fin-modal-baixa'; var ex=document.getElementById(mid); if(ex)ex.remove();
                var html='<div class="modal fade" id="'+mid+'" tabindex="-1" aria-modal="true" role="dialog"><div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
                    '<div class="modal-header" style="background:#198754;color:#fff;"><h5 class="modal-title"><i class="bi bi-cash-coin me-2"></i>Dar Baixa de Pagamento</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">' +
                    '<p style="font-size:.88rem;">Prestador: <strong>'+_esc(cob.email)+'</strong><br>Plano: <strong>'+_esc(cob.planoNome)+'</strong> · Valor: <strong>'+Fin.fmtBRL(cob.valor)+'</strong></p>' +
                    '<label class="form-label fw-bold">Forma de pagamento recebida</label>' +
                    '<select class="form-select mb-3" id="fin-baixa-forma"><option value="PIX">PIX</option><option value="Boleto">Boleto</option><option value="Depósito bancário">Depósito bancário</option><option value="Transferência">Transferência</option></select>' +
                    '<label class="form-label fw-bold">Observação (opcional)</label>' +
                    '<input type="text" class="form-control" id="fin-baixa-obs" placeholder="Ex.: comprovante recebido em 10/06">' +
                    '</div>' +
                    '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>' +
                    '<button type="button" class="btn btn-success fw-bold" id="fin-baixa-confirmar"><i class="bi bi-check-circle me-1"></i>Confirmar Baixa</button></div>' +
                    '</div></div></div>';
                document.body.insertAdjacentHTML('beforeend',html);
                var el=document.getElementById(mid); var modal=new bootstrap.Modal(el); modal.show();
                document.getElementById('fin-baixa-confirmar').addEventListener('click', function(){
                    Fin.darBaixa(id, _v('fin-baixa-forma'), _v('fin-baixa-obs'), (usu.nome||usu.email));
                    modal.hide();
                    el.addEventListener('hidden.bs.modal', function(){ el.remove(); exibirToast('Baixa registrada com sucesso!'); render(); }, {once:true});
                });
                el.addEventListener('hidden.bs.modal', function(){ try{el.remove();}catch(e){} }, {once:true});
            }

            function _modalBoleto(id){
                var cob=Fin.listar().filter(function(c){return c.id===id;})[0]; if(!cob) return;
                var bol=Fin.gerarBoleto(cob);
                var mid='fin-modal-boleto'; var ex=document.getElementById(mid); if(ex)ex.remove();
                var html='<div class="modal fade" id="'+mid+'" tabindex="-1" aria-modal="true" role="dialog"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content">' +
                    '<div class="modal-header" style="background:#146ADB;color:#fff;"><h5 class="modal-title"><i class="bi bi-upc-scan me-2"></i>Boleto — '+_esc(cob.planoNome)+'</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
                    '<div class="modal-body">'+_boletoHtml(cob,bol)+'</div>' +
                    '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div>' +
                    '</div></div></div>';
                document.body.insertAdjacentHTML('beforeend',html);
                var el=document.getElementById(mid); var modal=new bootstrap.Modal(el); modal.show();
                el.addEventListener('hidden.bs.modal', function(){ try{el.remove();}catch(e){} }, {once:true});
            }

            render();
        }

        // ── Seed Notícias iniciais ─────────────────────────────
        function _adminSeedNoticias() {
            var FLAG = 'sg_seed_noticias_v1';
            if (localStorage.getItem(FLAG) === '1') return;
            var noticias = dbGet('sgNoticias') || [];
            if (noticias.length > 0) { localStorage.setItem(FLAG,'1'); return; }
            var seed = [
                {
                    id: 'noticia-seed-1',
                    titulo: 'Desvendando a Nova Era dos Serviços Digitais',
                    resumo: 'Navegue pela mais recente atualização do ServGo! e descubra como a integração de inteligência artificial está transformando a busca e a oferta de serviços.',
                    conteudo: 'A plataforma ServGo! passou por uma atualização completa que integra algoritmos de IA para recomendar prestadores com base no histórico de avaliações e preferências dos clientes. Com conexões mais rápidas, resultados mais precisos e uma experiência totalmente reinventada, o futuro da contratação de serviços chegou.',
                    categoria: 'Inovação & Tecnologia', autor: 'Equipe ServGo!',
                    dataCriacao: new Date('2025-11-07').toISOString(),
                    dataPublicacao: '07 de Novembro, 2025', destaque: true, status: 'publicado', imagemUrl: ''
                },
                {
                    id: 'noticia-seed-2',
                    titulo: 'Como escolher o melhor prestador para o seu projeto',
                    resumo: 'Dicas práticas para avaliar portfólios, ler avaliações e negociar orçamentos de forma inteligente.',
                    conteudo: 'Contratar um prestador de serviços exige atenção a detalhes que vão além do preço. Analise o portfólio, leia avaliações de clientes anteriores, compare orçamentos e verifique a disponibilidade antes de fechar negócio.',
                    categoria: 'Dicas para Clientes', autor: 'Redação ServGo!',
                    dataCriacao: new Date('2026-01-15').toISOString(),
                    dataPublicacao: '15 de Janeiro, 2026', destaque: false, status: 'publicado', imagemUrl: ''
                },
                {
                    id: 'noticia-seed-3',
                    titulo: 'Novas categorias de serviços agora disponíveis',
                    resumo: 'ServGo! expande seu catálogo com prestadores nas áreas de Consultoria, Design e Logística.',
                    conteudo: 'A partir desta semana, clientes podem encontrar profissionais especializados em Consultoria Empresarial, Design Gráfico e Web, e Logística & Entregas. Mais de 50 novos prestadores já estão disponíveis para agendamento imediato.',
                    categoria: 'Novidades da Plataforma', autor: 'Equipe ServGo!',
                    dataCriacao: new Date('2026-03-01').toISOString(),
                    dataPublicacao: '01 de Março, 2026', destaque: false, status: 'publicado', imagemUrl: ''
                }
            ];
            dbSet('sgNoticias', seed);
            localStorage.setItem(FLAG, '1');
        }

        // ── Carrega seção inicial ──────────────────────────────
        _navegarPara('visao-geral');
    }
});

/* ============================================================
   SPRINT 1 — JS MOVIDO DAS PÁGINAS HTML
   Blocos que estavam em tags <script> embutidas nos arquivos HTML,
   extraídos e centralizados aqui. Cada bloco preserva sua lógica
   original (incluindo seus próprios mecanismos de inicialização),
   apenas movidos para fora do HTML, sem qualquer alteração de
   comportamento.
   ============================================================ */

// ── Origem: avaliacao.html ──

        (function () {
            'use strict';

            /* ── Helpers ───────────────────────────────────────────────────── */
            function dbGet(chave) {
                try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; }
            }

            function escaparHtml(s) {
                return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            }

            function renderEstrelas(media, total) {
                var estrelas = '';
                for (var i = 1; i <= 5; i++) {
                    if (i <= Math.floor(media)) {
                        estrelas += '<i class="bi bi-star-fill"></i>';
                    } else if (i - 0.5 <= media) {
                        estrelas += '<i class="bi bi-star-half"></i>';
                    } else {
                        estrelas += '<i class="bi bi-star vazia"></i>';
                    }
                }
                return '<div class="nota-container">' +
                    '<span class="stars-mini">' + estrelas + '</span>' +
                    '<span class="nota-valor">' + media.toFixed(1) + '</span>' +
                    '</div>';
            }

            function medalha(pos) {
                if (pos === 1) return '<span class="pos-medalha">🥇</span>';
                if (pos === 2) return '<span class="pos-medalha">🥈</span>';
                if (pos === 3) return '<span class="pos-medalha">🥉</span>';
                return '<span style="font-weight:700;color:#888;font-size:.9rem;">' + pos + 'º</span>';
            }

            /* ── Dados: Ranking de Prestadores ────────────────────────────── */
            function getRankingPrestadores() {
                var store     = dbGet('avaliacoesRecebidasPrestador') || {};
                var hotsite   = dbGet('hotsitePrestadorDados') || {};
                var usuarios  = dbGet('usuariosCadastrados') || {};
                var ranking   = [];

                Object.keys(store).forEach(function (email) {
                    var avs = store[email] || [];
                    var validas = avs.filter(function (a) {
                        return typeof a.nota === 'number' && a.nota > 0;
                    });
                    if (validas.length === 0) return;

                    var soma  = validas.reduce(function (s, a) { return s + a.nota; }, 0);
                    var media = soma / validas.length;
                    var dados = hotsite[email] || usuarios[email] || {};
                    var nome  = dados.nome || email;
                    var cat   = dados.categoria || '';

                    ranking.push({
                        email:      email,
                        nome:       nome,
                        categoria:  cat,
                        media:      media,
                        total:      validas.length,
                        avaliacoes: validas
                    });
                });

                ranking.sort(function (a, b) {
                    if (b.media !== a.media) return b.media - a.media;
                    return b.total - a.total;
                });

                return ranking;
            }

            /* ── Dados: Ranking de Clientes ────────────────────────────────── */
            function getRankingClientes() {
                var avs  = dbGet('avaliacoesRecebidasDoCliente') || [];
                var mapa = {};

                avs.forEach(function (av) {
                    if (typeof av.nota !== 'number' || av.nota <= 0) return;
                    // Tenta identificar o cliente pelo campo 'cliente'; fallback para 'emailCliente'
                    var chaveId  = av.emailCliente || av.cliente || 'Desconhecido';
                    var nomeExib = av.cliente || av.emailCliente || 'Cliente';
                    if (!mapa[chaveId]) {
                        mapa[chaveId] = { chave: chaveId, nome: nomeExib, soma: 0, total: 0, avaliacoes: [] };
                    }
                    // Garante que o nome exibido seja o mais recente/completo
                    if (av.cliente && av.cliente !== 'Desconhecido') {
                        mapa[chaveId].nome = av.cliente;
                    }
                    mapa[chaveId].soma  += av.nota;
                    mapa[chaveId].total += 1;
                    mapa[chaveId].avaliacoes.push(av);
                });

                var ranking = Object.keys(mapa).map(function (k) {
                    var c = mapa[k];
                    return {
                        chave:      c.chave,
                        nome:       c.nome,
                        media:      c.soma / c.total,
                        total:      c.total,
                        avaliacoes: c.avaliacoes
                    };
                });

                ranking.sort(function (a, b) {
                    if (b.media !== a.media) return b.media - a.media;
                    return b.total - a.total;
                });

                return ranking;
            }

            /* ── Renderiza tabela de ranking (top 10) ──────────────────────── */
            function renderTabela(ranking, tipo) {
                if (ranking.length === 0) {
                    return '<div class="ranking-vazio">' +
                        '<i class="bi bi-bar-chart"></i>' +
                        'Nenhuma avaliação registrada ainda.' +
                        '</div>';
                }

                var top10 = ranking.slice(0, 10);
                var html  =
                    '<div class="ranking-contador">' +
                        top10.length + ' de ' + ranking.length + ' avaliado' + (ranking.length !== 1 ? 's' : '') +
                    '</div>' +
                    '<table class="ranking-tabela"><thead><tr>' +
                    '<th class="col-pos">#</th>' +
                    '<th>Nome</th>' +
                    '<th class="col-nota">Nota</th>' +
                    '<th class="col-avs">Avaliações</th>' +
                    '</tr></thead><tbody>';

                top10.forEach(function (item, idx) {
                    var pos  = idx + 1;
                    var nome = tipo === 'prestador'
                        ? '<div class="prest-nome-cell">' +
                              '<span>' + escaparHtml(item.nome) + '</span>' +
                              (item.categoria
                                  ? '<span class="prest-categoria-badge">' + escaparHtml(item.categoria) + '</span>'
                                  : '') +
                          '</div>'
                        : escaparHtml(item.nome);

                    html +=
                        '<tr>' +
                        '<td class="col-pos">' + medalha(pos) + '</td>' +
                        '<td>' + nome + '</td>' +
                        '<td class="col-nota">' + renderEstrelas(item.media, item.total) + '</td>' +
                        '<td class="col-avs">' + item.total + '</td>' +
                        '</tr>';
                });

                html += '</tbody></table>';
                return html;
            }

            /* ── Renderiza seção expandida "Ver Todos" (Clientes) ──────────── */
            function renderTodosClientes(ranking) {
                if (ranking.length === 0) {
                    return '<div class="ranking-vazio"><i class="bi bi-person-x"></i>Nenhum cliente avaliado ainda.</div>';
                }

                var html = '';
                ranking.forEach(function (cli) {
                    html +=
                        '<div class="todos-grupo-header">' +
                        '<i class="bi bi-person-fill"></i>' +
                        escaparHtml(cli.nome) +
                        ' &nbsp;·&nbsp; ' +
                        '<span style="font-weight:400;">' +
                            cli.total + ' avaliação' + (cli.total !== 1 ? 'ões' : '') +
                            ' &nbsp;·&nbsp; média ' + cli.media.toFixed(1) +
                        '</span>' +
                        '</div>';

                    cli.avaliacoes.slice().reverse().forEach(function (av) {
                        html +=
                            '<div class="av-card-mini">' +
                            '<div class="av-card-mini-topo">' +
                                '<span class="av-card-mini-nome">Por: ' + escaparHtml(av.prestador || '—') + '</span>' +
                                '<span class="av-card-mini-meta">' +
                                    '<span class="stars-mini">' + miniEstrelas(av.nota) + '</span>' +
                                    ' &nbsp;' + (av.data || '') +
                                '</span>' +
                            '</div>' +
                            '<div class="av-card-mini-servico"><i class="bi bi-tools"></i> ' + escaparHtml(av.servico || '—') + '</div>' +
                            (av.comentario
                                ? '<div class="av-card-mini-comentario clientes-border">"' + escaparHtml(av.comentario) + '"</div>'
                                : '') +
                            '</div>';
                    });
                });

                return html;
            }

            /* ── Renderiza seção expandida "Ver Todos" (Prestadores) ────────── */
            function renderTodosPrestadores(ranking) {
                if (ranking.length === 0) {
                    return '<div class="ranking-vazio"><i class="bi bi-briefcase"></i>Nenhum prestador avaliado ainda.</div>';
                }

                var html = '';
                ranking.forEach(function (prest) {
                    html +=
                        '<div class="todos-grupo-header amarelo-hdr">' +
                        '<i class="bi bi-briefcase-fill"></i>' +
                        escaparHtml(prest.nome) +
                        (prest.categoria ? ' &nbsp;<span style="font-size:.7rem;font-weight:400;">(' + escaparHtml(prest.categoria) + ')</span>' : '') +
                        ' &nbsp;·&nbsp; <span style="font-weight:400;">' +
                            prest.total + ' avaliação' + (prest.total !== 1 ? 'ões' : '') +
                            ' &nbsp;·&nbsp; média ' + prest.media.toFixed(1) +
                        '</span>' +
                        '</div>';

                    prest.avaliacoes.slice().reverse().forEach(function (av) {
                        html +=
                            '<div class="av-card-mini">' +
                            '<div class="av-card-mini-topo">' +
                                '<span class="av-card-mini-nome">Por: ' + escaparHtml(av.cliente || '—') + '</span>' +
                                '<span class="av-card-mini-meta">' +
                                    '<span class="stars-mini">' + miniEstrelas(av.nota) + '</span>' +
                                    ' &nbsp;' + (av.data || '') +
                                '</span>' +
                            '</div>' +
                            '<div class="av-card-mini-servico"><i class="bi bi-tools"></i> ' + escaparHtml(av.servico || '—') + '</div>' +
                            (av.comentario
                                ? '<div class="av-card-mini-comentario prestadores-border">"' + escaparHtml(av.comentario) + '"</div>'
                                : '') +
                            '</div>';
                    });
                });

                return html;
            }

            /* ── Helper: estrelas inline sem container ──────────────────────── */
            function miniEstrelas(nota) {
                var s = '';
                for (var i = 1; i <= 5; i++) {
                    s += i <= nota
                        ? '<i class="bi bi-star-fill"></i>'
                        : '<i class="bi bi-star vazia"></i>';
                }
                return s;
            }

            /* ── Toggle "Ver Todos" ─────────────────────────────────────────── */
            function bindToggle(btnId, secaoId, labelAberto, labelFechado, clsBotao) {
                var btn   = document.getElementById(btnId);
                var secao = document.getElementById(secaoId);
                if (!btn || !secao) return;

                btn.addEventListener('click', function () {
                    var aberto = secao.classList.toggle('aberta');
                    btn.classList.toggle(clsBotao, aberto);
                    var iconClass = aberto ? 'bi-chevron-up' : (clsBotao === 'ativo' ? 'bi-people-fill' : 'bi-person-workspace');
                    btn.innerHTML =
                        '<i class="bi ' + (aberto ? 'bi-chevron-up' : (btnId === 'btn-todos-clientes' ? 'bi-people-fill' : 'bi-person-workspace')) + '"></i>' +
                        (aberto ? labelAberto : labelFechado);
                });
            }

            /* ── Inicialização ──────────────────────────────────────────────── */
            function inicializarRankings() {
                var rankPrest = getRankingPrestadores();
                var rankCli   = getRankingClientes();

                // Preenche tabelas top 10
                var corpoCli  = document.getElementById('ranking-clientes-corpo');
                var corpoPrest = document.getElementById('ranking-prestadores-corpo');
                if (corpoCli)   corpoCli.innerHTML   = renderTabela(rankCli,   'cliente');
                if (corpoPrest) corpoPrest.innerHTML = renderTabela(rankPrest, 'prestador');

                // Preenche seções expandidas
                var secCli   = document.getElementById('todos-clientes-secao');
                var secPrest = document.getElementById('todos-prestadores-secao');
                if (secCli)   secCli.innerHTML   = renderTodosClientes(rankCli);
                if (secPrest) secPrest.innerHTML = renderTodosPrestadores(rankPrest);

                // Eventos dos botões
                bindToggle(
                    'btn-todos-clientes',
                    'todos-clientes-secao',
                    ' Recolher Clientes Avaliados',
                    ' Ver Todos os Clientes Avaliados',
                    'ativo'
                );
                bindToggle(
                    'btn-todos-prestadores',
                    'todos-prestadores-secao',
                    ' Recolher Prestadores Avaliados',
                    ' Ver Todos os Prestadores Avaliados',
                    'ativo'
                );
            }

            // Aguarda o script.js (que faz o seed dos prestadores) terminar
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () {
                    setTimeout(inicializarRankings, 600);
                });
            } else {
                setTimeout(inicializarRankings, 600);
            }

        }());

// ── Origem: clienteAgendarServicos.html ──

(function(){
'use strict';

// ── SPRINT 3 — CORREÇÃO DE BUG CRÍTICO ──────────────────────────────────
// Este bloco pertence exclusivamente à página clienteAgendarServicos.html.
// Ao ser centralizado no script.js compartilhado (Sprint 1), passou a ser
// executado em TODAS as páginas do site, pois nada impedia sua execução
// fora do contexto original. Isso fazia com que, por exemplo, um visitante
// sem sessão em qualquer página (inclusive index.html) fosse redirecionado
// para agendarServicos.html pelo trecho "verificarSessao" abaixo — e, ao
// chegar em agendarServicos.html, o MESMO trecho era executado novamente,
// recalculando a mesma URL de destino e chamando window.location.replace()
// para a própria página, gerando um loop infinito de recarregamento (o
// "piscar" e bloqueio de cliques relatado). A correção restaura o escopo
// original: todo o restante deste arquivo só executa quando a página
// atual realmente for clienteAgendarServicos.html.
if (window.location.pathname.indexOf('clienteAgendarServicos') === -1) { return; }

/* ── Sprint 2 — Verificação de sessão ──────────────────────────────────────
   Regra: somente clientes (e admin) podem acessar esta página autenticada.
   - Cliente / Admin logado  → permanece e carrega o catálogo.
   - Prestador logado        → redireciona para a área do prestador.
   - Visitante sem sessão    → redireciona para agendarServicos.html (público)
     preservando o parâmetro ?tipo= caso exista na URL.
──────────────────────────────────────────────────────────────────────────── */
(function verificarSessao() {
    try {
        var usu    = JSON.parse(sessionStorage.getItem('usuarioLogado'));
        var params = new URLSearchParams(window.location.search);
        var tipo   = params.get('tipo') || '';

        if (usu && (usu.tipo === 'cliente' || usu.tipo === 'admin')) {
            return; // acesso autorizado — continua carregando a página
        }

        if (usu && usu.tipo === 'prestador') {
            // Prestador logado não deve acessar área de cliente
            window.location.replace('/paginasPrestador/indexPrestador.html');
            return;
        }

        // Visitante sem sessão → catálogo público, preservando filtro de categoria
        var url = '/paginasSite/agendarServicos.html';
        if (tipo) url += '?tipo=' + encodeURIComponent(tipo);
        window.location.replace(url);

    } catch (e) { /* localStorage indisponível — continua normalmente */ }
}());

var GRAD={
  'Saúde':['#16a34a','#15803d'],'Beleza':['#db2777','#9d174d'],
  'Manutenção Predial':['#b45309','#92400e'],'TI':['#2563eb','#1e40af'],
  'Lazer':['#7c3aed','#5b21b6'],'Alimentação':['#ea580c','#c2410c'],
  'Design':['#0891b2','#0e7490'],'Segurança':['#dc2626','#991b1b'],
  'Logística':['#ca8a04','#a16207'],'Consultoria':['#475569','#334155'],
  'Construção':['#92400e','#78350f']
};
var ICO={
  'Saúde':'bi-heart-pulse-fill','Beleza':'bi-scissors',
  'Manutenção Predial':'bi-tools','TI':'bi-cpu-fill',
  'Lazer':'bi-controller','Alimentação':'bi-basket-fill',
  'Design':'bi-palette-fill','Segurança':'bi-shield-fill',
  'Logística':'bi-truck','Consultoria':'bi-briefcase-fill',
  'Construção':'bi-building'
};

var catAtiva='', prestAtual=null;

function dbGet(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}}
function store(){return dbGet('hotsitePrestadorDados')||{};}
function prestadores(){
  var s=store();
  return Object.keys(s).map(function(e){return Object.assign({},s[e],{email:e});})
    .filter(function(p){return p.nome&&p.categoria;});
}
function agrupar(lista){
  var g={};
  lista.forEach(function(p){var c=p.categoria||'Outros';(g[c]=g[c]||[]).push(p);});
  return g;
}
function ini(nome){
  var p=(nome||'').trim().split(/\s+/);
  return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():(p[0]||'P').slice(0,2).toUpperCase();
}
function grad(cat){var g=GRAD[cat]||['#146ADB','#0d4fa3'];return 'linear-gradient(135deg,'+g[0]+','+g[1]+')';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function mediaAval(email){
  var store=dbGet('avaliacoesRecebidasPrestador')||{};
  var lista=(store[email]||[]).filter(function(a){return typeof a.nota==='number';});
  if(!lista.length)return{media:0,total:0};
  return{media:lista.reduce(function(s,a){return s+a.nota;},0)/lista.length,total:lista.length};
}

function fotoEl(prest){
  var wrap=document.createElement('div');
  wrap.className='prest-card-foto';
  var foto=prest.fotoPerfil||prest.foto||'';
  if(foto){
    var img=document.createElement('img');
    img.src=foto; img.alt=prest.nome;
    var plh=mkPlh(prest);
    img.onerror=function(){img.style.display='none';plh.style.display='flex';};
    wrap.appendChild(img);
    plh.style.display='none';
    wrap.appendChild(plh);
  } else {
    wrap.appendChild(mkPlh(prest));
  }
  var badge=document.createElement('div');
  badge.className='prest-card-cat-badge';
  badge.innerHTML='<i class="bi '+(ICO[prest.categoria]||'bi-tag')+'"></i>'+esc(prest.categoria);
  wrap.appendChild(badge);
  return wrap;
}

function mkPlh(prest){
  var d=document.createElement('div');
  d.className='prest-card-foto-placeholder';
  d.style.background=grad(prest.categoria);
  d.innerHTML='<span class="av-ini">'+ini(prest.nome)+'</span><span class="av-ico"><i class="bi '+(ICO[prest.categoria]||'bi-person')+'"></i></span>';
  return d;
}

function criarCard(prest){
  var card=document.createElement('div');
  card.className='prest-card';
  card.dataset.email=prest.email;

  // badge selecionado
  var bs=document.createElement('div');
  bs.className='badge-selecionado';
  bs.innerHTML='<i class="bi bi-check-circle-fill me-1"></i>Selecionado';
  card.appendChild(bs);

  // foto
  card.appendChild(fotoEl(prest));

  // corpo
  var corpo=document.createElement('div');
  corpo.className='prest-card-corpo';

  var nome=document.createElement('div');
  nome.className='prest-card-nome';
  nome.textContent=prest.nome;
  corpo.appendChild(nome);

  // avaliação
  var av=mediaAval(prest.email);
  if(av.total>0){
    var rEl=document.createElement('div');
    rEl.className='prest-card-rating';
    var st='';
    for(var i=1;i<=5;i++) st+='<i class="bi '+(i<=Math.round(av.media)?'bi-star-fill':'bi-star')+'"></i>';
    rEl.innerHTML=st+'<span class="txt-nota">'+av.media.toFixed(1)+' ('+av.total+')</span>';
    corpo.appendChild(rEl);
  }

  // descrição
  var desc=(prest.descricao||prest.especializacao||'').trim();
  if(desc){
    var dEl=document.createElement('div');
    dEl.className='prest-card-desc';
    dEl.textContent=desc;
    corpo.appendChild(dEl);
  }

  // contato
  var ct=document.createElement('div');
  ct.className='prest-card-contato';
  if(prest.tel) ct.innerHTML+='<span><i class="bi bi-telephone-fill"></i>'+esc(prest.tel)+'</span>';
  ct.innerHTML+='<span><i class="bi bi-envelope-fill"></i>'+esc(prest.email)+'</span>';
  corpo.appendChild(ct);

  // ações
  // Sprint 1 — botão "Saiba Mais" direciona para o HotSite do prestador;
  // ícone bi-box-arrow-up-right (btn-card-hot) removido conforme solicitado.
  var ac=document.createElement('div');
  ac.className='prest-card-acoes';
  var btnS=document.createElement('button');
  btnS.type='button'; btnS.className='btn-card-sel';
  btnS.innerHTML='<i class="bi bi-info-circle me-1"></i>Saiba Mais';
  ac.appendChild(btnS);
  corpo.appendChild(ac);
  card.appendChild(corpo);

  // "Saiba Mais" → navega para o HotSite do prestador
  function _irHotsite(e){
    if(e) e.stopPropagation();
    window.location.href='/paginasPrestador/prestadorHotsite.html?email='+encodeURIComponent(prest.email);
  }
  btnS.addEventListener('click',_irHotsite);
  // Sprint 1 — clicar no card SELECIONA o prestador e exibe o painel de agendamento
  card.addEventListener('click',function(e){
    if(e.target.closest('.btn-card-sel')) return; // delega ao botão "Saiba Mais"
    selecionar(prest,card);
  });

  return card;
}

function renderFiltros(cats){
  // Sprint 1 — lista fixa de categorias padrão: sempre visíveis,
  // mesmo quando não há prestadores cadastrados para aquela categoria.
  var CATS_FIXAS=['Alimentação','Beleza','Construção','Consultoria','Design',
                  'Lazer','Logística','Manutenção Predial','Saúde','Segurança','TI'];
  // Mescla com categorias vindas dos prestadores (ex.: dados extras / testes)
  var todasCats=CATS_FIXAS.slice();
  cats.forEach(function(c){ if(todasCats.indexOf(c)<0) todasCats.push(c); });
  todasCats.sort();

  var cont=document.getElementById('filtros-container');
  var btnTodos=cont.querySelector('.filtro-pill-todos');
  cont.innerHTML=''; cont.appendChild(btnTodos);
  todasCats.forEach(function(cat){
    var btn=document.createElement('button');
    btn.className='filtro-pill'; btn.dataset.cat=cat;
    btn.innerHTML='<i class="bi '+(ICO[cat]||'bi-tag-fill')+'"></i> '+cat;
    cont.appendChild(btn);
  });
  cont.querySelectorAll('.filtro-pill').forEach(function(btn){
    btn.addEventListener('click',function(){
      catAtiva=btn.dataset.cat;
      cont.querySelectorAll('.filtro-pill').forEach(function(b){b.classList.remove('ativo');});
      btn.classList.add('ativo');
      filtrar(catAtiva);
      if(prestAtual&&catAtiva&&prestAtual.categoria!==catAtiva) fecharPainel();
    });
  });
}

function filtrar(cat){
  var secoes=document.querySelectorAll('.catalogo-secao'), vis=0;
  secoes.forEach(function(s){
    if(!cat||s.dataset.cat===cat){s.classList.remove('oculta');vis++;}
    else s.classList.add('oculta');
  });
  document.getElementById('catalogo-vazio').style.display=vis?'none':'block';
}

function renderCatalogo(lista){
  document.getElementById('catalogo-loading').style.display='none';
  var el=document.getElementById('catalogo-secoes');
  if(!lista.length){document.getElementById('catalogo-vazio').style.display='block';return;}
  var grupos=agrupar(lista), cats=Object.keys(grupos).sort();
  renderFiltros(cats); el.innerHTML='';
  cats.forEach(function(cat){
    var lista2=grupos[cat], ico=ICO[cat]||'bi-tag-fill';
    var secao=document.createElement('div');
    secao.className='catalogo-secao'; secao.dataset.cat=cat;
    var titulo=document.createElement('div');
    titulo.className='catalogo-secao-titulo';
    titulo.innerHTML='<span class="cat-icon"><i class="bi '+ico+'"></i></span><span>'+cat+'</span><span class="badge-count">'+lista2.length+' prestador'+(lista2.length!==1?'es':'')+'</span>';
    var grid=document.createElement('div'); grid.className='catalogo-grid';
    lista2.forEach(function(p){grid.appendChild(criarCard(p));});
    secao.appendChild(titulo); secao.appendChild(grid);
    el.appendChild(secao);
  });
}

function selecionar(prest,cardEl){
  document.querySelectorAll('.prest-card.selecionado').forEach(function(c){c.classList.remove('selecionado');});
  cardEl.classList.add('selecionado');
  prestAtual=prest;
  // atualiza mini painel
  document.getElementById('painel-mini-nome').textContent=prest.nome;
  document.getElementById('painel-mini-cat').textContent=prest.categoria;
  var mf=document.getElementById('painel-mini-foto');
  mf.innerHTML=''; mf.style.background=grad(prest.categoria); mf.style.borderRadius='8px';
  mf.textContent=ini(prest.nome);
  var lh=document.getElementById('link-hotsite');
  if(lh) lh.href='/paginasPrestador/prestadorHotsite.html?email='+encodeURIComponent(prest.email);
  // sincroniza selects
  var st=document.getElementById('select-tipo-oculto');
  var sp=document.getElementById('select-prestador-oculto');
  if(st){
    if(!st.querySelector('[value="'+prest.categoria+'"]')){var o=document.createElement('option');o.value=prest.categoria;o.textContent=prest.categoria;st.appendChild(o);}
    st.value=prest.categoria; st.dispatchEvent(new Event('change'));
  }
  setTimeout(function(){
    if(sp){
      if(!sp.querySelector('[value="'+prest.email+'"]')){var o=document.createElement('option');o.value=prest.email;o.textContent=prest.nome;sp.appendChild(o);}
      sp.value=prest.email; sp.dispatchEvent(new Event('change'));
    }
    abrirPainel();
  },80);
}

function abrirPainel(){
  var p=document.getElementById('painel-agendamento');
  p.style.display='block';
  setTimeout(function(){p.scrollIntoView({behavior:'smooth',block:'nearest'});},50);
}
function fecharPainel(){
  document.getElementById('painel-agendamento').style.display='none';
  prestAtual=null;
}

var btnTrocar=document.getElementById('btn-trocar-prestador');
if(btnTrocar) btnTrocar.addEventListener('click',function(){
  fecharPainel();
  document.querySelectorAll('.prest-card.selecionado').forEach(function(c){c.classList.remove('selecionado');});
  window.scrollTo({top:0,behavior:'smooth'});
});

function aplicarURL(){
  var params=new URLSearchParams(window.location.search);
  var tipo=params.get('tipo')||'';
  // Sprint 1 — suporta ?email= (vindo do hotsite) e ?prestador= (compatibilidade script.js)
  var emailParam=params.get('email')||params.get('prestador')||'';

  if(tipo){
    catAtiva=tipo;
    var btn=document.querySelector('.filtro-pill[data-cat="'+tipo+'"]');
    if(btn){
      document.querySelectorAll('.filtro-pill').forEach(function(b){b.classList.remove('ativo');});
      btn.classList.add('ativo'); filtrar(tipo);
    }
  }

  // Sprint 1 — auto-seleciona o prestador vindo do HotSite e exibe o painel de agendamento
  if(emailParam){
    var cards=document.querySelectorAll('.prest-card');
    var targetCard=null;
    cards.forEach(function(c){if(c.dataset.email===emailParam) targetCard=c;});
    if(targetCard){
      var prest=prestadores().find(function(p){return p.email===emailParam;});
      if(prest){
        selecionar(prest,targetCard);
        // Rola suavemente até o painel após ele ser exibido
        setTimeout(function(){
          var panel=document.getElementById('painel-agendamento');
          if(panel) panel.scrollIntoView({behavior:'smooth',block:'start'});
        },300);
      }
    }
  }
}

function init(){
  var lista=prestadores();
  if(!lista.length){
    setTimeout(function(){renderCatalogo(prestadores());aplicarURL();},400);
  } else {
    renderCatalogo(lista); aplicarURL();
  }
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
}());

// ── Origem: dashboardAdmin.html ──

        (function () {
            var dest = '/paginasAdministrador/adminGerenciamento.html';
            if (window.location.pathname.indexOf('dashboardAdmin') !== -1) {
                window.location.replace(dest);
            }
        })();

// ── Origem: login.html ──

    (function () {
        'use strict';

        var USUARIOS_KEY = 'usuariosCadastrados';
        var PLANO_NOMES  = {
            basico:       'Plano Básico — R$ 49,90/mês',
            profissional: 'Plano Profissional — R$ 89,90/mês',
            premium:      'Plano Premium — R$ 139,90/mês',
            trial:        'Trial Gratuito'
        };

        function _getUsuarios() {
            try { return JSON.parse(localStorage.getItem(USUARIOS_KEY) || '{}'); }
            catch(e) { return {}; }
        }
        function _esc(s) {
            return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        // ── Exibe mensagem se chegou da página de cancelamento ───
        document.addEventListener('DOMContentLoaded', function () {
            var params = new URLSearchParams(window.location.search);

            if (params.get('cancelamento') === 'efetuado') {
                var alertaEl = document.getElementById('alerta-login-erro');
                if (alertaEl) {
                    alertaEl.innerHTML =
                        '<div class="alert alert-warning alert-dismissible fade show" role="alert">' +
                        '<i class="bi bi-x-circle-fill me-2"></i>' +
                        '<strong>Plano cancelado.</strong> Seu acesso foi encerrado. ' +
                        'Faça login para ver as opções de reativação.' +
                        '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
                        '</div>';
                }
            }
        });

        // ── Intercepta submit do form de login ───────────────────
        document.addEventListener('DOMContentLoaded', function () {
            var form = document.getElementById('form-login');
            if (!form) return;

            form.addEventListener('submit', function (e) {
                var emailInput = document.getElementById('email-login');
                var senhaInput = document.getElementById('senha-login');
                if (!emailInput || !senhaInput) return;

                var email = emailInput.value.trim().toLowerCase();
                var senha = senhaInput.value;

                var cad = _getUsuarios();
                var d   = cad[email];
                if (!d) return; // deixa o script.js tratar (usuário não encontrado)

                // Verifica senha antes de verificar bloqueio
                if (d.senha !== senha) return; // deixa o script.js tratar

                // SPRINT 2 — aplica transições pendentes (ex.: cancelamento agendado
                // cuja vigência já terminou) ANTES de decidir o bloqueio. Quem apenas
                // agendou troca/cancelamento e ainda está em vigência loga normalmente.
                try { if (window.SG_Plano && window.SG_Plano.resolver) { var _dr = window.SG_Plano.resolver(email); if (_dr) d = _dr; } } catch (er) {}

                // Verifica se é prestador com conta bloqueada por cancelamento
                if (d.tipo === 'prestador' && d.statusConta === 'bloqueado_cancelamento') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    exibirTelaBloqueio(email, d);
                }
            }, true); // capture=true para rodar antes do script.js
        });

        // ── Monta e exibe a tela de bloqueio ─────────────────────
        function exibirTelaBloqueio(email, d) {
            var ass       = d.assinatura || {};
            var planoId   = ass.planoAnoCancelado || ass.planoAnterior || ass.plano || 'basico';
            var dataCanc  = ass.dataCancelamento ? new Date(ass.dataCancelamento) : new Date();
            var dataLib   = new Date(dataCanc.getTime() + 90 * 24 * 60 * 60 * 1000);
            var hoje      = new Date();

            var diasPassados = Math.min(90, Math.max(0,
                Math.floor((hoje - dataCanc) / (24 * 60 * 60 * 1000))));
            var diasFaltam   = Math.max(0,
                Math.ceil((dataLib - hoje) / (24 * 60 * 60 * 1000)));
            var progresso    = Math.min(100, (diasPassados / 90) * 100);
            var carenciaCumprida = diasFaltam === 0;

            // Cria overlay full-page
            var overlay = document.createElement('div');
            overlay.id  = 'sg-bloqueio-overlay';
            overlay.className = 'sg-bloqueio-page';
            overlay.style.cssText =
                'position:fixed;inset:0;z-index:9999;' +
                'background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);' +
                'display:flex;align-items:center;justify-content:center;padding:32px 16px;' +
                'overflow-y:auto;';

            var cancelacaoStr = dataCanc.toLocaleDateString('pt-BR');
            var liberacaoStr  = dataLib.toLocaleDateString('pt-BR');
            var planoNome     = (PLANO_NOMES[planoId] || planoId)
                                    .replace(/\s*—.*$/, ''); // só o nome

            overlay.innerHTML =
                '<div class="sg-bloqueio-card">' +

                // Logo
                '<div style="margin-bottom:20px;">' +
                '<span style="font-size:1.6rem;font-weight:900;">' +
                '<span style="color:#fff;">Serv</span><span style="color:#ffc300;">Go!</span>' +
                '</span></div>' +

                // Ícone
                '<div class="sg-bloqueio-icone"><i class="bi bi-person-fill-lock"></i></div>' +

                // Título
                '<div class="sg-bloqueio-titulo">Acesso Bloqueado</div>' +
                '<div class="sg-bloqueio-subtitulo">' +
                'Seu plano foi cancelado em <strong style="color:#fff;">' + cancelacaoStr + '</strong>.<br>' +
                'O acesso à plataforma está suspenso até a reativação.' +
                '</div>' +

                // Tag do plano cancelado
                '<div class="sg-bloqueio-plano-tag">' +
                '<i class="bi bi-tag-fill"></i>' + _esc(planoNome) + ' — Cancelado' +
                '</div>' +

                // Contador de carência (só se não cumpriu)
                (carenciaCumprida
                    ? '<div style="background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);' +
                      'border-radius:12px;padding:16px 20px;margin-bottom:24px;color:#6ee7b7;font-size:.88rem;">' +
                      '<i class="bi bi-check-circle-fill me-2"></i>' +
                      '<strong>Carência cumprida!</strong> Você já pode reativar o plano gratuito.' +
                      '</div>'
                    : '<div class="sg-bloqueio-contador-wrap">' +
                      '<div class="sg-bloqueio-contador-label">Carência para Plano Gratuito</div>' +
                      '<div class="sg-bloqueio-contador-dias" id="sg-contador-dias">' + diasFaltam + '</div>' +
                      '<div class="sg-bloqueio-contador-sub">' +
                      'dias restantes para liberar o acesso gratuito<br>' +
                      '<span style="font-size:.75rem;opacity:.6;">' +
                      'Liberação em: ' + liberacaoStr + '</span>' +
                      '</div>' +
                      '<div class="sg-bloqueio-progresso-wrap">' +
                      '<div class="sg-bloqueio-progresso-track">' +
                      '<div class="sg-bloqueio-progresso-fill" id="sg-progresso-fill"' +
                      ' style="width:' + progresso.toFixed(1) + '%;"></div>' +
                      '</div>' +
                      '</div>' +
                      '</div>') +

                // Divisor
                '<div class="sg-bloqueio-divisor">Retorne imediatamente com um plano pago</div>' +

                // Opções
                '<div class="sg-bloqueio-opcoes">' +

                // Opção A — Reativar mesmo plano
                '<button type="button" class="sg-btn-reativar primario" id="sg-btn-reativar-mesmo"' +
                ' data-email="' + _esc(email) + '"' +
                ' data-plano="' + _esc(planoId) + '">' +
                '<i class="bi bi-arrow-repeat" style="font-size:1.2rem;flex-shrink:0;"></i>' +
                '<div class="sg-btn-reativar-texto">' +
                '<span class="sg-btn-reativar-titulo">Reativar ' + _esc(planoNome) + '</span>' +
                '<span class="sg-btn-reativar-sub">Mesmo plano · nova data de cobrança a partir de hoje</span>' +
                '</div></button>' +

                // Opção B — Contratar novo plano
                '<a href="/paginasSite/planosContrato.html?reativar=1&email=' + encodeURIComponent(email) + '"' +
                ' class="sg-btn-reativar secundario">' +
                '<i class="bi bi-grid-1x2" style="font-size:1.2rem;flex-shrink:0;"></i>' +
                '<div class="sg-btn-reativar-texto">' +
                '<span class="sg-btn-reativar-titulo">Escolher Outro Plano</span>' +
                '<span class="sg-btn-reativar-sub">Upgrade ou downgrade · acesso imediato</span>' +
                '</div></a>' +

                '</div><!-- /.sg-bloqueio-opcoes -->' +

                '<div class="sg-bloqueio-back">' +
                '<a href="#" id="sg-bloqueio-fechar">← Voltar para o login</a>' +
                '</div>' +

                '</div><!-- /.sg-bloqueio-card -->';

            document.body.appendChild(overlay);

            // Botão voltar
            document.getElementById('sg-bloqueio-fechar')
                .addEventListener('click', function (e) {
                    e.preventDefault();
                    overlay.remove();
                });

            // Botão reativar mesmo plano
            document.getElementById('sg-btn-reativar-mesmo')
                .addEventListener('click', function () {
                    reativarMesmoPlano(email, planoId, overlay);
                });

            // Contador dinâmico (atualiza a cada minuto)
            if (!carenciaCumprida) {
                setInterval(function () {
                    var agora2   = new Date();
                    var faltam2  = Math.max(0,
                        Math.ceil((dataLib - agora2) / (24 * 60 * 60 * 1000)));
                    var passados2 = Math.min(90, Math.max(0,
                        Math.floor((agora2 - dataCanc) / (24 * 60 * 60 * 1000))));
                    var prog2 = Math.min(100, (passados2 / 90) * 100);

                    var elDias = document.getElementById('sg-contador-dias');
                    var elProg = document.getElementById('sg-progresso-fill');
                    if (elDias) elDias.textContent = faltam2;
                    if (elProg) elProg.style.width = prog2.toFixed(1) + '%';
                }, 60000);
            }
        }

        // ── Reativa o mesmo plano (novo ciclo do zero) ──────────
        function reativarMesmoPlano(email, planoId, overlay) {
            // SPRINT 2 — reativação reinicia o ciclo do zero (nova vigência de 30 dias).
            if (window.SG_Plano && window.SG_Plano.contratar) {
                window.SG_Plano.contratar(email, planoId);
            } else {
                var cad = _getUsuarios();
                var d   = cad[email] || {};
                var ass = d.assinatura || {};
                d.assinatura = Object.assign({}, ass, {
                    ativa: true, cancelada: false, plano: planoId, planoAnterior: planoId,
                    contratoId: 'CONT-' + Date.now(),
                    dataInicio: new Date().toISOString(),
                    dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    dataCancelamento: null, mudancaAgendada: null, cancelamentoAgendado: null
                });
                d.statusConta = 'ativo';
                cad[email] = d;
                localStorage.setItem(USUARIOS_KEY, JSON.stringify(cad));
            }

            var nome = (_getUsuarios()[email] || {}).nome || '';
            // Faz login automático (sessão isolada por aba — Sprint 1)
            sessionStorage.setItem('usuarioLogado', JSON.stringify({ email: email, nome: nome, tipo: 'prestador' }));

            if (overlay) overlay.remove();

            // Redireciona para área exclusiva
            setTimeout(function () {
                window.location.href = '/paginasPrestador/prestadorAreaExclusiva.html?reativado=1';
            }, 200);
        }

    })();

// ── Origem: planosContrato.html ──

(function () {
    'use strict';
    var SG_PLANOS_KEY = 'sgPlanosConfig';
    var SG_TERMOS_KEY = 'sgTermosContrato';

    function _esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
    function _lerPlanos(){ try{var a=JSON.parse(localStorage.getItem(SG_PLANOS_KEY));return (a&&Array.isArray(a)&&a.length)?a:null;}catch(e){return null;} }
    function _lerTermos(){ try{var a=JSON.parse(localStorage.getItem(SG_TERMOS_KEY));return (a&&Array.isArray(a)&&a.length)?a:null;}catch(e){return null;} }

    // Preço por plano — consumido pelo fluxo de contratação existente
    window.__sgPrecoPlano = function (planoId) {
        var planos = _lerPlanos();
        if (planos) { for (var i=0;i<planos.length;i++){ if(planos[i].id===planoId && planos[i].preco) return planos[i].preco; } }
        var padrao = { basico:'R$ 49,90/mês', profissional:'R$ 89,90/mês', premium:'R$ 139,90/mês' };
        return padrao[planoId] || '';
    };

    function aplicarPlanos() {
        var planos = _lerPlanos();
        if (!planos) return; // sem edição do admin → mantém HTML padrão
        planos.forEach(function (p) {
            var card = document.getElementById('card-plano-' + p.id);
            if (!card) return;
            var nomeEl = card.querySelector('.plano-nome');
            if (nomeEl && p.nome) nomeEl.textContent = p.nome;
            var precoEl = card.querySelector('.plano-preco');
            if (precoEl && p.preco) {
                var partes = String(p.preco).split('/');
                var principal = partes[0].trim();
                var periodo = partes.length>1 ? '/'+partes.slice(1).join('/').trim() : '';
                precoEl.innerHTML = _esc(principal) + (periodo ? ' <small>'+_esc(periodo)+'</small>' : '');
                if (p.cor) precoEl.style.color = p.cor;
            }
            var descEl = card.querySelector('.plano-desc');
            if (descEl && p.descricao) descEl.textContent = p.descricao;
            var ulEl = card.querySelector('.plano-recursos');
            if (ulEl && Array.isArray(p.recursos) && p.recursos.length) {
                ulEl.innerHTML = p.recursos.map(function(r){ return '<li><i class="bi bi-check-circle-fill"></i> '+_esc(r)+'</li>'; }).join('');
            }
            if (p.destaque) {
                card.classList.add('destaque');
                if (!card.querySelector('.plano-badge-destaque')) {
                    var badge = document.createElement('div');
                    badge.className = 'plano-badge-destaque';
                    badge.textContent = '★ Mais Popular';
                    card.insertBefore(badge, card.firstChild);
                }
            } else {
                card.classList.remove('destaque');
                var b = card.querySelector('.plano-badge-destaque'); if (b) b.remove();
            }
            var btn = card.querySelector('.sg-contratar-btn');
            if (btn && p.nome) {
                btn.setAttribute('data-nome', p.nome);
                btn.innerHTML = '<i class="bi bi-check-circle me-1"></i> Contratar ' + _esc(p.nome);
            }
        });
    }

    function aplicarTermos() {
        var termos = _lerTermos();
        if (!termos) return; // sem edição → mantém HTML padrão
        var secao = document.querySelector('.contrato-section');
        if (!secao) return;
        var tituloEl = secao.querySelector('.contrato-titulo');
        var tituloHtml = tituloEl ? tituloEl.outerHTML : '';
        var itensHtml = termos.map(function (t, i) {
            var alvo = 'ct-cfg-' + (t.id || i);
            return '<div class="contrato-item">' +
                '<div class="contrato-item-header" data-bs-toggle="collapse" data-bs-target="#'+alvo+'">' +
                    '<span><i class="bi '+_esc(t.icone||'bi-file-earmark-text')+' me-2" style="color:'+_esc(t.cor||'#146ADB')+';"></i>'+_esc(t.titulo||'Cláusula')+'</span>' +
                    '<i class="bi bi-chevron-down"></i>' +
                '</div>' +
                '<div id="'+alvo+'" class="collapse'+(t.aberto?' show':'')+'">' +
                    '<div class="contrato-item-body">'+(t.corpo||'')+'</div>' +
                '</div>' +
            '</div>';
        }).join('');
        secao.innerHTML = tituloHtml + itensHtml;
        // Rotação do chevron (mesmo comportamento do script original)
        secao.querySelectorAll('[data-bs-toggle="collapse"]').forEach(function (hdr) {
            var alvo = document.querySelector(hdr.dataset.bsTarget);
            var icon = hdr.querySelector('.bi-chevron-down');
            if (alvo && icon) {
                alvo.addEventListener('show.bs.collapse', function(){ icon.style.transform='rotate(180deg)'; });
                alvo.addEventListener('hide.bs.collapse', function(){ icon.style.transform='rotate(0deg)'; });
            }
        });
    }

    function init(){ aplicarPlanos(); aplicarTermos(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

// ── Origem: planosContrato.html (bloco #2) ──

// ── Lógica da página planosContrato.html ────────────────────────────
document.addEventListener('DOMContentLoaded', function () {

    // Chave usada pelo script.js para armazenar usuários (deve ser idêntica a USUARIOS_KEY)
    var USUARIOS_KEY_LOCAL = 'usuariosCadastrados';

    // ── Detecta contexto de REATIVAÇÃO (conta cancelada) ──
    var urlParams    = new URLSearchParams(window.location.search);
    var modoReativar = urlParams.get('reativar') === '1';
    var emailReativar = urlParams.get('email') || null;

    if (modoReativar) {
        // Tenta identificar o usuário pelo email passado na URL ou pela sessão
        var usuReativar = null;
        if (emailReativar) {
            try {
                var cadR = JSON.parse(localStorage.getItem(USUARIOS_KEY_LOCAL) || '{}');
                if (cadR[emailReativar]) {
                    usuReativar = { email: emailReativar, tipo: 'prestador' };
                }
            } catch(e) {}
        }
        if (!usuReativar) {
            try {
                var tmp = JSON.parse(sessionStorage.getItem('usuarioLogado') || localStorage.getItem('usuarioLogado') || 'null');
                if (tmp && tmp.tipo === 'prestador') usuReativar = tmp;
            } catch(e) {}
        }

        if (usuReativar) {
            // Injeta banner de reativação
            var headerEl = document.querySelector('.planos-header');
            if (headerEl) {
                var bannerReativ = document.createElement('div');
                bannerReativ.style.cssText =
                    'max-width:980px;margin:0 auto 28px;' +
                    'background:linear-gradient(135deg,#dc3545,#b02a37);' +
                    'color:#fff;border-radius:12px;padding:20px 24px;';
                bannerReativ.innerHTML =
                    '<p style="margin:0 0 6px;font-size:1rem;font-weight:800;">' +
                    '<i class="bi bi-person-fill-lock me-2"></i>Sua conta está bloqueada por cancelamento</p>' +
                    '<p style="margin:0;font-size:.88rem;opacity:.9;">' +
                    'Escolha um plano abaixo para reativar o acesso imediatamente. ' +
                    'A nova data de cobrança inicia hoje.</p>';
                headerEl.parentNode.insertBefore(bannerReativ, headerEl);
            }

            // Armazena o email para uso no fluxo de contratação
            if (emailReativar) {
                try { sessionStorage.setItem('sgReativarEmail', emailReativar); } catch(e) {}
            }
        }
    }

    // ── SPRINT 5 — Contexto: página aberta em NOVA ABA a partir do botão
    //    "Ver Termos de Contrato Completos" em prestadorMeuPlano.html.
    //    Nesse caso a aba de origem (prestadorMeuPlano.html) continua aberta
    //    por trás, então "Voltar" não se aplica: os dois botões viram
    //    "Fechar" (fundo #b91c1c, fonte branca) e apenas fecham esta aba.
    if (urlParams.get('origem') === 'meuplano') {
        var botoesVoltarMeuPlano = document.querySelectorAll('a[href="/paginasPrestador/prestadorMeuPlano.html"]');
        botoesVoltarMeuPlano.forEach(function (btnFechar) {
            btnFechar.innerHTML = '<i class="bi bi-x-lg me-1"></i> Fechar';
            btnFechar.style.backgroundColor = '#b91c1c';
            btnFechar.style.borderColor     = '#b91c1c';
            btnFechar.style.color           = '#fff';
            btnFechar.addEventListener('click', function (e) {
                e.preventDefault();
                window.close();
            });
        });
    }

    // ── Detecta contexto: cadastro novo (pendente) ou prestador já logado ──
    var pendente = null;
    try {
        var raw = sessionStorage.getItem('sgCadastroPrestadorPendente');
        if (raw) pendente = JSON.parse(raw);
    } catch (e) {}

    var usuLogado = null;
    try {
        // SPRINT 2 — a sessão de login vive em sessionStorage (DB). Ler de localStorage
        // era a causa do "loop de login": o prestador logado nunca era reconhecido aqui.
        if (window.SG_Plano && window.SG_Plano.sessao) usuLogado = window.SG_Plano.sessao();
        if (!usuLogado) usuLogado = JSON.parse(sessionStorage.getItem('usuarioLogado') || 'null');
        if (!usuLogado) usuLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch (e) {}

    // Contexto C: reativação (email vindo da tela de bloqueio)
    var emailReativSessao = null;
    try { emailReativSessao = sessionStorage.getItem('sgReativarEmail'); } catch(e) {}
    if (!usuLogado && emailReativSessao) {
        // Simula usuário logado para o fluxo de contratação
        var cadCheck = _getUsuariosLocal();
        if (cadCheck[emailReativSessao] && cadCheck[emailReativSessao].tipo === 'prestador') {
            usuLogado = { email: emailReativSessao, tipo: 'prestador',
                          nome: cadCheck[emailReativSessao].nome || '' };
        }
    }

    function _getUsuariosLocal() {
        try { return JSON.parse(localStorage.getItem(USUARIOS_KEY_LOCAL) || '{}'); }
        catch(e) { return {}; }
    }

    // Modo cadastro novo: exibe banner informativo
    if (pendente && pendente.email) {
        var banner = document.getElementById('sg-banner-cadastro-pendente');
        var nomePend = document.getElementById('sg-pendente-nome');
        if (banner) banner.style.display = 'block';
        if (nomePend) nomePend.textContent = pendente.nome || pendente.email;

        // Botão "Usar 30 dias gratuitos"
        var btnTrial = document.getElementById('sg-btn-trial-gratuito');
        if (btnTrial) {
            btnTrial.addEventListener('click', function () {
                // Cadastra o usuário sem plano — trial inicia no primeiro login
                var cad = JSON.parse(localStorage.getItem(USUARIOS_KEY_LOCAL) || '{}');
                cad[pendente.email] = {
                    nome: pendente.nome,
                    senha: pendente.senha,
                    tipo: 'prestador',
                    dataCadastro: pendente.dataCadastro || new Date().toISOString(),
                    trialInicio: new Date().toISOString()
                    // sem assinatura — acesso trial equivalente ao Plano Básico
                };
                localStorage.setItem(USUARIOS_KEY_LOCAL, JSON.stringify(cad));
                try { sessionStorage.removeItem('sgCadastroPrestadorPendente'); } catch (e) {}
                window.location.href = '/paginasSite/login.html?cadastro=sucesso';
            });
        }
    }

    // Chevron collapse
    document.querySelectorAll('[data-bs-toggle="collapse"]').forEach(function (hdr) {
        var target = hdr.dataset.bsTarget;
        var collapseEl = document.querySelector(target);
        var icon = hdr.querySelector('.bi-chevron-down');
        if (collapseEl && icon) {
            collapseEl.addEventListener('show.bs.collapse', function () { icon.style.transform = 'rotate(180deg)'; });
            collapseEl.addEventListener('hide.bs.collapse', function () { icon.style.transform = 'rotate(0deg)'; });
        }
    });

    // Botões de contratar
    document.querySelectorAll('.sg-contratar-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var planoId   = btn.dataset.plano;
            var planoNome = btn.dataset.nome;
            // SPRINT 1 — preços vindos da configuração editável pelo admin (fallback aos padrões).
            var precos    = {
                basico:       (window.__sgPrecoPlano ? window.__sgPrecoPlano('basico')       : 'R$ 49,90/mês'),
                profissional: (window.__sgPrecoPlano ? window.__sgPrecoPlano('profissional') : 'R$ 89,90/mês'),
                premium:      (window.__sgPrecoPlano ? window.__sgPrecoPlano('premium')      : 'R$ 139,90/mês')
            };

            // ── Contexto A: novo cadastro (vindo de cadastro.html) ──
            if (pendente && pendente.email) {
                var modalConfEl = document.getElementById('modalConfirmarContrato');
                var bodyEl = document.getElementById('modalConfirmarContratoBody');
                bodyEl.innerHTML =
                    '<p>Olá, <strong>' + _escLocal(pendente.nome) + '</strong>! Você está contratando o <strong>' + _escLocal(planoNome) + '</strong> por <strong>' + (precos[planoId] || '') + '</strong>.</p>' +
                    '<p class="text-muted small">Seu cadastro e plano serão ativados imediatamente. Ao confirmar, você aceita os Termos de Contrato apresentados nesta página.</p>' +
                    '<div style="background:#e8f4fd;border-left:4px solid #146ADB;padding:12px 14px;border-radius:0 8px 8px 0;">' +
                    '<p style="margin:0;font-size:.85rem;"><i class="bi bi-info-circle-fill me-1"></i>Um número de contrato será gerado automaticamente para seu controle.</p>' +
                    '</div>';

                var modalConf = new bootstrap.Modal(modalConfEl);
                modalConf.show();

                var btnConf = document.getElementById('btn-confirmar-contrato');
                var novoBtn = btnConf.cloneNode(true);
                btnConf.parentNode.replaceChild(novoBtn, btnConf);
                novoBtn.addEventListener('click', function () {
                    var contratoId = 'CONT-' + Date.now();
                    // Salva o usuário com plano já ativo
                    var cad = JSON.parse(localStorage.getItem(USUARIOS_KEY_LOCAL) || '{}');
                    cad[pendente.email] = {
                        nome: pendente.nome,
                        senha: pendente.senha,
                        tipo: 'prestador',
                        dataCadastro: pendente.dataCadastro || new Date().toISOString(),
                        trialInicio: new Date().toISOString(),
                        assinatura: {
                            ativa: true,
                            cancelada: false,
                            plano: planoId,
                            planoAnterior: planoId,
                            contratoId: contratoId,
                            dataInicio: new Date().toISOString(),
                            dataFim: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
                            mudancaAgendada: null,
                            cancelamentoAgendado: null,
                            dataCancelamento: null
                        }
                    };
                    localStorage.setItem(USUARIOS_KEY_LOCAL, JSON.stringify(cad));
                    // Limpa dados pendentes da sessão
                    try { sessionStorage.removeItem('sgCadastroPrestadorPendente'); } catch (e) {}
                    modalConf.hide();
                    // Redireciona para login com mensagem de sucesso
                    window.location.href = '/paginasSite/login.html?cadastro=sucesso';
                });
                return;
            }

            // ── Contexto B: prestador já logado (contratar / alterar plano) ──
            if (!usuLogado || usuLogado.tipo !== 'prestador') {
                var modalLogin = new bootstrap.Modal(document.getElementById('modalLoginNecessario'));
                modalLogin.show();
                return;
            }

            var email2  = usuLogado.email;
            var estadoB = (window.SG_Plano && window.SG_Plano.estado) ? window.SG_Plano.estado(email2) : null;
            var temPlanoPagoAtivo = !!(estadoB && estadoB.ativa && estadoB.plano && estadoB.plano !== 'gratuito');

            // SPRINT 2 — Se o prestador selecionar o mesmo plano que já tem contratado,
            // avisa imediatamente e não abre o modal de confirmação/alteração.
            if (temPlanoPagoAtivo && estadoB.plano === planoId) {
                _toastLocal('Esse é o seu plano Atual. Escolha outro plano!', '#dc3545');
                return;
            }

            var modalConfEl2 = document.getElementById('modalConfirmarContrato');
            var bodyEl2   = document.getElementById('modalConfirmarContratoBody');
            var tituloEl2 = document.getElementById('modalConfirmarContratoTitulo');

            if (temPlanoPagoAtivo) {
                // ALTERAÇÃO de plano vigente → agendada para o fim da vigência.
                // Sem reembolso: o período já contratado é integral.
                var fimVig  = estadoB.dataFim;
                var tipoMud = window.SG_Plano.tipoMudanca(estadoB.plano, planoId);
                var rotulo  = tipoMud === 'upgrade' ? 'Upgrade' : (tipoMud === 'downgrade' ? 'Downgrade' : 'Alteração');
                if (tituloEl2) tituloEl2.innerHTML = '<i class="bi bi-arrow-left-right me-2"></i>' + rotulo + ' de Plano';
                bodyEl2.innerHTML =
                    '<p>Você está alterando do <strong>' + _escLocal(estadoB.planoNome) + '</strong> para o <strong>' + _escLocal(planoNome) + '</strong>.</p>' +
                    '<div style="background:#fff8e1;border-left:4px solid #FFC300;padding:12px 14px;border-radius:0 8px 8px 0;margin-bottom:10px;">' +
                    '<p style="margin:0 0 6px;font-size:.86rem;"><i class="bi bi-calendar-check me-1"></i>Você mantém os benefícios do <strong>' + _escLocal(estadoB.planoNome) + '</strong> até o fim da vigência atual (<strong>' + window.SG_Plano.fmt(fimVig) + '</strong>).</p>' +
                    '<p style="margin:0;font-size:.86rem;"><i class="bi bi-arrow-right-circle me-1"></i>A partir de <strong>' + window.SG_Plano.fmt(fimVig) + '</strong>, o <strong>' + _escLocal(planoNome) + '</strong> entra em vigor, iniciando um novo ciclo.</p>' +
                    '</div>' +
                    '<p class="text-muted small" style="margin:0;"><i class="bi bi-info-circle me-1"></i>Não há reembolso proporcional — o período já contratado é integral. Você pode reverter esta troca em "Meu Plano" enquanto a vigência atual não terminar.</p>';
            } else {
                // CONTRATAÇÃO imediata (sem plano pago ativo: trial, gratuito, expirado ou pós-carência).
                if (tituloEl2) tituloEl2.innerHTML = '<i class="bi bi-credit-card me-2"></i>Confirmar Contratação';
                bodyEl2.innerHTML =
                    '<p>Você está prestes a contratar o <strong>' + _escLocal(planoNome) + '</strong> por <strong>' + (precos[planoId] || '') + '</strong>.</p>' +
                    '<p class="text-muted small">O plano entra em vigor imediatamente e inicia um novo ciclo de 30 dias. Ao confirmar, você aceita os Termos de Contrato apresentados nesta página.</p>' +
                    '<div style="background:#e8f4fd;border-left:4px solid #146ADB;padding:12px 14px;border-radius:0 8px 8px 0;">' +
                    '<p style="margin:0;font-size:.85rem;"><i class="bi bi-info-circle-fill me-1"></i>Um número de contrato será gerado automaticamente para seu controle.</p>' +
                    '</div>';
            }

            var modalConf2 = new bootstrap.Modal(modalConfEl2);
            modalConf2.show();

            var btnConf2 = document.getElementById('btn-confirmar-contrato');
            var novoBtn2 = btnConf2.cloneNode(true);
            btnConf2.parentNode.replaceChild(novoBtn2, btnConf2);
            novoBtn2.addEventListener('click', function () {
                var msg, destinoUrl;
                if (temPlanoPagoAtivo) {
                    var r = window.SG_Plano.agendarTroca(email2, planoId);
                    if (!r.ok) {
                        modalConf2.hide();
                        _toastLocal(r.motivo === 'mesmo_plano' ? 'Esse é o seu plano Atual. Escolha outro plano!' : 'Não foi possível agendar a troca.', '#dc3545');
                        return;
                    }
                    msg = (r.tipo === 'upgrade' ? 'Upgrade' : 'Troca') + ' agendada! ' + planoNome + ' entra em vigor em ' + window.SG_Plano.fmt(r.efetivaEm) + '.';
                    destinoUrl = '/paginasPrestador/prestadorMeuPlano.html';
                } else {
                    window.SG_Plano.contratar(email2, planoId);
                    msg = planoNome + ' contratado com sucesso!';
                    destinoUrl = '/paginasPrestador/prestadorHotsiteAdm.html';
                }
                // Garante a sessão ativa em sessionStorage (contratação/reativação).
                try {
                    sessionStorage.setItem('usuarioLogado', JSON.stringify({ email: email2, nome: usuLogado.nome || '', tipo: 'prestador' }));
                } catch (e) {}
                try { sessionStorage.removeItem('sgReativarEmail'); } catch (e) {}
                modalConf2.hide();
                var toastEl = document.getElementById('toastContrato');
                document.getElementById('toastContratoMsg').textContent = msg;
                new bootstrap.Toast(toastEl, { delay: 4500 }).show();
                setTimeout(function () { window.location.href = destinoUrl; }, 2200);
            });
        });
    });

    // Destaca o plano atual, avisa sobre agendamentos e injeta "Voltar ao Plano Gratuito"
    try {
        if (usuLogado && usuLogado.tipo === 'prestador' && window.SG_Plano && window.SG_Plano.estado) {
            var est3 = window.SG_Plano.estado(usuLogado.email);
            var planoAtual3 = (est3.ativa && est3.plano && est3.plano !== 'gratuito') ? est3.plano : null;

            if (planoAtual3) {
                var cardAtual3 = document.getElementById('card-plano-' + planoAtual3);
                if (cardAtual3) {
                    var btnAtual3 = cardAtual3.querySelector('.sg-contratar-btn');
                    if (btnAtual3) {
                        btnAtual3.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Plano Atual';
                        // SPRINT 2 — mantém clicável para que a seleção do mesmo plano
                        // exiba o aviso "Esse é o seu plano Atual. Escolha outro plano!"
                        // em vez de simplesmente ficar inerte.
                        btnAtual3.style.opacity = '.65';
                        btnAtual3.style.cursor = 'pointer';
                    }
                }

                var headerEl3 = document.querySelector('.planos-header');
                // Banner: troca ou cancelamento já agendado
                if (headerEl3 && (est3.mudancaAgendada || est3.cancelamentoAgendado)) {
                    var aviso3 = document.createElement('div');
                    aviso3.style.cssText = 'max-width:980px;margin:0 auto 22px;background:#fff8e1;border:1.5px solid #FFC300;border-radius:12px;padding:14px 18px;color:#7a5c00;font-size:.88rem;';
                    if (est3.mudancaAgendada) {
                        var md3 = est3.mudancaAgendada;
                        aviso3.innerHTML = '<i class="bi bi-calendar-event me-2"></i>Você já tem uma alteração agendada para <strong>' + _escLocal(md3.nomeDestino) + '</strong>, com início em <strong>' + window.SG_Plano.fmt(md3.efetivaEm) + '</strong>. Gerencie em <a href="/paginasPrestador/prestadorMeuPlano.html" style="color:#7a5c00;font-weight:700;">Meu Plano</a>.';
                    } else {
                        aviso3.innerHTML = '<i class="bi bi-x-octagon me-2"></i>Você tem um cancelamento agendado para <strong>' + window.SG_Plano.fmt(est3.cancelamentoAgendado.efetivaEm) + '</strong> (carência de 90 dias após essa data). Gerencie em <a href="/paginasPrestador/prestadorMeuPlano.html" style="color:#7a5c00;font-weight:700;">Meu Plano</a>.';
                    }
                    headerEl3.parentNode.insertBefore(aviso3, headerEl3.nextSibling);
                }

                // Botão "Voltar ao Plano Gratuito" (downgrade agendado) — só se não houver agendamento ativo
                var gridEl3 = document.getElementById('planos-grid');
                if (gridEl3 && !est3.mudancaAgendada && !est3.cancelamentoAgendado) {
                    var wrapGrat3 = document.createElement('div');
                    wrapGrat3.style.cssText = 'max-width:980px;margin:18px auto 0;text-align:center;';
                    wrapGrat3.innerHTML = '<button type="button" id="sg-voltar-gratuito" style="background:#fff;border:1.5px solid #6c757d;color:#495057;border-radius:8px;padding:10px 22px;font-weight:600;font-size:.88rem;cursor:pointer;"><i class="bi bi-arrow-down-circle me-1"></i>Voltar ao Plano Gratuito ao fim da vigência</button>';
                    gridEl3.parentNode.insertBefore(wrapGrat3, gridEl3.nextSibling);
                    document.getElementById('sg-voltar-gratuito').addEventListener('click', function () {
                        if (!confirm('Agendar a volta ao Plano Gratuito?\n\nVocê mantém os benefícios do ' + est3.planoNome + ' até ' + window.SG_Plano.fmt(est3.dataFim) + '. A partir dessa data, sua conta passa ao Plano Gratuito (benefícios limitados) — os recursos do plano pago são cessados.')) return;
                        var rg = window.SG_Plano.agendarTroca(usuLogado.email, 'gratuito');
                        if (rg.ok) {
                            _toastLocal('Downgrade ao Plano Gratuito agendado para ' + window.SG_Plano.fmt(rg.efetivaEm) + '.', '#198754');
                            setTimeout(function () { window.location.href = '/paginasPrestador/prestadorMeuPlano.html'; }, 1800);
                        } else {
                            _toastLocal('Não foi possível agendar agora.', '#dc3545');
                        }
                    });
                }
            }
        }
    } catch (e) {}

    // Toast local simples
    function _toastLocal(msg, cor) {
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:' + (cor || '#198754') + ';color:#fff;padding:13px 18px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:.9rem;max-width:340px;';
        el.innerHTML = '<i class="bi bi-info-circle me-2"></i>' + msg;
        document.body.appendChild(el);
        setTimeout(function () { try { el.remove(); } catch (e) {} }, 4000);
    }

    // Função de escape local (sem depender de script.js)
    function _escLocal(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
});

// ── Origem: prestadorMeuPlano.html ──

    (function () {
        'use strict';

        // SPRINT 6 — Lista de recursos alinhada aos limites reais de galeria
        // agora aplicados (LIMITES_GALERIA_POR_PLANO): cada plano libera uma
        // quantidade específica de fotos + vídeos, nunca o máximo para todos.
        var RECURSOS = {
            gratuito: [
                'HotSite ativo no catálogo (Plano Gratuito)',
                'Agendamentos ilimitados',
                'Avaliações de clientes',
                'Suporte por e-mail',
                'Galeria de até 4 arquivos de mídia (3 fotos + 1 vídeo)'
            ],
            basico: [
                'HotSite ativo no catálogo',
                'Agendamentos ilimitados',
                'Avaliações de clientes',
                'Suporte por e-mail',
                'Galeria de até 7 arquivos de mídia (6 fotos + 1 vídeo)'
            ],
            profissional: [
                'HotSite ativo no catálogo',
                'Agendamentos ilimitados',
                'Avaliações de clientes',
                'Suporte por e-mail',
                'Galeria de até 12 arquivos de mídia (11 fotos + 1 vídeo)',
                'Destaque no catálogo',
                'Relatórios mensais'
            ],
            premium: [
                'HotSite ativo no catálogo',
                'Agendamentos ilimitados',
                'Avaliações de clientes',
                'Suporte por e-mail',
                'Galeria de até 20 arquivos de mídia (18 fotos + 2 vídeos)',
                'Destaque no catálogo',
                'Relatórios mensais detalhados',
                'Suporte prioritário 24h',
                'Selo verificado ServGo!'
            ],
            trial: [
                'HotSite ativo no catálogo (período de testes)',
                'Agendamentos ilimitados',
                'Avaliações de clientes',
                'Suporte por e-mail',
                'Galeria de até 4 arquivos de mídia (3 fotos + 1 vídeo)',
                '<span style="color:#b8870c;">Acesso por tempo limitado — 30 dias a partir do cadastro</span>'
            ]
        };
        var NOMES = { gratuito:'Plano Gratuito', basico:'Plano Básico', profissional:'Plano Profissional', premium:'Plano Premium', trial:'Trial Gratuito (30 dias)' };

        function _sessao() {
            try {
                if (window.SG_Plano && window.SG_Plano.sessao) { var s = window.SG_Plano.sessao(); if (s) return s; }
                return JSON.parse(sessionStorage.getItem('usuarioLogado') || localStorage.getItem('usuarioLogado') || 'null');
            } catch (e) { return null; }
        }
        function _fmt(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return '—'; } }
        function _esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        function render() {
            var usu = _sessao();
            if (!usu || usu.tipo !== 'prestador') return;

            var est = (window.SG_Plano && window.SG_Plano.estado) ? window.SG_Plano.estado(usu.email) : null;
            var planoId;
            if (est && est.ativa)            planoId = est.plano;          // 'gratuito' ou plano pago
            else if (est && (est.fase === 'trial' || est.fase === 'trial_gratuito')) planoId = 'trial';
            else                             planoId = est && est.planoAnterior ? est.planoAnterior : 'trial';

            // ── Recursos do plano vigente ──────────────────────
            var recursosEl = document.getElementById('sg-plano-recursos-corpo');
            if (recursosEl) {
                var lista = RECURSOS[planoId] || RECURSOS['trial'];
                recursosEl.innerHTML = '<ul style="list-style:none;padding:0;margin:0;">' +
                    lista.map(function (r) {
                        return '<li style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;font-size:.88rem;color:#333;">' +
                            '<i class="bi bi-check-circle-fill" style="color:#10b981;margin-top:1px;flex-shrink:0;"></i>' + r + '</li>';
                    }).join('') + '</ul>';
            }

            // ── Informações do contrato ────────────────────────
            var contratoEl = document.getElementById('sg-plano-contrato-corpo');
            if (contratoEl) {
                var rows = [];
                if (est && est.contratoId)  rows.push(['Número do Contrato', est.contratoId]);
                if (est && est.plano)       rows.push(['Plano vigente', (NOMES[est.plano] || est.plano)]);
                if (est && est.dataInicio)  rows.push(['Início da vigência', _fmt(est.dataInicio)]);
                if (est && est.dataFim)     rows.push(['Vigência até', _fmt(est.dataFim) + ' (renova automaticamente)']);
                if (est && est.mudancaAgendada) {
                    var md = est.mudancaAgendada;
                    rows.push(['Alteração agendada', (md.planoDestino === 'gratuito' ? 'Plano Gratuito' : md.nomeDestino) + ' em ' + _fmt(md.efetivaEm)]);
                }
                if (est && est.cancelamentoAgendado) rows.push(['Cancelamento agendado', _fmt(est.cancelamentoAgendado.efetivaEm)]);
                if (est && est.cancelada && est.dataCancelamento) rows.push(['Cancelado em', _fmt(est.dataCancelamento)]);
                rows.push(['E-mail', usu.email]);

                contratoEl.innerHTML = rows.length
                    ? '<table style="width:100%;border-collapse:collapse;font-size:.88rem;">' +
                        rows.map(function (r) {
                            return '<tr><td style="padding:8px 12px;font-weight:700;color:#555;width:42%;border-bottom:1px solid #f0f0f0;">' + r[0] + '</td>' +
                                '<td style="padding:8px 12px;color:#222;border-bottom:1px solid #f0f0f0;">' + r[1] + '</td></tr>';
                        }).join('') + '</table>'
                    : '<p style="color:#888;font-size:.88rem;">Nenhum contrato ativo no momento.</p>';
            }

            // ── Pagamentos & Faturas (SPRINT 3) ────────────────
            renderFinanceiro(usu, est);

            // Botão "Iniciar trial" se nunca iniciou e não tem assinatura
            if (est && !est.ativa && est.fase === 'trial_gratuito') {
                var wrapTrial = document.getElementById('sg-btn-trial-wrap');
                if (wrapTrial) wrapTrial.style.display = 'block';
            }
        }

        // ── SPRINT 3 — Pagamentos & Faturas do prestador ───────
        function _statusBadge(sv) {
            var map = { pago:['#198754','Pago'], pendente:['#b8870c','Pendente'], atrasado:['#dc3545','Em atraso'], cancelado:['#6c757d','Cancelada'] };
            var m = map[sv] || map.pendente;
            return '<span style="background:'+m[0]+';color:#fff;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;">'+m[1]+'</span>';
        }
        function _copiar(txt, btn) {
            function ok(){ if(btn){ var o=btn.innerHTML; btn.innerHTML='<i class="bi bi-check2 me-1"></i>Copiado!'; setTimeout(function(){ btn.innerHTML=o; },1500); } }
            try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(ok, function(){}); return; } } catch(e){}
            try { var ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok(); } catch(e){}
        }
        function _boletoHtmlP(cob, bol, cfg) {
            var Fin = window.SG_Financeiro;
            return '<div style="border:2px dashed #146ADB;border-radius:10px;padding:14px;font-family:monospace;font-size:.8rem;">' +
                'Beneficiário: <strong>'+_esc(bol.beneficiario)+'</strong> — CNPJ '+_esc(bol.cnpj)+'<br>' +
                'Nosso número: <strong>'+_esc(bol.nossoNumero)+'</strong> · Vencimento: <strong>'+Fin.fmtData(bol.vencimento)+'</strong> · Valor: <strong>'+Fin.fmtBRL(bol.valor)+'</strong>' +
                '<div style="background:#f1f5ff;border-radius:6px;padding:10px;margin-top:10px;text-align:center;font-weight:700;letter-spacing:1px;word-break:break-all;">'+_esc(bol.linhaDigitavel)+'</div>' +
                '<div style="font-size:.72rem;color:#888;margin-top:8px;">'+_esc(cfg.boletoInstrucoes)+'</div></div>';
        }
        function renderFinanceiro(usu, est) {
            var el = document.getElementById('sg-financeiro-corpo'); if (!el) return;
            var Fin = window.SG_Financeiro;
            if (!Fin) { el.innerHTML = '<p style="color:#888;font-size:.88rem;">Módulo financeiro indisponível.</p>'; return; }
            Fin.sincronizarPrestador(usu.email);
            var cfg  = Fin.obterConfig();
            var cobr = Fin.cobrancasPrestador(usu.email);

            var formas =
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">' +
                  '<div style="border:1.5px solid #e6f0ff;border-radius:10px;padding:14px;background:#f7faff;">' +
                    '<div style="font-weight:800;font-size:.9rem;color:#146ADB;margin-bottom:8px;"><i class="bi bi-qr-code me-1"></i>PIX</div>' +
                    '<div style="font-size:.82rem;color:#444;line-height:1.7;">Tipo: <strong>'+_esc(cfg.pixTipo)+'</strong><br>Titular: <strong>'+_esc(cfg.pixTitular)+'</strong><br>Chave: <strong>'+_esc(cfg.pixChave)+'</strong></div>' +
                    '<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-copiar="'+_esc(cfg.pixChave)+'"><i class="bi bi-clipboard me-1"></i>Copiar chave PIX</button>' +
                  '</div>' +
                  '<div style="border:1.5px solid #e6f7ee;border-radius:10px;padding:14px;background:#f6fbf8;">' +
                    '<div style="font-weight:800;font-size:.9rem;color:#198754;margin-bottom:8px;"><i class="bi bi-bank me-1"></i>Depósito / Transferência</div>' +
                    '<div style="font-size:.82rem;color:#444;line-height:1.7;">Banco: <strong>'+_esc(cfg.banco)+'</strong><br>Agência: <strong>'+_esc(cfg.agencia)+'</strong> · Conta: <strong>'+_esc(cfg.conta)+'</strong><br>Titular: <strong>'+_esc(cfg.titular)+'</strong> · CNPJ: '+_esc(cfg.cnpj)+'</div>' +
                  '</div>' +
                '</div>';

            var faturas;
            if (!cobr.length) {
                faturas = '<p style="color:#888;font-size:.86rem;">Nenhuma fatura emitida ainda. As faturas são geradas automaticamente ao contratar ou renovar um plano pago.</p>';
            } else {
                faturas = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:520px;font-size:.85rem;">' +
                    '<thead><tr style="background:#f8f9fa;text-align:left;">' + ['Descrição','Valor','Vencimento','Status','Pagar'].map(function(h){ return '<th style="padding:8px 10px;font-size:.74rem;color:#666;border-bottom:2px solid #eee;">'+h+'</th>'; }).join('') + '</tr></thead><tbody>' +
                    cobr.map(function(c){
                        var sv = Fin.statusVisual(c);
                        var pagar = (c.status==='pendente')
                            ? '<button type="button" class="btn btn-sm btn-warning fw-bold" data-pagar="'+c.id+'"><i class="bi bi-cash-coin me-1"></i>Como pagar</button>'
                            : (c.status==='pago' ? '<span style="color:#198754;font-size:.78rem;"><i class="bi bi-check2-circle me-1"></i>Pago em '+Fin.fmtData(c.dataBaixa)+'</span>' : '—');
                        return '<tr>' +
                          '<td style="padding:8px 10px;">'+_esc(c.descricao)+'</td>' +
                          '<td style="padding:8px 10px;font-weight:700;">'+Fin.fmtBRL(c.valor)+'</td>' +
                          '<td style="padding:8px 10px;color:#666;">'+Fin.fmtData(c.dataVencimento)+'</td>' +
                          '<td style="padding:8px 10px;">'+_statusBadge(sv)+'</td>' +
                          '<td style="padding:8px 10px;">'+pagar+'</td>' +
                          '</tr>';
                    }).join('') + '</tbody></table></div>';
            }

            el.innerHTML = '<p style="font-size:.86rem;color:#666;margin-bottom:14px;">Pague suas faturas por <strong>PIX</strong>, <strong>depósito bancário</strong> ou <strong>boleto</strong>. Após o pagamento, a baixa é confirmada pela administração do ServGo!.</p>' +
                formas +
                '<div style="font-weight:800;font-size:.9rem;color:#1a1a1a;margin:6px 0 10px;"><i class="bi bi-receipt me-1"></i>Minhas Faturas</div>' + faturas;

            el.querySelectorAll('[data-copiar]').forEach(function(b){ b.addEventListener('click', function(){ _copiar(b.getAttribute('data-copiar'), b); }); });
            el.querySelectorAll('[data-pagar]').forEach(function(b){ b.addEventListener('click', function(){ _modalPagar(b.getAttribute('data-pagar'), cfg); }); });
        }
        function _modalPagar(id, cfg) {
            var Fin = window.SG_Financeiro; var s = _sessao(); if (!s) return;
            var cob = Fin.cobrancasPrestador(s.email).filter(function(c){ return c.id===id; })[0]; if (!cob) return;
            var bol = Fin.gerarBoleto(cob);
            var mid='sg-modal-pagar'; var ex=document.getElementById(mid); if(ex)ex.remove();
            var html='<div class="modal fade" id="'+mid+'" tabindex="-1" aria-modal="true" role="dialog"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content">' +
                '<div class="modal-header" style="background:#146ADB;color:#fff;"><h5 class="modal-title"><i class="bi bi-cash-coin me-2"></i>Como pagar — '+_esc(cob.planoNome)+'</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
                '<div class="modal-body">' +
                  '<p style="font-size:.9rem;">Valor: <strong>'+Fin.fmtBRL(cob.valor)+'</strong> · Vencimento: <strong>'+Fin.fmtData(cob.dataVencimento)+'</strong></p>' +
                  '<ul class="nav nav-tabs" role="tablist">' +
                    '<li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#sgpay-pix" type="button">PIX</button></li>' +
                    '<li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#sgpay-banco" type="button">Depósito</button></li>' +
                    '<li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#sgpay-boleto" type="button">Boleto</button></li>' +
                  '</ul>' +
                  '<div class="tab-content pt-3">' +
                    '<div class="tab-pane fade show active" id="sgpay-pix"><p style="font-size:.86rem;">Chave PIX (<strong>'+_esc(cfg.pixTipo)+'</strong>):</p><div style="background:#f1f5ff;border-radius:6px;padding:10px;font-weight:700;word-break:break-all;">'+_esc(cfg.pixChave)+'</div><button class="btn btn-sm btn-outline-primary mt-2" data-copiar2="'+_esc(cfg.pixChave)+'"><i class="bi bi-clipboard me-1"></i>Copiar chave</button><p style="font-size:.78rem;color:#888;margin-top:8px;">Titular: '+_esc(cfg.pixTitular)+'</p></div>' +
                    '<div class="tab-pane fade" id="sgpay-banco"><div style="font-size:.86rem;line-height:1.9;">Banco: <strong>'+_esc(cfg.banco)+'</strong><br>Agência: <strong>'+_esc(cfg.agencia)+'</strong> · Conta: <strong>'+_esc(cfg.conta)+'</strong><br>Titular: <strong>'+_esc(cfg.titular)+'</strong><br>CNPJ: '+_esc(cfg.cnpj)+'</div></div>' +
                    '<div class="tab-pane fade" id="sgpay-boleto">'+_boletoHtmlP(cob,bol,cfg)+'<button class="btn btn-sm btn-outline-primary mt-2" data-copiar2="'+_esc(bol.linhaDigitavel)+'"><i class="bi bi-clipboard me-1"></i>Copiar linha digitável</button></div>' +
                  '</div>' +
                  '<div style="background:#fff8e1;border-left:4px solid #FFC300;padding:10px 12px;border-radius:0 8px 8px 0;margin-top:14px;font-size:.82rem;color:#7a5c00;"><i class="bi bi-info-circle me-1"></i>Após pagar, envie o comprovante ao suporte. A baixa é confirmada pela administração do ServGo!.</div>' +
                '</div>' +
                '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div>' +
                '</div></div></div>';
            document.body.insertAdjacentHTML('beforeend',html);
            var elm=document.getElementById(mid); var modal=new bootstrap.Modal(elm); modal.show();
            elm.querySelectorAll('[data-copiar2]').forEach(function(b){ b.addEventListener('click', function(){ _copiar(b.getAttribute('data-copiar2'), b); }); });
            elm.addEventListener('hidden.bs.modal', function(){ try{elm.remove();}catch(e){} }, {once:true});
        }

        // Aguarda o script.js (defer) terminar de montar status/cards.
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 120); });
        else setTimeout(render, 120);
    })();
