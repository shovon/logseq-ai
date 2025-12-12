export const propsToString = (properties: Record<string, string>): string => {
  return (
    Object.entries(properties)
      .map(([key, value]) => `${key}:: ${value}`)
      .join("\n") + "\n"
  );
};

// TODO: unit test this.s
export const createBlockContent = (
  properties: Record<string, string>,
  content: string
) => `${propsToString(properties)}\n${content}`;
