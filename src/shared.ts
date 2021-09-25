import { ChildProcessWithoutNullStreams } from "child_process";
import rl from "readline";
import { z, ZodType } from "zod";

export const ZodCall = z
    .object({
        name: z.string(),
        callKey: z.string(),
        args: z.array(z.any()),
    })
    .strict();

export const ZodResponse = z
    .object({
        name: z.string(),
        callKey: z.string(),

        response: z.union([
            z.object({
                ok: z.literal(true),
                value: z.any(),
            }),
            z.object({
                ok: z.literal(false),
                error: z.string(),
            }),
        ]),
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
        onLine(line);
    }
}

export type AsAsync<Type extends {}> = {
    [Property in keyof Type as Type[Property] extends (...args: any[]) => any
        ? Property
        : never]: Type[Property] extends (...args: any[]) => any
        ? (
              ...args: Parameters<Type[Property]>
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

export interface RPCApi {
    shell(
        code: string,
        options?: {
            bin?: string;
            flags?: string;
            allowNonZeroExit?: boolean;
            output?: "stdout" | "stderr" | "both" | "none";
        },
    ): { code: number; output: string };
    readFile(path: string): string | undefined;
    writeFile(path: string, content: string): { changed: boolean };
    exit(code?: number): void;
}

export function sendMessage(stream: NodeJS.WritableStream, payload: {}) {
    stream.write(JSON.stringify(payload) + "\n");
}

export async function waitExit(
    cmd: ChildProcessWithoutNullStreams,
): Promise<number> {
    if (cmd.exitCode !== null) {
        return cmd.exitCode;
    }

    return await new Promise((resolve, reject) => {
        cmd.on("exit", (code) => {
            resolve(code ?? 0);
        });
        cmd.on("error", reject);
    });
}
