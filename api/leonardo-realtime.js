// File: api/leonardo-realtime.js
// Test Minimale per WebSocket Handshake su Vercel Edge

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const upgradeHeader = request.headers.get('upgrade');
  console.log("Edge Fn: Richiesta ricevuta. Header 'upgrade':", upgradeHeader);

  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    console.log("Edge Fn: Non è una richiesta di upgrade WebSocket.");
    return new Response('Expected websocket upgrade', { status: 400 });
  }

  console.log("Edge Fn: Riconosciuta richiesta di upgrade. Tento l'handshake...");

  // Tentativo 1: Usare Deno.upgradeWebSocket (se disponibile nel runtime Vercel Edge)
  // @ts-ignore // Ignora l'errore TS se 'Deno' non è riconosciuto nell'editor
  if (typeof Deno !== 'undefined' && typeof Deno.upgradeWebSocket === 'function') {
    try {
      const { socket, response } = Deno.upgradeWebSocket(request);
      // Non attacchiamo listener a 'socket' per ora, vogliamo solo vedere se l'handshake avviene
      console.log("Edge Fn: Deno.upgradeWebSocket chiamato. Restituisco response 101.");
      socket.onopen = () => socket.send("Connesso con Deno.upgradeWebSocket!"); // Invia un messaggio se si apre
      socket.onclose = () => console.log("Socket (Deno) chiuso.");
      return response;
    } catch (e) {
      console.error("Edge Fn: Deno.upgradeWebSocket fallito:", e.message);
      // Se fallisce, procedi al fallback con WebSocketPair
    }
  }

  // Tentativo 2: Fallback a WebSocketPair (standard WinterCG)
  console.log("Edge Fn: Deno.upgradeWebSocket non disponibile o fallito. Provo con WebSocketPair.");
  try {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    server.accept();
    // server.send("Connesso con WebSocketPair!"); // Invia un messaggio per testare

    // Logica per mantenere il socket server vivo e gestire i messaggi (per ora molto semplice)
    // Questo è necessario perché altrimenti la funzione Edge potrebbe terminare.
    // Dobbiamo aspettare che il socket si chiuda.
    server.addEventListener('message', (event) => {
        // Non facciamo nulla, solo per tenere aperto il listener
        console.log("Edge Fn (Pair): Messaggio ricevuto (ignoro):", event.data);
        server.send("Eco da Pair: " + event.data); // Semplice eco
    });
     server.addEventListener('open', () => {
        console.log("Edge Fn (Pair): Socket aperto, invio benvenuto.");
        server.send("Connesso con WebSocketPair!");
    });
    server.addEventListener('close', () => console.log("Edge Fn (Pair): Socket chiuso."));
    server.addEventListener('error', (e) => console.error("Edge Fn (Pair): Errore socket:", e));


    console.log("Edge Fn: WebSocketPair creato e accettato. Restituisco response 101.");
    return new Response(null, {
      status: 101,
      webSocket: client, // Passa il lato client della coppia
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade'
      }
    });
  } catch (e2) {
    console.error("Edge Fn: Anche WebSocketPair fallito:", e2.message);
    return new Response('WebSocket server upgrade failed.', { status: 500 });
  }
}
