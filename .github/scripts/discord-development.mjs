import { createPublicKey, verify } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const env = process.env;
const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
const repo = env.GITHUB_REPOSITORY;
const mobile = repo.endsWith("/moggcord-mobile");
const project = mobile ? "Moggcord Mobile" : "Moggcord Desktop";
const repository = env.GITHUB_SERVER_URL + "/" + repo;
const revisionPattern = /^(?!0{40}$)[a-f0-9]{40}$/;
const versionPattern = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const messagePath = join(env.RUNNER_TEMP, "discord-message.json");
const releasePath = join(env.RUNNER_TEMP, "discord-release.json");
const noMentions = { parse: [] };
const website = "https://moggcord.cc";
const screenshotUrl = "https://raw.githubusercontent.com/" + repo + "/main/docs/screenshots/plugin-management.png";

async function request(url, label, options = {}) {
    try {
        return await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(15000) });
    } catch {
        throw new Error(label + " request failed.");
    }
}

async function json(response, label) {
    if (!response.ok) throw new Error(label + " returned HTTP " + response.status + ".");
    return response.json();
}

async function github(path) {
    const response = await request(env.GITHUB_API_URL + "/repos/" + repo + path, "GitHub", {
        headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json" }
    });
    return response.status === 404 ? null : json(response, "GitHub");
}

async function discord(suffix, method, payload) {
    const webhook = env.DISCORD_WEBHOOK_URL ?? "";
    if (!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook)) {
        throw new Error("Set DISCORD_DEVELOPMENT_WEBHOOK_URL to the Discord webhook URL.");
    }
    const response = await request(webhook + suffix, "Discord", {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload)
    });
    return response.status === 404 && method === "GET" ? null : json(response, "Discord");
}

function changesUrl(before, after) {
    return repository + (revisionPattern.test(before) ? "/compare/" + before + "..." : "/commit/") + after;
}

async function post() {
    const { before, after } = event;
    if (!revisionPattern.test(after) || after !== env.GITHUB_SHA) throw new Error("Invalid push revision.");
    const url = changesUrl(before, after);
    const subject = event.head_commit?.message?.split(/\r?\n/, 1)[0]?.trim();
    const backtick = String.fromCharCode(96);
    const summary = subject ? backtick + subject.replaceAll(backtick, "'").slice(0, 220) + backtick : "New changes on main.";
    const message = await discord("?wait=true", "POST", {
        allowed_mentions: noMentions,
        embeds: [{
            title: project + " updated",
            url,
            description: summary + "\n\n[View changes](" + url + ")",
            color: 0x808080,
            footer: { text: "main · " + after.slice(0, 7) },
            image: { url: screenshotUrl }
        }]
    });
    if (!/^\d{17,20}$/.test(message.id) || message.embeds?.[0]?.url !== url) {
        throw new Error("Discord did not confirm the update.");
    }
    writeFileSync(messagePath, JSON.stringify({ id: message.id, before, sha: after }));
    console.log("Discord confirmed one development update.");
}

function tagVersion(tag) {
    const version = typeof tag === "string" && tag.replace(mobile ? /^(?:(?:ios|android)-)?v/ : /^v/, "");
    return version && versionPattern.test(version) ? version : null;
}

async function githubRelease() {
    const build = event.workflow_run;
    const tag = event.release?.tag_name ?? (tagVersion(build?.head_branch) ? build.head_branch : null);
    if (tag && !tagVersion(tag)) return null;
    const release = await github(tag ? "/releases/tags/" + encodeURIComponent(tag) : "/releases/latest");
    const version = tagVersion(release?.tag_name);
    if (!version || release.draft || !release.published_at) return null;
    const expected = mobile
        ? [["Android APK", "Moggcord-Mobile-Android-v" + version + ".apk"], ["iOS IPA", "Moggcord-Mobile-iOS-v" + version + ".ipa"]]
        : [["Windows", "Moggcord-Installer.exe"], ["macOS", "Moggcord-Installer-macOS.dmg"],
           ["Linux AppImage", "Moggcord-Installer-Linux.AppImage"], ["Linux DEB", "Moggcord-Installer-Linux.deb"]];
    const downloads = expected.flatMap(([label, name]) => {
        const url = repository + "/releases/download/" + encodeURIComponent(release.tag_name) + "/" + name;
        return release.assets?.some(asset => asset.name === name && asset.state === "uploaded" && asset.size > 0 &&
            asset.browser_download_url === url) ? [{ label, url }] : [];
    });
    if (!downloads.length) return null;
    const commit = await github("/commits/" + encodeURIComponent(release.tag_name));
    if (!revisionPattern.test(commit?.sha) || (build && build.head_sha !== commit.sha)) return null;
    return { version, sha: commit.sha, downloads };
}

async function websiteRelease() {
    const envelope = await json(await request(website + "/mobile/updates/ios/manifest.json", "Moggcord"), "Moggcord");
    const header = readFileSync(new URL("../../ios/UpdatePublicKey.h", import.meta.url), "utf8");
    const raw = Buffer.from(/moggcord_update_key\s*=\s*"([A-Za-z0-9+/=]+)"/.exec(header)?.[1] ?? "", "base64");
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"),
        y: raw.subarray(33, 65).toString("base64url") }, format: "jwk" });
    const payload = Buffer.from(envelope.payload, "base64");
    if (!verify("sha256", payload, key, Buffer.from(envelope.signature, "base64"))) {
        throw new Error("The mobile release signature is invalid.");
    }
    const { schema, platform, version, revision } = JSON.parse(payload);
    if (schema !== 1 || platform !== "ios" || !versionPattern.test(version) || !revisionPattern.test(revision)) {
        throw new Error("Invalid mobile release metadata.");
    }
    const downloads = await Promise.all([["Android APK", "Android", "apk"], ["iOS IPA", "iOS", "ipa"]]
        .map(async ([label, target, extension]) => {
            const name = "Moggcord-Mobile-" + target + "-v" + version + "." + extension;
            const url = website + "/downloads/" + name;
            const response = await request(url, "Mobile download", { method: "HEAD" });
            return response.ok && Number(response.headers.get("content-length")) > 0 &&
                response.headers.get("content-disposition") === 'attachment; filename="' + name + '"'
                ? { label, url } : null;
        }));
    return { version, sha: revision, downloads: downloads.filter(Boolean) };
}

async function lookup() {
    const release = mobile && !event.release ? await websiteRelease() : await githubRelease();
    if (!release?.downloads.length) return console.log("No published downloads to attach.");
    const name = "discord-message-" + release.sha;
    const result = await github("/actions/artifacts?name=" + name + "&per_page=30");
    const artifact = result?.artifacts?.find(item => item.name === name && !item.expired &&
        item.workflow_run?.head_sha === release.sha && item.workflow_run.head_branch === "main" &&
        String(item.workflow_run.head_repository_id) === env.GITHUB_REPOSITORY_ID);
    if (!artifact) return console.log("No Discord announcement for v" + release.version + " (" + release.sha.slice(0, 7) + ").");
    writeFileSync(releasePath, JSON.stringify(release));
    appendFileSync(env.GITHUB_OUTPUT, "artifact_id=" + artifact.id + "\nrun_id=" + artifact.workflow_run.id + "\n");
}

function isNewer(version, reference) {
    const parts = version.split(".").map(Number);
    const other = reference.split(".").map(Number);
    const firstDifference = parts.findIndex((part, index) => part !== other[index]);
    return firstDifference !== -1 && parts[firstDifference] > other[firstDifference];
}

async function edit() {
    const release = JSON.parse(readFileSync(releasePath, "utf8"));
    const { id, before, sha } = JSON.parse(readFileSync(join(env.RUNNER_TEMP, "discord-release", "discord-message.json"), "utf8"));
    if (!/^\d{17,20}$/.test(id) || sha !== release.sha) throw new Error("Invalid Discord announcement reference.");
    const path = "/messages/" + id;
    const message = await discord(path, "GET");
    if (!message) return console.log("The Discord announcement was removed.");
    const [embed] = message.embeds ?? [];
    if (embed?.title !== project + " updated" || embed.url !== changesUrl(before, sha)) {
        throw new Error("The Discord announcement does not match the release.");
    }
    const releaseField = embed.fields?.find(field => field.name === "Release");
    const previous = /^\*\*v(\d+\.\d+\.\d+)\*\*/.exec(releaseField?.value ?? "")?.[1];
    const value = "**v" + release.version + "**\n" + release.downloads.map(({ label, url }) => "[" + label + "](" + url + ")").join(" · ");
    if (previous && isNewer(previous, release.version)) return;
    if (releaseField?.value === value && embed.image?.url === screenshotUrl) return;
    const { title, url, description, footer } = embed;
    const image = { url: screenshotUrl };
    const fields = (embed.fields ?? []).filter(field => field.name !== "Release").concat({ name: "Release", value });
    const updated = await discord(path, "PATCH", {
        allowed_mentions: noMentions,
        embeds: [{ title, url, description, color: 0x808080, footer, image, fields }]
    });
    if (updated.id !== id || !updated.embeds?.[0]?.fields?.some(field => field.name === "Release" && field.value === value)) {
        throw new Error("Discord did not confirm the release links.");
    }
    console.log("Updated the existing Discord announcement for v" + release.version + ".");
}

const operations = { post, lookup, edit };
const operation = operations[process.argv[2]];
if (typeof operation !== "function") throw new Error("Unknown Discord notification operation.");
await operation();
