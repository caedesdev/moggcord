/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createBridge } from "./bridge.mjs";
import { bridgePort, defaultBuild, parseLink, trustedOrigin } from "./core.mjs";
import { prepareCompiler } from "./compiler.mjs";

export function createManagedService(config, dependencies = {}) {
    if (trustedOrigin(config.origin) !== "https://moggcord.cc" || !/^\d+\.\d+\.\d+$/.test(config.version)
        || !/^[a-f0-9]{64}$/.test(config.controlToken ?? "") || !config.sourceRoot || !config.dataDir || !config.mirrorDir)
        throw new Error("The community service configuration is invalid.");
    if (typeof MOGGCORD_SERVICE_VERSION !== "undefined" && config.version !== MOGGCORD_SERVICE_VERSION)
        throw new Error("The community service does not match this Moggcord version. Restart Moggcord to load its current service.");
    let service;
    const reply = (res, status, data) => {
        res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(data));
    };
    const handleControl = async (req, res, state) => {
        if (req.url !== "/v1/service-control") return false;
        const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        if (req.headers.origin || !/^[a-f0-9]{64}$/.test(supplied)
            || !timingSafeEqual(Buffer.from(supplied), Buffer.from(config.controlToken))) {
            reply(res, 403, { error: "This request is not authorized." });
            return true;
        }
        try {
            if (req.method !== "POST") throw new Error("Use a service control request.");
            const chunks = []; let size = 0;
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 16384) throw new Error("The service request is too large.");
                chunks.push(chunk);
            }
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const busy = [...service.jobs.values()].some(job => !["complete", "failed"].includes(job.state));
            if (input.action === "status") reply(res, 200, { version: config.version, pid: process.pid, busy });
            else if (input.action === "shutdown") {
                if (busy) reply(res, 409, { error: "An installation is running. The current service will be kept until it finishes." });
                else {
                    reply(res, 202, { stopped: true });
                    service.server.close();
                    service.server.closeIdleConnections();
                }
            } else if (input.action === "link") reply(res, 202, state.submit(parseLink(input.link, config.origin)));
            else throw new Error("The service action is not supported.");
        } catch (error) { reply(res, 400, { error: error.message }); }
        return true;
    };
    service = createBridge(config, {
        ...dependencies,
        handleControl,
        prepareSource: dependencies.prepareSource ?? (async (sourceRoot, report = () => {}) => {
            await (dependencies.prepareCompiler ?? prepareCompiler)(sourceRoot, {
                version: config.version, previousSourceRoot: config.previousSourceRoot,
                progress: text => report("building", text)
            });
        }),
        build: dependencies.build ?? defaultBuild
    });
    return service;
}

export async function runManagedService(configFile, link, dependencies = {}) {
    const config = JSON.parse(await readFile(resolve(configFile), "utf8"));
    const input = link ? parseLink(link, config.origin) : null;
    const port = dependencies.port ?? bridgePort;
    try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/service-control`, {
            method: "POST", headers: { Authorization: `Bearer ${config.controlToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ action: input ? "link" : "status", ...(input ? { link } : {}) }), signal: AbortSignal.timeout(1500)
        });
        if (response.ok) return null;
    } catch (error) {
        if (error.name !== "TypeError" && error.name !== "TimeoutError") throw error;
    }
    const service = createManagedService(config, dependencies);
    await new Promise((done, reject) => {
        service.server.once("error", reject);
        service.server.listen(port, "127.0.0.1", done);
    });
    if (config.pidFile) await writeFile(config.pidFile, String(process.pid), { mode: 0o600 });
    if (input) service.submit(input);
    return service;
}

if (process.argv.includes("--config")) {
    const option = name => process.argv[process.argv.indexOf(name) + 1];
    runManagedService(option("--config"), process.argv.includes("--link") ? option("--link") : null)
        .catch(error => { process.stderr.write(`Community downloads could not start: ${error.message}\n`); process.exitCode = 1; });
}
