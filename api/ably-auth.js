// File: api/ably-auth.js
import Ably from 'ably';

export default async function handler(req, res) {
    if (!process.env.ABLY_SERVER_API_KEY) {
        console.error("FATAL ERROR: ABLY_SERVER_API_KEY non è configurata nelle variabili d'ambiente di Vercel.");
        return res.status(500).json({ error: 'Configurazione del server Ably mancante. Impossibile autenticare il client.' });
    }

    try {
        const ably = new Ably.Rest({ key: process.env.ABLY_SERVER_API_KEY });
        const clientIdForToken = 'client-' + Math.random().toString(36).substring(2, 11); // Genera un clientId casuale

        const tokenParams = {
            clientId: clientIdForToken,
            capability: { 
                // Permessi specifici per il canale che useremo
                'leonardo-chat': ['subscribe', 'publish', 'presence'] 
                // Puoi aggiungere altri canali o pattern se necessario
                // '*': ['subscribe', 'publish'] // Meno sicuro, dà accesso a tutti i canali
            },
            // ttl: 3600 * 1000 // opzionale: 1 ora in millisecondi
        };

        const tokenRequest = await ably.auth.createTokenRequest(tokenParams);
        
        console.log(`Token Ably generato con successo per clientId: ${clientIdForToken}`);
        res.status(200).json(tokenRequest); // Invia la TokenRequest (oggetto JSON) al client

    } catch (error) {
        console.error('Errore durante la generazione del token Ably:', error.message, error.statusCode, error.code);
        res.status(error.statusCode || 500).json({ 
            error: `Impossibile generare il token Ably: ${error.message}`,
            errorCode: error.code 
        });
    }
}
