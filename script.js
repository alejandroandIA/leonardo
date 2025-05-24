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

const INPUT_AUDIO_MIMETYPE = 'audio/webm;codecs=opus';
const INPUT_AUDIO_TIMESLICE_MS = 250;
const WEBSOCKET_ENDPOINT_PATH = '/api/leonardo-realtime';

function initializeWebSocket() {
    statusMessage.textContent = "Connessione a Leonardo...";
    startButton.disabled = true;
    stopButton.disabled = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socketURL = `${protocol}//${host}${WEBSOCKET_ENDPOINT_PATH}`;

    clientWebSocket = new WebSocket(socketURL);

    clientWebSocket.onopen = () => {
        statusMessage.textContent = 'Leonardo è pronto! Clicca "Parla".';
        startButton.disabled = false;
        stopButton.disabled = true;
    };

    clientWebSocket.onmessage = async (event) => {
        if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
            const audioData = event.data;
            const audioBlob = (audioData instanceof Blob) ? audioData : new Blob([audioData], {type: 'audio/opus'});
            audioQueue.push(audioBlob);
            playQueue();
        } else if (typeof event.data === 'string') {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "conversation.item.input_audio_transcription.delta" && data.delta) {
                    transcriptionArea.textContent = (transcriptionArea.textContent || "") + data.delta;
                } else if (data.type === "conversation.item.input_audio_transcription.completed" && data.transcript) {
                    transcriptionArea.textContent = data.transcript;
                    appendMessageToResponseArea(`<strong>Tu:</strong> ${data.transcript}`);
                } else if (data.type === "response.text.delta" && data.delta) {
                     let currentResponse = responseArea.querySelector('.leonardo-partial-response');
                     if (!currentResponse) {
                         currentResponse = document.createElement('div');
                         currentResponse.classList.add('leonardo-partial-response');
                         appendMessageToResponseArea('', 'info', currentResponse); // Aggiunge div vuoto
                     }
                     currentResponse.innerHTML = `<strong>Leonardo:</strong> ${(currentResponse.textContent.replace("Leonardo: ", "") || "") + data.delta}`;
                } else if (data.type === "response.done" && data.response && data.response.output) {
                    let finalResponseText = "";
                    data.response.output.forEach(outputItem => {
                        if (outputItem.type === "text") {
                            finalResponseText += outputItem.text;
                        }
                    });
                    let partialResponse = responseArea.querySelector('.leonardo-partial-response');
                    if (partialResponse) {
                        partialResponse.innerHTML = `<strong>Leonardo:</strong> ${finalResponseText}`;
                        partialResponse.classList.remove('leonardo-partial-response');
                    } else if (finalResponseText) {
                         appendMessageToResponseArea(`<strong>Leonardo:</strong> ${finalResponseText}`);
                    }
                } else if (data.type && data.type.toLowerCase().includes("error")) {
                    appendMessageToResponseArea(`<i>Errore da Leonardo: ${data.message || JSON.stringify(data)}</i>`, 'error');
                }
            } catch (e) {
                /* Messaggio non JSON o non gestito specificamente */
            }
        }
    };

    clientWebSocket.onerror = (error) => {
        statusMessage.textContent = 'Errore WebSocket. Controlla la console del browser.';
        console.error('Errore WebSocket:', error);
        enableStartButton();
    };

    clientWebSocket.onclose = (event) => {
        statusMessage.textContent = `Disconnesso da Leonardo. (Codice: ${event.code} - ${event.reason || 'Nessun motivo'})`;
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
        /* Errore già gestito */
    } finally {
        isPlaying = false;
        if (audioQueue.length > 0) {
            setTimeout(playQueue, 50);
        }
    }
}

function appendMessageToResponseArea(htmlContent, type = 'info', elementToUpdate = null) {
    if (elementToUpdate) {
        elementToUpdate.innerHTML = htmlContent;
    } else {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', `message-${type}`);
        messageDiv.innerHTML = htmlContent;
        responseArea.appendChild(messageDiv);
    }
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
    if (!clientWebSocket || clientWebSocket.readyState !== WebSocket.OPEN) {
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
            delete options.mimeType;
        }
        
        mediaRecorder = new MediaRecorder(stream, options);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && clientWebSocket && clientWebSocket.readyState === WebSocket.OPEN) {
                clientWebSocket.send(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            /* Se VAD è abilitato su OpenAI, non serve inviare 'input_audio_buffer.commit' o 'response.create' dal client
               a meno che non si voglia un controllo manuale esplicito. */
        };

        mediaRecorder.onerror = (event) => {
            console.error('Errore MediaRecorder:', event.error);
            statusMessage.textContent = `Errore MediaRecorder: ${event.error.name || event.error.message}`;
            enableStartButton();
        };
        
        mediaRecorder.start(INPUT_AUDIO_TIMESLICE_MS); 
    } catch (err) {
        console.error('Errore ottenimento microfono o avvio MediaRecorder:', err);
        statusMessage.textContent = `Errore microfono: ${err.message}.`;
        enableStartButton();
    }
});

stopButton.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    /* 
      Se VAD è abilitato su OpenAI, l'IA dovrebbe rilevare lo stop.
      Se vuoi forzare la fine del turno utente e la risposta dell'IA (con VAD disabilitato o per interruzione):
      if (clientWebSocket && clientWebSocket.readyState === WebSocket.OPEN) {
        clientWebSocket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        clientWebSocket.send(JSON.stringify({ type: "response.create" }));
      }
    */
    enableStartButton();
    statusMessage.textContent = 'Conversazione interrotta.';
    audioQueue = []; 
});

document.addEventListener('DOMContentLoaded', () => {
    enableStartButton();
    initializeWebSocket();
});
