export const propsToString = (properties: Record<string, string>): string => {
  return (
    Object.entries(properties)
      .map(([key, value]) => `${key}:: ${value}`)
      .join("\n") + "\n"
  );
};
