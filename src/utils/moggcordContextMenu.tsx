import { Menu, React } from "@webpack/common";

export function addCategorizedUserContextItem(children: any[], category: string, item: any) {
    if (!children) return;

    let moggcordGroup = children.find((c: any) => c?.props?.id === "moggcord-user-context-group");
    
    if (!moggcordGroup) {
        const rootItem = <Menu.MenuItem id="moggcord-user-root" label="Moggcord Utilities">{[]}</Menu.MenuItem>;
        moggcordGroup = <Menu.MenuGroup id="moggcord-user-context-group">{rootItem}</Menu.MenuGroup>;
        children.push(moggcordGroup);
    }
    
    const rootMenuItem = moggcordGroup.props.children;
    const catId = `mc-category-${category.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    
    let categoryItem = rootMenuItem.props.children.find((c: any) => c?.props?.id === catId);
    
    if (!categoryItem) {
        categoryItem = <Menu.MenuItem id={catId} label={category}>{[]}</Menu.MenuItem>;
        rootMenuItem.props.children.push(categoryItem);
    }
    
    categoryItem.props.children.push(item);
}
