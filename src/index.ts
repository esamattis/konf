import { build } from "esbuild";
import { HostClient } from "./host-client";
import { modType } from "./mod";

async function main() {
    await build({
        entryPoints: ["src/host-entry.ts"],
        target: "node16",
        format: "cjs",
        platform: "node",
        sourcemap: "inline",
        bundle: true,
        outdir: ".konf",
    });

    const vagrant = await HostClient.connect({
        username: "git",
        host: "valu-playbooks.test",
    });

    //     const file2 = File({ path: "/dong", content: "" });

    const file1 = File({ path: "boo.txt", content: "sdafs3d" });
    //     const jes = File({ path: "/jest", content: "", deps: [file2] });

    //     const files = Role({
    //         name: "some files",
    //         deps: [File({ path: "/dong", content: "" })],
    //     });

    //     const res = await vagrant.applyMod(file2);

    //     vagrant.applyMod(jes);

    const cmd = Shell({
        command: "ls -l",
        requireChanged: [file1],
    });

    //     vagrant.applyMod(file1);
    vagrant.applyMod(cmd);

    await vagrant.waitPendingMods();

    //     console.log(await vagrant.rpc.shell("ls sdfsdj"));

    //     vagrant.applyMod(jes);

    //     const foo = await vagrant.rpc.readFile("/etc/hosts");
    //     console.log("DONE", foo);

    const code = await vagrant.disconnect({ exitCode: 5 });
}

main();
