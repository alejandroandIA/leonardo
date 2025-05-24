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
    console.error(`Edge: CRITICAL - 'Upgrade' header is missing or not 'websocket'. Actual value: '${upgradeHeader}'`);
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
      const initialSessionConfig = {
        type: "session.update",
        session: {
          voice: OPENAI_VOICE_ID,
          input_audio_format: { /* OpenAI potrebbe aspettarsi PCM qui. Se "opus" fallisce, prova con PCM. */
            codec: "opus", 
            /* Esempio se invii PCM:
            codec: "pcm_s16le", // PCM 16-bit little-endian
            sample_rate: 16000 // O il sample rate del tuo audio PCM
            */
          },
          output_audio_format: { 
            codec: "opus",
            sample_rate: 24000 
          },
          instructions: SYSTEM_PROMPT,
          language: "it"
        }
      };
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify(initialSessionConfig));
      }
    });

    openaiWs.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
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
        } catch (e) {
             if (server.readyState === WebSocket.OPEN) {
                server.send(event.data); 
              }
        }
      } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
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
                    /* Se OpenAI richiede PCM, qui dovresti decodificare l'Opus in PCM prima di inviare. */
                    /* Per ora, inviamo l'Opus (o qualsiasi cosa sia nel Blob) come Base64. */
                    const base64Audio = arrayBufferToBase64(arrayBuffer);
                    const audioEvent = {
                      type: "input_audio_buffer.append",
                      audio: base64Audio
                    };
                    openaiWs.send(JSON.stringify(audioEvent));
                } catch (e: any) {
                    console.error("Edge: Error processing audio blob from client:", e.message);
                }
            })();
        } else if (typeof event.data === 'string') {
            /* Ad esempio, per eventi come response.create se VAD è disabilitato */
            openaiWs.send(event.data);
        }
    } else {
      console.warn("Edge: OpenAI WS not open or not connected, cannot forward client message.");
    }
  });

  server.addEventListener('close', async (event: CloseEvent) => {
    if (openaiWs && (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING)) {
      openaiWs.close(1000, "Client disconnected");
    }
  });

  server.addEventListener('error', (errorEvent) => {
    if (openaiWs && (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING)) {
      openaiWs.close(1011, "Client error");
    }
  });

  return new Response(null, {
    status: 101, 
    webSocket: clientWs, 
  });
}
