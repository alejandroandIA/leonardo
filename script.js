const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const transcriptionArea = document.getElementById('transcriptionArea');
const responseArea = document.getElementById('responseArea');

let clientWebSocket;
let mediaRecorder;
let audioContext;
let audioQueue = [];
let isPlaying = false;
let userSpeaking = false;

const INPUT_AUDIO_MIMETYPE = 'audio/webm;codecs=opus';
const INPUT_AUDIO_TIMESLICE_MS = 250;
// const OUTPUT_AUDIO_SAMPLE_RATE = 24000; // Necessario se si lavora con PCM raw

const WEBSOCKET_ENDPOINT_PATH = '/api/leonardo-realtime';

function initializeWebSocket() {
    statusMessage.textContent = "Connessione a Leonardo...";
    startButton.disabled = true;
    stopButton.disabled = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socketURL = `${protocol}//${host}${WEBSOCKET_ENDPOINT_PATH}`;

    console.log(`Tentativo di connessione WebSocket a: ${socketURL}`);
    clientWebSocket = new WebSocket(socketURL);

    clientWebSocket.onopen = () => {
        statusMessage.textContent = 'Leonardo è pronto! Clicca "Parla".';
        console.log('WebSocket Connesso al backend Vercel!');
        startButton.disabled = false;
        stopButton.disabled = true;
    };

    clientWebSocket.onmessage = async (event) => {
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
            const audioData = event.data;
            const audioBlob = (audioData instanceof Blob) ? audioData : new Blob([audioData]);
            audioQueue.push(audioBlob);
            playQueue();
        } else if (typeof event.data === 'string') {
            console.log('Messaggio di testo/JSON ricevuto dal server:', event.data);
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'transcription_update' && data.transcript) {
                    transcriptionArea.textContent = data.transcript;
                } else if (data.type === 'final_transcription' && data.transcript) {
                    transcriptionArea.textContent = data.transcript;
                    appendMessageToResponseArea(`<strong>Tu:</strong> ${data.transcript}`);
                } else if (data.type === 'error' && data.message) {
                    console.error("Errore da Leonardo (server):", data.message);
                    statusMessage.textContent = `Errore: ${data.message}`;
                    appendMessageToResponseArea(`<i>Errore da Leonardo: ${data.message}</i>`, 'error');
                } else if (data.type === 'ai_status' && data.message) {
                    // Esempio: statusMessage.textContent = `Leonardo: ${data.message}`;
                }
            } catch (e) {
                console.warn('Messaggio di testo non-JSON ricevuto:', event.data);
            }
        }
    };

    clientWebSocket.onerror = (error) => {
        statusMessage.textContent = 'Errore WebSocket. Controlla la console.';
        console.error('Errore WebSocket:', error);
        enableStartButton();
    };

    clientWebSocket.onclose = (event) => {
        statusMessage.textContent = `Disconnesso da Leonardo. (Codice: ${event.code})`;
        console.log('WebSocket Disconnesso:', event.reason, `Codice: ${event.code}`);
        enableStartButton();
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    };
}

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

async function playAudioData(audioBlob) {
    const context = getAudioContext();
    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await context.decodeAudioData(arrayBuffer);
        
        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(context.destination);
        source.start();

        return new Promise((resolve) => {
            source.onended = resolve;
        });
    } catch (e) {
        console.error("Errore durante la decodifica o riproduzione dell'audio:", e);
        appendMessageToResponseArea(`<i>Errore riproduzione audio: ${e.message}</i>`, 'error');
        throw e;
    }
}

async function playQueue() {
    if (isPlaying || audioQueue.length === 0) {
        return;
    }
    isPlaying = true;
    const blobToPlay = audioQueue.shift();
    
    try {
        await playAudioData(blobToPlay);
    } catch (e) {
        // Errore già gestito e loggato da playAudioData
    } finally {
        isPlaying = false;
        if (audioQueue.length > 0) {
            setTimeout(playQueue, 50);
        } else {
            console.log("Coda audio IA esaurita.");
        }
    }
}

function appendMessageToResponseArea(htmlContent, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `message-${type}`);
    messageDiv.innerHTML = htmlContent;
    responseArea.appendChild(messageDiv);
    responseArea.scrollTop = responseArea.scrollHeight;
}

function disableStartButton() {
    startButton.disabled = true;
    stopButton.disabled = false;
}

function enableStartButton() {
    startButton.disabled = false;
    stopButton.disabled = true;
}

startButton.addEventListener('click', async () => {
    userSpeaking = true;
    if (!clientWebSocket || clientWebSocket.readyState !== WebSocket.OPEN) {
        statusMessage.textContent = 'WebSocket non connesso. Tentativo di riconnessione...';
        initializeWebSocket();
        return;
    }
    
    statusMessage.textContent = 'Avvio registrazione... Parla ora!';
    disableStartButton();
    transcriptionArea.textContent = "";

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const options = { mimeType: INPUT_AUDIO_MIMETYPE };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn(`${options.mimeType} non supportato, provo con il default del browser.`);
            delete options.mimeType;
        }
        
        mediaRecorder = new MediaRecorder(stream, options);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && clientWebSocket && clientWebSocket.readyState === WebSocket.OPEN) {
                clientWebSocket.send(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log('Registrazione locale fermata.');
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.onerror = (event) => {
            console.error('Errore MediaRecorder:', event.error);
            statusMessage.textContent = `Errore MediaRecorder: ${event.error.name || event.error.message}`;
            enableStartButton();
        };
        
        mediaRecorder.start(INPUT_AUDIO_TIMESLICE_MS); 

    } catch (err) {
        console.error('Errore ottenimento microfono o avvio MediaRecorder:', err);
        statusMessage.textContent = `Errore microfono: ${err.message}. Assicurati di aver dato i permessi.`;
        enableStartButton();
    }
});

stopButton.addEventListener('click', () => {
    userSpeaking = false;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    enableStartButton();
    statusMessage.textContent = 'Conversazione interrotta. Clicca "Parla" per ricominciare.';
    audioQueue = []; 
});

document.addEventListener('DOMContentLoaded', () => {
    enableStartButton();
    initializeWebSocket();
});
