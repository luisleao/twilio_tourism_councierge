require("dotenv").config();


const { OpenAI } = require('openai');
const EventEmitter = require('events');

class ChatGPTAssistant extends EventEmitter {
    constructor() {
        super();
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        this.assistantId = process.env.OPENAI_ASSISTANT_ID;
        this.threadId = null;
        this.currentRunId = null;
        this.phoneNumber = null;
    }

    setPhoneNumber(phoneNumber) {
        this.phoneNumber = phoneNumber;
    }


    async createThread() {
        const thread = await this.openai.beta.threads.create();
        this.threadId = thread.id;

        // Adiciona mensagem de sistema com o número do participante, se houver
        if (this.phoneNumber) {
            await this.openai.beta.threads.messages.create(this.threadId, {
                role: 'assistant',
                content: `The user's phone number is ${this.phoneNumber}.`,
            });
        }

        return this.threadId;
    }

    async sendMessage(message) {
        if (!this.threadId) {
            await this.createThread();
        }
        await this.openai.beta.threads.messages.create(this.threadId, {
            role: 'user',
            content: message,
        });
        const run = await this.openai.beta.threads.runs.create(this.threadId, {
            assistant_id: this.assistantId,
        });

        this.currentRunId = run.id;

        let status = run.status;
        let runResult = run;
        while (status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
            await new Promise(res => setTimeout(res, 1000));
            runResult = await this.openai.beta.threads.runs.retrieve(this.threadId, run.id);

            if (runResult.status === 'requires_action' && runResult.required_action) {
                const toolCalls = runResult.required_action.submit_tool_outputs.tool_calls;
                const toolOutputs = [];
                for (const call of toolCalls) {
                    let args;
                    switch (call.function.name) {
                        case 'send_whatsapp':
                            try {
                                args = JSON.parse(call.function.arguments);
                            } catch {
                                args = call.function.arguments;
                            }
                            this.emit('send_whatsapp', args);
                            toolOutputs.push({
                                tool_call_id: call.id,
                                output: JSON.stringify({ status: 'sent' })
                            });
                            break;
                        case 'change_language':
                            toolOutputs.push({
                                tool_call_id: call.id,
                                output: call.function.arguments
                            });
                            break;
                        case 'end_call':
                            try {
                                args = JSON.parse(call.function.arguments);
                            } catch {
                                args = call.function.arguments;
                            }
                            this.emit('end_call', args);
                            toolOutputs.push({
                                tool_call_id: call.id,
                                output: JSON.stringify({ status: 'ended' })
                            });
                            break;
                        default:
                            // Optionally handle unknown functions
                            toolOutputs.push({
                                tool_call_id: call.id,
                                output: JSON.stringify({ error: 'Unknown function' })
                            });
                            break;
                    }
                }
                await this.openai.beta.threads.runs.submitToolOutputs(this.threadId, run.id, {
                    tool_outputs: toolOutputs
                });
            }
            status = runResult.status;
        }

        this.currentRunId = null;

        if (status === 'completed') {
            const messages = await this.openai.beta.threads.messages.list(this.threadId);
            const lastMsg = messages.data.find(m => m.role === 'assistant');
            let functionCalls = [];
            if (lastMsg && lastMsg.content) {
                functionCalls = lastMsg.content
                    .filter(c => c.type === 'tool_calls')
                    .map(c => c.tool_calls)
                    .flat();
            }
            return {
                text: lastMsg && lastMsg.content[0]?.text?.value ? lastMsg.content[0].text.value : '',
                functionCalls
            };
        } else {
            throw new Error('Assistant run failed or cancelled');
        }
    }

    async interrupt() {
        if (this.threadId && this.currentRunId) {
            try {
                await this.openai.beta.threads.runs.cancel(this.threadId, this.currentRunId);
            } catch (err) {
                // Ignore errors if already cancelled
            }
            this.currentRunId = null;
        }
    }

    async closeThread() {
        this.threadId = null;
        this.currentRunId = null;
    }
}

module.exports = ChatGPTAssistant;