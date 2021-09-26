import { build } from "esbuild";
import { Git } from "./git";
import { HostClient } from "./host-client";
import { m } from "./mod-types";

async function main() {
    //     const git = new Git("git@github.com:esamattis/multip.git");
    //     await git.clone();
    //     const res = await git.pack("master");
    //     console.log(res);

    //     return;
    await build({
        entryPoints: ["src/host-entry.ts"],
        target: "node16",
        format: "cjs",
        platform: "node",
        sourcemap: "inline",
        bundle: true,
        outdir: ".konf",
    });
    console.log("build done");

    const vagrant = await HostClient.connect({
        username: "git",
        host: "valu-playbooks.test",
    });

    //     const file2 = File({ path: "/dong", content: "" });

    const file1 = m.file({
        dest: "boo.txt",
        content: "wooh22",
    });

    //     const nginx = m.service({
    //         service: "nginx",
    //         action: "restart",
    //         requireChanged: [file1],
    //     });

    //     vagrant.applyMod(nginx);
    //     vagrant.applyMod(
    //         m.custom({
    //             name: "my test",
    //             async exec(host) {
    //                 return "clean";
    //             },
    //         }),
    //     );

    const multip = m.git({
        repo: "git@github.com:esamattis/multip.git",
        dest: "/tmp/git-test",
        rev: "master",
    });

    await vagrant.applyMod(file1);
    await vagrant.applyMod(multip);

    //     const file2 = m.file({
    //         path: "boo2.txt",
    //         content: "sdafs3d",
    //         deps: [file1],
    //     });

    //     const file3 = m.file({
    //         path: "boo3.txt",
    //         content: "sdafs3d",
    //         deps: [file1],
    //     });

    //     const jes = File({ path: "/jest", content: "", deps: [file2] });

    //     const files = Role({
    //         name: "some files",
    //         deps: [File({ path: "/dong", content: "" })],
    //     });

    //     const res = await vagrant.applyMod(file2);

    //     vagrant.applyMod(jes);

    //     const cmd = m.shell({
    //         command: "ls -l",
    //         requireChanged: [file1],
    //     });

    //     //     vagrant.applyMod(file1);
    //     vagrant.applyMod(cmd);

    //     const role = m.role({ name: "my-role", deps: [file1] });
    //     console.log("wat");
    //     console.log(await vagrant.rpc.shell("whoami"));
    //     console.log("wut");

    //     vagrant.applyMod(m.apt({ package: "htop", deps: [file1] }));

    //     await vagrant.applyMod(file1);

    await vagrant.waitPendingMods();

    //     console.log(await vagrant.rpc.shell("ls sdfsdj"));

    //     vagrant.applyMod(jes);

    //     const foo = await vagrant.rpc.readFile("/etc/hosts");
    //     console.log("DONE", foo);

    const code = await vagrant.disconnect({});
}

main();
