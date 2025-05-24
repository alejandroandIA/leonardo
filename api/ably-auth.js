// File: api/ably-auth.js
import Ably from 'ably'; // Assicurati che Ably sia importato correttamente

export default async function handler(req, res) {
    const ablyApiKey = process.env.ABLY_SERVER_API_KEY;

    if (!ablyApiKey) {
        console.error("FATAL ERROR: ABLY_SERVER_API_KEY non è configurata nelle variabili d'ambiente di Vercel.");
        return res.status(500).json({ error: 'Configurazione del server Ably mancante. Impossibile autenticare il client.' });
    }

    console.log("api/ably-auth.js: Inizio generazione token Ably...");

    try {
        // Inizializza Ably.Rest. È importante che 'Ably.Rest' sia corretto.
        const ably = new Ably.Rest({ key: ablyApiKey });
        console.log("api/ably-auth.js: Ably.Rest inizializzato.");

        const clientIdForToken = 'client-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        console.log(`api/ably-auth.js: ClientId per il token: ${clientIdForToken}`);

        const tokenParams = {
            clientId: clientIdForToken,
            capability: { 
                'leonardo-chat': ['subscribe', 'publish', 'presence'] 
            }
            // ttl: 3600 * 1000 // 1 ora in ms (default di Ably è 1 ora)
        };
        console.log("api/ably-auth.js: Parametri del token:", JSON.stringify(tokenParams));

        // Chiamata a createTokenRequest
        // Questa funzione restituisce una Promise con l'oggetto TokenRequest
        console.log("api/ably-auth.js: Chiamata a ably.auth.createTokenRequest...");
        const tokenRequestData = await ably.auth.createTokenRequest(tokenParams);
        // Se l'errore persiste, la riga sopra può essere sostituita con la seguente per un test:
        // const tokenRequestData = await ably.auth.createTokenRequest(tokenParams, null); 

        console.log("api/ably-auth.js: tokenRequestData ricevuta da Ably:", JSON.stringify(tokenRequestData));
        
        res.status(200).json(tokenRequestData);

    } catch (error) {
        console.error('api/ably-auth.js: ERRORE DETTAGLIATO durante la generazione del token Ably:');
        console.error('Messaggio:', error.message);
        console.error('Nome Errore:', error.name);
        console.error('Codice Status (se da API Ably):', error.statusCode);
        console.error('Codice Errore (se da API Ably):', error.code);
        console.error('Stack Trace:', error.stack); // Molto importante per il debug
        
        res.status(error.statusCode || 500).json({ 
            error: `Impossibile generare il token Ably: ${error.message}`,
            errorCode: error.code,
            errorName: error.name
        });
    }
}
