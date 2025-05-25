// File: api/session.js
// NOTA: "import fetch from "node-fetch";" è stato RIMOSSO.
// Si assume che la versione Node.js su Vercel abbia fetch globale.

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') { // Gestione preflight CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET', 'OPTIONS']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY non configurata nelle environment variables di Vercel." });
    }

    try {
        const openAIResponse = await fetch("https://api.openai.com/v1/realtime/sessions", { // fetch è usato direttamente
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-realtime-preview-2024-10-01", // Il tuo modello target
                voice: "alloy", // Scegli una voce: alloy, echo, fable, onyx, nova, shimmer
                // Esempio: instructions: "Sei un assistente AI amichevole. Rispondi in italiano."
            }),
        });

        if (!openAIResponse.ok) {
            const errorData = await openAIResponse.json();
            console.error("Errore OpenAI API:", errorData);
            return res.status(openAIResponse.status).json({ error: "Errore durante la creazione della sessione OpenAI.", details: errorData });
        }

        const data = await openAIResponse.json();

        if (!data.client_secret || !data.client_secret.value) {
            console.error("Risposta da OpenAI non contiene client_secret.value:", data);
            return res.status(500).json({ error: "Formato token effimero inatteso." });
        }

        res.setHeader('Access-Control-Allow-Origin', '*'); 
        return res.status(200).json({ client_secret: data.client_secret.value });

    } catch (error) {
        console.error("Errore nella serverless function:", error);
        return res.status(500).json({ error: "Errore interno del server." });
    }
}
