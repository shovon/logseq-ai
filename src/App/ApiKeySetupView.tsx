import { useState } from "react";

interface ApiKeySetupViewProps {
  onApiKeySaved: () => void;
}

export function ApiKeySetupView({ onApiKeySaved }: ApiKeySetupViewProps) {
  const [apiKey, setApiKey] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSave = async () => {
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      setError("API key cannot be empty");
      logseq.UI.showMsg("API key cannot be empty", "error");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await logseq.updateSettings({
        openAiApiKey: trimmedKey,
      });

      // Re-check settings to ensure it was saved
      const savedKey = logseq.settings?.openAiApiKey;
      if (typeof savedKey === "string" && savedKey.trim() === trimmedKey) {
        logseq.UI.showMsg("API key saved successfully", "success");
        onApiKeySaved();
      } else {
        throw new Error("Failed to verify API key was saved");
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to save API key";
      setError(errorMessage);
      logseq.UI.showMsg(errorMessage, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  const isButtonDisabled = !apiKey.trim() || isSaving;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-md mx-auto">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 dark:text-logseq-cyan-low-saturation-400">
            OpenAI API Key Required
          </h2>
          <p className="text-gray-600 dark:text-logseq-cyan-low-saturation-300 mb-6">
            To use this plugin, you need to provide your OpenAI API key. You can
            get an API key from{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              OpenAI's website
            </a>
            .
          </p>

          <div className="mb-4">
            <label
              htmlFor="api-key-input"
              className="block text-sm font-medium text-gray-700 dark:text-logseq-cyan-low-saturation-400 mb-2"
            >
              OpenAI API Key
            </label>
            <input
              id="api-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError("");
              }}
              onKeyPress={handleKeyPress}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSaving}
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <button
            onClick={handleSave}
            disabled={isButtonDisabled}
            className="w-full px-4 py-2 text-white rounded-lg text-sm font-medium disabled:cursor-not-allowed transition-colors"
            style={{
              backgroundColor: isButtonDisabled ? "#9ca3af" : "#1e3a8a",
              opacity: isButtonDisabled ? 0.5 : 1,
            }}
          >
            {isSaving ? "Saving..." : "Save API Key"}
          </button>

          <p className="mt-4 text-xs text-gray-500">
            Your API key is stored locally in Logseq settings and is never
            shared with third parties.
          </p>
        </div>
      </div>
    </div>
  );
}
