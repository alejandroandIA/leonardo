// File: script.js (per Leonardo Realtime)

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const transcriptionArea = document.getElementById('transcriptionArea'); // Potremmo non usarlo subito
const responseArea = document.getElementById('responseArea');       // Potremmo non usarlo subito

let socket;
let mediaRecorder;
let audioChunks = [];

const REALTIME_API_ENDPOINT_PATH = '/api/leonardo-realtime'; // Il percorso del nostro backend WebSocket

function connectWebSocket() {
    // Determina il protocollo WebSocket (ws o wss) e l'host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socketURL = `${protocol}//${host}${REALTIME_API_ENDPOINT_PATH}`;

    statusMessage.textContent = `Tentativo di connessione a: ${socketURL}`;
    console.log(`Tentativo di connessione WebSocket a: ${socketURL}`);

    socket = new WebSocket(socketURL);

    socket.onopen = () => {
        statusMessage.textContent = 'Connesso a Leonardo Realtime! Pronto per parlare.';
        console.log('WebSocket Connesso!');
        startButton.disabled = false;
        stopButton.disabled = true;
    };

    socket.onmessage = (event) => {
        // Qui riceveremo l'audio dalla IA o altri messaggi
        // Per ora, facciamo solo un log
        console.log('Messaggio ricevuto dal server:', event.data);
        // In futuro, se event.data è un Blob audio, lo riprodurremo
        if (event.data instanceof Blob) {
            playAudio(event.data);
        } else {
            // Se è testo (es. trascrizioni o messaggi di stato)
            responseArea.textContent = `Leonardo (server): ${event.data}`;
        }
    };

    socket.onerror = (error) => {
        statusMessage.textContent = 'Errore WebSocket. Vedi console.';
        console.error('Errore WebSocket:', error);
        startButton.disabled = true; // Disabilita se non possiamo connetterci
    };

    socket.onclose = (event) => {
        statusMessage.textContent = 'WebSocket disconnesso. Riprova a connetterti?';
        console.log('WebSocket Disconnesso:', event.reason, `Codice: ${event.code}`);
        startButton.disabled = true;
        // Potremmo tentare una riconnessione automatica qui o fornire un pulsante
    };
}

startButton.addEventListener('click', async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        statusMessage.textContent = 'WebSocket non connesso. Tentativo di riconnessione...';
        connectWebSocket(); // Prova a connetterti se non lo sei
        return;
    }

    statusMessage.textContent = 'Avvio registrazione...';
    startButton.disabled = true;
    stopButton.disabled = false;
    audioChunks = [];

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                // Invio immediato del chunk audio via WebSocket
                // socket.send(event.data); // <--- LO ABILITEREMO NEL PROSSIMO STEP
                console.log('Chunk audio registrato, pronto per essere inviato (invio disabilitato per ora)');
            }
        };

        mediaRecorder.onstop = () => {
            // Questo blocco non è più il principale per l'invio se inviamo in streaming
            // Ma può essere utile per inviare un segnale di "fine parlato"
            console.log('Registrazione fermata.');
            if (socket && socket.readyState === WebSocket.OPEN) {
                 // socket.send(JSON.stringify({ type: "EndOfSpeech" })); // Segnale di fine (futuro)
            }
            // Per ora, non facciamo nulla qui con i chunk accumulati se inviamo in streaming
        };

        mediaRecorder.start(500); // Invia dati ogni 500ms (o un altro intervallo)
                                // Questo abilita lo streaming dal client
        console.log('MediaRecorder avviato, invia dati ogni 500ms.');

    } catch (err) {
        console.error('Errore accesso al microfono:', err);
        statusMessage.textContent = 'Errore microfono. Controlla i permessi.';
        startButton.disabled = false;
        stopButton.disabled = true;
    }
});

stopButton.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusMessage.textContent = 'Registrazione interrotta. Pronto per iniziare.';
});

function playAudio(audioBlob) {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
    audio.onended = () => {
        URL.revokeObjectURL(audioUrl); // Pulisce la memoria
    };
    console.log("Riproduzione audio IA...");
}

// All'avvio della pagina, prova a connettere il WebSocket
connectWebSocket();
startButton.disabled = true; // Inizia disabilitato finché il WS non è connesso
stopButton.disabled = true;
