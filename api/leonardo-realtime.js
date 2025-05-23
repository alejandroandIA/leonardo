// File: api/leonardo-realtime.js
// Tentativo n.2 per Vercel Edge Functions WebSocket (Echo Server)

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const upgradeHeader = request.headers.get('upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected websocket upgrade', { status: 400 }); // 400 Bad Request se non c'è header upgrade
  }

  // Questo è un pattern comune per le Edge Functions che supportano i WebSockets
  // tramite l'oggetto Response e un TransformStream.
  const { readable, writable } = new TransformStream();
  const response = new Response(readable, {
    status: 101, // Switching Protocols
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
    },
    // La proprietà 'webSocket' è cruciale. Vercel (o il runtime Edge)
    // usa questo per prendere il controllo e stabilire la connessione.
    // Dobbiamo passare il lato scrivibile al client, e noi lavoreremo con il leggibile (o viceversa).
    // Il nome 'webSocket' è fuorviante: si riferisce al "lato del client" del WebSocket
    // che il server deve fornire.
    // No, `webSocket` qui è l'oggetto che il runtime gestisce.
    // `writable` è dove scriviamo *noi* (server) per inviare al client.
    // `readable` è dove il client scrive e *noi* (server) leggiamo.
    // Aspetta, è il contrario: il client scrive a `writable` (lato server), e il server legge da `readable` (lato server).
    // Il server scrive a `writable` (lato response), e il client legge da `readable` (lato response).
    // Confusione! Ok, chiariamo:
    // Il `readable` della Response va al client.
    // Il `webSocket` (che è un WritableStream) della Response è dove il client invia i dati.
    // No, `webSocket` è un oggetto speciale, non solo un WritableStream.

    // Tentiamo il pattern corretto:
    // response.webSocket è un oggetto WebSocket che il runtime Edge crea e gestisce.
    // Noi interagiamo con esso.
    // Dobbiamo restituire un oggetto che contenga la parte 'server' del socket.
    // La documentazione di Vercel per `Response.json({}, { webSocket: ... })`
    // o `new Response(null, { webSocket: ...})` è la chiave.

    // Tentativo con il pattern Vercel / WinterCG più standard:
    // `webSocket` nella Response è un oggetto che ha metodi `send`, `addEventListener` ecc.
    // Questo è il *nostro* lato del socket.
    // Dobbiamo creare una coppia e dare l'altro lato al client.
    const { socket: serverSocketForUs, response: upgradeResponse } = Deno.upgradeWebSocket(request);
    // ^^ Questo `Deno.upgradeWebSocket` è specifico per Deno. Vercel Edge usa un runtime diverso.
    // Ritorno al pattern TransformStream, ma gestito correttamente:
  }

  // IL PATTERN CORRETTO PER VERVCEL EDGE CON TransformStream:
  // Creiamo un TransformStream. Il suo 'readable' andrà nella Response per il client.
  // Il suo 'writable' sarà usato dal nostro codice server per scrivere dati AL client.
  // Poi, per leggere DAL client, dobbiamo accedere a un altro stream che Vercel ci fornisce
  // una volta che l'handshake è fatto, spesso associato alla request originale o un evento.

  // Questo è il punto più complicato con le Edge Functions perché l'API è ancora in evoluzione
  // e varia leggermente tra i provider (Cloudflare, Deno, Vercel).

  // Rivediamo il pattern `WebSocketPair` che è il più generico per le API Edge standard.
  // Potrebbe essere che `WebSocketPair` non sia direttamente esposto nell'ambiente Vercel Edge,
  // o che Vercel si aspetti che l'interazione avvenga tramite l'oggetto `request`
  // e gestendo gli stream `readable`/`writable` in un modo specifico.

  // **Semplifichiamo e proviamo l'approccio che Vercel stesso suggerisce di più:**
  // Si crea un `TransformStream`. Il `readable` va nella Response.
  // Il server ottiene un `WritableStream` (il `writable` del `TransformStream`) per inviare dati.
  // Il server ottiene un `ReadableStream` (dalla `request.body` se la request viene mantenuta viva,
  // o da un evento) per leggere i dati.

  // Per ora, dato il 426, il problema è ancora nell'handshake.
  // Il client dice "bad response". Potrebbe essere che mancano gli header corretti nella response 101.

  // Torniamo al pattern `WebSocketPair` ma assicurandoci che sia usato correttamente.
  // Questo è il modo standard per gli ambienti che implementano l'API WebSocket di WinterCG.
  try {
    const { 0: clientWs, 1: serverWs } = new WebSocketPair();

    serverWs.accept(); // Server accetta la connessione

    serverWs.send("Backend Edge (WebSocketPair): Connesso! Echo server attivo.");
    console.log("Backend Edge (WebSocketPair): Connessione aperta, messaggio di benvenuto inviato.");

    serverWs.addEventListener('message', (event) => {
      const messageData = event.data;
      if (typeof messageData === 'string') {
        console.log("Backend Edge (WebSocketPair): Ricevuto testo:", messageData);
        serverWs.send(`Echo: ${messageData}`);
      } else if (messageData instanceof ArrayBuffer) {
        console.log("Backend Edge (WebSocketPair): Ricevuto ArrayBuffer (lunghezza):", messageData.byteLength);
        serverWs.send(messageData); // Echo dei dati binari
      } else {
        console.log("Backend Edge (WebSocketPair): Ricevuto tipo sconosciuto.");
        serverWs.send("Ricevuto tipo di messaggio sconosciuto.");
      }
    });

    serverWs.addEventListener('close', (event) => {
      console.log("Backend Edge (WebSocketPair): Connessione chiusa.", event.code, event.reason);
    });

    serverWs.addEventListener('error', (error) => {
      console.error("Backend Edge (WebSocketPair): Errore.", error);
    });

    // Restituisce la response 101 con il lato client del WebSocketPair
    return new Response(null, {
      status: 101,
      webSocket: clientWs, // Passa il "lato client" del pair alla response
      headers: {          // Assicuriamoci che gli header siano corretti
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
      }
    });

  } catch (e) {
    console.error("Errore durante l'inizializzazione di WebSocketPair o gestione:", e);
    return new Response("Errore interno del server nell'inizializzazione WebSocket.", { status: 500 });
  }
}
