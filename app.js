const express = require('express');
const path = require('path');
const twilio = require('twilio');
const http = require('http');
const WebSocket = require('ws');
const ChatGPTAssistant = require('./chatgptAssistant');

const app = express();
const PORT = 3000;

const DEFAULT_WELCOME_MESSAGE = `Hello, I amd your tourist guide in Asia! To start, tell me what is your perfect getaway and what would you like to experiment.`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }))
// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

app.all('/action', (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
        { voice: 'Google.am-ET-Wavenet-B'},
        `Thank you for trying this demo!`
    );
    res.contentType('application/xml');
    res.send(twiml.toString());
})

app.post('/message', (req, res) => {

    const twiml = new twilio.twiml.MessagingResponse();
    console.log('MESSAGE', req.body);

    twiml.message(`Thank you for reaching us!\n\nAt the moment this service isn't working. Please try again later.`)

    res.contentType('application/xml');
    res.send(twiml.toString());

    // TODO: receive user message, check if exists on Segment and run the bot
    // TODO: save on database the chat history or the assistant conversation id

});

app.all('/welcome', (req, res) => {
    
    console.log('CALL', req.body);

    // req.body
    // {
    //     ApplicationSid: 'AP364a8771f81d7c2a70dfeffb35bfa2dc',
    //     ApiVersion: '2010-04-01',
    //     Called: 'whatsapp:+5511933058313',
    //     Caller: 'whatsapp:+5511983370955',
    //     CallStatus: 'ringing',
    //     From: 'whatsapp:+5511983370955',
    //     CallSid: 'CAfa945c89dae51f52488bb622a311e08e',
    //     To: 'whatsapp:+5511933058313',
    //     Direction: 'inbound',
    //     AccountSid: 'AC04af808544efb60e1efdb39742839c50'
    // }

    // TODO: check req.body.From if starts with "whatsapp:"
    //       if true, get the data from Segment and change the welcome message, add params on ConversationRelay


    const twiml = new twilio.twiml.VoiceResponse();
    twiml.connect()
    const connect = twiml.connect({
        action: `https://${req.headers.host}/action`
    });
    const conversationRelay = connect.conversationRelay({
        url: `wss://${req.headers.host}/websocket`,
        welcomeGreeting: DEFAULT_WELCOME_MESSAGE,
        // ttsProvider: 'ElevenLabs',
        // voice: 'e5WNhrdI30aXpS2RSGm1', //UgBBYS2sOqTuMpoF3BR0

        interruptible: 'any',
        dtmfDetection: true,
        welcomeGreetingInterruptible: 'none',
    });
    // conversationRelay.language({
    //     code: 'pt-BR',
    //     ttsProvider: 'ElevenLabs',
    //     voice: 'CstacWqMhJQlnfLPxRG4',
    //     transcriptionProvider: 'google',
    //     speechModel: 'telephony',
    //     transcriptionProvider: 'Google'
    // });
    conversationRelay.language({
        code: 'en-US',
        ttsProvider: 'google',
        voice: 'en-US-Journey-O',
        speechModel: 'telephony',
        transcriptionProvider: 'Google'
    });

    res.contentType('application/xml');
    res.send(twiml.toString());
})

// --- WebSocket server setup ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/websocket' });

wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected', req.url);
    let phoneNumber = null;
    let whatsappNumber = null;

    // Cria uma nova instância do assistant para cada conexão
    const assistant = new ChatGPTAssistant();
    assistant.createThread();

    // Escuta o evento send_whatsapp
    assistant.on('send_whatsapp', (args) => {
        // Aqui você pode implementar o envio real ou apenas logar
        console.log('Sending WhatsApp message', args);
        // ws.send(JSON.stringify({
        //     type: 'send_whatsapp',
        //     ...args
        // }));
    });

    ws.on('message', async (data) => {
        const message = JSON.parse(data);
        console.log('MESSAGE', message);
        switch(message.type) {
            case 'setup':
                if (message.from.indexOf('whatsapp:') >= 0) {
                    phoneNumber = message.from.split('whatsapp:').join('');
                    whatsappNumber = message.from;
                }
                break;

            case 'interrupt':
                await assistant.interrupt();
                break;

            case 'prompt':
                try {
                    const response = await assistant.sendMessage(message.voicePrompt);

                    if (response.functionCalls && response.functionCalls.length > 0) {
                        for (const call of response.functionCalls) {
                            if (call.function.name === 'change_language') {
                                const args = JSON.parse(call.function.arguments);
                                ws.send(JSON.stringify({
                                    type: "language",
                                    ttsLanguage: args.ttsLanguage,
                                    transcriptionLanguage: args.transcriptionLanguage
                                }));
                                ws.send(JSON.stringify({
                                    type: "text",
                                    token: args.ttsLanguage === 'pt-BR'
                                        ? "Sim, eu posso falar em Português"
                                        : "Yes, we can talk in English!",
                                    last: true
                                }));
                                return;
                            }
                        }
                    }

                    ws.send(JSON.stringify({
                        type: 'text',
                        token: response.text,
                        last: true
                    }));
                } catch (err) {
                    ws.send(JSON.stringify({
                        type: 'text',
                        token: 'Sorry, there was an error processing your request.',
                        last: true
                    }));
                }
                break;
            case 'dtmf':

                // {
                //     "type": "play",
                //     "source": "https://api.twilio.com/cowbell.mp3",
                //     "loop": 1,
                //     "preemptible": false
                // }

                // {
                //     "type": "sendDigits",
                //     "digits": "9www4085551212"
                // }


                // {
                //     "type": "language",
                //     "ttsLanguage": "sv-SE",
                //     "transcriptionLanguage": "en-US"
                // }


                break;
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        assistant.closeThread();
    });
});
// --- End WebSocket server setup ---

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

