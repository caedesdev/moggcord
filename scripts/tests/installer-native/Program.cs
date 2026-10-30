/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using MoggcordInstaller;
using System.Security.Cryptography;
using System.Text.Json;
using System.Reflection;

var root = Path.Combine(Path.GetTempPath(), "moggcord-installer-test-" + Guid.NewGuid());
var resources = Path.Combine(root, "resources");
Directory.CreateDirectory(Path.Combine(resources, "app"));
File.WriteAllText(Path.Combine(resources, "app.asar"), "Discord fixture");
var packagePath = Path.Combine(resources, "app", "package.json");
var backend = new MoggcordBackend(null, null);
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
    Console.WriteLine(checks + " native installer guard checks passed. No real Discord installation was changed.");
}
finally
{
    if (Path.GetDirectoryName(Path.GetFullPath(root)) != Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)
        || !Path.GetFileName(root).StartsWith("moggcord-installer-test-"))
        throw new Exception("Unexpected fixture cleanup path");
    Directory.Delete(root, true);
}
