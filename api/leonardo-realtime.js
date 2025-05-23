// File: api/leonardo-realtime.js
// Tentativo n.4 - Debug dell'header 'upgrade' e handshake più semplice

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const upgradeHeader = request.headers.get('upgrade');
  const connectionHeader = request.headers.get('connection'); // Controlliamo anche questo

  console.log("Backend Edge: Richiesta ricevuta. Header 'upgrade':", upgradeHeader);
  console.log("Backend Edge: Header 'connection':", connectionHeader);

  // Verifichiamo se la richiesta è effettivamente una richiesta di upgrade a WebSocket
  // Il client dovrebbe inviare:
  // Upgrade: websocket
  // Connection: Upgrade (o contenere 'Upgrade')
  if (upgradeHeader?.toLowerCase() !== 'websocket' || !connectionHeader?.toLowerCase().includes('upgrade')) {
    console.log("Backend Edge: La richiesta non sembra essere un upgrade WebSocket valido. Restituisco 400.");
    // Logghiamo tutti gli header per il debug
    for (let [key, value] of request.headers) {
        console.log(`Header: ${key}: ${value}`);
    }
    return new Response('Richiesta non valida per l\'upgrade a WebSocket. Header mancanti o non corretti.', { status: 400 });
  }

  // Se siamo qui, la richiesta è un tentativo di upgrade a WebSocket.
  console.log("Backend Edge: Tentativo di upgrade a WebSocket riconosciuto.");

  try {
    const { 0: clientWs, 1: serverWs } = new WebSocketPair();

    serverWs.accept();
    console.log("Backend Edge: serverWs.accept() chiamato.");

    // Non inviare subito un messaggio da serverWs.onopen, ma aspetta che il client invii qualcosa
    // o invia un messaggio semplice *dopo* aver restituito la response 101.
    // Lo facciamo qui per semplicità, ma idealmente sarebbe in un gestore 'open'.

    serverWs.addEventListener('open', () => {
        console.log("Backend Edge: Evento 'open' su serverWs.");
        serverWs.send("Backend Edge: Connesso! Echo server attivo.");
    });
    
    serverWs.addEventListener('message', (event) => {
      const messageData = event.data;
      if (typeof messageData === 'string') {
        console.log("Backend Edge: Ricevuto testo:", messageData);
        serverWs.send(`Echo: ${messageData}`);
      } else if (messageData instanceof ArrayBuffer) {
        console.log("Backend Edge: Ricevuto ArrayBuffer (lunghezza):", messageData.byteLength);
        serverWs.send(messageData);
      } else {
        console.log("Backend Edge: Ricevuto tipo sconosciuto:", typeof messageData);
        serverWs.send("Ricevuto tipo di messaggio sconosciuto.");
      }
    });

    serverWs.addEventListener('close', (event) => {
      console.log("Backend Edge: Connessione chiusa.", event.code, event.reason);
    });

    serverWs.addEventListener('error', (errorEvent) => {
      console.error("Backend Edge: Errore WebSocket:", errorEvent.message || errorEvent.error || errorEvent);
    });
    
    console.log("Backend Edge: Sto per restituire la Response 101 con clientWs.");
    // Restituisci la risposta 101 con il lato client del WebSocketPair
    return new Response(null, {
      status: 101,
      webSocket: clientWs,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade'
      }
    });

  } catch (e) {
    console.error("Errore grave durante l'inizializzazione di WebSocketPair o gestione:", e);
    return new Response(`Errore interno del server nell'inizializzazione WebSocket: ${e.message}`, { status: 500 });
  }
}
