/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using MoggcordInstaller;
using System.Security.Cryptography;
using System.Text.Json;
using System.Reflection;
using System.Diagnostics;

if (args.Contains("--fixture-process"))
{
    Console.WriteLine("fixture ready");
    await Task.Delay(Timeout.Infinite);
    return;
}

var root = Path.Combine(Path.GetTempPath(), "moggcord-installer-test-" + Guid.NewGuid());
var resources = Path.Combine(root, "resources");
Directory.CreateDirectory(Path.Combine(resources, "app"));
File.WriteAllText(Path.Combine(resources, "app.asar"), "Discord fixture");
var packagePath = Path.Combine(resources, "app", "package.json");
var backend = new MoggcordBackend(null, null);
var fixtureProcesses = new List<Process>();
typeof(MoggcordBackend).GetField("_distDir", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(backend, Path.Combine(root, "cache"));
typeof(MoggcordBackend).GetField("_exeDir", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(backend, root);
var checks = 0;
void Check(bool value, string label)
{
    if (!value) throw new Exception(label);
    checks++;
}
string Snapshot() => string.Join("\n", Directory.GetFiles(root, "*", SearchOption.AllDirectories).Order()
    .Select(file => file + ":" + Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file))) + ":" + File.GetLastWriteTimeUtc(file).Ticks));
async Task<JsonDocument> Job(string action, string path)
{
    using var started = JsonDocument.Parse(backend.StartOperation(action, path, false));
    Check(started.RootElement.GetProperty("started").GetBoolean(), "Job must start");
    var until = DateTime.UtcNow.AddSeconds(5);
    while (DateTime.UtcNow < until)
    {
        var status = JsonDocument.Parse(backend.GetInjectStatus());
        if (status.RootElement.GetProperty("state").GetString() != "running") return status;
        status.Dispose();
        await Task.Delay(10);
    }
    throw new Exception("Guarded operation unexpectedly tried to install or download files");
}

async Task<Process> StartFixture(string directory, string executableName)
{
    Directory.CreateDirectory(directory);
    foreach (var file in Directory.GetFiles(AppContext.BaseDirectory))
    {
        var destination = Path.Combine(directory, Path.GetFileName(file));
        if (!File.Exists(destination)) File.Copy(file, destination);
    }
    var executable = Path.Combine(directory, executableName);
    File.Copy(Path.Combine(AppContext.BaseDirectory, "MoggcordInstaller.Tests.exe"), executable, true);
    var process = Process.Start(new ProcessStartInfo(executable, "--fixture-process")
    {
        UseShellExecute = false,
        CreateNoWindow = true,
        RedirectStandardOutput = true
    })!;
    fixtureProcesses.Add(process);
    var ready = await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10));
    Check(ready == "fixture ready", "The isolated process fixture must start");
    return process;
}
try
{
    File.WriteAllText(packagePath, "{ \"name\" : \"Moggcord\", \"version\": \"old\" }");
    Check(await backend.IsInjected(resources), "Recognize a Moggcord package independently of JSON whitespace");
    var before = Snapshot();
    using (var result = JsonDocument.Parse(await backend.Inject(resources)))
        Check(result.RootElement.GetProperty("result").GetString() == "alreadyInstalled", "Legacy Install must skip an existing installation");
    using (var status = await Job("install", resources))
    {
        Check(status.RootElement.GetProperty("state").GetString() == "done", "Install skip must finish successfully");
        Check(status.RootElement.GetProperty("result").GetString() == "alreadyInstalled", "Async Install must skip an existing installation");
    }
    Check(Snapshot() == before, "Install skip must not modify any Discord fixture files");

    File.WriteAllText(packagePath, "{\"name\":\"vencord\",\"description\":\"moggcord\"}");
    Check(!await backend.IsInjected(resources), "A mention of Moggcord must not identify another mod as Moggcord");
    Check(await backend.HasThirdPartyMod(resources), "A Moggcord mention must not hide a Vencord installation");
    before = Snapshot();
    foreach (var action in new[] { "repair", "uninstall", "install", "invalid" })
    {
        using var status = await Job(action, resources);
        Check(status.RootElement.GetProperty("state").GetString() == "error", action + " must be rejected before touching another mod");
    }
    using (var result = JsonDocument.Parse(await backend.Uninject(resources)))
        Check(!result.RootElement.GetProperty("success").GetBoolean(), "Legacy Uninstall must reject another mod");
    Check(Snapshot() == before, "Rejected operations must preserve another mod");

    File.Delete(packagePath);
    File.WriteAllText(Path.Combine(resources, "app.asar"), "require('C:/Vencord/dist/patcher.js')");
    Check(await backend.HasThirdPartyMod(resources), "Detect a Vencord ASAR loader without an app/package.json");
    Check(!await backend.IsInjected(resources), "A Vencord ASAR loader is not Moggcord");

    using (var status = await Job("install", root))
        Check(status.RootElement.GetProperty("state").GetString() == "error", "Reject a folder that is not Discord resources");
    File.WriteAllText(packagePath, "{broken JSON");
    Check(!await backend.IsInjected(resources), "A broken package must not crash installation detection");

    var customRoot = Path.Combine(root, "Custom Discord location");
    foreach (var version in new[] { "1.0.99", "1.0.100" })
    {
        var app = Path.Combine(customRoot, "app-" + version);
        Directory.CreateDirectory(Path.Combine(app, "resources"));
        File.WriteAllText(Path.Combine(app, "DiscordCanary.exe"), "path-only executable fixture");
        File.WriteAllText(Path.Combine(app, "resources", "app.asar"), "Discord archive fixture");
    }
    var latestApp = Path.Combine(customRoot, "app-1.0.100");
    var latestResources = Path.Combine(latestApp, "resources");
    foreach (var input in new[] { customRoot, latestApp, latestResources + Path.DirectorySeparatorChar, '"' + Path.Combine(latestApp, "discordcanary.EXE") + '"' })
    {
        using var result = JsonDocument.Parse(await backend.ResolveDiscord(input));
        Check(result.RootElement.GetProperty("success").GetBoolean(), "Resolve a root, app, resources or quoted executable path");
        var target = result.RootElement.GetProperty("target");
        Check(target.GetProperty("path").GetString() == latestResources, "Resolve to the latest numeric Discord version");
        Check(target.GetProperty("name").GetString() == "Discord Canary", "Identify the channel by its executable in a custom folder");
    }
    using (var invalid = JsonDocument.Parse(await backend.ResolveDiscord(root)))
        Check(!invalid.RootElement.GetProperty("success").GetBoolean(), "Reject a custom folder without Discord");

    var processRoot = Path.Combine(root, "process-fixtures");
    var selectedApp = Path.Combine(processRoot, "selected", "app-1.0.100");
    var unrelatedApp = Path.Combine(processRoot, "selected-other", "app-1.0.100");
    var selectedResources = Path.Combine(selectedApp, "resources");
    Directory.CreateDirectory(selectedResources);
    var selectedProcess = await StartFixture(selectedApp, "DiscordCanary.exe");
    var unrelatedProcess = await StartFixture(unrelatedApp, "DiscordCanary.exe");
    var helperProcess = await StartFixture(selectedApp, "DiscordSystemHelper.exe");
    var processName = typeof(MoggcordBackend).GetMethod("GetDiscordProcessName", BindingFlags.NonPublic | BindingFlags.Static)!;
    Check((string)processName.Invoke(null, new object[] { selectedResources })! == "DiscordCanary", "Custom targets use the actual executable name before any shutdown");
    var imagePath = typeof(MoggcordBackend).GetMethod("GetProcessExecutablePath", BindingFlags.NonPublic | BindingFlags.Static)!;
    Check(string.Equals((string)imagePath.Invoke(null, new object[] { selectedProcess.Id })!, Path.Combine(selectedApp, "DiscordCanary.exe"), StringComparison.OrdinalIgnoreCase), "Read the executable path using limited process access");
    var close = typeof(MoggcordBackend).GetMethod("KillDiscord", BindingFlags.NonPublic | BindingFlags.Instance)!;
    close.Invoke(backend, new object[] { selectedResources });
    Check(selectedProcess.WaitForExit(5000), "Close the selected fixture installation");
    Check(!unrelatedProcess.HasExited, "Keep another installation with the same executable name running");
    Check(!helperProcess.HasExited, "System helpers are not shutdown targets");
    close.Invoke(backend, new object[] { selectedResources });
    Check(!unrelatedProcess.HasExited && !helperProcess.HasExited, "Repeated shutdown tolerates an already-closed target");
    Console.WriteLine(checks + " native installer checks passed. Only isolated fixture processes were closed.");
}
finally
{
    foreach (var process in fixtureProcesses)
    {
        if (!process.HasExited) { process.Kill(); process.WaitForExit(5000); }
        process.Dispose();
    }
    if (Path.GetDirectoryName(Path.GetFullPath(root)) != Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)
        || !Path.GetFileName(root).StartsWith("moggcord-installer-test-"))
        throw new Exception("Unexpected fixture cleanup path");
    Directory.Delete(root, true);
}
