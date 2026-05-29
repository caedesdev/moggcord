import { ComponentType, ReactNode, Ref } from "react";
import { LiteralUnion } from "type-fest";

export type ModalActionVariant = LiteralUnion<"primary" | "secondary" | "critical-primary", string>;
export type ModalSize = LiteralUnion<"sm" | "md" | "lg" | "xl" | "xxl", string>;

export interface ModalAction {
    text: string;
    variant: ModalActionVariant;
    onClick(): void;
    loading?: boolean;
    disabled?: boolean;
}

export interface RenderModalProps {
    transitionState: number;
    onClose(): void;
}

export interface ModalProps extends RenderModalProps {
    size?: ModalSize;
    role?: "alertdialog" | "dialog";

    title: ReactNode;
    subtitle?: ReactNode;

    children?: ReactNode;
    input?: ReactNode;
    preview?: ReactNode;

    listProps?: any;
    onScroll?(): void;
    scrollerRef?: Ref<HTMLElement>;

    actions?: ModalAction[];
    actionBarInput?: ReactNode;
    actionBarInputLayout?: "default" | "chat-input";

    notice?: {
        message: string;
        type: LiteralUnion<"critical", string>;
    };
}

export interface ConfirmModalProps extends ModalProps {
    variant?: ModalActionVariant;
    confirmText: ModalAction["text"];
    cancelText?: ModalAction["text"];
    onConfirm?(setError: (error: string) => void): void;
    onCancel?(): void;
    onCloseCallback?(): void;
    checkboxProps?: {
        label?: string;
        checked: boolean;
        onChange(checked: boolean): void;
    };

    children?: ReactNode;
}

export type Modal = ComponentType<ModalProps>;
export type ConfirmModal = ComponentType<ConfirmModalProps>;

export type RenderModal = (props: RenderModalProps) => ReactNode;

export interface ModalOptions {
    modalKey?: string;
    onCloseRequest?(): void;
    onCloseCallback?(): void;
}

export interface ModalAPI {
    openModalLazy: (renderModal: () => Promise<RenderModal>, options?: ModalOptions & { contextKey?: string; }) => Promise<string>;
    openModal: (renderModal: RenderModal, options?: ModalOptions, contextKey?: string) => string;
    closeModal: (modalKey: string, contextKey?: string) => void;
    closeAllModals: () => void;
}

export interface MediaModalItem {
    url: string;
    type: "IMAGE" | "VIDEO" | "CLIP";
    original?: string;
    alt?: string;
    width?: number;
    height?: number;
    animated?: boolean;
    maxWidth?: number;
    maxHeight?: number;
}

export interface MediaModalProps {
    location?: string;
    contextKey?: string;
    onCloseCallback?: () => void;
    className?: string;
    items: MediaModalItem[];
    startingIndex?: number;
    onIndexChange?: (...args: any[]) => void;
    fit?: string;
    shouldRedactExplicitContent?: boolean;
    shouldHideMediaOptions?: boolean;
}
