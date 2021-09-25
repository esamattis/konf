import rl from "readline";
import { z, ZodType } from "zod";

export const ZodCall = z
    .object({
        name: z.string(),
        callKey: z.string(),
        payload: z.object({}),
    })
    .strict();

export const ZodResponse = z
    .object({
        name: z.string(),
        callKey: z.string(),
        response: z.object({}).passthrough(),
        error: z.optional(z.string()),
    })
    .strict();

async function onLine(
    stream: NodeJS.ReadableStream,
    onLine: (line: string) => any,
) {
    const lineReader = rl.createInterface({
        input: stream,
        terminal: false,
    });

    for await (const line of lineReader) {
        console.error("got line", line);
        onLine(line);
    }
}

export type ToAsyncFunctions<Type extends {}> = {
    [Property in keyof Type as Type[Property] extends (...args: any[]) => any
        ? Property
        : never]: Type[Property] extends (...args: any[]) => any
        ? (
              payload: Parameters<Type[Property]>[0],
          ) => Promise<ReturnType<Type[Property]>>
        : never;
};

export async function onZodMessage<Z extends ZodType<any, any, any>>(
    type: Z,
    stream: NodeJS.ReadableStream,
    onZodMessage: (call: ReturnType<Z["parse"]>) => any,
) {
    await onLine(stream, (line) => {
        let data;

        try {
            data = JSON.parse(line);
        } catch (error) {
            console.error("Failed to parse line", error);
        }

        const call = type.safeParse(data);

        if (call.success) {
            onZodMessage(call.data);
        } else {
            console.error("Failed to parse call data", call.error);
        }
    });
}

export interface RCPApi {
    doStuff(payload: { ding: string }): { contents: string };
    doStuff2(payload: { ding: string }): { contents: string };
    boo: string;
}

export function sendMessage(stream: NodeJS.WritableStream, payload: {}) {
    stream.write(JSON.stringify(payload) + "\n");
}
