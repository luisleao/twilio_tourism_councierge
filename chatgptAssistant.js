require("dotenv").config();

const { OpenAI } = require('openai');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');



class ChatGPTAssistant extends EventEmitter {
    constructor() {
        super();
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.phoneNumber = null;
        this.messages = [];
        this.tools = [];
        this.systemPrompt = "You are a helpful tourism assistant.";
        this._loadAssistantMD();
    }

    _loadAssistantMD() {
        // Lê o arquivo assistant.md e extrai system prompt e funções (tools)
        try {
            const assistantPrompt = JSON.parse(fs.readFileSync(path.join(__dirname, 'assistant.json'), 'utf8'));
            this.systemPrompt = assistantPrompt.system_prompt.join('\n');
            this.tools = assistantPrompt.tools;
        } catch (err) {
            // fallback
            console.error('ERROR LOADING ASSISTANT!', err);
            this.systemPrompt = "You are a helpful tourism assistant.";
            this.tools = [];
        }
    }

    setPhoneNumber(phoneNumber) {
        this.phoneNumber = phoneNumber;
        // this.messages.push(
        //     {
        //         role: 'system',
        //         content: ` The user's phone number is ${this.phoneNumber}.`
        //     }
        // )
    }

    async createThread(initialPrompt) {
        // Inicia o histórico com a mensagem de sistema e, se houver, o número do usuário
        this.messages = [
            {
                role: 'system',
                content: this.systemPrompt +
                    (initialPrompt ?? '') +
                    (this.phoneNumber ? `\nThe user's phone number is ${this.phoneNumber}.` : "")
            }
        ];
    }

    async sendAssistant(message) {
        console.log('ASSISTANT', message);
        const assistantMessage = {
            role: 'assistant',
            content: message,
        }
        this.messages.push(assistantMessage);
        this.emit('message', message);

    }
    async sendMessage(message) {
        console.log('USER', message);
        if (!this.messages || this.messages.length === 0) {
            await this.createThread();
        }

        const userMessage = {
            role: 'user',
            content: message,
        }
        this.messages.push(userMessage);

        const completion = await this.openai.chat.completions.create({
            model: "o4-mini",
            messages: this.messages,
            temperature: 1,
            tools: this.tools.length > 0 ? this.tools : [],
            tool_choice: "auto", //this.tools.length > 0 ? "auto" : null,
            stream: false
        });

        const choice = completion.choices[0];
        let assistantMessage = choice.message.content || '';
        let functionCalls = [];

        // Se houver chamada de função
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            functionCalls = choice.message.tool_calls.map(tc => ({
                name: tc.function.name,
                arguments: tc.function.arguments
            }));
            // Emit events for each function call and collect results
            for (const call of functionCalls) {
                let args;
                try {
                    args = JSON.parse(call.arguments);
                } catch {
                    args = call.arguments;
                }
                if (call.name === 'send_whatsapp') {
                    this.emit('send_whatsapp', args);
                    
                } else if (call.name === 'end_call') {
                    this.emit('end_call', args);
                }
                // Não adicione mensagens com role: 'function' ao histórico!
                // TODO: return function messages.
            }
        } else {
            this.sendAssistant(assistantMessage);
            // const assistantMsg = {
            //     role: 'assistant',
            //     content: assistantMessage
            // };
            // if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
            //     assistantMsg.tool_calls = choice.message.tool_calls;
            // }
            // this.messages.push(assistantMsg);
            // console.log('MESSAGE', this.messages.length, assistantMsg);
        }

        return {
            text: assistantMessage,
            functionCalls
        };
    }

    async interrupt() {
        // Não aplicável para chat.completions (não há execução para cancelar)
    }

    async closeThread() {
        this.messages = [];
    }
}

module.exports = ChatGPTAssistant;