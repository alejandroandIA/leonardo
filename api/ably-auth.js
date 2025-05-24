// File: api/ably-auth.js
import Ably from 'ably';

export default async function handler(req, res) {
    if (!process.env.ABLY_SERVER_API_KEY) {
        console.error("FATAL ERROR: ABLY_SERVER_API_KEY non è configurata.");
        return res.status(500).json({ error: 'Configurazione del server Ably mancante.' });
    }

    try {
        // Usa Ably.Rest per operazioni server-side come la creazione di token
        const ably = new Ably.Rest({ key: process.env.ABLY_SERVER_API_KEY });
        
        const clientIdForToken = 'client-' + Math.random().toString(36).substring(2, 11);

        const tokenParams = {
            clientId: clientIdForToken,
            capability: { 
                'leonardo-chat': ['subscribe', 'publish', 'presence'] 
            }
            // ttl: 3600 * 1000 // opzionale
        };

        // createTokenRequest restituisce una Promise che si risolve con la TokenRequest (oggetto JSON)
        const tokenRequestData = await ably.auth.createTokenRequest(tokenParams);
        
        console.log(`Token Ably (TokenRequestData) generato con successo per clientId: ${clientIdForToken}`);
        // Invia l'oggetto TokenRequest direttamente, come si aspetta l'SDK client di Ably
        res.status(200).json(tokenRequestData);

    } catch (error) {
        console.error('Errore durante la generazione del token Ably:', error.message, error.statusCode, error.code, error.stack);
        res.status(error.statusCode || 500).json({ 
            error: `Impossibile generare il token Ably: ${error.message}`,
            errorCode: error.code 
        });
    }
}
