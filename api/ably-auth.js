// File: api/ably-auth.js
// Soluzione mirata per l'autenticazione Ably: invia la stringa di token come plain text.

import Ably from 'ably';

export default async function handler(req, res) {
    // 1. Verifica la chiave API del server Ably (fondamentale)
    const ablyApiKey = process.env.ABLY_SERVER_API_KEY;
    if (!ablyApiKey) {
        console.error("api/ably-auth.js: ERRORE CRITICO - La variabile d'ambiente ABLY_SERVER_API_KEY non è impostata su Vercel.");
        // Restituisci un errore chiaro anche al client
        return res.status(500).send('Errore di configurazione del server: chiave API Ably mancante.');
    }

    console.log("api/ably-auth.js: Inizio processo di autenticazione Ably.");

    try {
        // 2. Inizializza Ably.Rest con la chiave API del server
        const ably = new Ably.Rest({ key: ablyApiKey });
        console.log("api/ably-auth.js: Ably.Rest inizializzato con successo.");

        // 3. Definisci i parametri per il token
        // Un clientId univoco è buona pratica per identificare le sessioni client
        const clientIdForToken = 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        const tokenParams = {
            clientId: clientIdForToken,
            capability: { 
                // Permessi specifici per il canale che useremo per Leonardo
                'leonardo-chat': ['subscribe', 'publish', 'presence'] 
            }
            // ttl: 3600 // opzionale: scadenza del token in secondi (default Ably è 1 ora)
        };
        console.log(`api/ably-auth.js: Parametri del token per clientId [${clientIdForToken}]: ${JSON.stringify(tokenParams.capability)}`);

        // 4. Richiedi i dettagli del token ad Ably (questo restituisce una Promise)
        console.log("api/ably-auth.js: Chiamata a ably.auth.requestToken...");
        const tokenDetails = await ably.auth.requestToken(tokenParams);
        // 'tokenDetails' è un oggetto che contiene la proprietà 'token' (la stringa del token)
        // oltre a 'issued', 'expires', 'capability', 'clientId'.

        if (!tokenDetails || !tokenDetails.token) {
            console.error("api/ably-auth.js: ERRORE - ably.auth.requestToken non ha restituito un oggetto TokenDetails valido o la stringa del token è mancante/vuota.");
            console.error("api/ably-auth.js: TokenDetails ricevuti:", JSON.stringify(tokenDetails));
            return res.status(500).send('Errore nella generazione del token da parte di Ably: token mancante.');
        }

        console.log(`api/ably-auth.js: Token Ably generato con successo per clientId [${clientIdForToken}]. Stringa token (prime 10 chars): ${tokenDetails.token.substring(0,10)}...`);
        
        // 5. Invia SOLO la stringa del token come plain text al client.
        // L'SDK client di Ably, quando usa authUrl, può gestire una risposta plain text
        // che contiene direttamente la stringa del token.
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).send(tokenDetails.token);

    } catch (error) {
        console.error('api/ably-auth.js: ERRORE CRITICO durante la generazione del token Ably:');
        console.error('Messaggio:', error.message);
        console.error('Nome Errore:', error.name); // Es. 'AblyException'
        console.error('Codice Status (HTTP, se da API Ably):', error.statusCode); // Es. 401, 403
        console.error('Codice Errore (Ably):', error.code); // Es. 40140
        console.error('Stack Trace:', error.stack);
        
        // Invia un messaggio di errore più specifico se possibile
        let clientErrorMessage = `Errore durante la generazione del token Ably: ${error.message}`;
        if (error.code === 40140 || error.statusCode === 401 || error.statusCode === 403) {
            clientErrorMessage = "Autenticazione con Ably fallita. Verifica la ABLY_SERVER_API_KEY su Vercel.";
        }
        
        res.status(error.statusCode || 500).send(clientErrorMessage);
    }
}
