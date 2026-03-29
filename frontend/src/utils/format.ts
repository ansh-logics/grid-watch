export function shortId(value: string, head = 4, tail = 4) {
  if (!value || value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
