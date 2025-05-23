// File: api/leonardo-realtime.js
// Test SUPER MINIMALE: Logga tutti gli header ricevuti dalla Edge Function

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  console.log("Edge Fn (Test Headers): Richiesta ricevuta.");
  console.log("Edge Fn (Test Headers): Metodo:", request.method);

  let headersString = "Headers Ricevuti:\n";
  for (const [key, value] of request.headers.entries()) {
    headersString += `${key}: ${value}\n`;
  }
  console.log(headersString);

  // Restituisci una risposta semplice, il client si aspetterà un errore WebSocket
  // ma noi vogliamo solo vedere i log sul server.
  return new Response('Log degli header completato. Controlla i log della funzione Vercel.', { status: 200 });
}
