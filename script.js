// File: script.js (per Leonardo Realtime con Edge Backend)

const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const transcriptionArea = document.getElementById('transcriptionArea');
const responseArea = document.getElementById('responseArea');

let socket;
let mediaRecorder;
// let audioChunks = []; // Non accumuliamo più, inviamo subito

const REALTIME_API_ENDPOINT_PATH = '/api/leonardo-realtime';

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socketURL = `${protocol}//${host}${REALTIME_API_ENDPOINT_PATH}`;

    statusMessage.textContent = `Connessione a: ${socketURL}`;
    console.log(`Tentativo di connessione WebSocket a: ${socketURL}`);
    responseArea.innerHTML = ''; 

    socket = new WebSocket(socketURL);
    socket.binaryType = "arraybuffer"; // Importante per ricevere audio come ArrayBuffer

    socket.onopen = () => {
        statusMessage.textContent = 'Connesso a Leonardo Realtime!';
        console.log('WebSocket Connesso!');
        startButton.disabled = false;
        stopButton.disabled = true;
        socket.send("Ciao dal Client! (Testo)"); // Invia un messaggio di testo di test
    };

    socket.onmessage = (event) => {
        let currentContent = responseArea.innerHTML;
        if (event.data instanceof ArrayBuffer) {
            console.log('Ricevuto ArrayBuffer audio dal server (dimensione):', event.data.byteLength);
            currentContent += `<i>Ricevuto ArrayBuffer audio (eco, dimensione: ${event.data.byteLength})</i><br>`;
            // Converti ArrayBuffer in Blob per la riproduzione
            const audioBlob = new Blob([event.data], { type: 'audio/webm' }); // Assumiamo webm per l'eco
            playAudio(audioBlob);
        } else if (typeof event.data === 'string') {
            console.log('Ricevuto testo dal server:', event.data);
            currentContent += `${event.data}<br>`;
        } else {
            console.log('Ricevuto messaggio di tipo sconosciuto:', event.data);
             currentContent += `<i>Ricevuto dato sconosciuto.</i><br>`;
        }
        responseArea.innerHTML = currentContent;
        responseArea.scrollTop = responseArea.scrollHeight; 
    };

    socket.onerror = (error) => {
        statusMessage.textContent = 'Errore WebSocket. Vedi console.';
        console.error('Errore WebSocket:', error);
        startButton.disabled = true;
    };

    socket.onclose = (event) => {
        statusMessage.textContent = 'WebSocket disconnesso.';
        console.log('WebSocket Disconnesso:', event.reason, `Codice: ${event.code}`);
        startButton.disabled = true;
    };
}

startButton.addEventListener('click', async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        statusMessage.textContent = 'WebSocket non connesso.';
        return;
    }

    statusMessage.textContent = 'Avvio registrazione...';
    startButton.disabled = true;
    stopButton.disabled = false;
    responseArea.innerHTML = ''; 
    transcriptionArea.textContent = "Stato: In attesa di audio...";


    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Prova con mimeType specifici se ci sono problemi, altrimenti lascia che il browser scelga
        const options = { mimeType: 'audio/webm;codecs=opus' }; 
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn(`${options.mimeType} non supportato, provo default.`);
            delete options.mimeType;
        }
        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    // MediaRecorder fornisce un Blob, convertiamolo in ArrayBuffer per inviarlo
                    // se il backend si aspetta ArrayBuffer, o invia il Blob direttamente
                    // se il backend sa gestire i Blob (vedi api/leonardo-realtime.js)
                    
                    // Invia come ArrayBuffer:
                    event.data.arrayBuffer().then(arrayBuffer => {
                        socket.send(arrayBuffer);
                        console.log('Chunk audio (ArrayBuffer) inviato al server (dimensione):', arrayBuffer.byteLength);
                        transcriptionArea.textContent = `Stato: Invio audio chunk (${arrayBuffer.byteLength} bytes)...`;
                    });
                    
                    // O invia come Blob (se il backend è stato adattato):
                    // socket.send(event.data); 
                    // console.log('Chunk audio (Blob) inviato al server (dimensione):', event.data.size);
                    // transcriptionArea.textContent = `Stato: Invio audio chunk (${event.data.size} bytes)...`;

                }
            }
        };

        mediaRecorder.onstop = () => {
            console.log('Registrazione fermata dal client.');
            transcriptionArea.textContent = "Stato: Registrazione fermata.";
            if (socket && socket.readyState === WebSocket.OPEN) {
                 socket.send(JSON.stringify({ type: "EndOfSpeech" })); // Segnale di fine
            }
            stream.getTracks().forEach(track => track.stop()); // Rilascia il microfono
        };
        
        mediaRecorder.start(300); // Intervallo in ms per ondataavailable
        transcriptionArea.textContent = "Stato: Registrazione avviata, invio audio...";
        console.log('MediaRecorder avviato, invia dati audio in streaming.');

    } catch (err) {
        console.error('Errore accesso al microfono o MediaRecorder:', err);
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
    statusMessage.textContent = 'Pronto per iniziare.';
    transcriptionArea.textContent = "";
});

function playAudio(audioBlob) {
    try {
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play()
            .then(() => console.log("Riproduzione audio ricevuto (probabilmente eco)..."))
            .catch(e => console.error("Errore durante audio.play():", e));
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };
        responseArea.innerHTML += `<i>Riproduzione eco audio...</i><br>`;
    } catch (e) {
        console.error("Errore durante la creazione o riproduzione dell'audio Blob:", e);
        responseArea.innerHTML += `<i>Errore riproduzione audio Blob.</i><br>`;
    }
}

// All'avvio della pagina
connectWebSocket();
startButton.disabled = true;
stopButton.disabled = true;
