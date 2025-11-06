import { useCurrentPageState } from "../useCurrentPageState";

type CurrentPageState =
  | { type: "LOADING" }
  | { type: "LOADED"; name: string };

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  currentPageState?: CurrentPageState;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  currentPageState,
}: ChatInputProps) {
  const hookPageState = useCurrentPageState();
  const pageState = currentPageState ?? hookPageState;
  const isButtonDisabled = !value.trim() || disabled;

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-4 pt-0">
      <div className="mt-auto rounded-xl bg-gray-100">
        <div className="px-2 py-2 text-xs text-gray-600">
          {pageState.type === "LOADED" ? (
            <>
              <span className="text-gray-400">[[</span>
              {pageState.name}
              <span className="text-gray-400">]]</span>
            </>
          ) : null}
        </div>
        <div className="bg-white border-2 border-gray-200 rounded-xl">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message here..."
            className="w-full rounded-xl flex-1 resize-none border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none block p-2"
            rows={2}
            disabled={disabled}
            style={{ outline: "none", boxShadow: "none" }}
          />
          <div className="flex p-2">
            <div className="flex-1"></div>
            <button
              onClick={onSend}
              disabled={isButtonDisabled}
              className="block px-3 py-1.5 text-white rounded-lg text-sm font-bold disabled:cursor-not-allowed"
              style={{
                backgroundColor: isButtonDisabled ? "grey" : "#1e3a8a",
                opacity: isButtonDisabled ? 0.5 : 1,
              }}
            >
              {disabled ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

