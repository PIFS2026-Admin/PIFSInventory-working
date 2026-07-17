export function shouldShowPageMessage(message: string | null | undefined) {
  const text = message?.trim() ?? "";
  return Boolean(text) && !/^loading\b/i.test(text);
}
