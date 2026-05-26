import { useState } from "@webpack/common";

interface ExpandableSectionProps {
    children: React.ReactNode;
    renderContent: () => React.ReactNode;
    defaultExpanded?: boolean;
    [key: string]: any;
}

export function ExpandableSection({ children, renderContent, defaultExpanded = false, ...props }: ExpandableSectionProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <div {...props}>
            <div
                onClick={() => setExpanded((v: boolean) => !v)}
                style={{ cursor: "pointer", userSelect: "none" }}
            >
                {children}
            </div>
            {expanded && renderContent()}
        </div>
    );
}

export default ExpandableSection;
