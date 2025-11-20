/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')

class Home {
    static id = "home";
    musicStarted = false; // AÑADIDO: Para rastrear si la música ya se inició

    async init(config) {
        this.config = config;
        this.db = new database();

        // 1. Initialize UI Listeners first to ensure buttons work immediately
        this.initListeners();

        // 2. Load content asynchronously so it doesn't block the UI
        this.loadContent();
    }

    initListeners() {
        // Settings button
        const settingsBtn = document.querySelector('.settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', e => changePanel('settings'));
        }

        // Play button
        const playBtn = document.querySelector('.play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', async () => {
                await this.startGame();
            });
        }

        // Instance selection button
        const instanceSelectBtn = document.querySelector('.instance-select');
        if (instanceSelectBtn) {
            instanceSelectBtn.addEventListener('click', async () => {
                await this.openInstanceMenu();
            });
        }

        // Close popup button
        const closePopupBtn = document.querySelector('.close-popup');
        if (closePopupBtn) {
            closePopupBtn.addEventListener('click', () => {
                const popupElement = document.querySelector('.instance-popup');
                if (popupElement) {
                    popupElement.classList.remove('visible'); // Usar clase 'visible' para el fade-out
                    setTimeout(() => {
                        popupElement.style.display = 'none';
                    }, 500); // Esperar el final de la transición
                }
            });
        }
        
        // Instance selection within popup (delegation)
        const instancePopup = document.querySelector('.instance-popup');
        if (instancePopup) {
            instancePopup.addEventListener('click', async e => {
                if (e.target.classList.contains('instance-elements')) {
                    await this.selectInstance(e.target.id);
                }
            });
        }
        
        // Social links
        const socials = document.querySelectorAll('.social-block');
        socials.forEach(social => {
            social.addEventListener('click', e => {
                // Find the closest parent with class social-block to get the dataset
                const target = e.target.closest('.social-block');
                if (target && target.dataset.url) {
                    shell.openExternal(target.dataset.url);
                }
            });
        });

        // =================================================================
        // AÑADIDO: Inicializar y manejar la reproducción de la música de fondo
        // =================================================================
        this.initMusicPlayer();
    }
    
    // =========================================================================
    // NUEVO MÉTODO AÑADIDO PARA LA MÚSICA DE FONDO 🎵
    // =========================================================================
    initMusicPlayer() {
        const backgroundMusic = document.getElementById('background-music');

        if (!backgroundMusic) {
            console.warn('Audio element with ID "background-music" not found.');
            return;
        }

        // Función para intentar iniciar la reproducción
        const startMusic = () => {
            if (this.musicStarted) return;
            
            backgroundMusic.volume = 0.1; // Ajusta el volumen (0.0 a 1.0)
            
            backgroundMusic.play().then(() => {
                this.musicStarted = true;
                console.log('Música de fondo iniciada por interacción del usuario.');
                // Quitar los listeners después de la primera reproducción exitosa
                document.removeEventListener('click', startMusic);
                document.removeEventListener('keydown', startMusic);
            }).catch(error => {
                // Si falla (ej: sin interacción del usuario), se maneja en el listener.
                console.debug('La reproducción automática fue bloqueada. Esperando interacción...');
            });
        };

        // Agregar listeners para el primer evento de interacción del usuario (clic o tecla)
        // Usamos { once: true } para que solo se active una vez
        document.addEventListener('click', startMusic, { once: true });
        document.addEventListener('keydown', startMusic, { once: true });
    }
    // =========================================================================

    // =========================================================================
    // NUEVO MÉTODO PARA MANEJAR EVENTOS DEL POPUP DE LOGIN (CSP FIX)
    // =========================================================================
    addLoginPopupListeners() {
        // Usamos un pequeño timeout para dar tiempo a que el popup se renderice en el DOM
        setTimeout(() => {
            // Nota: Se asume que la clase 'popup' existe en el contenedor del error
            const loginBtn = document.querySelector('.popup .btn-connexion');
            const offlineBtn = document.querySelector('.popup .btn-offline');
            
            if (loginBtn) {
                loginBtn.addEventListener('click', () => {
                    // Cierra el popup de error antes de cambiar de panel
                    const popupElement = document.querySelector('.popup');
                    if (popupElement) popupElement.style.display = 'none'; 
                    
                    const targetPanel = loginBtn.getAttribute('data-panel');
                    if (targetPanel) {
                        changePanel(targetPanel);
                    }
                });
            }
            
            if (offlineBtn) {
                offlineBtn.addEventListener('click', () => {
                    // Cierra el popup de error antes de cambiar de panel
                    const popupElement = document.querySelector('.popup');
                    if (popupElement) popupElement.style.display = 'none'; 
                    
                    const targetPanel = offlineBtn.getAttribute('data-panel');
                    if (targetPanel) {
                        changePanel(targetPanel);
                    }
                });
            }
        }, 50); 
    }
    // =========================================================================


    async loadContent() {
        // Load news and instances concurrently
        this.news();
        this.initInstanceSelection();
        // AÑADIDO: Inicializar la cuenta seleccionada si no existe
        this.initAccountSelection();
    }
    
    // =========================================================================
    // MÉTODO AÑADIDO/MODIFICADO PARA ASEGURAR UNA CUENTA SELECCIONADA
    // =========================================================================
    async initAccountSelection() {
        try {
            let configClient = await this.db.readData('configClient');
            let allAccounts = await this.db.readData('accounts');
            
            // Si la cuenta seleccionada NO existe o es null/undefined
            if (!configClient?.account_selected || !allAccounts?.[configClient.account_selected]) {
                const accountKeys = allAccounts ? Object.keys(allAccounts) : [];
                
                if (accountKeys.length > 0) {
                    // Seleccionar la primera cuenta como predeterminada
                    configClient.account_selected = accountKeys[0];
                    await this.db.updateData('configClient', configClient);
                    console.log(`Default account set to: ${configClient.account_selected}`);
                }
            }
        } catch (e) {
            console.error("Error initializing account selection:", e);
        }
    }
    // =========================================================================


    async news() {
        let newsElement = document.querySelector('.news-list');
        if (!newsElement) return;

        let news = await config.getNews().then(res => res).catch(err => false);
        
        // Clear existing news to prevent duplication if re-initialized
        newsElement.innerHTML = '';

        if (news && news.length > 0) {
            for (let News of news) {
                let date = this.getdate(News.publish_date)
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block');
                blockNews.innerHTML = `
                    <div class="news-header">
                        <img class="server-status-icon" src="assets/images/icon.png">
                        <div class="header-text">
                            <div class="title">${News.title}</div>
                        </div>
                        <div class="date">
                            <div class="day">${date.day}</div>
                            <div class="month">${date.month}</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>${News.content.replace(/\n/g, '</br>')}</p>
                            <p class="news-author">Autor - <span>${News.author}</span></p>
                        </div>
                    </div>`
                newsElement.appendChild(blockNews);
            }
        } else {
            // Fallback for no news or error
            let blockNews = document.createElement('div');
            blockNews.classList.add('news-block');
            blockNews.innerHTML = `
                <div class="news-header">
                    <img class="server-status-icon" src="assets/images/icon.png">
                    <div class="header-text">
                        <div class="title">${news === false ? "Error." : "Aucune news n'est actuellement disponible."}</div>
                    </div>
                    <div class="date">
                        <div class="day">1</div>
                        <div class="month">Janvier</div>
                    </div>
                </div>
                <div class="news-content">
                    <div class="bbWrapper">
                        <p>${news === false ? "Impossible de contacter le serveur des news.</br>Merci de vérifier votre configuration." : "Vous pourrez suivre ici toutes les news relative au serveur."}</p>
                    </div>
                </div>`
            newsElement.appendChild(blockNews);
        }
    }

    // =========================================================================
    // MÉTODO MODIFICADO PARA REFORZAR LA SELECCIÓN DE INSTANCIA
    // =========================================================================
    async initInstanceSelection() {
        try {
            let configClient = await this.db.readData('configClient');
            let instancesList = await config.getInstanceList();
            
            if (!instancesList || instancesList.length === 0) {
                console.warn("No instances found. Cannot initialize selection.");
                return;
            }

            // 1. Encontrar la instancia actualmente seleccionada o null
            let currentInstance = instancesList.find(i => i.name == configClient?.instance_selct);
            let instanceSelect = configClient?.instance_selct;
            
            // 2. Establecer una instancia por defecto si la seleccionada no existe o no se ha definido
            if (!currentInstance) {
                let newInstanceSelect = instancesList.find(i => i.whitelistActive === false);
                
                // Fallback: Si no hay instancias sin whitelist, toma la primera.
                if (!newInstanceSelect && instancesList.length > 0) {
                    newInstanceSelect = instancesList[0];
                }

                if (newInstanceSelect) {
                    configClient.instance_selct = newInstanceSelect.name;
                    instanceSelect = newInstanceSelect.name;
                    await this.db.updateData('configClient', configClient);
                    currentInstance = newInstanceSelect; // Actualizar la instancia actual
                }
            }
            
            // 3. Ocultar la flecha si solo hay una instancia
            if (instancesList.length === 1) {
                const instanceSelectBtn = document.querySelector('.instance-select');
                // Se asume que el contenedor es '.play-instance' si el padre del botón no tiene el padding
                const playInstanceContainer = document.querySelector('.play-instance') || document.querySelector('.play-btn')?.parentElement; 
                
                if(instanceSelectBtn) instanceSelectBtn.style.display = 'none';
                if(playInstanceContainer) playInstanceContainer.style.paddingRight = '0';
            } else {
                // Asegurar que la flecha esté visible si hay múltiples instancias 
                const instanceSelectBtn = document.querySelector('.instance-select');
                if(instanceSelectBtn) instanceSelectBtn.style.display = ''; 
                // Restaurar padding si es necesario, asumiendo que el CSS lo maneja por defecto.
            }

            // 4. Set status for selected instance
            if (currentInstance) {
                setStatus(currentInstance.status);
            } else {
                 console.warn("Could not find a valid instance to select.");
            }

        } catch (e) {
            console.error("Error initializing instances:", e);
        }
    }
    // =========================================================================

    async openInstanceMenu() {
        let instancePopup = document.querySelector('.instance-popup');
        let instancesListPopup = document.querySelector('.instances-List');
        let configClient = await this.db.readData('configClient');
        let instanceSelect = configClient.instance_selct;
        let auth = await this.db.readData('accounts', configClient.account_selected);
        let instancesList = await config.getInstanceList();

        instancesListPopup.innerHTML = '';
        
        for (let instance of instancesList) {
            let showInstance = false;

            if (instance.whitelistActive) {
                // Modificación: Revisar si el nombre de la cuenta (auth?.name) está en la whitelist
                if (auth && instance.whitelist.some(whitelist => whitelist == auth.name)) {
                    showInstance = true;
                }
            } else {
                showInstance = true;
            }

            if (showInstance) {
                const isActive = instance.name == instanceSelect ? 'active-instance' : '';
                instancesListPopup.innerHTML += `<div id="${instance.name}" class="instance-elements ${isActive}">${instance.name}</div>`;
            }
        }
        
        // Usar la clase 'visible' para el efecto de fade-in
        instancePopup.style.display = 'flex';
        setTimeout(() => {
            instancePopup.classList.add('visible');
        }, 10); // Un pequeño delay para que CSS reconozca el cambio de display
    }

    async selectInstance(instanceName) {
        let configClient = await this.db.readData('configClient');
        let instancesList = await config.getInstanceList();
        let instancePopup = document.querySelector('.instance-popup');

        let activeInstanceSelect = document.querySelector('.active-instance');
        if (activeInstanceSelect) activeInstanceSelect.classList.remove('active-instance');
        
        const newSelectedElement = document.getElementById(instanceName);
        if(newSelectedElement) newSelectedElement.classList.add('active-instance');

        configClient.instance_selct = instanceName;
        await this.db.updateData('configClient', configClient);
        
        // Usar la clase 'visible' para el fade-out
        instancePopup.classList.remove('visible');
        setTimeout(() => {
            instancePopup.style.display = 'none';
        }, 500); // Esperar el final de la transición
        
        let options = instancesList.find(i => i.name == instanceName);
        if (options) await setStatus(options.status);
    }

    async startGame() {
        // Select elements
        let playInstanceBTN = document.querySelector('.play-instance');
        let infoStartingBOX = document.querySelector('.info-starting-game');
        let infoStarting = document.querySelector(".info-starting-game-text");
        let progressBar = document.querySelector('.progress-bar');
        
        // Desactivar el botón de jugar y mostrar el mensaje de "Conectando..." temporalmente
        if (playInstanceBTN) playInstanceBTN.style.display = "none";
        if (infoStartingBOX) infoStartingBOX.style.display = "block";
        if (infoStarting) infoStarting.innerHTML = `Conectando...`;
        
        try {
            let configClient = await this.db.readData('configClient');
            
            // =================================================================
            // CORRECCIÓN 1: Validar si hay una cuenta seleccionada
            // =================================================================
            if (!configClient?.account_selected) {
                 // Si no hay cuenta seleccionada, intenta forzar la selección de la primera cuenta disponible
                await this.initAccountSelection(); 
                configClient = await this.db.readData('configClient'); // Recargar configClient
            }
            
            // Validar si la cuenta seleccionada existe en la base de datos
            let authenticator = await this.db.readData('accounts', configClient?.account_selected);
            
            if (!authenticator) {
                // Volver a mostrar el botón de jugar ya que el lanzamiento falló
                if (playInstanceBTN) playInstanceBTN.style.display = "flex";
                if (infoStartingBOX) infoStartingBOX.style.display = "none";
                if (infoStarting) infoStarting.innerHTML = `Vérification`;
                
                let popupError = new popup();
                
                // Muestra el popup de login
                popupError.openPopup({
                    title: 'inicia sesion para jugar',
                    content: `<button class="btn-connexion" data-panel="login">Connexion</button>
                             <button class="btn-offline" data-panel="login">No premium (offline mode)</button>`,
                    color: 'var(--color-secondary)',
                    options: false 
                });
                
                // Llamar al método para adjuntar los listeners al pop-up
                this.addLoginPopupListeners(); 
                
                return; 
            }
            // =================================================================
            
            let instance = await config.getInstanceList();
            
            // =================================================================
            // CORRECCIÓN 2: Validar si la instancia seleccionada existe. Si no, forzar la selección
            // Esto corrige el error 'reading minecraft_version of undefined'
            // =================================================================
            let options = instance.find(i => i.name == configClient.instance_selct);

            if (!options) {
                console.error("No valid instance selected. Re-initializing instance selection...");
                await this.initInstanceSelection(); // Forzar re-inicialización
                
                // Recargar options después de la re-inicialización
                configClient = await this.db.readData('configClient');
                options = instance.find(i => i.name == configClient.instance_selct);
                
                if (!options) {
                    console.error("Critical: Cannot find a valid instance even after re-initialization.");
                    if (playInstanceBTN) playInstanceBTN.style.display = "flex";
                    if (infoStartingBOX) infoStartingBOX.style.display = "none";
                    return;
                }
            }
            // =================================================================

            let launch = new Launch();

            let opt = {
                url: options.url,
                authenticator: authenticator,
                timeout: 10000,
                path: `${await appdata()}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
                instance: options.name,
                version: options.loadder.minecraft_version,
                detached: configClient.launcher_config.closeLauncher == "close-all" ? false : true,
                downloadFileMultiple: configClient.launcher_config.download_multi,
                intelEnabledMac: configClient.launcher_config.intelEnabledMac,

                loader: {
                    type: options.loadder.loadder_type,
                    build: options.loadder.loadder_version,
                    enable: options.loadder.loadder_type == 'none' ? false : true
                },

                verify: options.verify,

                ignored: [...options.ignored],

                java: {
                    path: configClient.java_config.java_path,
                },

                JVM_ARGS: options.jvm_args ? options.jvm_args : [],
                GAME_ARGS: options.game_args ? options.game_args : [],

                screen: {
                    width: configClient.game_config.screen_size.width,
                    height: configClient.game_config.screen_size.height
                },

                memory: {
                    min: `${configClient.java_config.java_memory.min * 1024}M`,
                    max: `${configClient.java_config.java_memory.max * 1024}M`
                }
            }

            launch.Launch(opt);

            // Update UI to show proper loading state
            if (progressBar) progressBar.style.display = "";
            ipcRenderer.send('main-window-progress-load');
            if (infoStarting) infoStarting.innerHTML = `Verificando`; // Estado inicial de verificación/descarga

            launch.on('extract', extract => {
                ipcRenderer.send('main-window-progress-load');
                console.log(extract);
            });

            launch.on('progress', (progress, size) => {
                if (infoStarting) infoStarting.innerHTML = `Descargando ${((progress / size) * 100).toFixed(0)}%`;
                ipcRenderer.send('main-window-progress', { progress, size });
                if (progressBar) {
                    progressBar.value = progress;
                    progressBar.max = size;
                }
            });

            launch.on('check', (progress, size) => {
                if (infoStarting) infoStarting.innerHTML = `Vérificando ${((progress / size) * 100).toFixed(0)}%`;
                ipcRenderer.send('main-window-progress', { progress, size });
                if (progressBar) {
                    progressBar.value = progress;
                    progressBar.max = size;
                }
            });

            launch.on('estimated', (time) => {
                let hours = Math.floor(time / 3600);
                let minutes = Math.floor((time - hours * 3600) / 60);
                let seconds = Math.floor(time - hours * 3600 - minutes * 60);
                console.log(`${hours}h ${minutes}m ${seconds}s`);
            });

            launch.on('speed', (speed) => {
                console.log(`${(speed / 1067008).toFixed(2)} Mb/s`);
            });

            launch.on('patch', patch => {
                console.log(patch);
                ipcRenderer.send('main-window-progress-load');
                if (infoStarting) infoStarting.innerHTML = `Parche en curso`;
            });

            launch.on('data', (e) => {
                if (progressBar) progressBar.style.display = "none";
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-hide");
                };
                new logger('Minecraft', '#36b030');
                ipcRenderer.send('main-window-progress-load');
                if (infoStarting) infoStarting.innerHTML = `Iniciando Enena Chrismast`;
                console.log(e);
            });

            launch.on('close', code => {
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show");
                };
                ipcRenderer.send('main-window-progress-reset');
                if (infoStartingBOX) infoStartingBOX.style.display = "none";
                if (playInstanceBTN) playInstanceBTN.style.display = "flex";
                if (infoStarting) infoStarting.innerHTML = `Vérification`;
                new logger(pkg.name, '#7289da');
                console.log('Close');
            });

            launch.on('error', err => {
                let popupError = new popup();

                popupError.openPopup({
                    title: 'Erreur',
                    content: err.error || "Hay un error con el lanzamiento",
                    color: 'red',
                    options: true
                });

                // Reset UI on error
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show");
                };
                ipcRenderer.send('main-window-progress-reset');
                if (infoStartingBOX) infoStartingBOX.style.display = "none";
                if (playInstanceBTN) playInstanceBTN.style.display = "flex";
                if (infoStarting) infoStarting.innerHTML = `Vérification`;
                new logger(pkg.name, '#7289da');
                console.log(err);
            });

        } catch (error) {
            console.error("Critical error in startGame:", error);
            // Reset UI on crash
            if (playInstanceBTN) playInstanceBTN.style.display = "flex";
            if (infoStartingBOX) infoStartingBOX.style.display = "none";
        }
    }

    getdate(e) {
        let date = new Date(e);
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let allMonth = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return { year: year, month: allMonth[month - 1], day: day };
    }
}
export default Home;