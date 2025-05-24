/// <reference types="@cloudflare/workers-types" />

export const config = {
  runtime: 'edge',
};

const OPENAI_MODEL_ID = process.env.OPENAI_REALTIME_MODEL_ID || "gpt-4o-realtime-preview-2024-10-01";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_VOICE_ID = process.env.OPENAI_VOICE_ID || "alloy";
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "Sei Leonardo, un assistente IA colloquiale.";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export default async function handler(request: Request): Promise<Response> {
  if (!OPENAI_API_KEY) {
    console.error("Edge: OPENAI_API_KEY not configured.");
    return new Response("OPENAI_API_KEY not configured.", { status: 500 });
  }

  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected Upgrade: websocket header', { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(webSocketPair);
  const server = serverWs as unknown as WebSocket;
  
  server.accept();

  let openaiWs: WebSocket | null = null;

  try {
    const wsUrl = `wss://api.openai.com/v1/realtime?model=${OPENAI_MODEL_ID}`;
    const protocols = [
        "realtime",
        `openai-insecure-api-key.${OPENAI_API_KEY}`,
        "openai-beta.realtime-v1" 
    ];

    openaiWs = new WebSocket(wsUrl, protocols); 

    openaiWs.addEventListener('open', () => {
      console.log("Edge: OpenAI WebSocket connection established.");
      const initialSessionConfig = {
        type: "session.update",
        session: {
          voice: OPENAI_VOICE_ID,
          input_audio_format: { /* Assumendo che l'API possa gestire Opus direttamente. Altrimenti, specificare PCM e il client/edge deve convertire. */
            codec: "opus", 
          },
          output_audio_format: { 
            codec: "opus", /* Opus è efficiente per lo streaming. */
            sample_rate: 24000 /* Sample rate comune per output TTS di qualità. */
          },
          instructions: SYSTEM_PROMPT,
          language: "it" /* Specifica la lingua per migliorare accuratezza e latenza. */
        }
      };
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify(initialSessionConfig));
      }
    });

    openaiWs.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        const serverEvent = JSON.parse(event.data as string);

        if (serverEvent.type === "response.audio.delta" && serverEvent.delta) {
          const audioChunkBase64 = serverEvent.delta;
          const audioChunkArrayBuffer = base64ToArrayBuffer(audioChunkBase64);
          if (server.readyState === WebSocket.OPEN) {
            server.send(audioChunkArrayBuffer);
          }
        } else {
          if (server.readyState === WebSocket.OPEN) {
            server.send(event.data);
          }
        }
      } else {
         if (server.readyState === WebSocket.OPEN) {
            server.send(event.data);
          }
      }
    });

    openaiWs.addEventListener('error', (errorEvent) => {
      console.error("Edge: OpenAI WebSocket error:", errorEvent.message || errorEvent);
      if (server.readyState === WebSocket.OPEN) {
        server.close(1011, "OpenAI connection error");
      }
    });

    openaiWs.addEventListener('close', (closeEvent) => {
      console.log(`Edge: OpenAI WebSocket closed. Code: ${closeEvent.code}, Reason: ${closeEvent.reason}`);
      if (server.readyState === WebSocket.OPEN) {
        server.close(closeEvent.code || 1000, `OpenAI stream ended: ${closeEvent.reason || 'Unknown'}`);
      }
    });

  } catch (err: any) {
    console.error("Edge: Error establishing OpenAI WebSocket connection:", err.message, err.stack);
    if (server.readyState === WebSocket.OPEN || server.readyState === WebSocket.CONNECTING) {
      server.close(1011, "Failed to connect to upstream OpenAI service.");
    }
  }

  server.addEventListener('message', (event: MessageEvent) => {
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        if (event.data instanceof Blob) {
            (async () => {
                try {
                    const arrayBuffer = await (event.data as Blob).arrayBuffer();
                    const base64Audio = arrayBufferToBase64(arrayBuffer);
                    const audioEvent = {
                      type: "input_audio_buffer.append",
                      audio: base64Audio
                      /* Se l'API richiede formato per ogni chunk: 
                      format: { codec: "opus" } 
                      */
                    };
                    openaiWs.send(JSON.stringify(audioEvent));
                } catch (e: any) {
                    console.error("Edge: Error processing audio blob from client:", e.message);
                }
            })();
        } else if (typeof event.data === 'string') {
            openaiWs.send(event.data);
        }
    } else {
      console.warn("Edge: OpenAI WS not open or not connected, cannot forward client message.");
    }
  });

  server.addEventListener('close', async (event: CloseEvent) => {
    console.log(`Edge: Client WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
    if (openaiWs && (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING)) {
      openaiWs.close(1000, "Client disconnected");
    }
  });

  server.addEventListener('error', (errorEvent) => {
    console.error("Edge: Client WebSocket error:", errorEvent.message || errorEvent);
    if (openaiWs && (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING)) {
      openaiWs.close(1011, "Client error");
    }
  });

  return new Response(null, {
    status: 101, 
    webSocket: clientWs, 
  });
}
