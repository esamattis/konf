import "source-map-support/register";
import { sh } from "sh-thunk";
import {
    onZodMessage,
    sendMessage,
    AsAsync,
    ZodCall,
    ZodResponse,
} from "./shared";
import { z } from "zod";
import { RPCApi } from "./rpc";

export interface HostWorkerOptions {
    readable: NodeJS.ReadableStream;
    writable: NodeJS.WritableStream;
    handlers: AsAsync<RPCApi>;
}

export class HostWorker {
    options: HostWorkerOptions;

    handlers: AsAsync<RPCApi>;

    constructor(options: HostWorkerOptions) {
        this.options = options;
        this.handlers = options.handlers;
    }

    sendResponse(response: z.infer<typeof ZodResponse>) {
        sendMessage(this.options.writable, response);
    }

    init() {
        const genericHandlers: Record<string, (...args: any) => Promise<any>> =
            this.handlers;

        void onZodMessage(ZodCall, this.options.readable, async (msg) => {
            const handler = genericHandlers[msg.name];

            if (!handler) {
                this.sendResponse({
                    name: msg.name,
                    callKey: msg.callKey,
                    response: {
                        ok: false,
                        error: `Method "${msg.name}" not implemented on the server`,
                    },
                });
                return;
            }

            let responseValue;

            try {
                responseValue = await handler(...msg.args);
            } catch (error) {
                console.error(`RPC method "${msg.name}" failed`, error);
                this.sendResponse({
                    name: msg.name,
                    callKey: msg.callKey,
                    response: {
                        ok: false,
                        error: String(error),
                    },
                });
                return;
            }

            this.sendResponse({
                name: msg.name,
                callKey: msg.callKey,
                response: {
                    ok: true,
                    value: responseValue,
                },
            });
        });
    }
}
