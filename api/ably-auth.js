// File: api/ably-auth.js
// TENTATIVO DI GENERARE UNA STRINGA DI TOKEN INVECE DI TOKENREQUEST

import Ably from 'ably';

export default async function handler(req, res) {
    const ablyApiKey = process.env.ABLY_SERVER_API_KEY;

    if (!ablyApiKey) {
        console.error("FATAL ERROR: ABLY_SERVER_API_KEY non è configurata.");
        return res.status(500).json({ error: 'Configurazione del server Ably mancante.' });
    }

    console.log("api/ably-auth.js: Inizio generazione STRINGA token Ably...");

    try {
        const ably = new Ably.Rest({ key: ablyApiKey });
        console.log("api/ably-auth.js: Ably.Rest inizializzato.");

        const clientIdForToken = 'client-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        console.log(`api/ably-auth.js: ClientId per il token: ${clientIdForToken}`);

        const tokenParams = {
            clientId: clientIdForToken,
            capability: { 
                'leonardo-chat': ['subscribe', 'publish', 'presence'] 
            }
            // ttl: 3600 // Scadenza in secondi per requestToken
        };
        console.log("api/ably-auth.js: Parametri del token:", JSON.stringify(tokenParams));

        // Invece di createTokenRequest, usiamo requestToken per ottenere direttamente i dettagli del token (inclusa la stringa del token)
        // requestToken è anch'esso asincrono e restituisce una Promise
        console.log("api/ably-auth.js: Chiamata a ably.auth.requestToken...");
        const tokenDetails = await ably.auth.requestToken(tokenParams, null); 
        // Anche qui, proviamo prima SENZA il 'null'. Se fallisce, si può provare CON 'null'.
        // const tokenDetails = await ably.auth.requestToken(tokenParams);


        console.log("api/ably-auth.js: tokenDetails ricevuti da Ably:", JSON.stringify(tokenDetails));
        
        // Invia l'oggetto TokenDetails completo. Il client userà tokenDetails.token
        // oppure, se l'SDK client di Ably per authUrl si aspetta ancora un oggetto simile a TokenRequest,
        // dobbiamo restituire l'oggetto TokenDetails così com'è, perché l'SDK sa come gestirlo
        // o estrarre la stringa token se necessario.
        // La documentazione dice che authCallback può restituire TokenDetails o TokenString.
        // Per authUrl, si aspetta un oggetto TokenRequest o TokenDetails.
        res.status(200).json(tokenDetails); // Invia l'intero oggetto TokenDetails

    } catch (error) {
        console.error('api/ably-auth.js: ERRORE DETTAGLIATO durante la generazione del token (requestToken):');
        // ... (stesso logging dell'errore di prima)
        console.error('Messaggio:', error.message);
        console.error('Nome Errore:', error.name);
        console.error('Codice Status (se da API Ably):', error.statusCode);
        console.error('Codice Errore (se da API Ably):', error.code);
        console.error('Stack Trace:', error.stack);
        
        res.status(error.statusCode || 500).json({ 
            error: `Impossibile generare il token Ably (requestToken): ${error.message}`,
            errorCode: error.code,
            errorName: error.name
        });
    }
}
