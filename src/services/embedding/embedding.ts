export type EmbeddingType = "vector[1536]";
export const EmbeddingType: EmbeddingType = "vector[1536]";

/**
 * Props for the `generateEmbedding` function.
 */
type GenerateEmbeddingsProps = {
  /**
   * The input string to derive the embedding for..
   */
  inputText: string;

  /**
   * The OpenAI API key for actually using the OpenAI embedding services.
   */
  apiKey: string;

  /**
   * A signal to end fetch requests early.
   */
  signal?: AbortSignal;
};

export class HTTPError extends Error {
  private inputResponse: Response;
  constructor(response: Response) {
    super("HTTP Error");
    this.inputResponse = response;
  }

  get response() {
    return this.inputResponse;
  }
}

/**
 * Generates the embedding for the inputed text.
 * @param options Contains the inputText and apiKey.
 * @returns An array of numbers that represents the vector.
 */
export async function generateEmbedding({
  inputText,
  apiKey,
  signal,
}: GenerateEmbeddingsProps): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: inputText,
    }),
  });

  if (res.status >= 400) {
    throw new HTTPError(res);
  }

  const json = await res.json();

  if (json.error) {
    // TODO: get rid of this console log.
    console.error("Embedding API error:", json.error);
    throw new Error(json.error?.message || "Failed to generate embedding.");
  }

  return json.data[0].embedding;
}
