# Datenschutzerklärung

[Dokumentation](../README.md) / Datenschutz · [English](privacy-policy.md)

Stand: 5. November 2026.

**Entwurf.** Die Identität des Verantwortlichen und vollständige, geprüfte Angaben zum gehosteten Dienst liegen nicht vor. Dieser Text beschreibt die Software und ist keine vollständige Datenschutzerklärung nach Art. 13 DSGVO.

Datenschutzkontakt des Projekts: [owner@moggcord.cc](mailto:owner@moggcord.cc).

## Geltungsbereich

Diese Hinweise betreffen den Moggcord-Installer, den Desktop-Client und den lokalen Community-Connector in diesem Repository. Optionale Plugins, eingerichtete Cloud-Dienste, Discord, GitHub und die gehostete Community-Website können weitere Datenverarbeitungen mit sich bringen. Auch die Hinweise ihrer jeweiligen Betreiber sind zu beachten. Dieser Text behauptet weder, dass alle Daten auf deinem Gerät bleiben, noch dass jedes Plugin dieselben Daten verarbeitet.

## Daten auf deinem Gerät

Der Client speichert Einstellungen, aktivierte Plugins, Themes und QuickCSS lokal. Plugins können zusätzliche Informationen in eigenen Einstellungen, Dateien oder Browser-Datenbanken ablegen. Je nach aktivierten Funktionen können dazu Zugangsdaten, exportierte Unterhaltungen, zwischengespeicherte oder protokollierte Nachrichten und Anhänge gehören. Diagnosedateien können Pfade, Fehlermeldungen und weitere private Informationen enthalten.

Der Installer verändert die ausgewählte Discord-Installation und legt die Moggcord-Dateien ab. Der lokale Connector speichert Konfiguration, Community-Quellcode und Build-Dateien. Er lauscht auf der lokalen Loopback-Adresse und prüft die eingerichtete Website-Origin. Er ist nicht für den Betrieb als öffentlich erreichbarer Server vorgesehen.

Siehe [Speicherorte](../reference/file-locations.md) und [Sicherung und Wiederherstellung](../guides/backup-and-restore.md). Behandle exportierte Einstellungen und Plugin-Daten als privat. Exportfilter garantieren nicht, dass jeder sensible Wert entfernt wurde.

## Netzwerkverbindungen

| Funktion | Übertragene oder angeforderte Daten |
| --- | --- |
| Discord | Der Client verwendet weiterhin Discord-Dienste für Konto, Nachrichten, Sprache und weitere Discord-Funktionen. Es gilt auch [Discords Datenschutzerklärung](https://discord.com/privacy). |
| Updates und Downloads | Versionsprüfungen und Downloads verbinden sich mit GitHub und dessen Auslieferungsinfrastruktur. Der Empfänger erhält Verbindungsdaten, darunter die anfragende IP-Adresse und Anfrage-Header. |
| Online-Themes und Medien | Die eingerichteten Server erhalten Anfragen nach Stylesheets, Bildern und anderen Ressourcen sowie Verbindungsdaten. |
| Cloud-Sync | Bei verbundenem Konto und aktivierter Synchronisierung erhält der eingerichtete Cloud-Dienst Einstellungen und QuickCSS. Einstellungen können sensible Plugin-Werte enthalten. Die Standardadresse in diesem Quellcode ist `https://cloud.equicord.org/`; die Einstellungssynchronisierung ist standardmäßig aus. |
| Community-Funktionen | Die eingerichtete Website liefert Manifeste, Quellcode und Medien. Die freigegebene Website kann beim lokalen Connector den Installationsstatus abfragen und die Installation ausgewählter Community-Inhalte anfordern. |
| Optionale Plugins | Abhängig von Quellcode und Einstellungen können Plugins weitere Dienste kontaktieren und funktionsbezogene Daten übertragen. Prüfe sie vor dem Aktivieren. |

Komprimierung, Base64-Kodierung und Prüfsummen sind keine Ende-zu-Ende-Verschlüsselung. Aktiviere Cloud-Sync nicht in der Annahme, dass dessen Betreiber die synchronisierten Daten nicht lesen kann.

Auch beim Öffnen dieses Repositorys, bei Fehlermeldungen auf GitHub und bei GitHub Sponsors werden GitHub-Dienste verwendet. Siehe [GitHubs Datenschutzhinweise](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Gehostete Website und öffentliche Uploads

Website-Konten, Login-Anbieter, öffentliche Profile, Uploads, Downloadstatistiken und Supportanfragen sind gesonderte serverseitige Verarbeitungen. Bei einem öffentlichen Plugin- oder Theme-Upload können Quellcode, Dateien und Autorenangaben für andere Besucher sichtbar werden. Lade keine Zugangsdaten oder persönlichen Informationen hoch, die du nicht veröffentlichen möchtest.

Das Konto-Backend der Website und die aktive Hosting-Konfiguration gehören nicht zu diesem Repository. Dieser Entwurf legt weder den tatsächlichen Hoster noch Verarbeitungsorte, Rechtsgrundlagen, Empfänger, Garantien bei Übermittlungen in Drittländer oder serverseitige Speicherfristen fest. Diese Angaben und die Identität des Verantwortlichen müssen geprüft und ergänzt werden, bevor dieser Text als vollständige Datenschutzerklärung der gehosteten Website dienen kann.

## Speicherung und Entfernung

Es gibt keine gemeinsame Speicherfrist für sämtliche Plugin-Daten. Lokale Informationen können bestehen bleiben, bis sie über die jeweilige Funktion oder an ihrem Speicherort entfernt werden. Das Deaktivieren eines Plugins, eine Reparatur oder die Deinstallation des Clients löscht nicht zwangsläufig Einstellungen, gespeicherte Logs, Exporte oder Sicherungen. Ein Limit für den Arbeitsspeicher-Cache löscht keine Einträge in einer Plugin-Datenbank.

Cloud-Daten müssen beim verbundenen Dienst entfernt werden. Eine lokale Deinstallation löscht nicht automatisch Daten bei der Website, GitHub, Discord oder anderen Anbietern. Öffentliche Kopien und bereits heruntergeladene Uploads können bei ihren Empfängern verbleiben.

## Fragen und Betroffenenrechte

Für Datenschutzfragen oder Anfragen zu von Moggcord betriebenen Diensten erreichst du das Projekt unter [owner@moggcord.cc](mailto:owner@moggcord.cc). Je nach Verarbeitung und anwendbarem Recht können insbesondere Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Widerruf einer Einwilligung für die Zukunft und eine Beschwerde bei einer Aufsichtsbehörde in Betracht kommen. Siehe die [DSGVO](https://eur-lex.europa.eu/eli/reg/2016/679/oj).

Sende dabei keine Passwörter, Konto-Tokens oder vollständigen privaten Datenbanken. Anfragen zu einem anderen Anbieter sind an diesen Anbieter zu richten.

## Technische Grundlagen

[Client-Einstellungen und Cloud-Standardwerte](../../src/api/Settings.ts) · [Cloud-Synchronisierung](../../src/api/SettingsSync/cloudSync.ts) · [Exportfilter](../../src/api/SettingsSync/offline.ts) · [Updater](../../src/main/updater/http.ts) · [Lokaler Connector](../../scripts/community/bridge.mjs)
