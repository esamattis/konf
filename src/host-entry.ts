import { HostWorker } from "./host-worker";
import { RPCHandlers } from "./rpc";

console.log = console.error;

const worker = new HostWorker({
    writable: process.stdout,
    readable: process.stdin,
    handlers: RPCHandlers,
});

worker.init();
