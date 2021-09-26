import { createHash } from "crypto";
import Path from "path";
import { promises as fs } from "fs";
import { exec, fileInfo } from "./shared";
import { cwd } from "process";

function hash(str: string) {
    const sum = createHash("sha1");
    sum.update(str);
    return sum.digest("hex");
}

export class Git {
    repo: string;
    repoPath: string;
    constructor(repo: string) {
        this.repo = repo;
        this.repoPath = Path.join(".konf", "git-repos", hash(this.repo));
    }

    async clone() {
        await fs.mkdir(Path.dirname(this.repoPath), { recursive: true });
        const info = await fileInfo(this.repoPath);

        if (!info) {
            await exec(["git", "clone", "--bare", this.repo, this.repoPath]);
        } else {
            await exec(["git", "fetch"], { cwd: this.repoPath });
        }
    }

    async pack(rev: string) {
        const cleanRevRes = await exec(["git", "rev-parse", rev], {
            cwd: this.repoPath,
        });

        const cleanRev = cleanRevRes.stdout.trim();

        const archivePath = Path.join(
            process.cwd(),
            ".konf",
            "git-archives",
            cleanRev + ".tar.gz",
        );

        await fs.mkdir(Path.dirname(archivePath), { recursive: true });

        const archiveInfo = await fileInfo(archivePath);

        if (archiveInfo) {
            return {
                cleanRev,
                path: archivePath,
            };
        }

        await exec(
            `git archive --format=tar.gz "${cleanRev}" . > "${archivePath}"`,
            {
                cwd: this.repoPath,
            },
        );

        return {
            cleanRev,
            path: archivePath,
        };
    }
}
