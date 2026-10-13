document.addEventListener('DOMContentLoaded', function() {
    const welcomeScreen = document.getElementById('welcome-screen');
    const playerContainer = document.getElementById('player-container');
    const welcomeFileInput = document.getElementById('welcome-file-input');
    const fileInput = document.getElementById('audio-file-input');
    const audioElement = document.getElementById('audio-element');
    const playBtn = document.getElementById('play-btn');
    const songTitle = document.getElementById('song-title');
    const songArtist = document.getElementById('song-artist');
    const audioQualityEl = document.getElementById('audio-quality');
    const coverContainer = document.getElementById('cover-art');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const currentTimeEl = document.getElementById('current-time');
    const durationTimeEl = document.getElementById('duration-time');
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const liveClock = document.getElementById('live-clock');

    let audioContext = null;
    let analyser = null;
    let source = null;
    let isInitialized = false;

    const totalBars = 6;
    let currentHeights = new Array(totalBars).fill(0);

    // Reloj local en tiempo real
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        liveClock.textContent = `${hours}:${minutes}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    welcomeFileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));

    function updatePlayButtonState() {
        if (audioElement.paused) {
            playBtn.textContent = "▶ Reproducir";
            playBtn.classList.remove('is-playing');
        } else {
            playBtn.textContent = "⏸ Pausar";
            playBtn.classList.add('is-playing');
        }
    }

    function handleFileSelection(file) {
        if (!file) return;

        welcomeScreen.classList.add('fade-out');
        playerContainer.classList.remove('hidden');

        songTitle.textContent = file.name;
        songArtist.textContent = "Artista desconocido";
        
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const fileExt = file.name.split('.').pop().toUpperCase();
        audioQualityEl.textContent = `${fileExt} • ${fileSizeMB} MB`;

        coverContainer.innerHTML = '<div class="default-cover">♪</div>';

        const fileURL = URL.createObjectURL(file);
        audioElement.src = fileURL;

        // Lectura de metadatos directamente en el navegador con jsmediatags
        window.jsmediatags.read(file, {
            onSuccess: function(tag) {
                const data = tag.tags;
                if (data.title) songTitle.textContent = data.title;
                if (data.artist) {
                    songArtist.textContent = data.artist;
                    if (data.album) songArtist.textContent += ` • ${data.album}`;
                } else if (data.album) {
                    songArtist.textContent = data.album;
                }

                if (data.picture) {
                    const base64String = byteArrayToBase64(data.picture.data);
                    const imageType = data.picture.format || 'image/jpeg';
                    coverContainer.innerHTML = `<img src="data:${imageType};base64,${base64String}" alt="Portada">`;
                }
            },
            onError: function(error) {
                console.log("No se pudieron leer etiquetas avanzadas en navegador:", error);
            }
        });

        audioElement.load();
        audioElement.play().then(() => {
            updatePlayButtonState();
            initAudioVisualizer();
        }).catch(err => {
            console.log("Autoplay bloqueado:", err);
            updatePlayButtonState();
        });
    }

    playBtn.addEventListener('click', function() {
        if (audioElement.paused) {
            audioElement.play();
            initAudioVisualizer();
        } else {
            audioElement.pause();
        }
        updatePlayButtonState();
    });

    audioElement.addEventListener('timeupdate', function() {
        if (audioElement.duration) {
            const progressPercent = (audioElement.currentTime / audioElement.duration) * 100;
            progressBar.style.width = `${progressPercent}%`;

            currentTimeEl.textContent = formatTime(audioElement.currentTime);
            
            const timeLeft = audioElement.duration - audioElement.currentTime;
            durationTimeEl.textContent = `-${formatTime(timeLeft)}`;
        }
    });

    progressContainer.addEventListener('click', function(e) {
        const width = this.clientWidth;
        const clickX = e.offsetX;
        const duration = audioElement.duration;
        if (duration) {
            audioElement.currentTime = (clickX / width) * duration;
        }
    });

    audioElement.addEventListener('ended', function() {
        updatePlayButtonState();
        progressBar.style.width = '0%';
    });

    function initAudioVisualizer() {
        if (isInitialized) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaElementSource(audioElement);
            
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            
            analyser.fftSize = 128;
            analyser.minDecibels = -90;
            analyser.maxDecibels = -10;
            analyser.smoothingTimeConstant = 0.65;
            
            isInitialized = true;
            renderVisualizer();
        } catch (e) {
            console.log("Error inicializando visualizador:", e);
        }
    }

    function renderVisualizer() {
        requestAnimationFrame(renderVisualizer);

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

        const targetHeights = new Array(totalBars).fill(0);

        if (analyser && !audioElement.paused && audioElement.volume > 0) {
            const rawData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(rawData);
            
            for (let i = 0; i < totalBars; i++) {
                const value = (rawData[i * 2] || 0) * 1.3;
                targetHeights[i] = Math.min((value / 255) * (canvas.height / 2 - 2), canvas.height / 2 - 2);
            }
        } else {
            targetHeights.fill(0);
        }

        const spacing = 5;
        const totalSpacing = spacing * (totalBars - 1);
        const barWidth = (canvas.width - totalSpacing) / totalBars;
        const centerY = canvas.height / 2;
        const radius = barWidth / 2;

        canvasCtx.fillStyle = '#ff0055';

        for (let i = 0; i < totalBars; i++) {
            currentHeights[i] += (targetHeights[i] - currentHeights[i]) * 0.12;

            const h = Math.max(currentHeights[i], 0);
            const x = i * (barWidth + spacing);

            if (h < 0.8) {
                canvasCtx.beginPath();
                canvasCtx.arc(x + radius, centerY, radius, 0, Math.PI * 2);
                canvasCtx.fill();
            } else {
                const barHeight = Math.max(h * 2, barWidth);
                const y = centerY - (barHeight / 2);

                canvasCtx.beginPath();
                if (typeof canvasCtx.roundRect === 'function') {
                    canvasCtx.roundRect(x, y, barWidth, barHeight, radius);
                } else {
                    canvasCtx.rect(x, y, barWidth, barHeight);
                }
                canvasCtx.fill();
            }
        }
    }

    renderVisualizer();

    function byteArrayToBase64(byteArray) {
        let binary = '';
        const len = byteArray.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(byteArray[i]);
        }
        return window.btoa(binary);
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
});