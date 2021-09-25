import { appendFileSync } from "fs";
import { inspect } from "util";
import { HostWorker } from "./host-worker";
import { RPCHandlers } from "./rpc";

function log(...args: any[]) {
    const msg = args
        .map((part) => {
            if (typeof part === "string") {
                return part;
            }

            return inspect(part);
        })
        .join(" ");

    appendFileSync("/tmp/code.log", msg + "\n");
}

console.log = log;

process.stderr.write = (data) => {
    log(data);
    return true;
};

const worker = new HostWorker({
    writable: process.stdout,
    readable: process.stdin,
    handlers: RPCHandlers,
});

worker.init();
