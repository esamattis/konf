import { HostWorker } from "./host-worker";

const worker = new HostWorker({
    writable: process.stdout,
    readable: process.stdin,
});

worker.init();
