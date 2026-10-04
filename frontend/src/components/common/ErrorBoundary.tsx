import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
	children: ReactNode;
	fallbackTitle?: string;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	public override state: State = {
		hasError: false,
		error: null,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
	}

	private handleReset = () => {
		this.setState({ hasError: false, error: null });
		window.location.reload();
	};

	public override render() {
		if (this.state.hasError) {
			return (
				<div className="min-h-[50vh] flex items-center justify-center p-6">
					<div className="max-w-md w-full p-6 bg-white dark:bg-zinc-900 border border-red-500/20 rounded-2xl shadow-xl text-center space-y-4">
						<div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
							<AlertTriangle size={24} />
						</div>
						<div className="space-y-1">
							<h3 className="text-base font-bold text-gray-900 dark:text-white">
								{this.props.fallbackTitle || "Đã xảy ra lỗi không mong muốn"}
							</h3>
							<p className="text-xs text-zinc-500 dark:text-zinc-400">
								{this.state.error?.message || "Không thể tải giao diện trang."}
							</p>
						</div>
						<div className="pt-2">
							<Button
								onClick={this.handleReset}
								className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-semibold"
							>
								<RefreshCw size={14} className="mr-2" />
								<span>Tải lại trang</span>
							</Button>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

export default ErrorBoundary;
