const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusMessage = document.getElementById('statusMessage');
const transcriptionArea = document.getElementById('transcriptionArea');
const responseArea = document.getElementById('responseArea');

let isRecording = false; // Per tenere traccia se stiamo "registrando"

// SIMULAZIONE: In futuro, qui useremo le API del browser per registrare l'audio reale
// e inviarlo. Per ora, simuliamo l'invio di testo.

startButton.addEventListener('click', async () => {
    if (isRecording) return; // Evita registrazioni multiple
    isRecording = true;

    statusMessage.textContent = 'Leonardo sta ascoltando...';
    transcriptionArea.textContent = ''; // Pulisce trascrizione precedente
    responseArea.textContent = '';    // Pulisce risposta precedente
    startButton.disabled = true;
    stopButton.disabled = false;

    // SIMULAZIONE dell'utente che parla per qualche secondo
    console.log('Simulazione: Utente inizia a parlare...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simula 2 secondi di parlato

    const userText = "Ciao Leonardo, come stai oggi?"; // Testo utente simulato
    transcriptionArea.textContent = `Tu: ${userText}`;
    console.log(`Simulazione: Utente ha detto: "${userText}"`);

    statusMessage.textContent = 'Elaborazione della richiesta...';

    try {
        // Chiamata al nostro backend (che sarà una serverless function su Vercel)
        const response = await fetch('/api/communicate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: userText }),
        });

        if (!response.ok) {
            throw new Error(`Errore dal server: ${response.statusText}`);
        }

        const data = await response.json();
        responseArea.textContent = `Leonardo: ${data.reply}`;
        statusMessage.textContent = 'Leonardo ha risposto.';
        console.log('Risposta ricevuta dal backend:', data.reply);

    } catch (error) {
        console.error('Errore durante la comunicazione con il backend:', error);
        statusMessage.textContent = 'Errore nella comunicazione. Riprova.';
        responseArea.textContent = `Errore: ${error.message}`;
    } finally {
        isRecording = false;
        startButton.disabled = false;
        stopButton.disabled = true;
        console.log('Simulazione: Fine interazione.');
    }
});

stopButton.addEventListener('click', () => {
    // In una vera app, questo fermerebbe la registrazione audio e/o la risposta della IA
    isRecording = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    statusMessage.textContent = 'Conversazione interrotta dall\'utente.';
    console.log('Simulazione: Utente ha interrotto la conversazione.');
    // Potremmo anche voler cancellare transcriptionArea e responseArea
});

// Stato iniziale
stopButton.disabled = true; // Il pulsante Stop è disabilitato all'inizio
statusMessage.textContent = 'Pronto per iniziare. Clicca "Parla".';
