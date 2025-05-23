// Questo file sarà una Serverless Function su Vercel.
// Gestirà le richieste che arrivano a /api/communicate

export default async function handler(req, res) {
    if (req.method === 'POST') {
        try {
            const { message } = req.body; // Il messaggio inviato dal frontend

            console.log('Backend: Messaggio ricevuto dal frontend:', message);

            // SIMULAZIONE della logica di OpenAI
            // In una vera app, qui useresti la tua chiave API OpenAI
            // per inviare 'message' a un modello GPT e ottenere una risposta.
            let aiReply = "Non ho ancora imparato a rispondere a questo, ma sto studiando!";
            if (message && message.toLowerCase().includes('ciao')) {
                aiReply = "Ciao! Sono Leonardo, una IA simulata. Come posso aiutarti (in modo simulato)?";
            } else if (message && message.toLowerCase().includes('come stai')) {
                aiReply = "Sto funzionando al meglio delle mie capacità simulate! Grazie per aver chiesto.";
            }

            console.log('Backend: Risposta IA simulata:', aiReply);

            // Invia la risposta simulata al frontend
            res.status(200).json({ reply: aiReply });

        } catch (error) {
            console.error('Backend: Errore nella gestione della richiesta:', error);
            res.status(500).json({ error: 'Errore interno del server (simulato)' });
        }
    } else {
        // Gestisce altri metodi HTTP (GET, PUT, etc.) se necessario, o restituisce errore
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Metodo ${req.method} Non Permesso`);
    }
}
