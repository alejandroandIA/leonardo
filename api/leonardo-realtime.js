// File: api/leonardo-realtime.js
// Progettato per Vercel Edge Functions per gestire WebSockets (Echo Server).

export const config = {
  runtime: 'edge', // Specifica che questa è una Edge Function
};

export default async function handler(request) {
  const upgradeHeader = request.headers.get('upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket upgrade', { status: 426 });
  }

  // Questo è il pattern standard per l'upgrade a WebSocket nelle Edge Runtime APIs
  const { socket: clientSocket, response } = Deno.upgradeWebSocket(request);
  // In Vercel, Deno.upgradeWebSocket potrebbe non essere disponibile,
  // e si usa un approccio con TransformStream come visto prima, oppure Vercel fornisce un suo helper.
  // Per Vercel, il pattern più comune è:
  // const { readable, writable } = new TransformStream();
  // const serverResponse = new Response(readable, { status: 101, webSocket: writable });
  // const serverSocket = serverResponse.webSocket; // Questo è il socket LATO SERVER

  // Proviamo a usare il pattern TransformStream che è più standard per le Edge generiche
  // se Deno.upgradeWebSocket non è l'API corretta per Vercel Edge (spesso è per Deno Deploy)

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair); // client è per la response, server è per noi

  server.accept(); // Accetta la connessione WebSocket sul lato server

  server.onopen = () => {
    console.log("Backend Edge: Connessione WebSocket stabilita con il client.");
    server.send("Backend Edge: Connessione WebSocket stabilita! Sono un echo server.");
  };

  server.onmessage = (event) => {
    const messageData = event.data;
    if (typeof messageData === 'string') {
      console.log("Backend Edge: Ricevuto testo dal client:", messageData);
      server.send(`Echo: ${messageData}`);
    } else if (messageData instanceof ArrayBuffer || messageData instanceof Uint8Array) {
      // Se riceviamo ArrayBuffer (comune per audio da MediaRecorder se inviato come tale)
      console.log("Backend Edge: Ricevuti dati binari (ArrayBuffer/Uint8Array) dal client (lunghezza):", messageData.byteLength);
      server.send(messageData); // Rimanda i dati binari indietro così come sono
    } else if (messageData instanceof Blob) {
        // Se il client invia Blob (meno comune per lo streaming diretto ma possibile)
        console.log("Backend Edge: Ricevuto Blob dal client (dimensione):", messageData.size);
        // Per rimandare un Blob, dobbiamo leggerlo come ArrayBuffer prima
        messageData.arrayBuffer().then(arrayBuffer => {
            server.send(arrayBuffer);
        }).catch(e => console.error("Errore nel leggere il Blob:", e));
    } else {
        console.log("Backend Edge: Ricevuto messaggio di tipo sconosciuto:", messageData);
    }
  };

  server.onclose = (event) => {
    console.log("Backend Edge: Client disconnesso.", `Codice: ${event.code}, Motivo: ${event.reason}`);
  };

  server.onerror = (error) => {
    console.error("Backend Edge: Errore WebSocket:", error);
  };
  
  // Restituisce la risposta che fa l'upgrade della connessione, passando il lato client del WebSocket
  return new Response(null, {
    status: 101, // Switching Protocols
    webSocket: client, // Questo è il lato del WebSocket che il browser userà
  });
}
