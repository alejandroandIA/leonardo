// File: api/leonardo-realtime.ts
// Assicurati di avere @cloudflare/workers-types installato: npm install -D @cloudflare/workers-types typescript

/// <reference types="@cloudflare/workers-types" />

export const config = {
  runtime: 'edge',
  // regions: ['iad1'], // Facoltativo: specifica una regione vicina ai tuoi utenti/OpenAI
};

// !!! ATTENZIONE: QUESTO È UN ENDPOINT IPOTETICO !!!
// !!! DEVI VERIFICARE LA DOCUMENTAZIONE UFFICIALE DI OPENAI per la Realtime API specifica !!!
// !!! (es. gpt-4o-realtime-preview) E IL SUO FORMATO DI AUTENTICAZIONE/MESSAGGISTICA !!!
const OPENAI_REALTIME_API_ENDPOINT = "wss://api.openai.com/v1/voice/realtime"; // <--- ESEMPIO! DA SOSTITUIRE!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(request: Request): Promise<Response> {
  if (!OPENAI_API_KEY) {
    console.error("Edge: OpenAI API key not configured.");
    return new Response("OpenAI API key not configured.", { status: 500 });
  }

  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    console.log("Edge: Request does not have Upgrade: websocket header");
    return new Response('Expected Upgrade: websocket', { status: 426 }); // 426 Upgrade Required
  }

  const webSocketPair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(webSocketPair);

  // @ts-ignore Cast serverWs to the WebSocket type expected by the runtime
  const server = serverWs as unknown as WebSocket;
  server.accept();
  console.log("Edge: Client WebSocket connection accepted.");

  let openaiWs: WebSocket | null = null;

  try {
    console.log(`Edge: Attempting to connect to OpenAI Realtime API at ${OPENAI_REALTIME_API_ENDPOINT}`);
    // La connessione WebSocket a OpenAI e l'autenticazione dipendono ESATTAMENTE
    // da come l'API Realtime di OpenAI è progettata.
    // Opzioni comuni:
    // 1. Token nell'URL: wss://api.openai.com/v1/voice/realtime?token=YOUR_API_KEY (meno sicuro)
    // 2. Primo messaggio JSON con API Key/config: dopo la connessione, invii un JSON.
    // 3. Header custom durante l'handshake (new WebSocket(url, { headers: ... }) ): non standard per i client WebSocket
    //    ma alcuni ambienti server/edge potrebbero supportarlo per WebSocket *in uscita*.
    //    Cloudflare Workers (su cui Vercel Edge si basa) permette di fare `fetch` con header `Upgrade: websocket`
    //    per un controllo maggiore, ma è più complesso.
    // Per ora, ipotizziamo una connessione diretta e che l'autenticazione/configurazione
    // possa avvenire con un primo messaggio o che l'URL stesso sia sufficiente (improbabile per API key).

    openaiWs = new WebSocket(OPENAI_REALTIME_API_ENDPOINT); // URL E PROTOCOLLO DA VERIFICARE!

    openaiWs.addEventListener('open', () => {
      console.log("Edge: Successfully connected to OpenAI Realtime API.");
      // !!! Esempio di messaggio di configurazione/autenticazione da inviare a OpenAI !!!
      // !!! Questo è IPOTETICO e deve essere basato sulla documentazione di OpenAI !!!
      /*
      openaiWs.send(JSON.stringify({
        api_key: OPENAI_API_KEY, // Potrebbe non essere inviato così direttamente.
        model: "gpt-4o-realtime-preview-2024-10-01", // o il modello corretto
        input_audio_format: { // Formato dell'audio che invii TU a OpenAI
          container: "webm",
          codec: "opus",
          sample_rate: 48000, // Tipico per WebM/Opus dal browser
        },
        output_audio_format: { // Formato dell'audio che VUOI da OpenAI
          codec: "opus", // o "pcm_s16le" (PCM 16-bit little-endian), "pcm_f32le" (PCM float32)
          sample_rate: 24000, // Esempio: 24kHz è comune per TTS vocale di qualità
          // channels: 1, // Se PCM
          // bit_depth: 16, // Se PCM
        },
        // Altri parametri specifici dell'API di OpenAI...
      }));
      */
    });

    openaiWs.addEventListener('message', (event: MessageEvent) => {
      // Messaggio (audio chunk o JSON status) da OpenAI -> inoltra al client browser
      if (server.readyState === WebSocket.OPEN) {
        // console.log("Edge: Received message from OpenAI, forwarding to client.");
        server.send(event.data);
      }
    });

    openaiWs.addEventListener('error', (errorEvent) => {
      // Non usare console.log(errorEvent) direttamente perché potrebbe essere un oggetto complesso
      // e non loggare bene in Vercel Edge. Meglio estrarre info.
      const errorDetails = errorEvent.message || "Unknown error";
      console.error("Edge: OpenAI WebSocket error:", errorDetails);
      if (server.readyState === WebSocket.OPEN) {
        server.close(1011, `OpenAI connection error: ${errorDetails}`);
      }
    });

    openaiWs.addEventListener('close', (closeEvent) => {
      console.log(`Edge: OpenAI WebSocket closed. Code: ${closeEvent.code}, Reason: ${closeEvent.reason}`);
      if (server.readyState === WebSocket.OPEN) {
        server.close(1000, "OpenAI stream ended");
      }
    });

  } catch (err: any) {
    console.error("Edge: Failed to establish connection with OpenAI WebSocket:", err.message, err.stack);
    if (server.readyState === WebSocket.OPEN || server.readyState === WebSocket.CONNECTING) {
      server.close(1011, "Failed to connect to upstream service (OpenAI).");
    }
    // Se l'errore avviene prima che l'handshake col client sia completato,
    // dovremmo restituire una Response HTTP di errore. Ma qui siamo già nella logica
    // post-upgrade implicita. La `return new Response(null, { status: 101, webSocket: clientWs });`
    // gestisce l'handshake. Se `new WebSocket(OPENAI_REALTIME_API_ENDPOINT)` fallisce,
    // il client riceverà comunque un 101 e poi un close immediato.
  }

  server.addEventListener('message', (event: MessageEvent) => {
    // Messaggio (audio chunk) dal client browser -> inoltra a OpenAI
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      // console.log("Edge: Received message from client, forwarding to OpenAI.");
      openaiWs.send(event.data);
    } else {
      console.warn("Edge: OpenAI WS not open or not yet connected, cannot forward client message.");
      // Potresti voler informare il client o gestire diversamente
    }
  });

  server.addEventListener('close', async (event: CloseEvent) => {
    console.log(`Edge: Client WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
    if (openaiWs && (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING)) {
      console.log("Edge: Closing OpenAI WebSocket due to client disconnect.");
      openaiWs.close(1000, "Client disconnected");
    }
  });

  server.addEventListener('error', (errorEvent) => {
    const clientErrorDetails = errorEvent.message || "Client WS Unknown error";
    console.error("Edge: Client WebSocket error:", clientErrorDetails);
    if (openaiWs && (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING)) {
      openaiWs.close(1011, `Client error: ${clientErrorDetails}`);
    }
  });

  // Restituisci la Response per completare l'upgrade a WebSocket
  return new Response(null, {
    status: 101, // Switching Protocols
    webSocket: clientWs, // L'estremità del WebSocket che Vercel darà al client
  });
}
