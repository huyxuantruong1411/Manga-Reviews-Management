import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Info,
	Sparkles,
	Trash2,
} from "lucide-react";
import type React from "react";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

export type ConfirmVariant = "destructive" | "warning" | "primary" | "info";

export interface ConfirmModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	description: React.ReactNode;
	confirmText?: string;
	cancelText?: string;
	variant?: ConfirmVariant;
	iconType?: "trash" | "warning" | "sparkles" | "info";
	loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
	isOpen,
	onClose,
	onConfirm,
	title,
	description,
	confirmText = "Xác nhận",
	cancelText = "Hủy bỏ",
	variant = "primary",
	iconType,
	loading = false,
}) => {
	// Auto choose icon if not provided
	const effectiveIcon =
		iconType ||
		(variant === "destructive"
			? "trash"
			: variant === "warning"
				? "warning"
				: variant === "primary"
					? "sparkles"
					: "info");

	const renderIcon = () => {
		switch (effectiveIcon) {
			case "trash":
				return (
					<div className="w-12 h-12 rounded-2xl bg-destructive/15 text-destructive border border-destructive/25 flex items-center justify-center shrink-0 shadow-inner">
						<Trash2 size={24} />
					</div>
				);
			case "warning":
				return (
					<div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 border border-amber-500/25 flex items-center justify-center shrink-0 shadow-inner">
						<AlertTriangle size={24} />
					</div>
				);
			case "sparkles":
				return (
					<div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary border border-primary/25 flex items-center justify-center shrink-0 shadow-inner">
						<Sparkles size={24} />
					</div>
				);
			case "info":
			default:
				return (
					<div className="w-12 h-12 rounded-2xl bg-sky-500/15 text-sky-500 border border-sky-500/25 flex items-center justify-center shrink-0 shadow-inner">
						<Info size={24} />
					</div>
				);
		}
	};

	const renderConfirmButton = () => {
		if (variant === "destructive") {
			return (
				<Button
					type="button"
					variant="destructive"
					disabled={loading}
					onClick={() => {
						onConfirm();
					}}
					className="font-bold shadow-xs"
				>
					{loading ? "Đang xử lý..." : confirmText}
				</Button>
			);
		}

		if (variant === "warning") {
			return (
				<Button
					type="button"
					disabled={loading}
					onClick={() => {
						onConfirm();
					}}
					className="bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-xs"
				>
					{loading ? "Đang xử lý..." : confirmText}
				</Button>
			);
		}

		return (
			<Button
				type="button"
				variant="default"
				disabled={loading}
				onClick={() => {
					onConfirm();
				}}
				className="font-bold shadow-xs"
			>
				{loading ? "Đang xử lý..." : confirmText}
			</Button>
		);
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-md p-6">
				<div className="flex items-start gap-4">
					{renderIcon()}
					<div className="space-y-1.5 flex-1 min-w-0">
						<DialogHeader className="text-left space-y-1 p-0">
							<DialogTitle className="text-base md:text-lg font-bold text-foreground">
								{title}
							</DialogTitle>
							<DialogDescription className="text-xs md:text-sm text-muted-foreground leading-relaxed">
								{description}
							</DialogDescription>
						</DialogHeader>
					</div>
				</div>

				<DialogFooter className="flex flex-row items-center justify-end gap-2.5 pt-4 mt-2 border-t border-border">
					<Button
						type="button"
						variant="outline"
						disabled={loading}
						onClick={onClose}
					>
						{cancelText}
					</Button>
					{renderConfirmButton()}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export interface NoticeModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	description: React.ReactNode;
	type?: "error" | "warning" | "info" | "success";
	actionText?: string;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({
	isOpen,
	onClose,
	title,
	description,
	type = "info",
	actionText = "Đã hiểu",
}) => {
	const renderIcon = () => {
		switch (type) {
			case "error":
				return (
					<div className="w-12 h-12 rounded-2xl bg-destructive/15 text-destructive border border-destructive/25 flex items-center justify-center shrink-0 shadow-inner">
						<AlertCircle size={24} />
					</div>
				);
			case "warning":
				return (
					<div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 border border-amber-500/25 flex items-center justify-center shrink-0 shadow-inner">
						<AlertTriangle size={24} />
					</div>
				);
			case "success":
				return (
					<div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 flex items-center justify-center shrink-0 shadow-inner">
						<CheckCircle2 size={24} />
					</div>
				);
			case "info":
			default:
				return (
					<div className="w-12 h-12 rounded-2xl bg-sky-500/15 text-sky-500 border border-sky-500/25 flex items-center justify-center shrink-0 shadow-inner">
						<Info size={24} />
					</div>
				);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-md p-6">
				<div className="flex items-start gap-4">
					{renderIcon()}
					<div className="space-y-1.5 flex-1 min-w-0">
						<DialogHeader className="text-left space-y-1 p-0">
							<DialogTitle className="text-base md:text-lg font-bold text-foreground">
								{title}
							</DialogTitle>
							<DialogDescription className="text-xs md:text-sm text-muted-foreground leading-relaxed">
								{description}
							</DialogDescription>
						</DialogHeader>
					</div>
				</div>

				<DialogFooter className="pt-4 mt-2 border-t border-border flex justify-end">
					<Button type="button" onClick={onClose} className="font-bold">
						{actionText}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
