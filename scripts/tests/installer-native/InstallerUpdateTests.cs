/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using MoggcordInstaller;
using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;

#nullable enable

internal static class InstallerUpdateTests
{
    internal static async Task Run(string root, Action<bool, string> check)
    {
        var assembly = typeof(MoggcordBackend).Assembly.Location;
        var payload = File.ReadAllBytes(assembly);
        var info = FileVersionInfo.GetVersionInfo(assembly);
        var version = new Version(info.FileMajorPart, info.FileMinorPart, info.FileBuildPart);
        var hash = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
        var assetUrl = $"https://github.com/{InstallerSelfUpdater.Repository}/releases/download/v{version}/{InstallerSelfUpdater.AssetName}";
        check(info.ProductName == "Moggcord Installer", "Update fixtures use the real installer assembly metadata");

        JsonNode Metadata() => JsonSerializer.SerializeToNode(new
        {
            draft = false, prerelease = false, tag_name = "v" + version,
            assets = new[] { new { name = InstallerSelfUpdater.AssetName, state = "uploaded", size = payload.Length,
                digest = "sha256:" + hash, browser_download_url = assetUrl } }
        })!;

        async Task<(bool launched, int downloads, List<string> paths, List<InstallerUpdateStatus> states, string cache)> Attempt(
            Action<JsonNode>? change = null, byte[]? bytes = null, string? cache = null, Version? current = null,
            bool offline = false, bool launchFails = false, bool insecureRedirect = false, CancellationToken token = default)
        {
            var metadata = Metadata();
            change?.Invoke(metadata);
            var downloads = 0;
            var paths = new List<string>();
            var states = new List<InstallerUpdateStatus>();
            cache ??= Path.Combine(root, "self-update", Guid.NewGuid().ToString("N"));
            using var client = new HttpClient(new ReleaseHttpHandler(request =>
            {
                token.ThrowIfCancellationRequested();
                if (offline) throw new HttpRequestException("Offline fixture");
                if (request.RequestUri!.AbsoluteUri.EndsWith("/releases/latest"))
                    return new HttpResponseMessage(HttpStatusCode.OK) { RequestMessage = request, Content = new StringContent(metadata.ToJsonString()) };
                downloads++;
                check(request.RequestUri.AbsoluteUri == $"https://github.com/{InstallerSelfUpdater.Repository}/releases/download/{metadata["tag_name"]}/{InstallerSelfUpdater.AssetName}", "Only the expected installer release asset is requested");
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    RequestMessage = insecureRedirect ? new HttpRequestMessage(HttpMethod.Get, "http://example.invalid/installer.exe") : request,
                    Content = new ByteArrayContent(bytes ?? payload)
                };
            }));
            var updater = new InstallerSelfUpdater(client, current ?? new Version(1, 0, 0), cache, states.Add,
                path => { paths.Add(path); return !launchFails; });
            var launched = await updater.TryUpdateAsync(token);
            return (launched, downloads, paths, states, cache);
        }

        var fresh = await Attempt();
        check(fresh.launched && fresh.paths.Count == 1 && fresh.downloads == 1, "A newer verified installer is downloaded and launched once: " + JsonSerializer.Serialize(fresh.states));
        check(File.ReadAllBytes(fresh.paths[0]).SequenceEqual(payload), "Only the verified payload reaches the executable cache");
        check(fresh.states.Any(s => s.state == "downloading" && s.percent > 0) && fresh.states.Last().state == "launching", "Installer download reports real progress before launch");
        var cached = await Attempt(cache: fresh.cache);
        check(cached.launched && cached.downloads == 0 && cached.paths[0] == fresh.paths[0], "A later launch reuses the verified cached installer without downloading it again");
        var damaged = payload.ToArray(); damaged[0] ^= 1;
        File.WriteAllBytes(fresh.paths[0], damaged);
        var repaired = await Attempt(cache: fresh.cache);
        check(repaired.launched && repaired.downloads == 1 && File.ReadAllBytes(repaired.paths[0]).SequenceEqual(payload), "A modified cached installer is downloaded and verified again before launch");

        foreach (var current in new[] { version, new Version(version.Major + 1, 0, 0) })
        {
            var unchanged = await Attempt(current: current);
            check(!unchanged.launched && unchanged.paths.Count == 0 && unchanged.downloads == 0 && unchanged.states.Last().state == "current", "Equal or older releases never download, launch or downgrade the installer");
        }
        foreach (var flag in new[] { "draft", "prerelease" })
        {
            var ignored = await Attempt(metadata => metadata[flag] = true);
            check(!ignored.launched && ignored.downloads == 0 && ignored.paths.Count == 0, "Draft and prerelease installers are ignored");
        }
        foreach (var change in new Action<JsonNode>[] {
            metadata => metadata["tag_name"] = "v../99",
            metadata => metadata["assets"]![0]!["browser_download_url"] = "https://example.invalid/installer.exe",
            metadata => metadata["assets"]![0]!["digest"] = "",
            metadata => metadata["assets"]![0]!["size"] = 0,
            metadata => metadata["assets"]![0]!["size"] = long.MaxValue,
            metadata => metadata["assets"]![0]!["state"] = "new",
            metadata => metadata["assets"]![0]!["name"] = "Different.exe"
        })
        {
            var invalid = await Attempt(change);
            check(!invalid.launched && invalid.downloads == 0 && invalid.paths.Count == 0 && invalid.states.Last().state == "unavailable", "Untrusted or incomplete release metadata keeps the current installer usable");
        }
        foreach (var bytes in new[] { damaged, payload[..^1], payload.Concat(new byte[] { 0 }).ToArray() })
        {
            var invalid = await Attempt(bytes: bytes);
            check(!invalid.launched && invalid.paths.Count == 0 && invalid.states.Last().state == "unavailable", "Corrupt or truncated executables are never launched");
            check(!Directory.EnumerateFiles(invalid.cache, "*", SearchOption.AllDirectories).Any(), "Rejected downloads leave no partial executable behind");
        }
        var wrongVersion = new Version(version.Major, version.Minor, version.Build + 1);
        var mismatched = await Attempt(metadata => metadata["tag_name"] = "v" + wrongVersion);
        check(!mismatched.launched && mismatched.paths.Count == 0, "A release version must match its allowed download URL");
        var wrongBinary = await Attempt(metadata =>
        {
            metadata["tag_name"] = "v" + wrongVersion;
            metadata["assets"]![0]!["browser_download_url"] = $"https://github.com/{InstallerSelfUpdater.Repository}/releases/download/v{wrongVersion}/{InstallerSelfUpdater.AssetName}";
        });
        check(!wrongBinary.launched && wrongBinary.downloads == 1 && wrongBinary.paths.Count == 0, "A valid checksum cannot bypass an incorrect executable version");
        var insecure = await Attempt(insecureRedirect: true);
        check(!insecure.launched && insecure.paths.Count == 0, "An insecure download redirect is rejected");
        var unavailable = await Attempt(offline: true);
        check(!unavailable.launched && unavailable.downloads == 0 && unavailable.paths.Count == 0 && unavailable.states.Last().state == "unavailable", "Offline startup returns to the current installer");
        var unstartable = await Attempt(launchFails: true);
        check(!unstartable.launched && unstartable.states.Last().state == "unavailable", "A failed handoff keeps the current installer open");
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        var canceled = await Attempt(token: cancellation.Token);
        check(!canceled.launched && canceled.paths.Count == 0, "Closing during the update cancels the handoff");
        var blockedCache = Path.Combine(root, "blocked-update-cache");
        File.WriteAllText(blockedCache, "Existing file");
        var unwritable = await Attempt(cache: blockedCache);
        check(!unwritable.launched && unwritable.paths.Count == 0 && File.ReadAllText(blockedCache) == "Existing file", "An unwritable update cache does not overwrite existing files or prevent setup");
    }
}
