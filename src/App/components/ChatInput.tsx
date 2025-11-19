import { useRef, useEffect, useState } from "react";
import { IconArrowUp } from "@tabler/icons-react";
import type { PageType } from "../../services/querier";

interface ChatInputProps {
  onSend: (value: string) => void;
  disabled?: boolean;
  isRunning?: boolean;
  onCancel?: () => void;
  className?: string;
  searchPage: (query: string) => Promise<PageType[]>;
}

export function ChatInput({
  onSend,
  isRunning,
  onCancel,
  className,
  disabled = false,
  searchPage,
}: ChatInputProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const [bracketContent, setBracketContent] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<PageType[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const isCancelMode = !!isRunning && !!onCancel;
  const isButtonDisabled = isCancelMode
    ? false
    : !inputValue.trim() || disabled;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Helper function to find bracket positions and content at cursor position
  const getBracketPositions = (
    cursorPos: number,
    text: string
  ): { start: number; end: number; content: string } | null => {
    if (text.length < 4 || cursorPos < 0 || cursorPos > text.length) {
      return null;
    }

    // Find the innermost [[ ]] pair containing the cursor
    // Search backwards from cursor to find opening [[
    let openBracketStart = -1;
    let bracketDepth = 0;

    // Search backwards to find the opening [[
    for (let i = cursorPos - 1; i >= 1; i--) {
      if (text.substring(i - 1, i + 1) === "[[") {
        // Found opening bracket
        if (bracketDepth === 0) {
          openBracketStart = i - 1;
          break;
        } else {
          bracketDepth--;
        }
        i--; // Skip the second bracket
      } else if (text.substring(i - 1, i + 1) === "]]") {
        // Found closing bracket while searching backwards
        bracketDepth++;
        i--; // Skip the second bracket
      }
    }

    // Check if cursor is at the very start and text starts with [[
    if (
      openBracketStart === -1 &&
      cursorPos >= 0 &&
      cursorPos <= 2 &&
      text.substring(0, 2) === "[["
    ) {
      openBracketStart = 0;
      bracketDepth = 0;
    }

    if (openBracketStart === -1) {
      return null; // No opening bracket found
    }

    // Search forwards from cursor to find the matching closing ]]
    bracketDepth = 0;
    let closeBracketEnd = -1;

    for (let i = cursorPos; i < text.length - 1; i++) {
      if (text.substring(i, i + 2) === "[[") {
        // Found nested opening bracket
        bracketDepth++;
        i++; // Skip the second bracket
      } else if (text.substring(i, i + 2) === "]]") {
        // Found closing bracket
        if (bracketDepth === 0) {
          closeBracketEnd = i + 1;
          break;
        } else {
          bracketDepth--;
        }
        i++; // Skip the second bracket
      }
    }

    if (closeBracketEnd === -1) {
      return null; // No closing bracket found
    }

    // Extract content between brackets
    const contentStart = openBracketStart + 2;
    const contentEnd = closeBracketEnd - 2;

    // Check if cursor is actually inside the brackets (not on the brackets themselves)
    // Cursor should be between contentStart (inclusive) and contentEnd + 1 (inclusive)
    // This means cursor can be right after [[ or right before ]]
    if (cursorPos < contentStart || cursorPos > contentEnd + 1) {
      return null;
    }

    return {
      start: openBracketStart,
      end: closeBracketEnd,
      content: text.substring(contentStart, contentEnd + 1),
    };
  };

  // Helper function to find content between [[ ]] brackets at cursor position
  const getBracketContent = (
    cursorPos: number,
    text: string
  ): string | null => {
    const positions = getBracketPositions(cursorPos, text);
    return positions ? positions.content : null;
  };

  // Function to replace bracket content with selected page name
  const replaceBracketContent = (pageName: string) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const positions = getBracketPositions(cursorPos, inputValue);
    if (!positions) return;

    // Replace the entire bracket including [[ and ]]
    const newValue =
      inputValue.substring(0, positions.start) +
      `[[${pageName}]]` +
      inputValue.substring(positions.end + 1);

    setInputValue(newValue);
    setBracketContent(null);
    setSearchResults([]);
    setSelectedIndex(-1);

    // Set cursor position after the closing brackets
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = positions.start + pageName.length + 4; // [[ + pageName + ]]
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle arrow keys for navigation when popup is open
    if (bracketContent !== null && searchResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        return;
      } else if (e.key === "Enter" && !e.shiftKey && selectedIndex >= 0) {
        e.preventDefault();
        const selectedPage = searchResults[selectedIndex];
        const pageName = selectedPage.originalName ?? selectedPage.name ?? null;
        if (pageName) {
          replaceBracketContent(pageName);
        }
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setBracketContent(null);
        setSearchResults([]);
        setSelectedIndex(-1);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isCancelMode) {
        onCancel?.();
      } else if (!disabled) {
        onSend(inputValue);
        setInputValue("");
      }
    } else if (e.key === "[" && !e.shiftKey) {
      // Auto-close brackets
      e.preventDefault();
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          inputValue.substring(0, start) + "[]" + inputValue.substring(end);
        setInputValue(newValue);
        // Position cursor between the brackets
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(start + 1, start + 1);
          }
        }, 0);
      }
    } else if (e.key === "]" && !e.shiftKey) {
      // Skip over auto-inserted closing brackets
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (
          start === end &&
          textarea.value.substring(start, start + 1) === "]"
        ) {
          e.preventDefault();
          textarea.setSelectionRange(start + 1, start + 1);
        }
      }
    } else if (e.key === "Backspace") {
      // Delete closing bracket when deleting opening bracket from empty [] pair
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        // Only handle if there's a single cursor (no selection)
        if (start === end && start > 0) {
          const charBefore = inputValue.substring(start - 1, start);
          const charAfter = inputValue.substring(start, start + 1);

          // If we're deleting '[' and ']' is immediately after, delete both
          if (charBefore === "[" && charAfter === "]") {
            e.preventDefault();
            const newValue =
              inputValue.substring(0, start - 1) +
              inputValue.substring(start + 1);
            setInputValue(newValue);
            // Position cursor at the deletion point
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.setSelectionRange(start - 1, start - 1);
              }
            }, 0);
          }
        }
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

  // Scroll selected item into view when navigating with keyboard
  useEffect(() => {
    if (selectedIndex >= 0 && popupRef.current) {
      const selectedElement = popupRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex]);

  return (
    <div
      className={className}
      style={{ position: "relative" }}
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
      {bracketContent !== null && searchResults.length > 0 && (
        <div
          ref={popupRef}
          className="absolute bottom-full w-full bg-gray-100 border max-h-48 overflow-y-auto"
          style={{ marginBottom: 0 }}
        >
          {searchResults.map((page, index) => {
            const pageName = page.originalName ?? page.name ?? "";
            const isSelected = index === selectedIndex;
            return (
              <div
                key={page.uuid}
                className={`p-2 cursor-pointer ${
                  isSelected ? "bg-blue-200" : "hover:bg-gray-200"
                }`}
                onClick={() => {
                  if (pageName) {
                    replaceBracketContent(pageName);
                  }
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {pageName}
              </div>
            );
          })}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => {
          const newValue = e.target.value;
          setInputValue(newValue);

          // Check if cursor is inside [[ ]] brackets after the change
          setTimeout(() => {
            if (textareaRef.current) {
              const cursorPos = textareaRef.current.selectionStart;
              const content = getBracketContent(cursorPos, newValue);
              if (content !== null) {
                setBracketContent(content);
                setSelectedIndex(-1);
                searchPage(content)
                  .then((results) => {
                    setSearchResults(results);
                  })
                  .catch((error) => {
                    // Handle error
                    console.error("Error searching page refs:", error);
                    setSearchResults([]);
                  });
              } else {
                setBracketContent(null);
                setSearchResults([]);
                setSelectedIndex(-1);
              }
            }
          }, 0);
        }}
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
