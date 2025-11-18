import { useRef, useEffect, useState } from "react";
import { IconArrowUp } from "@tabler/icons-react";

interface ChatInputProps {
  onSend: (value: string) => void;
  disabled?: boolean;
  isRunning?: boolean;
  onCancel?: () => void;
  className?: string;
}

export function ChatInput({
  onSend,
  isRunning,
  onCancel,
  className,
  disabled = false,
}: ChatInputProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const isCancelMode = !!isRunning && !!onCancel;
  const isButtonDisabled = isCancelMode
    ? false
    : !inputValue.trim() || disabled;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isCancelMode) {
        onCancel?.();
      } else if (!disabled) {
        onSend(inputValue);
        setInputValue("");
      }
    }
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = "auto";
      // Set height to scrollHeight to fit content
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  return (
    <div
      className={className}
      onMouseDownCapture={(e) => {
        if (disabled) return;
        const target = e.target as HTMLElement;
        // Avoid hijacking clicks meant for the textarea itself or the send button
        const isClickInsideTextarea =
          textareaRef.current != null &&
          (target === textareaRef.current ||
            textareaRef.current.contains(target));
        const isClickOnButton = target.closest("button") != null;
        if (isClickInsideTextarea || isClickOnButton) return;

        // Prevent default so focus isn't stolen by the clicked element
        e.preventDefault();
        if (textareaRef.current) {
          textareaRef.current.focus();
          try {
            // Place caret at the end
            const end = inputValue.length;
            textareaRef.current.setSelectionRange(end, end);
          } catch {
            // Ignore if not supported
          }
        }
      }}
    >
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyPress}
        placeholder="Type your message here..."
        className="w-full rounded-xl flex-1 resize-none border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none block pt-4 px-6"
        rows={1}
        disabled={disabled}
        style={{
          outline: "none",
          boxShadow: "none",
          minHeight: "2.5rem",
          maxHeight: "12rem",
          overflowY: "auto",
        }}
      />
      <div className="flex p-2">
        <div className="flex-1"></div>
        <button
          onClick={() => {
            if (isCancelMode) {
              onCancel?.();
            } else if (!disabled) {
              onSend(inputValue);
              setInputValue("");
            }
          }}
          disabled={isButtonDisabled}
          className="block px-3 py-1.5 text-gray-700 rounded-lg text-sm font-bold cursor-pointer"
          style={{
            opacity: isButtonDisabled ? 0 : 1,
          }}
        >
          {isCancelMode ? (
            "Stop"
          ) : disabled ? (
            "..."
          ) : (
            <div className="flex">
              <div className="mr-1">Send</div>{" "}
              <div className="mt-0.5">
                <IconArrowUp size={16} />
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
