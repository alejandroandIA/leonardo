// File: api/leonardo-realtime.js
// Tentativo n.5 - Aderenza a WebSocketPair e logging super dettagliato

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  console.log("Backend Edge: Funzione handler chiamata."); // Log #1

  const upgradeHeader = request.headers.get('upgrade');
  console.log("Backend Edge: Header 'upgrade' ricevuto:", upgradeHeader); // Log #2

  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    console.log("Backend Edge: Non è una richiesta di upgrade WebSocket. Header 'upgrade':", upgradeHeader); // Log #3
    return new Response('Richiesta HTTP normale. Atteso upgrade a WebSocket.', { status: 400 });
  }

  console.log("Backend Edge: Riconosciuta richiesta di upgrade a WebSocket."); // Log #4

  try {
    const pair = new WebSocketPair();
    const clientWs = pair[0]; // Questo va nella response per il browser
    const serverWs = pair[1]; // Questo è il nostro oggetto WebSocket lato server

    console.log("Backend Edge: WebSocketPair creato."); // Log #5

    // È cruciale chiamare accept() sul "lato server" della coppia.
    serverWs.accept();
    console.log("Backend Edge: serverWs.accept() chiamato."); // Log #6

    serverWs.addEventListener('open', () => {
      // Questo evento potrebbe non scattare se l'handshake non è completato dal client
      // o se c'è un problema prima.
      console.log("Backend Edge: Evento 'open' su serverWs."); // Log #7
      try {
        serverWs.send("Backend Edge: Connesso! Echo server attivo.");
        console.log("Backend Edge: Messaggio di benvenuto inviato dopo 'open'."); // Log #8
      } catch (e) {
        console.error("Backend Edge: Errore invio messaggio di benvenuto:", e); // Log #9
      }
    });

    serverWs.addEventListener('message', (event) => {
      console.log("Backend Edge: Evento 'message' su serverWs."); // Log #10
      const messageData = event.data;
      try {
        if (typeof messageData === 'string') {
          console.log("Backend Edge: Ricevuto testo:", messageData); // Log #11
          serverWs.send(`Echo: ${messageData}`);
        } else if (messageData instanceof ArrayBuffer) {
          console.log("Backend Edge: Ricevuto ArrayBuffer (lunghezza):", messageData.byteLength); // Log #12
          serverWs.send(messageData);
        } else {
          console.log("Backend Edge: Ricevuto tipo sconosciuto:", typeof messageData); // Log #13
          serverWs.send("Ricevuto tipo di messaggio sconosciuto.");
        }
      } catch (e) {
        console.error("Backend Edge: Errore durante gestione messaggio o echo:", e); // Log #14
      }
    });

    serverWs.addEventListener('close', (event) => {
      console.log("Backend Edge: Evento 'close' su serverWs.", event.code, event.reason); // Log #15
    });

    serverWs.addEventListener('error', (errorEvent) => {
      console.error("Backend Edge: Evento 'error' su serverWs:", errorEvent.message || errorEvent.error || errorEvent); // Log #16
    });
    
    console.log("Backend Edge: Sto per restituire la Response 101."); // Log #17
    return new Response(null, {
      status: 101,
      webSocket: clientWs, // Passa il lato "client" del WebSocketPair al runtime Edge per l'handshake
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade'
      }
    });

  } catch (e) {
    console.error("Backend Edge: Errore grave nel blocco try/catch principale:", e.message, e.stack); // Log #18
    return new Response(`Errore interno del server nell'inizializzazione WebSocket: ${e.message}`, { status: 500 });
  }
}
