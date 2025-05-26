const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('status');
const transcriptsDiv = document.getElementById('transcripts');
const aiAudioPlayer = document.getElementById('aiAudioPlayer');

const MODEL_NAME = "gpt-4o-realtime-preview-2024-12-17";
const SESSION_API_ENDPOINT = "/api/session";
const SAVE_MEMORY_API_ENDPOINT = "/api/saveToMemory";
const SEARCH_MEMORY_API_ENDPOINT = "/api/searchMemory";

let pc;
let dc;
let localStream;
let currentAIResponseId = null;
let currentConversationHistory = [];

async function getEphemeralToken() {
    statusDiv.textContent = "Richiesta token di sessione...";
    try {
        const response = await fetch(SESSION_API_ENDPOINT);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Errore dal backend (${response.status}): ${errorData.error || 'Errore sconosciuto'}`);
        }
        const data = await response.json();
        if (!data.client_secret) {
             throw new Error('Token non ricevuto dal backend.');
        }
        return data.client_secret;
    } catch (error) {
        console.error("Errore durante il recupero del token effimero:", error);
        statusDiv.textContent = `Errore token: ${error.message}`;
        throw error;
    }
}

async function startConversation() {
    startButton.disabled = true;
    stopButton.disabled = false;
    statusDiv.textContent = "Avvio conversazione...";
    transcriptsDiv.innerHTML = "";
    currentAIResponseId = null;
    currentConversationHistory = [];
    console.log("DEBUG: Nuova conversazione iniziata, currentConversationHistory resettato.");

    try {
        const ephemeralKey = await getEphemeralToken();
        if (!ephemeralKey) {
            stopConversation();
            return;
        }

        pc = new RTCPeerConnection();

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                aiAudioPlayer.srcObject = event.streams[0];
                aiAudioPlayer.play().catch(e => console.warn("AI Audio play GIA' IN CORSO o INTERROTTO:", e));
            }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            statusDiv.textContent = "Microfono attivato.";
        } catch (err) {
            console.error("Errore accesso al microfono:", err);
            statusDiv.textContent = "Errore accesso microfono. Controlla permessi.";
            stopConversation();
            return;
        }

        dc = pc.createDataChannel("oai-events", { ordered: true });
        dc.onopen = () => {
            statusDiv.textContent = "Connesso. In attesa...";
            sendClientEvent({
                type: "session.update",
                session: {
                    instructions: "Sei un assistente AI amichevole e conciso. Rispondi in italiano. Puoi cercare nelle conversazioni passate se ti viene chiesto di ricordare qualcosa, usando lo strumento 'cerca_nella_mia_memoria_personale'.",
                    turn_detection: {
                        type: "server_vad",
                        threshold: 0.5,
                        silence_duration_ms: 800,
                        create_response: true,
                    },
                    tools: [{
                        type: "function",
                        name: "cerca_nella_mia_memoria_personale",
                        description: "Cerca nelle conversazioni passate dell'utente per trovare informazioni specifiche o rispondere a domande su eventi precedenti.",
                        parameters: {
                            type: "object",
                            properties: {
                                termini_di_ricerca: {
                                    type: "string",
                                    description: "Le parole chiave o la domanda specifica da cercare nella cronologia delle conversazioni passate."
                                }
                            },
                            required: ["termini_di_ricerca"]
                        }
                    }]
                }
            });
        };
        dc.onmessage = (event) => {
            try {
                handleServerEvent(JSON.parse(event.data));
            } catch (e) {
                console.error("Errore parsing messaggio server:", e, "Dati:", event.data);
            }
        };
        dc.onclose = () => {
            console.log("DEBUG: Data channel chiuso.");
        };
        dc.onerror = (error) => {
            console.error("Errore Data channel:", error);
            statusDiv.textContent = "Errore Data channel.";
        };

        pc.onicecandidate = (event) => {};

        pc.onconnectionstatechange = () => {
            console.log(`DEBUG: Stato connessione WebRTC: ${pc.connectionState}`);
            if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
                statusDiv.textContent = `Connessione WebRTC: ${pc.connectionState}. Prova a riavviare.`;
                if (pc.connectionState !== "closed") {
                    console.log("DEBUG: Connessione WebRTC persa, tento salvataggio e stop.");
                    saveCurrentSessionHistoryAndStop();
                }
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        statusDiv.textContent = "Offerta SDP creata. Connessione a OpenAI...";

        const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${MODEL_NAME}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                "Authorization": `Bearer ${ephemeralKey}`,
                "Content-Type": "application/sdp"
            },
        });

        if (!sdpResponse.ok) {
            const errorText = await sdpResponse.text();
            throw new Error(`Errore SDP OpenAI (${sdpResponse.status}): ${errorText}`);
        }

        const answerSdp = await sdpResponse.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    } catch (error) {
        console.error("Errore durante l'avvio della conversazione:", error);
        statusDiv.textContent = `Errore avvio: ${error.message}`;
        stopConversation();
    }
}

async function saveCurrentSessionHistoryAndStop() {
    console.log("DEBUG (saveCurrentSessionHistoryAndStop): Funzione CHIAMATA!");
    console.log("DEBUG (saveCurrentSessionHistoryAndStop): Contenuto di currentConversationHistory PRIMA del salvataggio:", JSON.stringify(currentConversationHistory, null, 2));

    if (currentConversationHistory.length > 0) {
        statusDiv.textContent = "Salvataggio conversazione...";
        console.log("DEBUG (saveCurrentSessionHistoryAndStop): Inizio ciclo di salvataggio...");
        let entriesSaved = 0;
        for (const entry of currentConversationHistory) {
            console.log("DEBUG (saveCurrentSessionHistoryAndStop): Analizzo entry per salvataggio:", JSON.stringify(entry));

            const isValidForSaving = entry &&
                                     typeof entry.speaker === 'string' && entry.speaker.trim() !== '' &&
                                     typeof entry.content === 'string' && entry.content.trim() !== '';

            if (!isValidForSaving) {
                console.warn("DEBUG (saveCurrentSessionHistoryAndStop - SALTO ENTRY): Entry non valida o con speaker/content vuoto:", entry);
                continue;
            }

            console.log("DEBUG (saveCurrentSessionHistoryAndStop): Tento di salvare entry VALIDA:", JSON.stringify(entry));
            try {
                const requestBody = { speaker: entry.speaker, content: entry.content };
                console.log("DEBUG (saveCurrentSessionHistoryAndStop): Corpo della richiesta a saveToMemory:", JSON.stringify(requestBody));

                const saveResponse = await fetch(SAVE_MEMORY_API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!saveResponse.ok) {
                    const errorData = await saveResponse.json().catch(() => ({ error: "Errore sconosciuto nel salvataggio", details: `Status: ${saveResponse.status}` }));
                    console.error(`DEBUG (saveCurrentSessionHistoryAndStop): Errore dal server saveToMemory (${saveResponse.status}):`, errorData, "Per entry:", entry);
                } else {
                    entriesSaved++;
                    console.log(`DEBUG (saveCurrentSessionHistoryAndStop): Messaggio "${entry.content.substring(0,20)}..." salvato.`);
                }
            } catch (saveError) {
                console.error("DEBUG (saveCurrentSessionHistoryAndStop): Errore fetch durante il salvataggio:", saveError, "Per entry:", entry);
            }
        }
        console.log(`DEBUG (saveCurrentSessionHistoryAndStop): Fine ciclo di salvataggio. ${entriesSaved} entries inviate per il salvataggio.`);
        currentConversationHistory = [];
        console.log("DEBUG (saveCurrentSessionHistoryAndStop): currentConversationHistory resettato dopo il tentativo di salvataggio.");
        statusDiv.textContent = "Tentativo di salvataggio completato.";
    } else {
        console.log("DEBUG (saveCurrentSessionHistoryAndStop): currentConversationHistory è vuoto, nessun salvataggio necessario.");
        statusDiv.textContent = "Nessuna conversazione da salvare.";
    }
    stopConversation(); // Chiama stopConversation in ogni caso per pulire
}

function stopConversation() {
    console.log("DEBUG (stopConversation): Funzione CHIAMATA!");
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        console.log("DEBUG (stopConversation): Tracce localStream fermate.");
    }
    if (dc && dc.readyState !== "closed") {
        dc.close();
        console.log("DEBUG (stopConversation): Data channel chiuso.");
    }
    dc = null;
    if (pc && pc.connectionState !== "closed") {
        pc.close();
        console.log("DEBUG (stopConversation): PeerConnection chiuso.");
    }
    pc = null;

    startButton.disabled = false;
    stopButton.disabled = true;
    statusDiv.textContent = "Conversazione terminata. Pronto per iniziare una nuova.";
    if (aiAudioPlayer) aiAudioPlayer.srcObject = null;
    currentAIResponseId = null;
    console.log("DEBUG (stopConversation): Stato UI resettato.");
}

function sendClientEvent(event) {
    if (dc && dc.readyState === "open") {
        dc.send(JSON.stringify(event));
    }
}

function addTranscript(speaker, textContent, itemId) {
    console.log(`DEBUG (addTranscript - ENTRATA): Speaker='${speaker}', textContent='${textContent ? textContent.substring(0,30) : "N/A"}...', typeof textContent='${typeof textContent}', itemId='${itemId}'`);

    const id = `${speaker}-${itemId || 'general'}`;
    let transcriptDiv = document.getElementById(id);
    if (!transcriptDiv) {
        transcriptDiv = document.createElement('div');
        transcriptDiv.id = id;
        transcriptDiv.className = speaker.toLowerCase();
        transcriptsDiv.appendChild(transcriptDiv);
    }
    transcriptDiv.textContent = `${speaker}: ${textContent}`;
    transcriptsDiv.scrollTop = transcriptsDiv.scrollHeight;

    if ((speaker === "Tu" || speaker === "AI") && typeof textContent === 'string' && textContent.trim() !== '') {
        console.log(`DEBUG (addTranscript - AGGIUNGO A HISTORY): Speaker: ${speaker}, Content: "${textContent.substring(0, 30)}..."`);
        currentConversationHistory.push({ speaker, content: textContent });
    } else {
        console.warn(`DEBUG (addTranscript - SALTO HISTORY): Testo non valido/vuoto o speaker non tracciato. Speaker: ${speaker}, textContent='${textContent}', typeof textContent='${typeof textContent}'`);
    }
}

function appendToTranscript(speaker, textDelta, itemId) {
    console.log(`DEBUG (appendToTranscript - ENTRATA): Speaker='${speaker}', textDelta='${textDelta ? textDelta.substring(0,30) : "N/A"}...', typeof textDelta='${typeof textDelta}', itemId='${itemId}'`);

    const id = `${speaker}-${itemId || 'general'}`;
    let transcriptDiv = document.getElementById(id);
    let isNewVisualEntry = false;

    if (!transcriptDiv) {
        transcriptDiv = document.createElement('div');
        transcriptDiv.id = id;
        transcriptDiv.className = speaker.toLowerCase();
        transcriptDiv.textContent = `${speaker}: `;
        transcriptsDiv.appendChild(transcriptDiv);
        isNewVisualEntry = true;
    }
    transcriptDiv.textContent += textDelta;
    transcriptsDiv.scrollTop = transcriptsDiv.scrollHeight;

    if (speaker === "AI") {
        const lastEntryInHistory = currentConversationHistory.length > 0 ? currentConversationHistory[currentConversationHistory.length - 1] : null;

        // Se è una nuova entry visuale per l'AI OPPURE se l'ultima entry in history non è dell'AI,
        // significa che dobbiamo creare una nuova entry AI in history.
        // Questo accade solitamente con il primo delta di una nuova risposta AI.
        if (isNewVisualEntry || !lastEntryInHistory || lastEntryInHistory.speaker !== "AI") {
            if (typeof textDelta === 'string' && textDelta.trim() !== '') {
                console.log(`DEBUG (appendToTranscript - NUOVA AI ENTRY IN HISTORY): Delta: "${textDelta.substring(0,30)}..."`);
                currentConversationHistory.push({ speaker: "AI", content: textDelta });
            } else if (typeof textDelta === 'string' && textDelta.trim() === '') {
                 // Ricevuto un delta vuoto per una "nuova" entry AI. Potrebbe essere un placeholder.
                 // Non lo aggiungiamo ancora all'history, aspettiamo un delta con contenuto.
                 console.log(`DEBUG (appendToTranscript - NUOVA AI ENTRY CON DELTA VUOTO): Non aggiungo a history. Delta: "${textDelta}"`);
            } else {
                console.warn(`DEBUG (appendToTranscript - NUOVA AI ENTRY CON DELTA NON STRINGA): Non aggiungo a history. Delta: ${textDelta}, typeof: ${typeof textDelta}`);
            }
        }
        // Se l'ultima entry in history è già dell'AI, e il delta è valido, appendiamo.
        else if (lastEntryInHistory && lastEntryInHistory.speaker === "AI") {
            if (typeof textDelta === 'string' && textDelta.trim() !== '') {
                console.log(`DEBUG (appendToTranscript - APPENDO AD AI IN HISTORY): Delta: "${textDelta.substring(0,30)}..."`);
                lastEntryInHistory.content += textDelta;
            } else if (typeof textDelta === 'string' && textDelta.trim() === '') {
                 console.log(`DEBUG (appendToTranscript - AI DELTA VUOTO PER APPEND, IGNORO): Delta: "${textDelta}"`);
            } else {
                console.warn(`DEBUG (appendToTranscript - AI DELTA NON STRINGA PER APPEND, IGNORO): Delta: ${textDelta}, typeof: ${typeof textDelta}`);
            }
        }
    }
}


async function handleFunctionCall(functionCall) {
    if (functionCall.name === "cerca_nella_mia_memoria_personale") {
        statusDiv.textContent = "Ok, fammi cercare nei miei ricordi...";
        console.log("DEBUG (handleFunctionCall): Chiamo cerca_nella_mia_memoria_personale. Call ID:", functionCall.call_id);
        try {
            const args = JSON.parse(functionCall.arguments);
            const searchQuery = args.termini_di_ricerca;
            console.log("DEBUG (handleFunctionCall): Termini di ricerca per la memoria:", searchQuery);

            addTranscript("Sistema", `Ricerca in memoria per: "${searchQuery}"`, functionCall.call_id);

            const searchResponse = await fetch(`${SEARCH_MEMORY_API_ENDPOINT}?query=${encodeURIComponent(searchQuery)}`);
            if (!searchResponse.ok) {
                const errorData = await searchResponse.json().catch(() => ({error: "Errore sconosciuto dal server ricerca memoria"}));
                console.error("DEBUG (handleFunctionCall): Errore da searchMemory API:", errorData);
                throw new Error(`Errore dal server di ricerca memoria: ${searchResponse.status}`);
            }
            const searchData = await searchResponse.json();
            console.log("DEBUG (handleFunctionCall): Risultati da searchMemory API:", searchData);

            const functionOutput = JSON.stringify({ results: searchData.results || "Non ho trovato nulla per quei termini." });
            addTranscript("Sistema", `Risultato ricerca: ${searchData.results || "Nessun risultato."}`, functionCall.call_id);

            sendClientEvent({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: functionCall.call_id,
                    output: functionOutput
                }
            });
            sendClientEvent({ type: "response.create" });
            statusDiv.textContent = "Ho cercato. Ora formulo una risposta...";

        } catch (e) {
            console.error("DEBUG (handleFunctionCall): Errore durante la chiamata di funzione searchMemory (catch):", e);
            addTranscript("Sistema", `Errore durante la ricerca: ${e.message}`, functionCall.call_id);
            sendClientEvent({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: functionCall.call_id,
                    output: JSON.stringify({ error: "Non sono riuscito a cercare nella memoria in questo momento." })
                }
            });
            sendClientEvent({ type: "response.create" });
            statusDiv.textContent = "Errore nella ricerca memoria. Provo a rispondere comunque.";
        }
    }
}

function handleServerEvent(event) {
    console.log("DEBUG (handleServerEvent): Ricevuto evento server:", event.type, event);
    switch (event.type) {
        case "session.created":
            statusDiv.textContent = `Sessione ${event.session.id.slice(-4)} creata. Parla pure!`;
            break;
        case "session.updated":
            break;
        case "input_audio_buffer.speech_started":
            statusDiv.textContent = "Ti sto ascoltando...";
            break;
        case "input_audio_buffer.speech_stopped":
            statusDiv.textContent = "Elaborazione audio... Attendo risposta AI...";
            break;
        case "conversation.item.input_audio_transcription.completed":
            console.log("DEBUG (handleServerEvent - transcription.completed): event.transcript =", event.transcript, "typeof =", typeof event.transcript);
            if (event.transcript) {
                addTranscript("Tu", event.transcript, event.item_id);
            }
            break;
        case "response.created":
            currentAIResponseId = event.response.id;
            console.log("DEBUG (handleServerEvent - response.created): currentAIResponseId impostato a", currentAIResponseId);
            // Non chiamiamo appendToTranscript con stringa vuota qui.
            // Aspettiamo il primo delta per creare/aggiornare l'entry in history.
            statusDiv.textContent = "AI sta elaborando...";
            break;
        case "response.text.delta":
            console.log("DEBUG (handleServerEvent - response.text.delta): event.delta =", event.delta, "typeof =", typeof event.delta, "response_id:", event.response_id);
            if (typeof event.delta === 'string') { // Controlliamo se è una stringa, anche vuota
                appendToTranscript("AI", event.delta, event.response_id || currentAIResponseId);
                 statusDiv.textContent = "AI sta rispondendo...";
            } else {
                console.warn("DEBUG (handleServerEvent - response.text.delta): Delta non è una stringa:", event.delta);
            }
            break;
        case "response.done":
            console.log("DEBUG (handleServerEvent - response.done): Risposta AI completata. Response ID:", event.response.id);
            if (event.response.output && event.response.output.length > 0 && event.response.output[0].type === "function_call") {
                console.log("DEBUG (handleServerEvent - response.done): Rilevata function_call.");
                const functionCall = event.response.output[0];
                handleFunctionCall(functionCall);
            } else {
                statusDiv.textContent = "Risposta AI completata. Parla pure!";
            }
            currentAIResponseId = null;
            break;
        case "error":
            console.error("Errore dal server OpenAI:", event);
            statusDiv.textContent = `Errore OpenAI: ${event.message || event.code || 'Errore sconosciuto'}`;
            if (event.code === "session_expired" || event.code === "token_expired" || event.code === "session_not_found" || event.code === "connection_closed") {
                console.log("DEBUG (handleServerEvent - error): Errore di sessione/token, tento salvataggio e stop.");
                saveCurrentSessionHistoryAndStop();
            }
            break;
        default:
            break;
    }
}

stopButton.addEventListener('click', () => {
    console.log("DEBUG: Pulsante STOP premuto.");
    saveCurrentSessionHistoryAndStop();
});
startButton.addEventListener('click', startConversation);

window.addEventListener('beforeunload', () => {
    console.log("DEBUG: Evento 'beforeunload' rilevato.");
    if (pc && pc.connectionState !== "closed") {
        console.log("DEBUG (beforeunload): Connessione WebRTC attiva, chiamo stopConversation.");
        // Non chiamare saveCurrentSessionHistoryAndStop() qui perché è sincrono e potrebbe non completare.
        // La chiusura della connessione dovrebbe già triggerare il salvataggio se necessario.
        stopConversation(); // Pulisce le risorse
    }
});
