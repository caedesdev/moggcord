import definePlugin from "@utils/types";

import style from "./style.css?managed";

export default definePlugin({
    name: "CleanHomeSidebar",
    description: "Removes Library, Nitro Home, and Quests from the home sidebar.",
    tags: ["Appearance", "Home"],
    authors: [{ name: "Moggcord", id: 0n }],
    enabledByDefault: true,
    managedStyle: style,
    patches: [
        {
            find: 'tutorialId:"direct-messages"',
            replacement: [
                {
                    match: /"nitro-tab-group"\)/,
                    replace: "$&&&undefined"
                },
                {
                    match: /NAVIGATION_LINK\}\}\},"discord-shop"\)/,
                    replace: "$&&&undefined"
                },
                {
                    match: /\.QUEST_HOME\},"quests"\)/,
                    replace: "$&&&undefined"
                },
            ],
        },
        {
            find: ".hasLibraryApplication()&&!",
            replacement: [
                {
                    match: /\i\.\i\.APPLICATION_STORE,/,
                    replace: "/*$&*/"
                },
                {
                    match: /\i\.\i\.COLLECTIBLES_SHOP,/,
                    replace: "/*$&*/"
                },
            ],
        },
    ],
});
