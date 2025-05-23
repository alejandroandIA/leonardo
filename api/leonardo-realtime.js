// File: api/leonardo-realtime.js
// Tentativo n.3 per Vercel Edge Functions WebSocket (Echo Server) - CORREZIONE SINTASSI

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const upgradeHeader = request.headers.get('upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    // Se non è una richiesta di upgrade WebSocket, restituisci un errore o gestiscila come una normale HTTP.
    // Per semplicità, restituiamo un errore.
    return new Response('Richiesta HTTP normale a un endpoint WebSocket. Atteso upgrade a WebSocket.', { status: 400 });
  }

  try {
    // WebSocketPair è lo standard per creare una coppia di socket nelle API Edge.
    // clientWs va restituito nella Response per l'handshake con il browser.
    // serverWs è l'oggetto che usiamo nel backend per comunicare.
    const { 0: clientWs, 1: serverWs } = new WebSocketPair();

    // Il server deve "accettare" la sua parte della connessione.
    serverWs.accept(); 

    // Invia un messaggio di benvenuto al client appena la connessione è stabilita.
    serverWs.send("Backend Edge (WebSocketPair): Connesso! Echo server attivo.");
    console.log("Backend Edge (WebSocketPair): Connessione aperta, messaggio di benvenuto inviato.");

    // Gestore per i messaggi ricevuti dal client.
    serverWs.addEventListener('message', (event) => {
      const messageData = event.data;
      if (typeof messageData === 'string') {
        console.log("Backend Edge (WebSocketPair): Ricevuto testo:", messageData);
        serverWs.send(`Echo: ${messageData}`); // Rimanda indietro il testo con "Echo:"
      } else if (messageData instanceof ArrayBuffer) {
        console.log("Backend Edge (WebSocketPair): Ricevuto ArrayBuffer (lunghezza):", messageData.byteLength);
        serverWs.send(messageData); // Rimanda indietro i dati binari (audio) così come sono.
      } else {
        // Gestisce altri tipi di dati se necessario, o logga un avviso.
        console.log("Backend Edge (WebSocketPair): Ricevuto tipo di messaggio sconosciuto:", typeof messageData);
        serverWs.send("Ricevuto tipo di messaggio sconosciuto dal backend.");
      }
    });

    // Gestore per la chiusura della connessione.
    serverWs.addEventListener('close', (event) => {
      console.log("Backend Edge (WebSocketPair): Connessione chiusa.", `Codice: ${event.code}, Motivo: ${event.reason}`);
    });

    // Gestore per errori WebSocket.
    serverWs.addEventListener('error', (errorEvent) => {
      // L'oggetto errore effettivo è spesso in errorEvent.error o errorEvent.message
      console.error("Backend Edge (WebSocketPair): Errore WebSocket:", errorEvent.message || errorEvent.error || errorEvent);
    });

    // Restituisce la risposta HTTP 101 (Switching Protocols) al client,
    // passando il lato "client" del WebSocketPair. Questo completa l'handshake.
    return new Response(null, {
      status: 101,
      webSocket: clientWs, // Questo è cruciale per l'handshake
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade'
        // Nessuna virgola dopo l'ultima intestazione
      }
      // Nessuna virgola dopo l'ultimo oggetto 'headers'
    });

  } catch (e) {
    // Gestisce errori che potrebbero verificarsi durante l'inizializzazione di WebSocketPair
    // o altre eccezioni impreviste nel blocco try.
    console.error("Errore grave durante l'inizializzazione di WebSocketPair o gestione:", e);
    return new Response("Errore interno del server nell'inizializzazione WebSocket.", { status: 500 });
  }
}
