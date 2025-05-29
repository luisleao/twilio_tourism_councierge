require("dotenv").config();

const express = require('express');
const path = require('path');
const twilio = require('twilio');
const http = require('http');
const WebSocket = require('ws');
const ChatGPTAssistant = require('./chatgptAssistant');
const fs = require('fs');

const app = express();
const PORT = 3000;

const messages = JSON.parse(fs.readFileSync(path.join(__dirname, 'messages.json'), 'utf8'));
const DEFAULT_WELCOME_MESSAGE = messages.welcome_wired || `Hello, I amd your tourist guide in Asia! To start, tell me what is your perfect getaway and what would you like to experiment.`;

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, WHATSAPP_FROM_NUMBER, WHATSAPP_TEMPLATE_DEMO_SID } = process.env;


app.use(express.json());
app.use(express.urlencoded({ extended: true }))

// Serve static files from the "public" directory
// app.use(express.static(path.join(__dirname, 'public')));

app.all('/action', (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    // twiml.say(
    //     { voice: 'Google.am-ET-Wavenet-B'},
    //     `Thank you for trying this demo!`
    // );
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


    let welcomeGreeting = '';

    switch(req.body.From.toLowerCase().split(':')[0]) {
        case 'sip': //sip:0@twilioartemis.sip.twilio.com
            welcomeGreeting = messages.call_wired;
            break;
        case 'whatsapp': //whatsapp:+5511234567890
            // TODO: gather user data from Segment. Inject into the assistant directly.
            // .split('').join(' ')
            const firstName = 'WhatsApp User'; //req.body.From.split('whatsapp:').join('');
            welcomeGreeting = messages.call_whatsapp.split('{{firstname}}').join(firstName);
            break;
        default:
            welcomeGreeting = `Hello! I can't identify from where you are calling to this number. Please try again later!`;
    }

    

    if (req.body.From.indexOf('whatsapp:') >= 0) {
        // TODO: check req.body.From if starts with "whatsapp:"
        //       if true, get the data from Segment and change the welcome message, add params on ConversationRelay
    }


    const twiml = new twilio.twiml.VoiceResponse();
    twiml.connect()
    const connect = twiml.connect({
        action: `https://${req.headers.host}/action`
    });
    const conversationRelay = connect.conversationRelay({
        url: `wss://${req.headers.host}/websocket`,
        welcomeGreeting,
        interruptible: 'any',
        welcomeGreetingInterruptible: 'any',
        dtmfDetection: false,
        welcomeGreetingInterruptible: 'none',
        // ttsProvider: 'ElevenLabs',
        // voice: 'e5WNhrdI30aXpS2RSGm1', //UgBBYS2sOqTuMpoF3BR0
    });
    // conversationRelay.language({
    //     code: 'pt-BR',
    //     ttsProvider: 'ElevenLabs',
    //     voice: 'CstacWqMhJQlnfLPxRG4',
    //     transcriptionProvider: 'google',
    //     speechModel: 'telephony',
    //     transcriptionProvider: 'Google'
    // });
    // conversationRelay.language({
    //     code: 'en-US',
    //     ttsProvider: 'google',
    //     voice: 'en-US-Journey-O',
    //     speechModel: 'telephony',
    //     transcriptionProvider: 'Google'
    // });
    conversationRelay.language({
        code: 'en-US',
        ttsProvider: 'ElevenLabs',
        voice: 'CstacWqMhJQlnfLPxRG4',
        speechModel: 'nova-2-general',
        transcriptionProvider: 'Deepgram'
    });

    res.contentType('application/xml');
    res.send(twiml.toString());
})

// --- WebSocket server setup ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/websocket' });

wss.on('connection', (ws, req) => {
    let phoneNumber = null;
    let whatsappNumber = null;

    const assistant = new ChatGPTAssistant();

    // Listen send_whatsapp event
    assistant.on('send_whatsapp', async (args) => {
        // Aqui você pode implementar o envio real ou apenas logar
        console.log('Sending WhatsApp message', args);

        const client = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);


        const newMessage = {
            from: WHATSAPP_FROM_NUMBER,
            contentSid: WHATSAPP_TEMPLATE_DEMO_SID,
            // messagingServiceSid: WHATSAPP_MESSAGE_SERVICE_SID, 
            to: `whatsapp:${args.to}`,
            ContentVariables: JSON.stringify({ 
                "1": args.recommendation.toString()
            })
        };

        console.log('SENDING...', newMessage);

        await client.messages.create(newMessage).then(s => {
            console.log('MESSAGE RETURN', s);
        });   
        // ws.send(JSON.stringify({
        //     type: 'send_whatsapp',
        //     ...args
        // }));
    });

    // Listen end_call event
    assistant.on('end_call', (args) => {
        // Aqui você pode implementar o envio real ou apenas logar
        console.log('Ending Call', args);

        // ws.send(JSON.stringify({
        //     type: "text",
        //     token: messages.ending_call,
        //     last: true
        // }));
        setTimeout(()=>{
            ws.send(JSON.stringify(
                {
                    "type": "end",
                    "handoffData": "{\"reasonCode\":\"user-ended\"}"
                }
            ));
        }, 2000);
    });


    ws.on('message', async (data) => {
        const message = JSON.parse(data);
        console.log('DATA', message);

        switch(message.type) {
            case 'setup':
                if (message.from.indexOf('whatsapp:') >= 0) {
                    phoneNumber = message.from.split('whatsapp:').join('');
                    whatsappNumber = message.from;
                    assistant.setPhoneNumber(phoneNumber);
                }
                // Crie a thread após definir os números
                await assistant.createThread();
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


                // {
                //     "type": "end",
                //     "handoffData": "{\"reasonCode\":\"live-agent-handoff\", \"reason\": \"The caller wants to talk to a real person\"}"
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

server.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}/`);

        const client = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

        // const newMessage = {
        //     from: WHATSAPP_FROM_NUMBER,
        //     contentSid: WHATSAPP_TEMPLATE_DEMO_SID,
        //     // messagingServiceSid: WHATSAPP_MESSAGE_SERVICE_SID, 
        //     to: `whatsapp:+5511983370955`,
        //     ContentVariables: JSON.stringify({ 
        //         "1": "this is a test"
        //     })
        // };

        // console.log('SENDING...', newMessage);

        // await client.messages.create(newMessage).then(s => {
        //     console.log('MESSAGE RETURN', s);
        // });   


});

