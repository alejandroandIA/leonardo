// File: api/communicate.js
import OpenAI from 'openai';

// Inizializza il client OpenAI con la chiave API dalle variabili d'ambiente
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Vercel imposta questo dalla tua Environment Variable
});

export default async function handler(req, res) {
    if (req.method === 'POST') {
        try {
            const incomingData = req.body;
            const userMessage = incomingData.message;

            if (typeof userMessage === 'undefined' || userMessage.trim() === '') {
                console.error('Backend: "message" non trovato o vuoto nel corpo della richiesta:', incomingData);
                return res.status(400).json({ error: 'Il campo "message" è richiesto e non può essere vuoto.' });
            }

            console.log('Backend: Messaggio ricevuto dal frontend:', userMessage);

            // Chiamata all'API OpenAI Chat Completions usando gpt-4o
            const completion = await openai.chat.completions.create({
                model: "gpt-4o", // MODELLO IMPOSTATO A GPT-4o
                messages: [
                    { 
                        role: "system", 
                        content: "Sei Leonardo, un assistente IA conversazionale. Sii amichevole, disponibile e rispondi in modo naturale, come se fossi una persona. Mantieni le risposte concise quando appropriato, ma sentiti libero di elaborare se necessario per essere utile." 
                    },
                    { 
                        role: "user", 
                        content: userMessage 
                    }
                ],
                // max_tokens: 250, // Opzionale
                // temperature: 0.7, // Opzionale
            });

            const aiReply = completion.choices[0].message.content;

            if (!aiReply) {
                console.error('Backend: OpenAI ha restituito una risposta vuota.');
                return res.status(500).json({ error: 'OpenAI ha restituito una risposta vuota.' });
            }
            
            console.log('Backend: Risposta da OpenAI (gpt-4o):', aiReply);

            res.status(200).json({ reply: aiReply.trim() });

        } catch (error) {
            console.error('Backend: Errore durante la chiamata a OpenAI o nella gestione della richiesta:', error);
            
            let errorMessage = 'Errore interno del server durante la comunicazione con OpenAI.';
            if (error instanceof OpenAI.APIError) {
                console.error('Dettagli errore OpenAI:', error.status, error.message, error.code, error.type);
                errorMessage = `Errore da OpenAI (Status: ${error.status}): ${error.message}`;
                 if (error.code === 'insufficient_quota') {
                    errorMessage = 'Quota OpenAI insufficiente. Controlla il tuo piano e i limiti di utilizzo.';
                } else if (error.status === 401) {
                    errorMessage = 'Autenticazione OpenAI fallita. Verifica la tua API Key.';
                } else if (error.status === 429) {
                    errorMessage = 'Troppe richieste a OpenAI (Rate Limit). Riprova più tardi.';
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            res.status(500).json({ error: errorMessage });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Metodo ${req.method} Non Permesso`);
    }
}
