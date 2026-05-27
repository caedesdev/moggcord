import definePlugin from "@utils/types";

export default definePlugin({
    name: "MoggcordUpdater",
    enabledByDefault: false,
    description: "Disables the legacy update banner. Use Settings > Updater to install updates.",
    authors: [{ name: "Moggcord", id: 0n }],
});
