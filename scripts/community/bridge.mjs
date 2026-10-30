/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bridgeName, bridgePort, fetchManifest, installEntry, manifestAddress, parseLink, trustedOrigin } from "./core.mjs";

export function createBridge(config, dependencies = {}) {
    const origin = trustedOrigin(config.origin);
    const jobs = new Map(); let active = null;
    const json = (res, status, body) => {
        res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(body));
    };
    const submit = input => {
        manifestAddress(input.manifest, origin);
        if (!/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) throw new Error("This installation link has no valid file fingerprint.");
        if (active) {
            if (active.manifest === input.manifest && active.sha256 === input.sha256) return active;
            throw new Error("Another installation is running. Wait for it to finish.");
        }
        const job = { id: randomUUID(), state: "downloading", message: "Downloading from the website…", manifest: input.manifest, sha256: input.sha256 };
        jobs.set(job.id, job); active = job;
        while (jobs.size > 20) jobs.delete(jobs.keys().next().value);
        Promise.resolve().then(async () => {
            const entry = await (dependencies.fetchManifest ?? fetchManifest)(input, origin);
            await (dependencies.install ?? installEntry)(entry, config, dependencies, (state, message) => Object.assign(job, { state, message }));
            Object.assign(job, { state: "complete", message: "Installed. Moggcord has been restarted." });
        }).catch(error => Object.assign(job, { state: "failed", message: error.message || "Installation failed. Your previous installation was kept." }))
            .finally(() => { if (active === job) active = null; });
        return job;
    };
    const server = http.createServer(async (req, res) => {
        if (req.headers.origin !== origin || !["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
            || req.headers.host !== `127.0.0.1:${server.address().port}`) return json(res, 403, { error: "This website is not connected to Moggcord." });
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Private-Network", "true");
        if (req.method === "OPTIONS") {
            if (!["GET", "POST"].includes(req.headers["access-control-request-method"])) return json(res, 405, { error: "Method not allowed." });
            res.setHeader("Access-Control-Allow-Methods", "GET, POST");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Moggcord-Install");
            return res.writeHead(204).end();
        }
        if (req.method === "GET" && req.url === "/v1/status") return json(res, 200, { name: bridgeName, protocol: 1, channel: config.channel });
        const match = req.url?.match(/^\/v1\/jobs\/([a-f0-9-]{36})$/);
        if (req.method === "GET" && match) return jobs.has(match[1]) ? json(res, 200, jobs.get(match[1])) : json(res, 404, { error: "Installation not found." });
        if (req.method !== "POST" || req.url !== "/v1/install") return json(res, 404, { error: "Not found." });
        if (req.headers["x-moggcord-install"] !== "1" || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""))
            return json(res, 415, { error: "Use the Moggcord installation button." });
        const chunks = []; let size = 0;
        try {
            for await (const chunk of req) { size += chunk.length; if (size > 8192) return json(res, 413, { error: "Request too large." }); chunks.push(chunk); }
            const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            return json(res, 202, submit(input));
        } catch (error) { return json(res, 400, { error: error.message }); }
    });
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    return { server, submit, jobs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const value = name => process.argv[process.argv.indexOf(name) + 1];
    const configFile = process.argv.includes("--config") ? value("--config") : join(process.env.APPDATA ?? "", "MoggcordCommunity", "config.json");
    const config = JSON.parse(readFileSync(configFile, "utf8"));
    const input = process.argv.includes("--link") ? parseLink(value("--link"), config.origin) : null;
    let running = false;
    try {
        const status = await fetch(`http://127.0.0.1:${bridgePort}/v1/status`, { headers: { Origin: config.origin }, signal: AbortSignal.timeout(1000) }).then(r => r.json());
        running = status.name === bridgeName && status.protocol === 1;
    } catch { running = false; }
    if (running) {
        if (input) {
            const response = await fetch(`http://127.0.0.1:${bridgePort}/v1/install`, { method: "POST", headers: { Origin: config.origin, "Content-Type": "application/json", "X-Moggcord-Install": "1" }, body: JSON.stringify(input) });
            if (!response.ok) throw new Error((await response.json()).error);
        }
    } else {
        const bridge = createBridge(config);
        bridge.server.on("error", error => { process.stderr.write(`Moggcord connection failed: ${error.message}\n`); process.exitCode = 1; });
        bridge.server.listen(bridgePort, "127.0.0.1", () => { if (input) bridge.submit(input); });
    }
}
