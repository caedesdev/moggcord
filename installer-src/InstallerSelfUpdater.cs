/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("MoggcordInstaller.Tests")]

namespace MoggcordInstaller
{
    internal sealed record InstallerUpdateStatus(string state, string message, double percent = 0, string error = "");

    internal sealed class InstallerSelfUpdater
    {
        internal const string Repository = "caedesdev/moggcord";
        internal const string AssetName = "Moggcord-Installer.exe";
        private const long MaximumInstallerSize = 512L * 1024 * 1024;
        private const int DownloadBufferSize = 64 * 1024;
        private readonly HttpClient http;
        private readonly Version currentVersion;
        private readonly string cacheDirectory;
        private readonly Action<InstallerUpdateStatus> report;
        private readonly Func<string, bool> launch;

        internal InstallerSelfUpdater(HttpClient http, Version currentVersion, string cacheDirectory,
            Action<InstallerUpdateStatus> report, Func<string, bool> launch)
        {
            this.http = http;
            this.currentVersion = currentVersion;
            this.cacheDirectory = Path.GetFullPath(cacheDirectory);
            this.report = report;
            this.launch = launch;
            http.Timeout = Timeout.InfiniteTimeSpan;
            http.DefaultRequestHeaders.UserAgent.ParseAdd($"Moggcord-Installer/{currentVersion.ToString(3)}");
        }

        internal async Task<bool> TryUpdateAsync(CancellationToken cancellationToken)
        {
            try
            {
                report(new("checking", "Checking for a newer installer…"));
                using var checkTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                checkTimeout.CancelAfter(TimeSpan.FromSeconds(8));
                var json = await http.GetStringAsync($"https://api.github.com/repos/{Repository}/releases/latest", checkTimeout.Token);
                using var document = JsonDocument.Parse(json);
                var release = document.RootElement;
                if (release.GetProperty("draft").GetBoolean() || release.GetProperty("prerelease").GetBoolean())
                    return Current();
                var tag = release.GetProperty("tag_name").GetString();
                if (!Regex.IsMatch(tag ?? "", @"^v\d+\.\d+\.\d+$") || !Version.TryParse(tag.Substring(1), out var version))
                    throw new InvalidDataException("The installer release version is invalid.");
                if (version <= currentVersion) return Current();

                var asset = default(JsonElement);
                foreach (var candidate in release.GetProperty("assets").EnumerateArray())
                    if (candidate.GetProperty("name").GetString() == AssetName) { asset = candidate; break; }
                if (asset.ValueKind == JsonValueKind.Undefined)
                    throw new InvalidDataException("The latest installer is not available yet.");
                var url = $"https://github.com/{Repository}/releases/download/{tag}/{AssetName}";
                var digest = asset.GetProperty("digest").GetString();
                var size = asset.GetProperty("size").GetInt64();
                if (asset.GetProperty("state").GetString() != "uploaded" || asset.GetProperty("browser_download_url").GetString() != url
                    || !Regex.IsMatch(digest ?? "", @"^sha256:[a-fA-F0-9]{64}$") || size <= 0 || size > MaximumInstallerSize)
                    throw new InvalidDataException("The installer download could not be verified.");
                var hash = digest.Substring("sha256:".Length).ToLowerInvariant();
                var path = Path.Combine(cacheDirectory, version.ToString(3), hash, AssetName);
                using var downloadTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                downloadTimeout.CancelAfter(TimeSpan.FromMinutes(2));
                if (!await IsValidAsync(path, hash, size, version, downloadTimeout.Token))
                    await DownloadAsync(url, path, hash, size, version, downloadTimeout.Token);
                cancellationToken.ThrowIfCancellationRequested();
                report(new("launching", $"Opening installer {version.ToString(3)}…", 100));
                if (!launch(path)) throw new IOException("The new installer could not be started.");
                return true;
            }
            catch (Exception error)
            {
                Debug.WriteLine($"Installer update unavailable: {error.Message}");
                report(new("unavailable", "Opening your current installer.", error: error.Message));
                return false;
            }
        }

        private bool Current()
        {
            report(new("current", "Your installer is up to date."));
            return false;
        }

        private static async Task<bool> IsValidAsync(string path, string hash, long size, Version version, CancellationToken token)
        {
            if (!File.Exists(path) || new FileInfo(path).Length != size) return false;
            using var file = File.OpenRead(path);
            var actual = Convert.ToHexString(await SHA256.HashDataAsync(file, token));
            if (!actual.Equals(hash, StringComparison.OrdinalIgnoreCase)) return false;
            var info = FileVersionInfo.GetVersionInfo(path);
            return info.ProductName == "Moggcord Installer"
                && new Version(info.FileMajorPart, info.FileMinorPart, info.FileBuildPart) == version;
        }

        private async Task DownloadAsync(string url, string path, string hash, long size, Version version, CancellationToken token)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var temporary = Path.Combine(Path.GetDirectoryName(path), Guid.NewGuid().ToString("N") + ".exe");
            try
            {
                report(new("downloading", $"Downloading installer {version.ToString(3)}…"));
                using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
                response.EnsureSuccessStatusCode();
                if (response.RequestMessage?.RequestUri?.Scheme != Uri.UriSchemeHttps)
                    throw new InvalidDataException("The installer download needs a secure connection.");
                if (response.Content.Headers.ContentLength is long length && length != size)
                    throw new InvalidDataException("The installer download size is incorrect.");
                using var source = await response.Content.ReadAsStreamAsync(token);
                await using (var destination = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                    DownloadBufferSize, FileOptions.Asynchronous))
                {
                    var buffer = new byte[DownloadBufferSize];
                    long received = 0;
                    int count;
                    while ((count = await source.ReadAsync(buffer, token)) > 0)
                    {
                        received += count;
                        if (received > size) throw new InvalidDataException("The installer download is larger than expected.");
                        await destination.WriteAsync(buffer.AsMemory(0, count), token);
                        report(new("downloading", $"Downloading installer {version.ToString(3)}…", received * 100d / size));
                    }
                }
                if (!await IsValidAsync(temporary, hash, size, version, token))
                    throw new InvalidDataException("The installer download is incomplete or damaged.");
                File.Move(temporary, path, true);
            }
            finally
            {
                if (File.Exists(temporary)) File.Delete(temporary);
            }
        }
    }
}
