 // File: script.js (Modificato per Autenticazione a Token Ably)

 const startButton = document.getElementById('startButton');
 const stopButton = document.getElementById('stopButton');
 const statusMessage = document.getElementById('statusMessage');
 const transcriptionArea = document.getElementById('transcriptionArea');
 const responseArea = document.getElementById('responseArea');

 let ably;
 let channel;
 let mediaRecorder;
 let localClientId; // Memorizzeremo il clientId qui

 function initializeAbly() {
     statusMessage.textContent = "Autenticazione con Ably...";
     console.log("Inizializzazione Ably con autenticazione a token...");

     try {
         // @ts-ignore
         ably = new Ably.Realtime({
             authUrl: '/api/ably-auth', 
         });

         ably.connection.on('connected', () => {
             localClientId = ably.auth.clientId; // Salva il clientId fornito dal token
             statusMessage.textContent = `Connesso ad Ably (ID: ${localClientId})! Pronto.`;
             console.log(`Ably Connesso! Client ID: ${localClientId}`);
             startButton.disabled = false;
             stopButton.disabled = true;
             setupChannel();
         });

         ably.connection.on('failed', (error) => {
             statusMessage.textContent = 'Connessione Ably fallita. Vedi console.';
             console.error('Connessione Ably fallita:', error);
             startButton.disabled = true;
         });
         
         ably.connection.on('disconnected', (error) => {
             statusMessage.textContent = 'Disconnesso da Ably.';
             console.log('Disconnesso da Ably.', error?.reason);
             startButton.disabled = true;
         });

         ably.connection.on('suspended', () => {
             statusMessage.textContent = 'Connessione Ably sospesa.';
             console.warn('Connessione Ably sospesa.');
             startButton.disabled = true;
         });

     } catch (e) {
         statusMessage.textContent = "Errore durante l'inizializzazione di Ably. Hai incluso la libreria Ably?";
         console.error("Errore inizializzazione Ably:", e);
         startButton.disabled = true;
     }
 }

 function setupChannel() {
     channel = ably.channels.get('leonardo-chat'); 

     channel.subscribe('text-reply', (message) => { // Ascolta solo i messaggi per tutti o specifici per questo client
         console.log('Testo ricevuto da Ably:', message.data, "per clientId:", message.clientId);
          // Potresti voler mostrare solo se message.clientId è il server o se non c'è clientId (broadcast)
         responseArea.innerHTML += `Leonardo: ${message.data.text}<br>`; // Assumiamo che il backend invii { text: "..." }
     });

      channel.subscribe('audio-reply', (message) => { 
         console.log('Audio IA ricevuto da Ably:', message.data, "per clientId:", message.clientId);
         // Assumiamo che il backend invii { audioChunk: ArrayBuffer }
         if (message.data && message.data.audioChunk instanceof ArrayBuffer) {
             const audioBlob = new Blob([message.data.audioChunk], { type: 'audio/webm' });
             playAudio(audioBlob, "Audio IA da Ably");
         } else {
              console.warn("Ricevuto 'audio-reply' ma il formato non è ArrayBuffer in audioChunk:", message.data);
         }
     });

     console.log("Sottoscritto al canale Ably 'leonardo-chat'");
     channel.publish('client-status', { message: `Client ${localClientId} connesso e pronto!` });
 }

 startButton.addEventListener('click', async () => {
     if (!ably || ably.connection.state !== 'connected') {
         statusMessage.textContent = 'Non connesso ad Ably.';
         return;
     }
     statusMessage.textContent = 'Avvio registrazione...';
     startButton.disabled = true; stopButton.disabled = false;
     transcriptionArea.textContent = "Stato: In attesa di audio...";
     responseArea.innerHTML = ""; // Pulisce risposte precedenti

     try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         const options = { mimeType: 'audio/webm;codecs=opus' };
         if (!MediaRecorder.isTypeSupported(options.mimeType)) {
             console.warn(`${options.mimeType} non supportato, usando default.`);
             delete options.mimeType;
         }
         mediaRecorder = new MediaRecorder(stream, options);
         mediaRecorder.ondataavailable = (event) => {
             if (event.data.size > 0 && channel) {
                 event.data.arrayBuffer().then(arrayBuffer => {
                     // Includi il clientId per permettere al backend di sapere chi ha inviato (opzionale)
                     channel.publish('audio-stream', { audioChunk: arrayBuffer, clientId: localClientId });
                     console.log(`Chunk audio (ArrayBuffer) inviato ad Ably da ${localClientId}:`, arrayBuffer.byteLength);
                     transcriptionArea.textContent = `Stato: Invio audio chunk (${arrayBuffer.byteLength} bytes)...`;
                 });
             }
         };
         mediaRecorder.onstop = () => {
             console.log('Registrazione fermata.');
             transcriptionArea.textContent = "Stato: Registrazione fermata.";
             if (channel) channel.publish('audio-stream', { endOfStream: true, clientId: localClientId });
             stream.getTracks().forEach(track => track.stop()); // Rilascia il microfono
         };
         mediaRecorder.start(300); // Invia dati ogni 300ms
         transcriptionArea.textContent = "Stato: Registrazione avviata...";
     } catch (err) {
         console.error('Errore microfono/MediaRecorder:', err);
         statusMessage.textContent = `Errore microfono: ${err.message}. Controlla i permessi.`;
         startButton.disabled = false; stopButton.disabled = true;
     }
 });

 stopButton.addEventListener('click', () => {
     if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
     startButton.disabled = false; stopButton.disabled = true;
     statusMessage.textContent = 'Pronto per iniziare.';
     transcriptionArea.textContent = "";
 });

 function playAudio(audioBlob, source = "Audio") {
     try {
         const audioUrl = URL.createObjectURL(audioBlob);
         const audio = new Audio(audioUrl);
         audio.play().catch(e => console.error(`Errore ${source} audio.play():`, e));
         audio.onended = () => URL.revokeObjectURL(audioUrl);
         console.log(`Riproduzione ${source}...`);
         responseArea.innerHTML += `<i>Riproduzione ${source}...</i><br>`;
     } catch (e) { console.error(`Errore creazione/riproduzione ${source} Blob:`, e); }
 }

 // Avvia l'inizializzazione di Ably quando lo script viene caricato
 initializeAbly();
 startButton.disabled = true; 
 stopButton.disabled = true;
