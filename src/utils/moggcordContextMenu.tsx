import { Menu, React } from "@webpack/common";

export function addCategorizedUserContextItem(children: any[], category: string, item: any) {
    if (!children || !Array.isArray(children)) return;

    let moggcordGroup = children.find((c: any) => c?.props?.id === "moggcord-user-context-group");

    if (!moggcordGroup) {
        const rootItem = <Menu.MenuItem id="moggcord-user-root" label="Moggcord Tools">{[]}</Menu.MenuItem>;
        moggcordGroup = <Menu.MenuGroup id="moggcord-user-context-group">{rootItem}</Menu.MenuGroup>;
        children.push(moggcordGroup);
    }

    const rootMenuItem = React.Children.only(moggcordGroup.props.children) as any;
    if (!Array.isArray(rootMenuItem.props.children)) {
        rootMenuItem.props.children = rootMenuItem.props.children ? [rootMenuItem.props.children] : [];
    }

    const catId = `mc-category-${category.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

    let categoryItem = rootMenuItem.props.children.find((c: any) => c?.props?.id === catId);

    if (!categoryItem) {
        categoryItem = <Menu.MenuItem id={catId} label={category}>{[]}</Menu.MenuItem>;
        rootMenuItem.props.children.push(categoryItem);
    }

    if (!Array.isArray(categoryItem.props.children)) {
        categoryItem.props.children = categoryItem.props.children ? [categoryItem.props.children] : [];
    }

    categoryItem.props.children.push(item);
}
